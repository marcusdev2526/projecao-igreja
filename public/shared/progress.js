// Barra de progresso dos slides (como no vídeo de referência):
// um segmento por slide, o que já passou preenchido, o atual em destaque,
// o próximo marcado, os nomes das partes por cima e "Próximo: ..." embaixo.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clean = (s) => String(s || '').replace(/[*_^~|]/g, '').replace(/\s+/g, ' ').trim();
const short = (name) => {
  const m = String(name || '').match(/^(Verso|Refrão|Ponte|Pré-refrão|Final|Intro)\s*(\d*)/i);
  if (!m) return name;
  const ab = { verso: 'V', 'refrão': 'R', ponte: 'P', 'pré-refrão': 'PR', final: 'F', intro: 'I' }[m[1].toLowerCase()];
  return ab + (m[2] || '');
};

// slides: [{ name, part, preview? , lines? }]  index: atual (-1 = nada)  onPick(i)
export function renderProgress(el, { slides = [], index = -1, onPick, showNext = false, labels = false } = {}) {
  if (!el) return;
  if (!slides.length) {
    el.innerHTML = '';
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.classList.add('prog');
  const text = (s) => clean(s.preview || (s.lines || []).map((l) => l.pt).join(' / '));
  // nomes das partes só no começo de cada parte (e só se couber)
  const starts = slides.map((s, i) => i === 0 || s.name !== slides[i - 1].name || (s.part || 1) === 1);
  const segs = slides
    .map((s, i) => {
      const st = i < index ? 'p-done' : i === index ? 'p-cur' : i === index + 1 ? 'p-next' : '';
      return `<button class="seg-i ${st} ${starts[i] ? 'p-start' : ''}" data-i="${i}" title="${esc(`${i + 1}. ${s.name}: ${text(s)}`)}">${
        labels && starts[i] ? `<span class="lb">${esc(short(s.name))}</span>` : ''
      }<i></i></button>`;
    })
    .join('');
  const cur = slides[index];
  const nxt = slides[index + 1];
  el.innerHTML = `<div class="prog-bar">${segs}</div>${
    showNext
      ? `<div class="prog-meta"><span>${cur ? `<b>${index + 1}</b>/${slides.length} · ${esc(cur.name)}` : `${slides.length} slides`}</span><span class="nx">${
          nxt ? `Próximo: <b>${esc(nxt.name)}</b> — ${esc(text(nxt).slice(0, 70))}` : cur ? 'Último slide' : ''
        }</span></div>`
      : ''
  }`;
  el.onclick = (e) => {
    const b = e.target.closest('.seg-i');
    if (b && onPick) onPick(+b.dataset.i);
  };
}

export const PROGRESS_CSS = `
.prog { margin-top: 8px; user-select: none; }
.prog-bar { display: flex; gap: 3px; align-items: center; }
.seg-i { flex: 1; min-width: 3px; border: 0; background: none; padding: 5px 0; cursor: pointer; }
.seg-i i { display: block; height: 3px; border-radius: 2px; background: rgba(255,255,255,.12); transition: background .3s, height .2s; }
.seg-i:hover i { height: 5px; background: rgba(255,255,255,.28); }
.seg-i.p-done i { background: rgba(255,255,255,.42); }
.seg-i.p-cur i { background: var(--prog, #f2921e); height: 4px; }
.seg-i.p-next i { background: rgba(242,146,30,.32); }
.seg-i .lb { display: none; }
.prog-meta { display: flex; justify-content: flex-end; font-size: 12px; color: #7c8592; margin-top: 2px; }
.prog-meta b { color: #c9ced6; font-weight: 600; }
.prog-meta span:first-child { display: none; }
.prog-meta .nx { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
`;
