const express = require('express');
const db = require('../db');
const auth = require('./authMiddleware');
const { triggerDebouncedBackup } = require('../utils/autoBackup');
const { paginateQuery } = require('../utils/dbHelpers');
const router = express.Router();

// 获取所有菜单（包含子菜单）
router.get('/', (req, res) => {
  const { page, pageSize } = req.query;
  
  // 设置 20 秒超时保护
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.error('GET /api/menus 超时');
      res.status(504).json({ error: '请求超时' });
    }
  }, 20000);
  
  if (!page && !pageSize) {
    // 获取主菜单
    db.all('SELECT * FROM menus ORDER BY "order"', [], (err, menus) => {
      if (err) {
        clearTimeout(timeout);
        return res.status(500).json({error: err.message});
      }
      
      if (!menus || menus.length === 0) {
        clearTimeout(timeout);
        return res.json([]);
      }
      
      // 为每个主菜单获取子菜单
      const getSubMenus = (menu) => {
        return new Promise((resolve, reject) => {
          const subTimeout = setTimeout(() => reject(new Error('Submenu query timeout')), 5000);
          
          db.all('SELECT * FROM sub_menus WHERE parent_id = ? ORDER BY "order"', [menu.id], (err, subMenus) => {
            clearTimeout(subTimeout);
            if (err) reject(err);
            else resolve(subMenus || []);
          });
        });
      };
      
      Promise.all(menus.map(async (menu) => {
        try {
          const subMenus = await getSubMenus(menu);
          return { ...menu, subMenus };
        } catch (err) {
          console.error(`获取菜单 ${menu.id} 的子菜单失败:`, err.message);
          return { ...menu, subMenus: [] };
        }
      })).then(menusWithSubMenus => {
        clearTimeout(timeout);
        if (!res.headersSent) {
          res.json(menusWithSubMenus);
        }
      }).catch(err => {
        clearTimeout(timeout);
        if (!res.headersSent) {
          console.error('Promise.all 失败:', err.message);
          res.status(500).json({error: err.message});
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
  db.all('SELECT * FROM sub_menus WHERE parent_id = ? ORDER BY "order"', [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({error: err.message});
    res.json(rows);
  });
});

// 新增、修改、删除菜单需认证
router.post('/', auth, (req, res) => {
  const { name, order } = req.body;
  db.run('INSERT INTO menus (name, "order") VALUES (?, ?)', [name, order || 0], function(err) {
    if (err) return res.status(500).json({error: err.message});
    triggerDebouncedBackup(); // 触发自动备份
    res.json({ id: this.lastID });
  });
});

router.put('/:id', auth, (req, res) => {
  const { name, order } = req.body;
  db.run('UPDATE menus SET name=?, "order"=? WHERE id=?', [name, order || 0, req.params.id], function(err) {
    if (err) return res.status(500).json({error: err.message});
    triggerDebouncedBackup(); // 触发自动备份
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
              
              db.run('COMMIT', (err) => {
                if (err) return res.status(500).json({ error: '提交事务失败: ' + err.message });
                
                triggerDebouncedBackup();
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
    [req.params.id, name, order || 0], function(err) {
    if (err) return res.status(500).json({error: err.message});
    triggerDebouncedBackup(); // 触发自动备份
    res.json({ id: this.lastID });
  });
});

router.put('/submenus/:id', auth, (req, res) => {
  const { name, order } = req.body;
  db.run('UPDATE sub_menus SET name=?, "order"=? WHERE id=?', [name, order || 0, req.params.id], function(err) {
    if (err) return res.status(500).json({error: err.message});
    triggerDebouncedBackup(); // 触发自动备份
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
            
            db.run('COMMIT', (err) => {
              if (err) return res.status(500).json({ error: '提交事务失败: ' + err.message });
              
              triggerDebouncedBackup();
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

module.exports = router; 