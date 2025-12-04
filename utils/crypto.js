const crypto = require('crypto');

// 加密算法
const ALGORITHM = 'aes-256-gcm';
const SALT = 'Con-Nav-Item-WebDAV-Salt';

/**
 * 获取加密密钥
 */
function getKey() {
  const secret = process.env.CRYPTO_SECRET || 'default-secret-key-please-change-in-production';
  return crypto.scryptSync(secret, SALT, 32);
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
    console.error('解密失败:', error.message);
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
  const secret = process.env.CRYPTO_SECRET || 'default-secret-key-please-change-in-production';
  const hmac = crypto.createHmac('sha256', secret + SALT);
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
  verifyBackupSignature
};
