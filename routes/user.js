const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const authMiddleware = require('./authMiddleware');
const { validatePasswordStrength, validateUsername } = require('../middleware/security');
const { paginateQuery } = require('../utils/dbHelpers');

const router = express.Router();

// 获取当前用户信息
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await db.get('SELECT id, username FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ message: '用户不存在' });
    res.json({ data: user });
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取当前用户详细信息
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.get('SELECT id, username, last_login_time, last_login_ip FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ message: '用户不存在' });
    res.json({
      username: user.username,
      last_login_time: user.last_login_time,
      last_login_ip: user.last_login_ip
    });
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 修改用户名
router.put('/username', authMiddleware, async (req, res) => {
  const { newUsername } = req.body;
  if (!newUsername) return res.status(400).json({ message: '请提供新用户名' });

  const validation = validateUsername(newUsername);
  if (!validation.valid) return res.status(400).json({ message: validation.message });

  try {
    const existing = await db.get('SELECT id FROM users WHERE username = ? AND id != ?', [newUsername, req.user.id]);
    if (existing) return res.status(400).json({ message: '用户名已存在' });

    await db.run('UPDATE users SET username = ? WHERE id = ?', [newUsername, req.user.id]);
    res.json({ message: '用户名修改成功' });
  } catch (err) {
    res.status(500).json({ message: '用户名更新失败' });
  }
});

// 修改密码
router.put('/password', authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ message: '请提供旧密码和新密码' });

  const validation = validatePasswordStrength(newPassword);
  if (!validation.valid) return res.status(400).json({ message: validation.message });

  try {
    const user = await db.get('SELECT password, token_version FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ message: '用户不存在' });

    if (!bcrypt.compareSync(oldPassword, user.password)) {
      return res.status(400).json({ message: '旧密码错误' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    const nextTokenVersion = (user.token_version || 1) + 1;
    await db.run('UPDATE users SET password = ?, token_version = ? WHERE id = ?', [newHash, nextTokenVersion, req.user.id]);
    res.json({ message: '密码修改成功', notice: '所有已授权的浏览器扩展需要重新验证' });
  } catch (err) {
    res.status(500).json({ message: '密码更新失败' });
  }
});

// 管理员获取所有用户
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page, pageSize } = req.query;
    const result = await paginateQuery('users', { page, pageSize, select: 'id, username' });
    res.json(!page && !pageSize ? { data: result } : result);
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
