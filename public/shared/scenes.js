// Fundos ilustrados ("cenas") e o tema que monta a cena a partir da letra.
// Tudo é desenho vetorial leve (SVG + CSS), sem imagens externas.

let seed = 1;
const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
const r1 = (n) => Math.round(n * 10) / 10;

// Cumeeira de montanha: picos e vales alternados, com pequenas quebras (traço de desenho)
function ridge(s, x0, x1, base, amp, step = 60) {
  seed = s;
  const pts = [];
  let x = x0;
  let up = rnd() > 0.5;
  pts.push([x0, r1(base - amp * 0.3)]);
  while (x < x1) {
    const w = step * (1.2 + rnd() * 2.2);
    const y = up ? base - amp * (0.45 + rnd() * 0.55) : base - amp * (0.05 + rnd() * 0.3);
    // quebra no meio da encosta
    const mx = x + w * (0.35 + rnd() * 0.3);
    const prev = pts[pts.length - 1][1];
    pts.push([r1(mx), r1(prev + (y - prev) * (0.4 + rnd() * 0.3) + (rnd() - 0.5) * amp * 0.08)]);
    x += w;
    pts.push([r1(x), r1(y)]);
    up = !up;
  }
  return pts;
}
const ridgePath = (pts, bottom = 1100) => `M${pts[0][0]} ${bottom} L${pts.map((p) => p.join(' ')).join(' L')} L${pts[pts.length - 1][0]} ${bottom} Z`;
// Riscos de luz descendo das encostas (o "hachurado" dourado): mais longos e densos nos picos
function hatch(pts, s, dens = 7, len = 110) {
  seed = s;
  let d = '';
  const ys = pts.map((p) => p[1]);
  const top = Math.min(...ys);
  const bot = Math.max(...ys);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const n = Math.max(1, Math.round((bx - ax) / dens));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t + 3;
      const high = 1 - (y - top) / Math.max(1, bot - top);
      if (rnd() > 0.35 + high * 0.6) continue;
      const l = (10 + rnd() * len) * (0.35 + high);
      d += `M${r1(x)} ${r1(y)}l${r1((rnd() - 0.5) * 8)} ${r1(l)}`;
    }
  }
  return d;
}

// ---------------- Cenas prontas ----------------
const SVG = (inner, extra = '') => `<svg class="scene" viewBox="-960 0 3840 1080" preserveAspectRatio="xMidYMid slice" ${extra}>${inner}</svg>`;

let uid = 0;
function luar() {
  const k = ++uid;
  const back = ridge(11, -960, 2880, 800, 330, 80);
  const front = ridge(23, -960, 2880, 960, 300, 70);
  seed = 5;
  let wind = '';
  for (let i = 0; i < 26; i++) { const x = -400 + rnd() * 1300; const y = 120 + rnd() * 520; const w = 80 + rnd() * 180; wind += `M${r1(x)} ${r1(y)} q${r1(w / 4)} -8 ${r1(w / 2)} 0 t${r1(w / 2)} 0`; }
  return SVG(`
    <defs>
      <radialGradient id="mnG${k}" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#fffbe0"/><stop offset=".55" stop-color="#f1d76a"/><stop offset="1" stop-color="#c9a53a"/></radialGradient>
      <filter id="mnT${k}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".011" numOctaves="5" seed="4"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .42  0 0 0 0 .1  0 0 0 -1.6 1.15"/></filter>
      <clipPath id="mnC${k}"><circle cx="1010" cy="430" r="270"/></clipPath>
    </defs>
    <path class="wind" d="${wind}"/>
    <g class="moon"><circle cx="1010" cy="430" r="300" class="halo"/><circle cx="1010" cy="430" r="270" fill="url(#mnG${k})"/><rect x="740" y="160" width="540" height="540" filter="url(#mnT${k})" clip-path="url(#mnC${k})" opacity=".75"/></g>
    <path class="m-back" d="${ridgePath(back)}"/><path class="h-back" d="${hatch(back, 31, 6, 120)}"/>
    <path class="m-front" d="${ridgePath(front)}"/><path class="h-front" d="${hatch(front, 47, 4, 190)}"/>`);
}

function nascer() {
  const k = ++uid;
  return SVG(`
    <defs><radialGradient id="snG${k}" cx="50%" cy="30%" r="70%"><stop offset="0" stop-color="#ffd08a"/><stop offset=".45" stop-color="#ff8a5c"/><stop offset="1" stop-color="#e2508e"/></radialGradient></defs>
    <g class="rings"><circle cx="960" cy="1260" r="1140"/><circle cx="960" cy="1260" r="980"/><circle cx="960" cy="1260" r="840" class="hot"/></g>
    <g class="sun"><circle cx="960" cy="1260" r="700" class="glow"/><circle cx="960" cy="1260" r="640" fill="url(#snG${k})"/></g>`);
}

function mar() {
  seed = 9;
  let waves = '';
  for (let i = 0; i < 14; i++) {
    const y = 640 + i * i * 2.6 + i * 18;
    const a = 6 + i * 1.6;
    const w = 120 + i * 18;
    let d = `M-960 ${y}`;
    for (let x = -960; x < 2880; x += w) d += ` q${w / 4} ${-a} ${w / 2} 0 t${w / 2} 0`;
    waves += `<path d="${d}" style="--i:${i}" opacity="${r1(0.25 + i * 0.05)}"/>`;
  }
  let refl = '';
  for (let i = 0; i < 22; i++) { const y = 650 + i * 19; const w = 40 + rnd() * 120 + i * 6; refl += `M${r1(1200 - w / 2 + (rnd() - 0.5) * 40)} ${y}h${r1(w)}`; }
  return SVG(`<circle class="mmoon" cx="1200" cy="300" r="90"/><circle class="mmoon-h" cx="1200" cy="300" r="140"/><path class="horizon" d="M-960 630 H2880"/><path class="refl" d="${refl}"/><g class="waves">${waves}</g>`);
}

function trigal() {
  seed = 17;
  let stalks = '';
  for (let i = 0; i < 120; i++) {
    const x = -960 + i * 32 + rnd() * 20;
    const h = 240 + rnd() * 260;
    const lean = (rnd() - 0.5) * 60;
    const top = 1080 - h;
    let g = `M${r1(x)} 1090 Q${r1(x + lean * 0.3)} ${r1(1080 - h / 2)} ${r1(x + lean)} ${r1(top)}`;
    for (let k = 0; k < 7; k++) { const yy = top + k * 14; const xx = x + lean - (lean * k) / 40; g += `M${r1(xx)} ${r1(yy)}l-11 -12M${r1(xx)} ${r1(yy)}l11 -12`; }
    stalks += `<path d="${g}" style="--d:${r1(rnd() * 6)}s"/>`;
  }
  return SVG(`<circle class="tsun" cx="960" cy="640" r="170"/><circle class="tsun-h" cx="960" cy="640" r="260"/><path class="thill" d="M-960 820 C-200 760 400 800 960 790 S2200 760 2880 810 V1100 H-960 Z"/><g class="stalks">${stalks}</g>`);
}

function estrelado() {
  seed = 41;
  let stars = '';
  for (let i = 0; i < 180; i++) stars += `<circle cx="${r1(-960 + rnd() * 3840)}" cy="${r1(rnd() * 760)}" r="${r1(0.8 + rnd() * 2.4)}" style="--d:${r1(2 + rnd() * 5)}s;--dl:-${r1(rnd() * 6)}s"/>`;
  const hill = ridge(3, -960, 2880, 930, 160, 120);
  seed = 77;
  let pines = '';
  for (let i = 0; i < 60; i++) {
    const p = hill[Math.floor(rnd() * hill.length)];
    const h = 50 + rnd() * 90;
    pines += `M${p[0]} ${p[1] + 6}v${r1(-h)}m-${r1(h / 4)} ${r1(h * 0.55)}l${r1(h / 4)} ${r1(-h * 0.45)} ${r1(h / 4)} ${r1(h * 0.45)}m-${r1(h * 0.4)} ${r1(h * 0.25)}l${r1(h * 0.15)} ${r1(-h * 0.2)} ${r1(h * 0.15)} ${r1(h * 0.2)}`;
  }
  return SVG(`<g class="stars">${stars}</g><path class="shoot" d="M300 160 l-260 110"/><path class="crescent" d="M1440 170 a130 130 0 1 0 110 230 a105 105 0 1 1 -110 -230 z"/><path class="ehill" d="${ridgePath(hill)}"/><path class="pines" d="${pines}"/>`);
}

function calvario() {
  seed = 61;
  let rays = '';
  for (let i = 0; i < 24; i++) { const a = Math.PI + (i / 23) * Math.PI; rays += `M960 700 L${r1(960 + Math.cos(a) * 2400)} ${r1(700 + Math.sin(a) * 2400)}`; }
  return SVG(`<path class="rays" d="${rays}"/><circle class="csun" cx="960" cy="700" r="210"/><path class="chill" d="M-960 900 C-300 880 500 860 760 760 C860 720 1060 720 1160 760 C1420 860 2200 880 2880 900 V1100 H-960 Z"/>
    <path class="cross" d="M960 330 V735 M880 440 H1040"/><path class="cross sm" d="M760 520 V765 M712 585 H808 M1160 520 V765 M1112 585 H1208"/>`);
}

// ---------------- Cena da letra (motivo escolhido pela letra) ----------------
const P = (d, extra = '') => `<path d="${d}" ${extra}/>`;
const sparkle = (x, y, s) => P(`M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z`);
const leaf = (x, y, rot, k = 1) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${k})">${P('M0 0 C-20 -10 -40 -30 -35 -55 C-25 -50 -18 -60 -12 -75 C-5 -60 5 -60 12 -75 C18 -60 25 -50 35 -55 C40 -30 20 -10 0 0 Z M0 0 V-62')}</g>`;
const fig = (x, y) => P(`M${x} ${y} C${x - 10} ${y + 8} ${x - 10} ${y + 22} ${x} ${y + 26} C${x + 10} ${y + 22} ${x + 10} ${y + 8} ${x} ${y} Z`);
function rays(cx, cy, r0, r1_, n) { let d = ''; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; d += `M${r1(cx + Math.cos(a) * r0)} ${r1(cy + Math.sin(a) * r0)}L${r1(cx + Math.cos(a) * r1_)} ${r1(cy + Math.sin(a) * r1_)}`; } return P(d); }

export const MOTIFS = {
  figueira: () => P('M200 362 C196 330 204 295 198 255 C192 225 176 205 158 188 M198 255 C212 228 232 212 252 196 M199 295 C184 284 168 278 146 272 M200 300 C214 292 232 288 256 282 M120 362 H280') +
    leaf(158, 188, -35) + leaf(252, 196, 35) + leaf(203, 160, 0, 1.15) + leaf(146, 272, -70, 0.9) + leaf(256, 282, 70, 0.9) + leaf(178, 215, -10, 0.7) + fig(185, 200) + fig(228, 214) + fig(160, 262) + fig(238, 270),
  videira: () => { let g = ''; const rows = [4, 3, 3, 2, 1]; rows.forEach((n, r) => { for (let i = 0; i < n; i++) g += `<circle cx="${200 + (i - (n - 1) / 2) * 34}" cy="${175 + r * 30}" r="17"/>`; }); return g + leaf(200, 150, 180, 1.1) + P('M200 150 V95 C200 80 215 70 228 78 C240 86 232 102 220 98') + P('M170 100 c-20 -10 -32 8 -18 20'); },
  arvore: () => P('M200 362 V238 M200 290 L162 250 M200 268 L240 226 M150 362 H250') + P('M118 228 C86 208 92 156 134 150 C138 108 190 92 216 118 C246 96 292 116 286 154 C322 162 318 216 280 228 C250 240 150 240 118 228 Z'),
  sol: () => '<circle cx="200" cy="200" r="72"/>' + rays(200, 200, 100, 140, 16) + P('M40 330 H360 M90 360 H310'),
  lua: () => P('M245 85 A125 125 0 1 0 245 315 A100 100 0 1 1 245 85 Z') + sparkle(300, 120, 14) + sparkle(320, 220, 9) + sparkle(110, 90, 8),
  estrelas: () => sparkle(200, 170, 70) + sparkle(95, 95, 22) + sparkle(310, 110, 30) + sparkle(120, 290, 16) + sparkle(300, 300, 20) + sparkle(60, 200, 10) + sparkle(345, 205, 9),
  montanha: () => P('M20 330 L140 150 L190 218 L252 108 L380 330 M212 176 L252 108 L292 176 L270 168 L252 186 L232 168 Z M10 330 H390') + '<circle cx="320" cy="90" r="22"/>',
  mar: () => [170, 220, 270, 320].map((y, i) => P(`M${20 + i * 10} ${y} q30 -24 60 0 t60 0 t60 0 t60 0 t60 0 t${40 - i * 10} 0`)).join('') + '<circle cx="290" cy="95" r="34"/>',
  rio: () => P('M200 58 C200 58 120 168 120 228 A80 80 0 0 0 280 228 C280 168 200 58 200 58 Z M160 232 A42 42 0 0 0 196 272') + '<ellipse cx="200" cy="346" rx="130" ry="14"/><ellipse cx="200" cy="346" rx="70" ry="7"/>',
  chuva: () => P('M100 210 C70 210 62 168 96 158 C98 118 150 104 172 130 C190 92 262 92 274 140 C312 136 330 176 306 200 C300 208 290 210 280 210 Z') + P('M120 250 l-14 36 M170 250 l-14 36 M220 250 l-14 36 M270 250 l-14 36 M145 305 l-14 36 M195 305 l-14 36 M245 305 l-14 36'),
  fogo: () => P('M200 52 C240 126 302 158 292 250 C286 322 240 352 200 352 C160 352 114 322 110 256 C106 198 146 170 162 118 C176 164 190 176 200 186 C194 140 206 100 200 52 Z M200 222 C226 256 236 282 226 306 C216 330 184 330 174 306 C164 282 184 256 200 222 Z'),
  pomba: () => P('M86 214 C138 202 182 218 222 232 C262 246 300 240 330 214 L352 200 L336 230 C320 262 278 282 228 282 C178 282 138 262 106 240 Z M172 222 C170 160 202 108 262 78 C252 130 246 176 232 232 M204 230 C218 176 252 140 312 124 C292 170 272 206 246 242') + '<circle cx="330" cy="214" r="3"/>' + P('M352 208 C370 216 380 228 384 244 M366 220 l14 -6 M374 234 l14 -2'),
  cruz: () => P('M200 46 V350 M138 118 H262 M56 352 Q200 300 344 352'),
  coroa: () => P('M98 282 L78 138 L150 200 L200 106 L250 200 L322 138 L302 282 Z M98 314 H302') + '<circle cx="78" cy="132" r="9"/><circle cx="200" cy="98" r="9"/><circle cx="322" cy="132" r="9"/><circle cx="200" cy="246" r="14"/>',
  cordeiro: () => P('M128 242 C108 242 104 212 124 202 C118 176 150 166 164 180 C174 160 210 160 220 180 C240 166 270 180 264 202 C284 212 280 242 258 244 Z M150 244 V302 M176 244 V302 M228 244 V302 M252 244 V302 M266 200 C286 184 316 190 318 212 C320 232 300 242 284 234 M284 198 l-12 -16 M80 304 H330'),
  trigo: () => { let g = ''; [[200, 0], [150, -12], [250, 12]].forEach(([x, rot]) => { let d = `M${x} 360 C${x} 290 ${x + 2} 220 ${x + 4} 120`; for (let k = 0; k < 7; k++) { const y = 128 + k * 22; d += ` M${x + 4} ${y + 14} C${x - 18} ${y + 6} ${x - 20} ${y - 10} ${x - 8} ${y - 18} M${x + 4} ${y + 14} C${x + 26} ${y + 6} ${x + 28} ${y - 10} ${x + 16} ${y - 18}`; } g += `<g transform="rotate(${rot} ${x} 360)">${P(d)}</g>`; }); return g; },
  rocha: () => P('M58 332 L110 232 L170 202 L232 150 L302 190 L342 262 L352 332 Z M170 202 L192 262 L160 332 M232 150 L252 232 L300 280 M40 332 H370'),
  caminho: () => P('M70 362 C150 282 182 222 196 122 M330 362 C250 282 218 222 204 122 M36 122 H364') + P('M200 350 C200 290 200 220 200 128', 'stroke-dasharray="16 14"') + '<circle cx="200" cy="96" r="20"/>',
  porta: () => P('M130 340 V172 A70 70 0 0 1 270 172 V340 Z M80 340 H320 M170 340 L122 392 M200 340 V396 M230 340 L278 392') + '<circle cx="246" cy="262" r="6"/>',
  coracao: () => P('M200 330 C120 270 70 220 80 160 C90 110 150 95 200 145 C250 95 310 110 320 160 C330 220 280 270 200 330 Z') + P('M200 145 V60 M170 90 H230'),
  luz: () => P('M168 200 H232 V340 H168 Z M200 118 C222 146 224 172 200 188 C176 172 178 146 200 118 Z M200 200 V188 M140 352 H260') + rays(200, 160, 60, 88, 10),
  pao: () => P('M90 262 C90 202 140 172 200 172 C260 172 310 202 310 262 C310 292 290 302 200 302 C110 302 90 292 90 262 Z M150 202 l20 40 M195 192 l20 44 M240 198 l20 40 M60 326 H340'),
  calice: () => P('M140 108 H260 C260 190 236 232 200 236 C164 232 140 190 140 108 Z M200 236 V318 M148 334 C160 316 240 316 252 334 Z M150 140 H250'),
  flor: () => P('M200 362 C200 302 196 262 200 212 M200 302 C170 292 150 272 146 246 C176 252 192 272 200 296 M200 322 C230 312 250 292 254 266 C224 272 208 292 200 316 M200 212 C180 172 176 132 200 92 C224 132 220 172 200 212 Z M200 210 C170 200 136 176 120 140 C160 140 190 166 200 206 M200 210 C230 200 264 176 280 140 C240 140 210 166 200 206'),
  asas: () => P('M200 222 C160 160 100 140 36 150 C78 170 98 190 108 216 C130 206 160 206 200 222 Z M200 222 C240 160 300 140 364 150 C322 170 302 190 292 216 C270 206 240 206 200 222 Z M200 214 V268 M100 300 q50 -18 100 0 t100 0'),
  ancora: () => P('M200 78 V322 M150 132 H250 M100 252 C110 310 150 332 200 332 C250 332 290 310 300 252 M84 266 L100 246 L120 264 M316 266 L300 246 L280 264') + '<circle cx="200" cy="64" r="18"/>',
  vento: () => P('M60 160 H262 C302 160 312 110 277 105 C252 102 247 130 264 135 M60 220 H322 C362 220 367 270 332 275 C307 278 300 252 317 245 M92 282 H222'),
};

// palavra (sem acento) → motivo. Os mais específicos vêm primeiro.
const KEYS = [
  ['figueira', /\b(figueira|figueiras|figo|figos)\b/],
  ['videira', /\b(videira|vide|uvas?|vinha|vinhas|vinhateiro)\b/],
  ['trigo', /\b(trigo|trigal|colheita|seara|ceifa|ceifeiros?|semente|sementes|espigas?)\b/],
  ['calice', /\b(calice|vinho|taca)\b/],
  ['pao', /\b(pao|paes|ceia|mesa)\b/],
  ['cordeiro', /\b(cordeiro|ovelhas?|pastor|rebanho|aprisco)\b/],
  ['pomba', /\b(espirito|pomba|consolador|uncao)\b/],
  ['cruz', /\b(cruz|calvario|cravos?|madeiro|sangue|crucificado)\b/],
  ['coroa', /\b(coroa|coroas|rei|reis|reino|trono|reinar|reina|majestade|soberano|leao)\b/],
  ['fogo', /\b(fogo|chamas?|brasas?|arder|arde|queima|queimar|labaredas?|avivamento)\b/],
  ['chuva', /\b(chuvas?|chover|chove|nuvens?|orvalho|temporal)\b/],
  ['rio', /\b(rios?|aguas?|fonte|fontes|correnteza|jordao|sede|poco)\b/],
  ['mar', /\b(mar|mares|ondas?|oceanos?|tempestades?|barco|navegar)\b/],
  ['montanha', /\b(montes?|montanhas?|colinas?|siao|monte|alturas)\b/],
  ['rocha', /\b(rocha|pedra|pedras|refugio|fortaleza|alicerce|firme)\b/],
  ['caminho', /\b(caminhos?|estradas?|jornada|passos|deserto|andar|caminhar|trilha)\b/],
  ['porta', /\b(portas?|portao|portoes|abrir|abriu|entrar)\b/],
  ['flor', /\b(lirios?|flor|flores|florescer|floresca|floresce|primavera|rosa|jardim)\b/],
  ['asas', /\b(asas?|aguias?|voar|voo|passaros?)\b/],
  ['ancora', /\b(ancora|esperanca)\b/],
  ['arvore', /\b(arvores?|oliveiras?|raiz|raizes|ramos?|galhos?|cedros?|frutos?|floresta)\b/],
  ['luz', /\b(luz|luzes|lampada|candeia|brilhar|brilha|resplandecer|resplandece|farol|iluminar)\b/],
  ['lua', /\b(lua|noite|noites|anoitecer|madrugada|escuridao|trevas)\b/],
  ['estrelas', /\b(estrelas?|ceus?|firmamento|universo|galaxias?)\b/],
  ['sol', /\b(sol|amanhecer|alvorada|manha|aurora|nascer|levantar|dia)\b/],
  ['vento', /\b(vento|ventos|sopro|brisa)\b/],
  ['coracao', /\b(coracao|coracoes|amor|amo|amar|amado)\b/],
];
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function motifFor(text) {
  const t = norm(text);
  let best = null;
  let pos = Infinity;
  for (const [m, re] of KEYS) { const k = t.search(re); if (k >= 0 && (best === null || KEYS.findIndex((x) => x[0] === m) < KEYS.findIndex((x) => x[0] === best))) { best = m; pos = k; } }
  return best;
}

// Paleta de cada motivo: [cor de cima, cor de baixo, cor do traço]
const PAL = {
  noite: ['#2a1a8f', '#07051e', '#f4d47c'], aurora: ['#5a22d6', '#c63b8c', '#ffe2b0'], oceano: ['#0f4a86', '#04132a', '#bfe6ff'],
  brasa: ['#7a1a12', '#160404', '#ffc98a'], entardecer: ['#8a3a1c', '#1c0b16', '#ffd98a'], real: ['#3d1c86', '#0c0626', '#f4d47c'],
  alvor: ['#2e5aa8', '#0b1532', '#e8f2ff'], verde: ['#1e5a3c', '#06140e', '#e9f5c8'],
};
const MOTIF_PAL = { figueira: 'verde', videira: 'real', arvore: 'verde', trigo: 'entardecer', calice: 'real', pao: 'entardecer', cordeiro: 'alvor', pomba: 'alvor', cruz: 'brasa', coroa: 'real', fogo: 'brasa', chuva: 'oceano', rio: 'oceano', mar: 'oceano', montanha: 'noite', rocha: 'noite', caminho: 'entardecer', porta: 'aurora', flor: 'aurora', asas: 'alvor', ancora: 'oceano', luz: 'noite', lua: 'noite', estrelas: 'noite', sol: 'aurora', vento: 'alvor', coracao: 'aurora' };

function cenaLayer(m) {
  const [a, b, c] = PAL[MOTIF_PAL[m] || 'noite'];
  return `<div class="cena-layer" data-m="${m}" style="--ca:${a};--cb:${b};--cc:${c}"><div class="cena-sky"></div><svg class="cena-motif" viewBox="0 0 400 400" fill="none">${MOTIFS[m]()}</svg></div>`;
}
const hills = () => {
  const a = ridge(91, -960, 2880, 1010, 120, 140);
  const b = ridge(97, -960, 2880, 1060, 90, 110);
  return SVG(`<path class="ch1" d="${ridgePath(a)}"/><path class="ch2" d="${ridgePath(b)}"/>`, 'data-hills');
};

function cenaBg() { return `<div class="cena-wrap">${cenaLayer('sol')}</div>${hills()}<div class="cena-dust"></div>`; }

// Troca o desenho conforme o trecho que entrou e destaca a palavra que gerou a cena
function cenaOnSlide(stage, layer) {
  const text = layer.textContent || '';
  const wrap = stage.querySelector('.cena-wrap');
  if (!wrap || !text.trim()) return;
  const m = motifFor(text);
  if (m) highlight(layer, KEYS.find((k) => k[0] === m)[1]);
  if (!m || wrap.lastElementChild?.dataset.m === m) return;
  wrap.insertAdjacentHTML('beforeend', cenaLayer(m));
  const nu = wrap.lastElementChild;
  nu.querySelectorAll('.cena-motif path, .cena-motif circle, .cena-motif ellipse').forEach((el) => el.setAttribute('pathLength', '1'));
  requestAnimationFrame(() => nu.classList.add('on'));
  [...wrap.children].slice(0, -1).forEach((o) => { o.classList.add('off'); setTimeout(() => o.remove(), 1600); });
}
function highlight(layer, re) {
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (n.parentElement.closest('.cena-hl, .secondary, .bible-ref')) continue;
    const words = [...n.data.matchAll(/[\p{L}]+/gu)];
    const w = words.find((x) => re.test(norm(x[0])));
    if (!w) continue;
    const span = document.createElement('span');
    span.className = 'cena-hl';
    const after = n.splitText(w.index);
    after.splitText(w[0].length);
    span.textContent = after.data;
    after.replaceWith(span);
    return;
  }
}

export const SCENE_THEMES = [
  { id: 'cena', cat: 'cenas', name: 'Cena da letra', desc: 'Monta o desenho pela letra: “figueira” vira uma figueira, “mar” vira ondas, “cruz”, “sol”, “chuva”…', bg: cenaBg, onSlide: cenaOnSlide },
  { id: 'luar', cat: 'cenas', name: 'Montanhas ao luar', desc: 'Lua dourada sobre montanhas em traço, com riscos de luz', bg: luar },
  { id: 'nascer', cat: 'cenas', name: 'Nascer do sol', desc: 'Sol laranja e rosa nascendo com anéis de luz, fundo violeta', bg: nascer },
  { id: 'mar', cat: 'cenas', name: 'Mar ao luar', desc: 'Ondas em linhas finas e o reflexo da lua na água', bg: mar },
  { id: 'trigal', cat: 'cenas', name: 'Campo de trigo', desc: 'Espigas balançando no fim de tarde', bg: trigal },
  { id: 'estrelado', cat: 'cenas', name: 'Noite estrelada', desc: 'Céu cheio de estrelas, lua crescente e pinheiros no monte', bg: estrelado },
  { id: 'calvario', cat: 'cenas', name: 'Calvário', desc: 'Três cruzes no monte com raios do amanhecer', bg: calvario },
];
