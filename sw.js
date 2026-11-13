/* 钢管冷拔工艺计算 —— Service Worker
   策略：
   - 页面（导航请求）：先走网络，拿到就更新缓存；断网时回退到缓存
   - 静态资源（图标/manifest）：先走缓存
   - /api/* 一律直连网络，绝不缓存（数据必须实时）
   所有路径按 SW 所在目录解析，既能跑在局域网根目录，也能跑在 /lengba/ 这种子路径下
*/
const CACHE = 'lengba-shell-v2';
const SCOPE = self.registration.scope;
const SHELL = new URL('index.html', SCOPE).href;
const ASSETS = ['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-180.png', 'icon-1024.png']
  .map((p) => new URL(p, SCOPE).href);

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 数据接口：永远走网络（静态托管上会 404，由页面自己降级为「只存本机」）
  if (url.pathname.indexOf('/api/') >= 0) return;

  // 只处理同源 GET
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  // 导航请求：网络优先，失败回退缓存
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(SHELL, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match(SHELL)))
    );
    return;
  }

  // 其他静态资源：缓存优先
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return resp;
      });
    })
  );
});
