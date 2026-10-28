// 알프스 워크 서비스 워커 — 홈 화면 앱 설치 + 빠른 실행 + 오프라인일 때 마지막 화면
// API(/api)·Firebase 요청은 건드리지 않습니다. 새 버전은 다음 실행 때 자동으로 바뀝니다.
const CACHE = 'alfs-work-v1'
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'])).catch(() => {}))
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/__/')) return
  // 화면 이동: 네트워크 먼저, 안 되면 저장해 둔 첫 화면
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('/index.html', copy)); return r }).catch(() => caches.match('/index.html')))
    return
  }
  // 빌드 파일(assets/*)은 이름에 버전이 붙어 있어 저장해 두고 씀
  if (url.pathname.startsWith('/assets/') || /\.(png|jpg|webp|svg|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) } return r })))
  }
})
