// Работа без интернета. Две копилки:
//  kalima-app   — сам сайт и данные (кладёт app.js после запуска и этот файл по ходу работы);
//  kalima-audio — чтения сур, которые человек скачал кнопкой «Скачать для офлайна».
// Страница берётся из сети, а без сети — из копилки. Остальное — из копилки, если есть.
const APP = 'kalima-app';
const AUDIO = 'kalima-audio';
// Чужие адреса, которые тоже можно сохранить: шрифты, скрипт Telegram, QR-код, тафсиры
const KEEP = ['fonts.googleapis.com', 'fonts.gstatic.com', 'telegram.org', 'cdn.jsdelivr.net', 'api.alquran.cloud'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Плееру нужен кусок файла (Range): режем сохранённый файл сами
async function fromCache(req, res) {
  const range = req.headers.get('range');
  if (!range || res.status !== 200) return res;
  const buf = await res.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  const start = m[1] ? +m[1] : 0, end = m[2] ? Math.min(+m[2], buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { 'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg', 'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' },
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Чтения: только из скачанного, иначе из сети без сохранения
  if (url.hostname === 'everyayah.com') {
    e.respondWith((async () => {
      const hit = await caches.match(url.href, { cacheName: AUDIO, ignoreVary: true });
      return hit ? fromCache(req, hit) : fetch(req);
    })());
    return;
  }

  const own = url.origin === self.location.origin;
  if (!own && !KEEP.includes(url.hostname)) return;

  // Страница: сначала сеть (свежая версия), без сети — сохранённая
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && !res.redirected) (await caches.open(APP)).put('./', res.clone());
        return res;
      } catch (err) {
        const hit = await caches.match('./', { cacheName: APP });
        if (!hit) return Response.error();
        // Ответ после переадресации браузер для страницы не примет — пересобираем
        return hit.redirected ? new Response(await hit.blob(), { headers: hit.headers }) : hit;
      }
    })());
    return;
  }

  const save = async (res) => { if (res.ok || res.type === 'opaque') (await caches.open(APP)).put(req, res.clone()).catch(() => {}); return res; };
  // Не меняются никогда: файлы с меткой версии ?v=, файлы шрифтов, библиотеки с версией, тафсиры.
  // Их берём из копилки. Остальное (скрипт Telegram, картинки без метки) — из сети, без сети из копилки.
  const fixed = (own && /[?&]v=\d/.test(url.search)) || ['fonts.gstatic.com', 'cdn.jsdelivr.net', 'api.alquran.cloud'].includes(url.hostname);
  e.respondWith((async () => {
    const hit = await caches.match(req, { cacheName: APP, ignoreVary: true });
    if (fixed && hit) return hit;
    try { return await save(await fetch(req)); }
    catch (err) { return hit || Response.error(); }
  })());
});
