const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../db');
const auth = require('./authMiddleware');
const { isDuplicateCard } = require('../utils/urlNormalizer');
const { triggerDebouncedBackup } = require('../utils/autoBackup');
const router = express.Router();

// 批量解析网址信息
router.post('/parse', auth, async (req, res) => {
  const { urls } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: '请提供有效的网址列表' });
  }

  const results = [];
  
  for (const url of urls) {
    try {
      // 验证URL格式
      const urlObj = new URL(url);
      
      // 抓取网页内容（设置超时和完整的User-Agent）
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 500 // 接受4xx响应
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // 提取标题
      let title = $('title').text().trim();
      if (!title) {
        title = $('meta[property="og:title"]').attr('content');
      }
      if (!title) {
        title = urlObj.hostname;
      }

      // 提取描述
      let description = $('meta[name="description"]').attr('content');
      if (!description) {
        description = $('meta[property="og:description"]').attr('content');
      }
      if (!description) {
        description = '';
      }
      description = description.trim().substring(0, 200);

      // 提取Logo - 使用Google Favicon服务避免CORS问题
      let logo = $('link[rel="icon"]').attr('href') || 
                 $('link[rel="shortcut icon"]').attr('href') ||
                 $('link[rel="apple-touch-icon"]').attr('href') ||
                 $('meta[property="og:image"]').attr('content');

      // 统一使用xinac.net CDN，确保国内外都能访问
      logo = `https://api.xinac.net/icon/?url=${urlObj.origin}&sz=128`;

      results.push({
        url: url,
        title: title,
        logo: logo,
        description: description,
        success: true
      });

    } catch (error) {
      console.error(`解析失败 ${url}:`, error.message);
      
      // 即使失败也返回基本信息
      try {
        const urlObj = new URL(url);
        results.push({
          url: url,
          title: urlObj.hostname,
          logo: `https://api.xinac.net/icon/?url=${urlObj.origin}&sz=128`,
          description: '',
          success: false,
          error: error.message
        });
      } catch (e) {
        results.push({
          url: url,
          title: url,
          logo: '',
          description: '',
          success: false,
          error: '无效的URL'
        });
      }
    }
  }

  res.json({ data: results });
});

// 批量检测URL有效性
router.post('/check-urls', auth, async (req, res) => {
  const { urls } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: '请提供有效的网址列表' });
  }

  // 限制单次检测数量
  const urlsToCheck = urls.slice(0, 100);

  // 获取现有卡片用于去重检测
  const existingCards = await new Promise((resolve, reject) => {
    db.all('SELECT id, title, url FROM cards', (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

  const results = {
    valid: [],
    invalid: [],
    timeout: [],
    duplicate: []
  };

  // 并发检测（限制并发数为10）
  const checkUrl = async (urlInfo) => {
    const { url, title, folder } = urlInfo;
    
    // 先检查是否重复
    const isDuplicate = existingCards.some(card => {
      try {
        const existingHost = new URL(card.url).hostname.replace('www.', '');
        const newHost = new URL(url).hostname.replace('www.', '');
        return existingHost === newHost && new URL(card.url).pathname === new URL(url).pathname;
      } catch {
        return card.url === url;
      }
    });

    if (isDuplicate) {
      return { ...urlInfo, status: 'duplicate' };
    }

    // 检测URL有效性
    try {
      const response = await axios.head(url, {
        timeout: 8000,
        maxRedirects: 3,
        validateStatus: (status) => status < 400,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      return { ...urlInfo, status: 'valid', httpStatus: response.status };
    } catch (error) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return { ...urlInfo, status: 'timeout', error: '连接超时' };
      }
      if (error.response) {
        return { ...urlInfo, status: 'invalid', httpStatus: error.response.status, error: `HTTP ${error.response.status}` };
      }
      return { ...urlInfo, status: 'invalid', error: error.message };
    }
  };

  // 分批并发执行
  const batchSize = 10;
  for (let i = 0; i < urlsToCheck.length; i += batchSize) {
    const batch = urlsToCheck.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(checkUrl));
    
    batchResults.forEach(result => {
      results[result.status].push(result);
    });
  }

  res.json({
    total: urlsToCheck.length,
    ...results,
    summary: {
      valid: results.valid.length,
      invalid: results.invalid.length,
      timeout: results.timeout.length,
      duplicate: results.duplicate.length
    }
  });
});

// 批量添加卡片
router.post('/add', auth, (req, res) => {
  const { menu_id, sub_menu_id, cards } = req.body;

  if (!menu_id || !cards || !Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: '请提供有效的菜单ID和卡片列表' });
  }

  // 先获取所有现有卡片，用于去重检测
  db.all('SELECT * FROM cards', [], (err, existingCards) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    // 过滤掉重复的卡片
    const uniqueCards = [];
    const skippedCards = [];
    
    cards.forEach(card => {
      // 检查与现有卡片重复
      const duplicateExisting = existingCards.find(existing => 
        isDuplicateCard({ title: card.title, url: card.url }, existing)
      );
      
      if (duplicateExisting) {
        skippedCards.push({
          title: card.title,
          url: card.url,
          logo: card.logo,
          description: card.description,
          reason: '与现有卡片重复',
          duplicateOf: {
            id: duplicateExisting.id,
            title: duplicateExisting.title,
            url: duplicateExisting.url
          }
        });
      } else {
        // 检查是否与当前批次中的其他卡片重复
        const duplicateInBatch = uniqueCards.find(unique => 
          isDuplicateCard({ title: card.title, url: card.url }, { title: unique.title, url: unique.url })
        );
        
        if (!duplicateInBatch) {
          uniqueCards.push(card);
        } else {
          skippedCards.push({
            title: card.title,
            url: card.url,
            logo: card.logo,
            description: card.description,
            reason: '在当前批次中重复',
            duplicateOf: {
              title: duplicateInBatch.title,
              url: duplicateInBatch.url
            }
          });
        }
      }
    });

    // 如果所有卡片都被跳过
    if (uniqueCards.length === 0) {
      return res.json({
        success: true,
        added: 0,
        skipped: skippedCards.length,
        skippedCards: skippedCards,
        ids: []
      });
    }

    // 获取当前最大的 order 值
    const orderQuery = sub_menu_id 
      ? 'SELECT MAX("order") as max_order FROM cards WHERE sub_menu_id = ?'
      : 'SELECT MAX("order") as max_order FROM cards WHERE menu_id = ? AND sub_menu_id IS NULL';
    
    const orderParams = sub_menu_id ? [sub_menu_id] : [menu_id];

    db.get(orderQuery, orderParams, (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      let nextOrder = (row && row.max_order !== null) ? row.max_order + 1 : 0;
      const insertedIds = [];
      let completed = 0;
      let hasError = false;

      // 逐个插入非重复卡片
      uniqueCards.forEach((card, index) => {
        const { title, url, logo, description, tagIds } = card;
        const order = nextOrder + index;

      db.run(
        'INSERT INTO cards (menu_id, sub_menu_id, title, url, logo_url, desc, "order") VALUES (?, ?, ?, ?, ?, ?, ?)',
        [menu_id, sub_menu_id || null, title, url, logo, description, order],
        function(err) {
          if (err && !hasError) {
            hasError = true;
            return res.status(500).json({ error: err.message });
          }
          
          if (!hasError) {
            const cardId = this.lastID;
            insertedIds.push(cardId);
            
            // 如果有标签，关联标签
            if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
              const values = tagIds.map(tagId => `(${cardId}, ${tagId})`).join(',');
              db.run(`INSERT INTO card_tags (card_id, tag_id) VALUES ${values}`, (tagErr) => {
                if (tagErr) {
                  console.error('标签关联失败:', tagErr);
                }
                completed++;
                if (completed === uniqueCards.length) {
                  res.json({ 
                    success: true, 
                    added: insertedIds.length,
                    skipped: skippedCards.length,
                    skippedCards: skippedCards,
                    ids: insertedIds 
                  });
                }
              });
            } else {
              completed++;
              if (completed === uniqueCards.length) {
                triggerDebouncedBackup(); // 触发自动备份
                res.json({ 
                  success: true, 
                  added: insertedIds.length,
                  skipped: skippedCards.length,
                  skippedCards: skippedCards,
                  ids: insertedIds 
                });
              }
            }
          }
        }
      );
      });
    });
  });
});

module.exports = router;
