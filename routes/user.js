const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const authMiddleware = require('./authMiddleware');
const { validatePasswordStrength, validateUsername } = require('../middleware/security');
const { paginateQuery } = require('../utils/dbHelpers');

const router = express.Router();

// 获取当前用户信息
router.get('/profile', authMiddleware, (req, res) => {
  db.get('SELECT id, username FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      return res.status(500).json({ message: '服务器错误' });
    }
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }
    res.json({ data: user });
  });
});

// 获取当前用户详细信息（包括登录信息）
router.get('/me', authMiddleware, (req, res) => {
  db.get('SELECT id, username, last_login_time, last_login_ip FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      return res.status(500).json({ message: '服务器错误' });
    }
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }
    res.json({
      username: user.username,
      last_login_time: user.last_login_time,
      last_login_ip: user.last_login_ip
    });
  });
});

// 修改用户名
router.put('/username', authMiddleware, (req, res) => {
  const { newUsername } = req.body;
  
  if (!newUsername) {
    return res.status(400).json({ message: '请提供新用户名' });
  }
  
  // 验证用户名格式
  const usernameValidation = validateUsername(newUsername);
  if (!usernameValidation.valid) {
    return res.status(400).json({ message: usernameValidation.message });
  }
  
  // 检查用户名是否已存在
  db.get('SELECT id FROM users WHERE username = ? AND id != ?', [newUsername, req.user.id], (err, existingUser) => {
    if (err) {
      return res.status(500).json({ message: '服务器错误' });
    }
    if (existingUser) {
      return res.status(400).json({ message: '用户名已存在' });
    }
    
    // 更新用户名
    db.run('UPDATE users SET username = ? WHERE id = ?', [newUsername, req.user.id], (err) => {
      if (err) {
        return res.status(500).json({ message: '用户名更新失败' });
      }
      res.json({ message: '用户名修改成功' });
    });
  });
});

// 修改密码
router.put('/password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ message: '请提供旧密码和新密码' });
  }
  
  // 验证新密码强度
  const passwordValidation = validatePasswordStrength(newPassword);
  if (!passwordValidation.valid) {
    return res.status(400).json({ message: passwordValidation.message });
  }
  
  // 验证旧密码
  db.get('SELECT password FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      return res.status(500).json({ message: '服务器错误' });
    }
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    const isValidPassword = bcrypt.compareSync(oldPassword, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: '旧密码错误' });
    }
    
    // 更新密码
    const newPasswordHash = bcrypt.hashSync(newPassword, 10);
    db.run('UPDATE users SET password = ? WHERE id = ?', [newPasswordHash, req.user.id], (err) => {
      if (err) {
        return res.status(500).json({ message: '密码更新失败' });
      }
      res.json({ message: '密码修改成功' });
    });
  });
});

// 获取所有用户（管理员功能）
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page, pageSize } = req.query;
    const result = await paginateQuery('users', { 
      page, 
      pageSize,
      select: 'id, username'
    });
    
    // 保持原有的响应格式
    if (!page && !pageSize) {
      res.json({ data: result });
    } else {
      res.json(result);
    }
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router; 