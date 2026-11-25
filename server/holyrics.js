// Importação do Holyrics: arquivo .mufl (exportação de músicas do Holyrics).
// Cada música tem: title, artist, author, lyrics (blocos separados por linha em branco = slides),
// order (índices dos blocos na ordem de apresentação), note, language e translations.
import { readJavaSerialized } from './javaser.js';
import { isChordLine } from '../public/shared/parser.js';

const clean = (s) => String(s ?? '').replace(/\r/g, '').replace(/ /g, ' ');

// Lê uma possível tradução do Holyrics (estrutura String[][]): pega o texto mais longo de cada entrada
function pickTranslation(translations) {
  if (!Array.isArray(translations)) return null;
  for (const t of translations) {
    const parts = (Array.isArray(t) ? t : [t]).filter((x) => typeof x === 'string');
    if (!parts.length) continue;
    const text = parts.reduce((a, b) => (b.length > a.length ? b : a), '');
    const lang = parts.find((x) => x !== text && x.length <= 10) || '';
    if (text.trim()) return { lang, text: clean(text) };
  }
  return null;
}

const blocksOf = (text) =>
  clean(text)
    .split(/\n\s*\n/)
    .map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean))
    // "2", "3." no começo do bloco = número da estrofe nos hinários: não vai para o telão
    .map((lines) => (lines.length > 1 && /^\d{1,2}[.)]?$/.test(lines[0]) ? lines.slice(1) : lines))
    .filter((b) => b.length);

const LABEL_ONLY = /^(coro|refr[aã]o|chorus|ponte|bridge|pr[ée][\s-]?refr[aã]o|final)\s*:?\s*(?:\(?\s*\d+\s*x\s*\)?)?$/i;
const typeOfLabel = (s) => (/ponte|bridge/i.test(s) ? 'ponte' : /pr[ée]/i.test(s) ? 'prerefrao' : /final/i.test(s) ? 'final' : 'refrao');

export function holyricsMusicToSource(m) {
  const blocks = blocksOf(m.lyrics);
  if (!blocks.length) return null;
  // "Refrão" / "Coro:" na 1ª linha do bloco = cabeçalho; bloco só com "Coro" = repetir o refrão
  const header = [];
  const isRef = [];
  blocks.forEach((b, i) => {
    if (LABEL_ONLY.test(b[0]) && b.length > 1) { header[i] = typeOfLabel(b[0]); blocks[i] = b.slice(1); }
    else if (b.length === 1 && LABEL_ONLY.test(b[0])) isRef[i] = typeOfLabel(b[0]);
  });
  const tr = pickTranslation(m.translations);
  const trBlocks = tr ? blocksOf(tr.text) : [];

  // ordem: índices dos blocos; sem ordem = sequência natural
  let order = Array.isArray(m.order) ? m.order.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < blocks.length) : [];
  if (!order.length) order = blocks.map((_, i) => i);

  // blocos com o mesmo texto viram a mesma parte
  const keyOf = (b) => b.join('\n').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const canon = blocks.map((b, i) => blocks.findIndex((x) => keyOf(x) === keyOf(b)));
  order = order.map((i) => canon[i]);
  const uses = {};
  order.forEach((i) => (uses[i] = (uses[i] || 0) + 1));

  // refrão = bloco marcado "Refrão/Coro"; senão, o bloco que mais se repete na ordem
  let chorus = header.findIndex((h) => h === 'refrao');
  if (chorus >= 0) chorus = canon[chorus];
  else for (const [i, n] of Object.entries(uses)) if (n >= 2 && !isRef[i] && (chorus < 0 || n > uses[chorus])) chorus = +i;
  // blocos "Coro" sozinhos apontam para o refrão (se houver um); senão ficam como texto
  if (chorus >= 0) order = order.map((i) => (isRef[i] === 'refrao' ? chorus : i));

  const codes = {};
  let v = 0;
  const sections = [];
  for (const i of [...new Set(order)].sort((a, b) => a - b)) {
    let code, name;
    if (i === chorus) { code = 'R'; name = 'Refrão'; }
    else if (header[i] === 'ponte' && !sections.some((x) => x.code === 'P')) { code = 'P'; name = 'Ponte'; }
    else if (header[i] === 'prerefrao' && !sections.some((x) => x.code === 'PR')) { code = 'PR'; name = 'Pré-refrão'; }
    else { v++; code = 'V' + v; name = 'Verso ' + v; }
    codes[i] = code;
    sections.push({ i, code, name });
  }

  const title = clean(m.title).trim() || 'Sem título';
  const artist = clean(m.artist || m.author).trim();
  const lang = clean(m.language).trim();
  const out = [title];
  if (artist) out.push('Artista: ' + artist);
  if (lang && !/^(pt|pt-br|por|portugu[eê]s)$/i.test(lang)) out.push('Tags: ' + lang);
  if (clean(m.note).trim()) out.push('Notas: ' + clean(m.note).replace(/\n+/g, ' ').trim());
  const natural = sections.map((s) => s.code);
  const ord = order.map((i) => codes[i]);
  // grava a ordem quando difere da natural, ou quando um "(2x)" no fim de um bloco mudaria a ordem do Holyrics
  const hasRepeatMark = blocks.some((b) => /\(\s*\d+\s*x\s*\)\s*$/i.test(b[b.length - 1]));
  if (ord.join(' ') !== natural.join(' ') || hasRepeatMark) out.push('Ordem: ' + ord.join(' '));
  for (const s of sections) {
    out.push('', `[${s.name}]`);
    const en = trBlocks[s.i] || [];
    blocks[s.i].forEach((line, k) => {
      // linha que pareceria rótulo, cifra ou comando vira texto literal
      out.push(/^(\[|\||---$|\\)/.test(line) || LABEL_ONLY.test(line) || /^(artista|autor|tom|ordem|tags|notas?|bpm)\s*:/i.test(line) || isChordLine(line) ? '\\' + line : line);
      if (en[k]) out.push('| ' + en[k]);
    });
  }
  return out.join('\n') + '\n';
}

export function muflToSources(buf) {
  const data = readJavaSerialized(buf);
  const list = Array.isArray(data) ? data : [data];
  const musics = list.filter((m) => m && typeof m === 'object' && 'lyrics' in m && !m.archived);
  if (!musics.length) throw new Error('Nenhuma música encontrada no arquivo do Holyrics');
  return musics.map(holyricsMusicToSource).filter(Boolean);
}
