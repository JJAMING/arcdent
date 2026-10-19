// Arcdent 서비스 워커 — '앱 설치'와 인터넷 끊김 안내 화면용
// ⚠️ 앱 화면(JS/CSS)은 저장(캐시)하지 않습니다. 항상 최신 버전을 불러와서
//    업데이트 후 옛 화면이 남거나 흰 화면이 생기는 문제를 막습니다.
const OFFLINE_CACHE = 'arcdent-offline-v1';
const OFFLINE_ASSETS = ['/offline.html', '/icon-192.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.addAll(OFFLINE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => key !== OFFLINE_CACHE).map(key => caches.delete(key))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    // 화면 이동(페이지 열기)만 처리: 인터넷이 안 되면 안내 화면. 나머지 요청은 그대로 통과
    if (event.request.mode !== 'navigate') return;
    event.respondWith(
        fetch(event.request).catch(() => caches.match('/offline.html')),
    );
});
