// 加载环境变量
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const { initCryptoSecret } = require('./utils/crypto');
const menuRoutes = require('./routes/menu');
const cardRoutes = require('./routes/card');
const authRoutes = require('./routes/auth');
const promoRoutes = require('./routes/promo');
const friendRoutes = require('./routes/friend');
const userRoutes = require('./routes/user');
const batchRoutes = require('./routes/batch');
const searchEngineRoutes = require('./routes/searchEngine');
const backupRoutes = require('./routes/backup');
const tagRoutes = require('./routes/tag');
const bookmarkSyncRoutes = require('./routes/bookmarkSync');
const aiRoutes = require('./routes/ai');
const compression = require('compression');
const { helmetConfig, sanitizeMiddleware, generalLimiter } = require('./middleware/security');
const { globalErrorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { addClient } = require('./utils/sseManager');
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
    '/api/bookmark-sync', // 书签云同步 API
    '/api/users/profile', // 用户信息
    '/api/cards/detect-duplicates', // 去重检测（需要实时数据）
    '/api/data-version', // 数据版本号（必须实时）
    '/api/ai/batch-task/stream' // AI 任务 SSE 
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
app.use('/api/promos', promoRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/users', userRoutes);
app.use('/api/batch', batchRoutes);
app.use('/api/search-engines', searchEngineRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/bookmark-sync', bookmarkSyncRoutes);
app.use('/api/ai', aiRoutes);

// 数据版本号API（用于前端缓存同步）
app.get('/api/data-version', async (req, res) => {
  // 禁止任何缓存
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  
  try {
    const version = await db.getDataVersion();
    res.json({ version });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SSE端点 - 实时推送数据版本变更
app.get('/api/sse/data-sync', async (req, res) => {
    const clientId = req.query.clientId || null;
    
    // 设置SSE响应头
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // 禁用nginx缓冲
    });
    res.flushHeaders(); // 立即发送响应头
    
    // 保存 clientId 到响应对象，用于广播时识别
    res.clientId = clientId;
    
    // 发送初始版本号
    try {
      const version = await db.getDataVersion();
      res.write(`data: ${JSON.stringify({ type: 'connected', version, clientId })}\n\n`);
      if (res.flush) res.flush();
    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: 'connected', version: 1, clientId })}\n\n`);
      if (res.flush) res.flush();
    }
    
    // 添加到客户端列表
    addClient(res);
    
    // 保持连接（心跳）
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
      if (res.flush) res.flush();
    }, 30000);
    
    // 清理
    req.on('close', () => {
      clearInterval(heartbeat);
    });
  });

// 版本查询API（供扩展轮询使用，非SSE）
app.get('/api/sse/version', async (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  
  try {
    const version = await db.getDataVersion();
    res.json({ version });
  } catch (e) {
    res.json({ version: 1 });
  }
});

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
  .then(async () => {
    console.log('✓ Database initialized');
    
    // 初始化加密密钥（从数据库加载或迁移）
    try {
      await initCryptoSecret();
    } catch (e) {
      console.warn('⚠️ 加密密钥初始化警告:', e.message);
    }

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
