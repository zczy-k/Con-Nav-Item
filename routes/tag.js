const express = require('express');
const db = require('../db');
const auth = require('./authMiddleware');
const { triggerDebouncedBackup } = require('../utils/autoBackup');
const { broadcastVersionChange } = require('../utils/sseManager');
const router = express.Router();

// 辅助函数：递增版本号并广播
async function notifyDataChange() {
  try {
    const newVersion = await db.incrementDataVersion();
    broadcastVersionChange(newVersion);
  } catch (e) {
    console.error('通知数据变更失败:', e);
  }
}

// 获取所有标签
router.get('/', (req, res) => {
  db.all('SELECT * FROM tags ORDER BY "order", name', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 创建标签
router.post('/', auth, (req, res) => {
  const { name, color } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '标签名称不能为空' });
  }
  
  const trimmedName = name.trim();
  const tagColor = color || '#2566d8';
  
  // 获取当前最大order值
  db.get('SELECT MAX("order") as maxOrder FROM tags', (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const nextOrder = (result && result.maxOrder !== null) ? result.maxOrder + 1 : 0;
    
    db.run(
        'INSERT INTO tags (name, color, "order") VALUES (?, ?, ?)',
        [trimmedName, tagColor, nextOrder],
        async function(err) {
          if (err) {
            if (err.message.includes('UNIQUE')) {
              return res.status(400).json({ error: '标签名称已存在' });
            }
            return res.status(500).json({ error: err.message });
          }
          
          triggerDebouncedBackup();
          await notifyDataChange();
          res.json({ id: this.lastID, name: trimmedName, color: tagColor, order: nextOrder });
        }
      );
  });
});

// 更新标签
router.put('/:id', auth, (req, res) => {
  const { name, color, order } = req.body;
  const { id } = req.params;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '标签名称不能为空' });
  }
  
  const trimmedName = name.trim();
  const tagColor = color || '#2566d8';
  
  db.run(
    'UPDATE tags SET name=?, color=?, "order"=? WHERE id=?',
    [trimmedName, tagColor, order || 0, id],
    async function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: '标签名称已存在' });
        }
        return res.status(500).json({ error: err.message });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: '标签不存在' });
      }
      
      triggerDebouncedBackup();
      await notifyDataChange();
      res.json({ success: true });
    }
  );
});

// 删除标签
router.delete('/:id', auth, (req, res) => {
  const { id } = req.params;
  
  // 先删除关联关系（CASCADE会自动处理，但这里显式删除以确保）
  db.run('DELETE FROM card_tags WHERE tag_id=?', [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // 删除标签
    db.run('DELETE FROM tags WHERE id=?', [id], async function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      if (this.changes === 0) {
        return res.status(404).json({ error: '标签不存在' });
      }
      
      triggerDebouncedBackup();
      await notifyDataChange();
      res.json({ success: true });
    });
  });
});

// 批量更新标签顺序
router.patch('/batch-order', auth, (req, res) => {
  const { tags } = req.body;
  
  if (!Array.isArray(tags) || tags.length === 0) {
    return res.status(400).json({ error: '无效的请求数据' });
  }
  
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      let completed = 0;
      let hasError = false;
      
      tags.forEach((tag) => {
        const { id, order } = tag;
        
        db.run('UPDATE tags SET "order"=? WHERE id=?', [order, id], function(err) {
          if (hasError) return;
          
          if (err) {
            hasError = true;
            db.run('ROLLBACK', () => {
              res.status(500).json({ error: err.message });
            });
            return;
          }
          
          completed++;
          
          if (completed === tags.length) {
            db.run('COMMIT', async (err) => {
              if (err) return res.status(500).json({ error: err.message });
              
              triggerDebouncedBackup();
              await notifyDataChange();
              res.json({ success: true, updated: completed });
            });
          }
        });
      });
    });
  });
});

// 获取标签关联的卡片数量
router.get('/:id/cards/count', (req, res) => {
  const { id } = req.params;
  
  db.get(
    'SELECT COUNT(*) as count FROM card_tags WHERE tag_id=?',
    [id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ count: result.count });
    }
  );
});

module.exports = router;
