// Telão que não cai: guarda as páginas do telão/retorno/OBS para reabrir mesmo se o servidor reiniciar.
// Estratégia: rede primeiro; sem rede, usa a cópia guardada. API, socket e mídia nunca passam por aqui.
const CACHE = 'telao-v1';
const SHELL = ['/screen.html', '/stage.html', '/obs.html', '/shared/render.js', '/shared/themes.js', '/shared/scenes.js', '/shared/stage.css', '/shared/progress.js', '/shared/parser.js', '/shared/bible.js', '/socket.io/socket.io.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {}))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/media/') || u.pathname.startsWith('/decks/') || (u.pathname.startsWith('/socket.io/') && u.search)) return;
  const keep = /^\/(screen|stage|obs)\.html$/.test(u.pathname) || u.pathname.startsWith('/shared/') || u.pathname.startsWith('/fonts/') || u.pathname === '/socket.io/socket.io.js' || u.pathname.startsWith('/brand/');
  if (!keep) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(u.pathname.endsWith('.html') ? u.pathname : e.request, copy)); }
      return r;
    }).catch(() => caches.match(u.pathname.endsWith('.html') ? u.pathname : e.request).then((m) => m || Response.error())),
  );
});
