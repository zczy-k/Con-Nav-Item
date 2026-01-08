require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const db = require('./db');
const { initCryptoSecret } = require('./utils/crypto');
const { helmetConfig, sanitizeMiddleware, generalLimiter } = require('./middleware/security');
const { globalErrorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { addClient } = require('./utils/sseManager');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 缓存管理 ---
const cache = new Map();
const CACHE_TTL = 60000;
const NO_CACHE_PATHS = [
  '/api/backup', '/api/bookmark-sync', '/api/users/profile', 
  '/api/cards/detect-duplicates', '/api/data-version', '/api/ai/batch-task/stream'
];

const cacheMiddleware = (req, res, next) => {
  const shouldCache = req.method === 'GET' && req.path.startsWith('/api/') && !NO_CACHE_PATHS.some(p => req.path.startsWith(p));
  if (!shouldCache) return next();

  const cached = cache.get(req.originalUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return res.json(cached.data);

  const originalJson = res.json.bind(res);
  res.json = (data) => { cache.set(req.originalUrl, { data, timestamp: Date.now() }); return originalJson(data); };
  next();
};

// --- 安全与基础中间件 ---
app.use(helmetConfig);
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true, maxAge: 86400 }));
app.use(express.json({ limit: '10mb' }));
app.use(compression());
app.use(sanitizeMiddleware);
app.use('/api', generalLimiter);
app.use(cacheMiddleware);

// --- 静态文件服务 ---
const staticDir = fs.existsSync(path.join(__dirname, 'web/dist/index.html')) ? path.join(__dirname, 'web/dist') : path.join(__dirname, 'public');
app.get('/manifest.json', (req, res) => { res.type('application/manifest+json'); res.sendFile(path.join(staticDir, 'manifest.json')); });
app.get('/sw.js', (req, res) => { res.type('application/javascript'); res.sendFile(path.join(staticDir, 'sw.js')); });
app.use(express.static(staticDir, { maxAge: '1d', etag: true, lastModified: true }));

// --- API 路由 ---
const routes = {
  menus: './routes/menu', cards: './routes/card', '': './routes/auth', 
  promos: './routes/promo', friends: './routes/friend', users: './routes/user', 
  batch: './routes/batch', 'search-engines': './routes/searchEngine', 
  backup: './routes/backup', tags: './routes/tag', 
  'bookmark-sync': './routes/bookmarkSync', ai: './routes/ai'
};
Object.entries(routes).forEach(([path, file]) => app.use(`/api/${path}`, require(file)));

app.get('/api/data-version', async (req, res) => {
  res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache', Expires: '0' });
  try { res.json({ version: await db.getDataVersion() }); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sse/data-sync', async (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  try { res.write(`data: ${JSON.stringify({ type: 'connected', version: await db.getDataVersion() })}\n\n`); } catch { res.write(`data: ${JSON.stringify({ type: 'connected', version: 1 })}\n\n`); }
  addClient(res);
  const heartbeat = setInterval(() => { res.write(': heartbeat\n\n'); if (res.flush) res.flush(); }, 30000);
  req.on('close', () => clearInterval(heartbeat));
});

// --- SPA 回退 ---
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot|json|txt)$/i)) {
    res.sendFile(path.join(staticDir, 'index.html'));
  } else next();
});

// --- 错误处理 ---
app.use(notFoundHandler);
app.use(globalErrorHandler);

// --- 初始化与启动 ---
app.clearCache = () => cache.clear();
setInterval(() => { const now = Date.now(); for (const [k, v] of cache.entries()) if (now - v.timestamp > CACHE_TTL) cache.delete(k); }, 60000);

db.initPromise.then(async () => {
  await initCryptoSecret().catch(e => console.warn('⚠️ Crypto init warning:', e.message));
  try { require('./utils/autoBackup').startScheduledBackup(); } catch (e) { console.error('Auto backup load failed:', e.message); }
  if (!(require.main && require.main.filename && require.main.filename.includes('start-with-https'))) {
    app.listen(PORT, () => console.log(`✓ Server running on port ${PORT}`));
  }
}).catch(err => { console.error('✗ DB init error:', err); process.exit(1); });

module.exports = app;
