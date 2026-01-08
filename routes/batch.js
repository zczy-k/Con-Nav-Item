const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../db');
const auth = require('./authMiddleware');
const { isDuplicateCard } = require('../utils/urlNormalizer');
const { triggerDebouncedBackup } = require('../utils/autoBackup');
const { autoGenerateForCards } = require('./ai');
const router = express.Router();

// 批量解析网址信息
router.post('/parse', auth, async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls) || urls.length === 0) return res.status(400).json({ error: '请提供有效的网址列表' });

  const results = [];
  for (const url of urls) {
    try {
      const urlObj = new URL(url);
      const response = await axios.get(url, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        maxRedirects: 5,
        validateStatus: (status) => status < 500
      });

      const $ = cheerio.load(response.data);
      let title = $('title').text().trim() || $('meta[property="og:title"]').attr('content') || urlObj.hostname;
      let description = ($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '').trim().substring(0, 200);
      let logo = `https://api.xinac.net/icon/?url=${urlObj.origin}&sz=128`;

      results.push({ url, title, logo, description, success: true });
    } catch (error) {
      try {
        const urlObj = new URL(url);
        results.push({ url, title: urlObj.hostname, logo: `https://api.xinac.net/icon/?url=${urlObj.origin}&sz=128`, description: '', success: false, error: error.message });
      } catch (e) {
        results.push({ url, title: url, logo: '', description: '', success: false, error: '无效的URL' });
      }
    }
  }
  res.json({ data: results });
});

// 批量检测URL有效性
router.post('/check-urls', auth, async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls) || urls.length === 0) return res.status(400).json({ error: '请提供有效的网址列表' });

  const urlsToCheck = urls.slice(0, 100);
  const existingCards = await db.all('SELECT title, url FROM cards');

  const results = { valid: [], invalid: [], timeout: [], duplicate: [] };
  const checkUrl = async (urlInfo) => {
    const { url } = urlInfo;
    const isDuplicate = existingCards.some(card => {
      try {
        const existingHost = new URL(card.url).hostname.replace('www.', '');
        const newHost = new URL(url).hostname.replace('www.', '');
        return existingHost === newHost && new URL(card.url).pathname === new URL(url).pathname;
      } catch { return card.url === url; }
    });

    if (isDuplicate) return { ...urlInfo, status: 'duplicate' };

    try {
      const response = await axios.head(url, { timeout: 8000, maxRedirects: 3, validateStatus: (status) => status < 400, headers: { 'User-Agent': 'Mozilla/5.0' } });
      return { ...urlInfo, status: 'valid', httpStatus: response.status };
    } catch (error) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return { ...urlInfo, status: 'timeout', error: '连接超时' };
      if (error.response) return { ...urlInfo, status: 'invalid', httpStatus: error.response.status, error: `HTTP ${error.response.status}` };
      return { ...urlInfo, status: 'invalid', error: error.message };
    }
  };

  const batchSize = 10;
  for (let i = 0; i < urlsToCheck.length; i += batchSize) {
    const batchResults = await Promise.all(urlsToCheck.slice(i, i + batchSize).map(checkUrl));
    batchResults.forEach(result => results[result.status].push(result));
  }

  res.json({
    total: urlsToCheck.length,
    ...results,
    summary: { valid: results.valid.length, invalid: results.invalid.length, timeout: results.timeout.length, duplicate: results.duplicate.length }
  });
});

// 批量添加卡片
router.post('/add', auth, async (req, res) => {
  const { menu_id, sub_menu_id, cards } = req.body;
  if (!menu_id || !cards || !Array.isArray(cards) || cards.length === 0) return res.status(400).json({ error: '请提供有效的菜单ID和卡片列表' });

  try {
    const existingCards = await db.all('SELECT title, url FROM cards');
    const uniqueCards = [];
    const skippedCards = [];
    
    cards.forEach(card => {
      const duplicateExisting = existingCards.find(existing => isDuplicateCard({ title: card.title, url: card.url }, existing));
      if (duplicateExisting) {
        skippedCards.push({ title: card.title, url: card.url, reason: '与现有卡片重复', duplicateOf: { id: duplicateExisting.id, title: duplicateExisting.title, url: duplicateExisting.url } });
      } else {
        const duplicateInBatch = uniqueCards.find(unique => isDuplicateCard({ title: card.title, url: card.url }, { title: unique.title, url: unique.url }));
        if (!duplicateInBatch) uniqueCards.push(card);
        else skippedCards.push({ title: card.title, url: card.url, reason: '在当前批次中重复', duplicateOf: { title: duplicateInBatch.title, url: duplicateInBatch.url } });
      }
    });

    if (uniqueCards.length === 0) return res.json({ success: true, added: 0, skipped: skippedCards.length, skippedCards, ids: [] });

    const row = await db.get(sub_menu_id ? 'SELECT MAX("order") as max_order FROM cards WHERE sub_menu_id = ?' : 'SELECT MAX("order") as max_order FROM cards WHERE menu_id = ? AND sub_menu_id IS NULL', [sub_menu_id || menu_id]);
    let nextOrder = (row && row.max_order !== null) ? row.max_order + 1 : 0;
    
    const insertedIds = [];
    const trans = db.transaction((cards) => {
      const insertCard = db.prepare('INSERT INTO cards (menu_id, sub_menu_id, title, url, logo_url, desc, "order") VALUES (?, ?, ?, ?, ?, ?, ?)');
      const insertTag = db.prepare('INSERT INTO card_tags (card_id, tag_id) VALUES (?, ?)');
      
      cards.forEach((card, index) => {
        const info = insertCard.run(menu_id, sub_menu_id || null, card.title, card.url, card.logo, card.description || '', nextOrder + index);
        const cardId = info.lastInsertRowid;
        insertedIds.push(cardId);
        if (card.tagIds && Array.isArray(card.tagIds)) {
          card.tagIds.forEach(tagId => insertTag.run(cardId, tagId));
        }
      });
    });

    trans(uniqueCards);
    triggerDebouncedBackup();
    if (insertedIds.length > 0) setImmediate(() => autoGenerateForCards(insertedIds));
    
    res.json({ success: true, added: insertedIds.length, skipped: skippedCards.length, skippedCards, ids: insertedIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
