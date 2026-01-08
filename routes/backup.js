const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const unzipper = require('unzipper');
const crypto = require('crypto');
const authMiddleware = require('./authMiddleware');
const { generateBackupSignature, verifyBackupSignature, encryptWebDAVConfig, decryptWebDAVConfig } = require('../utils/crypto');
const multer = require('multer');
const { backupLimiter, validateUrl } = require('../middleware/security');
const db = require('../db');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const isPathSafe = (base, target) => path.resolve(target).startsWith(path.resolve(base));
const isSafeFilename = (f) => /^[a-zA-Z0-9\u4e00-\u9fa5_-]+\.zip$/.test(f) && !f.includes('..');

function validateBackupFile(filename, res) {
  if (!isSafeFilename(filename)) return res.status(400).json({ success: false, message: '无效的文件名' }) && null;
  const filePath = path.join(BACKUP_DIR, filename);
  if (!isPathSafe(BACKUP_DIR, filePath) || !fs.existsSync(filePath)) return res.status(404).json({ success: false, message: '备份文件不存在' }) && null;
  return filePath;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, BACKUP_DIR),
  filename: (req, file, cb) => {
    let name = file.originalname;
    if (!name.endsWith('.zip')) return cb(new Error('仅支持 .zip 格式'));
    if (fs.existsSync(path.join(BACKUP_DIR, name))) name = name.replace('.zip', `-${Date.now()}.zip`);
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

// 计算 ZIP 内容哈希
async function calculateZipHash(filePath) {
  const directory = await unzipper.Open.file(filePath);
  const hash = crypto.createHash('sha256');
  const files = directory.files.filter(f => f.path !== '.backup-signature' && f.type === 'File').sort((a, b) => a.path.localeCompare(b.path));
  for (const f of files) { hash.update(f.path); hash.update(await f.buffer()); }
  return hash.digest();
}

router.post('/create', authMiddleware, backupLimiter, async (req, res) => {
  try {
    const { name, description } = req.body;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const safeName = (name || 'backup').trim().replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').slice(0, 50);
    const backupPath = path.join(BACKUP_DIR, `${safeName}-${ts}.zip`);
    
    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    output.on('close', async () => {
      try {
        const digest = await calculateZipHash(backupPath);
        const signature = generateBackupSignature(digest);
        if (signature) {
          const AdmZip = require('adm-zip');
          const zip = new AdmZip(backupPath);
          zip.addFile('.backup-signature', Buffer.from(signature, 'utf-8'));
          zip.writeZip(backupPath);
          fs.writeFileSync(backupPath.replace('.zip', '.sig'), signature);
        }
        const size = (fs.statSync(backupPath).size / 1048576).toFixed(2);
        res.json({ success: true, backup: { name: path.basename(backupPath), size: `${size} MB`, timestamp: new Date().toISOString(), signed: !!signature } });
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    });

    archive.pipe(output);
    ['database', 'config', 'uploads'].forEach(dir => {
      const p = path.join(__dirname, '..', dir);
      if (fs.existsSync(p)) archive.directory(dir, dir);
    });
    if (fs.existsSync(path.join(__dirname, '..', '.env'))) archive.file(path.join(__dirname, '..', '.env'), { name: '.env' });
    archive.append(JSON.stringify({ timestamp: new Date().toISOString(), version: '1.0.0', name, description }, null, 2), { name: 'backup-info.json' });
    archive.finalize();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/list', authMiddleware, async (req, res) => {
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.zip')).map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { name: f, size: `${(stat.size / 1048576).toFixed(2)} MB`, created: stat.birthtime.toISOString(), signed: fs.existsSync(path.join(BACKUP_DIR, f.replace('.zip', '.sig'))) };
    }).sort((a, b) => new Date(b.created) - new Date(a.created));
    res.json({ success: true, backups: files });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/download/:filename', (req, res, next) => {
  const token = req.headers.authorization?.slice(7) || req.query.token;
  if (!token) return res.status(401).json({ success: false, message: '未提供Token' });
  req.headers.authorization = `Bearer ${token}`;
  authMiddleware(req, res, next);
}, (req, res) => {
  const filePath = validateBackupFile(req.params.filename, res);
  if (filePath) res.download(filePath);
});

router.delete('/delete/:filename', authMiddleware, (req, res) => {
  const filePath = validateBackupFile(req.params.filename, res);
  if (!filePath) return;
  fs.unlinkSync(filePath);
  const sig = filePath.replace('.zip', '.sig');
  if (fs.existsSync(sig)) fs.unlinkSync(sig);
  res.json({ success: true });
});

router.post('/upload', authMiddleware, backupLimiter, upload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: '未选择文件' });
  try {
    const digest = await calculateZipHash(req.file.path);
    const directory = await unzipper.Open.file(req.file.path);
    const sigFile = directory.files.find(f => f.path === '.backup-signature');
    if (!sigFile) { fs.unlinkSync(req.file.path); return res.status(403).json({ success: false, message: '备份无签名' }); }
    
    const signature = (await sigFile.buffer()).toString().trim();
    if (!verifyBackupSignature(digest, signature)) {
      const secretFile = directory.files.find(f => f.path === 'config/.crypto-secret');
      if (secretFile && verifyBackupSignature(digest, signature, (await secretFile.buffer()).toString().trim())) {
        return res.json({ success: true, backup: { name: req.file.filename, size: `${(req.file.size / 1048576).toFixed(2)} MB`, warning: '跨服务器备份验证通过' } });
      }
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ success: false, message: '签名验证失败' });
    }
    res.json({ success: true, backup: { name: req.file.filename, size: `${(req.file.size / 1048576).toFixed(2)} MB` } });
  } catch (err) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/restore/:filename', authMiddleware, backupLimiter, async (req, res) => {
  const filePath = validateBackupFile(req.params.filename, res);
  if (!filePath) return;
  try {
    const tempDir = path.join(__dirname, '..', `temp-restore-${Date.now()}`);
    fs.mkdirSync(tempDir);
    await fs.createReadStream(filePath).pipe(unzipper.Extract({ path: tempDir })).promise();
    
    const items = fs.readdirSync(tempDir);
    const allowed = ['database', 'config', '.env', 'backup-info.json', 'uploads'];
    if (items.some(it => !allowed.includes(it))) throw new Error('非法备份内容');

    db.close();
    items.forEach(it => {
      if (it === 'backup-info.json' || (it === '.env' && req.body.skipEnv !== false)) return;
      const src = path.join(tempDir, it), dst = path.join(__dirname, '..', it);
      if (it === 'config') {
        fs.readdirSync(src).forEach(f => { if (!['.jwt-secret', '.webdav-config.json'].includes(f)) fs.cpSync(path.join(src, f), path.join(dst, f), { recursive: true }); });
      } else {
        fs.cpSync(src, dst, { recursive: true });
      }
    });

    fs.rmSync(tempDir, { recursive: true, force: true });
    res.json({ success: true, message: '恢复成功，系统正在重启' });
    setImmediate(async () => { 
      await db.reconnect(); 
      const { initCryptoSecret } = require('../utils/crypto');
      await initCryptoSecret();
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
