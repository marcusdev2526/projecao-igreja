// Renderização de um slide no "palco" 1920x1080 (telão, prévia e editor usam o mesmo código).
import { themeById, applyCustomTheme, resetTheme } from './themes.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// *PALAVRA* = palavra-chave gigante · _texto_ = serifada itálica · ^texto^ = pequeno acima · ~texto~ = pequeno abaixo
export function tokenize(line) {
  const out = [];
  const re = /(\*[^*]+\*|_[^_]+_|\^[^^]+\^|~[^~]+~)/g;
  let last = 0;
  let m;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push({ t: 'plain', s: line.slice(last, m.index) });
    const tok = m[0];
    const t = { '*': 'kw', _: 'serif', '^': 'above', '~': 'below' }[tok[0]];
    out.push({ t, s: tok.slice(1, -1) });
    last = m.index + tok.length;
  }
  if (last < line.length) out.push({ t: 'plain', s: line.slice(last) });
  return out.filter((x) => x.s.trim() || x.t === 'plain');
}

// Letras que vêm TODAS EM MAIÚSCULAS ficam em caixa normal ("Uma chuva diferente…"),
// mantendo maiúsculas em nomes de Deus e no "I" do inglês. Linhas normais não mudam.
const KEEP_CAP = new Set(['deus', 'senhor', 'jesus', 'cristo', 'espírito', 'pai', 'emanuel', 'jeová', 'javé', 'yeshua', 'messias', 'god', 'lord', 'christ', 'spirit', 'father', 'savior', 'saviour', 'messiah']);
export function niceCase(s) {
  const str = String(s || '');
  const letters = str.replace(/[^\p{L}]/gu, '');
  if (letters.length < 4 || letters !== letters.toUpperCase() || letters === letters.toLowerCase()) return str;
  const out = str.toLowerCase().replace(/[\p{L}]+(?:['’][\p{L}]+)?/gu, (w) => {
    if (w === 'i' || /^i['’]/.test(w)) return 'I' + w.slice(1);
    return KEEP_CAP.has(w) ? w[0].toUpperCase() + w.slice(1) : w;
  });
  return out.replace(/^([^\p{L}]*)(\p{L})/u, (m, a, b) => a + b.toUpperCase());
}

export const stripMarkup = (s) => tokenize(s || '').map((x) => x.s).join('').replace(/\s+/g, ' ').trim();

function lineHTML(line, asIs = false) {
  if (!asIs) line = niceCase(line);
  const toks = tokenize(line);
  const styled = toks.some((x) => x.t !== 'plain');
  if (!styled) return `<div class="ln plain-line"><div class="mn">${esc(line)}</div></div>`;
  const above = toks.filter((x) => x.t === 'above').map((x) => esc(x.s.trim())).join(' ');
  const below = toks.filter((x) => x.t === 'below').map((x) => esc(x.s.trim())).join(' ');
  const main = toks
    .filter((x) => ['kw', 'serif', 'plain'].includes(x.t))
    .map((x) => (x.t === 'plain' ? (x.s.trim() ? `<span class="pl">${esc(x.s.trim())}</span>` : '') : `<span class="${x.t}">${esc(x.s.trim())}</span>`))
    .join('');
  const hasKw = toks.some((x) => x.t === 'kw');
  return `<div class="ln${hasKw ? ' has-kw' : ''}">${above ? `<div class="ab">${above}</div>` : ''}${main ? `<div class="mn">${main}</div>` : ''}${below ? `<div class="bl">${below}</div>` : ''}</div>`;
}

// mode: 'pt' | 'pt-en' | 'en' | 'en-pt'
export function slideHTML(slide, mode = 'pt') {
  if (!slide) return '';
  if (slide.kind === 'bible') return bibleHTML(slide, mode);
  if (slide.kind === 'text') {
    return `<div class="slide-content mode-pt"><div class="primary">${(slide.text || '').split('\n').map((l) => lineHTML(l, true)).join('')}</div></div>`;
  }
  const lines = slide.lines || [];
  const hasEn = lines.some((l) => l.en);
  const effMode = hasEn ? mode : 'pt';
  const enMain = effMode === 'en' || effMode === 'en-pt';
  const bi = effMode === 'pt-en' || effMode === 'en-pt';
  const primary = lines
    .map((l) => (enMain ? (l.en ? `<div class="ln plain-line"><div class="mn">${esc(niceCase(l.en))}</div></div>` : lineHTML(l.pt)) : lineHTML(l.pt)))
    .join('');
  let secondary = '';
  if (bi) {
    const sec = lines.map((l) => niceCase(enMain ? stripMarkup(l.pt) : l.en)).filter(Boolean);
    if (sec.length) secondary = `<div class="divider"></div><div class="secondary">${sec.map((s) => `<div>${esc(s)}</div>`).join('')}</div>`;
  }
  return `<div class="slide-content ${bi ? 'mode-bi' : 'mode-single'}"><div class="primary">${primary}</div>${secondary}</div>`;
}

// Versículo: texto no idioma principal, tradução embaixo e a referência
function bibleHTML(slide, mode) {
  const l = slide.lines[0] || { pt: '', en: '' };
  const hasSecond = !!l.en;
  const secondMain = hasSecond && (mode === 'en' || mode === 'en-pt');
  const bi = hasSecond && (mode === 'pt-en' || mode === 'en-pt');
  const multi = slide.verses && slide.verses.length > 1;
  const withNums = (k) => slide.verses.map((v) => `<span class="vn">${v.n}</span>${esc(v[k])}`).join(' ');
  const main = multi ? withNums(secondMain ? 'en' : 'pt') : esc(secondMain ? l.en : l.pt);
  const other = multi ? withNums(secondMain ? 'pt' : 'en') : esc(secondMain ? l.pt : l.en);
  const ref = secondMain ? slide.ref?.en : slide.ref?.pt;
  const ver = secondMain ? slide.versions?.en : slide.versions?.pt;
  return `<div class="slide-content bible ${bi ? 'mode-bi' : 'mode-single'}${multi ? ' multi' : ''}"><div class="primary"><div class="verse">${main}</div></div>${
    bi ? `<div class="divider"></div><div class="secondary verse2">${other}</div>` : ''
  }<div class="ref">${esc(ref || slide.name)}${ver ? ` <span>· ${esc(ver)}</span>` : ''}</div></div>`;
}

// Cria um palco 1920x1080 que se ajusta ao tamanho do container
export function createStage(container, { live = false } = {}) {
  container.classList.add('stage-host');
  const stage = document.createElement('div');
  stage.className = 'stage';
  stage.innerHTML = '<div class="bg"></div><div class="dim"></div><div class="layers"></div><div class="logo"></div><div class="black"></div>';
  container.appendChild(stage);
  const api = {
    el: stage,
    themeId: null,
    resize() {
      const w = container.clientWidth;
      const h = container.clientHeight || (w * 9) / 16;
      const s = Math.min(w / 1920, h / 1080);
      stage.style.transform = `translate(${(w - 1920 * s) / 2}px, ${(h - 1080 * s) / 2}px) scale(${s})`;
    },
    // def = definição de tema personalizado (opcional); sem def usa um tema pronto
    setTheme(id, def) {
      const key = def ? id + JSON.stringify(def) : themeById(id).id;
      if (api.themeKey === key) return;
      api.themeKey = key;
      api.themeId = id;
      resetTheme(stage);
      if (def) return applyCustomTheme(stage, def);
      const th = themeById(id);
      stage.classList.add('theme-' + th.id, 'tr-blur');
      stage.querySelector('.bg').innerHTML = th.bg();
    },
    show(html, { animate = live } = {}) {
      const layers = stage.querySelector('.layers');
      const old = [...layers.children];
      const layer = document.createElement('div');
      layer.className = 'content-layer' + (animate ? ' enter' : '');
      layer.innerHTML = html;
      layers.appendChild(layer);
      fit(layer);
      old.forEach((o) => {
        if (animate && stage.dataset.tr !== 'nenhuma') {
          o.classList.add('leave');
          let done = false;
          const rm = () => { if (!done) { done = true; o.remove(); } };
          o.addEventListener('animationend', (e) => e.target === o && rm());
          setTimeout(rm, 3000);
        } else o.remove();
      });
    },
    // Transição escolhida no painel (vale para todos os temas). 'tema' usa a do próprio tema.
    setTransition(name = 'suave', speed = 'normal') {
      stage.dataset.tr = name;
      stage.style.setProperty('--trk', { lenta: 1.6, normal: 1, rapida: 0.55 }[speed] || 1);
    },
    setBlack(on) {
      stage.classList.toggle('is-black', !!on);
    },
  };
  new ResizeObserver(() => api.resize()).observe(container);
  api.resize();
  return api;
}

// Reduz o texto se passar da área segura (8% de margem)
export function fit(layer) {
  const c = layer.querySelector('.slide-content');
  if (!c) return;
  c.style.transform = '';
  const maxW = 1920 * 0.84;
  const maxH = 1080 * 0.84;
  const w = c.scrollWidth;
  const h = c.scrollHeight;
  // --fs = tamanho do texto do tema (100% = normal)
  const fs = parseFloat(getComputedStyle(c).getPropertyValue('--fs')) || 1;
  const s = Math.min(fs, maxW / w, maxH / h);
  if (s !== 1) c.style.transform = `scale(${s})`;
}
