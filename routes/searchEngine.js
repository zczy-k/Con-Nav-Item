const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('./authMiddleware');
const axios = require('axios');
const cheerio = require('cheerio');

// 从URL解析搜索引擎信息
router.post('/parse', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL不能为空' });

  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
    });

    const $ = cheerio.load(response.data);
    let name = $('title').text().trim() || new URL(url).hostname;
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

    if (!searchUrl) searchUrl = `${url}${url.includes('?') ? '&' : '?'}q={searchTerms}`;

    res.json({ name, searchUrl, keyword: name.toLowerCase().replace(/\s+/g, '') });
  } catch (error) {
    res.status(500).json({ error: '解析失败', message: error.message });
  }
});

// 获取所有自定义搜索引擎
router.get('/', async (req, res) => {
  try {
    const engines = await db.all('SELECT * FROM custom_search_engines ORDER BY "order", id');
    res.json(engines || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 添加自定义搜索引擎
router.post('/', authMiddleware, async (req, res) => {
  const { name, search_url, keyword, order } = req.body;
  if (!name || !search_url) return res.status(400).json({ error: '名称和搜索URL不能为空' });

  try {
    const result = await db.run('INSERT INTO custom_search_engines (name, search_url, keyword, "order") VALUES (?, ?, ?, ?)', [name, search_url, keyword || '', order || 0]);
    res.json({ id: result.lastID, name, search_url, keyword: keyword || '', order: order || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新自定义搜索引擎
router.put('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, search_url, keyword, order } = req.body;
  if (!name || !search_url) return res.status(400).json({ error: '名称和搜索URL不能为空' });

  try {
    const result = await db.run('UPDATE custom_search_engines SET name = ?, search_url = ?, keyword = ?, "order" = ? WHERE id = ?', [name, search_url, keyword || '', order || 0, id]);
    if (result.changes === 0) return res.status(404).json({ error: '搜索引擎不存在' });
    res.json({ id: parseInt(id), name, search_url, keyword: keyword || '', order: order || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除自定义搜索引擎
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await db.run('DELETE FROM custom_search_engines WHERE id = ?', [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ error: '搜索引擎不存在' });
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 批量更新搜索引擎顺序
router.post('/reorder', authMiddleware, async (req, res) => {
  const { engines } = req.body;
  if (!Array.isArray(engines)) return res.status(400).json({ error: '参数格式错误' });

  try {
    const stmt = db.prepare('UPDATE custom_search_engines SET "order" = ? WHERE id = ?');
    const trans = db.transaction((engines) => {
      engines.forEach((engine, index) => stmt.run(index, engine.id));
    });
    trans(engines);
    res.json({ message: '排序更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
