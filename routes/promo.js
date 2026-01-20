const express = require('express');
const db = require('../db');
const auth = require('./authMiddleware');
const { paginateQuery } = require('../utils/dbHelpers');
const { triggerDebouncedBackup } = require('../utils/autoBackup');
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
router.post('/', auth, (req, res) => {
  const { position, img, url } = req.body;
  db.run('INSERT INTO promos (position, img, url) VALUES (?, ?, ?)', [position, img, url], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    triggerDebouncedBackup();
    res.json({ id: this.lastID });
  });
});

// 修改宣传
router.put('/:id', auth, (req, res) => {
  const { img, url } = req.body;
  db.run('UPDATE promos SET img=?, url=? WHERE id=?', [img, url, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    triggerDebouncedBackup();
    res.json({ changed: this.changes });
  });
});

// 删除宣传
router.delete('/:id', auth, (req, res) => {
  db.run('DELETE FROM promos WHERE id=?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    triggerDebouncedBackup();
    res.json({ deleted: this.changes });
  });
});

module.exports = router;
