const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const schedule = require('node-schedule');
const { createClient } = require('webdav');
const { decryptWebDAVConfig } = require('./crypto');

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
    delay: 30,                     // 30分钟防抖延迟
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
function loadConfig() {
  try {
    const configDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
    
    // 首次运行，保存默认配�?
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  } catch (error) {
    console.error('[\u81ea\u52a8\u5907\u4efd] \u914d\u7f6e\u52a0\u8f7d\u5931\u8d25:', error.message);
    return DEFAULT_CONFIG;
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
    console.error('[\u81ea\u52a8\u5907\u4efd] \u914d\u7f6e\u4fdd\u5b58\u5931\u8d25:', error.message);
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
      
      output.on('close', () => {
        const stats = fs.statSync(backupPath);
        const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
        resolve({
          name: `${backupName}.zip`,
          path: backupPath,
          size: sizeInMB
        });
      });
      
      archive.on('error', (err) => {
        console.error('[自动备份] 创建失败:', err);
        reject(err);
      });
      
      archive.pipe(output);
      
      // 备份数据�?
      const databaseDir = path.join(__dirname, '..', 'database');
      if (fs.existsSync(databaseDir)) {
        archive.directory(databaseDir, 'database');
      }
      
      // 备份 config 目录（自动备份配置等�?
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
      console.error('[自动备份] 创建失败:', error);
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
    console.error('[自动备份] WebDAV配置解密失败');
    return null;
  }
  
  return createClient(webdavConfig.url, {
    username: webdavConfig.username,
    password: webdavConfig.password
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
      
      return true;
    } catch (error) {
      if (attempt < retries) {
        console.warn(`[自动备份] WebDAV同步失败，重试 ${attempt + 1}/${retries}...`);
        await new Promise(r => setTimeout(r, 2000)); // 等待2秒后重试
      } else {
        console.error('[自动备份] WebDAV同步失败:', error.message);
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
    
    const remotePath = '/Con-Nav-Item-Backups';
    
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
        console.error(`[自动备份] 删除WebDAV备份失败: ${backups[i].filename}`);
      }
    }
    
    if (deletedCount > 0) {
      console.log(`[自动备份] 已清理 ${deletedCount} 个WebDAV过期备份`);
    }
  } catch (error) {
    console.error('[自动备份] WebDAV清理失败:', error.message);
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
    
    // 删除超出保留数量的备�?
    let deletedCount = 0;
    for (let i = keepCount; i < files.length; i++) {
      fs.unlinkSync(files[i].path);
      deletedCount++;
    }
    
    if (deletedCount > 0) {
    }
  } catch (error) {
    console.error('[自动备份] 清理失败:', error);
  }
}

/**
 * 防抖备份 - 数据修改后触发
 */
function triggerDebouncedBackup() {
  if (!config.debounce.enabled) {
    return;
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
      console.log(`[自动备份] 增量备份完成: ${result.name} (${result.size} MB)`);
      
      // 同步到WebDAV（如果启用）
      if (config.webdav && config.webdav.enabled && config.webdav.syncIncremental) {
        const synced = await syncToWebDAV(result.path, result.name);
        if (synced) {
          console.log(`[自动备份] 已同步到WebDAV: ${result.name}`);
          // 清理WebDAV上的过期备份
          if (config.autoClean) {
            await cleanWebDAVBackups('incremental', config.debounce.keep);
          }
        }
      }
      
      // 自动清理本地备份
      if (config.autoClean) {
        cleanOldBackups('incremental', config.debounce.keep);
      }
      
    } catch (error) {
      console.error('[自动备份] 防抖备份失败:', error);
    }
  }, config.debounce.delay * 60 * 1000); // 转换为毫�?
}

/**
 * 定时备份 - 每天固定时间执行
 */
function startScheduledBackup() {
  if (!config.scheduled.enabled) {
    return;
  }
  
  // 取消之前的任�?
  if (scheduledJob) {
    scheduledJob.cancel();
  }
  
  const cronExpr = `${config.scheduled.minute} ${config.scheduled.hour} * * *`;
  
  scheduledJob = schedule.scheduleJob(cronExpr, async () => {
    try {
      // 如果启用了"仅在有修改时备份"，检查是否有最近的增量备份
      if (config.scheduled.onlyIfModified && lastDebounceBackupTime) {
        const hoursSinceLastBackup = (Date.now() - lastDebounceBackupTime) / (1000 * 60 * 60);
        // 如果24小时内有增量备份，跳过定时备份
        if (hoursSinceLastBackup < 24) {
          console.log('[自动备份] 24小时内已有增量备份，跳过定时备份');
          return;
        }
      }
      
      const result = await createBackupFile('daily');
      lastScheduledBackupTime = Date.now();
      console.log(`[自动备份] 定时备份完成: ${result.name} (${result.size} MB)`);
      
      // 同步到WebDAV（如果启用）
      if (config.webdav && config.webdav.enabled && config.webdav.syncDaily) {
        const synced = await syncToWebDAV(result.path, result.name);
        if (synced) {
          console.log(`[自动备份] 已同步到WebDAV: ${result.name}`);
          // 清理WebDAV上的过期备份
          if (config.autoClean) {
            await cleanWebDAVBackups('daily', config.scheduled.keep);
          }
        }
      }
      
      // 自动清理本地备份
      if (config.autoClean) {
        cleanOldBackups('daily', config.scheduled.keep);
      }
      
    } catch (error) {
      console.error('[自动备份] 定时备份失败:', error);
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
    console.error('[自动备份] 获取统计信息失败:', error);
    return null;
  }
}

/**
 * 更新配置并重启定时任�?
 */
function updateConfig(newConfig) {
  try {
    // 合并配置
    config = { ...config, ...newConfig };
    
    // 保存到文�?
    if (!saveConfig(config)) {
      return { success: false, message: '配置保存失败' };
    }
    
    // 重启定时任务
    if (config.scheduled.enabled) {
      startScheduledBackup();
    } else if (scheduledJob) {
      scheduledJob.cancel();
      scheduledJob = null;
    }
    
    return { success: true, message: '配置更新成功' };
  } catch (error) {
    console.error('[自动备份] 配置更新失败:', error);
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
  startScheduledBackup,
  getBackupStats,
  getConfig,
  updateConfig
};
