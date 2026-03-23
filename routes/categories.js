const express = require('express');
const db = require('../db');
const auth = require('./authMiddleware');
const { triggerDebouncedBackup } = require('../utils/autoBackup');

const router = express.Router();

function dbRunAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGetAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAllAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function ensureParent(parentId) {
  if (parentId === null || parentId === undefined) {
    return { level: 0 };
  }

  const parent = await dbGetAsync('SELECT * FROM categories WHERE id = ?', [parentId]);
  if (!parent) {
    const error = new Error('父分类不存在');
    error.statusCode = 400;
    throw error;
  }

  if (Number(parent.level || 1) >= 3) {
    const error = new Error('当前仅支持最多三级分类');
    error.statusCode = 400;
    throw error;
  }

  return parent;
}

async function ensureAfterNode(afterId, parentId) {
  if (afterId === null || afterId === undefined) return null;

  const anchor = await dbGetAsync('SELECT * FROM categories WHERE id = ?', [afterId]);
  if (!anchor) {
    const error = new Error('参考分类不存在');
    error.statusCode = 400;
    throw error;
  }

  const sameParent = (anchor.parent_id || null) === (parentId || null);
  if (!sameParent) {
    const error = new Error('参考分类与目标父级不一致');
    error.statusCode = 400;
    throw error;
  }

  return anchor;
}

async function createCategory({ name, parentId = null, afterId = null, sortOrder = null }) {
  const parent = await ensureParent(parentId);
  const level = Number(parent.level || 0) + 1;
  const anchor = await ensureAfterNode(afterId, parentId);

  let nextOrder = sortOrder;
  if (anchor) {
    nextOrder = Number(anchor.sort_order || 0) + 1;
    await dbRunAsync(
      'UPDATE categories SET sort_order = sort_order + 1, updated_at = CURRENT_TIMESTAMP WHERE (parent_id IS ? OR parent_id = ?) AND sort_order >= ?',
      [parentId || null, parentId || null, nextOrder]
    );
  } else if (nextOrder === null || nextOrder === undefined) {
    const row = await dbGetAsync(
      'SELECT COALESCE(MAX(sort_order), -1) as max_order FROM categories WHERE (parent_id IS ? OR parent_id = ?)',
      [parentId || null, parentId || null]
    );
    nextOrder = Number(row?.max_order ?? -1) + 1;
  }

  const result = await dbRunAsync(
    'INSERT INTO categories (name, parent_id, sort_order, level, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
    [name, parentId || null, nextOrder || 0, level]
  );

  return result.lastID;
}

async function getDescendantIds(categoryId) {
  const rows = await dbAllAsync('SELECT id, parent_id FROM categories', []);
  const childrenByParent = new Map();

  rows.forEach(row => {
    const key = row.parent_id || 0;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(row.id);
  });

  const result = [];
  const stack = [categoryId];
  while (stack.length) {
    const current = stack.pop();
    result.push(current);
    const children = childrenByParent.get(current) || [];
    children.forEach(child => stack.push(child));
  }

  return result;
}

router.get('/tree', async (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

  try {
    const tree = await db.getCategoryTree();
    res.json(tree);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', auth, async (req, res) => {
  const { name, parentId = null, afterId = null, sortOrder = null } = req.body;
  const clientId = req.headers['x-client-id'];

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: '分类名称不能为空' });
  }

  try {
    const id = await createCategory({ name: String(name).trim(), parentId, afterId, sortOrder });
    triggerDebouncedBackup(clientId, { type: 'category_updated' });
    res.json({ id });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  const { name, sortOrder } = req.body;
  const { id } = req.params;
  const clientId = req.headers['x-client-id'];

  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(String(name).trim());
  }
  if (sortOrder !== undefined) {
    updates.push('sort_order = ?');
    params.push(sortOrder);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: '没有可更新的字段' });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  try {
    const result = await dbRunAsync(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`, params);
    triggerDebouncedBackup(clientId, { type: 'category_updated' });
    res.json({ changed: result.changes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const clientId = req.headers['x-client-id'];

  try {
    const category = await dbGetAsync('SELECT * FROM categories WHERE id = ?', [id]);
    if (!category) {
      return res.status(404).json({ error: '分类不存在' });
    }

    const categoryIds = await getDescendantIds(Number(id));
    if (categoryIds.length === 0) {
      return res.json({ deleted: 0 });
    }

    const placeholders = categoryIds.map(() => '?').join(',');
    await dbRunAsync('DELETE FROM card_tags WHERE card_id IN (SELECT id FROM cards WHERE category_id IN (' + placeholders + '))', categoryIds);
    await dbRunAsync('DELETE FROM cards WHERE category_id IN (' + placeholders + ')', categoryIds);
    const result = await dbRunAsync('DELETE FROM categories WHERE id IN (' + placeholders + ')', categoryIds);

    triggerDebouncedBackup(clientId, { type: 'category_updated' });
    res.json({ deleted: result.changes, deletedCategoryIds: categoryIds });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
