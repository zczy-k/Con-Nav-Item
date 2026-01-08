const express = require('express');
const db = require('../db');
const auth = require('./authMiddleware');
const { triggerDebouncedBackup } = require('../utils/autoBackup');
const router = express.Router();

// 获取所有标签
router.get('/', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM tags ORDER BY "order", name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 创建标签
router.post('/', auth, async (req, res) => {
  const { name, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '标签名称不能为空' });
  
  const trimmedName = name.trim();
  const tagColor = color || '#2566d8';
  
  try {
    const result = await db.get('SELECT MAX("order") as maxOrder FROM tags');
    const nextOrder = (result && result.maxOrder !== null) ? result.maxOrder + 1 : 0;
    
    const info = await db.run('INSERT INTO tags (name, color, "order") VALUES (?, ?, ?)', [trimmedName, tagColor, nextOrder]);
    triggerDebouncedBackup();
    res.json({ id: info.lastID, name: trimmedName, color: tagColor, order: nextOrder });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: '标签名称已存在' });
    res.status(500).json({ error: err.message });
  }
});

// 更新标签
router.put('/:id', auth, async (req, res) => {
  const { name, color, order } = req.body;
  const { id } = req.params;
  if (!name || !name.trim()) return res.status(400).json({ error: '标签名称不能为空' });
  
  try {
    const info = await db.run('UPDATE tags SET name=?, color=?, "order"=? WHERE id=?', [name.trim(), color || '#2566d8', order || 0, id]);
    if (info.changes === 0) return res.status(404).json({ error: '标签不存在' });
    triggerDebouncedBackup();
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: '标签名称已存在' });
    res.status(500).json({ error: err.message });
  }
});

// 删除标签
router.delete('/:id', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const trans = db.transaction(() => {
      db.prepare('DELETE FROM card_tags WHERE tag_id=?').run(id);
      return db.prepare('DELETE FROM tags WHERE id=?').run(id).changes;
    });
    const changes = trans();
    if (changes === 0) return res.status(404).json({ error: '标签不存在' });
    triggerDebouncedBackup();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 批量更新标签顺序
router.patch('/batch-order', auth, async (req, res) => {
  const { tags } = req.body;
  if (!Array.isArray(tags) || tags.length === 0) return res.status(400).json({ error: '无效的请求数据' });
  
  try {
    const stmt = db.prepare('UPDATE tags SET "order"=? WHERE id=?');
    const trans = db.transaction((tags) => {
      for (const tag of tags) stmt.run(tag.order, tag.id);
    });
    trans(tags);
    triggerDebouncedBackup();
    res.json({ success: true, updated: tags.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取标签关联的卡片数量
router.get('/:id/cards/count', async (req, res) => {
  try {
    const result = await db.get('SELECT COUNT(*) as count FROM card_tags WHERE tag_id=?', [req.params.id]);
    res.json({ count: result.count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
