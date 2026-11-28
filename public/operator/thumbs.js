// Miniaturas de vídeo leves: em vez de deixar dezenas de <video> abertos (o navegador só abre 6 conexões
// por vez e o vídeo do telão ficava esperando na fila = atraso e travamento), cada miniatura vira uma
// imagem tirada de um quadro do vídeo, uma de cada vez, e a conexão é liberada logo em seguida.
const cache = new Map(); // url -> dataURL
const queue = [];
let running = 0;
const MAX = 1;

function grab(url) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    let done = false;
    const end = (data) => {
      if (done) return;
      done = true;
      v.removeAttribute('src');
      v.load(); // solta a conexão
      resolve(data);
    };
    v.addEventListener('seeked', () => {
      try {
        const w = 320;
        const h = Math.round((w * (v.videoHeight || 9)) / (v.videoWidth || 16)) || 180;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(v, 0, 0, w, h);
        end(c.toDataURL('image/jpeg', 0.72));
      } catch { end(null); }
    }, { once: true });
    v.addEventListener('loadedmetadata', () => { try { v.currentTime = Math.min(1, (v.duration || 2) / 3); } catch { end(null); } }, { once: true });
    v.addEventListener('error', () => end(null), { once: true });
    setTimeout(() => end(null), 8000);
    v.src = url;
  });
}
function pump() {
  while (running < MAX && queue.length) {
    const { url, els } = queue.shift();
    running++;
    grab(url).then((data) => {
      running--;
      cache.set(url, data || '');
      els.forEach((el) => swap(el, data));
      pump();
    });
  }
}
function swap(video, data) {
  if (!video.isConnected) return;
  if (!data) { video.preload = 'metadata'; video.src = video.dataset.src; return; } // não deu: volta ao normal
  const img = document.createElement('img');
  img.src = data;
  img.alt = '';
  img.className = (video.className + ' vthumb').trim();
  img.draggable = false;
  video.replaceWith(img);
}
function handle(video) {
  if (video.dataset.thumbed) return;
  video.dataset.thumbed = '1';
  const url = (video.getAttribute('src') || '').split('#')[0];
  if (!url) return;
  video.dataset.src = video.getAttribute('src');
  video.removeAttribute('src');
  video.preload = 'none';
  video.load();
  if (cache.has(url)) return swap(video, cache.get(url));
  const q = queue.find((x) => x.url === url);
  if (q) q.els.push(video);
  else queue.push({ url, els: [video] });
  pump();
}
const SEL = 'video[muted][preload="metadata"]:not([controls])';
const scan = (root) => root.querySelectorAll?.(SEL).forEach(handle);
new MutationObserver((muts) => {
  for (const m of muts) for (const n of m.addedNodes) { if (n.nodeType !== 1) continue; if (n.matches?.(SEL)) handle(n); else scan(n); }
}).observe(document.documentElement, { childList: true, subtree: true });
scan(document);
