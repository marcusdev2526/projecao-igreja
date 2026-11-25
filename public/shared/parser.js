// Parser de letras: transforma texto (colado, TXT, DOCX) na estrutura do louvor.
// Roda tanto no servidor (Node) quanto no navegador (editor com prévia ao vivo).
//
// Sintaxe aceita:
//   Primeira linha ............ título
//   Artista: / Tom: / BPM: / Tags: / Ordem:  (metadados, opcionais)
//   [Verso 1] [Refrão] [Ponte] [Pré-refrão] [Final] [Intro]  (ou Verse/Chorus/Bridge)
//   Linha em branco ............ separa estrofes
//   | texto ................... tradução (EN) da linha de cima
//   ---  ...................... força quebra de slide dentro da estrofe
//   (2x) no fim da estrofe ..... repete a estrofe
//   [Refrão] sem linhas ........ repete o refrão já escrito
//   Linhas só com cifras ....... removidas do telão, guardadas para o retorno
//   *PALAVRA* _serifa_ ^acima^ ~abaixo~  (estilo visual, ver render.js)

const CHORD_TOKEN =
  /^\(?[A-G](#|b)?(m|M|maj|min|dim|aug|sus|add|°|º|\+|-)?\d{0,2}(M|maj|sus|add|°|\+|-)?\d{0,2}(\(?[#b+-]?\d{1,2}\)?)*(\/[A-G](#|b)?)?\)?$/;

export function isChordLine(line) {
  const tokens = line.trim().split(/\s+/).filter((t) => t && t !== '|' && t !== '/' && t !== '-');
  return tokens.length > 0 && tokens.every((t) => CHORD_TOKEN.test(t));
}

const SECTION_TYPES = [
  { re: /^(pr[ée][\s-]?refr[aã]o|pre[\s-]?chorus|pr[ée])$/i, prefix: 'PR', name: 'Pré-refrão', type: 'prerefrao' },
  { re: /^(refr[aã]o|chorus|coro|c|r)$/i, prefix: 'R', name: 'Refrão', type: 'refrao' },
  { re: /^(verso|verse|estrofe|parte|v)$/i, prefix: 'V', name: 'Verso', type: 'verso' },
  { re: /^(ponte|bridge|b|p)$/i, prefix: 'P', name: 'Ponte', type: 'ponte' },
  { re: /^(intro|introdu[cç][aã]o|i)$/i, prefix: 'I', name: 'Intro', type: 'intro' },
  { re: /^(final|outro|ending|tag|f|e|o)$/i, prefix: 'F', name: 'Final', type: 'final' },
];
const WORD_LABEL = /^(pr[ée][\s-]?refr[aã]o|pre[\s-]?chorus|refr[aã]o|chorus|coro|verso|verse|estrofe|ponte|bridge|intro|introdu[cç][aã]o|final|outro|ending)\s*(\d*)\s*:?\s*(?:\(?\s*(\d+)\s*x\s*\)?)?$/i;
const BRACKET_LABEL = /^\[([^\]]+)\]\s*(?:\(?\s*(\d+)\s*x\s*\)?)?$/i;
const META = /^(artista|autor|artist|author|tom|key|bpm|tags|ordem|order|notas?|note)\s*:\s*(.*)$/i;
const REPEAT_TAIL = /\s*\(\s*(?:(\d+)\s*x|(bis))\s*\)\s*$/i;

function matchLabel(t) {
  let m = t.match(BRACKET_LABEL);
  let word, num, rep;
  if (m) {
    const inner = m[1].trim();
    const mm = inner.match(/^(.*?)\s*(\d*)$/);
    word = mm[1].trim();
    num = mm[2];
    rep = m[2];
    if (!word) return null;
  } else {
    m = t.match(WORD_LABEL);
    if (!m) return null;
    word = m[1];
    num = m[2];
    rep = m[3];
  }
  const def = SECTION_TYPES.find((d) => d.re.test(word));
  const repeat = rep ? parseInt(rep, 10) : 1;
  if (!def) return { prefix: null, num: '', name: word, type: 'custom', repeat, custom: word };
  return { prefix: def.prefix, num, name: def.name, type: def.type, repeat };
}

const keyOf = (lines) => lines.map((l) => l.pt.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')).join('|');

export function parseSong(text) {
  const lines = String(text || '').replace(/\r/g, '').replace(/\t/g, ' ').split('\n');
  const meta = { title: '', artist: '', key: '', bpm: '', tags: [], order: null, note: '' };
  const blocks = []; // {label|null, lines:[], repeat}
  let cur = null;
  let pendingChords = '';
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length) {
    const first = lines[i].trim();
    if (!matchLabel(first) && !META.test(first)) {
      meta.title = first.replace(/^t[íi]tulo\s*:\s*/i, '');
      i++;
    }
  }
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    const mm = t.match(META);
    if (mm && (!cur || !cur.lines.length || /^(ordem|order)$/i.test(mm[1]))) {
      const k = mm[1].toLowerCase();
      const v = mm[2].trim();
      if (['artista', 'autor', 'artist', 'author'].includes(k)) meta.artist = v;
      else if (k === 'tom' || k === 'key') meta.key = v;
      else if (k === 'bpm') meta.bpm = v;
      else if (/^not/.test(k)) meta.note = v;
      else if (k === 'tags') meta.tags = v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      else meta.order = v.split(/[\s,]+/).map((s) => s.toUpperCase()).filter(Boolean);
      continue;
    }
    if (!t) {
      if (cur && cur.lines.length) cur = null;
      continue;
    }
    const lab = matchLabel(t);
    if (lab) {
      // "[Verso 4]" seguido de "Refrão:" = o rótulo de palavra renomeia a parte
      if (cur && cur.label && !cur.lines.length && !t.startsWith('[')) {
        cur.label = lab;
        cur.repeat = Math.max(cur.repeat, lab.repeat);
        continue;
      }
      cur = { label: lab, lines: [], repeat: lab.repeat };
      blocks.push(cur);
      continue;
    }
    if (t === '---') {
      if (cur && cur.lines.length) cur.lines[cur.lines.length - 1].breakAfter = true;
      continue;
    }
    if (t.startsWith('|')) {
      const en = t.slice(1).trim();
      if (cur && cur.lines.length) {
        const last = cur.lines[cur.lines.length - 1];
        last.en = last.en ? last.en + ' ' + en : en;
      }
      continue;
    }
    if (isChordLine(t)) {
      pendingChords = t;
      continue;
    }
    // "(2x)" no fim da ÚLTIMA linha da estrofe repete a estrofe; "(bis)" e marcas no meio ficam no texto
    let lineText = t.startsWith('\\') ? t.slice(1) : t; // "\Coro" = texto literal, não rótulo
    let rep = 1;
    const rm = lineText.match(REPEAT_TAIL);
    const nextBlank = i + 1 >= lines.length || !lines[i + 1].trim() || !!matchLabel(lines[i + 1].trim());
    if (rm && rm[1] && nextBlank) {
      rep = parseInt(rm[1], 10);
      lineText = lineText.replace(REPEAT_TAIL, '');
    }
    if (!lineText.trim()) {
      // linha só com "(2x)"
      if (cur && rep > 1) cur.pendingRepeat = rep;
      continue;
    }
    if (!cur) {
      cur = { label: null, lines: [], repeat: 1 };
      blocks.push(cur);
    }
    cur.lines.push({ pt: lineText, en: '', chords: pendingChords });
    pendingChords = '';
    if (rep > 1) cur.pendingRepeat = rep; // vale se for a última linha da estrofe
  }
  for (const b of blocks) if (b.pendingRepeat) b.repeat = Math.max(b.repeat, b.pendingRepeat);

  // Monta seções únicas + ordem (arranjo)
  const sections = [];
  const arrangement = [];
  const counters = {};
  const byKey = new Map();
  const hasExplicitChorus = blocks.some((b) => b.label && b.label.type === 'refrao');
  const unlabeledCount = new Map();
  for (const b of blocks) if (!b.label && b.lines.length) unlabeledCount.set(keyOf(b.lines), (unlabeledCount.get(keyOf(b.lines)) || 0) + 1);
  let autoChorusKey = null;
  if (!hasExplicitChorus) for (const [k, n] of unlabeledCount) if (n >= 2) { autoChorusKey = k; break; }

  const pushArr = (code, n) => { for (let r = 0; r < Math.max(1, n); r++) arrangement.push(code); };

  for (const b of blocks) {
    if (!b.lines.length) {
      // Rótulo sem linhas = repetir seção já escrita (ex.: [Refrão])
      if (!b.label) continue;
      const wanted = b.label.prefix ? b.label.prefix + (b.label.num || '') : b.label.custom.toUpperCase();
      const found = sections.find((s) => s.code === wanted) || (!b.label.num && sections.find((s) => b.label.prefix && s.type === b.label.type));
      if (found) pushArr(found.code, b.repeat);
      continue;
    }
    const k = keyOf(b.lines);
    if (byKey.has(k)) {
      const prev = sections.find((s) => s.code === byKey.get(k));
      if (!b.label || (prev.type === b.label.type && !b.label.num)) { pushArr(prev.code, b.repeat); continue; }
    }
    let lab = b.label;
    if (!lab) lab = k === autoChorusKey ? { prefix: 'R', num: '', name: 'Refrão', type: 'refrao' } : { prefix: 'V', num: '', name: 'Verso', type: 'verso' };
    let code;
    let name;
    if (lab.prefix) {
      let num = lab.num;
      if (!num && lab.prefix === 'V') num = String((counters.V || 0) + 1);
      if (num) counters[lab.prefix] = Math.max(counters[lab.prefix] || 0, parseInt(num, 10));
      code = lab.prefix + (num || '');
      if (sections.some((s) => s.code === code)) {
        // mesmo rótulo com letra diferente: numera
        let n = 2;
        while (sections.some((s) => s.code === lab.prefix + n)) n++;
        code = lab.prefix + n;
        num = String(n);
      }
      name = lab.name + (num && !(lab.prefix === 'R' && num === '1') ? ' ' + num : '');
    } else {
      code = lab.custom.toUpperCase().replace(/\s+/g, '');
      name = lab.custom;
    }
    sections.push({ code, name, type: lab.type, lines: b.lines });
    byKey.set(k, code);
    pushArr(code, b.repeat);
  }

  let order = arrangement;
  if (meta.order && meta.order.length) {
    const valid = meta.order.filter((c) => sections.some((s) => s.code === c));
    if (valid.length) order = valid;
  }
  const hasEn = sections.some((s) => s.lines.some((l) => l.en));
  return { ...meta, sections, arrangement: order, hasEn };
}

// Divide em slides seguindo o arranjo. maxLines: 2 (bilíngue) ou 4 (uma língua)
export function buildSlides(parsed, { maxLines = 2 } = {}) {
  const slides = [];
  for (const code of parsed.arrangement) {
    const sec = parsed.sections.find((s) => s.code === code);
    if (!sec) continue;
    // respeita quebras manuais (---)
    const groups = [[]];
    for (const l of sec.lines) {
      groups[groups.length - 1].push(l);
      if (l.breakAfter) groups.push([]);
    }
    const parts = [];
    for (const g of groups.filter((g) => g.length)) {
      const n = Math.ceil(g.length / maxLines);
      const base = Math.floor(g.length / n);
      let extra = g.length % n;
      let p = 0;
      for (let k = 0; k < n; k++) {
        const size = base + (extra-- > 0 ? 1 : 0);
        const chunk = g.slice(p, p + size);
        p += size;
        // linha só com texto pequeno (^acima^ / ~abaixo~) não fica sozinha num slide
        const smallOnly = chunk.every((l) => /^\s*([\^~])[^\^~]+\1\s*$/.test(l.pt));
        if (smallOnly && k > 0) parts[parts.length - 1].push(...chunk);
        else parts.push(chunk);
      }
    }
    parts.forEach((lines, k) => {
      slides.push({ index: slides.length, code, name: sec.name, type: sec.type, part: k + 1, parts: parts.length, lines });
    });
  }
  return slides;
}

export function slideMaxLines(mode) {
  return mode === 'pt' || mode === 'en' ? 4 : 2;
}

// Converte de volta para texto (usado pelos importadores)
export function sectionsToSource({ title, artist, key, order, sections }) {
  const out = [title || 'Sem título'];
  if (artist) out.push('Artista: ' + artist);
  if (key) out.push('Tom: ' + key);
  if (order && order.length) out.push('Ordem: ' + order.join(' '));
  for (const s of sections) {
    out.push('', `[${s.name}]`);
    for (const l of s.lines) {
      out.push(l.pt);
      if (l.en) out.push('| ' + l.en);
    }
  }
  return out.join('\n') + '\n';
}
