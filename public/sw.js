/* 家計簿アプリの Service Worker
 *
 * 方針:
 *  - アイコンなどの静的ファイルだけをキャッシュする（cache first）
 *  - 画面の取得はネットワーク優先。失敗したときだけキャッシュを使う
 *  - Supabase への通信や認証は一切キャッシュしない（古いデータ・古いセッションを見せないため）
 */
const CACHE_NAME = 'kakeibo-v1';
const PRECACHE = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // 別オリジン（Supabase など）は素通し
  if (url.origin !== self.location.origin) return;
  // 認証や API のやりとりはキャッシュしない
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  // 画面遷移: ネットワーク優先
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached ?? caches.match('/')),
      ),
    );
    return;
  }

  // 静的ファイル: キャッシュ優先
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      }),
    );
  }
});
