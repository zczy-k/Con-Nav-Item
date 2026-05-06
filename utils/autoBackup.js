const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const schedule = require('node-schedule');
const { createClient } = require('webdav');
const { decryptWebDAVConfig, generateBackupSignature } = require('./crypto');

// 配置文件路径
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'autoBackup.json');

// WebDAV配置文件路径（存储在项目config目录，便于备份和管理）
function getWebDAVConfigPath() {
  return path.join(__dirname, '..', 'config', '.webdav-config.json');
}

// 默认配置
const DEFAULT_CONFIG = {
  debounce: {
    enabled: true,
    delay: 5,                      // 5分钟防抖延迟
    keep: 5                        // 保留5个增量备份
  },
  scheduled: {
    enabled: true,
    hour: 2,                       // 每天凌晨2点
    minute: 0,
    keep: 7,                       // 保留7个
    onlyIfModified: true           // 仅在有修改时备份（避免重复）
  },
  webdav: {
    enabled: false,                // WebDAV 自动备份（默认禁用，需先配置）
    syncDaily: true,               // 同步每日备份
    syncIncremental: true          // 同步增量备份
  },
  autoClean: true                  // 自动清理过期备份
};

// 加载配置
function applyEnvOverrides(rawConfig) {
  const config = JSON.parse(JSON.stringify(rawConfig));
  const autoBackupEnabled = String(process.env.AUTO_BACKUP_ENABLED || '').toLowerCase();
  const scheduledEnabled = String(process.env.AUTO_BACKUP_SCHEDULED_ENABLED || '').toLowerCase();
  const debounceEnabled = String(process.env.AUTO_BACKUP_DEBOUNCE_ENABLED || '').toLowerCase();

  if (['0', 'false', 'no', 'off'].includes(autoBackupEnabled)) {
    config.debounce.enabled = false;
    config.scheduled.enabled = false;
  }

  if (['0', 'false', 'no', 'off'].includes(scheduledEnabled)) {
    config.scheduled.enabled = false;
  }

  if (['0', 'false', 'no', 'off'].includes(debounceEnabled)) {
    config.debounce.enabled = false;
  }

  return config;
}

function loadConfig() {
  try {
    const configDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return applyEnvOverrides({ ...DEFAULT_CONFIG, ...JSON.parse(data) });
    }
    
    // 首次运行，保存默认配?
    saveConfig(DEFAULT_CONFIG);
    return applyEnvOverrides(DEFAULT_CONFIG);
  } catch (error) {
    return applyEnvOverrides(DEFAULT_CONFIG);
  }
}

// 保存配置
function saveConfig(newConfig) {
  try {
    const configDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
    return true;
  } catch (error) {
    return false;
  }
}

// 当前配置
let config = loadConfig();

// 状态管理
let debounceTimer = null;
let lastDebounceBackupTime = 0;
let lastScheduledBackupTime = 0;
let scheduledJob = null;

/**
 * 创建备份文件
 */
async function createBackupFile(prefix = 'auto') {
  return new Promise((resolve, reject) => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const backupName = `${prefix}-${timestamp}`;
      const backupDir = path.join(__dirname, '..', 'backups');
      
      // 确保备份目录存在
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      const backupPath = path.join(backupDir, `${backupName}.zip`);
      const output = fs.createWriteStream(backupPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      output.on('close', async () => {
        // 生成签名并嵌入ZIP
        try {
          const unzipper = require('unzipper');
          const crypto = require('crypto');
          
          // 使用unzipper读取ZIP内容计算哈希
          const directory = await unzipper.Open.file(backupPath);
          const contentHash = crypto.createHash('sha256');
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
          }
        } catch (sigErr) {
          // 签名生成失败，忽略
        }
        
        const stats = fs.statSync(backupPath);
        const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
        resolve({
          name: `${backupName}.zip`,
          path: backupPath,
          size: sizeInMB
        });
      });
      
      archive.on('error', (err) => {
        reject(err);
      });
      
      archive.pipe(output);
      
      // 备份数据?
      const databaseDir = path.join(__dirname, '..', 'database');
      if (fs.existsSync(databaseDir)) {
        archive.directory(databaseDir, 'database');
      }
      
      // 备份 config 目录（自动备份配置等?
      const configDir = path.join(__dirname, '..', 'config');
      if (fs.existsSync(configDir)) {
        archive.directory(configDir, 'config');
      }
      
      // 备份上传文件
      const uploadsDir = path.join(__dirname, '..', 'uploads');
      if (fs.existsSync(uploadsDir)) {
        archive.directory(uploadsDir, 'uploads');
      }
      
      // 备份环境配置
      const envFile = path.join(__dirname, '..', '.env');
      if (fs.existsSync(envFile)) {
        archive.file(envFile, { name: '.env' });
      }
      
      // 创建备份信息文件
      const backupInfo = {
        timestamp: new Date().toISOString(),
        type: prefix,
        version: require('../package.json').version || '1.0.0',
        description: '自动备份'
      };
      archive.append(JSON.stringify(backupInfo, null, 2), { name: 'backup-info.json' });
      
      archive.finalize();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 获取WebDAV客户端
 */
async function getWebDAVClient() {
  const webdavConfigPath = getWebDAVConfigPath();
  if (!fs.existsSync(webdavConfigPath)) {
    return null;
  }
  
  const encryptedConfig = JSON.parse(fs.readFileSync(webdavConfigPath, 'utf-8'));
  const webdavConfig = decryptWebDAVConfig(encryptedConfig);
  
  if (!webdavConfig) {
    return null;
  }
  
  const decodedUrl = decodeURIComponent(webdavConfig.url);
  const { getForcedIPv4Agents } = require('./ipv4');
  const { httpsAgent } = getForcedIPv4Agents();
  return createClient(decodedUrl, {
    username: webdavConfig.username,
    password: webdavConfig.password,
    httpsAgent
  });
}

/**
 * 同步备份到WebDAV（带重试）
 */
async function syncToWebDAV(backupPath, backupName, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const client = await getWebDAVClient();
      if (!client) return false;
      
      // 确保备份目录存在
      const remotePath = '/SmartNavora-Backups';
      try {
        await client.createDirectory(remotePath);
      } catch (e) {
        // 目录可能已存在，忽略错误
      }
      
      // 上传文件
      const fileBuffer = fs.readFileSync(backupPath);
      const remoteFilePath = `${remotePath}/${backupName}`;
      await client.putFileContents(remoteFilePath, fileBuffer);
      
      return true;
    } catch (error) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 2000));
      } else {
        return false;
      }
    }
  }
  return false;
}

/**
 * 清理WebDAV上的过期备份
 */
async function cleanWebDAVBackups(prefix, keepCount) {
  try {
    const client = await getWebDAVClient();
    if (!client) return;
    
    const remotePath = '/SmartNavora-Backups';
    
    // 获取远程备份列表
    let contents;
    try {
      contents = await client.getDirectoryContents(remotePath);
    } catch (e) {
      // 目录不存在
      return;
    }
    
    // 过滤并排序
    const backups = contents
      .filter(item => item.type === 'file' && item.filename.includes(prefix) && item.filename.endsWith('.zip'))
      .sort((a, b) => new Date(b.lastmod) - new Date(a.lastmod));
    
    // 删除超出保留数量的备份
    let deletedCount = 0;
    for (let i = keepCount; i < backups.length; i++) {
      try {
        await client.deleteFile(backups[i].filename);
        deletedCount++;
      } catch (e) {
        // 删除失败，忽略
      }
    }
  } catch (error) {
    // WebDAV清理失败，忽略
  }
}

/**
 * 清理过期备份
 */
function cleanOldBackups(prefix, keepCount) {
  try {
    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) return;
    
    const files = fs.readdirSync(backupDir)
      .filter(file => file.startsWith(prefix) && file.endsWith('.zip'))
      .map(file => ({
        name: file,
        path: path.join(backupDir, file),
        time: fs.statSync(path.join(backupDir, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    
    // 删除超出保留数量的备?
    let deletedCount = 0;
    for (let i = keepCount; i < files.length; i++) {
      fs.unlinkSync(files[i].path);
      deletedCount++;
    }
    
    if (deletedCount > 0) {
    }
  } catch (error) {
    // 清理失败，忽略
  }
}

/**
 * 通知数据变更 - 立即递增版本号并广播给所有客户端
 * 用于让前端实时刷新数据
 * @param {string} clientId 发起变更的客户端ID
 * @param {Object} payload 附加数据
 */
async function notifyDataChange(clientId = null, payload = null) {
  const db = require('../db');
  const { broadcastVersionChange } = require('./sseManager');
  
  try {
    // 递增版本号并获取新版本号
    const newVersion = await db.incrementDataVersion();
    // 立即广播给所有客户端
    broadcastVersionChange(newVersion, clientId, payload);
    return newVersion;
  } catch (err) {
    // 版本号更新失败，忽略
    return null;
  }
}

/**
 * 防抖备份 - 数据修改后触发
 * 注意：此函数会同时触发数据变更通知（立即）和自动备份（延迟）
 * @param {string} clientId 发起变更的客户端ID
 * @param {Object} payload 附加数据
 */
async function triggerDebouncedBackup(clientId = null, payload = null) {
  // 立即通知数据变更，让前端实时刷新（等待完成）
  const newVersion = await notifyDataChange(clientId, payload);
  
  if (!config.debounce.enabled) {
    return newVersion;
  }
  
  // 清除之前的定时器
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  
  // 设置新的定时器
  debounceTimer = setTimeout(async () => {
    try {
      const result = await createBackupFile('incremental');
      lastDebounceBackupTime = Date.now();
      
      // 同步到WebDAV（如果启用）
      if (config.webdav && config.webdav.enabled && config.webdav.syncIncremental) {
        const synced = await syncToWebDAV(result.path, result.name);
        if (synced && config.autoClean) {
          await cleanWebDAVBackups('incremental', config.debounce.keep);
        }
      }
      
      // 自动清理本地备份
      if (config.autoClean) {
        cleanOldBackups('incremental', config.debounce.keep);
      }
      
    } catch (error) {
      // 防抖备份失败，忽略
    }
  }, config.debounce.delay * 60 * 1000);

  return newVersion;
}

/**
 * 定时备份 - 每天固定时间执行
 */
function startScheduledBackup() {
  if (!config.scheduled.enabled) {
    return;
  }
  
  // 取消之前的任?
  if (scheduledJob) {
    scheduledJob.cancel();
  }
  
  const cronExpr = `${config.scheduled.minute} ${config.scheduled.hour} * * *`;
  
  scheduledJob = schedule.scheduleJob(cronExpr, async () => {
    try {
      // 如果启用了"仅在有修改时备份"，检查是否有最近的增量备份
      if (config.scheduled.onlyIfModified && lastDebounceBackupTime) {
        const hoursSinceLastBackup = (Date.now() - lastDebounceBackupTime) / (1000 * 60 * 60);
        if (hoursSinceLastBackup < 24) {
          return;
        }
      }
      
      const result = await createBackupFile('daily');
      lastScheduledBackupTime = Date.now();
      
      // 同步到WebDAV（如果启用）
      if (config.webdav && config.webdav.enabled && config.webdav.syncDaily) {
        const synced = await syncToWebDAV(result.path, result.name);
        if (synced && config.autoClean) {
          await cleanWebDAVBackups('daily', config.scheduled.keep);
        }
      }
      
      // 自动清理本地备份
      if (config.autoClean) {
        cleanOldBackups('daily', config.scheduled.keep);
      }
      
    } catch (error) {
      // 定时备份失败，忽略
    }
  });
  
  // 计算下次执行时间
  const nextRun = scheduledJob.nextInvocation();
  if (nextRun) {
  }
  
  return scheduledJob;
}

/**
 * 获取备份统计信息
 */
function getBackupStats() {
  try {
    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) {
      return {
        incremental: { count: 0, size: 0 },
        daily: { count: 0, size: 0 },
        total: { count: 0, size: 0 }
      };
    }
    
    const files = fs.readdirSync(backupDir)
      .filter(file => file.endsWith('.zip'))
      .map(file => {
        const stats = fs.statSync(path.join(backupDir, file));
        return {
          name: file,
          size: stats.size,
          type: file.startsWith('incremental') ? 'incremental' : 
                file.startsWith('daily') ? 'daily' : 'manual'
        };
      });
    
    const incremental = files.filter(f => f.type === 'incremental');
    const daily = files.filter(f => f.type === 'daily');
    
    return {
      incremental: {
        count: incremental.length,
        size: (incremental.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024)).toFixed(2)
      },
      daily: {
        count: daily.length,
        size: (daily.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024)).toFixed(2)
      },
      total: {
        count: files.length,
        size: (files.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024)).toFixed(2)
      },
      lastDebounce: lastDebounceBackupTime ? new Date(lastDebounceBackupTime).toISOString() : null,
      lastScheduled: lastScheduledBackupTime ? new Date(lastScheduledBackupTime).toISOString() : null,
      nextScheduled: scheduledJob ? scheduledJob.nextInvocation()?.toISOString() : null
    };
  } catch (error) {
    return null;
  }
}

/**
 * 更新配置并重启定时任务
 */
function updateConfig(newConfig) {
  try {
    config = { ...config, ...newConfig };
    
    if (!saveConfig(config)) {
      return { success: false, message: '配置保存失败' };
    }
    
    if (config.scheduled.enabled) {
      startScheduledBackup();
    } else if (scheduledJob) {
      scheduledJob.cancel();
      scheduledJob = null;
    }
    
    return { success: true, message: '配置更新成功' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * 获取当前配置
 */
function getConfig() {
  return config;
}

module.exports = {
  triggerDebouncedBackup,
  notifyDataChange,
  startScheduledBackup,
  getBackupStats,
  getConfig,
  updateConfig
};
