// 加载环境变量
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const menuRoutes = require('./routes/menu');
const cardRoutes = require('./routes/card');
const authRoutes = require('./routes/auth');
const adRoutes = require('./routes/ad');
const friendRoutes = require('./routes/friend');
const userRoutes = require('./routes/user');
const batchRoutes = require('./routes/batch');
const wallpaperRoutes = require('./routes/wallpaper');
const searchEngineRoutes = require('./routes/searchEngine');
const backupRoutes = require('./routes/backup');
const tagRoutes = require('./routes/tag');
const bookmarkSyncRoutes = require('./routes/bookmarkSync');
const compression = require('compression');
const { helmetConfig, sanitizeMiddleware, generalLimiter } = require('./middleware/security');
const { globalErrorHandler, notFoundHandler } = require('./middleware/errorHandler');
const app = express();

// 简单的内存缓存
const cache = new Map();
const CACHE_TTL = 60000; // 1分钟缓存

const PORT = process.env.PORT || 3000;

// 安全中间件
app.use(helmetConfig);
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  maxAge: 86400,
}));
app.use(express.json({ limit: '10mb' }));
app.use(compression());

// 输入清理中间件
app.use(sanitizeMiddleware);

// API请求限流（仅针对API路由）
app.use('/api', generalLimiter);

// 缓存中间件（仅对GET请求）
app.use((req, res, next) => {
  // 排除不应该缓存的路径
  const noCachePaths = [
    '/api/backup',      // 备份相关 API
    '/api/users/profile', // 用户信息
    '/api/cards/detect-duplicates' // 去重检测（需要实时数据）
  ];

  const shouldCache = req.method === 'GET' &&
    req.path.startsWith('/api/') &&
    !noCachePaths.some(path => req.path.startsWith(path));

  if (shouldCache) {
    const cacheKey = req.originalUrl;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json(cached.data);
    }
    // 拦截res.json以缓存响应
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      cache.set(cacheKey, { data, timestamp: Date.now() });
      return originalJson(data);
    };
  }
  next();
});

// 根据环境选择静态文件目录
// 开发环境使用 web/dist，生产环境（如 serv00）使用 public
const fs = require('fs');
const staticDir = fs.existsSync(path.join(__dirname, 'web/dist/index.html'))
  ? path.join(__dirname, 'web/dist')
  : path.join(__dirname, 'public');

console.log(`✓ Using static files from: ${staticDir}`);

// PWA 相关文件的 MIME 类型设置
app.get('/manifest.json', (req, res) => {
  res.type('application/manifest+json');
  res.sendFile(path.join(staticDir, 'manifest.json'));
});
app.get('/sw.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(staticDir, 'sw.js'));
});

app.use(express.static(staticDir, {
  maxAge: '1d',
  etag: true,
  lastModified: true
}));

// SPA Fallback - 为 Vue Router 的 history 模式提供支持
app.use((req, res, next) => {
  // 如果是 GET 请求，且不是 API 或上传路径，且不是静态资源
  if (
    req.method === 'GET' &&
    !req.path.startsWith('/api') &&
    !req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot|json|txt)$/i)
  ) {
    // 返回 index.html，让 Vue Router 处理路由
    res.sendFile(path.join(staticDir, 'index.html'));
  } else {
    next();
  }
});

// 清除缓存的辅助函数
app.clearCache = () => cache.clear();

app.use('/api/menus', menuRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api', authRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/users', userRoutes);
app.use('/api/batch', batchRoutes);
app.use('/api/wallpaper', wallpaperRoutes);
app.use('/api/search-engines', searchEngineRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/bookmark-sync', bookmarkSyncRoutes);

// 启动定时备份任务
try {
  const { startScheduledBackup } = require('./utils/autoBackup');
  startScheduledBackup();
} catch (error) {
  console.error('自动备份模块加载失败:', error.message);
}

// 定期清理过期缓存
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}, 60000); // 每分钟清理一次

// 404错误处理（必须在所有路由之后）
app.use(notFoundHandler);

// 全局错误处理（必须是最后一个中间件）
app.use(globalErrorHandler);

// 初始化数据库
db.initPromise
  .then(() => {
    console.log('✓ Database initialized');

    // 检查是否需要启动服务器
    // 只有被 start-with-https.js require 时不启动（它会自己管理 HTTP/HTTPS）
    const isStartWithHttps = require.main && require.main.filename && require.main.filename.includes('start-with-https');

    if (!isStartWithHttps) {
      // 不指定 IP，兼容各种环境（Passenger/PM2/直接运行）
      app.listen(PORT, () => {
        console.log(`✓ Server running on port ${PORT}`);
      });
    }
  })
  .catch(err => {
    console.error('✗ Failed to start server due to database initialization error:', err);
    process.exit(1);
  });

// 导出 app 以供其他模块使用（Docker/HTTPS）
module.exports = app;
