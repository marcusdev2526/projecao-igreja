// Temas inspirados no estilo "lyrics" do vídeo de referência.
// Cada tema = classe CSS (cores/fontes em stage.css) + fundo animado (HTML/SVG gerado aqui).

const waves = () => {
  let paths = '';
  for (let i = 0; i < 7; i++) {
    const y = 180 + i * 120;
    const a = 40 + (i % 3) * 25;
    let d = `M0 ${y}`;
    for (let x = 0; x <= 3840; x += 240) d += ` Q${x + 120} ${(x / 240) % 2 ? y - a : y + a} ${x + 240} ${y}`;
    paths += `<path d="${d}" style="animation-duration:${18 + i * 4}s;animation-delay:-${i * 3}s"/>`;
  }
  return paths;
};

const starPath = (cx, cy, r) =>
  `M${cx} ${cy - r} C${cx + r * 0.12} ${cy - r * 0.12} ${cx + r * 0.12} ${cy - r * 0.12} ${cx + r} ${cy} C${cx + r * 0.12} ${cy + r * 0.12} ${cx + r * 0.12} ${cy + r * 0.12} ${cx} ${cy + r} C${cx - r * 0.12} ${cy + r * 0.12} ${cx - r * 0.12} ${cy + r * 0.12} ${cx - r} ${cy} C${cx - r * 0.12} ${cy - r * 0.12} ${cx - r * 0.12} ${cy - r * 0.12} ${cx} ${cy - r}Z`;

const stars = (n, seed = 7) => {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  let out = '';
  for (let i = 0; i < n; i++) out += `<circle cx="${(rnd() * 3840 - 960).toFixed(0)}" cy="${(rnd() * 1080).toFixed(0)}" r="${(rnd() * 1.8 + 0.4).toFixed(1)}" style="animation-delay:-${(rnd() * 6).toFixed(1)}s"/>`;
  return out;
};

// Partículas (neve, brasas, luzes) em posições fixas: o fundo é sempre igual
const particles = (cls, n, seed) => {
  let x = seed;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  let out = '';
  for (let i = 0; i < n; i++) {
    const size = (rnd() * 1 + 0.4).toFixed(2);
    out += `<i class="${cls}" style="left:${(rnd() * 100).toFixed(1)}%;--s:${size};animation-duration:${(8 + rnd() * 14).toFixed(1)}s;animation-delay:-${(rnd() * 20).toFixed(1)}s;--dx:${((rnd() - 0.5) * 160).toFixed(0)}px;top:${(rnd() * 100).toFixed(1)}%"></i>`;
  }
  return out;
};

// Curva senoidal para o tema "Onda fina"
const sine = (w, y, amp, period) => {
  let d = `M0 ${y}`;
  for (let x = 0; x <= w; x += 40) d += ` L${x} ${(y + Math.sin((x / period) * Math.PI * 2) * amp).toFixed(1)}`;
  return d;
};

import { SCENE_THEMES } from './scenes.js';
export const THEME_CATS = { cenas: 'Cenas ilustradas', minimalista: 'Minimalistas', expressivo: 'Expressivos', datas: 'Datas especiais' };

export const THEMES = [
  ...SCENE_THEMES,
  {
    id: 'gravura',
    cat: 'expressivo',
    name: 'Gravura',
    desc: 'Estilo cartaz: globo e nuvens em gravura, pomba em traço, letra laranja pesada e textura de retícula',
    bg: () => {
      let seed = 11;
      const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
      // globo girando de verdade (bem devagar): cada meridiano muda a largura conforme a rotação
      const R = 430;
      const STEPS = 24;
      let mer = '';
      for (let i = 0; i < 12; i++) {
        const vals = Array.from({ length: STEPS + 1 }, (_, k) => (R * Math.abs(Math.sin(((i / 12) + k / STEPS) * Math.PI))).toFixed(1)).join(';');
        mer += `<ellipse cx="960" cy="560" ry="${R}" rx="${(R * Math.abs(Math.sin((i / 12) * Math.PI))).toFixed(1)}"><animate attributeName="rx" dur="160s" repeatCount="indefinite" values="${vals}"/></ellipse>`;
      }
      let par = '';
      for (let i = -3; i <= 3; i++) { const y = 560 + i * 115; const w = Math.sqrt(Math.max(0, R * R - (y - 560) ** 2)); const ry = (w * 0.12).toFixed(1); par += `<ellipse cx="960" cy="${y}" rx="${w.toFixed(1)}" ry="${ry}"/>`; }
      const k0 = Math.random().toString(36).slice(2, 7);
      // nuvens em gravura: bolhas com contorno + hachura
      const cloud = (x, y, k, id) => {
        const puffs = [[0, 0, 70], [70, -30, 85], [160, -10, 75], [230, 20, 60], [110, 30, 70], [40, 40, 55], [190, 45, 55]];
        const c = puffs.map(([dx, dy, r]) => `<circle cx="${x + dx * k}" cy="${y + dy * k}" r="${r * k}"/>`).join('');
        return `<g class="cl" style="--d:${(70 + rnd() * 40).toFixed(0)}s;--dl:-${(rnd() * 30).toFixed(0)}s"><clipPath id="${id}">${c}</clipPath><g clip-path="url(#${id})"><rect x="${x - 120 * k}" y="${y - 140 * k}" width="${420 * k}" height="${260 * k}" fill="#17191e"/><rect x="${x - 120 * k}" y="${y - 140 * k}" width="${420 * k}" height="${260 * k}" fill="url(#grHatch)"/></g><g class="cl-o" filter="url(#grEdge${k0})">${c}</g></g>`;
      };
      return `<svg class="gr-svg" viewBox="-960 0 3840 1080" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="grHatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><path d="M0 4.5 H9" stroke="#8fa3c4" stroke-width="1.6" opacity=".55"/></pattern>
          <pattern id="grHatch2" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><path d="M0 3 H6" stroke="#8fa3c4" stroke-width="1.1" opacity=".45"/></pattern>
          <filter id="grEdge${k0}" x="-10%" y="-10%" width="120%" height="120%"><feMorphology in="SourceAlpha" operator="dilate" radius="2.2" result="d"/><feComposite in="d" in2="SourceAlpha" operator="out" result="e"/><feFlood flood-color="#b5c4dd" flood-opacity=".75"/><feComposite in2="e" operator="in"/></filter>
          <clipPath id="grBall"><circle cx="960" cy="560" r="430"/></clipPath>
        </defs>
        <g class="gr-globe">
          <circle cx="960" cy="560" r="430" fill="url(#grHatch2)" opacity=".35"/>
          <g clip-path="url(#grBall)"><g class="gr-mer">${mer}</g></g>
          <g class="gr-par" clip-path="url(#grBall)">${par}</g>
          <circle class="gr-rim" cx="960" cy="560" r="430"/>
          <circle class="gr-shade" cx="960" cy="560" r="430"/>
        </g>
        ${cloud(420, 520, 1.25, 'gc1' + k0)}${cloud(1240, 820, 1.4, 'gc2' + k0)}${cloud(1480, 420, 0.9, 'gc3' + k0)}${cloud(60, 860, 1.1, 'gc4' + k0)}${cloud(-480, 340, 1, 'gc5' + k0)}${cloud(2150, 640, 1.2, 'gc6' + k0)}
        <g class="gr-lines"><path d="M180 600 H640 M1300 520 H1820"/><path class="dm" d="M180 594 l6 6 -6 6 -6 -6 Z M1820 514 l6 6 -6 6 -6 -6 Z"/></g>
        <g class="gr-dove" transform="translate(60 120)">
          <g class="rays">${Array.from({ length: 22 }, (_, i) => { const a = Math.PI * (0.15 + (i / 21) * 0.7); return `<path d="M200 190 L${(200 + Math.cos(a) * 190).toFixed(1)} ${(190 + Math.sin(a) * 190).toFixed(1)}"/>`; }).join('')}</g>
          <path d="M200 128 C192 128 187 120 190 112 C193 104 205 102 210 110 L222 112 L210 117 C210 124 206 128 200 128 Z"/><path d="M200 128 C186 140 186 175 196 205 L200 214 L204 205 C214 175 214 140 200 128 Z"/><path d="M196 205 L176 250 L200 238 L224 250 L204 205"/><path d="M192 150 C160 130 110 104 40 96 C70 112 92 126 104 140 C80 136 58 140 30 152 C70 156 102 160 128 168 C150 172 172 170 190 166"/><path d="M208 150 C240 130 290 104 360 96 C330 112 308 126 296 140 C320 136 342 140 370 152 C330 156 298 160 272 168 C250 172 228 170 210 166"/><path d="M60 110 C90 118 120 128 150 142 M80 146 C110 150 140 156 170 162 M340 110 C310 118 280 128 250 142 M320 146 C290 150 260 156 230 162"/>
        </g>
      </svg><div class="gr-dots"></div><div class="gr-vig"></div>`;
    },
  },
  {
    id: 'adpc',
    cat: 'expressivo',
    name: 'ADPC',
    desc: 'Cores da logo da igreja: azul do globo, faixas azuis e a chama dourada subindo',
    bg: () => `<div class="globe"></div><svg class="swoosh" viewBox="-960 0 3840 1080" preserveAspectRatio="xMidYMid slice"><path class="s1" d="M-960 760 C-300 560 300 980 960 760 S 2200 560 2880 820"/><path class="s2" d="M-960 860 C-200 700 420 1040 1000 860 S 2300 700 2880 900"/><path class="s3" d="M-960 300 C-200 120 500 420 1100 240 S 2300 120 2880 300"/></svg><div class="flame"></div>${particles('ember adpc-ember', 34, 21)}<div class="vignette"></div>`,
  },
  {
    id: 'pulso',
    cat: 'expressivo',
    name: 'Pulso',
    desc: 'Anéis de luz saindo do centro, no ritmo; no refrão pulsam mais forte',
    bg: () => `<div class="core"></div>${[0, 1, 2, 3, 4].map((i) => `<i class="ring" style="animation-delay:-${i * 1.6}s"></i>`).join('')}<div class="vignette"></div>`,
  },
  {
    id: 'feixes',
    cat: 'expressivo',
    name: 'Feixes de luz',
    desc: 'Raios de luz quentes vindo do alto, como palco; abrem no refrão',
    bg: () => `<div class="haze"></div>${[-34, -18, -6, 6, 18, 34].map((d, i) => `<i class="beam" style="--d:${d}deg;animation-delay:-${i * 1.3}s"></i>`).join('')}<div class="floor"></div>`,
  },
  {
    id: 'vitral',
    cat: 'expressivo',
    name: 'Vitral',
    desc: 'Manchas de cor se misturando devagar, como luz atravessando vitral',
    bg: () => `<i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><i class="blob b4"></i><div class="grain"></div>`,
  },
  {
    id: 'brasa',
    cat: 'expressivo',
    name: 'Brasa',
    desc: 'Vermelho intenso com linhas onduladas',
    bg: () => `<svg class="waves" viewBox="0 0 1920 1080" preserveAspectRatio="none">${waves()}</svg><div class="vignette"></div>`,
  },
  {
    id: 'aurora',
    cat: 'expressivo',
    name: 'Aurora azul',
    desc: 'Feixes de luz diagonais em azul',
    bg: () => `<div class="streak s1"></div><div class="streak s2"></div><div class="streak s3"></div><div class="streak s4"></div><div class="vignette"></div>`,
  },
  {
    id: 'grade',
    cat: 'expressivo',
    name: 'Horizonte',
    desc: 'Grade 3D em movimento, estilo synthwave',
    bg: () => `<div class="glow"></div><div class="plane"><div class="grid"></div></div><div class="vignette"></div>`,
  },
  {
    id: 'orbita',
    cat: 'expressivo',
    name: 'Órbita',
    desc: 'Planeta, órbitas e estrelas',
    bg: () => `<svg class="sky" viewBox="0 0 1920 1080">${stars(180)}</svg><div class="planet"></div><svg class="orbits" viewBox="0 0 1920 1080"><ellipse cx="960" cy="560" rx="760" ry="190"/><ellipse cx="960" cy="560" rx="620" ry="250" class="o2"/></svg><svg class="spark" viewBox="0 0 1920 1080"><path d="${starPath(1480, 300, 24)}"/></svg>`,
  },
  {
    id: 'claro',
    cat: 'minimalista',
    name: 'Claro',
    desc: 'Fundo claro e limpo, texto azul-escuro',
    bg: () => `<div class="soft"></div><svg class="spark" viewBox="0 0 1920 1080"><path d="${starPath(1210, 330, 22)}"/></svg>`,
  },
  // ---------- Minimalistas ----------
  {
    id: 'nevoa',
    cat: 'minimalista',
    name: 'Névoa',
    desc: 'Cinza-azulado com névoa suave se movendo',
    bg: () => `<div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="grain"></div>`,
  },
  {
    id: 'luz',
    cat: 'minimalista',
    name: 'Luz central',
    desc: 'Fundo escuro com uma luz suave que respira',
    bg: () => `<div class="spot"></div><div class="grain"></div>`,
  },
  {
    id: 'linhas',
    cat: 'minimalista',
    name: 'Linhas',
    desc: 'Linhas finas horizontais deslizando devagar',
    bg: () => `<div class="lines"></div><div class="fade"></div>`,
  },
  {
    id: 'pontos',
    cat: 'minimalista',
    name: 'Pontos',
    desc: 'Grade de pontos discreta com brilho passando',
    bg: () => `<div class="dots"></div><div class="sweep"></div>`,
  },
  {
    id: 'onda',
    cat: 'minimalista',
    name: 'Onda fina',
    desc: 'Uma linha de onda delicada atravessando a tela',
    bg: () => `<svg class="wave" viewBox="0 0 3840 1080" preserveAspectRatio="none"><path d="${sine(3840, 760, 46, 640)}"/><path class="w2" d="${sine(3840, 800, 30, 960)}"/></svg>`,
  },
  {
    id: 'poeira',
    cat: 'minimalista',
    name: 'Poeira de luz',
    desc: 'Poucas partículas flutuando bem devagar',
    bg: () => `${particles('mote', 28, 17)}<div class="vignette"></div>`,
  },
  {
    id: 'degrade',
    cat: 'minimalista',
    name: 'Degradê vivo',
    desc: 'Índigo e azul-petróleo mudando suavemente',
    bg: () => `<div class="shift"></div><div class="grain"></div>`,
  },
  {
    id: 'papel',
    cat: 'minimalista',
    name: 'Papel',
    desc: 'Claro, quente e limpo, com luz passando',
    bg: () => `<div class="light"></div><div class="grain"></div>`,
  },
  {
    id: 'grafite',
    cat: 'minimalista',
    name: 'Grafite',
    desc: 'Preto fosco com um brilho diagonal lento',
    bg: () => `<div class="sheen"></div><div class="grain"></div>`,
  },
  {
    id: 'natal',
    cat: 'datas',
    name: 'Natal',
    desc: 'Verde profundo, luz dourada e neve caindo',
    bg: () => `<div class="glow"></div>${particles('flake', 70, 3)}<div class="vignette"></div>`,
  },
  {
    id: 'pascoa',
    cat: 'datas',
    name: 'Páscoa',
    desc: 'Amanhecer dourado com raios de luz',
    bg: () => `<div class="rays"></div><div class="sun"></div><div class="haze"></div>`,
  },
  {
    id: 'ceia',
    cat: 'datas',
    name: 'Santa Ceia',
    desc: 'Vinho escuro com luzes de vela',
    bg: () => `${particles('bokeh', 16, 11)}<div class="vignette"></div>`,
  },
  {
    id: 'pentecostes',
    cat: 'datas',
    name: 'Pentecostes',
    desc: 'Chamas e brasas subindo',
    bg: () => `<div class="fire"></div>${particles('ember', 55, 5)}<div class="vignette"></div>`,
  },
  {
    id: 'simples',
    cat: 'minimalista',
    name: 'Preto simples',
    desc: 'Fundo preto, texto branco, sem efeitos',
    bg: () => ``,
  },
];

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

// Fontes disponíveis offline para os temas personalizados
export const FONTS = {
  kw: ['Unbounded', 'Anton', 'Montserrat', 'Inter', 'Playfair Display'],
  body: ['Inter', 'Montserrat', 'Playfair Display'],
  serif: ['Instrument Serif', 'Playfair Display'],
};

// Tema personalizado padrão (ponto de partida do editor)
export const newCustomTheme = () => ({
  name: 'Novo tema',
  bg: { type: 'anim', anim: 'aurora', color: '#101820', color2: '#3a1c4a', angle: 135, media: '', dim: 0, blur: 0, motion: 'none', mcolor: '#ffffff', speed: 100, mint: 60 },
  text: { fg: '#ffffff', sub: '#cfe0ff', kwFont: 'Unbounded', bodyFont: 'Inter', serifFont: 'Instrument Serif', upper: true, glow: true, size: 100 },
  logo: { media: '', pos: 'br', size: 9 },
  transition: 'blur',
});

const escAttr = (s) => String(s || '').replace(/["<>&]/g, '');

// Movimento por cima de cor, degradê, imagem ou vídeo (temas personalizados)
export const MOTIONS = [
  ['none', 'Sem movimento'],
  ['flow', 'Luz fluindo'],
  ['bokeh', 'Luzes desfocadas'],
  ['embers', 'Partículas subindo'],
  ['stars', 'Estrelas piscando'],
  ['rays', 'Feixes de luz'],
  ['waves', 'Ondas'],
  ['zoom', 'Zoom lento (imagem/vídeo)'],
];
function motionHTML(kind) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const dots = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('');
  if (kind === 'flow') return '<div class="mo mo-flow"><i></i><i></i><i></i></div>';
  if (kind === 'bokeh') return `<div class="mo mo-bokeh">${dots(16, () => `<i style="left:${(rnd() * 100).toFixed(1)}%;top:${(rnd() * 100).toFixed(1)}%;--s:${(40 + rnd() * 160) | 0}px;--d:${(14 + rnd() * 18).toFixed(1)}s;--dl:-${(rnd() * 30).toFixed(1)}s;--o:${(0.25 + rnd() * 0.5).toFixed(2)}"></i>`)}</div>`;
  if (kind === 'embers') return `<div class="mo mo-embers">${dots(40, () => `<i style="left:${(rnd() * 100).toFixed(1)}%;--s:${(3 + rnd() * 6).toFixed(1)}px;--d:${(9 + rnd() * 12).toFixed(1)}s;--dl:-${(rnd() * 20).toFixed(1)}s;--x:${((rnd() - 0.5) * 160) | 0}px"></i>`)}</div>`;
  if (kind === 'stars') return `<div class="mo mo-stars">${dots(90, () => `<i style="left:${(rnd() * 100).toFixed(2)}%;top:${(rnd() * 100).toFixed(2)}%;--s:${(1.5 + rnd() * 3).toFixed(1)}px;--d:${(2 + rnd() * 5).toFixed(1)}s;--dl:-${(rnd() * 6).toFixed(1)}s"></i>`)}</div>`;
  if (kind === 'rays') return '<div class="mo mo-rays"><i></i></div>';
  if (kind === 'waves') return '<svg class="mo mo-waves" viewBox="-960 0 3840 1080" preserveAspectRatio="xMidYMid slice"><path d="M-960 760 C-300 560 300 980 960 760 S 2200 560 2880 820"/><path d="M-960 860 C-200 700 420 1040 1000 860 S 2300 700 2880 900"/><path d="M-960 300 C-200 120 500 420 1100 240 S 2300 120 2880 300"/></svg>';
  return '';
}
const fontStack = (f, fallback) => `'${escAttr(f)}', ${fallback}`;

// Aplica um tema personalizado no palco (cores, fontes, fundo, logo, transição)
export function applyCustomTheme(stage, def) {
  const bg = def.bg || {};
  const tx = def.text || {};
  const el = stage;
  const bgEl = el.querySelector('.bg');
  bgEl.removeAttribute('style');
  bgEl.classList.remove('mo-zoom');
  if (bg.type === 'anim') {
    const base = themeById(bg.anim);
    el.classList.add('theme-' + base.id);
    bgEl.innerHTML = base.bg();
  } else {
    el.classList.add('theme-custom');
    if (bg.type === 'color') bgEl.style.background = escAttr(bg.color) || '#000';
    else if (bg.type === 'gradient') bgEl.style.background = `linear-gradient(${+bg.angle || 135}deg, ${escAttr(bg.color)}, ${escAttr(bg.color2)})`;
    if (bg.type === 'image' && bg.media) bgEl.innerHTML = `<div class="media" style="background-image:url('${escAttr(bg.media)}')"></div>`;
    else if (bg.type === 'video' && bg.media) bgEl.innerHTML = `<video class="media" src="${escAttr(bg.media)}" autoplay muted loop playsinline></video>`;
    else bgEl.innerHTML = '';
    const mo = bg.motion || 'none';
    if (mo !== 'none') {
      if (mo === 'zoom') bgEl.classList.add('mo-zoom'); else bgEl.insertAdjacentHTML('beforeend', motionHTML(mo));
      bgEl.style.setProperty('--mc', escAttr(bg.mcolor) || '#fff');
      bgEl.style.setProperty('--mk', String(100 / Math.max(25, +bg.speed || 100)));
      bgEl.style.setProperty('--mi', String(Math.max(0.05, Math.min(1, (+bg.mint || 60) / 100))));
    }
  }
  const media = bgEl.querySelector('.media');
  if (media && +bg.blur) media.style.filter = `blur(${+bg.blur}px)`;
  const v = bgEl.querySelector('video');
  if (v) v.play?.().catch(() => {});
  el.querySelector('.dim').style.background = `rgba(0,0,0,${Math.min(0.9, (+bg.dim || 0) / 100)})`;
  const set = (k, val) => el.style.setProperty(k, val);
  set('--fg', tx.fg || '#fff');
  set('--sub', tx.sub || 'rgba(255,255,255,.75)');
  set('--kw-font', fontStack(tx.kwFont || 'Unbounded', "'Arial Black', sans-serif"));
  set('--plain-font', fontStack(tx.bodyFont || 'Inter', 'Arial, sans-serif'));
  set('--serif-font', fontStack(tx.serifFont || 'Instrument Serif', 'Georgia, serif'));
  set('--kw-case', tx.upper === false ? 'none' : 'uppercase');
  set('--glow', tx.glow === false ? 'none' : `0 0 36px ${escAttr(tx.fg || '#fff')}55, 0 4px 24px rgba(0,0,0,.45)`);
  set('--fs', String((+tx.size || 100) / 100));
  const lg = def.logo || {};
  el.querySelector('.logo').innerHTML = lg.media ? `<img src="${escAttr(lg.media)}" alt="" class="pos-${escAttr(lg.pos || 'br')}" style="height:${(+lg.size || 9) * 10.8}px">` : '';
  el.classList.add('tr-' + (def.transition || 'blur'));
}

// Limpa o que um tema personalizado colocou no palco
export function resetTheme(stage) {
  [...stage.classList].filter((c) => c.startsWith('theme-') || c.startsWith('tr-')).forEach((c) => stage.classList.remove(c));
  ['--fg', '--sub', '--kw-font', '--plain-font', '--serif-font', '--kw-case', '--glow', '--fs'].forEach((k) => stage.style.removeProperty(k));
  stage.querySelector('.dim').style.background = '';
  stage.querySelector('.logo').innerHTML = '';
  stage.querySelector('.bg').removeAttribute('style');
}
