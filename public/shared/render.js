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
  if (slide.kind === 'media') {
    const u = esc(slide.url || '');
    if (slide.mtype === 'video') return `<div class="media-full"><canvas class="amb" width="48" height="27"></canvas><video src="${u}" playsinline preload="auto"></video></div>`;
    // a própria imagem, ampliada e desfocada, preenche as bordas quando ela não ocupa a tela toda
    if (slide.mtype === 'image') return `<div class="media-full"><img class="amb" src="${u}" alt="" aria-hidden="true"><img class="main" src="${u}" alt=""></div>`;
    return ''; // áudio: só o fundo do tema
  }
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
  // texto grande = modo leitura (fundo mais calmo); referência discreta no canto
  const long = (secondMain ? l.en : l.pt).length > 140 ? ' long' : '';
  const part = slide.parts > 1 ? ` <span>${slide.part}/${slide.parts}</span>` : '';
  return `<div class="slide-content bible ${bi ? 'mode-bi' : 'mode-single'}${multi ? ' multi' : ''}${long}"><div class="primary"><div class="verse">${main}</div></div>${
    bi ? `<div class="divider"></div><div class="secondary verse2">${other}</div>` : ''
  }</div><div class="bible-ref">${esc((ref || slide.name).replace(/\s*\(\d\/\d\)$/, ''))}${part}${ver ? ` <span>· ${esc(ver)}</span>` : ''}</div>`;
}

// Cartaz fixo: arte do evento/pregador (imagem) ou motion (vídeo em repetição, sem som)
export function baseHTML(b = {}) {
  const u = esc(b.url || '');
  if (b.mtype === 'video') return `<div class="media-full base"><canvas class="amb" width="48" height="27"></canvas><video class="base-v" src="${u}" autoplay muted loop playsinline></video></div>`;
  return `<div class="media-full base"><img class="amb" src="${u}" alt="" aria-hidden="true"><img class="main" src="${u}" alt=""></div>`;
}

// Tela só com a logo (ou o nome) da igreja
// Logo da ADPC "se montando" (peças em /brand/intro): livro, globo, faixa, chamas e letras
export const ADPC_LOGO = '/brand/adpc.png';
export function logoBuildHTML(h = '') {
  const P = '/brand/intro/';
  let seed = 3;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  return `<div class="logo-build" style="--m:url(${P}mask.png)${h ? ';--lb-h:' + h : ''}">
    <div class="lb-rays"></div><div class="lb-halo"></div>
    <div class="lb-cam">
      ${['book', 'globe', 'swoosh', 'flames', 'flameb', 'A', 'D', 'P', 'C'].map((p) => `<img class="lb-p lb-${p}" src="${P}${p}.png" alt="" draggable="false">`).join('')}
      <div class="lb-flare"></div><div class="lb-shine"></div>
      <div class="lb-embers">${Array.from({ length: 14 }, () => `<i style="--x:${(34 + rnd() * 32).toFixed(1)}%;--d:${(2.6 + rnd() * 2.2).toFixed(2)}s;--dl:${(2.4 + rnd() * 4).toFixed(2)}s;--dx:${((rnd() - 0.5) * 0.12).toFixed(3)}"></i>`).join('')}</div>
    </div>
  </div>`;
}
export function logoHTML(c = {}) {
  if (c.logo === ADPC_LOGO) return `<div class="church-logo">${logoBuildHTML()}</div>`;
  return `<div class="church-logo">${c.logo ? `<img src="${esc(c.logo)}" alt="">` : `<div class="cname">${esc(c.name || 'Bem-vindos')}</div>`}</div>`;
}
// Tela de espera: logo, contagem regressiva até o início e carrossel de avisos
export function waitingHTML(c = {}) {
  const imgs = c.deck?.urls || [];
  return `<div class="waiting${imgs.length ? ' with-ads' : ''}">
    <div class="w-main">
      ${c.logo ? `<img class="w-logo" src="${esc(c.logo)}" alt="">` : c.name ? `<div class="w-name">${esc(c.name)}</div>` : ''}
      <div class="w-text">${esc(c.waitText || 'O culto já vai começar')}</div>
      <div class="w-count" data-start="${esc(c.start || '')}">--:--</div>
      <div class="w-clock"></div>
    </div>
    ${imgs.length ? `<div class="w-ads" data-auto="${c.deck.auto}">${imgs.map((u, i) => `<img src="${esc(u)}" class="${i ? '' : 'on'}" alt="">`).join('')}</div>` : ''}
  </div>`;
}
// atualiza relógio, contagem e carrossel da tela de espera (chamar a cada segundo)
export function tickWaiting(root) {
  const w = root.querySelector('.content-layer:not(.leave) .waiting');
  if (!w) return;
  const now = new Date();
  const cnt = w.querySelector('.w-count');
  const [h, m] = (cnt.dataset.start || '').split(':').map(Number);
  if (!isNaN(h)) {
    const t = new Date(now); t.setHours(h, m || 0, 0, 0);
    let d = Math.round((t - now) / 1000);
    if (d < -3600) { t.setDate(t.getDate() + 1); d = Math.round((t - now) / 1000); }
    cnt.textContent = d > 0 ? (d >= 3600 ? Math.floor(d / 3600) + ':' : '') + String(Math.floor((d % 3600) / 60)).padStart(d >= 3600 ? 2 : 1, '0') + ':' + String(d % 60).padStart(2, '0') : 'Já vamos começar';
    cnt.classList.toggle('now', d <= 0);
  } else cnt.textContent = '';
  w.querySelector('.w-clock').textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const ads = w.querySelector('.w-ads');
  if (ads) {
    const auto = +ads.dataset.auto || 8;
    const imgs = ads.querySelectorAll('img');
    const k = Math.floor(now / 1000 / auto) % imgs.length;
    imgs.forEach((im, i) => im.classList.toggle('on', i === k));
  }
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
    // O palco tem sempre 1080 de altura e a largura acompanha a tela (16:9, 21:9 ultrawide, 4:3…),
    // então o fundo ocupa a tela inteira sem esticar e sem faixas pretas.
    resize() {
      const w = container.clientWidth;
      const h = container.clientHeight || (w * 9) / 16;
      const W = Math.round(Math.min(3840, Math.max(1440, (1080 * w) / h)));
      if (api.width !== W) {
        api.width = W;
        stage.style.width = W + 'px';
        stage.style.setProperty('--sw', W);
        stage.querySelectorAll('.content-layer').forEach(fit);
        sliceBg(stage);
      }
      const s = Math.min(w / W, h / 1080);
      stage.style.transform = `translate(${(w - W * s) / 2}px, ${(h - 1080 * s) / 2}px) scale(${s})`;
    },
    // def = definição de tema personalizado (opcional); sem def usa um tema pronto
    setTheme(id, def) {
      const key = def ? id + JSON.stringify(def) : themeById(id).id;
      if (api.themeKey === key) return;
      api.themeKey = key;
      api.themeId = id;
      resetTheme(stage);
      api.th = null;
      if (def) { applyCustomTheme(stage, def); return sliceBg(stage); }
      const th = themeById(id);
      api.th = th;
      stage.classList.add('theme-' + th.id, 'tr-blur');
      stage.querySelector('.bg').innerHTML = th.bg();
      sliceBg(stage);
    },
    show(html, { animate = live } = {}) {
      const layers = stage.querySelector('.layers');
      const old = [...layers.children];
      const layer = document.createElement('div');
      layer.className = 'content-layer' + (animate ? ' enter' : '');
      layer.innerHTML = html;
      layers.appendChild(layer);
      if (api.th?.onSlide) try { api.th.onSlide(stage, layer); } catch {}
      fit(layer);
      ambientVideo(layer);
      const newIsMedia = !!layer.querySelector('.media-full');
      old.forEach((o) => {
        if (animate && stage.dataset.tr !== 'nenhuma') {
          o.classList.add('leave');
          // de imagem para imagem: a anterior fica firme embaixo até a nova aparecer (sem piscar o fundo)
          if (newIsMedia && o.querySelector('.media-full')) o.classList.add('hold');
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

// Desenhos do fundo acompanham o formato da tela: em vez de ampliar (e cortar) ou esticar,
// a "janela" do desenho fica mais larga ou mais estreita, sempre no mesmo tamanho e centralizada.
function sliceBg(stage) {
  const W = parseFloat(stage.style.width) || 1920;
  stage.querySelectorAll('.bg svg').forEach((svg) => {
    if (!svg.dataset.vb) svg.dataset.vb = svg.getAttribute('viewBox') || '';
    if (svg.dataset.vb !== '0 0 1920 1080' || svg.getAttribute('preserveAspectRatio') === 'none') return;
    svg.setAttribute('viewBox', `${(1920 - W) / 2} 0 ${W} 1080`);
  });
}

// Vídeo que não ocupa a tela toda: as bordas mostram o próprio vídeo, desfocado
function ambientVideo(layer) {
  const v = layer.querySelector('.media-full video');
  const cv = layer.querySelector('.media-full canvas.amb');
  if (!v || !cv) return;
  const ctx = cv.getContext('2d');
  const t = setInterval(() => {
    if (!layer.isConnected) return clearInterval(t);
    if (v.readyState >= 2) try { ctx.drawImage(v, 0, 0, cv.width, cv.height); } catch {}
  }, 120);
}

// Reduz o texto se passar da área segura (8% de margem)
export function fit(layer) {
  const c = layer.querySelector('.slide-content');
  if (!c) return;
  c.style.transform = '';
  const maxW = Math.min(layer.clientWidth || 1920, 1920) * 0.84;
  const maxH = 1080 * 0.84;
  const w = c.scrollWidth;
  const h = c.scrollHeight;
  // --fs = tamanho do texto do tema (100% = normal)
  const fs = parseFloat(getComputedStyle(c).getPropertyValue('--fs')) || 1;
  const s = Math.min(fs, maxW / w, maxH / h);
  if (s !== 1) c.style.transform = `scale(${s})`;
}
