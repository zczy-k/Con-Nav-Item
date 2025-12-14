const express = require('express');
const db = require('../db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { loginLimiter, verifyLimiter } = require('../middleware/security');
const { validatePasswordStrength, validateUsername } = require('../middleware/security');
const router = express.Router();

const JWT_SECRET = config.server.jwtSecret;

function getClientIp(req) {
  let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
  if (typeof ip === 'string' && ip.includes(',')) ip = ip.split(',')[0].trim();
  if (typeof ip === 'string' && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  return ip;
}

function getShanghaiTime() {
  const date = new Date();
  // 获取上海时区时间
  const shanghaiTime = new Date(date.toLocaleString("en-US", {timeZone: "Asia/Shanghai"}));
  
  // 格式化为 YYYY-MM-DD HH:mm:ss
  const year = shanghaiTime.getFullYear();
  const month = String(shanghaiTime.getMonth() + 1).padStart(2, '0');
  const day = String(shanghaiTime.getDate()).padStart(2, '0');
  const hours = String(shanghaiTime.getHours()).padStart(2, '0');
  const minutes = String(shanghaiTime.getMinutes()).padStart(2, '0');
  const seconds = String(shanghaiTime.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  
  // 验证输入
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  
  // 验证用户名格式
  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) {
    return res.status(400).json({ error: usernameValidation.message });
  }
  db.get('SELECT * FROM users WHERE username=?', [username], (err, user) => {
    if (err || !user) return res.status(401).json({ error: '用户名或密码错误' });
    bcrypt.compare(password, user.password, (err, result) => {
      if (result) {
        // 记录上次登录时间和IP
        const lastLoginTime = user.last_login_time;
        const lastLoginIp = user.last_login_ip;
        // 更新为本次登录（上海时间）
        const now = getShanghaiTime();
        const ip = getClientIp(req);
        db.run('UPDATE users SET last_login_time=?, last_login_ip=? WHERE id=?', [now, ip, user.id]);
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '2h' });
        res.json({ token, lastLoginTime, lastLoginIp });
      } else {
        res.status(401).json({ error: '用户名或密码错误' });
      }
    });
  });
});

// 仅密码验证（用于首页快速操作）
router.post('/verify-password', loginLimiter, (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: '请输入密码' });
  }
  
  // 密码长度验证（防止暴力破解和DoS）
  if (password.length < 1 || password.length > 128) {
    return res.status(400).json({ error: '密码格式无效' });
  }
  
  // 获取第一个管理员用户（默认id=1）
  db.get('SELECT * FROM users WHERE id = 1', (err, user) => {
    if (err || !user) {
      return res.status(500).json({ error: '服务器错误' });
    }
    
    bcrypt.compare(password, user.password, (err, result) => {
      if (result) {
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '2h' });
        res.json({ token });
      } else {
        res.status(401).json({ error: '密码错误' });
      }
    });
  });
});

// ==================== 扩展专用Token认证 ====================

// 扩展登录 - 生成长期Token（用于自动备份等功能）
router.post('/extension/login', loginLimiter, (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ success: false, message: '请输入密码' });
  }
  
  if (password.length < 1 || password.length > 128) {
    return res.status(400).json({ success: false, message: '密码格式无效' });
  }
  
  db.get('SELECT * FROM users WHERE id = 1', (err, user) => {
    if (err || !user) {
      console.error('[扩展登录] 查询用户失败:', err);
      return res.status(500).json({ success: false, message: '服务器错误' });
    }
    
    console.log('[扩展登录] 当前用户token_version:', user.token_version, '类型:', typeof user.token_version);
    
    bcrypt.compare(password, user.password, (err, result) => {
      if (result) {
        // 生成包含token_version的长期Token（365天有效）
        // 确保tokenVersion是数字类型
        const tokenVersion = parseInt(user.token_version, 10) || 1;
        console.log('[扩展登录] 生成Token，tokenVersion:', tokenVersion, '类型:', typeof tokenVersion);
        
        const token = jwt.sign(
          { 
            id: user.id, 
            username: user.username,
            tokenVersion: tokenVersion,
            type: 'extension'  // 标记为扩展Token
          }, 
          JWT_SECRET, 
          { expiresIn: '365d' }
        );
        
        console.log('[扩展登录] Token生成成功');
        res.json({ 
          success: true, 
          token,
          message: '登录成功'
        });
      } else {
        console.log('[扩展登录] 密码验证失败');
        res.status(401).json({ success: false, message: '密码错误' });
      }
    });
  });
});

// 验证扩展Token是否有效
router.get('/extension/verify', verifyLimiter, (req, res) => {
  // 禁用缓存，确保每次都是实时验证
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  const auth = req.headers.authorization;
  
  if (!auth || !auth.startsWith('Bearer ')) {
    console.log('[Token验证] 未提供Token');
    return res.json({ success: false, valid: false, message: '未提供Token' });
  }
  
  const token = auth.slice(7);
  
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    console.log('[Token验证] Token解析成功，payload:', {
      id: payload.id,
      username: payload.username,
      tokenVersion: payload.tokenVersion,
      type: payload.type
    });
    
    // 检查是否是扩展Token
    if (payload.type !== 'extension') {
      console.log('[Token验证] Token类型无效:', payload.type);
      return res.json({ success: false, valid: false, message: 'Token类型无效' });
    }
    
    // 检查token_version是否匹配
    db.get('SELECT token_version FROM users WHERE id = ?', [payload.id], (err, user) => {
      if (err || !user) {
        console.error('[Token验证] 查询用户失败:', err);
        return res.json({ success: false, valid: false, message: '用户不存在' });
      }
      
      // 确保类型一致，都转换为数字进行比较
      const currentVersion = parseInt(user.token_version, 10) || 1;
      const tokenVersion = parseInt(payload.tokenVersion, 10) || 1;
      console.log('[Token验证] 版本对比 - Token中:', tokenVersion, '(类型:', typeof payload.tokenVersion, ') 数据库中:', currentVersion, '(类型:', typeof user.token_version, ')');
      
      if (tokenVersion !== currentVersion) {
        console.log('[Token验证] 版本不匹配，Token无效');
        return res.json({ 
          success: false, 
          valid: false, 
          message: '密码已更改，请重新验证',
          reason: 'password_changed'
        });
      }
      
      console.log('[Token验证] 验证通过');
      res.json({ success: true, valid: true });
    });
  } catch (err) {
    console.error('[Token验证] Token验证异常:', err.message);
    if (err.name === 'TokenExpiredError') {
      return res.json({ success: false, valid: false, message: 'Token已过期', reason: 'expired' });
    }
    return res.json({ success: false, valid: false, message: 'Token无效' });
  }
});

module.exports = router; 