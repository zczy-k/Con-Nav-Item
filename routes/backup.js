const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const unzipper = require('unzipper');
const authMiddleware = require('./authMiddleware');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const { createClient } = require('webdav');
const { encryptWebDAVConfig, decryptWebDAVConfig, generateBackupSignature, verifyBackupSignature } = require('../utils/crypto');
const multer = require('multer');
const { backupLimiter, validateUrl } = require('../middleware/security');

// 安全的路径验证函数
function isPathSafe(basePath, targetPath) {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedBase);
}

// 安全的文件名验证
function isSafeFilename(filename) {
  // 只允许字母、数字、连字符、下划线和.zip扩展名
  return /^[a-zA-Z0-9_-]+\.zip$/.test(filename) && !filename.includes('..');
}

// 提取的公共函数：验证备份文件
function validateBackupFile(filename, res) {
  // 验证文件名安全性
  if (!isSafeFilename(filename)) {
    res.status(400).json({
      success: false,
      message: '无效的文件名'
    });
    return null;
  }
  
  const backupDir = path.join(__dirname, '..', 'backups');
  const filePath = path.join(backupDir, filename);
  
  // 验证路径安全性
  if (!isPathSafe(backupDir, filePath)) {
    res.status(403).json({
      success: false,
      message: '禁止访问'
    });
    return null;
  }
  
  if (!fs.existsSync(filePath)) {
    res.status(404).json({
      success: false,
      message: '备份文件不存在'
    });
    return null;
  }
  
  return filePath;
}

// 配置multer用于文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    cb(null, backupDir);
  },
  filename: (req, file, cb) => {
    // 保持原文件名，但确保是.zip文件
    const originalName = file.originalname;
    if (!originalName.endsWith('.zip')) {
      return cb(new Error('只支持.zip格式的备份文件'));
    }
    // 如果文件名已存在，添加时间戳
    const backupDir = path.join(__dirname, '..', 'backups');
    let filename = originalName;
    if (fs.existsSync(path.join(backupDir, filename))) {
      const timestamp = Date.now();
      filename = originalName.replace('.zip', `-${timestamp}.zip`);
    }
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 限制500MB
  },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.endsWith('.zip')) {
      return cb(new Error('只支持.zip格式的备份文件'), false);
    }
    cb(null, true);
  }
});

// 创建备份
router.post('/create', authMiddleware, backupLimiter, async (req, res) => {
  try {
    const { name, description } = req.body;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    
    // 支持自定义名称，如果提供则使用，否则使用时间戳
    let backupName;
    if (name && name.trim()) {
      // 清理文件名，只保留安全字符
      const safeName = name.trim().replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').slice(0, 50);
      backupName = `${safeName}-${timestamp}`;
    } else {
      backupName = `backup-${timestamp}`;
    }
    
    const backupDir = path.join(__dirname, '..', 'backups');
    
    // 确保备份目录存在
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const backupPath = path.join(backupDir, `${backupName}.zip`);
    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });
    
    output.on('close', () => {
      // 确保文件完全写入并刷新文件系统缓存
      setImmediate(() => {
        try {
          // 强制同步文件系统
          const fd = fs.openSync(backupPath, 'r');
          fs.fsyncSync(fd);
          fs.closeSync(fd);
          
          // 生成备份签名
          const backupData = fs.readFileSync(backupPath);
          const signature = generateBackupSignature(backupData);
          const sigPath = backupPath.replace('.zip', '.sig');
          fs.writeFileSync(sigPath, signature);
          
          const stats = fs.statSync(backupPath);
          const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
          
          res.json({
            success: true,
            message: '备份创建成功',
            backup: {
              name: `${backupName}.zip`,
              path: backupPath,
              size: `${sizeInMB} MB`,
              timestamp: new Date().toISOString(),
              signed: true
            }
          });
        } catch (err) {
          console.error('备份后处理失败:', err);
          const stats = fs.statSync(backupPath);
          const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
          
          res.json({
            success: true,
            message: '备份创建成功（签名生成失败）',
            backup: {
              name: `${backupName}.zip`,
              path: backupPath,
              size: `${sizeInMB} MB`,
              timestamp: new Date().toISOString(),
              signed: false
            }
          });
        }
      });
    });
    
    archive.on('error', (err) => {
      throw err;
    });
    
    archive.pipe(output);
    
    // 备份数据库
    const databaseDir = path.join(__dirname, '..', 'database');
    if (fs.existsSync(databaseDir)) {
      archive.directory(databaseDir, 'database');
    }
    
    // 备份 config 目录（包含自动备份配置、WebDAV配置等）
    const configDir = path.join(__dirname, '..', 'config');
    if (fs.existsSync(configDir)) {
      archive.directory(configDir, 'config');
    }
    
    // 备份环境配置
    const envFile = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envFile)) {
      archive.file(envFile, { name: '.env' });
    }
    
    // 创建备份信息文件
    const backupInfo = {
      timestamp: new Date().toISOString(),
      version: require('../package.json').version || '1.0.0',
      name: name || null,
      description: description || '数据库、配置文件和 WebDAV 配置备份'
    };
    archive.append(JSON.stringify(backupInfo, null, 2), { name: 'backup-info.json' });
    
    await archive.finalize();
    
  } catch (error) {
    console.error('备份创建失败:', error);
    res.status(500).json({
      success: false,
      message: '备份创建失败',
      error: error.message
    });
  }
});

// 获取备份列表
router.get('/list', authMiddleware, (req, res) => {
  try {
    const backupDir = path.join(__dirname, '..', 'backups');
    
    if (!fs.existsSync(backupDir)) {
      return res.json({
        success: true,
        backups: []
      });
    }
    
    const files = fs.readdirSync(backupDir)
      .filter(file => file.endsWith('.zip'))
      .map(file => {
        const filePath = path.join(backupDir, file);
        const sigPath = filePath.replace('.zip', '.sig');
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: `${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
          created: stats.birthtime.toISOString(),
          modified: stats.mtime.toISOString(),
          signed: fs.existsSync(sigPath)
        };
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created));
    
    res.json({
      success: true,
      backups: files
    });
    
  } catch (error) {
    console.error('获取备份列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取备份列表失败',
      error: error.message
    });
  }
});

// 下载备份
router.get('/download/:filename', (req, res, next) => {
  if (req.headers.authorization) {
    return authMiddleware(req, res, next);
  }
  if (req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
    return authMiddleware(req, res, next);
  }
  return res.status(401).json({ success: false, message: '未提供Token' });
}, (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = validateBackupFile(filename, res);
    if (!filePath) return;
    
    res.download(filePath, filename);
    
  } catch (error) {
    console.error('下载备份失败:', error);
    res.status(500).json({
      success: false,
      message: '下载备份失败',
      error: error.message
    });
  }
});

// 删除备份
router.delete('/delete/:filename', authMiddleware, (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = validateBackupFile(filename, res);
    if (!filePath) return;
    
    fs.unlinkSync(filePath);
    
    // 同时删除签名文件（如果存在）
    const sigPath = filePath.replace('.zip', '.sig');
    if (fs.existsSync(sigPath)) {
      fs.unlinkSync(sigPath);
    }
    
    res.json({
      success: true,
      message: '备份删除成功'
    });
    
  } catch (error) {
    console.error('删除备份失败:', error);
    res.status(500).json({
      success: false,
      message: '删除备份失败',
      error: error.message
    });
  }
});

// 重命名备份
router.put('/rename/:filename', authMiddleware, (req, res) => {
  try {
    const { filename } = req.params;
    const { newName } = req.body;
    
    if (!newName || !newName.trim()) {
      return res.status(400).json({
        success: false,
        message: '请提供新的备份名称'
      });
    }
    
    const filePath = validateBackupFile(filename, res);
    if (!filePath) return;
    
    const backupDir = path.join(__dirname, '..', 'backups');
    
    // 清理新文件名，只保留安全字符
    const safeName = newName.trim().replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').slice(0, 50);
    const newFilename = safeName.endsWith('.zip') ? safeName : `${safeName}.zip`;
    const newFilePath = path.join(backupDir, newFilename);
    
    // 检查新文件名是否已存在
    if (fs.existsSync(newFilePath) && newFilePath !== filePath) {
      return res.status(400).json({
        success: false,
        message: '该名称已存在，请使用其他名称'
      });
    }
    
    // 重命名文件
    fs.renameSync(filePath, newFilePath);
    
    // 同时重命名签名文件（如果存在）
    const sigPath = filePath.replace('.zip', '.sig');
    if (fs.existsSync(sigPath)) {
      const newSigPath = newFilePath.replace('.zip', '.sig');
      fs.renameSync(sigPath, newSigPath);
    }
    
    res.json({
      success: true,
      message: '备份重命名成功',
      newName: newFilename
    });
    
  } catch (error) {
    console.error('重命名备份失败:', error);
    res.status(500).json({
      success: false,
      message: '重命名备份失败',
      error: error.message
    });
  }
});

// 上传备份文件
router.post('/upload', authMiddleware, backupLimiter, upload.single('backup'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请选择备份文件'
      });
    }

    const stats = fs.statSync(req.file.path);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

    res.json({
      success: true,
      message: '备份文件上传成功',
      backup: {
        name: req.file.filename,
        size: `${sizeInMB} MB`,
        path: req.file.path
      }
    });
  } catch (error) {
    console.error('上传备份失败:', error);
    res.status(500).json({
      success: false,
      message: '上传备份失败',
      error: error.message
    });
  }
});

// 恢复备份
router.post('/restore/:filename', authMiddleware, backupLimiter, async (req, res) => {
  try {
    const { filename } = req.params;
    const { skipEnv = true, skipSignatureCheck = false } = req.body; // 默认跳过.env文件
    const filePath = validateBackupFile(filename, res);
    if (!filePath) return;

    // 验证备份签名（如果存在签名文件）
    const sigPath = filePath.replace('.zip', '.sig');
    if (fs.existsSync(sigPath) && !skipSignatureCheck) {
      const backupData = fs.readFileSync(filePath);
      const signature = fs.readFileSync(sigPath, 'utf-8').trim();
      try {
        if (!verifyBackupSignature(backupData, signature)) {
          return res.status(400).json({
            success: false,
            message: '备份文件签名验证失败，文件可能已被篡改',
            requireConfirm: true
          });
        }
      } catch (sigError) {
        return res.status(400).json({
          success: false,
          message: '备份文件签名验证失败: ' + sigError.message,
          requireConfirm: true
        });
      }
    }

    const projectRoot = path.join(__dirname, '..');
    const preRestoreBackupDir = path.join(__dirname, '..', 'backups', 'pre-restore');
    
    // 0. 恢复前自动备份当前关键配置
    if (!fs.existsSync(preRestoreBackupDir)) {
      fs.mkdirSync(preRestoreBackupDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const preRestoreFiles = [];
    
    // 备份当前.env文件
    const envPath = path.join(projectRoot, '.env');
    if (fs.existsSync(envPath)) {
      const backupEnvPath = path.join(preRestoreBackupDir, `.env.pre-restore-${timestamp}`);
      fs.copyFileSync(envPath, backupEnvPath);
      preRestoreFiles.push('.env');
    }
    
    // 备份当前JWT密钥
    const jwtSecretPath = path.join(projectRoot, 'config', '.jwt-secret');
    if (fs.existsSync(jwtSecretPath)) {
      const backupJwtPath = path.join(preRestoreBackupDir, `.jwt-secret.pre-restore-${timestamp}`);
      fs.copyFileSync(jwtSecretPath, backupJwtPath);
      preRestoreFiles.push('config/.jwt-secret');
    }
    
    if (preRestoreFiles.length > 0) {
      console.log(`✓ 恢复前已备份关键配置: ${preRestoreFiles.join(', ')}`);
    }

    // 1. 解压到临时目录
    const tempDir = path.join(__dirname, '..', `temp-restore-${Date.now()}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
    
    const stream = fs.createReadStream(filePath);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('解压超时（30秒）'));
      }, 30000);
      
      stream.pipe(unzipper.Extract({ path: tempDir }))
        .on('finish', () => {
          clearTimeout(timeout);
          resolve();
        })
        .on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
    });

    // 2. 覆盖文件（保护关键配置）
    const backupContents = fs.readdirSync(tempDir);
    const skippedFiles = [];
    const restoredFiles = [];

    for (const item of backupContents) {
      const sourcePath = path.join(tempDir, item);
      
      // 忽略 backup-info.json
      if (item === 'backup-info.json') {
        continue;
      }
      
      // 保护.env文件（默认跳过，除非明确要求恢复）
      if (item === '.env' && skipEnv) {
        skippedFiles.push('.env (保护当前环境配置)');
        continue;
      }
      
      const destPath = path.join(projectRoot, item);
      
      if (fs.statSync(sourcePath).isDirectory()) {
        // 特殊处理config目录，保护.jwt-secret
        if (item === 'config') {
          if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
          }
          // 逐个复制config目录中的文件，跳过.jwt-secret
          const configFiles = fs.readdirSync(sourcePath);
          for (const configFile of configFiles) {
            if (configFile === '.jwt-secret') {
              skippedFiles.push('config/.jwt-secret (保护当前JWT密钥)');
              continue;
            }
            const srcFile = path.join(sourcePath, configFile);
            const destFile = path.join(destPath, configFile);
            if (fs.statSync(srcFile).isDirectory()) {
              fs.cpSync(srcFile, destFile, { recursive: true });
            } else {
              fs.copyFileSync(srcFile, destFile);
            }
            restoredFiles.push(`config/${configFile}`);
          }
          continue;
        }
        
        // 其他目录正常恢复
        if (fs.existsSync(destPath)) {
          fs.rmSync(destPath, { recursive: true, force: true });
        }
        fs.cpSync(sourcePath, destPath, { recursive: true });
        restoredFiles.push(`${item}/`);
      } else {
        fs.copyFileSync(sourcePath, destPath);
        restoredFiles.push(item);
      }
    }

    // 3. 清理临时文件
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    // 清理超过7天的pre-restore备份
    try {
      const preRestoreBackups = fs.readdirSync(preRestoreBackupDir);
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const file of preRestoreBackups) {
        const filePath = path.join(preRestoreBackupDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < sevenDaysAgo) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (e) {
      // 清理失败不影响主流程
    }

    // 重新连接数据库，加载恢复后的数据
    try {
      const db = require('../db');
      if (db.reconnect) {
        await db.reconnect();
        console.log('✓ 数据库已重新连接，恢复的数据已生效');
      }
    } catch (e) {
      console.error('数据库重连失败:', e);
    }

    // 清除应用缓存
    try {
      const app = require('../app');
      if (app.clearCache) {
        app.clearCache();
      }
    } catch (e) {
      // 忽略缓存清除失败
    }

    let message = '备份恢复成功！请刷新页面查看最新数据。';
    if (skippedFiles.length > 0) {
      message += ` 已跳过: ${skippedFiles.join(', ')}`;
    }

    res.json({ 
      success: true, 
      message,
      restored: restoredFiles,
      skipped: skippedFiles,
      preRestoreBackup: preRestoreFiles.length > 0 ? `backups/pre-restore/*-${timestamp}` : null
    });

  } catch (error) {
    console.error('恢复备份失败:', error);
    
    // 清理可能残留的临时目录
    try {
      const tempDirs = fs.readdirSync(path.join(__dirname, '..'))
        .filter(name => name.startsWith('temp-restore-'));
      for (const dir of tempDirs) {
        const dirPath = path.join(__dirname, '..', dir);
        if (fs.existsSync(dirPath)) {
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
      }
    } catch (cleanupError) {
      // 忽略清理失败
    }
    
    res.status(500).json({ 
      success: false, 
      message: '恢复备份失败: ' + error.message, 
      error: error.message 
    });
  }
});

// ==================== WebDAV备份功能 ====================

// WebDAV配置文件路径（存储在项目config目录，便于备份和管理）
const getWebDAVConfigPath = () => {
  return path.join(__dirname, '..', 'config', '.webdav-config.json');
};

// 保存WebDAV配置
router.post('/webdav/config', authMiddleware, async (req, res) => {
  try {
    const { url, username, password } = req.body;
    
    if (!url || !username) {
      return res.status(400).json({ 
        success: false, 
        message: 'URL和用户名不能为空' 
      });
    }
    
    // 验证URL格式和协议
    const urlValidation = validateUrl(url);
    if (!urlValidation.valid) {
      return res.status(400).json({ 
        success: false, 
        message: urlValidation.message 
      });
    }
    
    const configPath = getWebDAVConfigPath();
    let finalPassword = password;
    
    // 如果密码为空且已有配置，保持原密码
    if (!password && fs.existsSync(configPath)) {
      try {
        const existingEncryptedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const existingConfig = decryptWebDAVConfig(existingEncryptedConfig);
        if (existingConfig && existingConfig.password) {
          finalPassword = existingConfig.password;
        } else {
          return res.status(400).json({ 
            success: false, 
            message: '密码不能为空' 
          });
        }
      } catch (e) {
        return res.status(400).json({ 
          success: false, 
          message: '密码不能为空' 
        });
      }
    } else if (!password) {
      return res.status(400).json({ 
        success: false, 
        message: '密码不能为空' 
      });
    }
    
    // 测试WebDAV连接
    try {
      const client = createClient(url, { username, password: finalPassword });
      await client.getDirectoryContents('/');
    } catch (error) {
      return res.status(400).json({ 
        success: false, 
        message: 'WebDAV连接失败，请检查配置: ' + error.message 
      });
    }
    
    // 加密并保存配置
    const encryptedConfig = encryptWebDAVConfig({ url, username, password: finalPassword });
    
    fs.writeFileSync(
      configPath, 
      JSON.stringify(encryptedConfig, null, 2),
      { mode: 0o600 }
    );
    
    res.json({ success: true, message: 'WebDAV配置保存成功' });
    
  } catch (error) {
    console.error('WebDAV配置失败:', error);
    res.status(500).json({ 
      success: false, 
      message: 'WebDAV配置失败', 
      error: error.message 
    });
  }
});

// 获取WebDAV配置状态
router.get('/webdav/config', authMiddleware, (req, res) => {
  try {
    const configPath = getWebDAVConfigPath();
    
    if (!fs.existsSync(configPath)) {
      return res.json({ 
        success: true, 
        config: { configured: false } 
      });
    }
    
    const encryptedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    // 只返回非敏感信息
    res.json({ 
      success: true, 
      config: {
        configured: true,
        url: encryptedConfig.url,
        username: encryptedConfig.username
      }
    });
    
  } catch (error) {
    console.error('获取WebDAV配置失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '获取WebDAV配置失败', 
      error: error.message 
    });
  }
});

// 备份到WebDAV
router.post('/webdav/backup', authMiddleware, async (req, res) => {
  try {
    // 1. 读取配置
    const configPath = getWebDAVConfigPath();
    if (!fs.existsSync(configPath)) {
      return res.status(400).json({ 
        success: false, 
        message: '请先配置WebDAV' 
      });
    }
    
    const encryptedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const config = decryptWebDAVConfig(encryptedConfig);
    
    if (!config) {
      return res.status(500).json({ 
        success: false, 
        message: '配置解密失败' 
      });
    }
    
    // 2. 创建本地备份
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupName = `backup-${timestamp}.zip`;
    const backupDir = path.join(__dirname, '..', 'backups');
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const backupPath = path.join(backupDir, backupName);
    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    await new Promise((resolve, reject) => {
      output.on('close', () => {
        // 确保文件完全写入
        setImmediate(() => {
          try {
            const fd = fs.openSync(backupPath, 'r');
            fs.fsyncSync(fd);
            fs.closeSync(fd);
            
            // 生成备份签名
            const backupData = fs.readFileSync(backupPath);
            const signature = generateBackupSignature(backupData);
            const sigPath = backupPath.replace('.zip', '.sig');
            fs.writeFileSync(sigPath, signature);
            
            resolve();
          } catch (err) {
            console.error('WebDAV备份文件处理失败:', err);
            resolve(); // 即使失败也继续
          }
        });
      });
      archive.on('error', reject);
      archive.pipe(output);
      
      const databaseDir = path.join(__dirname, '..', 'database');
      if (fs.existsSync(databaseDir)) {
        archive.directory(databaseDir, 'database');
      }
      
      // 备份 config 目录（包含自动备份配置、WebDAV配置等）
      const configDir = path.join(__dirname, '..', 'config');
      if (fs.existsSync(configDir)) {
        archive.directory(configDir, 'config');
      }
      
      const envFile = path.join(__dirname, '..', '.env');
      if (fs.existsSync(envFile)) {
        archive.file(envFile, { name: '.env' });
      }
      
      const backupInfo = {
        timestamp: new Date().toISOString(),
        version: require('../package.json').version || '1.0.0',
        type: 'webdav',
        description: '数据库、配置文件和 WebDAV 配置备份'
      };
      archive.append(JSON.stringify(backupInfo, null, 2), { name: 'backup-info.json' });
      
      archive.finalize();
    });
    
    // 3. 上传到WebDAV
    const client = createClient(config.url, {
      username: config.username,
      password: config.password
    });
    
    // 确保备份目录存在
    const remotePath = '/Con-Nav-Item-Backups';
    try {
      await client.createDirectory(remotePath);
    } catch (e) {
      // 目录可能已存在，忽略错误
    }
    
    // 上传文件
    const fileBuffer = fs.readFileSync(backupPath);
    const remoteFilePath = `${remotePath}/${backupName}`;
    await client.putFileContents(remoteFilePath, fileBuffer);
    
    const stats = fs.statSync(backupPath);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    res.json({ 
      success: true, 
      message: '备份到WebDAV成功',
      backup: {
        name: backupName,
        size: `${sizeInMB} MB`,
        remotePath: remoteFilePath
      }
    });
    
  } catch (error) {
    console.error('备份到WebDAV失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '备份到WebDAV失败', 
      error: error.message 
    });
  }
});

// 获取WebDAV备份列表
router.get('/webdav/list', authMiddleware, async (req, res) => {
  try {
    const configPath = getWebDAVConfigPath();
    if (!fs.existsSync(configPath)) {
      return res.json({ success: true, backups: [] });
    }
    
    const encryptedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const config = decryptWebDAVConfig(encryptedConfig);
    
    if (!config) {
      return res.status(500).json({ 
        success: false, 
        message: '配置解密失败' 
      });
    }
    
    const client = createClient(config.url, {
      username: config.username,
      password: config.password
    });
    
    const remotePath = '/Con-Nav-Item-Backups';
    
    try {
      const contents = await client.getDirectoryContents(remotePath);
      
      const backups = contents
        .filter(item => item.type === 'file' && item.filename.endsWith('.zip'))
        .map(item => ({
          name: path.basename(item.filename),
          size: `${(item.size / (1024 * 1024)).toFixed(2)} MB`,
          created: item.lastmod,
          remotePath: item.filename
        }))
        .sort((a, b) => new Date(b.created) - new Date(a.created));
      
      res.json({ success: true, backups });
    } catch (error) {
      if (error.status === 404) {
        return res.json({ success: true, backups: [] });
      }
      throw error;
    }
    
  } catch (error) {
    console.error('获取WebDAV备份列表失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '获取WebDAV备份列表失败', 
      error: error.message 
    });
  }
});

// 从WebDAV恢复备份
router.post('/webdav/restore', authMiddleware, async (req, res) => {
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({ 
        success: false, 
        message: '请指定要恢复的备份文件' 
      });
    }
    
    // 读取配置
    const configPath = getWebDAVConfigPath();
    if (!fs.existsSync(configPath)) {
      return res.status(400).json({ 
        success: false, 
        message: '请先配置WebDAV' 
      });
    }
    
    const encryptedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const config = decryptWebDAVConfig(encryptedConfig);
    
    if (!config) {
      return res.status(500).json({ 
        success: false, 
        message: '配置解密失败' 
      });
    }
    
    // 从WebDAV下载备份
    const client = createClient(config.url, {
      username: config.username,
      password: config.password
    });
    
    const remotePath = `/Con-Nav-Item-Backups/${filename}`;
    const fileBuffer = await client.getFileContents(remotePath);
    
    const { skipEnv = true } = req.body; // 默认跳过.env文件
    const projectRoot = path.join(__dirname, '..');
    const preRestoreBackupDir = path.join(__dirname, '..', 'backups', 'pre-restore');
    
    // 0. 恢复前自动备份当前关键配置
    if (!fs.existsSync(preRestoreBackupDir)) {
      fs.mkdirSync(preRestoreBackupDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const preRestoreFiles = [];
    
    // 备份当前.env文件
    const envPath = path.join(projectRoot, '.env');
    if (fs.existsSync(envPath)) {
      const backupEnvPath = path.join(preRestoreBackupDir, `.env.pre-restore-${timestamp}`);
      fs.copyFileSync(envPath, backupEnvPath);
      preRestoreFiles.push('.env');
    }
    
    // 备份当前JWT密钥
    const jwtSecretPath = path.join(projectRoot, 'config', '.jwt-secret');
    if (fs.existsSync(jwtSecretPath)) {
      const backupJwtPath = path.join(preRestoreBackupDir, `.jwt-secret.pre-restore-${timestamp}`);
      fs.copyFileSync(jwtSecretPath, backupJwtPath);
      preRestoreFiles.push('config/.jwt-secret');
    }
    
    // 保存到临时文件
    const tempPath = path.join(__dirname, '..', `temp-webdav-${Date.now()}.zip`);
    fs.writeFileSync(tempPath, fileBuffer);
    
    // 解压并恢复
    const tempDir = path.join(__dirname, '..', `temp-restore-${Date.now()}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
    
    const stream = fs.createReadStream(tempPath);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('解压超时（30秒）'));
      }, 30000);
      
      stream.pipe(unzipper.Extract({ path: tempDir }))
        .on('finish', () => {
          clearTimeout(timeout);
          resolve();
        })
        .on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
    });
    
    // 恢复文件（保护关键配置）
    const backupContents = fs.readdirSync(tempDir);
    const skippedFiles = [];
    const restoredFiles = [];
    
    for (const item of backupContents) {
      const sourcePath = path.join(tempDir, item);
      
      // 忽略 backup-info.json
      if (item === 'backup-info.json') {
        continue;
      }
      
      // 保护.env文件
      if (item === '.env' && skipEnv) {
        skippedFiles.push('.env (保护当前环境配置)');
        continue;
      }
      
      const destPath = path.join(projectRoot, item);
      
      if (fs.statSync(sourcePath).isDirectory()) {
        // 特殊处理config目录，保护.jwt-secret
        if (item === 'config') {
          if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
          }
          const configFiles = fs.readdirSync(sourcePath);
          for (const configFile of configFiles) {
            if (configFile === '.jwt-secret') {
              skippedFiles.push('config/.jwt-secret (保护当前JWT密钥)');
              continue;
            }
            const srcFile = path.join(sourcePath, configFile);
            const destFile = path.join(destPath, configFile);
            if (fs.statSync(srcFile).isDirectory()) {
              fs.cpSync(srcFile, destFile, { recursive: true });
            } else {
              fs.copyFileSync(srcFile, destFile);
            }
            restoredFiles.push(`config/${configFile}`);
          }
          continue;
        }
        
        if (fs.existsSync(destPath)) {
          fs.rmSync(destPath, { recursive: true, force: true });
        }
        fs.cpSync(sourcePath, destPath, { recursive: true });
        restoredFiles.push(`${item}/`);
      } else {
        fs.copyFileSync(sourcePath, destPath);
        restoredFiles.push(item);
      }
    }
    
    // 清理临时文件
    fs.unlinkSync(tempPath);
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    // 重新连接数据库，加载恢复后的数据
    try {
      const db = require('../db');
      if (db.reconnect) {
        await db.reconnect();
        console.log('✓ 数据库已重新连接，恢复的数据已生效');
      }
    } catch (e) {
      console.error('数据库重连失败:', e);
    }
    
    // 清除应用缓存
    try {
      const app = require('../app');
      if (app.clearCache) {
        app.clearCache();
      }
    } catch (e) {
      // 忽略缓存清除失败
    }
    
    let message = '从 WebDAV恢复成功！请刷新页面查看最新数据。';
    if (skippedFiles.length > 0) {
      message += ` 已跳过: ${skippedFiles.join(', ')}`;
    }
    
    res.json({ 
      success: true, 
      message,
      restored: restoredFiles,
      skipped: skippedFiles
    });
    
  } catch (error) {
    console.error('从WebDAV恢复失败:', error);
    
    // 清理可能残留的临时文件和目录
    try {
      const tempFiles = fs.readdirSync(path.join(__dirname, '..'))
        .filter(name => name.startsWith('temp-webdav-') || name.startsWith('temp-restore-'));
      for (const file of tempFiles) {
        const filePath = path.join(__dirname, '..', file);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          if (stats.isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(filePath);
          }
        }
      }
    } catch (cleanupError) {
      // 忽略清理失败
    }
    
    res.status(500).json({ 
      success: false, 
      message: '从WebDAV恢复失败: ' + error.message, 
      error: error.message 
    });
  }
});

// ==================== 自动备份配置 ====================

// 获取自动备份配置
router.get('/auto/config', authMiddleware, (req, res) => {
  try {
    const { getConfig, getBackupStats } = require('../utils/autoBackup');
    const config = getConfig();
    const stats = getBackupStats();
    
    res.json({
      success: true,
      config,
      stats
    });
  } catch (error) {
    console.error('获取自动备份配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取配置失败',
      error: error.message
    });
  }
});

// 更新自动备份配置
router.post('/auto/config', authMiddleware, (req, res) => {
  try {
    const { updateConfig } = require('../utils/autoBackup');
    const newConfig = req.body;
    
    // 验证配置
    if (newConfig.debounce) {
      if (newConfig.debounce.delay < 5 || newConfig.debounce.delay > 1440) {
        return res.status(400).json({
          success: false,
          message: '防抖延迟必须在5-1440分钟之间'
        });
      }
      if (newConfig.debounce.keep < 1 || newConfig.debounce.keep > 30) {
        return res.status(400).json({
          success: false,
          message: '增量备份保留数量必须在1-30之间'
        });
      }
    }
    
    if (newConfig.scheduled) {
      if (newConfig.scheduled.hour < 0 || newConfig.scheduled.hour > 23) {
        return res.status(400).json({
          success: false,
          message: '小时必须在0-23之间'
        });
      }
      if (newConfig.scheduled.minute < 0 || newConfig.scheduled.minute > 59) {
        return res.status(400).json({
          success: false,
          message: '分钟必须在0-59之间'
        });
      }
      if (newConfig.scheduled.keep < 1 || newConfig.scheduled.keep > 30) {
        return res.status(400).json({
          success: false,
          message: '每日备份保留数量必须在1-30之间'
        });
      }
    }
    
    const result = updateConfig(newConfig);
    res.json(result);
  } catch (error) {
    console.error('更新自动备份配置失败:', error);
    res.status(500).json({
      success: false,
      message: '配置更新失败',
      error: error.message
    });
  }
});

// 从 WebDAV删除备份
router.delete('/webdav/delete/:filename', authMiddleware, async (req, res) => {
  try {
    const { filename } = req.params;
    
    const configPath = getWebDAVConfigPath();
    if (!fs.existsSync(configPath)) {
      return res.status(400).json({ 
        success: false, 
        message: '请先配置WebDAV' 
      });
    }
    
    const encryptedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const config = decryptWebDAVConfig(encryptedConfig);
    
    if (!config) {
      return res.status(500).json({ 
        success: false, 
        message: '配置解密失败' 
      });
    }
    
    const client = createClient(config.url, {
      username: config.username,
      password: config.password
    });
    
    const remotePath = `/Con-Nav-Item-Backups/${filename}`;
    await client.deleteFile(remotePath);
    
    res.json({ 
      success: true, 
      message: '备份删除成功' 
    });
    
  } catch (error) {
    console.error('删除WebDAV备份失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '删除WebDAV备份失败', 
      error: error.message 
    });
  }
});

module.exports = router;
