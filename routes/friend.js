const express = require('express');
const db = require('../db');
const auth = require('./authMiddleware');
const { paginateQuery } = require('../utils/dbHelpers');
const { triggerDebouncedBackup } = require('../utils/autoBackup');
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
router.post('/', auth, (req, res) => {
  const { title, url, logo } = req.body;
  db.run('INSERT INTO friends (title, url, logo) VALUES (?, ?, ?)', [title, url, logo], function(err) {
    if (err) return res.status(500).json({error: err.message});
    triggerDebouncedBackup();
    res.json({ id: this.lastID });
  });
});
// 修改友链
router.put('/:id', auth, (req, res) => {
  const { title, url, logo } = req.body;
  db.run('UPDATE friends SET title=?, url=?, logo=? WHERE id=?', [title, url, logo, req.params.id], function(err) {
    if (err) return res.status(500).json({error: err.message});
    triggerDebouncedBackup();
    res.json({ changed: this.changes });
  });
});
// 删除友链
router.delete('/:id', auth, (req, res) => {
  db.run('DELETE FROM friends WHERE id=?', [req.params.id], function(err) {
    if (err) return res.status(500).json({error: err.message});
    triggerDebouncedBackup();
    res.json({ deleted: this.changes });
  });
});

module.exports = router; 