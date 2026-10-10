/*
 * Service Worker：让 iOS 上「添加到主屏幕」之后的那个图标**离线也能打开**。
 *
 * 没有它：PWA 每次启动都要回服务器拿 index.html 和 assets —— 断网就是白屏。
 * 这个应用的核心承诺是「不联网也能用」，所以这一层不是加分项，是必需品。
 *
 * 策略刻意选最钝的那种，因为钝的可预测：
 *   - **导航请求**（打开应用）：网络优先，失败就用缓存里的 index.html。
 *     网络优先是为了「发了新版能自动更新」；但只要拿到过一份，断网也能进。
 *   - **同源其它请求**（assets / words.db / wasm / 图标）：缓存优先。
 *     它们的文件名带 hash（words.db 除外），换了版本文件名就变了，
 *     所以不存在「缓存住了旧版本」的问题。
 *
 * 不缓存跨域请求：这个应用本来就完全离线，没有跨域资源。
 *
 * ⚠️ 改了这个文件之后要**改 CACHE 的版本号**，否则老用户手里的 SW
 * 还在跑旧逻辑（浏览器按字节比对，改动会触发更新，但缓存名不变就清不掉旧条目）。
 */

const CACHE = 'wordplanet-v1';
/** 首屏必需的最小集合：只要这一份进过缓存，断网就能进到登录页 */
const SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit ?? caches.match('./'))),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          // 只缓存成功的同源响应；206（Range）不缓存，放进去会污染缓存
          if (res.ok && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
