const express = require('express');
const db = require('../db');
const auth = require('./authMiddleware');
const { triggerDebouncedBackup } = require('../utils/autoBackup');
const { paginateQuery } = require('../utils/dbHelpers');
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

// 获取所有菜单（包含子菜单）- 优化：单次查询获取所有数据
router.get('/', (req, res) => {
  const { page, pageSize } = req.query;
  
  // 不设置缓存，确保数据实时性
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  // 设置 20 秒超时保护
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: '请求超时' });
    }
  }, 20000);
  
  if (!page && !pageSize) {
    // 优化：使用单次查询获取所有菜单和子菜单，避免N+1问题
    db.all('SELECT * FROM menus ORDER BY "order"', [], (err, menus) => {
      if (err) {
        clearTimeout(timeout);
        return res.status(500).json({error: err.message});
      }
      
      if (!menus || menus.length === 0) {
        clearTimeout(timeout);
        return res.json([]);
      }
      
      // 一次性获取所有子菜单
      db.all('SELECT * FROM sub_menus ORDER BY "order"', [], (err, allSubMenus) => {
        clearTimeout(timeout);
        if (err) {
          return res.status(500).json({error: err.message});
        }
        
        // 按 parent_id 分组子菜单
        const subMenusByParent = {};
        (allSubMenus || []).forEach(sub => {
          if (!subMenusByParent[sub.parent_id]) {
            subMenusByParent[sub.parent_id] = [];
          }
          subMenusByParent[sub.parent_id].push(sub);
        });
        
        // 组装结果
        const result = menus.map(menu => ({
          ...menu,
          subMenus: subMenusByParent[menu.id] || []
        }));
        
        if (!res.headersSent) {
          res.json(result);
        }
      });
    });
  } else {
    // 使用分页助手函数
    paginateQuery('menus', { page, pageSize, orderBy: '"order"' })
      .then(result => res.json(result))
      .catch(err => res.status(500).json({ error: err.message }));
  }
});

// 获取指定菜单的子菜单
router.get('/:id/submenus', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  db.all('SELECT * FROM sub_menus WHERE parent_id = ? ORDER BY "order"', [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({error: err.message});
    res.json(rows);
  });
});

// 新增、修改、删除菜单需认证
router.post('/', auth, (req, res) => {
  const { name, order } = req.body;
  db.run('INSERT INTO menus (name, "order") VALUES (?, ?)', [name, order || 0], async function(err) {
    if (err) return res.status(500).json({error: err.message});
    triggerDebouncedBackup();
    await notifyDataChange();
    res.json({ id: this.lastID });
  });
});

router.put('/:id', auth, (req, res) => {
  const { name, order } = req.body;
  
  // 支持部分更新：只更新提供的字段
  const updates = [];
  const params = [];
  
  if (name !== undefined) {
    updates.push('name=?');
    params.push(name);
  }
  if (order !== undefined) {
    updates.push('"order"=?');
    params.push(order);
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: '没有提供要更新的字段' });
  }
  
  params.push(req.params.id);
  const sql = `UPDATE menus SET ${updates.join(', ')} WHERE id=?`;
  
  db.run(sql, params, async function(err) {
    if (err) return res.status(500).json({error: err.message});
    triggerDebouncedBackup();
    await notifyDataChange();
    res.json({ changed: this.changes });
  });
});

router.delete('/:id', auth, (req, res) => {
  const menuId = req.params.id;
  
  // 使用事务确保数据一致性
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // 1. 删除该菜单下所有卡片的标签关联
      db.run('DELETE FROM card_tags WHERE card_id IN (SELECT id FROM cards WHERE menu_id = ?)', [menuId], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: '删除卡片标签失败: ' + err.message });
        }
        
        // 2. 删除该菜单下的所有卡片
        db.run('DELETE FROM cards WHERE menu_id = ?', [menuId], function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: '删除卡片失败: ' + err.message });
          }
          
          const deletedCards = this.changes;
          
          // 3. 删除该菜单下的所有子菜单
          db.run('DELETE FROM sub_menus WHERE parent_id = ?', [menuId], function(err) {
            if (err) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: '删除子菜单失败: ' + err.message });
            }
            
            const deletedSubMenus = this.changes;
            
            // 4. 删除菜单本身
            db.run('DELETE FROM menus WHERE id = ?', [menuId], function(err) {
              if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: '删除菜单失败: ' + err.message });
              }
              
              db.run('COMMIT', async (err) => {
                  if (err) return res.status(500).json({ error: '提交事务失败: ' + err.message });
                  
                  triggerDebouncedBackup();
                  await notifyDataChange();
                  res.json({ 
                    deleted: this.changes,
                    deletedCards: deletedCards,
                    deletedSubMenus: deletedSubMenus
                  });
                });
            });
          });
        });
      });
    });
  });
});

// 子菜单相关API
router.post('/:id/submenus', auth, (req, res) => {
  const { name, order } = req.body;
  db.run('INSERT INTO sub_menus (parent_id, name, "order") VALUES (?, ?, ?)', 
    [req.params.id, name, order || 0], async function(err) {
    if (err) return res.status(500).json({error: err.message});
    triggerDebouncedBackup();
    await notifyDataChange();
    res.json({ id: this.lastID });
  });
});

router.put('/submenus/:id', auth, (req, res) => {
  const { name, order } = req.body;
  
  // 支持部分更新：只更新提供的字段
  const updates = [];
  const params = [];
  
  if (name !== undefined) {
    updates.push('name=?');
    params.push(name);
  }
  if (order !== undefined) {
    updates.push('"order"=?');
    params.push(order);
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: '没有提供要更新的字段' });
  }
  
  params.push(req.params.id);
  const sql = `UPDATE sub_menus SET ${updates.join(', ')} WHERE id=?`;
  
  db.run(sql, params, async function(err) {
    if (err) return res.status(500).json({error: err.message});
    triggerDebouncedBackup();
    await notifyDataChange();
    res.json({ changed: this.changes });
  });
});

router.delete('/submenus/:id', auth, (req, res) => {
  const subMenuId = req.params.id;
  
  // 使用事务确保数据一致性
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // 1. 删除该子菜单下所有卡片的标签关联
      db.run('DELETE FROM card_tags WHERE card_id IN (SELECT id FROM cards WHERE sub_menu_id = ?)', [subMenuId], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: '删除卡片标签失败: ' + err.message });
        }
        
        // 2. 删除该子菜单下的所有卡片
        db.run('DELETE FROM cards WHERE sub_menu_id = ?', [subMenuId], function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: '删除卡片失败: ' + err.message });
          }
          
          const deletedCards = this.changes;
          
          // 3. 删除子菜单本身
          db.run('DELETE FROM sub_menus WHERE id = ?', [subMenuId], function(err) {
            if (err) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: '删除子菜单失败: ' + err.message });
            }
            
            db.run('COMMIT', async (err) => {
                if (err) return res.status(500).json({ error: '提交事务失败: ' + err.message });
                
                triggerDebouncedBackup();
                await notifyDataChange();
                res.json({ 
                  deleted: this.changes,
                  deletedCards: deletedCards
                });
              });
            });
          });
        });
      });
    });
  });
});

module.exports = router; 