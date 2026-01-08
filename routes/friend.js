const express = require('express');
const db = require('../db');
const auth = require('./authMiddleware');
const { paginateQuery } = require('../utils/dbHelpers');
const router = express.Router();

// 获取友链
router.get('/', async (req, res) => {
  try {
    const { page, pageSize } = req.query;
    const result = await paginateQuery('friends', { page, pageSize });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新增友链
router.post('/', auth, async (req, res) => {
  const { title, url, logo } = req.body;
  try {
    const result = await db.run('INSERT INTO friends (title, url, logo) VALUES (?, ?, ?)', [title, url, logo]);
    res.json({ id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 修改友链
router.put('/:id', auth, async (req, res) => {
  const { title, url, logo } = req.body;
  try {
    const result = await db.run('UPDATE friends SET title=?, url=?, logo=? WHERE id=?', [title, url, logo, req.params.id]);
    res.json({ changed: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除友链
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await db.run('DELETE FROM friends WHERE id=?', [req.params.id]);
    res.json({ deleted: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
