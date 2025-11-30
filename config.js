require('dotenv').config();

// 安全警告检查
const securityWarnings = [];

// 检查默认密码
const adminPassword = process.env.ADMIN_PASSWORD || '123456';
if (!process.env.ADMIN_PASSWORD || adminPassword === '123456') {
  securityWarnings.push('⚠️  警告: 正在使用默认管理员密码，请设置环境变量 ADMIN_PASSWORD');
}

// 检查JWT密钥
const jwtSecret = process.env.JWT_SECRET || 'Con-Nav-Item-jwt-secret-2024-secure-key';
if (!process.env.JWT_SECRET) {
  securityWarnings.push('⚠️  警告: 正在使用默认JWT密钥，请设置环境变量 JWT_SECRET');
}

// 输出安全警告
if (securityWarnings.length > 0) {
  console.log('\n' + '='.repeat(60));
  console.log('🔒 安全提醒');
  console.log('='.repeat(60));
  securityWarnings.forEach(warning => console.log(warning));
  console.log('='.repeat(60));
  console.log('提示: 在 .env 文件中设置以下变量以提高安全性:');
  console.log('  ADMIN_PASSWORD=你的强密码');
  console.log('  JWT_SECRET=随机字符串(至少32位)');
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
