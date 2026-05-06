#!/usr/bin/env node

/**
 * 密码问题诊断和重置工具
 * 
 * 使用方法：
 * 1. 检查当前密码: node check-password.js check
 * 2. 重置密码: node check-password.js reset <新密码>
 * 3. 使用环境变量重置: node check-password.js reset-env
 * 4. 生成紧急重置令牌: node check-password.js generate-token
 * 5. 使用令牌重置: node check-password.js reset-token <令牌> <新密码>
 * 6. 交互式重置: node check-password.js interactive
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const dbPath = path.join(__dirname, '..', 'database', 'nav.db');
const tokenPath = path.join(__dirname, '..', 'config', '.reset-token');
const auditLogPath = path.join(__dirname, '..', 'config', 'password-audit.log');

if (!fs.existsSync(dbPath)) {
  console.error('❌ 数据库文件不存在:', dbPath);
  console.error('   请先启动应用以初始化数据库');
  process.exit(1);
}

const db = new sqlite3.Database(dbPath);

// 创建 readline 接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// 审计日志函数
function logAudit(action, details) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${action}: ${details}\n`;
  
  try {
    const logDir = path.dirname(auditLogPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(auditLogPath, logEntry);
  } catch (err) {
    // 静默失败，不影响主要功能
  }
}

function checkPassword() {
  console.log('🔍 检查数据库中的管理员账号信息...\n');
  
  db.get('SELECT * FROM users WHERE id = 1', (err, user) => {
    if (err) {
      console.error('❌ 查询失败:', err.message);
      db.close();
      process.exit(1);
    }
    
    if (!user) {
      console.log('❌ 未找到管理员账号');
      db.close();
      process.exit(1);
    }
    
    console.log('✅ 找到管理员账号:');
    console.log('   ID:', user.id);
    console.log('   用户名:', user.username);
    console.log('   密码哈希:', user.password.substring(0, 20) + '...');
    console.log('   上次登录:', user.last_login_time || '从未登录');
    console.log('   登录IP:', user.last_login_ip || 'N/A');
    console.log('');
    console.log('💡 提示:');
    console.log('   - ADMIN_PASSWORD 环境变量仅在首次初始化数据库时生效');
    console.log('   - 如果数据库已存在，环境变量不会覆盖数据库中的密码');
    console.log('   - 要重置密码，请使用: node check-password.js reset <新密码>');
    console.log('   - 或者在前端管理界面修改密码');
    console.log('');
    
    // 验证默认密码
    const defaultPassword = '123456';
    bcrypt.compare(defaultPassword, user.password, (err, result) => {
      if (result) {
        console.log('⚠️  当前密码是默认密码: 123456');
      } else {
        console.log('✓ 当前密码不是默认密码');
      }
      db.close();
    });
  });
}

function resetPassword(newPassword) {
  if (!newPassword) {
    console.error('❌ 请提供新密码');
    console.error('   用法: node check-password.js reset <新密码>');
    console.error('');
    console.error('⚠️  安全警告: 命令行参数可能被其他用户看到');
    console.error('   推荐使用: node check-password.js interactive');
    db.close();
    process.exit(1);
  }
  
  if (newPassword.length < 6) {
    console.error('❌ 密码长度至少6位');
    db.close();
    process.exit(1);
  }
  
  console.log('🔧 重置管理员密码...\n');
  
  const passwordHash = bcrypt.hashSync(newPassword, 10);
  
  db.run('UPDATE users SET password = ? WHERE id = 1', [passwordHash], function(err) {
    if (err) {
      console.error('❌ 重置失败:', err.message);
      logAudit('PASSWORD_RESET_FAILED', err.message);
      db.close();
      process.exit(1);
    }
    
    if (this.changes === 0) {
      console.log('❌ 未找到管理员账号');
      logAudit('PASSWORD_RESET_FAILED', 'Admin account not found');
      db.close();
      process.exit(1);
    }
    
    console.log('✅ 密码重置成功!');
    console.log('   新密码: ********');
    console.log('');
    console.log('💡 现在可以使用新密码登录了');
    console.log('');
    console.log('⚠️  安全提示: 请清除 Shell 历史记录');
    console.log('   执行: history -c && history -w');
    console.log('');
    
    // 记录审计日志
    logAudit('PASSWORD_RESET_SUCCESS', 'Password reset via CLI');
    
    db.close();
  });
}

function resetWithEnv() {
  require('dotenv').config();
  
  const envPassword = process.env.ADMIN_PASSWORD;
  const envUsername = process.env.ADMIN_USERNAME || 'admin';
  
  if (!envPassword) {
    console.error('❌ 未设置环境变量 ADMIN_PASSWORD');
    console.error('   请在启动 Docker 时设置: -e ADMIN_PASSWORD=你的密码');
    console.error('   或者创建 .env 文件并设置: ADMIN_PASSWORD=你的密码');
    db.close();
    process.exit(1);
  }
  
  console.log('🔧 使用环境变量重置管理员密码...\n');
  console.log('   环境变量 ADMIN_USERNAME:', envUsername);
  console.log('   环境变量 ADMIN_PASSWORD:', envPassword);
  console.log('');
  
  const passwordHash = bcrypt.hashSync(envPassword, 10);
  
  db.serialize(() => {
    // 更新用户名和密码
    db.run('UPDATE users SET username = ?, password = ? WHERE id = 1', [envUsername, passwordHash], function(err) {
      if (err) {
        console.error('❌ 重置失败:', err.message);
        db.close();
        process.exit(1);
      }
      
      if (this.changes === 0) {
        console.log('❌ 未找到管理员账号');
        db.close();
        process.exit(1);
      }
      
      console.log('✅ 密码重置成功!');
      console.log('   用户名:', envUsername);
      console.log('   密码:', envPassword);
      console.log('');
      console.log('💡 现在可以使用新密码登录了');
      console.log('');
      db.close();
    });
  });
}

// 生成紧急重置令牌
function generateToken() {
  console.log('🔐 生成紧急重置令牌...\n');
  
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiry = Date.now() + 3600000; // 1小时后过期
  
  const tokenData = {
    tokenHash: tokenHash, // 只存储哈希值，不存储原始令牌
    expiry: expiry,
    created: new Date().toISOString(),
    used: false
  };
  
  // 确保 config 目录存在
  const configDir = path.dirname(tokenPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2));
  fs.chmodSync(tokenPath, 0o600); // 只有所有者可读写
  
  console.log('✅ 紧急重置令牌已生成！');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('令牌:', token);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('⚠️  重要安全提示:');
  console.log('   1. 此令牌 1 小时后自动失效');
  console.log('   2. 令牌只显示一次，请立即复制保存');
  console.log('   3. 不要通过不安全的渠道传输令牌');
  console.log('   4. 使用后令牌会自动销毁');
  console.log('   5. 令牌以加密形式存储，无法恢复');
  console.log('');
  console.log('使用方法:');
  console.log('   node check-password.js reset-token', token, '<新密码>');
  console.log('');
  
  // 记录审计日志
  logAudit('TOKEN_GENERATED', 'Emergency reset token generated');
  
  db.close();
}

// 使用令牌重置密码
function resetWithToken(token, newPassword) {
  if (!token || !newPassword) {
    console.error('❌ 请提供令牌和新密码');
    console.error('   用法: node check-password.js reset-token <令牌> <新密码>');
    db.close();
    process.exit(1);
  }
  
  if (newPassword.length < 6) {
    console.error('❌ 密码长度至少6位');
    db.close();
    process.exit(1);
  }
  
  // 检查令牌文件是否存在
  if (!fs.existsSync(tokenPath)) {
    console.error('❌ 未找到重置令牌');
    console.error('   请先生成令牌: node check-password.js generate-token');
    logAudit('TOKEN_RESET_FAILED', 'Token file not found');
    db.close();
    process.exit(1);
  }
  
  // 读取并验证令牌
  const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  
  // 验证令牌哈希
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  if (tokenData.tokenHash !== tokenHash) {
    console.error('❌ 令牌无效');
    logAudit('TOKEN_RESET_FAILED', 'Invalid token');
    db.close();
    process.exit(1);
  }
  
  // 检查是否已使用
  if (tokenData.used) {
    console.error('❌ 令牌已被使用');
    console.error('   请重新生成令牌: node check-password.js generate-token');
    logAudit('TOKEN_RESET_FAILED', 'Token already used');
    db.close();
    process.exit(1);
  }
  
  // 检查是否过期
  if (Date.now() > tokenData.expiry) {
    console.error('❌ 令牌已过期');
    console.error('   请重新生成令牌: node check-password.js generate-token');
    fs.unlinkSync(tokenPath); // 删除过期令牌
    logAudit('TOKEN_RESET_FAILED', 'Token expired');
    db.close();
    process.exit(1);
  }
  
  console.log('🔧 使用令牌重置管理员密码...\n');
  
  const passwordHash = bcrypt.hashSync(newPassword, 10);
  
  db.run('UPDATE users SET password = ? WHERE id = 1', [passwordHash], function(err) {
    if (err) {
      console.error('❌ 重置失败:', err.message);
      logAudit('PASSWORD_RESET_FAILED', err.message);
      db.close();
      process.exit(1);
    }
    
    if (this.changes === 0) {
      console.log('❌ 未找到管理员账号');
      logAudit('PASSWORD_RESET_FAILED', 'Admin account not found');
      db.close();
      process.exit(1);
    }
    
    // 删除已使用的令牌
    fs.unlinkSync(tokenPath);
    
    console.log('✅ 密码重置成功!');
    console.log('   新密码: ********');
    console.log('');
    console.log('💡 令牌已销毁，现在可以使用新密码登录了');
    console.log('');
    
    // 记录审计日志
    logAudit('PASSWORD_RESET_SUCCESS', 'Password reset via token');
    
    db.close();
  });
}

// 交互式重置
async function interactiveReset() {
  console.log('🔐 交互式密码重置向导\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // 先检查当前账号
  db.get('SELECT * FROM users WHERE id = 1', async (err, user) => {
    if (err || !user) {
      console.error('❌ 无法读取管理员账号');
      db.close();
      rl.close();
      process.exit(1);
    }
    
    console.log('当前管理员账号:');
    console.log('   用户名:', user.username);
    console.log('   上次登录:', user.last_login_time || '从未登录');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const newUsername = await question('请输入新用户名 (直接回车保持不变): ');
    const newPassword = await question('请输入新密码 (至少6位): ');
    const confirmPassword = await question('请再次输入新密码: ');
    
    if (newPassword !== confirmPassword) {
      console.error('\n❌ 两次输入的密码不一致');
      db.close();
      rl.close();
      process.exit(1);
    }
    
    if (newPassword.length < 6) {
      console.error('\n❌ 密码长度至少6位');
      db.close();
      rl.close();
      process.exit(1);
    }
    
    const finalUsername = newUsername.trim() || user.username;
    const passwordHash = bcrypt.hashSync(newPassword, 10);
    
    console.log('\n🔧 正在更新...');
    
    db.run('UPDATE users SET username = ?, password = ? WHERE id = 1', [finalUsername, passwordHash], function(err) {
      if (err) {
        console.error('❌ 更新失败:', err.message);
        db.close();
        rl.close();
        process.exit(1);
      }
      
      console.log('\n✅ 更新成功!');
      console.log('   用户名:', finalUsername);
      console.log('   密码: ********');
      console.log('\n💡 现在可以使用新账号登录了\n');
      
      // 记录审计日志
      logAudit('PASSWORD_RESET_SUCCESS', `Password reset via interactive mode, username: ${finalUsername}`);
      
      db.close();
      rl.close();
    });
  });
}

// 主程序
const command = process.argv[2];

if (!command) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SmartNavora 密码管理工具');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('用法:');
  console.log('  node check-password.js check              - 检查当前密码信息');
  console.log('  node check-password.js reset <密码>       - 快速重置密码');
  console.log('  node check-password.js interactive        - 交互式重置（推荐）');
  console.log('  node check-password.js reset-env          - 使用环境变量重置');
  console.log('  node check-password.js generate-token     - 生成紧急重置令牌');
  console.log('  node check-password.js reset-token <令牌> <密码> - 使用令牌重置');
  console.log('');
  console.log('💡 忘记密码？推荐使用: node check-password.js interactive');
  console.log('');
  db.close();
  process.exit(0);
}

switch (command) {
  case 'check':
    checkPassword();
    break;
  case 'reset':
    resetPassword(process.argv[3]);
    break;
  case 'reset-env':
    resetWithEnv();
    break;
  case 'generate-token':
    generateToken();
    break;
  case 'reset-token':
    resetWithToken(process.argv[3], process.argv[4]);
    break;
  case 'interactive':
    interactiveReset();
    break;
  default:
    console.error('❌ 未知命令:', command);
    console.error('   运行 node check-password.js 查看帮助');
    db.close();
    process.exit(1);
}
