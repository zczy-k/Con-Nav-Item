const CACHE_NAME = 'con-nav-item-v3';
const RUNTIME_CACHE = 'con-nav-runtime-v3';

// 需要预缓存的核心资源
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// 安装事件 - 预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE)
          .map(cacheName => {
            return caches.delete(cacheName);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch 事件 - 网络优先策略（导航站需要最新数据）
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 跳过非 GET 请求
  if (request.method !== 'GET') {
    return;
  }

  // 跳过 Chrome 扩展请求
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // API 请求：网络优先，不缓存
  if (url.pathname.startsWith('/api/')) {
    // 壁纸 API 绝不缓存，确保每次都是新壁纸
    if (url.pathname.includes('/wallpaper/')) {
      event.respondWith(
        fetch(request, { cache: 'no-store' })
          .then(response => response)
          .catch(error => {
            return new Response(JSON.stringify({ error: '获取壁纸失败，请检查网络' }), {
              headers: { 'Content-Type': 'application/json' },
              status: 503
            });
          })
      );
      return;
    }
    
    // 其他 API 请求：网络优先
    event.respondWith(
      fetch(request)
        .then(response => {
          // 成功则返回
          return response;
        })
        .catch(() => {
          // 网络失败，返回离线提示
          return new Response(JSON.stringify({ error: '网络连接失败，请检查网络' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 503
          });
        })
    );
    return;
  }

  // 静态资源：缓存优先，网络更新
  event.respondWith(
    caches.open(RUNTIME_CACHE).then(cache => {
      return cache.match(request).then(cachedResponse => {
        const fetchPromise = fetch(request).then(networkResponse => {
          // 只缓存成功的响应
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // 网络失败，返回缓存（如果有）
          return cachedResponse;
        });

        // 有缓存则立即返回，同时后台更新
        return cachedResponse || fetchPromise;
      });
    })
  );
});

// 消息事件 - 支持手动更新
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
