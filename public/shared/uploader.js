// Envio de arquivos para o sistema (painel e celular do pregador).
// PDF vira imagens aqui mesmo no navegador (pdf.js); o resto vai direto para o servidor.

const PDF = /\.pdf$/i;
const IMG_ONLY = /\.(png|jpe?g|webp)$/i;

export async function pdfToImages(file, onPage) {
  const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    onPage?.(i, doc.numPages);
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1920 / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push(await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9)));
    page.cleanup();
  }
  return out;
}

// Página aberta pelo QR do pregador: os envios levam a chave do link (?s=…&k=…)
const qs = new URLSearchParams(location.search);
const withKey = (url) => (qs.get('k') ? url + (url.includes('?') ? '&' : '?') + 's=' + encodeURIComponent(qs.get('s') || '') + '&k=' + encodeURIComponent(qs.get('k')) : url);
export function xhrUpload(url, fd, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', withKey(url));
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => {
      let data = {};
      try { data = JSON.parse(x.responseText); } catch {}
      if (x.status >= 200 && x.status < 300) resolve(data);
      else reject(new Error(data.error || 'Falha no envio (' + x.status + ')'));
    };
    x.onerror = () => reject(new Error('Sem conexão com o computador da projeção'));
    x.send(fd);
  });
}

const baseName = (n) => n.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();

// Envia uma lista de arquivos. status(texto, fração 0..1) informa o andamento.
// asDeck: imagens soltas viram uma apresentação (em vez de mídia).
export async function sendFiles(files, { serviceId = '', author = '', status = () => {}, asDeck = false } = {}) {
  files = [...files];
  const results = [];
  const pdfs = files.filter((f) => PDF.test(f.name));
  const imgs = asDeck ? files.filter((f) => IMG_ONLY.test(f.name)) : [];
  const rest = files.filter((f) => !PDF.test(f.name) && !imgs.includes(f));

  for (const f of pdfs) {
    status(`Preparando ${f.name}…`, 0);
    try {
      const pages = await pdfToImages(f, (i, n) => status(`Preparando ${f.name}: página ${i} de ${n}`, (i / n) * 0.5));
      const fd = new FormData();
      fd.append('title', baseName(f.name));
      fd.append('author', author);
      fd.append('service_id', serviceId);
      pages.forEach((b, i) => fd.append('files', b, `p${String(i + 1).padStart(3, '0')}.jpg`));
      await xhrUpload('/api/decks', fd, (p) => status(`Enviando ${f.name}…`, 0.5 + p * 0.5));
      results.push({ name: f.name, ok: true, kind: 'deck', slides: pages.length });
    } catch (e) {
      results.push({ name: f.name, ok: false, error: e.message });
    }
  }
  if (imgs.length) {
    const fd = new FormData();
    fd.append('title', baseName(imgs[0].name));
    fd.append('author', author);
    fd.append('service_id', serviceId);
    imgs.forEach((f) => fd.append('files', f));
    try {
      await xhrUpload('/api/decks', fd, (p) => status(`Enviando imagens…`, p));
      results.push({ name: imgs.length + ' imagens', ok: true, kind: 'deck', slides: imgs.length });
    } catch (e) {
      results.push({ name: 'imagens', ok: false, error: e.message });
    }
  }
  if (rest.length) {
    const fd = new FormData();
    fd.append('author', author);
    fd.append('service_id', serviceId);
    rest.forEach((f) => fd.append('files', f));
    const hasPpt = rest.some((f) => /\.(pptx?|ppsx?|pps)$/i.test(f.name));
    try {
      const r = await xhrUpload('/api/upload', fd, (p) => status(p < 1 ? `Enviando ${rest.length} arquivo(s)… ${Math.round(p * 100)}%` : hasPpt ? 'Convertendo o PowerPoint em slides…' : 'Finalizando…', p));
      results.push(...(r.results || []));
    } catch (e) {
      rest.forEach((f) => results.push({ name: f.name, ok: false, error: e.message }));
    }
  }
  return results;
}
