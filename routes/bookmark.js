const express = require('express');
const db = require('../db');
const auth = require('./authMiddleware');
const router = express.Router();

// 获取所有书签
router.get('/', async (req, res) => {
    try {
        const { page = 1, pageSize = 50, q } = req.query;
        const offset = (page - 1) * pageSize;

        let query = 'SELECT * FROM bookmarks';
        let countQuery = 'SELECT COUNT(*) as count FROM bookmarks';
        let params = [];

        if (q) {
            query += ' WHERE title LIKE ? OR url LIKE ?';
            countQuery += ' WHERE title LIKE ? OR url LIKE ?';
            params = [`%${q}%`, `%${q}%`];
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

        const rows = await new Promise((resolve, reject) => {
            db.all(query, [...params, pageSize, offset], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        const countResult = await new Promise((resolve, reject) => {
            db.get(countQuery, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        res.json({
            data: rows,
            total: countResult.count,
            page: parseInt(page),
            pageSize: parseInt(pageSize)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 同步书签 (全量覆盖)
router.post('/sync', auth, async (req, res) => {
    const { bookmarks } = req.body;

    if (!Array.isArray(bookmarks)) {
        return res.status(400).json({ error: '无效的书签数据' });
    }

    try {
        // 开启事务
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // 清空现有书签
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM bookmarks', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // 批量插入
        const stmt = await new Promise((resolve, reject) => {
            const statement = db.prepare('INSERT INTO bookmarks (title, url, icon) VALUES (?, ?, ?)', (err) => {
                if (err) reject(err);
                else resolve(statement);
            });
        });

        for (const bm of bookmarks) {
            await new Promise((resolve, reject) => {
                stmt.run([bm.title, bm.url, bm.icon], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        await new Promise((resolve, reject) => {
            stmt.finalize((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // 提交事务
        await new Promise((resolve, reject) => {
            db.run('COMMIT', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true, count: bookmarks.length });

    } catch (err) {
        // 回滚事务
        db.run('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

// 删除书签
router.delete('/:id', auth, (req, res) => {
    db.run('DELETE FROM bookmarks WHERE id = ?', [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes });
    });
});

// 修改书签
router.put('/:id', auth, (req, res) => {
    const { title, url, icon } = req.body;
    db.run(
        'UPDATE bookmarks SET title = ?, url = ?, icon = ? WHERE id = ?',
        [title, url, icon, req.params.id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ changed: this.changes });
        }
    );
});

module.exports = router;
