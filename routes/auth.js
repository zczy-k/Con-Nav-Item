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
  const shanghaiTime = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const year = shanghaiTime.getFullYear();
  const month = String(shanghaiTime.getMonth() + 1).padStart(2, '0');
  const day = String(shanghaiTime.getDate()).padStart(2, '0');
  const hours = String(shanghaiTime.getHours()).padStart(2, '0');
  const minutes = String(shanghaiTime.getMinutes()).padStart(2, '0');
  const seconds = String(shanghaiTime.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });

  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) return res.status(400).json({ error: usernameValidation.message });

  try {
    const user = await db.get('SELECT * FROM users WHERE username=?', [username]);
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: '用户名或密码错误' });

    const lastLoginTime = user.last_login_time;
    const lastLoginIp = user.last_login_ip;
    const now = getShanghaiTime();
    const ip = getClientIp(req);
    await db.run('UPDATE users SET last_login_time=?, last_login_ip=? WHERE id=?', [now, ip, user.id]);

    const tokenVersion = parseInt(user.token_version, 10) || 1;
    const token = jwt.sign({ id: user.id, username: user.username, tokenVersion: tokenVersion }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token, lastLoginTime, lastLoginIp });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/verify-password', loginLimiter, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length > 128) return res.status(400).json({ error: '请输入有效的密码' });

  try {
    const user = await db.get('SELECT * FROM users WHERE id = 1');
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: '密码错误' });

    const tokenVersion = parseInt(user.token_version, 10) || 1;
    const token = jwt.sign({ id: user.id, username: user.username, tokenVersion: tokenVersion }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/extension/login', loginLimiter, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length > 128) return res.status(400).json({ success: false, message: '请输入有效的密码' });

  try {
    const user = await db.get('SELECT * FROM users WHERE id = 1');
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ success: false, message: '密码错误' });

    const tokenVersion = parseInt(user.token_version, 10) || 1;
    const token = jwt.sign({ id: user.id, username: user.username, tokenVersion: tokenVersion, type: 'extension' }, JWT_SECRET, { expiresIn: '365d' });
    res.json({ success: true, token, message: '登录成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/extension/verify', verifyLimiter, async (req, res) => {
  res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.json({ success: false, valid: false, message: '未提供Token' });

  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'extension') return res.json({ success: false, valid: false, message: 'Token类型无效' });

    const user = await db.get('SELECT token_version FROM users WHERE id = ?', [payload.id]);
    if (!user) return res.json({ success: false, valid: false, message: '用户不存在' });

    const currentVersion = parseInt(user.token_version, 10) || 1;
    const tokenVersion = parseInt(payload.tokenVersion, 10) || 1;
    if (tokenVersion !== currentVersion) return res.json({ success: false, valid: false, message: '密码已更改，请重新验证', reason: 'password_changed' });

    res.json({ success: true, valid: true });
  } catch (err) {
    const reason = err.name === 'TokenExpiredError' ? 'expired' : 'invalid';
    res.json({ success: false, valid: false, message: err.name === 'TokenExpiredError' ? 'Token已过期' : 'Token无效', reason });
  }
});

module.exports = router;
