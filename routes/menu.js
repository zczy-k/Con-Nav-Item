const express = require('express');
const db = require('../db');
const auth = require('./authMiddleware');
const { triggerDebouncedBackup } = require('../utils/autoBackup');
const { paginateQuery } = require('../utils/dbHelpers');
const router = express.Router();

// 获取所有菜单（包含子菜单）
router.get('/', async (req, res) => {
  const { page, pageSize } = req.query;
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  try {
    if (!page && !pageSize) {
      const menus = await db.all('SELECT * FROM menus ORDER BY "order"');
      if (!menus || menus.length === 0) return res.json([]);
      
      const allSubMenus = await db.all('SELECT * FROM sub_menus ORDER BY "order"');
      const subMenusByParent = {};
      allSubMenus.forEach(sub => {
        if (!subMenusByParent[sub.parent_id]) subMenusByParent[sub.parent_id] = [];
        subMenusByParent[sub.parent_id].push(sub);
      });
      
      const result = menus.map(menu => ({
        ...menu,
        subMenus: subMenusByParent[menu.id] || []
      }));
      res.json(result);
    } else {
      const result = await paginateQuery('menus', { page, pageSize, orderBy: '"order"' });
      res.json(result);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取指定菜单的子菜单
router.get('/:id/submenus', async (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  try {
    const rows = await db.all('SELECT * FROM sub_menus WHERE parent_id = ? ORDER BY "order"', [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新增菜单
router.post('/', auth, async (req, res) => {
  const { name, order } = req.body;
  try {
    const result = await db.run('INSERT INTO menus (name, "order") VALUES (?, ?)', [name, order || 0]);
    triggerDebouncedBackup();
    res.json({ id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 修改菜单
router.put('/:id', auth, async (req, res) => {
  const { name, order } = req.body;
  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name=?'); params.push(name); }
  if (order !== undefined) { updates.push('"order"=?'); params.push(order); }
  if (updates.length === 0) return res.status(400).json({ error: '没有提供要更新的字段' });
  
  params.push(req.params.id);
  try {
    const result = await db.run(`UPDATE menus SET ${updates.join(', ')} WHERE id=?`, params);
    triggerDebouncedBackup();
    res.json({ changed: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除菜单
router.delete('/:id', auth, async (req, res) => {
  const menuId = req.params.id;
  try {
    const trans = db.transaction(() => {
      db.prepare('DELETE FROM card_tags WHERE card_id IN (SELECT id FROM cards WHERE menu_id = ?)').run(menuId);
      const cardInfo = db.prepare('DELETE FROM cards WHERE menu_id = ?').run(menuId);
      const subMenuInfo = db.prepare('DELETE FROM sub_menus WHERE parent_id = ?').run(menuId);
      const menuInfo = db.prepare('DELETE FROM menus WHERE id = ?').run(menuId);
      return {
        deleted: menuInfo.changes,
        deletedCards: cardInfo.changes,
        deletedSubMenus: subMenuInfo.changes
      };
    });
    const result = trans();
    triggerDebouncedBackup();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 子菜单相关API
router.post('/:id/submenus', auth, async (req, res) => {
  const { name, order } = req.body;
  try {
    const result = await db.run('INSERT INTO sub_menus (parent_id, name, "order") VALUES (?, ?, ?)', [req.params.id, name, order || 0]);
    triggerDebouncedBackup();
    res.json({ id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/submenus/:id', auth, async (req, res) => {
  const { name, order } = req.body;
  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name=?'); params.push(name); }
  if (order !== undefined) { updates.push('"order"=?'); params.push(order); }
  if (updates.length === 0) return res.status(400).json({ error: '没有提供要更新的字段' });
  
  params.push(req.params.id);
  try {
    const result = await db.run(`UPDATE sub_menus SET ${updates.join(', ')} WHERE id=?`, params);
    triggerDebouncedBackup();
    res.json({ changed: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/submenus/:id', auth, async (req, res) => {
  const subMenuId = req.params.id;
  try {
    const trans = db.transaction(() => {
      db.prepare('DELETE FROM card_tags WHERE card_id IN (SELECT id FROM cards WHERE sub_menu_id = ?)').run(subMenuId);
      const cardInfo = db.prepare('DELETE FROM cards WHERE sub_menu_id = ?').run(subMenuId);
      const subMenuInfo = db.prepare('DELETE FROM sub_menus WHERE id = ?').run(subMenuId);
      return {
        deleted: subMenuInfo.changes,
        deletedCards: cardInfo.changes
      };
    });
    const result = trans();
    triggerDebouncedBackup();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
