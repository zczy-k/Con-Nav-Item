// Passenger 启动文件 - 用于 Serv00 等使用 Phusion Passenger 的平台
// 加载环境变量
require('dotenv').config();

// Passenger 会通过环境变量传递端口，确保设置
if (!process.env.PORT) {
  // 如果 Passenger 没有设置 PORT，使用 devil 分配的端口
  // 这个端口应该在 .env 文件中
  console.log('⚠ PORT not set by Passenger, using .env or default');
}

const db = require('./db');
const app = require('./app');

// Passenger 会自动处理监听，我们只需要导出 app
// 但是需要先初始化数据库
db.initPromise
  .then(() => {
    console.log('✓ Database initialized, app ready for Passenger');
    console.log(`✓ PORT: ${process.env.PORT || 'not set'}`);
  })
  .catch(err => {
    console.error('✗ Failed to initialize database:', err);
    process.exit(1);
  });

// 导出 app 供 Passenger 使用
module.exports = app;
