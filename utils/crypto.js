const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// 加密算法
const ALGORITHM = 'aes-256-gcm';
const SALT = 'Con-Nav-Item-WebDAV-Salt';

// 密钥文件路径（作为备用）
const CRYPTO_SECRET_PATH = path.join(__dirname, '..', 'config', '.crypto-secret');
// 数据库路径
const DB_PATH = path.join(__dirname, '..', 'database', 'nav.db');

// 缓存密钥，避免重复读取
let cachedSecret = null;

/**
 * 从数据库获取密钥
 */
function getSecretFromDatabase() {
  try {
    // 动态加载sqlite3，避免循环依赖
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(DB_PATH);
    
    return new Promise((resolve, reject) => {
      // 先确保settings表存在
      db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) {
          db.close();
          return reject(err);
        }
        
        // 查询密钥
        db.get('SELECT value FROM settings WHERE key = ?', ['crypto_secret'], (err, row) => {
          db.close();
          if (err) {
            reject(err);
          } else {
            resolve(row ? row.value : null);
          }
        });
      });
    });
  } catch (e) {
    return Promise.resolve(null);
  }
}

/**
 * 将密钥保存到数据库
 */
function saveSecretToDatabase(secret) {
  try {
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(DB_PATH);
    
    return new Promise((resolve, reject) => {
      // 先确保settings表存在
      db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) {
          db.close();
          return reject(err);
        }
        
        // 使用REPLACE来插入或更新
        db.run(
          'REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          ['crypto_secret', secret],
          (err) => {
            db.close();
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
    });
  } catch (e) {
    return Promise.resolve();
  }
}

/**
 * 获取或生成 CRYPTO_SECRET（同步版本，用于兼容现有代码）
 * 注意：此函数应该只在 initCryptoSecret 完成后被调用
 */
function getCryptoSecretSync() {
  // 如果已经有缓存的密钥，直接返回
  if (cachedSecret) {
    return cachedSecret;
  }
  
  // 1. 优先使用环境变量
  if (process.env.CRYPTO_SECRET) {
    cachedSecret = process.env.CRYPTO_SECRET;
    return cachedSecret;
  }
  
  // 2. 尝试从文件读取（兼容旧版本）
  try {
    if (fs.existsSync(CRYPTO_SECRET_PATH)) {
      const secret = fs.readFileSync(CRYPTO_SECRET_PATH, 'utf-8').trim();
      if (secret && secret.length >= 32) {
        cachedSecret = secret;
        return cachedSecret;
      }
    }
  } catch (e) {
    // 忽略文件读取失败
  }
  
  // 3. 尝试同步读取数据库（最后的备选方案）
  try {
    const Database = require('better-sqlite3');
    if (fs.existsSync(DB_PATH)) {
      const db = new Database(DB_PATH, { readonly: true });
      try {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('crypto_secret');
        if (row && row.value && row.value.length >= 32) {
          cachedSecret = row.value;
          db.close();
          return cachedSecret;
        }
      } catch (e) {
        // settings表可能不存在
      }
      db.close();
    }
  } catch (e) {
    // better-sqlite3 可能不可用，忽略
  }
  
  // 4. 生成新密钥（临时使用，会在异步初始化时保存到数据库）
  const newSecret = crypto.randomBytes(32).toString('hex');
  cachedSecret = newSecret;
  
  // 尝试保存到文件（作为备用）
  try {
    const configDir = path.dirname(CRYPTO_SECRET_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(CRYPTO_SECRET_PATH, newSecret, { mode: 0o600 });
  } catch (e) {
    // 忽略文件写入失败
  }
  
  return newSecret;
}

/**
 * 异步初始化密钥（优先从数据库读取）
 */
async function initCryptoSecret() {
  // 1. 优先使用环境变量
  if (process.env.CRYPTO_SECRET) {
    cachedSecret = process.env.CRYPTO_SECRET;
    return cachedSecret;
  }
  
  // 2. 尝试从数据库读取
  try {
    const dbSecret = await getSecretFromDatabase();
    if (dbSecret && dbSecret.length >= 32) {
      cachedSecret = dbSecret;
      
      // 同步到文件（作为备用）
      try {
        const configDir = path.dirname(CRYPTO_SECRET_PATH);
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }
        fs.writeFileSync(CRYPTO_SECRET_PATH, dbSecret, { mode: 0o600 });
      } catch (e) {
        // 忽略文件写入失败
      }
      
      return cachedSecret;
    }
  } catch (e) {
    // 忽略数据库读取失败
  }
  
  // 3. 尝试从文件读取（兼容旧版本，并迁移到数据库）
  try {
    if (fs.existsSync(CRYPTO_SECRET_PATH)) {
      const fileSecret = fs.readFileSync(CRYPTO_SECRET_PATH, 'utf-8').trim();
      if (fileSecret && fileSecret.length >= 32) {
        cachedSecret = fileSecret;
        
        // 迁移到数据库
        try {
          await saveSecretToDatabase(fileSecret);
        } catch (e) {
          // 忽略迁移失败
        }
        
        return cachedSecret;
      }
    }
  } catch (e) {
    // 忽略文件读取失败
  }
  
  // 4. 生成新密钥并保存到数据库
  const newSecret = crypto.randomBytes(32).toString('hex');
  cachedSecret = newSecret;
  
  try {
    await saveSecretToDatabase(newSecret);
  } catch (e) {
    // 忽略保存失败
  }
  
  // 同时保存到文件（作为备用）
  try {
    const configDir = path.dirname(CRYPTO_SECRET_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(CRYPTO_SECRET_PATH, newSecret, { mode: 0o600 });
  } catch (e) {
    // 忽略文件写入失败
  }
  
  return cachedSecret;
}

/**
 * 获取加密密钥
 */
function getKey() {
  if (!cachedSecret) {
    // 如果还没有初始化，使用同步方法获取（兼容）
    cachedSecret = getCryptoSecretSync();
  }
  return crypto.scryptSync(cachedSecret, SALT, 32);
}

/**
 * 加密数据
 * @param {string} text - 要加密的文本
 * @returns {object} - 包含加密数据、IV和认证标签
 */
function encrypt(text) {
  if (!text) return null;
  
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * 解密数据
 * @param {string} encrypted - 加密的文本
 * @param {string} iv - 初始化向量
 * @param {string} authTag - 认证标签
 * @returns {string} - 解密后的文本
 */
function decrypt(encrypted, iv, authTag) {
  if (!encrypted || !iv || !authTag) return null;
  
  try {
    const key = getKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
    
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    return null;
  }
}

/**
 * 加密WebDAV配置
 * @param {object} config - 配置对象 {url, username, password}
 * @returns {object} - 加密后的配置
 */
function encryptWebDAVConfig(config) {
  return {
    url: config.url, // URL不加密
    username: config.username, // 用户名不加密
    password: encrypt(config.password) // 只加密密码
  };
}

/**
 * 解密WebDAV配置
 * @param {object} encryptedConfig - 加密的配置对象
 * @returns {object} - 解密后的配置
 */
function decryptWebDAVConfig(encryptedConfig) {
  if (!encryptedConfig || !encryptedConfig.password) {
    return null;
  }
  
  const password = decrypt(
    encryptedConfig.password.encrypted,
    encryptedConfig.password.iv,
    encryptedConfig.password.authTag
  );
  
  if (!password) {
    return null;
  }
  
  return {
    url: encryptedConfig.url,
    username: encryptedConfig.username,
    password: password
  };
}

/**
 * 生成备份签名
 * @param {Buffer} data - 备份文件内容
 * @returns {string} - HMAC-SHA256 签名
 */
function generateBackupSignature(data) {
  if (!cachedSecret) {
    cachedSecret = getCryptoSecretSync();
  }
  const hmac = crypto.createHmac('sha256', cachedSecret + SALT);
  hmac.update(data);
  return hmac.digest('hex');
}

/**
 * 验证备份签名
 * @param {Buffer} data - 备份文件内容
 * @param {string} signature - 签名
 * @returns {boolean} - 是否验证通过
 */
function verifyBackupSignature(data, signature) {
  const expectedSignature = generateBackupSignature(data);
  // 使用时间安全的比较防止时序攻击
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(signature, 'hex')
  );
}

module.exports = {
  encrypt,
  decrypt,
  encryptWebDAVConfig,
  decryptWebDAVConfig,
  generateBackupSignature,
  verifyBackupSignature,
  initCryptoSecret,
  // 清除缓存的密钥（用于备份恢复后重新加载）
  clearCachedSecret: () => { cachedSecret = null; }
};
