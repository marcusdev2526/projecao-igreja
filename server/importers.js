// Importadores: texto colado, .txt, .docx, OpenLyrics (.xml), backup (.json)
import mammoth from 'mammoth';
import { parseSong, sectionsToSource } from '../public/shared/parser.js';
import { muflToSources } from './holyrics.js';

// Decodifica TXT: tenta UTF-8; se aparecer caractere inválido, usa Windows-1252 (Bloco de Notas antigo)
export function decodeText(buf) {
  const utf8 = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('windows-1252').decode(buf);
}

// Vários louvores no mesmo texto: separe com uma linha "==="
export function splitSongs(text) {
  return String(text)
    .replace(/\r/g, '')
    .split(/\n\s*={3,}\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const OL_NAMES = { v: 'Verso', c: 'Refrão', b: 'Ponte', p: 'Pré-refrão', e: 'Final', i: 'Intro', o: 'Final' };
const OL_CODES = { v: 'V', c: 'R', b: 'P', p: 'PR', e: 'F', i: 'I', o: 'F' };
const decodeEntities = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&amp;/g, '&');
const attr = (tag, name) => (tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`)) || [])[1] || '';

// OpenLyrics: padrão aberto (OpenLP, outros). Junta versos com mesmo nome em PT e EN.
export function openLyricsToSource(xml) {
  const title = decodeEntities((xml.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/) || [])[1] || '').trim();
  const artist = decodeEntities((xml.match(/<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/) || [])[1] || '').trim();
  const key = ((xml.match(/<key>([\s\S]*?)<\/key>/) || [])[1] || '').trim();
  const verseOrder = ((xml.match(/<verseOrder>([\s\S]*?)<\/verseOrder>/) || [])[1] || '').trim();
  const verses = new Map(); // name -> {pt:[], en:[]}
  const langs = [];
  for (const m of xml.matchAll(/<verse\b([^>]*)>([\s\S]*?)<\/verse>/g)) {
    const name = attr(m[1], 'name') || 'v' + (verses.size + 1);
    const lang = (attr(m[1], 'lang') || attr(m[1], 'xml:lang') || '').toLowerCase();
    if (lang && !langs.includes(lang)) langs.push(lang);
    const text = [...m[2].matchAll(/<lines\b[^>]*>([\s\S]*?)<\/lines>/g)]
      .map((l) => l[1].replace(/<br\s*\/?>/g, '\n').replace(/<comment>[\s\S]*?<\/comment>/g, '').replace(/<[^>]+>/g, ''))
      .join('\n');
    const lines = decodeEntities(text).split('\n').map((s) => s.trim()).filter(Boolean);
    if (!verses.has(name)) verses.set(name, { pt: [], en: [] });
    const isEn = lang.startsWith('en') && langs[0] !== lang;
    verses.get(name)[isEn ? 'en' : 'pt'] = lines;
  }
  const codeOf = (n) => {
    const m = n.match(/^([a-z]+)(\d*)/i);
    const t = (m?.[1] || 'v').toLowerCase()[0];
    return (OL_CODES[t] || 'V') + (m?.[2] || (t === 'v' ? '1' : ''));
  };
  const sections = [...verses.entries()].map(([n, v]) => {
    const m = n.match(/^([a-z]+)(\d*)/i);
    const t = (m?.[1] || 'v').toLowerCase()[0];
    const num = m?.[2] && !(t === 'c' && m[2] === '1') ? ' ' + m[2] : '';
    return { name: (OL_NAMES[t] || 'Verso') + num, lines: v.pt.map((pt, i) => ({ pt, en: v.en[i] || '' })) };
  });
  const order = verseOrder ? verseOrder.split(/\s+/).map(codeOf) : null;
  return sectionsToSource({ title, artist, key, order, sections });
}

export async function fileToSources(name, buf) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'txt' || ext === 'md' || ext === 'text') {
    let text = decodeText(buf);
    const base = name.replace(/\.[^.]+$/, '');
    const songs = splitSongs(text);
    // TXT com um louvor sem título claro: usa o nome do arquivo
    if (songs.length === 1 && parseSong(songs[0]).title === '') songs[0] = base + '\n\n' + songs[0];
    return songs;
  }
  if (ext === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    // mammoth separa cada parágrafo com uma linha vazia: volta para 1 parágrafo = 1 linha
    const text = value.replace(/\r/g, '').split('\n\n').join('\n');
    return splitSongs(text);
  }
  if (ext === 'mufl') return muflToSources(buf);
  if (ext === 'xml') return [openLyricsToSource(decodeText(buf))];
  if (ext === 'json') {
    const data = JSON.parse(decodeText(buf));
    const list = Array.isArray(data) ? data : data.songs || [];
    return list.map((s) => s.source).filter(Boolean);
  }
  throw new Error(`Formato não suportado: .${ext} (use .mufl, .txt, .docx, .xml ou .json)`);
}
