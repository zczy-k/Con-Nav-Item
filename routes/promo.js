const express = require('express');
const db = require('../db');
const auth = require('./authMiddleware');
const { paginateQuery } = require('../utils/dbHelpers');
const router = express.Router();

// 获取宣传列表
router.get('/', async (req, res) => {
  try {
    const { page, pageSize } = req.query;
    const result = await paginateQuery('promos', { page, pageSize });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新增宣传
router.post('/', auth, async (req, res) => {
  const { position, img, url } = req.body;
  try {
    const result = await db.run('INSERT INTO promos (position, img, url) VALUES (?, ?, ?)', [position, img, url]);
    res.json({ id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 修改宣传
router.put('/:id', auth, async (req, res) => {
  const { img, url } = req.body;
  try {
    const result = await db.run('UPDATE promos SET img=?, url=? WHERE id=?', [img, url, req.params.id]);
    res.json({ changed: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除宣传
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await db.run('DELETE FROM promos WHERE id=?', [req.params.id]);
    res.json({ deleted: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
