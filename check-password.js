#!/usr/bin/env node

/**
 * 密码问题诊断和重置工具
 * 
 * 使用方法：
 * 1. 检查当前密码: node check-password.js check
 * 2. 重置密码: node check-password.js reset <新密码>
 * 3. 使用环境变量密码重置: node check-password.js reset-env
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database', 'nav.db');

if (!fs.existsSync(dbPath)) {
  console.error('❌ 数据库文件不存在:', dbPath);
  console.error('   请先启动应用以初始化数据库');
  process.exit(1);
}

const db = new sqlite3.Database(dbPath);

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
      db.close();
      process.exit(1);
    }
    
    if (this.changes === 0) {
      console.log('❌ 未找到管理员账号');
      db.close();
      process.exit(1);
    }
    
    console.log('✅ 密码重置成功!');
    console.log('   新密码:', newPassword);
    console.log('');
    console.log('💡 现在可以使用新密码登录了');
    console.log('');
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

// 主程序
const command = process.argv[2];

if (!command) {
  console.log('密码问题诊断和重置工具\n');
  console.log('用法:');
  console.log('  node check-password.js check          - 检查当前密码信息');
  console.log('  node check-password.js reset <密码>   - 重置为指定密码');
  console.log('  node check-password.js reset-env      - 使用环境变量重置密码');
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
  default:
    console.error('❌ 未知命令:', command);
    console.error('   运行 node check-password.js 查看帮助');
    db.close();
    process.exit(1);
}
