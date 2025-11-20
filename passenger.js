// Passenger 启动文件 - 用于 Serv00 等使用 Phusion Passenger 的平台
// 加载环境变量
require('dotenv').config();

const db = require('./db');
const app = require('./app');

// Passenger 会自动处理监听，我们只需要导出 app
// 但是需要先初始化数据库
db.initPromise
  .then(() => {
    console.log('✓ Database initialized, app ready for Passenger');
  })
  .catch(err => {
    console.error('✗ Failed to initialize database:', err);
    process.exit(1);
  });

// 导出 app 供 Passenger 使用
module.exports = app;
