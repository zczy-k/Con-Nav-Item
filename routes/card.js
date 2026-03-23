const express = require('express');
const db = require('../db');
const auth = require('./authMiddleware');
const { triggerDebouncedBackup } = require('../utils/autoBackup');
const { detectDuplicates, getDuplicateMatch } = require('../utils/urlNormalizer');
const { autoGenerateForCards } = require('./ai');
const router = express.Router();

async function resolveCardLocation(payload = {}) {
  if (payload.category_id) {
    const legacyLocation = await db.getLegacyLocationByCategoryId(payload.category_id);
    if (!legacyLocation) {
      const error = new Error('分类不存在');
      error.statusCode = 400;
      throw error;
    }

    return {
      category_id: payload.category_id,
      menu_id: legacyLocation.menu_id,
      sub_menu_id: legacyLocation.sub_menu_id
    };
  }

  const category = await db.getCategoryByLegacy(payload.menu_id || null, payload.sub_menu_id || null);
  return {
    category_id: category?.id || null,
    menu_id: payload.menu_id || null,
    sub_menu_id: payload.sub_menu_id || null
  };
}

function attachTagsToCards(cards, res, formatter = card => card) {
  if (!cards || cards.length === 0) {
    return res.json([]);
  }

  const cardIds = cards.map(c => c.id);
  const placeholders = cardIds.map(() => '?').join(',');

  db.all(
    `SELECT ct.card_id, t.id, t.name, t.color
     FROM card_tags ct
     JOIN tags t ON ct.tag_id = t.id
     WHERE ct.card_id IN (${placeholders})
     ORDER BY t."order", t.name`,
    cardIds,
    (err, tagRows) => {
      if (err) return res.status(500).json({ error: err.message });

      const tagsByCard = {};
      tagRows.forEach(tag => {
        if (!tagsByCard[tag.card_id]) tagsByCard[tag.card_id] = [];
        tagsByCard[tag.card_id].push({ id: tag.id, name: tag.name, color: tag.color });
      });

      res.json(cards.map(card => formatter({ ...card, tags: tagsByCard[card.id] || [] })));
    }
  );
}

// 获取所有卡片（按分类分组，用于首屏加载优化）
router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  db.all(`
    SELECT c.*, c.category_id, sm.parent_id as parent_menu_id
    FROM cards c
    LEFT JOIN sub_menus sm ON c.sub_menu_id = sm.id
    ORDER BY c.menu_id, c.sub_menu_id, c."order"
  `, [], (err, cards) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (cards.length === 0) {
      return res.json({ cards: [], cardsByCategory: {} });
    }
    
    const cardIds = cards.map(c => c.id);
    const placeholders = cardIds.map(() => '?').join(',');
    
    db.all(
      `SELECT ct.card_id, t.id, t.name, t.color 
       FROM card_tags ct 
       JOIN tags t ON ct.tag_id = t.id 
       WHERE ct.card_id IN (${placeholders})
       ORDER BY t."order", t.name`,
      cardIds,
      (err, tagRows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const tagsByCard = {};
        tagRows.forEach(tag => {
          if (!tagsByCard[tag.card_id]) {
            tagsByCard[tag.card_id] = [];
          }
          tagsByCard[tag.card_id].push({
            id: tag.id,
            name: tag.name,
            color: tag.color
          });
        });
        
        const cardsByCategory = {};
        cards.forEach(card => {
          const menuId = card.menu_id || card.parent_menu_id;
          const key = `${menuId}_${card.sub_menu_id || 'null'}`;
          if (!cardsByCategory[key]) {
            cardsByCategory[key] = [];
          }
          cardsByCategory[key].push({
            ...card,
            menu_id: menuId,
            tags: tagsByCard[card.id] || []
          });
        });
        
        res.json({ cardsByCategory });
      }
    );
  });
});

// 获取指定菜单的卡片（包含标签）
router.get('/:menuId', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  const { subMenuId } = req.query;
  const menuId = req.params.menuId;
  let query, params;
  
  if (subMenuId) {
    query = `
      SELECT c.*, c.category_id, sm.parent_id as parent_menu_id
      FROM cards c
      LEFT JOIN sub_menus sm ON c.sub_menu_id = sm.id
      WHERE c.sub_menu_id = ?
      ORDER BY c."order"
    `;
    params = [subMenuId];
  } else {
    query = 'SELECT * FROM cards WHERE menu_id = ? AND sub_menu_id IS NULL ORDER BY "order"';
    params = [menuId];
  }
  
  db.all(query, params, (err, cards) => {
    if (err) return res.status(500).json({error: err.message});
    
    if (cards.length === 0) {
      return res.json([]);
    }
    
    const cardIds = cards.map(c => c.id);
    const placeholders = cardIds.map(() => '?').join(',');
    
    db.all(
      `SELECT ct.card_id, t.id, t.name, t.color 
       FROM card_tags ct 
       JOIN tags t ON ct.tag_id = t.id 
       WHERE ct.card_id IN (${placeholders})
       ORDER BY t."order", t.name`,
      cardIds,
      (err, tagRows) => {
        if (err) return res.status(500).json({error: err.message});
        
        const tagsByCard = {};
        tagRows.forEach(tag => {
          if (!tagsByCard[tag.card_id]) {
            tagsByCard[tag.card_id] = [];
          }
          tagsByCard[tag.card_id].push({
            id: tag.id,
            name: tag.name,
            color: tag.color
          });
        });
        
        const result = cards.map(card => ({
          ...card,
          menu_id: card.menu_id || card.parent_menu_id || parseInt(menuId),
          tags: tagsByCard[card.id] || []
        }));
        
        res.json(result);
      }
    );
  });
});

// 批量更新卡片（用于拖拽排序和分类）- 必须放在/:id之前
router.patch('/batch-update', auth, (req, res) => {
  const { cards } = req.body;
  const clientId = req.headers['x-client-id'];
  
  if (!Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: '无效的请求数据' });
  }
  
  // 使用Promise优化批量更新
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      let completed = 0;
      let hasError = false;
      
      if (cards.length === 0) {
        db.run('COMMIT');
        return res.json({ success: true, updated: 0 });
      }
      
      cards.forEach((card) => {
        resolveCardLocation(card).then(location => {
          const { id, order } = card;

          db.run(
            'UPDATE cards SET "order"=?, menu_id=?, sub_menu_id=?, category_id=? WHERE id=?',
            [order, location.menu_id, location.sub_menu_id || null, location.category_id, id],
            function(err) {
              if (hasError) return;

              if (err) {
                hasError = true;
                db.run('ROLLBACK', () => {
                  res.status(500).json({ error: err.message });
                });
                return;
              }

              completed++;

              if (completed === cards.length) {
                db.run('COMMIT', (err) => {
                  if (err) {
                    return res.status(500).json({ error: err.message });
                  }
                  triggerDebouncedBackup(clientId, { type: 'cards_updated' });
                  res.json({ success: true, updated: completed });
                });
              }
            }
          );
        }).catch(err => {
          if (hasError) return; // 已经处理过错误
          hasError = true;
          db.run('ROLLBACK', () => {
            res.status(err.statusCode || 500).json({ error: err.message });
          });
        });
      });
    });
  });
});

// 新增卡片（含标签）
router.post('/', auth, (req, res) => {
  const { title, url, logo_url, desc, order, tagIds } = req.body;
  const clientId = req.headers['x-client-id'];
  
  // 先检查是否重复
  db.all('SELECT * FROM cards', [], (err, existingCards) => {
    if (err) return res.status(500).json({error: err.message});
    
    const newCard = { title, url };
    const duplicate = existingCards.find(card => {
      const match = getDuplicateMatch(newCard, card);
      return match && match.type === 'exact';
    });
    
    if (duplicate) {
      return res.status(409).json({
        error: '卡片已存在',
        message: `该卡片与现有卡片“${duplicate.title}”重复`,
        duplicate: duplicate
      });
    }
    
    // 不重复，添加卡片
    resolveCardLocation(req.body).then(location => {
      db.run(
        'INSERT INTO cards (menu_id, sub_menu_id, category_id, title, url, logo_url, desc, "order") VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
        [location.menu_id, location.sub_menu_id || null, location.category_id, title, url, logo_url, desc, order || 0],
        function(err) {
          if (err) return res.status(500).json({error: err.message});
          
          const cardId = this.lastID;
          
          // 如果有标签，关联标签
          if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
            const values = tagIds.map(tagId => `(${cardId}, ${tagId})`).join(',');
            db.run(`INSERT INTO card_tags (card_id, tag_id) VALUES ${values}`, (err) => {
              if (err) return res.status(500).json({error: err.message});
              
              triggerDebouncedBackup(clientId, { type: 'cards_updated' });
              
              setImmediate(() => autoGenerateForCards([cardId]));
              
              res.json({ id: cardId, category_id: location.category_id });
            });
          } else {
            triggerDebouncedBackup(clientId, { type: 'cards_updated' });
            
            setImmediate(() => autoGenerateForCards([cardId]));
            
            res.json({ id: cardId, category_id: location.category_id });
          }
        }
      );
    }).catch(err => {
      res.status(err.statusCode || 500).json({ error: err.message });
    });
  });
});

router.get('/by-category/:categoryId', async (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

  try {
    const location = await db.getLegacyLocationByCategoryId(req.params.categoryId);
    if (!location) {
      return res.status(404).json({ error: '分类不存在' });
    }

    const query = location.sub_menu_id
      ? `SELECT c.*, c.category_id, sm.parent_id as parent_menu_id
         FROM cards c
         LEFT JOIN sub_menus sm ON c.sub_menu_id = sm.id
         WHERE c.category_id = ?
         ORDER BY c."order"`
      : 'SELECT * FROM cards WHERE category_id = ? ORDER BY "order"';

    db.all(query, [req.params.categoryId], (err, cards) => {
      if (err) return res.status(500).json({ error: err.message });
      attachTagsToCards(cards, res, card => ({
        ...card,
        menu_id: card.menu_id || card.parent_menu_id || null,
        sub_menu_id: card.sub_menu_id || null
      }));
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/grouped/by-category', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

  db.all('SELECT * FROM cards ORDER BY category_id, "order"', [], (err, cards) => {
    if (err) return res.status(500).json({ error: err.message });

    if (cards.length === 0) {
      return res.json({ cardsByCategory: {} });
    }

    const cardIds = cards.map(card => card.id);
    const placeholders = cardIds.map(() => '?').join(',');

    db.all(
      `SELECT ct.card_id, t.id, t.name, t.color
       FROM card_tags ct
       JOIN tags t ON ct.tag_id = t.id
       WHERE ct.card_id IN (${placeholders})
       ORDER BY t."order", t.name`,
      cardIds,
      (tagErr, tagRows) => {
        if (tagErr) return res.status(500).json({ error: tagErr.message });

        const tagsByCard = {};
        tagRows.forEach(tag => {
          if (!tagsByCard[tag.card_id]) tagsByCard[tag.card_id] = [];
          tagsByCard[tag.card_id].push({ id: tag.id, name: tag.name, color: tag.color });
        });

        const cardsByCategory = {};
        cards.forEach(card => {
          const key = String(card.category_id || 'uncategorized');
          if (!cardsByCategory[key]) cardsByCategory[key] = [];
          cardsByCategory[key].push({ ...card, tags: tagsByCard[card.id] || [] });
        });

        res.json({ cardsByCategory });
      }
    );
  });
});

// 更新卡片（含标签）
router.put('/:id', auth, (req, res) => {
  const { title, url, logo_url, desc, order, tagIds } = req.body;
  const { id } = req.params;
  const clientId = req.headers['x-client-id'];

  resolveCardLocation(req.body).then(location => {
    db.run(
      'UPDATE cards SET menu_id=?, sub_menu_id=?, category_id=?, title=?, url=?, logo_url=?, desc=?, "order"=? WHERE id=?', 
      [location.menu_id, location.sub_menu_id || null, location.category_id, title, url, logo_url, desc, order || 0, id],
      function(err) {
        if (err) return res.status(500).json({error: err.message});
        
        const changes = this.changes;
        
        if (changes === 0) {
          return res.status(404).json({error: '卡片不存在'});
        }
        
        db.run('DELETE FROM card_tags WHERE card_id=?', [id], (err) => {
          if (err) return res.status(500).json({error: err.message});
          
          const finishUpdate = () => {
            db.get('SELECT * FROM cards WHERE id=?', [id], (err, card) => {
              if (err) return res.status(500).json({error: err.message});
              if (!card) return res.status(404).json({error: '卡片不存在'});
              
              triggerDebouncedBackup(clientId, { type: 'cards_updated' });
              res.json({ 
                success: true,
                changed: changes,
                card: card
              });
            });
          };
          
          if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
            const values = tagIds.map(tagId => `(${id}, ${tagId})`).join(',');
            db.run(`INSERT INTO card_tags (card_id, tag_id) VALUES ${values}`, (err) => {
              if (err) return res.status(500).json({error: err.message});
              finishUpdate();
            });
          } else {
            finishUpdate();
          }
        });
      }
    );
  }).catch(err => {
    res.status(err.statusCode || 500).json({ error: err.message });
  });
});

router.delete('/:id', auth, (req, res) => {
  const cardId = req.params.id;
  const clientId = req.headers['x-client-id'];
  
  // 使用事务确保数据一致性
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // 先删除关联的标签
      db.run('DELETE FROM card_tags WHERE card_id=?', [cardId], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: '删除标签关联失败: ' + err.message });
        }
        
        // 再删除卡片
        db.run('DELETE FROM cards WHERE id=?', [cardId], function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: '删除卡片失败: ' + err.message });
          }
          
          const deletedCount = this.changes;
          
          db.run('COMMIT', (err) => {
            if (err) {
              return res.status(500).json({ error: '提交事务失败: ' + err.message });
            }
            
            triggerDebouncedBackup(clientId, { type: 'cards_updated' }); // 触发自动备份和SSE广播
            res.json({ 
              success: true,
              deleted: deletedCount
            });
          });
        });
      });
    });
  });
});

// 检测重复卡片
router.get('/detect-duplicates/all', auth, (req, res) => {
  db.all('SELECT * FROM cards ORDER BY id', [], (err, cards) => {
    if (err) return res.status(500).json({error: err.message});
    
    const duplicateGroups = detectDuplicates(cards);
    
    res.json({
      total: cards.length,
      duplicateGroups: duplicateGroups,
      duplicateCount: duplicateGroups.reduce((sum, group) => sum + group.duplicates.length, 0)
    });
  });
});

// 记录卡片点击（用于频率排序）
router.post('/:id/click', (req, res) => {
  const cardId = req.params.id;
  
  db.run(
    'UPDATE cards SET click_count = COALESCE(click_count, 0) + 1 WHERE id = ?',
    [cardId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: '卡片不存在' });
      res.json({ success: true });
    }
  );
});

// 批量删除重复卡片
router.post('/remove-duplicates', auth, (req, res) => {
  const { cardIds } = req.body;
  
  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    return res.status(400).json({ error: '无效的请求数据' });
  }
  
  const placeholders = cardIds.map(() => '?').join(',');
  
  // 使用事务确保数据一致性
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // 先删除关联的标签（防止外键约束问题）
      db.run(`DELETE FROM card_tags WHERE card_id IN (${placeholders})`, cardIds, (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: '删除标签关联失败: ' + err.message });
        }
        
        // 再删除卡片
        db.run(`DELETE FROM cards WHERE id IN (${placeholders})`, cardIds, function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: '删除卡片失败: ' + err.message });
          }
          
          const deletedCount = this.changes;
          
          db.run('COMMIT', (err) => {
            if (err) {
              return res.status(500).json({ error: '提交事务失败: ' + err.message });
            }
            
            triggerDebouncedBackup();
            res.json({ 
              success: true,
              deleted: deletedCount,
              message: `成功删除 ${deletedCount} 张卡片`
            });
          });
        });
      });
    });
  });
});

router.get('/user-settings/sort', (req, res) => {
  db.get('SELECT value FROM settings WHERE key = ?', ['user_sort_type'], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ sortType: row?.value || 'default' });
  });
});

router.post('/user-settings/sort', (req, res) => {
  const { sortType } = req.body;
  if (!sortType) {
    return res.status(400).json({ error: '排序类型不能为空' });
  }
  
  db.run(
    'REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
    ['user_sort_type', sortType],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

module.exports = router;
