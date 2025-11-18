const express = require('express');
const db = require('../db');
const auth = require('./authMiddleware');
const { triggerDebouncedBackup } = require('../utils/autoBackup');
const { detectDuplicates, isDuplicateCard } = require('../utils/urlNormalizer');
const router = express.Router();

// 获取指定菜单的卡片（包含标签）
router.get('/:menuId', (req, res) => {
  const { subMenuId } = req.query;
  let query, params;
  
  if (subMenuId) {
    query = 'SELECT * FROM cards WHERE sub_menu_id = ? ORDER BY "order"';
    params = [subMenuId];
  } else {
    query = 'SELECT * FROM cards WHERE menu_id = ? AND sub_menu_id IS NULL ORDER BY "order"';
    params = [req.params.menuId];
  }
  
  db.all(query, params, (err, cards) => {
    if (err) return res.status(500).json({error: err.message});
    
    if (cards.length === 0) {
      return res.json([]);
    }
    
    // 为每个卡片获取标签
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
        
        // 将标签按 card_id 分组
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
        
        // 将标签添加到卡片数据中
        const result = cards.map(card => ({
          ...card,
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
        const { id, order, menu_id, sub_menu_id } = card;
        
        db.run(
          'UPDATE cards SET "order"=?, menu_id=?, sub_menu_id=? WHERE id=?',
          [order, menu_id, sub_menu_id || null, id],
          function(err) {
            if (hasError) return; // 已经处理过错误
            
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
                triggerDebouncedBackup(); // 触发自动备份
                res.json({ success: true, updated: completed });
              });
            }
          }
        );
      });
    });
  });
});

// 新增卡片（含标签）
router.post('/', auth, (req, res) => {
  const { menu_id, sub_menu_id, title, url, logo_url, desc, order, tagIds } = req.body;
  
  // 先检查是否重复
  db.all('SELECT * FROM cards', [], (err, existingCards) => {
    if (err) return res.status(500).json({error: err.message});
    
    const newCard = { title, url };
    const duplicate = existingCards.find(card => isDuplicateCard(newCard, card));
    
    if (duplicate) {
      return res.status(409).json({
        error: '卡片已存在',
        message: `该卡片与现有卡片“${duplicate.title}”重复`,
        duplicate: duplicate
      });
    }
    
    // 不重复，添加卡片
    db.run(
      'INSERT INTO cards (menu_id, sub_menu_id, title, url, logo_url, desc, "order") VALUES (?, ?, ?, ?, ?, ?, ?)', 
      [menu_id, sub_menu_id || null, title, url, logo_url, desc, order || 0],
      function(err) {
        if (err) return res.status(500).json({error: err.message});
        
        const cardId = this.lastID;
        
        // 如果有标签，关联标签
        if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
          const values = tagIds.map(tagId => `(${cardId}, ${tagId})`).join(',');
          db.run(`INSERT INTO card_tags (card_id, tag_id) VALUES ${values}`, (err) => {
            if (err) return res.status(500).json({error: err.message});
            
            triggerDebouncedBackup();
            res.json({ id: cardId });
          });
        } else {
          triggerDebouncedBackup();
          res.json({ id: cardId });
        }
      }
    );
  });
});

// 更新卡片（含标签）
router.put('/:id', auth, (req, res) => {
  const { menu_id, sub_menu_id, title, url, logo_url, desc, order, tagIds } = req.body;
  const { id } = req.params;
  
  db.run(
    'UPDATE cards SET menu_id=?, sub_menu_id=?, title=?, url=?, logo_url=?, desc=?, "order"=? WHERE id=?', 
    [menu_id, sub_menu_id || null, title, url, logo_url, desc, order || 0, id],
    function(err) {
      if (err) return res.status(500).json({error: err.message});
      
      // 删除旧的标签关联
      db.run('DELETE FROM card_tags WHERE card_id=?', [id], (err) => {
        if (err) return res.status(500).json({error: err.message});
        
        // 如果有新标签，添加关联
        if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
          const values = tagIds.map(tagId => `(${id}, ${tagId})`).join(',');
          db.run(`INSERT INTO card_tags (card_id, tag_id) VALUES ${values}`, (err) => {
            if (err) return res.status(500).json({error: err.message});
            
            triggerDebouncedBackup();
            res.json({ changed: this.changes });
          });
        } else {
          triggerDebouncedBackup();
          res.json({ changed: this.changes });
        }
      });
    }
  );
});

router.delete('/:id', auth, (req, res) => {
  db.run('DELETE FROM cards WHERE id=?', [req.params.id], function(err) {
    if (err) return res.status(500).json({error: err.message});
    triggerDebouncedBackup(); // 触发自动备份
    res.json({ deleted: this.changes });
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

// 批量删除重复卡片
router.post('/remove-duplicates', auth, (req, res) => {
  const { cardIds } = req.body;
  
  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    return res.status(400).json({ error: '无效的请求数据' });
  }
  
  const placeholders = cardIds.map(() => '?').join(',');
  
  db.run(`DELETE FROM cards WHERE id IN (${placeholders})`, cardIds, function(err) {
    if (err) return res.status(500).json({error: err.message});
    
    triggerDebouncedBackup();
    res.json({ deleted: this.changes });
  });
});

module.exports = router;
