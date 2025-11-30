require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// JWT密钥持久化文件路径
const JWT_SECRET_FILE = path.join(__dirname, 'config', '.jwt-secret');

// 获取或生成JWT密钥
function getOrCreateJwtSecret() {
  // 1. 优先使用环境变量
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  
  // 2. 尝试从文件读取已生成的密钥
  try {
    const configDir = path.join(__dirname, 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    if (fs.existsSync(JWT_SECRET_FILE)) {
      const savedSecret = fs.readFileSync(JWT_SECRET_FILE, 'utf-8').trim();
      if (savedSecret && savedSecret.length >= 32) {
        return savedSecret;
      }
    }
  } catch (e) {
    // 读取失败，继续生成新密钥
  }
  
  // 3. 生成新的随机密钥并保存
  const newSecret = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(JWT_SECRET_FILE, newSecret, { mode: 0o600 });
    console.log('✓ 已自动生成JWT密钥并保存到 config/.jwt-secret');
  } catch (e) {
    console.warn('⚠️  无法保存JWT密钥到文件，将使用临时密钥（重启后token会失效）');
  }
  
  return newSecret;
}

// 安全警告检查
const securityWarnings = [];

// 检查默认密码
const adminPassword = process.env.ADMIN_PASSWORD || '123456';
if (!process.env.ADMIN_PASSWORD || adminPassword === '123456') {
  securityWarnings.push('⚠️  警告: 正在使用默认管理员密码，请设置环境变量 ADMIN_PASSWORD');
}

// 获取JWT密钥（自动生成或从环境变量/文件读取）
const jwtSecret = getOrCreateJwtSecret();

// 输出安全警告
if (securityWarnings.length > 0) {
  console.log('\n' + '='.repeat(60));
  console.log('🔒 安全提醒');
  console.log('='.repeat(60));
  securityWarnings.forEach(warning => console.log(warning));
  console.log('='.repeat(60));
  console.log('提示: 在 .env 文件中设置 ADMIN_PASSWORD=你的强密码');
  console.log('='.repeat(60) + '\n');
}

module.exports = {
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: adminPassword
  },
  server: {
    port: process.env.PORT || 3000,
    jwtSecret: jwtSecret
  }
};
