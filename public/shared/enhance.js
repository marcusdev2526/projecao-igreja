// Melhorias automáticas na letra (rodam no navegador e no servidor):
//  - destacar a palavra-chave de cada slide no estilo do vídeo (sem internet)
//  - achar as linhas sem tradução e inserir a tradução sugerida
import { isChordLine } from './parser.js';

const EN_META = /^(artista|autor|artist|author|tom|key|bpm|tags|ordem|order|notas?|note|t[íi]tulo)\s*:/i;
const EN_LABEL = /^\[[^\]]+\]\s*(\(?\s*\d+\s*x\s*\)?)?$|^(pr[ée][\s-]?refr[aã]o|pre[\s-]?chorus|refr[aã]o|chorus|coro|verso|verse|estrofe|ponte|bridge|intro|final|outro)\s*\d*\s*:?\s*(\(?\s*\d+\s*x\s*\)?)?$/i;
const EN_MARKUP = /[*_^~]/;

const EN_STOP = new Set(`a o as os um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas para pra pro com sem sob que se e é ou mas mais como quando onde quem eu tu ele ela nós vós eles elas me te lhe nos vos meu minha meus minhas teu tua teus tuas seu sua seus suas nosso nossa este esta isto esse essa isso aquele aquela aquilo ao aos à às já não sim só tão também até lá aqui ali há foi ser sou és está estou vou vai vem tem ter todo toda todos todas cada mesmo
the a an of to in on at for with without by from and or but so as is are was were be been am i you he she it we they me him her us them my your his its our their this that these those not no yes all just will can do does did have has had there here what when where who how oh ah`.split(/\s+/));

const words = (line) => line.split(/\s+/).filter(Boolean);
const bare = (w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
const lowerBare = (w) => bare(w).toLowerCase();

// Índices das linhas de letra (não título, metadado, rótulo, tradução, cifra ou linha em branco)
export function lyricLines(source) {
  const lines = String(source || '').replace(/\r/g, '').split('\n');
  const out = [];
  let seenTitle = false;
  lines.forEach((raw, i) => {
    const t = raw.trim();
    if (!t) return;
    if (!seenTitle && !EN_LABEL.test(t) && !EN_META.test(t)) { seenTitle = true; return; }
    seenTitle = true;
    if (EN_META.test(t) || EN_LABEL.test(t) || t.startsWith('|') || t === '---' || isChordLine(t)) return;
    const next = lines.slice(i + 1).find((l) => l.trim() && !isChordLine(l.trim()));
    out.push({ i, text: t, hasEn: !!next && next.trim().startsWith('|') });
  });
  return { lines, lyric: out };
}

// Agrupa as linhas de letra em slides de até `max` linhas (mesma divisão equilibrada do sistema)
export function chunksOf(source, max = 2) {
  const { lines, lyric } = lyricLines(source);
  const blocks = [];
  let cur = [];
  let last = -2;
  for (const l of lyric) {
    // nova estrofe quando há linha em branco, rótulo ou "---" entre as duas linhas
    const between = lines.slice(last + 1, l.i).map((x) => x.trim());
    if (cur.length && between.some((x) => !x || EN_LABEL.test(x) || x === '---')) { blocks.push(cur); cur = []; }
    cur.push(l);
    last = l.i;
  }
  if (cur.length) blocks.push(cur);
  const chunks = [];
  for (const b of blocks) {
    const n = Math.ceil(b.length / max);
    const base = Math.floor(b.length / n);
    let extra = b.length % n;
    let p = 0;
    for (let k = 0; k < n; k++) {
      const size = base + (extra-- > 0 ? 1 : 0);
      chunks.push(b.slice(p, p + size));
      p += size;
    }
  }
  return { lines, chunks };
}

// Escolhe a palavra mais forte do slide e monta a marcação do estilo do vídeo
export function markChunk(texts, { title = '', freq = new Map() } = {}) {
  if (texts.some((t) => EN_MARKUP.test(t))) return texts;
  const titleWords = new Set(words(title).map(lowerBare));
  let best = null;
  texts.forEach((line, li) => {
    const ws = words(line);
    ws.forEach((w, wi) => {
      const b = lowerBare(w);
      if (b.length < 3 || EN_STOP.has(b) || /^\d+$/.test(b)) return;
      let score = Math.min(b.length, 9);
      if (titleWords.has(b)) score += 4;
      score += Math.min(3, (freq.get(b) || 0) - 1) * 1.5;
      if (wi === ws.length - 1) score += 2.5;
      if (wi === 0) score += 0.5;
      score -= Math.max(0, ws.length - 5) * 0.6;
      if (!best || score > best.score) best = { score, li, wi };
    });
  });
  if (!best) return texts;
  return texts.map((line, li) => {
    if (li < best.li) return `^${line}^`;
    if (li > best.li) return `~${line}~`;
    const ws = words(line);
    const kw = bare(ws[best.wi]);
    const before = ws.slice(0, best.wi).join(' ');
    const after = ws.slice(best.wi + 1).join(' ').replace(/^[,.;:!?]+\s*/, '');
    const nb = before ? words(before).length : 0;
    let out = '';
    if (before) out += nb <= 3 && !after ? `_${before}_ ` : `^${before}^ `;
    out += `*${kw}*`;
    if (after) out += ` ~${after}~`;
    return out;
  });
}

// Frequência das palavras na letra (palavra que se repete costuma ser a principal)
export function wordFreq(source) {
  const f = new Map();
  for (const l of lyricLines(source).lyric) for (const w of words(l.text)) {
    const b = lowerBare(w);
    if (b.length >= 3 && !EN_STOP.has(b)) f.set(b, (f.get(b) || 0) + 1);
  }
  return f;
}

// Aplica marcações sugeridas: markedChunks[k] = linhas marcadas do chunk k (null = manter)
export function applyChunks(source, max, markedChunks) {
  const { lines, chunks } = chunksOf(source, max);
  chunks.forEach((ch, k) => {
    const m = markedChunks[k];
    if (!m || m.length !== ch.length) return;
    ch.forEach((l, j) => {
      const indent = lines[l.i].match(/^\s*/)[0];
      lines[l.i] = indent + m[j];
    });
  });
  return lines.join('\n');
}

export function autoKeywords(source, { title = '', max = 2 } = {}) {
  const freq = wordFreq(source);
  const { chunks } = chunksOf(source, max);
  return applyChunks(source, max, chunks.map((ch) => markChunk(ch.map((l) => l.text), { title, freq })));
}

// Confere se a marcação mudou só o estilo (mesmas palavras, mesma ordem)
const letters = (s) => s.replace(/[*_^~]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const sameWords = (a, b) => letters(a) === letters(b);

// Linhas sem tradução e inserção das traduções
export const missingTranslations = (source) => lyricLines(source).lyric.filter((l) => !l.hasEn);
export function insertTranslations(source, map) {
  const lines = String(source).replace(/\r/g, '').split('\n');
  const out = [];
  lines.forEach((l, i) => {
    out.push(l);
    if (map.has(i) && map.get(i)) out.push('| ' + String(map.get(i)).replace(/\n/g, ' ').trim());
  });
  return out.join('\n');
}
