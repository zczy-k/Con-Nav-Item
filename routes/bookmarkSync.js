const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const { createClient } = require('webdav');
const { decryptWebDAVConfig } = require('../utils/crypto');
const { bookmarkSyncLimiter } = require('../middleware/security');

const JWT_SECRET = config.server.jwtSecret;
const BOOKMARKS_DIR = path.join(__dirname, '..', 'backups', 'bookmarks');
const WEBDAV_BOOKMARK_DIR = '/Con-Nav-Item-Backups/bookmarks';

const BACKUP_RETENTION = { auto: 10, daily: 7, weekly: 4, monthly: 3, manual: 20 };
const ALLOWED_BACKUP_TYPES = ['auto', 'daily', 'weekly', 'monthly', 'manual'];
const MAX_BOOKMARKS = 50000;
const MAX_BOOKMARK_DEPTH = 20;

function ensureDir() { if (!fs.existsSync(BOOKMARKS_DIR)) fs.mkdirSync(BOOKMARKS_DIR, { recursive: true }); }

function sanitizeDeviceName(name) {
  if (!name || typeof name !== 'string') return 'unknown';
  return name.replace(/<[^>]*>/g, '').replace(/[<>\"\'&;\\\/\`\$\{\}\[\]\(\)]/g, '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_\-\s]/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').trim().slice(0, 30) || 'unknown';
}

function validateBackupType(type) { return ALLOWED_BACKUP_TYPES.includes(type) ? type : 'manual'; }

function validateBookmarkData(bookmarks, depth = 0) {
  if (!Array.isArray(bookmarks)) return { valid: false, error: '书签数据必须是数组' };
  if (depth > MAX_BOOKMARK_DEPTH) return { valid: false, error: '书签层级过深' };
  let totalCount = 0;
  for (const item of bookmarks) {
    if (typeof item !== 'object' || item === null) return { valid: false, error: '书签项格式无效' };
    if (item.url) {
      try {
        const url = new URL(item.url);
        if (!['http:', 'https:', 'file:', 'ftp:'].includes(url.protocol)) item.url = '';
      } catch (e) { item.url = ''; }
    }
    if (item.title) item.title = item.title.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').slice(0, 500);
    totalCount++;
    if (totalCount > MAX_BOOKMARKS) return { valid: false, error: `书签数量超过限制` };
    if (item.children) {
      const childResult = validateBookmarkData(item.children, depth + 1);
      if (!childResult.valid) return childResult;
      totalCount += childResult.count;
    }
  }
  return { valid: true, count: totalCount };
}

function isValidFilename(filename) { return /^[a-zA-Z0-9\u4e00-\u9fa5_\-\.]+\.json$/.test(filename) && !filename.includes('..'); }

function calculateBookmarkHash(bookmarks) {
  const urls = [];
  const collect = (nodes) => nodes.forEach(n => n.children ? collect(n.children) : n.url && urls.push(n.url));
  collect(bookmarks);
  return crypto.createHash('md5').update(urls.sort().join('|')).digest('hex').slice(0, 16);
}

function getLastBackupHash(deviceName) {
  try {
    ensureDir();
    const safe = sanitizeDeviceName(deviceName);
    const files = fs.readdirSync(BOOKMARKS_DIR).filter(f => f.endsWith('.json') && f.includes(`-${safe}-`)).sort((a, b) => fs.statSync(path.join(BOOKMARKS_DIR, b)).mtimeMs - fs.statSync(path.join(BOOKMARKS_DIR, a)).mtimeMs);
    return files.length ? JSON.parse(fs.readFileSync(path.join(BOOKMARKS_DIR, files[0]), 'utf-8')).contentHash : null;
  } catch { return null; }
}

async function cleanOldBackups(deviceName, type) {
  try {
    ensureDir();
    const keep = BACKUP_RETENTION[type] || 10;
    const device = sanitizeDeviceName(deviceName);
    const files = fs.readdirSync(BOOKMARKS_DIR).filter(f => f.endsWith('.json') && f.includes(device) && f.includes(`-${type}-`)).sort((a, b) => b.localeCompare(a));
    files.slice(keep).forEach(f => { fs.unlinkSync(path.join(BOOKMARKS_DIR, f)); deleteBookmarkFromWebDAV(f).catch(() => {}); });
    return Math.max(0, files.length - keep);
  } catch { return 0; }
}

async function getWebDAVClient() {
  const cfgPath = path.join(__dirname, '..', 'config', '.webdav-config.json');
  if (!fs.existsSync(cfgPath)) return null;
  try {
    const cfg = decryptWebDAVConfig(JSON.parse(fs.readFileSync(cfgPath, 'utf-8')));
    return cfg ? createClient(cfg.url, { username: cfg.username, password: cfg.password }) : null;
  } catch { return null; }
}

async function syncBookmarkToWebDAV(filename, content) {
  try {
    const client = await getWebDAVClient();
    if (!client) return false;
    try { await client.createDirectory('/Con-Nav-Item-Backups'); } catch {}
    try { await client.createDirectory(WEBDAV_BOOKMARK_DIR); } catch {}
    await client.putFileContents(`${WEBDAV_BOOKMARK_DIR}/${filename}`, content);
    return true;
  } catch { return false; }
}

async function deleteBookmarkFromWebDAV(filename) {
  try {
    const client = await getWebDAVClient();
    if (client) await client.deleteFile(`${WEBDAV_BOOKMARK_DIR}/${filename}`);
    return true;
  } catch { return false; }
}

async function flexAuthMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload.type === 'extension') {
        const user = await db.get('SELECT token_version FROM users WHERE id = ?', [payload.id]);
        if (!user) return res.status(401).json({ success: false, message: '用户不存在' });
        if ((parseInt(user.token_version) || 1) !== (parseInt(payload.tokenVersion) || 1)) return res.status(401).json({ success: false, message: '认证过期', reason: 'token_invalid' });
      }
      req.user = payload;
      return next();
    } catch (e) { if (e.name === 'TokenExpiredError') return res.status(401).json({ success: false, message: 'Token过期', reason: 'token_expired' }); }
  }
  const { password } = req.body;
  if (password) {
    const user = await db.get('SELECT * FROM users WHERE id = 1');
    if (user && bcrypt.compareSync(password, user.password)) { req.user = { id: user.id, username: user.username }; return next(); }
    return res.status(401).json({ success: false, message: '密码错误' });
  }
  res.status(401).json({ success: false, message: '请先登录' });
}

router.post('/upload', bookmarkSyncLimiter, flexAuthMiddleware, async (req, res) => {
  try {
    const { bookmarks, skipIfSame = true } = req.body;
    const deviceName = sanitizeDeviceName(req.body.deviceName);
    const type = validateBackupType(req.body.type);
    if (!Array.isArray(bookmarks)) return res.status(400).json({ success: false, message: '无效数据' });
    const validation = validateBookmarkData(bookmarks);
    if (!validation.valid) return res.status(400).json({ success: false, message: validation.error });
    ensureDir();
    const hash = calculateBookmarkHash(bookmarks);
    if (skipIfSame && type !== 'manual' && getLastBackupHash(deviceName) === hash) return res.json({ success: true, message: '无变化', skipped: true });
    
    const filename = generateBackupFilename(deviceName, type);
    const filePath = path.join(BOOKMARKS_DIR, filename);
    let bc = 0, fc = 0;
    const count = (ns) => ns.forEach(n => n.children ? (fc++, count(n.children)) : n.url && bc++);
    count(bookmarks);
    const data = { version: '1.0', type, timestamp: new Date().toISOString(), deviceName, contentHash: hash, stats: { bookmarkCount: bc, folderCount: fc }, bookmarks };
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, content);
    syncBookmarkToWebDAV(filename, content).catch(() => {});
    const cleaned = await cleanOldBackups(deviceName, type);
    res.json({ success: true, message: '备份成功', backup: { filename, type, bookmarkCount: bc, folderCount: fc, contentHash: hash, timestamp: data.timestamp }, cleaned });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/list', async (req, res) => {
  try {
    ensureDir();
    const files = fs.readdirSync(BOOKMARKS_DIR).filter(f => f.endsWith('.json')).map(f => {
      const stats = fs.statSync(path.join(BOOKMARKS_DIR, f));
      try {
        const data = JSON.parse(fs.readFileSync(path.join(BOOKMARKS_DIR, f), 'utf-8'));
        return { filename: f, size: `${(stats.size / 1024).toFixed(2)} KB`, created: stats.birthtime.toISOString(), type: data.type || 'manual', deviceName: data.deviceName, bookmarkCount: data.stats?.bookmarkCount || 0, folderCount: data.stats?.folderCount || 0, contentHash: data.contentHash, backupTime: data.timestamp };
      } catch { return { filename: f, size: '0 KB', created: stats.birthtime.toISOString() }; }
    }).sort((a, b) => new Date(b.created) - new Date(a.created));
    res.json({ success: true, backups: files });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/download/:filename', async (req, res) => {
  try {
    if (!isValidFilename(req.params.filename)) return res.status(400).json({ success: false, message: '无效文件名' });
    const p = path.join(BOOKMARKS_DIR, req.params.filename);
    if (!fs.existsSync(p)) return res.status(404).json({ success: false, message: '不存在' });
    res.json({ success: true, backup: JSON.parse(fs.readFileSync(p, 'utf-8')) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/delete/:filename', flexAuthMiddleware, async (req, res) => {
  try {
    if (!isValidFilename(req.params.filename)) return res.status(400).json({ success: false, message: '无效文件名' });
    const p = path.join(BOOKMARKS_DIR, req.params.filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    res.json({ success: true, message: '已删除' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

function generateBackupFilename(deviceName, type) {
  const now = new Date();
  const d = sanitizeDeviceName(deviceName).slice(0, 20);
  const t = validateBackupType(type);
  let ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
  if (t === 'daily') ts = now.toISOString().slice(0, 10);
  else if (t === 'weekly') ts = `${now.getFullYear()}-W${getWeekNumber(now)}`;
  else if (t === 'monthly') ts = now.toISOString().slice(0, 7);
  return `bookmarks-${d}-${t}-${ts}.json`;
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7);
}

module.exports = router;
