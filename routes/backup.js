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
    
    output.on('close', async () => {
      // 确保文件完全写入并刷新文件系统缓存
      setImmediate(async () => {
        try {
          // 强制同步文件系统
          const fd = fs.openSync(backupPath, 'r');
          fs.fsyncSync(fd);
          fs.closeSync(fd);
          
          let signed = false;
          
          // 使用unzipper读取ZIP内容计算哈希
          const directory = await unzipper.Open.file(backupPath);
          const contentHash = require('crypto').createHash('sha256');
          const sortedFiles = directory.files
            .filter(f => f.path !== '.backup-signature' && f.type === 'File')
            .sort((a, b) => a.path.localeCompare(b.path));
          
          for (const file of sortedFiles) {
            contentHash.update(file.path);
            const fileData = await file.buffer();
            contentHash.update(fileData);
          }
          const contentDigest = contentHash.digest();
          
          // 基于内容哈希生成签名
          const signature = generateBackupSignature(contentDigest);
          
          if (signature) {
            // 使用archiver追加签名文件到ZIP
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(backupPath);
            zip.addFile('.backup-signature', Buffer.from(signature, 'utf-8'));
            zip.writeZip(backupPath);
            signed = true;
            
            // 同时保存外部签名文件（兼容旧版本）
            const sigPath = backupPath.replace('.zip', '.sig');
            fs.writeFileSync(sigPath, signature);
          } else {
            console.warn('⚠️ 无法生成签名: CRYPTO_SECRET未配置');
          }
          
          const stats = fs.statSync(backupPath);
          const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
          
          if (!res.headersSent) {
            res.json({
              success: true,
              message: '备份创建成功',
              backup: {
                name: `${backupName}.zip`,
                path: backupPath,
                size: `${sizeInMB} MB`,
                timestamp: new Date().toISOString(),
                signed
              }
            });
          }
        } catch (err) {
          console.error('备份后处理失败:', err);
          if (!res.headersSent) {
            try {
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
            } catch (e) {
              res.status(500).json({
                success: false,
                message: '备份创建失败: ' + err.message
              });
            }
          }
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
    
    archive.finalize();
    
  } catch (error) {
    console.error('备份创建失败:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: '备份创建失败',
        error: error.message
      });
    }
  }
});

// 获取备份列表
router.get('/list', authMiddleware, async (req, res) => {
  try {
    const backupDir = path.join(__dirname, '..', 'backups');
    
    if (!fs.existsSync(backupDir)) {
      return res.json({
        success: true,
        backups: []
      });
    }
    
    // 异步检查签名状态
    const filesPromises = fs.readdirSync(backupDir)
      .filter(file => file.endsWith('.zip'))
      .map(async file => {
        const filePath = path.join(backupDir, file);
        const stats = fs.statSync(filePath);
        
        // 检查签名：优先检查ZIP内部，其次检查外部.sig文件
        let signed = false;
        try {
          const directory = await unzipper.Open.file(filePath);
          signed = directory.files.some(f => f.path === '.backup-signature');
        } catch (e) {
          // ZIP读取失败，检查外部签名文件
          const sigPath = filePath.replace('.zip', '.sig');
          signed = fs.existsSync(sigPath);
        }
        
        return {
          name: file,
          size: `${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
          created: stats.birthtime.toISOString(),
          modified: stats.mtime.toISOString(),
          signed
        };
      });
    
    const files = (await Promise.all(filesPromises))
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
router.post('/upload', authMiddleware, backupLimiter, upload.single('backup'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请选择备份文件'
      });
    }

    const stats = fs.statSync(req.file.path);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    // 验证上传的备份文件
    let signed = false;
    let signatureValid = false;
    let warning = null;
    
    try {
      const backupData = fs.readFileSync(req.file.path);
      
      // 检查是否是ZIP文件
      if (!backupData.slice(0, 4).equals(Buffer.from([0x50, 0x4B, 0x03, 0x04]))) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          message: '上传的文件不是有效的ZIP格式'
        });
      }
      
      // 检查文件大小限制（防止ZIP炸弹）
      if (stats.size > 500 * 1024 * 1024) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          message: '备份文件过大（超过500MB）'
        });
      }
      
      // 使用unzipper读取ZIP内容并验证签名
      const directory = await unzipper.Open.file(req.file.path);
      const sigFile = directory.files.find(f => f.path === '.backup-signature');
      
      if (sigFile) {
        signed = true;
        const signatureBuffer = await sigFile.buffer();
        const signature = signatureBuffer.toString('utf-8').trim();
        
        try {
          // 计算ZIP内所有文件内容的哈希（不包含签名文件本身）
          const contentHash = require('crypto').createHash('sha256');
          const sortedFiles = directory.files
            .filter(f => f.path !== '.backup-signature' && f.type === 'File')
            .sort((a, b) => a.path.localeCompare(b.path));
          
          for (const file of sortedFiles) {
            contentHash.update(file.path);
            const fileData = await file.buffer();
            contentHash.update(fileData);
          }
          const contentDigest = contentHash.digest();
          
            signatureValid = verifyBackupSignature(contentDigest, signature);
            
            // 如果使用当前密钥验证失败，尝试使用备份文件内部的密钥进行自验证（用于迁移场景）
            if (!signatureValid) {
              const internalSecretFile = directory.files.find(f => f.path === 'config/.crypto-secret');
              if (internalSecretFile) {
                const internalSecret = (await internalSecretFile.buffer()).toString('utf-8').trim();
                if (internalSecret && internalSecret.length >= 32) {
                  signatureValid = verifyBackupSignature(contentDigest, signature, internalSecret);
                  if (signatureValid) {
                    warning = '此备份来自其他服务器，已通过内部密钥验证通过。恢复后将自动切换为备份中的密钥。';
                    console.log(`✓ 备份通过内部密钥验证成功 (迁移模式): ${req.file.originalname}`);
                  }
                }
              }
            }

            if (signatureValid) {
              // 验证成功，清除警告（除非是迁移警告）
              if (!warning) warning = null;
            } else {
              // 签名验证失败，直接拒绝上传
              fs.unlinkSync(req.file.path);
              return res.status(403).json({
                success: false,
                message: '🚫 备份文件签名验证失败！\n\n此备份文件包含签名，但签名验证未通过。可能原因：\n1. 文件在下载后被修改或损坏\n2. 文件来自其他服务器且内部密钥信息缺失\n3. 文件被恶意篡改\n\n为了数据安全，系统拒绝上传此文件。'
              });
            }
        } catch (e) {
          // 签名验证异常，直接拒绝上传
          fs.unlinkSync(req.file.path);
          return res.status(403).json({
            success: false,
            message: '🚫 备份文件签名验证失败\n\n错误详情: ' + e.message + '\n\n可能原因：\n1. 签名格式损坏\n2. 加密密钥不匹配\n3. 文件结构异常\n\n为了数据安全，系统拒绝上传此文件。'
          });
        }
      } else {
        // 未签名的备份，拒绝上传
        fs.unlinkSync(req.file.path);
        return res.status(403).json({
          success: false,
          message: '🚫 备份文件没有签名！\n\n此备份文件不包含签名信息，无法验证其来源和完整性。\n\n可能原因：\n1. 文件不是由本系统创建的\n2. 文件是旧版本备份（不支持签名）\n3. 签名文件被删除\n\n为了数据安全，系统拒绝上传未签名的备份文件。'
        });
      }
    } catch (err) {
      console.error('验证上传文件失败:', err);
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: '🚫 无法验证备份文件\n\n错误详情: ' + err.message
      });
    }

    res.json({
      success: true,
      message: '备份文件上传成功',
      backup: {
        name: req.file.filename,
        size: `${sizeInMB} MB`,
        path: req.file.path,
        signed,
        signatureValid,
        warning
      }
    });
  } catch (error) {
    console.error('上传备份失败:', error);
    
    // 清理上传的文件
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        // 忽略清理失败
      }
    }
    
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
    const { skipEnv = true, forceRestore = false } = req.body; // 默认跳过.env文件
    const filePath = validateBackupFile(filename, res);
    if (!filePath) return;

    // 强制验证备份签名
    let signature = null;
    let contentDigest = null;
    
    // 1. 优先从ZIP内部读取签名（使用unzipper）
    try {
      const directory = await unzipper.Open.file(filePath);
      const sigFile = directory.files.find(f => f.path === '.backup-signature');
      
      if (sigFile) {
        const signatureBuffer = await sigFile.buffer();
        signature = signatureBuffer.toString('utf-8').trim();
        
        // 计算ZIP内所有文件内容的哈希（不包含签名文件本身）
        const contentHash = require('crypto').createHash('sha256');
        const sortedFiles = directory.files
          .filter(f => f.path !== '.backup-signature' && f.type === 'File')
          .sort((a, b) => a.path.localeCompare(b.path));
        
        for (const file of sortedFiles) {
          contentHash.update(file.path);
          const fileData = await file.buffer();
          contentHash.update(fileData);
        }
        contentDigest = contentHash.digest();
      }
    } catch (e) {
      console.warn('无法从ZIP内部读取签名:', e.message);
    }
    
    // 2. 如果ZIP内部没有，尝试读取外部.sig文件（兼容旧版本）
    if (!signature) {
      const sigPath = filePath.replace('.zip', '.sig');
      if (fs.existsSync(sigPath)) {
        signature = fs.readFileSync(sigPath, 'utf-8').trim();
        // 旧版本使用整个ZIP文件计算签名
        contentDigest = fs.readFileSync(filePath);
      }
    }
    
    // 3. 验证签名
    if (!signature) {
      // 没有签名，需要用户确认
      if (!forceRestore) {
        return res.status(400).json({
          success: false,
          message: '⚠️ 此备份文件没有签名，可能不是由本系统创建或已被篡改。是否仍要恢复？',
          code: 'NO_SIGNATURE',
          requireConfirm: true
        });
      }
      console.warn(`⚠️ 用户强制恢复未签名的备份: ${filename}`);
    } else {
        // 有签名，必须验证通过
        try {
          let signatureValid = verifyBackupSignature(contentDigest, signature);
          
          // 如果使用当前密钥验证失败，尝试使用备份文件内部的密钥进行自验证（用于迁移场景）
          if (!signatureValid) {
            const internalSecretFile = directory.files.find(f => f.path === 'config/.crypto-secret');
            if (internalSecretFile) {
              const internalSecret = (await internalSecretFile.buffer()).toString('utf-8').trim();
              if (internalSecret && internalSecret.length >= 32) {
                signatureValid = verifyBackupSignature(contentDigest, signature, internalSecret);
                if (signatureValid) {
                  console.log(`✓ 备份通过内部密钥验证成功 (迁移模式): ${filename}`);
                }
              }
            }
          }

          if (!signatureValid) {
            return res.status(403).json({
              success: false,
              message: '🚫 备份文件签名验证失败！文件已被篡改或来自未知来源，拒绝恢复。',
              code: 'SIGNATURE_INVALID',
              requireConfirm: false
            });
          }
          console.log(`✓ 备份签名验证通过: ${filename}`);
        } catch (sigError) {
        return res.status(403).json({
          success: false,
          message: '🚫 备份文件签名验证失败: ' + sigError.message,
          code: 'SIGNATURE_ERROR',
          requireConfirm: false
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
    
    // 注意：WebDAV配置不再单独备份，因为它会随备份一起恢复
    // 这样可以确保加密的密码与crypto_secret保持一致
    
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

    // 2. 安全验证：检查备份内容
    const backupContents = fs.readdirSync(tempDir);
    
    // 验证备份结构：只允许特定的目录和文件
    const allowedItems = ['database', 'config', '.env', 'backup-info.json'];
    for (const item of backupContents) {
      if (!allowedItems.includes(item)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        return res.status(400).json({
          success: false,
          message: `备份文件包含非法内容: ${item}，恢复已取消`
        });
      }
      
      // 检查路径遍历攻击
      const sourcePath = path.join(tempDir, item);
      if (!isPathSafe(tempDir, sourcePath)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        return res.status(400).json({
          success: false,
          message: '检测到路径遍历攻击，恢复已取消'
        });
      }
    }

    // 3. 覆盖文件（保护关键配置）
    const skippedFiles = [];
    const restoredFiles = [];
    
    // 在恢复数据库之前，先关闭当前数据库连接
    const db = require('../db');
    let dbClosed = false;
    if (backupContents.includes('database')) {
      try {
        // 关闭数据库连接，确保文件可以被安全替换
        await new Promise((resolve, reject) => {
          db.close((err) => {
            if (err) {
              console.warn('关闭数据库连接时出现警告:', err.message);
            }
            dbClosed = true;
            resolve();
          });
        });
      } catch (e) {
        console.warn('关闭数据库连接失败，继续恢复:', e.message);
      }
    }

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
          // 逐个复制config目录中的文件，跳过敏感配置
          const configFiles = fs.readdirSync(sourcePath);
          for (const configFile of configFiles) {
            // 保护JWT密钥
            if (configFile === '.jwt-secret') {
              skippedFiles.push('config/.jwt-secret (保护当前JWT密钥)');
              continue;
            }
            // WebDAV配置随备份一起恢复（因为密码是用备份中的crypto_secret加密的）
            // 不再跳过，确保加密数据与密钥的一致性
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

    // 【关键改动】在发送响应之前，同步完成数据库重连和密钥重新初始化
    // 这样前端收到响应后刷新页面时，后端已经准备好了正确的密钥
    try {
      // 1. 重新连接数据库
      if (dbClosed && db.reconnect) {
        await db.reconnect();
        console.log('✓ 数据库已重新连接');
      }
      
      // 2. 清除加密密钥缓存并重新初始化（确保使用恢复的密钥）
      const { clearCachedSecret, initCryptoSecret } = require('../utils/crypto');
      clearCachedSecret();
      await initCryptoSecret();
      console.log('✓ 加密密钥已重新加载');
      
// 3. 验证 AI 配置是否可用
        let aiActivationResult = null;
        try {
          const { decrypt } = require('../utils/crypto');
          const aiConfig = await db.getAIConfig();
          if (aiConfig.apiKey) {
            const encrypted = JSON.parse(aiConfig.apiKey);
            const decrypted = decrypt(encrypted.encrypted, encrypted.iv, encrypted.authTag);
            if (decrypted) {
              console.log('✓ AI 配置验证成功，正在自动激活...');
              
              // 自动测试并激活 AI 配置
              const { testAndActivateAIConfig } = require('../utils/aiProvider');
              aiActivationResult = await testAndActivateAIConfig();
              
              if (aiActivationResult.success) {
                console.log(`✓ ${aiActivationResult.message}`);
              } else {
                console.warn(`⚠️ AI 自动激活失败: ${aiActivationResult.message}`);
              }
            } else {
              console.warn('⚠️ AI 配置 API Key 解密失败，可能需要重新配置');
            }
          }
        } catch (e) {
          console.warn('⚠️ AI 配置验证失败:', e.message);
        }
      
      // 4. 清除应用缓存
      try {
        const app = require('../app');
        if (app.clearCache) {
          app.clearCache();
        }
      } catch (e) {
        // 忽略缓存清除失败
      }
      } catch (e) {
        console.error('恢复后初始化失败:', e.message);
        // 即使初始化失败，也继续返回成功（数据已恢复，只是密钥可能需要重新配置）
      }

      // 恢复完成后，广播数据变更通知，让所有客户端刷新
      try {
        const { notifyDataChange } = require('../utils/autoBackup');
        await notifyDataChange(null, { type: 'backup_restored' });
} catch (e) {
          console.warn('广播恢复通知失败:', e.message);
        }

        let message = '备份恢复成功！';
      if (skippedFiles.length > 0) {
        message += ` 已跳过: ${skippedFiles.join(', ')}`;
      }
      
      // 添加 AI 激活状态信息
      if (aiActivationResult) {
        if (aiActivationResult.success) {
          message += ` AI 服务已自动激活。`;
        } else if (aiActivationResult.reason !== 'no_config') {
          message += ` AI 自动激活失败，请手动检查配置。`;
        }
      }

      // 所有初始化完成后，再发送响应
      res.json({ 
        success: true, 
        message,
        restored: restoredFiles,
        skipped: skippedFiles,
        preRestoreBackup: preRestoreFiles.length > 0 ? `backups/pre-restore/*-${timestamp}` : null,
        needReload: true,
        checkAIConfig: aiActivationResult ? !aiActivationResult.success : true,
        aiActivation: aiActivationResult
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
        message: '请先配置WebDAV',
        needReconfigure: true
      });
    }
    
    let encryptedConfig;
    try {
      encryptedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      // 配置文件损坏，删除并提示重新配置
      fs.unlinkSync(configPath);
      return res.status(400).json({ 
        success: false, 
        message: '配置文件损坏，请重新配置WebDAV',
        needReconfigure: true
      });
    }
    
    const config = decryptWebDAVConfig(encryptedConfig);
    
    if (!config) {
      // 解密失败（可能是密钥变更），删除旧配置并提示重新配置
      fs.unlinkSync(configPath);
      return res.status(400).json({ 
        success: false, 
        message: '加密密钥已变更，请重新配置WebDAV',
        needReconfigure: true
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
        setImmediate(async () => {
          try {
            const fd = fs.openSync(backupPath, 'r');
            fs.fsyncSync(fd);
            fs.closeSync(fd);
            
            // 使用unzipper读取ZIP内容计算哈希
            const directory = await unzipper.Open.file(backupPath);
            const contentHash = require('crypto').createHash('sha256');
            const sortedFiles = directory.files
              .filter(f => f.path !== '.backup-signature' && f.type === 'File')
              .sort((a, b) => a.path.localeCompare(b.path));
            
            for (const file of sortedFiles) {
              contentHash.update(file.path);
              const fileData = await file.buffer();
              contentHash.update(fileData);
            }
            const contentDigest = contentHash.digest();
            
            const signature = generateBackupSignature(contentDigest);
            if (signature) {
              const AdmZip = require('adm-zip');
              const zip = new AdmZip(backupPath);
              zip.addFile('.backup-signature', Buffer.from(signature, 'utf-8'));
              zip.writeZip(backupPath);
              
              // 同时保存外部签名文件（兼容旧版本）
              const sigPath = backupPath.replace('.zip', '.sig');
              fs.writeFileSync(sigPath, signature);
            } else {
              console.warn('⚠️ WebDAV备份无法生成签名: CRYPTO_SECRET未配置');
            }
            
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
      return res.json({ success: true, backups: [], configured: false });
    }
    
    let encryptedConfig;
    try {
      encryptedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      // 配置文件损坏，删除并提示重新配置
      fs.unlinkSync(configPath);
      return res.json({ 
        success: true, 
        backups: [], 
        configured: false,
        message: '配置文件损坏，请重新配置WebDAV'
      });
    }
    
    const config = decryptWebDAVConfig(encryptedConfig);
    
    if (!config) {
      // 解密失败（可能是密钥变更），删除旧配置并提示重新配置
      fs.unlinkSync(configPath);
      return res.json({ 
        success: true, 
        backups: [], 
        configured: false,
        message: '加密密钥已变更，请重新配置WebDAV'
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
        message: '请先配置WebDAV',
        needReconfigure: true
      });
    }
    
    let encryptedConfig;
    try {
      encryptedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      // 配置文件损坏，删除并提示重新配置
      fs.unlinkSync(configPath);
      return res.status(400).json({ 
        success: false, 
        message: '配置文件损坏，请重新配置WebDAV',
        needReconfigure: true
      });
    }
    
    const config = decryptWebDAVConfig(encryptedConfig);
    
    if (!config) {
      // 解密失败（可能是密钥变更），删除旧配置并提示重新配置
      fs.unlinkSync(configPath);
      return res.status(400).json({ 
        success: false, 
        message: '加密密钥已变更，请重新配置WebDAV',
        needReconfigure: true
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
    
      // 备份当前WebDAV配置（与crypto-secret一起备份，确保可回滚）
      const webdavConfigPath = path.join(projectRoot, 'config', '.webdav-config.json');
      if (fs.existsSync(webdavConfigPath)) {
        const backupWebdavPath = path.join(preRestoreBackupDir, `.webdav-config.json.pre-restore-${timestamp}`);
        fs.copyFileSync(webdavConfigPath, backupWebdavPath);
        preRestoreFiles.push('config/.webdav-config.json');
      }
      
      // 备份当前加密密钥（与WebDAV配置必须匹配）
      const cryptoSecretPath = path.join(projectRoot, 'config', '.crypto-secret');
      if (fs.existsSync(cryptoSecretPath)) {
        const backupCryptoPath = path.join(preRestoreBackupDir, `.crypto-secret.pre-restore-${timestamp}`);
        fs.copyFileSync(cryptoSecretPath, backupCryptoPath);
        preRestoreFiles.push('config/.crypto-secret');
      }
      
      // 保存到临时文件
    const tempPath = path.join(__dirname, '..', `temp-webdav-${Date.now()}.zip`);
    fs.writeFileSync(tempPath, fileBuffer);
    
    // 验证WebDAV下载的备份文件
    try {
      // 检查是否是ZIP文件
      if (!fileBuffer.slice(0, 4).equals(Buffer.from([0x50, 0x4B, 0x03, 0x04]))) {
        fs.unlinkSync(tempPath);
        return res.status(400).json({
          success: false,
          message: 'WebDAV上的文件不是有效的ZIP格式'
        });
      }
      
      // 检查文件大小
      if (fileBuffer.length > 500 * 1024 * 1024) {
        fs.unlinkSync(tempPath);
        return res.status(400).json({
          success: false,
          message: '备份文件过大（超过500MB）'
        });
      }
      
      console.log(`⚠️ WebDAV备份恢复: ${filename} (无法验证签名，WebDAV不存储签名文件)`);
    } catch (err) {
      fs.unlinkSync(tempPath);
      return res.status(400).json({
        success: false,
        message: '备份文件验证失败: ' + err.message
      });
    }
    
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
        // 特殊处理config目录，保护敏感配置
        if (item === 'config') {
          if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
          }
            const configFiles = fs.readdirSync(sourcePath);
            for (const configFile of configFiles) {
              // 保护JWT密钥
              if (configFile === '.jwt-secret') {
                skippedFiles.push('config/.jwt-secret (保护当前JWT密钥)');
                continue;
              }
              // .crypto-secret 和 .webdav-config.json 必须一起恢复
              // 因为 WebDAV 密码是用 crypto-secret 加密的，两者必须匹配
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
    
    let message = '从 WebDAV恢复成功！数据库将在后台重新加载。';
    if (skippedFiles.length > 0) {
      message += ` 已跳过: ${skippedFiles.join(', ')}`;
    }
    
    // 先发送响应，避免数据库重连导致请求超时
    res.json({ 
      success: true, 
      message,
      restored: restoredFiles,
      skipped: skippedFiles,
      needReload: true,
      checkAIConfig: true // 提示前端检查 AI 配置
    });

    // 在响应发送后异步重连数据库
    setImmediate(async () => {
      try {
        const db = require('../db');
        if (db.reconnect) {
          await db.reconnect();
          console.log('✓ 数据库已重新连接，恢复的数据已生效');
        }
        
        // 清除加密密钥缓存并重新初始化
        try {
          const { clearCachedSecret, initCryptoSecret, decrypt } = require('../utils/crypto');
          clearCachedSecret();
          await initCryptoSecret();
          console.log('✓ 加密密钥已重新加载');
          
// 验证 AI 配置是否可用
            try {
              const aiConfig = await db.getAIConfig();
              if (aiConfig.apiKey) {
                const encrypted = JSON.parse(aiConfig.apiKey);
                const decrypted = decrypt(encrypted.encrypted, encrypted.iv, encrypted.authTag);
                if (decrypted) {
                  console.log('✓ AI 配置验证成功，正在自动激活...');
                  
                  // 自动测试并激活 AI 配置
                  const { testAndActivateAIConfig } = require('../utils/aiProvider');
                  const aiActivationResult = await testAndActivateAIConfig();
                  
                  if (aiActivationResult.success) {
                    console.log(`✓ ${aiActivationResult.message}`);
                  } else {
                    console.warn(`⚠️ AI 自动激活失败: ${aiActivationResult.message}`);
                  }
                } else {
                  console.warn('⚠️ AI 配置 API Key 解密失败，可能需要重新配置');
                }
              }
            } catch (e) {
              console.warn('⚠️ AI 配置验证失败:', e.message);
            }
        } catch (e) {
          console.warn('重新加载加密密钥失败:', e.message);
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
        
        // 广播数据变更通知，让所有客户端刷新
        try {
          const { notifyDataChange } = require('../utils/autoBackup');
          await notifyDataChange(null, { type: 'backup_restored' });
        } catch (e) {
          console.warn('广播恢复通知失败:', e.message);
        }
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
        message: '请先配置WebDAV',
        needReconfigure: true
      });
    }
    
    let encryptedConfig;
    try {
      encryptedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      // 配置文件损坏，删除并提示重新配置
      fs.unlinkSync(configPath);
      return res.status(400).json({ 
        success: false, 
        message: '配置文件损坏，请重新配置WebDAV',
        needReconfigure: true
      });
    }
    
    const config = decryptWebDAVConfig(encryptedConfig);
    
    if (!config) {
      // 解密失败（可能是密钥变更），删除旧配置并提示重新配置
      fs.unlinkSync(configPath);
      return res.status(400).json({ 
        success: false, 
        message: '加密密钥已变更，请重新配置WebDAV',
        needReconfigure: true
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
