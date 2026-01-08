const express = require('express');
const db = require('../db');
const auth = require('./authMiddleware');
const { triggerDebouncedBackup } = require('../utils/autoBackup');
const { detectDuplicates, isDuplicateCard } = require('../utils/urlNormalizer');
const { autoGenerateForCards } = require('./ai');
const router = express.Router();

// 获取所有卡片（按分类分组）
router.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  try {
    const cards = await db.all('SELECT * FROM cards ORDER BY menu_id, sub_menu_id, "order"');
    if (cards.length === 0) {
      return res.json({ cards: [], cardsByCategory: {} });
    }

    const cardIds = cards.map(c => c.id);
    const tagRows = await db.all(
      `SELECT ct.card_id, t.id, t.name, t.color 
       FROM card_tags ct 
       JOIN tags t ON ct.tag_id = t.id 
       WHERE ct.card_id IN (${cardIds.map(() => '?').join(',')})
       ORDER BY t."order", t.name`,
      cardIds
    );

    const tagsByCard = {};
    tagRows.forEach(tag => {
      if (!tagsByCard[tag.card_id]) tagsByCard[tag.card_id] = [];
      tagsByCard[tag.card_id].push({ id: tag.id, name: tag.name, color: tag.color });
    });

    const cardsByCategory = {};
    cards.forEach(card => {
      const key = `${card.menu_id}_${card.sub_menu_id || 'null'}`;
      if (!cardsByCategory[key]) cardsByCategory[key] = [];
      cardsByCategory[key].push({ ...card, tags: tagsByCard[card.id] || [] });
    });

    res.json({ cardsByCategory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取指定菜单的卡片
router.get('/:menuId', async (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  const { subMenuId } = req.query;
  const query = subMenuId 
    ? 'SELECT * FROM cards WHERE sub_menu_id = ? ORDER BY "order"'
    : 'SELECT * FROM cards WHERE menu_id = ? AND sub_menu_id IS NULL ORDER BY "order"';
  const params = subMenuId ? [subMenuId] : [req.params.menuId];

  try {
    const cards = await db.all(query, params);
    if (cards.length === 0) return res.json([]);

    const cardIds = cards.map(c => c.id);
    const tagRows = await db.all(
      `SELECT ct.card_id, t.id, t.name, t.color 
       FROM card_tags ct 
       JOIN tags t ON ct.tag_id = t.id 
       WHERE ct.card_id IN (${cardIds.map(() => '?').join(',')})
       ORDER BY t."order", t.name`,
      cardIds
    );

    const tagsByCard = {};
    tagRows.forEach(tag => {
      if (!tagsByCard[tag.card_id]) tagsByCard[tag.card_id] = [];
      tagsByCard[tag.card_id].push({ id: tag.id, name: tag.name, color: tag.color });
    });

    res.json(cards.map(card => ({ ...card, tags: tagsByCard[card.id] || [] })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 批量更新卡片（用于拖拽排序和分类）
router.patch('/batch-update', auth, async (req, res) => {
  const { cards } = req.body;
  if (!Array.isArray(cards)) return res.status(400).json({ error: '无效的请求数据' });
  if (cards.length === 0) return res.json({ success: true, updated: 0 });

  try {
    const updateStmt = db.prepare('UPDATE cards SET "order"=?, menu_id=?, sub_menu_id=? WHERE id=?');
    const updateTrans = db.transaction((cards) => {
      for (const card of cards) {
        updateStmt.run(card.order, card.menu_id, card.sub_menu_id || null, card.id);
      }
    });
    updateTrans(cards);
    triggerDebouncedBackup();
    res.json({ success: true, updated: cards.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新增卡片
router.post('/', auth, async (req, res) => {
  const { menu_id, sub_menu_id, title, url, logo_url, desc, order, tagIds } = req.body;
  try {
    const existingCards = await db.all('SELECT title, url FROM cards');
    const duplicate = existingCards.find(card => isDuplicateCard({ title, url }, card));
    if (duplicate) {
      return res.status(409).json({ error: '卡片已存在', message: `该卡片与现有卡片“${duplicate.title}”重复` });
    }

    const trans = db.transaction(() => {
      const info = db.prepare('INSERT INTO cards (menu_id, sub_menu_id, title, url, logo_url, desc, "order") VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        menu_id, sub_menu_id || null, title, url, logo_url, desc, order || 0
      );
      const cardId = info.lastInsertRowid;
      if (tagIds && tagIds.length > 0) {
        const insertTag = db.prepare('INSERT INTO card_tags (card_id, tag_id) VALUES (?, ?)');
        for (const tagId of tagIds) insertTag.run(cardId, tagId);
      }
      return cardId;
    });

    const cardId = trans();
    triggerDebouncedBackup();
    setImmediate(() => autoGenerateForCards([cardId]));
    res.json({ id: cardId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新卡片
router.put('/:id', auth, async (req, res) => {
  const { menu_id, sub_menu_id, title, url, logo_url, desc, order, tagIds } = req.body;
  const { id } = req.params;
  try {
    const trans = db.transaction(() => {
      const info = db.prepare('UPDATE cards SET menu_id=?, sub_menu_id=?, title=?, url=?, logo_url=?, desc=?, "order"=? WHERE id=?').run(
        menu_id, sub_menu_id || null, title, url, logo_url, desc, order || 0, id
      );
      if (info.changes === 0) throw new Error('NOT_FOUND');
      db.prepare('DELETE FROM card_tags WHERE card_id=?').run(id);
      if (tagIds && tagIds.length > 0) {
        const insertTag = db.prepare('INSERT INTO card_tags (card_id, tag_id) VALUES (?, ?)');
        for (const tagId of tagIds) insertTag.run(id, tagId);
      }
    });

    trans();
    const card = await db.get('SELECT * FROM cards WHERE id=?', [id]);
    triggerDebouncedBackup();
    res.json({ success: true, card });
  } catch (err) {
    if (err.message === 'NOT_FOUND') return res.status(404).json({ error: '卡片不存在' });
    res.status(500).json({ error: err.message });
  }
});

// 删除卡片
router.delete('/:id', auth, async (req, res) => {
  const cardId = req.params.id;
  try {
    const trans = db.transaction(() => {
      db.prepare('DELETE FROM card_tags WHERE card_id=?').run(cardId);
      return db.prepare('DELETE FROM cards WHERE id=?').run(cardId).changes;
    });
    const deletedCount = trans();
    triggerDebouncedBackup();
    res.json({ success: true, deleted: deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 检测重复卡片
router.get('/detect-duplicates/all', auth, async (req, res) => {
  try {
    const cards = await db.all('SELECT * FROM cards ORDER BY id');
    const duplicateGroups = detectDuplicates(cards);
    res.json({
      total: cards.length,
      duplicateGroups: duplicateGroups,
      duplicateCount: duplicateGroups.reduce((sum, group) => sum + group.duplicates.length, 0)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 批量删除重复卡片
router.post('/remove-duplicates', auth, async (req, res) => {
  const { cardIds } = req.body;
  if (!Array.isArray(cardIds) || cardIds.length === 0) return res.status(400).json({ error: '无效的请求数据' });

  try {
    const trans = db.transaction(() => {
      const deleteTags = db.prepare(`DELETE FROM card_tags WHERE card_id IN (${cardIds.map(() => '?').join(',')})`);
      const deleteCards = db.prepare(`DELETE FROM cards WHERE id IN (${cardIds.map(() => '?').join(',')})`);
      deleteTags.run(cardIds);
      return deleteCards.run(cardIds).changes;
    });
    const deletedCount = trans();
    triggerDebouncedBackup();
    res.json({ success: true, deleted: deletedCount, message: `成功删除 ${deletedCount} 张卡片` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
