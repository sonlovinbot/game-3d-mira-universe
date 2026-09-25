/* Service worker của Mira — sinh tự động khi build (vite.config.js → plugin miraPwa).
 * Hai chỗ đánh dấu VERSION và PRECACHE bên dưới được thay bằng mã phiên bản và danh sách file của bản build.
 *
 * - Cài đặt: tải sẵn toàn bộ game (HTML, JS, CSS, nhân vật GLB, âm thanh, icon) → chơi offline.
 * - Trang (điều hướng): mạng trước, mất mạng thì dùng index.html đã lưu.
 * - File của game: lấy từ bộ nhớ đệm trước, thiếu thì tải mạng rồi lưu lại.
 * - Google Fonts: dùng bản đã lưu, đồng thời cập nhật ngầm.
 * - Mỗi bản build có mã phiên bản riêng; bản mới cài xong sẽ xoá bộ nhớ đệm cũ.
 */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `mira-${VERSION}`;
const FONT_CACHE = 'mira-fonts';
const SCOPE = new URL(self.registration.scope);
const INDEX = new URL('index.html', SCOPE).href;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE.map((p) => new Request(new URL(p, SCOPE), { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('mira-') && k !== CACHE && k !== FONT_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Trang gửi 'skip-waiting' khi người chơi bấm "Cập nhật".
self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (url.origin !== SCOPE.origin || !url.href.startsWith(SCOPE.href)) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(CACHE)).put(INDEX, res.clone());
        return res;
      } catch {
        return (await caches.match(INDEX)) || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') (await caches.open(CACHE)).put(req, res.clone());
    return res;
  })());
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}
