const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('./authMiddleware');
const axios = require('axios');
const cheerio = require('cheerio');
const { triggerDebouncedBackup } = require('../utils/autoBackup');

// 从URL解析搜索引擎信息(不需要认证)
router.post('/parse', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL不能为空' });
  }

  try {
    // 获取网页内容
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    
    // 提取网站名称
    let name = $('title').text().trim();
    if (!name) {
      name = new URL(url).hostname;
    }


    // 尝试检测搜索URL模式
    let searchUrl = '';
    const searchInputs = $('input[type="search"], input[name*="search"], input[name="q"], input[name="query"]');
    if (searchInputs.length > 0) {
      const form = searchInputs.first().closest('form');
      if (form.length > 0) {
        const action = form.attr('action');
        const inputName = searchInputs.first().attr('name');
        
        if (action && inputName) {
          const actionUrl = new URL(action, url).href;
          searchUrl = `${actionUrl}${actionUrl.includes('?') ? '&' : '?'}${inputName}={searchTerms}`;
        }
      }
    }

    // 如果没有检测到搜索表单,使用默认模式
    if (!searchUrl) {
      searchUrl = `${url}${url.includes('?') ? '&' : '?'}q={searchTerms}`;
    }

    res.json({
      name,
      searchUrl,
      keyword: name.toLowerCase().replace(/\s+/g, '')
    });

  } catch (error) {
    res.status(500).json({ 
      error: '解析失败',
      message: error.message 
    });
  }
});

// 获取所有自定义搜索引擎
router.get('/', (req, res) => {
  db.all('SELECT * FROM custom_search_engines ORDER BY "order", id', (err, engines) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(engines || []);
  });
});

// 添加自定义搜索引擎
router.post('/', authMiddleware, (req, res) => {
  const { name, search_url, keyword, order } = req.body;

  if (!name || !search_url) {
    return res.status(400).json({ error: '名称和搜索URL不能为空' });
  }

  db.run(
    'INSERT INTO custom_search_engines (name, search_url, keyword, "order") VALUES (?, ?, ?, ?)',
    [name, search_url, keyword || '', order || 0],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      triggerDebouncedBackup();
      res.json({ 
        id: this.lastID,
        name,
        search_url,
        keyword: keyword || '',
        order: order || 0
      });
    }
  );
});

// 更新自定义搜索引擎
router.put('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { name, search_url, keyword, order } = req.body;

  if (!name || !search_url) {
    return res.status(400).json({ error: '名称和搜索URL不能为空' });
  }

  db.run(
    'UPDATE custom_search_engines SET name = ?, search_url = ?, keyword = ?, "order" = ? WHERE id = ?',
    [name, search_url, keyword || '', order || 0, id],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: '搜索引擎不存在' });
      }
      triggerDebouncedBackup();
      res.json({ 
        id: parseInt(id),
        name,
        search_url,
        keyword: keyword || '',
        order: order || 0
      });
    }
  );
});

// 删除自定义搜索引擎
router.delete('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM custom_search_engines WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: '搜索引擎不存在' });
    }
    triggerDebouncedBackup();
    res.json({ message: '删除成功' });
  });
});

// 批量更新搜索引擎顺序
router.post('/reorder', authMiddleware, (req, res) => {
  const { engines } = req.body;

  if (!Array.isArray(engines)) {
    return res.status(400).json({ error: '参数格式错误' });
  }

  const stmt = db.prepare('UPDATE custom_search_engines SET "order" = ? WHERE id = ?');
  
  engines.forEach((engine, index) => {
    stmt.run(index, engine.id);
  });

  stmt.finalize((err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    triggerDebouncedBackup();
    res.json({ message: '排序更新成功' });
  });
});

module.exports = router;
