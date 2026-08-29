// PWA 缓存策略：HTML 导航 network-first（保证拿到最新构建）；静态资源 cache-first
const CACHE = 'tribe-era-v3'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  // HTML 文档：网络优先，失败回退缓存（离线可玩）
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(resp => {
        const copy = resp.clone()
        caches.open(CACHE).then(c => c.put(e.request, copy))
        return resp
      }).catch(() => caches.match(e.request).then(m => m ?? caches.match('/index.html')))
    )
    return
  }
  // 静态资源（hash 文件名）：缓存优先，新资源自动入缓存
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached ??
      fetch(e.request).then(resp => {
        if (resp.ok && new URL(e.request.url).origin === location.origin) {
          const copy = resp.clone()
          caches.open(CACHE).then(c => c.put(e.request, copy))
        }
        return resp
      }).catch(() => caches.match('/index.html'))
    )
  )
})
