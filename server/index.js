// Servidor local: API REST + tempo real (Socket.IO) para telão, retorno e celulares.
import express from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import QRCode from 'qrcode';
import { Server } from 'socket.io';
import { openDb, makeRepo } from './db.js';
import { fileToSources, splitSongs } from './importers.js';
import { parseSong, buildSlides, slideMaxLines } from '../public/shared/parser.js';
import { DEMO_SONGS } from './seed.js';
import fs from 'node:fs';
import { parseBibleJson, seedBibles } from './bibleimport.js';
import { makeDecks, convertPresentation } from './decks.js';
import { makeBackup } from './backup.js';
import { translateLines, keywordChunks, askClaude, alignOfficial, DEFAULT_MODEL } from './ai.js';
import { lyricLines, missingTranslations, insertTranslations, setEnStatus, englishLines } from '../public/shared/enhance.js';
import { fetchLyrics, searchLyricsOnline, fetchOnlineResult } from './urlimport.js';
import { makeUpdater, RESTART_CODE } from './updater.js';
import { parseRef, refText } from '../public/shared/bible.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function startServer({ port = Number(process.env.PORT) || 3000, dataDir = process.env.DATA_DIR || path.join(ROOT, 'data') } = {}) {
  const db = openDb(path.join(dataDir, 'louvores.db'));
  const repo = makeRepo(db);
  seedBibles(repo, path.join(ROOT, 'seed/biblias'));
  const mediaDir = path.join(dataDir, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });

  // Primeira execução: louvores de demonstração + culto de hoje
  if (!repo.listSongs().length) {
    const ids = DEMO_SONGS.map((s) => repo.createSong(s));
    const today = new Date().toLocaleDateString('sv-SE');
    const sid = repo.createService('Culto de domingo', today);
    ids.forEach((id) => repo.addItem(sid, { kind: 'song', song_id: id }));
    repo.addItem(sid, { kind: 'text', title: 'Aviso', text: '^bem-vindos^\n*FAMÍLIA*\n~culto de oração quarta, 19h30~' });
  }

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  app.use(express.json({ limit: '20mb' }));
  app.use(express.static(path.join(ROOT, 'public')));
  app.use('/media', express.static(mediaDir, { maxAge: '1h' }));
  const decks = makeDecks(path.join(dataDir, 'decks'));
  const tmpDir = path.join(dataDir, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  app.use('/decks', express.static(decks.dir, { maxAge: '1h' }));
  app.use('/vendor/pdfjs', express.static(path.join(ROOT, 'node_modules/pdfjs-dist/build')));
  for (const f of ['unbounded', 'instrument-serif', 'inter', 'anton', 'montserrat', 'playfair-display'])
    app.use('/fonts/' + f, express.static(path.join(ROOT, 'node_modules/@fontsource', f)));

  // ---------------- Estado ao vivo ----------------
  const live = {
    mode: repo.getSetting('mode', 'pt'),
    themeId: repo.getSetting('theme', 'adpc'),
    transition: repo.getSetting('transition', 'suave'),
    trSpeed: repo.getSetting('tr_speed', 'normal'),
    black: false,
    clear: false,
    serviceId: null,
    itemId: null,
    songId: null,
    title: '',
    kind: null,
    slides: [],
    index: -1,
    message: '',
    logo: false, // tela só com a logo da igreja
    base: (() => { try { return JSON.parse(repo.getSetting('base', 'null')); } catch { return null; } })(), // cartaz fixo
    showBase: false,
    frozen: false, // telão congelado: o público vê screenSnap enquanto o operador prepara o próximo
    screenSnap: null,
    waiting: false, // tela de espera (logo, contagem regressiva, avisos)
    timing: { serviceStart: null, blockId: null, blockStart: null },
    loggedSongs: new Set(),
    bibleMain: repo.getSetting('bible_main', 'BLIVRE'),
    bibleSecond: repo.getSetting('bible_second', 'KJV'),
    bible: null, // { book, chapter }
    biblePer: Math.min(3, Math.max(1, +repo.getSetting('bible_per', '1') || 1)),
    aspect: +repo.getSetting('aspect', '1.7778') || 16 / 9, // formato da tela do telão (largura / altura)
    player: null, // { url, type: 'video'|'audio', name, status: 'playing'|'paused'|'stopped', seq, after, itemId, volume, seek }
    deck: null, // { id, auto, loop }
  };
  let deckTimer = null;
  const jsonOf = (t) => { try { return JSON.parse(t || '{}'); } catch { return {}; } };
  function setPlayer(p) {
    live.player = p ? { volume: live.player?.volume ?? 1, ...p, seq: (live.player?.seq || 0) + 1 } : live.player && { ...live.player, status: 'stopped', seq: live.player.seq + 1 };
  }
  function stopDeckTimer() { clearInterval(deckTimer); deckTimer = null; }
  function startDeckTimer() {
    stopDeckTimer();
    if (!live.deck?.auto) return;
    deckTimer = setInterval(() => {
      if (live.kind !== 'deck') return stopDeckTimer();
      if (live.index < live.slides.length - 1) live.index++;
      else if (live.deck.loop) live.index = 0;
      else return stopDeckTimer();
      live.clear = false;
      broadcast();
    }, live.deck.auto * 1000);
  }
  // Ao trocar de item: para vídeo/áudio de outro item e o carrossel automático
  function leaveItem(newItemId) {
    stopDeckTimer();
    live.deck = null;
    if (live.player && live.player.status !== 'stopped' && live.player.itemId !== newItemId) setPlayer(null);
  }
  const readJson = (k) => { try { return JSON.parse(repo.getSetting(k, '[]')); } catch { return []; } };
  const bibleHistory = readJson('bible_history');
  function pushHistory(book, chapter, verse) {
    const i = bibleHistory.findIndex((h) => h.book === book && h.chapter === chapter && h.verse === verse);
    if (i >= 0) bibleHistory.splice(i, 1);
    bibleHistory.unshift({ book, chapter, verse, at: new Date().toISOString() });
    bibleHistory.length = Math.min(bibleHistory.length, 40);
    repo.setSetting('bible_history', JSON.stringify(bibleHistory));
  }
  const themeDef = (id) => repo.listThemes().find((t) => t.id === id) || null;

  // Capítulo da Bíblia como slides (um versículo por slide), nas duas versões escolhidas
  function bibleSlides(book, chapter) {
    const main = repo.getChapter(live.bibleMain, book, chapter);
    const second = live.bibleSecond ? repo.getChapter(live.bibleSecond, book, chapter) : [];
    const versions = repo.listVersions();
    const langOf = (code) => versions.find((v) => v.code === code)?.lang || 'pt';
    const byVerse = new Map(second.map((v) => [v.verse, v.text]));
    // agrupa N versículos por slide (1, 2 ou 3)
    const per = live.biblePer;
    const groups = [];
    for (let i = 0; i < main.length; i += per) groups.push(main.slice(i, i + per));
    const range = (g) => (g.length > 1 ? `${g[0].verse}-${g[g.length - 1].verse}` : g[0].verse);
    // Versículo longo (1 por tela) vira 2 telas, cortando na pontuação mais perto do meio
    const LONG = 200;
    const out = [];
    for (const g of groups) {
      const v = g[0];
      const en = byVerse.get(v.verse) || '';
      if (g.length === 1 && (v.text.length > LONG || v.text.length + en.length > LONG * 1.7)) {
        const [p1, p2] = splitHalf(v.text);
        const [e1, e2] = en ? splitHalf(en) : ['', ''];
        if (p2) {
          out.push({ g, part: 1, parts: 2, pt: p1, en: e1 });
          out.push({ g, part: 2, parts: 2, pt: p2, en: e2 });
          continue;
        }
      }
      out.push({ g });
    }
    return out.map(({ g, part, parts, pt, en: enPart }, index) => {
      const verses = part ? [{ n: g[0].verse, pt, en: enPart }] : g.map((v) => ({ n: v.verse, pt: v.text, en: byVerse.get(v.verse) || '' }));
      const join = (k) => verses.map((v) => (verses.length > 1 ? `${v.n} ` : '') + v[k]).filter((x) => x.trim()).join(' ');
      return {
        index,
        kind: 'bible',
        code: 'B',
        name: refText(book, chapter, range(g), langOf(live.bibleMain)) + (part ? ` (${part}/${parts})` : ''),
        verse: g[0].verse,
        part,
        parts,
        verses,
        ref: { pt: refText(book, chapter, range(g), langOf(live.bibleMain)), en: refText(book, chapter, range(g), langOf(live.bibleSecond)) },
        versions: { pt: live.bibleMain, en: live.bibleSecond },
        lines: [{ pt: join('pt'), en: verses.some((v) => v.en) ? join('en') : '' }],
      };
    });
  }
  // ---------- Igreja, tela de espera e cronômetro ----------
  function churchInfo() {
    const deckId = repo.getSetting('wait_deck', '');
    const d = deckId && decks.get(deckId);
    return {
      name: repo.getSetting('church_name', ''),
      logo: repo.getSetting('church_logo', '/brand/adpc.png'),
      start: repo.getSetting('wait_start', '19:00'),
      waitText: repo.getSetting('wait_text', 'O culto já vai começar'),
      deck: d ? { urls: d.urls, auto: d.auto || 8 } : null,
    };
  }
  // bloco (Abertura, Louvor…) em que o item atual está
  function blockOf(svc, itemId) {
    let blk = null;
    for (const it of svc.items) {
      if (it.kind === 'block') blk = it;
      if (it.id === itemId) return blk;
    }
    return null;
  }
  function currentBlock() {
    const t = live.timing;
    if (!t.blockId || !live.serviceId) return null;
    const svc = repo.getService(live.serviceId);
    const b = svc?.items.find((i) => i.id === t.blockId);
    if (!b) return null;
    let j = {};
    try { j = JSON.parse(b.text || '{}'); } catch {}
    return { id: b.id, title: b.title, minutes: +j.minutes || 0, color: j.color || '' };
  }
  function markTiming(itemId) {
    if (!live.serviceId) return;
    const svc = repo.getService(live.serviceId);
    if (!svc) return;
    const now = Date.now();
    if (!live.timing.serviceStart) live.timing.serviceStart = now;
    const b = blockOf(svc, itemId);
    const bid = b ? b.id : null;
    if (bid !== live.timing.blockId) { live.timing.blockId = bid; live.timing.blockStart = bid ? now : null; }
  }

  // divide um texto em duas partes, na pontuação mais perto do meio (; : . ! ? antes de vírgula)
  function splitHalf(t) {
    const mid = t.length / 2;
    let best = -1;
    let score = Infinity;
    const re = /([;:.!?])\s|(,)\s/g;
    let m;
    while ((m = re.exec(t))) {
      const pos = m.index + 1;
      const d = Math.abs(pos - mid) * (m[2] ? 1.6 : 1);
      if (pos > t.length * 0.25 && pos < t.length * 0.75 && d < score) { score = d; best = pos; }
    }
    if (best < 0) {
      best = t.indexOf(' ', Math.floor(mid));
      if (best < 0) return [t, ''];
    }
    return [t.slice(0, best).trim(), t.slice(best).trim()];
  }
  function loadBible(book, chapter, verse) {
    const slides = bibleSlides(book, chapter);
    if (!slides.length) return false;
    live.kind = 'bible';
    live.songId = null;
    live.bible = { book, chapter };
    live.title = refText(book, chapter);
    live.slides = slides;
    const v = verse || 1;
    live.index = Math.max(0, slides.findIndex((s) => s.verses.some((x) => x.n === v)));
    live.clear = false;
    pushHistory(book, chapter, v);
    return true;
  }

  function slidesFor(kind, payload) {
    if (kind === 'song') return buildSlides(parseSong(payload.source), { maxLines: slideMaxLines(live.mode) });
    return String(payload.text || '')
      .split(/\n\s*\n/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text, index) => ({ index, kind: 'text', name: payload.title || 'Aviso', code: 'A', text, lines: text.split('\n').map((pt) => ({ pt, en: '' })) }));
  }

  const preview = (s) => (s ? (s.lines || []).map((l) => l.pt).join(' / ') || s.name || '' : '');
  // O que o telão mostra (usado para "congelar": o público continua vendo isto enquanto o operador prepara o próximo)
  function screenView() {
    return {
      slide: live.slides[live.index] || null,
      mode: live.mode,
      themeId: live.themeId,
      themeDef: themeDef(live.themeId),
      clear: live.clear,
      black: live.black,
      logo: live.logo,
      waiting: live.waiting,
      base: live.base,
      showBase: live.showBase,
      church: churchInfo(),
      player: live.player,
      transition: live.transition,
      trSpeed: live.trSpeed,
    };
  }
  function frozenScreen() {
    const snap = live.screenSnap;
    if (!snap) return null;
    // vídeo que estava no telão fica parado no quadro; playback de áudio (louvor) continua sendo controlado normalmente
    let player = snap.player;
    if (player?.type === 'video') player = { ...player, status: 'paused', seq: player.seq + 0.5 };
    else if (live.player?.type === 'audio') player = live.player;
    return { ...snap, player, black: live.black };
  }
  function publicState() {
    const slide = live.slides[live.index] || null;
    return {
      frozen: live.frozen,
      rehearsal: !!live.rehearsal,
      screen: live.frozen ? frozenScreen() : null,
      mode: live.mode,
      themeId: live.themeId,
      black: live.black,
      clear: live.clear,
      serviceId: live.serviceId,
      itemId: live.itemId,
      songId: live.songId,
      kind: live.kind,
      title: live.title,
      index: live.index,
      total: live.slides.length,
      slide,
      next: live.slides[live.index + 1] || null,
      slides: live.slides.map((s) => ({ index: s.index, name: s.name, code: s.code, part: s.part, parts: s.parts, type: s.type, preview: preview(s) })),
      message: live.message,
      logo: live.logo,
      waiting: live.waiting,
      base: live.base,
      showBase: live.showBase,
      church: churchInfo(),
      timing: live.timing,
      block: currentBlock(),
      themeDef: themeDef(live.themeId),
      transition: live.transition,
      trSpeed: live.trSpeed,
      bibleMain: live.bibleMain,
      bibleSecond: live.bibleSecond,
      bible: live.bible,
      biblePer: live.biblePer,
      player: live.player,
      deck: live.deck,
      aspect: live.aspect,
    };
  }
  // Telão de reserva: guarda onde o culto está; se o sistema reabrir, volta para o mesmo ponto
  let saveT = null;
  function saveLive() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const snap = { serviceId: live.serviceId, itemId: live.itemId, songId: live.songId, kind: live.kind, bible: live.bible, index: live.index, showBase: live.showBase, logo: live.logo, waiting: live.waiting, clear: live.clear, at: Date.now() };
      try { repo.setSetting('live_snapshot', JSON.stringify(snap)); } catch {}
    }, 400);
  }
  const broadcast = () => { io.emit('state', publicState()); saveLive(); };

  function loadSong(songId, { itemId = null, index = 0 } = {}) {
    const song = repo.getSong(songId);
    if (!song) return;
    live.kind = 'song';
    live.songId = song.id;
    live.itemId = itemId;
    live.title = song.title;
    live.slides = slidesFor('song', song);
    live.index = Math.min(index, live.slides.length - 1);
    live.clear = false;
    if (song.theme_id) live.themeId = song.theme_id;
    const k = `${live.serviceId}:${song.id}`;
    if (!live.loggedSongs.has(k)) {
      live.loggedSongs.add(k);
      repo.logPlay(song.id, live.serviceId);
    }
  }

  function handleCmd(c = {}) {
    // no cartaz, a primeira seta só volta para o slide onde estava (não pula)
    if (live.showBase && (c.type === 'next' || c.type === 'prev')) { live.showBase = false; return broadcast(); }
    // qualquer conteúdo novo (ou passar slide) sai do cartaz fixo
    if (['item', 'song', 'bible', 'media', 'deck', 'goto', 'next', 'prev', 'logo', 'waiting'].includes(c.type)) live.showBase = false;
    switch (c.type) {
      // Cartaz fixo: imagem/vídeo de fundo do evento. ESC volta para ele.
      case 'base-set':
        live.base = c.url ? { url: String(c.url), mtype: c.mtype === 'video' ? 'video' : 'image', name: String(c.name || '') } : null;
        repo.setSetting('base', JSON.stringify(live.base));
        if (c.show && live.base) live.showBase = true;
        if (!live.base) live.showBase = false;
        break;
      case 'base-show':
        if (!live.base) return;
        live.showBase = typeof c.value === 'boolean' ? c.value : true;
        if (live.showBase) { live.logo = false; live.waiting = false; }
        break;
      case 'service':
        if (live.serviceId !== (c.id ?? null)) live.timing = { serviceStart: null, blockId: null, blockStart: null };
        live.serviceId = c.id ?? null;
        queueService(live.serviceId);
        break;
      case 'item': {
        const svc = live.serviceId && repo.getService(live.serviceId);
        const item = svc?.items.find((i) => i.id === c.id) || db.prepare('SELECT * FROM service_item WHERE id = ?').get(c.id);
        if (!item) return;
        if (item.kind === 'block') {
          // bloco: só marca o início dele no cronômetro
          if (live.timing.blockId !== item.id) { live.timing.blockId = item.id; live.timing.blockStart = Date.now(); }
          if (!live.timing.serviceStart) live.timing.serviceStart = Date.now();
          break;
        }
        live.logo = false;
        live.waiting = false;
        markTiming(item.id);
        leaveItem(item.id);
        if (item.kind === 'song') {
          loadSong(item.song_id, { itemId: item.id, index: c.index || 0 });
          const ij = jsonOf(item.text);
          const audio = ij.audio;
          if (audio && live.player?.itemId !== item.id) setPlayer({ url: audio, type: 'audio', name: 'Playback', status: 'stopped', after: 'stop', itemId: item.id, timings: ij.timings || null, auto: !!ij.timings, rec: false });
        } else if (item.kind === 'media') {
          const m = jsonOf(item.text);
          live.kind = 'media';
          live.songId = null;
          live.itemId = item.id;
          live.title = item.title || m.name || 'Mídia';
          live.slides = [{ index: 0, kind: 'media', mtype: m.type, url: m.url, name: live.title, code: 'M', lines: [] }];
          live.index = 0;
          live.clear = false;
          if (m.type === 'video' || m.type === 'audio') {
            if (live.player?.itemId !== item.id || live.player.status === 'stopped') setPlayer({ url: m.url, type: m.type, name: live.title, status: 'paused', after: m.after || 'tema', itemId: item.id, seek: 0 });
          }
        } else if (item.kind === 'seq') {
          // Sequência: imagens e vídeos na ordem que o pregador pediu
          const j = jsonOf(item.text);
          live.kind = 'seq';
          live.songId = null;
          live.itemId = item.id;
          live.title = item.title || 'Sequência';
          live.slides = (j.items || []).map((m, i) => ({ index: i, kind: 'media', mtype: m.type, url: m.url, name: m.name || `${i + 1}`, code: 'M', lines: [] }));
          live.index = Math.min(c.index || 0, Math.max(0, live.slides.length - 1));
          live.clear = false;
        } else if (item.kind === 'deck') {
          const d = decks.get(jsonOf(item.text).deck);
          if (!d) return;
          live.kind = 'deck';
          live.songId = null;
          live.itemId = item.id;
          live.title = item.title || d.title;
          live.slides = d.urls.map((url, i) => ({ index: i, kind: 'media', mtype: 'image', fit: 'contain', url, name: `Slide ${i + 1}`, code: 'S', lines: [] }));
          live.index = Math.min(c.index || 0, live.slides.length - 1);
          live.clear = false;
          live.deck = { id: d.id, auto: d.auto, loop: d.loop };
          startDeckTimer();
        }
        else if (item.kind === 'bible') {
          const r = JSON.parse(item.text || '{}');
          if (!loadBible(r.book, r.chapter, r.verse)) return;
          live.itemId = item.id;
          if (c.index) live.index = Math.min(c.index, live.slides.length - 1);
        } else {
          live.kind = 'text';
          live.songId = null;
          live.itemId = item.id;
          live.title = item.title || 'Aviso';
          live.slides = slidesFor('text', item);
          live.index = Math.min(c.index || 0, live.slides.length - 1);
          live.clear = false;
        }
        break;
      }
      case 'song':
        leaveItem(null);
        loadSong(c.id, { index: c.index || 0 });
        break;
      case 'media': {
        // mídia mostrada direto da biblioteca (sem estar no culto)
        leaveItem(null);
        live.kind = 'media';
        live.songId = null;
        live.itemId = null;
        live.title = c.name || 'Mídia';
        live.slides = [{ index: 0, kind: 'media', mtype: c.mtype, url: c.url, name: live.title, code: 'M', lines: [] }];
        live.index = 0;
        live.clear = false;
        if (c.mtype === 'video' || c.mtype === 'audio') setPlayer({ url: c.url, type: c.mtype, name: live.title, status: 'paused', after: 'tema', itemId: null, seek: 0 });
        break;
      }
      case 'deck': {
        const d = decks.get(c.id);
        if (!d) return;
        leaveItem(null);
        live.kind = 'deck';
        live.songId = null;
        live.itemId = null;
        live.title = d.title;
        live.slides = d.urls.map((url, i) => ({ index: i, kind: 'media', mtype: 'image', fit: 'contain', url, name: `Slide ${i + 1}`, code: 'S', lines: [] }));
        live.index = 0;
        live.clear = false;
        live.deck = { id: d.id, auto: d.auto, loop: d.loop };
        startDeckTimer();
        break;
      }
      case 'player': {
        const p = live.player;
        if (!p) return;
        const a = c.action;
        if (a === 'toggle') p.status = p.status === 'playing' ? 'paused' : 'playing';
        else if (a === 'play') p.status = 'playing';
        else if (a === 'pause') p.status = 'paused';
        else if (a === 'stop') { p.status = 'stopped'; p.seek = 0; }
        else if (a === 'restart') { p.status = 'playing'; p.seek = 0; }
        else if (a === 'seek') p.seek = Math.max(0, +c.value || 0);
        else if (a === 'skip') p.seek = Math.max(0, (live.playerT || 0) + (+c.value || 0));
        else if (a === 'rate') p.rate = Math.min(2, Math.max(0.25, +c.value || 1));
        else if (a === 'rec') { p.rec = !p.rec; if (p.rec) { p.auto = false; p.timings = { 0: 0 }; } else saveTimings(); }
        else if (a === 'auto') p.auto = !p.auto;
        else if (a === 'volume') p.volume = Math.min(1, Math.max(0, +c.value));
        else if (a === 'after') { if (['tema', 'next', 'loop', 'stop'].includes(c.value)) p.after = c.value; }
        else return;
        if (a !== 'seek' && a !== 'skip' && a !== 'stop' && a !== 'restart') delete p.seek;
        p.seq++;
        break;
      }
      case 'bible':
        leaveItem(null);
        if (!loadBible(+c.book, +c.chapter, +c.verse || 1)) return;
        live.itemId = null;
        break;
      case 'bible-versions': {
        const codes = repo.listVersions().map((v) => v.code);
        if (codes.includes(c.main)) live.bibleMain = c.main;
        live.bibleSecond = codes.includes(c.second) ? c.second : '';
        repo.setSetting('bible_main', live.bibleMain);
        repo.setSetting('bible_second', live.bibleSecond);
        if (live.kind === 'bible' && live.bible) {
          const verse = live.slides[live.index]?.verse;
          const itemId = live.itemId;
          loadBible(live.bible.book, live.bible.chapter, verse);
          live.itemId = itemId;
        }
        break;
      }
      case 'bible-per': {
        live.biblePer = Math.min(3, Math.max(1, +c.value || 1));
        repo.setSetting('bible_per', live.biblePer);
        if (live.kind === 'bible' && live.bible) {
          const verse = live.slides[live.index]?.verse;
          const itemId = live.itemId;
          loadBible(live.bible.book, live.bible.chapter, verse);
          live.itemId = itemId;
        }
        break;
      }
      case 'themes-changed':
        break;
      case 'goto':
        if (c.index >= 0 && c.index < live.slides.length) { live.index = c.index; recTiming(); }
        live.clear = false;
        if (deckTimer) startDeckTimer();
        break;
      case 'next':
        if (live.index < live.slides.length - 1) { live.index++; recTiming(); }
        else return nextItem(1);
        live.clear = false;
        break;
      case 'prev':
        if (live.index > 0) live.index--;
        else return nextItem(-1);
        live.clear = false;
        break;
      case 'black':
        live.black = typeof c.value === 'boolean' ? c.value : !live.black;
        break;
      case 'rehearsal': {
        // Ensaio: o telão fica parado no que está; a equipe passa o culto só na prévia e no retorno
        const on = typeof c.value === 'boolean' ? c.value : !live.rehearsal;
        live.rehearsal = on;
        if (on && !live.frozen) { live.screenSnap = screenView(); live.frozen = true; }
        break;
      }
      case 'freeze': {
        const on = typeof c.value === 'boolean' ? c.value : !live.frozen;
        if (on && !live.frozen) live.screenSnap = screenView();
        live.frozen = on;
        if (!on) { live.screenSnap = null; live.rehearsal = false; }
        break;
      }
      case 'logo':
        live.logo = typeof c.value === 'boolean' ? c.value : !live.logo;
        if (live.logo) live.waiting = false;
        break;
      case 'waiting':
        live.waiting = typeof c.value === 'boolean' ? c.value : !live.waiting;
        if (live.waiting) live.logo = false;
        break;
      case 'timer':
        if (c.action === 'start') { live.timing.serviceStart = Date.now(); if (live.timing.blockId) live.timing.blockStart = Date.now(); }
        if (c.action === 'reset') live.timing = { serviceStart: null, blockId: null, blockStart: null };
        break;
      case 'clear':
        live.clear = typeof c.value === 'boolean' ? c.value : !live.clear;
        break;
      case 'mode': {
        if (!['pt', 'pt-en', 'en', 'en-pt'].includes(c.value)) return;
        const cur = live.slides[live.index];
        live.mode = c.value;
        repo.setSetting('mode', c.value);
        queueService(live.serviceId);
        if (live.kind === 'song' && live.songId) {
          const song = repo.getSong(live.songId);
          live.slides = slidesFor('song', song);
          // mantém a posição: procura o slide que contém a mesma primeira linha
          if (cur) {
            const first = cur.lines[0]?.pt;
            const cands = live.slides.filter((s) => s.lines.some((l) => l.pt === first));
            const best = cands.sort((a, b) => Math.abs(a.index - live.index) - Math.abs(b.index - live.index))[0];
            live.index = best ? best.index : Math.min(live.index, live.slides.length - 1);
          }
        }
        break;
      }
      case 'theme':
        live.themeId = c.value;
        repo.setSetting('theme', c.value);
        break;
      case 'transition':
        if (['suave', 'desfoque', 'subir', 'zoom', 'tema', 'nenhuma'].includes(c.value)) { live.transition = c.value; repo.setSetting('transition', c.value); }
        if (['lenta', 'normal', 'rapida'].includes(c.speed)) { live.trSpeed = c.speed; repo.setSetting('tr_speed', c.speed); }
        break;
      case 'message':
        live.message = String(c.value || '').slice(0, 140);
        break;
      case 'reload-song':
        if (live.kind === 'song' && live.songId === c.id) {
          const idx = live.index;
          loadSong(c.id, { itemId: live.itemId, index: idx });
        }
        break;
      default:
        return;
    }
    syncSeqPlayer();
    broadcast();
  }
  // Letra seguindo o playback: grava o tempo em que cada slide entrou (uma vez) e depois passa sozinho
  function recTiming() {
    const p = live.player;
    if (!p?.rec || p.type !== 'audio' || p.itemId !== live.itemId || p.status !== 'playing') return;
    p.timings = { ...(p.timings || {}), [live.index]: Math.round((live.playerT || 0) * 10) / 10 };
  }
  function saveTimings() {
    const p = live.player;
    if (!p?.itemId || !p.timings) return;
    const it = db.prepare('SELECT * FROM service_item WHERE id = ?').get(p.itemId);
    if (!it) return;
    const j = jsonOf(it.text);
    j.timings = p.timings;
    repo.updateItem(it.id, { text: JSON.stringify(j), title: it.title });
    p.auto = true;
  }
  function followPlayback(t) {
    const p = live.player;
    if (!p?.auto || p.rec || !p.timings || p.type !== 'audio' || p.status !== 'playing' || p.itemId !== live.itemId || live.frozen) return;
    let target = 0;
    for (const [i, at] of Object.entries(p.timings)) if (t + 0.15 >= at && +i > target) target = +i;
    if (target !== live.index && target < live.slides.length) { live.index = target; live.clear = false; broadcast(); }
  }
  // Na sequência, o player acompanha o slide: vídeo entra pausado (▶ para tocar); imagem para o vídeo anterior
  function syncSeqPlayer() {
    if (live.kind !== 'seq') return;
    const sl = live.slides[live.index];
    if (sl?.mtype === 'video') {
      if (live.player?.url !== sl.url || live.player?.itemId !== live.itemId || live.player.seqIndex !== live.index) {
        setPlayer({ url: sl.url, type: 'video', name: sl.name, status: 'paused', after: 'next', itemId: live.itemId, seqIndex: live.index, seek: 0 });
      }
    } else if (live.player?.type === 'video' && live.player.status !== 'stopped') setPlayer(null);
  }

  // Avança para o próximo/anterior item do culto
  function nextItem(dir) {
    if (!live.serviceId || !live.itemId) return;
    const svc = repo.getService(live.serviceId);
    const i = svc.items.findIndex((x) => x.id === live.itemId);
    let k = i + dir;
    while (svc.items[k] && svc.items[k].kind === 'block') k += dir;
    const target = svc.items[k];
    if (!target) return;
    handleCmd({ type: 'item', id: target.id });
    if (dir < 0) {
      live.index = live.slides.length - 1;
      broadcast();
    }
  }

  // Inglês automático: com a IA cadastrada e o telão em PT+EN/EN, traduz sozinho os louvores do culto
  const enQueue = new Set();
  const enFailed = new Set();
  let enBusy = false;
  const emitEn = () => io.emit('en-queue', [...enQueue]);
  function queueEnglish(ids) {
    if (live.mode === 'pt' || !aiConf().apiKey) return;
    let added = false;
    for (const id of ids) {
      const song = id && repo.getSong(id);
      if (song && !song.has_en && !enFailed.has(id) && !enQueue.has(id)) { enQueue.add(id); added = true; }
    }
    if (added) { emitEn(); runEnglish(); }
  }
  const queueService = (sid) => {
    const svc = sid && repo.getService(sid);
    if (svc) queueEnglish(svc.items.filter((i) => i.kind === 'song').map((i) => i.song_id));
  };
  async function runEnglish() {
    if (enBusy) return;
    enBusy = true;
    while (enQueue.size) {
      const id = enQueue.values().next().value;
      try {
        const song = repo.getSong(id);
        const src = song && !song.has_en && (await autoTranslateSource(song.source));
        if (src) {
          repo.updateSong(id, src, { theme_id: song.theme_id });
          handleCmd({ type: 'reload-song', id });
        }
      } catch (e) {
        enFailed.add(id);
        console.log('  Tradução automática falhou:', e.message);
        io.emit('en-error', { id, message: e.message });
      }
      enQueue.delete(id);
      io.emit('songs-changed', { id });
      emitEn();
    }
    enBusy = false;
  }

  io.on('connection', (socket) => {
    socket.emit('state', publicState());
    socket.emit('en-queue', [...enQueue]);
    // O telão avisa o tempo do vídeo/áudio e quando terminou
    socket.on('player-time', (t) => { if (t && isFinite(t.t)) { live.playerT = +t.t; followPlayback(live.playerT); } socket.broadcast.volatile.emit('player-time', t); });
    socket.on('player-blocked', () => io.emit('player-blocked'));
    socket.on('screen-aspect', (ar) => {
      ar = Math.min(3.6, Math.max(1.3, +ar || 0));
      if (!ar || Math.abs(ar - live.aspect) < 0.01) return;
      live.aspect = ar;
      repo.setSetting('aspect', String(ar));
      broadcast();
    });
    socket.on('player-ended', ({ seq } = {}) => {
      const p = live.player;
      if (!p || p.seq !== seq || p.status !== 'playing') return;
      if (p.after === 'loop') { p.seek = 0; p.seq++; return broadcast(); }
      p.status = 'stopped';
      p.seq++;
      if (p.after === 'next' && live.kind === 'seq' && p.itemId === live.itemId) return handleCmd({ type: 'next' });
      if (p.after === 'next' && p.itemId && p.itemId === live.itemId) return nextItem(1) ?? broadcast();
      if (p.after === 'tema' && live.kind === 'media' && p.type === 'video') { if (live.base) live.showBase = true; else live.clear = true; }
      broadcast();
    });
    socket.on('cmd', (c) => {
      try {
        handleCmd(c);
      } catch (e) {
        console.error('cmd', c, e);
      }
    });
  });

  // ---------------- API ----------------
  const ok = (res, data = { ok: true }) => res.json(data);
  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: e.message });
    }
  };

  app.get('/api/songs', (req, res) => ok(res, repo.listSongs(req.query.q || '')));
  app.get('/api/songs/:id', (req, res) => {
    const s = repo.getSong(+req.params.id);
    s ? ok(res, s) : res.status(404).json({ error: 'Louvor não encontrado' });
  });
  app.post('/api/songs', wrap((req, res) => {
    if (!String(req.body.source || '').trim()) throw new Error('A letra está vazia');
    ok(res, { id: repo.createSong(req.body.source, { theme_id: req.body.theme_id }) });
  }));
  app.put('/api/songs/:id', wrap((req, res) => {
    repo.updateSong(+req.params.id, req.body.source, { theme_id: req.body.theme_id });
    handleCmd({ type: 'reload-song', id: +req.params.id });
    ok(res);
  }));
  app.delete('/api/songs/:id', (req, res) => {
    repo.deleteSong(+req.params.id);
    ok(res);
  });

  // Importação em 2 passos: prévia (com aviso de duplicados) → confirmar
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 500 } });
  app.post('/api/import/preview', upload.array('files'), wrap(async (req, res) => {
    const out = [];
    const add = (source, from) => {
      const p = parseSong(source);
      const dup = repo.findDuplicate(p.title || '', p.artist || '');
      out.push({
        from,
        source,
        title: p.title || 'Sem título',
        artist: p.artist,
        sections: p.sections.length,
        slides: buildSlides(p, { maxLines: 2 }).length,
        hasEn: p.hasEn,
        duplicateId: dup?.id || null,
        action: dup ? 'skip' : 'create',
      });
    };
    if (req.body.text) splitSongs(req.body.text).forEach((s) => add(s, 'texto colado'));
    for (const f of req.files || []) {
      const name = Buffer.from(f.originalname, 'latin1').toString('utf8');
      try {
        (await fileToSources(name, f.buffer)).forEach((s) => add(s, name));
      } catch (e) {
        out.push({ from: name, error: e.message, action: 'skip' });
      }
    }
    ok(res, out);
  }));
  app.post('/api/import/url', wrap(async (req, res) => {
    const source = await fetchLyrics(String(req.body.url || '').trim());
    const p = parseSong(source);
    const dup = repo.findDuplicate(p.title || '', p.artist || '');
    ok(res, [{ from: req.body.url, source, title: p.title, artist: p.artist, sections: p.sections.length,
      slides: buildSlides(p, { maxLines: 2 }).length, hasEn: p.hasEn, duplicateId: dup?.id || null, action: dup ? 'skip' : 'create' }]);
  }));
  // Buscar letra na internet e importar com 1 clique
  app.get('/api/lyrics/search', wrap(async (req, res) => ok(res, await searchLyricsOnline(req.query.q))));
  app.post('/api/lyrics/import', wrap(async (req, res) => {
    const url = String(req.body.url || '');
    if (!/^(https?:\/\/|ovh:)/.test(url)) throw new Error('Resultado inválido');
    const source = await fetchOnlineResult(url);
    const p = parseSong(source);
    const dup = repo.findDuplicate(p.title || '', p.artist || '');
    if (dup && !req.body.force) return ok(res, { id: dup.id, existed: true });
    ok(res, { id: repo.createSong(source, {}), existed: false });
  }));
  app.post('/api/import/commit', wrap((req, res) => {
    let created = 0, replaced = 0;
    for (const it of req.body.items || []) {
      if (!it.source) continue;
      if (it.action === 'create') { repo.createSong(it.source); created++; }
      if (it.action === 'replace' && it.duplicateId) { repo.updateSong(it.duplicateId, it.source, {}); replaced++; }
    }
    ok(res, { created, replaced });
  }));
  app.get('/api/export', (req, res) => {
    const name = `backup-louvores-${new Date().toLocaleDateString('sv-SE')}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.json({ app: 'projecao-igreja', version: 1, exportedAt: new Date().toISOString(), songs: repo.allSongsFull() });
  });

  // Cultos
  app.get('/api/services', (req, res) => ok(res, repo.listServices()));
  const templates = () => { try { return JSON.parse(repo.getSetting('templates', '[]')); } catch { return []; } };
  app.post('/api/services', wrap((req, res) => {
    const id = repo.createService(req.body.title || 'Culto', req.body.date || new Date().toLocaleDateString('sv-SE'));
    const tpl = req.body.template != null && templates()[+req.body.template];
    if (tpl) tpl.items.forEach((it) => { if (it.kind !== 'song' || repo.getSong(it.song_id)) repo.addItem(id, it); });
    ok(res, { id });
  }));
  // Escala do culto (quem dirige, prega, ministra, opera)
  app.get('/api/services/:id/scale', (req, res) => { try { ok(res, JSON.parse(repo.getSetting('scale_' + +req.params.id, '{}'))); } catch { ok(res, {}); } });
  app.put('/api/services/:id/scale', wrap((req, res) => {
    const keys = ['dirigente', 'pregador', 'louvor', 'operador', 'banda', 'obs'];
    const v = Object.fromEntries(keys.map((k) => [k, String(req.body[k] || '').slice(0, 200)]));
    repo.setSetting('scale_' + +req.params.id, JSON.stringify(v));
    io.emit('service-changed', { id: +req.params.id, by: 'scale' });
    ok(res, v);
  }));
  // Histórico: louvores cantados (um por culto/dia)
  app.get('/api/history', (req, res) => {
    const days = Math.min(365, +req.query.days || 120);
    const rows = db.prepare(`SELECT DISTINCT date(p.played_at) AS day, s.id, s.title, s.artist
      FROM play_log p JOIN song s ON s.id = p.song_id
      WHERE p.played_at >= datetime('now', 'localtime', ?) ORDER BY day DESC, s.title`).all(`-${days} days`);
    ok(res, rows);
  });
  // Modelos de culto (ex.: "Culto de domingo padrão")
  app.get('/api/templates', (req, res) => ok(res, templates().map((t, i) => ({ i, name: t.name, count: t.items.length }))));
  app.post('/api/templates', wrap((req, res) => {
    const svc = repo.getService(+req.body.service_id);
    if (!svc) throw new Error('Culto não encontrado');
    const name = String(req.body.name || svc.title).trim().slice(0, 60);
    const list = templates().filter((t) => t.name !== name);
    list.push({ name, items: svc.items.map((it) => ({ kind: it.kind, song_id: it.song_id, text: it.text, title: it.title })) });
    repo.setSetting('templates', JSON.stringify(list));
    ok(res, { count: list.length });
  }));
  app.delete('/api/templates/:i', (req, res) => { const list = templates(); list.splice(+req.params.i, 1); repo.setSetting('templates', JSON.stringify(list)); ok(res); });
  // Igreja / tela de espera
  app.get('/api/settings/church', (req, res) => ok(res, { ...churchInfo(), deckId: repo.getSetting('wait_deck', '') }));
  app.put('/api/settings/church', wrap((req, res) => {
    const b = req.body || {};
    if (b.name != null) repo.setSetting('church_name', String(b.name).slice(0, 80));
    if (b.logo != null) repo.setSetting('church_logo', String(b.logo));
    if (b.start != null && /^\d{1,2}:\d{2}$/.test(b.start)) repo.setSetting('wait_start', b.start);
    if (b.waitText != null) repo.setSetting('wait_text', String(b.waitText).slice(0, 80));
    if (b.deckId != null) repo.setSetting('wait_deck', String(b.deckId));
    broadcast();
    ok(res, churchInfo());
  }));
  // Backup automático diário
  const backup = makeBackup({ db, dataDir, getDir: () => repo.getSetting('backup_dir', '') });
  async function backupIfDue() {
    if (repo.getSetting('backup_on', '0') !== '1' || !repo.getSetting('backup_dir', '')) return;
    const today = new Date().toLocaleDateString('sv-SE');
    if (repo.getSetting('backup_last', '') === today) return;
    try {
      const r = await backup.run();
      repo.setSetting('backup_last', today);
      console.log('  Backup salvo em', r.file);
    } catch (e) {
      console.log('  Backup falhou:', e.message);
    }
  }
  setTimeout(backupIfDue, 60 * 1000);
  setInterval(backupIfDue, 60 * 60 * 1000);
  app.get('/api/settings/backup', (req, res) => ok(res, { dir: repo.getSetting('backup_dir', ''), on: repo.getSetting('backup_on', '0') === '1', last: repo.getSetting('backup_last', '') }));
  app.put('/api/settings/backup', wrap((req, res) => {
    const dir = String(req.body.dir || '').trim();
    if (dir && !fs.existsSync(dir)) throw new Error('Essa pasta não existe neste computador');
    repo.setSetting('backup_dir', dir);
    repo.setSetting('backup_on', req.body.on ? '1' : '0');
    ok(res);
  }));
  app.post('/api/backup/run', wrap(async (req, res) => {
    const r = await backup.run();
    repo.setSetting('backup_last', r.date);
    ok(res, r);
  }));
  app.get('/api/services/:id', (req, res) => {
    const s = repo.getService(+req.params.id);
    s ? ok(res, s) : res.status(404).json({ error: 'Culto não encontrado' });
  });
  app.put('/api/services/:id', wrap((req, res) => { repo.renameService(+req.params.id, req.body.title, req.body.date); ok(res); }));
  app.delete('/api/services/:id', (req, res) => { repo.deleteService(+req.params.id); ok(res); });
  app.post('/api/services/:id/items', wrap((req, res) => {
    const id = repo.addItem(+req.params.id, req.body);
    if (req.body.by === 'pedido') {
      const song = req.body.song_id && repo.getSong(+req.body.song_id);
      io.emit('service-changed', { id: +req.params.id, by: 'pedido', text: (song?.title || 'louvor') + (req.body.who ? ' · ' + String(req.body.who).slice(0, 40) : '') });
    }
    if (req.body.kind === 'song') queueEnglish([+req.body.song_id]);
    ok(res, { id });
  }));
  app.post('/api/services/:id/reorder', wrap((req, res) => { repo.reorderItems(+req.params.id, req.body.ids || []); ok(res); }));
  app.put('/api/items/:id', wrap((req, res) => { repo.updateItem(+req.params.id, req.body); ok(res); }));
  app.delete('/api/items/:id', (req, res) => { repo.deleteItem(+req.params.id); ok(res); });

  // ---------------- Bíblia ----------------
  app.get('/api/bible/versions', (req, res) => ok(res, repo.listVersions()));
  app.get('/api/bible/chapter', (req, res) => {
    const { v = live.bibleMain, book, chapter } = req.query;
    ok(res, { verses: repo.getChapter(v, +book, +chapter), chapters: repo.chapterCount(v, +book) });
  });
  // Busca: referência ("jo 3 16") ou palavras ("amor paciente")
  app.get('/api/bible/search', (req, res) => {
    const q = String(req.query.q || '').trim();
    const v = req.query.v || live.bibleMain;
    const ref = parseRef(q);
    if (ref && repo.getChapter(v, ref.book, ref.chapter).length) return ok(res, { ref });
    ok(res, { hits: q.length >= 3 ? repo.searchBible(v, q, 80) : [] });
  });
  const bibleUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024 } });
  app.post('/api/bible/import', bibleUpload.single('file'), wrap((req, res) => {
    if (!req.file) throw new Error('Escolha o arquivo da Bíblia (.json)');
    const v = parseBibleJson(req.file.buffer);
    v.code = req.body.code || v.code || req.file.originalname.replace(/\..*$/, '');
    v.name = req.body.name || v.name || v.code;
    v.lang = req.body.lang || v.lang || 'pt';
    v.license = req.body.license || v.license || '';
    ok(res, repo.importVersion(v));
  }));
  app.get('/api/bible/history', (req, res) => ok(res, bibleHistory));
  app.get('/api/bible/favorites', (req, res) => ok(res, readJson('bible_favs')));
  app.post('/api/bible/favorites', wrap((req, res) => {
    const { book, chapter, verse } = req.body;
    const favs = readJson('bible_favs');
    const i = favs.findIndex((f) => f.book === +book && f.chapter === +chapter && f.verse === +verse);
    if (i >= 0) favs.splice(i, 1);
    else favs.unshift({ book: +book, chapter: +chapter, verse: +verse });
    repo.setSetting('bible_favs', JSON.stringify(favs.slice(0, 300)));
    ok(res, favs);
  }));
  app.delete('/api/bible/versions/:code', (req, res) => { repo.deleteVersion(req.params.code); ok(res); });

  // ---------------- Mídia (fundos e logos) ----------------
  const MEDIA_EXT = { jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image', mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio', oga: 'audio', opus: 'audio', flac: 'audio' };
  // arquivos colados ou vindos do WhatsApp/Telegram às vezes chegam sem extensão: usa o tipo informado
  const MIME_EXT = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/opus': 'opus', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac' };
  const extOf = (name, mime) => { const e = (String(name).match(/\.([a-z0-9]{2,5})$/i)?.[1] || '').toLowerCase(); return MEDIA_EXT[e] ? e : MIME_EXT[String(mime || '').split(';')[0].trim()] || e; };
  const mediaUpload = multer({
    storage: multer.diskStorage({
      destination: mediaDir,
      filename: (req, f, cb) => {
        const orig = Buffer.from(f.originalname, 'latin1').toString('utf8');
        const ext = (orig.split('.').pop() || '').toLowerCase();
        const base = orig.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-]+/g, '-').slice(0, 40) || 'midia';
        cb(null, `${base}-${Date.now().toString(36)}.${ext}`);
      },
    }),
    fileFilter: (req, f, cb) => cb(null, !!MEDIA_EXT[(f.originalname.split('.').pop() || '').toLowerCase()]),
    limits: { fileSize: 1024 * 1024 * 1024 },
  });
  // nomes amigáveis dados pelo operador (o arquivo continua com o nome original)
  const mediaTitles = () => { try { return JSON.parse(repo.getSetting('media_titles', '{}')); } catch { return {}; } };
  const listMedia = () => {
    const titles = mediaTitles();
    return fs.readdirSync(mediaDir)
      .filter((f) => MEDIA_EXT[(f.split('.').pop() || '').toLowerCase()])
      .map((f) => {
        const st = fs.statSync(path.join(mediaDir, f));
        return { name: f, title: titles[f] || '', url: '/media/' + encodeURIComponent(f), type: MEDIA_EXT[f.split('.').pop().toLowerCase()], size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime); // mais novos primeiro
  };
  app.put('/api/media/:name', wrap((req, res) => {
    const t = mediaTitles();
    const n = path.basename(req.params.name);
    const title = String(req.body.title || '').trim().slice(0, 80);
    if (title) t[n] = title; else delete t[n];
    repo.setSetting('media_titles', JSON.stringify(t));
    ok(res);
  }));
  app.get('/api/media', (req, res) => ok(res, listMedia()));
  app.post('/api/media', mediaUpload.array('files', 50), wrap((req, res) => {
    if (!req.files?.length) throw new Error('Formato não aceito. Use imagem (jpg, png, webp), vídeo (mp4, webm, mov) ou áudio (mp3, wav, m4a)');
    ok(res, { files: req.files.map((f) => '/media/' + encodeURIComponent(f.filename)) });
  }));
  app.delete('/api/media/:name', (req, res) => {
    const f = path.join(mediaDir, path.basename(req.params.name));
    if (f.startsWith(mediaDir) && fs.existsSync(f)) fs.unlinkSync(f);
    ok(res);
  });

  // ---------------- Apresentações e envio de arquivos (operador e celular do pregador) ----------------
  const fixName = (n) => Buffer.from(n, 'latin1').toString('utf8');
  const baseName = (n) => fixName(n).replace(/\.(mp4|webm|mov|m4v|jpe?g|png|webp|gif|mp3|wav|m4a|aac|ogg|oga|opus|flac|pptx?|ppsx?|pps|odp|key|pdf)$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 80) || 'Arquivo';
  const tmpUpload = multer({ dest: tmpDir, limits: { fileSize: 2048 * 1024 * 1024 } });
  const PRES_EXT = /\.(pptx?|ppsx?|pps|odp|key)$/i;
  function addToService(sid, item) {
    sid = +sid;
    if (!sid || !repo.getService(sid)) return null;
    const id = repo.addItem(sid, item);
    io.emit('service-changed', { id: sid });
    return id;
  }
  function mediaItem(file, author) {
    const orig = fixName(file.originalname);
    const ext = extOf(orig, file.mimetype);
    const type = MEDIA_EXT[ext];
    const safe = orig.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-]+/g, '-').slice(0, 40) || 'midia';
    const name = `${safe}-${Date.now().toString(36)}.${ext}`;
    try { fs.renameSync(file.path, path.join(mediaDir, name)); } catch { fs.copyFileSync(file.path, path.join(mediaDir, name)); fs.rmSync(file.path, { force: true }); }
    const title = baseName(file.originalname) + (author ? ' · ' + author : '');
    return { kind: 'media', title, text: JSON.stringify({ type, url: '/media/' + encodeURIComponent(name), name: title, after: type === 'video' ? 'tema' : 'stop' }) };
  }
  const deckItem = (d) => ({ kind: 'deck', title: d.title + (d.author ? ' · ' + d.author : ''), text: JSON.stringify({ deck: d.id, count: d.count }) });

  app.get('/api/decks', (req, res) => ok(res, decks.list()));
  app.get('/api/decks/:id', (req, res) => ok(res, decks.get(req.params.id)));
  app.put('/api/decks/:id', wrap((req, res) => {
    const d = decks.update(req.params.id, req.body || {});
    if (live.deck?.id === d.id) { live.deck = { id: d.id, auto: d.auto, loop: d.loop }; startDeckTimer(); broadcast(); }
    io.emit('library');
    ok(res, d);
  }));
  app.delete('/api/decks/:id', (req, res) => { decks.remove(req.params.id); io.emit('library'); ok(res); });
  // Slides já em imagem (PDF convertido no navegador, ou fotos)
  app.post('/api/decks', tmpUpload.array('files', 500), wrap((req, res) => {
    const files = (req.files || []).filter((f) => /\.(png|jpe?g|webp)$/i.test(fixName(f.originalname)));
    files.forEach((f) => { const ext = path.extname(fixName(f.originalname)).toLowerCase(); fs.renameSync(f.path, f.path + ext); f.path += ext; });
    const d = decks.create({ title: req.body.title, author: req.body.author, images: files.map((f) => f.path), auto: req.body.auto, loop: req.body.loop === '1' || req.body.loop === 'true' });
    const itemId = addToService(req.body.service_id, deckItem(d));
    io.emit('library');
    ok(res, { deck: d, itemId });
  }));
  // Carrossel a partir de imagens da biblioteca de mídia
  app.post('/api/decks/from-media', wrap((req, res) => {
    const names = (req.body.names || []).map((n) => path.join(mediaDir, path.basename(decodeURIComponent(n))));
    const ok2 = names.filter((f) => fs.existsSync(f));
    const d = decks.create({ title: req.body.title || 'Avisos', images: ok2, auto: req.body.auto ?? 8, loop: req.body.loop ?? true, move: false });
    const itemId = addToService(req.body.service_id, deckItem(d));
    io.emit('library');
    ok(res, { deck: d, itemId });
  }));
  // Envio geral: vídeo, imagem, áudio e PowerPoint. Entra direto no culto, se vier service_id.
  app.post('/api/upload', tmpUpload.array('files', 50), wrap(async (req, res) => {
    const author = String(req.body.author || '').trim().slice(0, 60);
    const results = [];
    for (const f of req.files || []) {
      const orig = fixName(f.originalname);
      const ext = extOf(orig, f.mimetype);
      try {
        if (MEDIA_EXT[ext]) {
          const it = mediaItem(f, author);
          const itemId = addToService(req.body.service_id, it);
          results.push({ name: orig, ok: true, kind: 'media', type: MEDIA_EXT[ext], itemId, url: JSON.parse(it.text).url, title: it.title });
        } else if (PRES_EXT.test(orig)) {
          const src = f.path + '.' + ext;
          fs.renameSync(f.path, src);
          const out = path.join(tmpDir, 'conv-' + Date.now().toString(36));
          try {
            const imgs = await convertPresentation(src, out);
            const d = decks.create({ title: baseName(orig), author, images: imgs });
            const itemId = addToService(req.body.service_id, deckItem(d));
            results.push({ name: orig, ok: true, kind: 'deck', slides: d.count, itemId });
          } finally {
            fs.rmSync(src, { force: true });
            fs.rmSync(out, { recursive: true, force: true });
          }
        } else {
          fs.rmSync(f.path, { force: true });
          results.push({ name: orig, ok: false, error: ext === 'pdf' ? 'PDF deve ser enviado pela página (ele é convertido no navegador)' : 'Formato não aceito' });
        }
      } catch (e) {
        fs.rmSync(f.path, { force: true });
        results.push({ name: orig, ok: false, error: e.message });
      }
    }
    io.emit('library');
    ok(res, { results });
  }));
  // Cartazes: mídias marcadas como cartaz (artes de congresso, do pregador, motions)
  const posters = () => { try { return JSON.parse(repo.getSetting('posters', '[]')); } catch { return []; } };
  app.get('/api/posters', (req, res) => {
    const all = listMedia();
    ok(res, posters().map((n) => all.find((m) => m.name === n)).filter(Boolean));
  });
  app.post('/api/posters', wrap((req, res) => {
    const add = req.body.names || [];
    repo.setSetting('posters', JSON.stringify([...add, ...posters().filter((n) => !add.includes(n))]));
    io.emit('library');
    ok(res);
  }));
  app.delete('/api/posters/:name', (req, res) => {
    repo.setSetting('posters', JSON.stringify(posters().filter((n) => n !== req.params.name)));
    io.emit('library');
    ok(res);
  });

  // Mídia por link (ex.: arrastar uma imagem/vídeo do WhatsApp Web ou Telegram Web)
  // Links de nuvem → link de download direto (Google Drive, Dropbox, OneDrive)
  function directLink(url) {
    let m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([\w-]{10,})/);
    if (m) return `https://drive.usercontent.google.com/download?id=${m[1]}&export=download&confirm=t`;
    if (/dropbox\.com\//.test(url)) return url.replace(/([?&])dl=0/, '$1dl=1') + (/[?&]dl=/.test(url) ? '' : (url.includes('?') ? '&' : '?') + 'dl=1');
    if (/1drv\.ms\/|onedrive\.live\.com/.test(url) && !/download=1/.test(url)) return url + (url.includes('?') ? '&' : '?') + 'download=1';
    return url;
  }
  app.post('/api/media/url', wrap(async (req, res) => {
    const original = String(req.body.url || '').trim();
    if (/youtube\.com|youtu\.be/i.test(original)) throw new Error('Links do YouTube não podem ser baixados. Use o arquivo do playback (mp3) ou um link do Drive/Dropbox.');
    const url = directLink(original);
    let u;
    try { u = new URL(url); } catch { throw new Error('Link inválido'); }
    if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/i.test(u.hostname)) throw new Error('Esse link não pode ser baixado');
    const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' } });
    if (!r.ok) throw new Error('Não deu para baixar (' + r.status + ')');
    const mime = r.headers.get('content-type') || '';
    const cd = r.headers.get('content-disposition') || '';
    const cdName = decodeURIComponent((cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i) || [])[1] || '');
    if (/text\/html/i.test(mime)) throw new Error('O link abriu uma página, não o arquivo. No Drive, deixe o arquivo como “Qualquer pessoa com o link”.');
    const fileName = cdName || decodeURIComponent(u.pathname.split('/').pop() || '');
    const ext = extOf(fileName, mime);
    if (!MEDIA_EXT[ext]) throw new Error('O link não é um vídeo, imagem ou áudio');
    const len = +r.headers.get('content-length') || 0;
    if (len > 1024 * 1024 * 1024) throw new Error('Arquivo grande demais');
    const tmp = path.join(tmpDir, 'url-' + Date.now().toString(36));
    fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
    const base = (fileName || 'midia').replace(/\.[^.]+$/, '') || 'midia';
    const it = mediaItem({ path: tmp, originalname: Buffer.from(base + '.' + ext, 'utf8').toString('latin1'), mimetype: mime }, '');
    const itemId = req.body.no_item ? null : addToService(req.body.service_id, it);
    io.emit('library');
    ok(res, { ok: true, itemId, type: MEDIA_EXT[ext], url: JSON.parse(it.text).url });
  }));

  // QR code para o celular do pregador enviar arquivos direto para o culto
  app.get('/api/qr', wrap(async (req, res) => {
    const ips = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
    const base = ips.length ? `http://${ips[0]}:${port}` : `http://localhost:${port}`;
    const url = base + String(req.query.path || '/');
    ok(res, { url, qr: await QRCode.toDataURL(url, { margin: 1, width: 260 }) });
  }));

  // ---------------- Temas personalizados ----------------
  app.get('/api/themes', (req, res) => ok(res, repo.listThemes()));
  app.post('/api/themes', wrap((req, res) => {
    const id = repo.saveTheme(req.body || {});
    io.emit('themes');
    broadcast();
    ok(res, { id });
  }));
  app.delete('/api/themes/:id', (req, res) => {
    repo.deleteTheme(req.params.id);
    if (live.themeId === req.params.id) live.themeId = 'brasa';
    io.emit('themes');
    broadcast();
    ok(res);
  });

  // ---------------- IA (opcional) ----------------
  const aiConf = () => ({ apiKey: repo.getSetting('ai_key', process.env.ANTHROPIC_API_KEY || ''), model: repo.getSetting('ai_model', DEFAULT_MODEL) });
  app.get('/api/settings/ai', (req, res) => {
    const { apiKey, model } = aiConf();
    ok(res, { hasKey: !!apiKey, keyHint: apiKey ? '••••' + apiKey.slice(-4) : '', model });
  });
  app.put('/api/settings/ai', wrap((req, res) => {
    if (typeof req.body.key === 'string') repo.setSetting('ai_key', req.body.key.trim());
    if (req.body.model) repo.setSetting('ai_model', String(req.body.model).trim());
    enFailed.clear();
    queueService(live.serviceId);
    ok(res);
  }));
  app.post('/api/ai/test', wrap(async (req, res) => {
    const text = await askClaude({ ...aiConf(), system: 'Responda apenas OK.', prompt: 'Teste', maxTokens: 10 });
    ok(res, { ok: true, text });
  }));
  app.post('/api/ai/translate', wrap(async (req, res) => {
    ok(res, { lines: await translateLines(req.body.lines || [], { ...aiConf(), title: req.body.title }) });
  }));
  // Inglês: encaixar a letra oficial (colada ou por link) nas linhas em português
  const stripEn = (src) => setEnStatus(String(src).replace(/\r/g, '').split('\n').filter((l) => !l.trim().startsWith('|')).join('\n'), '');
  async function alignSource(source, english) {
    const base = stripEn(source);
    const lyric = lyricLines(base).lyric;
    if (!lyric.length) throw new Error('A letra em português está vazia');
    const conf = aiConf();
    let ens;
    if (conf.apiKey) {
      ens = await alignOfficial(lyric.map((l) => l.text), english, { ...conf, title: parseSong(base).title });
    } else {
      const eng = englishLines(english);
      const plain = (t) => t.replace(/[*_^~]/g, '').trim().toLowerCase();
      if (eng.length === lyric.length) ens = eng;
      else {
        const uniq = [...new Set(lyric.map((l) => plain(l.text)))];
        const engU = [...new Set(eng.map((t) => t.toLowerCase()))].map((t) => eng.find((e) => e.toLowerCase() === t));
        if (uniq.length !== engU.length) {
          throw new Error(`As letras têm quantidades de linhas diferentes (${uniq.length} em PT, ${engU.length} em EN). Cadastre a chave da IA em Configurações para encaixar automaticamente, ou deixe o inglês com uma linha para cada linha em português.`);
        }
        const map = new Map(uniq.map((u, k) => [u, engU[k]]));
        ens = lyric.map((l) => map.get(plain(l.text)));
      }
    }
    const out = insertTranslations(base, new Map(lyric.map((l, k) => [l.i, ens[k]])));
    return setEnStatus(out, 'oficial');
  }
  async function autoTranslateSource(source) {
    const miss = missingTranslations(source);
    if (!miss.length) return null;
    const lines = await translateLines(miss.map((m) => m.text), { ...aiConf(), title: parseSong(source).title });
    return setEnStatus(insertTranslations(source, new Map(miss.map((m, k) => [m.i, lines[k]]))), 'automático');
  }
  app.post('/api/en/align', wrap(async (req, res) => {
    let english = String(req.body.english || '').trim();
    const url = String(req.body.url || '').trim();
    if (url) english = (await fetchLyrics(url)).split('\n').slice(1).join('\n');
    if (!english.trim()) throw new Error('Cole a letra oficial em inglês ou um link');
    ok(res, { source: await alignSource(req.body.source || '', english) });
  }));
  app.post('/api/songs/dedupe', wrap((req, res) => ok(res, repo.dedupeSongs({ dry: !!req.body.dry }))));
  app.post('/api/ai/keywords', wrap(async (req, res) => {
    ok(res, { chunks: await keywordChunks(req.body.chunks || [], { ...aiConf(), title: req.body.title }) });
  }));

  // ---------------- Atualização automática (GitHub) ----------------
  const DEFAULT_REPO = 'marcusdev2526/projecao-igreja';
  const updater = makeUpdater({
    root: ROOT,
    dataDir,
    getRepo: () => repo.getSetting('update_repo', DEFAULT_REPO),
    getToken: () => repo.getSetting('update_token', ''),
  });
  let updating = false;
  app.get('/api/update/settings', (req, res) => ok(res, {
    repo: repo.getSetting('update_repo', DEFAULT_REPO),
    hasToken: !!repo.getSetting('update_token', ''),
    installed: updater.installed(),
    launcher: process.env.PROJECAO_LAUNCHER === '1',
  }));
  app.put('/api/update/settings', wrap((req, res) => {
    if (req.body.repo) repo.setSetting('update_repo', String(req.body.repo).trim());
    if (typeof req.body.token === 'string') repo.setSetting('update_token', req.body.token.trim());
    ok(res);
  }));
  app.get('/api/update/check', wrap(async (req, res) => ok(res, await updater.check())));
  app.post('/api/update/apply', wrap(async (req, res) => {
    if (updating) throw new Error('Já está atualizando');
    updating = true;
    try {
      const r = await updater.apply();
      const auto = process.env.PROJECAO_LAUNCHER === '1';
      ok(res, { ...r, restarting: auto });
      io.emit('updating');
      // reabre o sistema já atualizado (o inicializador reabre sozinho)
      if (auto) setTimeout(() => process.exit(RESTART_CODE), 700);
    } finally {
      updating = false;
    }
  }));

  // Endereços para abrir no celular (mesma rede Wi-Fi)
  app.get('/api/info', wrap(async (req, res) => {
    const ips = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
    const urls = ips.map((ip) => `http://${ip}:${port}`);
    const remote = (urls[0] || `http://localhost:${port}`) + '/remote.html';
    ok(res, { urls, remote, qr: await QRCode.toDataURL(remote, { margin: 1, width: 220 }) });
  }));

  // volta para onde estava (se o sistema fechou há menos de 6 horas)
  try {
    const snap = JSON.parse(repo.getSetting('live_snapshot', 'null'));
    if (snap && Date.now() - (snap.at || 0) < 6 * 3600 * 1000) {
      live.serviceId = snap.serviceId ?? null;
      if (snap.itemId && live.serviceId) handleCmd({ type: 'item', id: snap.itemId, index: snap.index || 0 });
      else if (snap.kind === 'song' && snap.songId) handleCmd({ type: 'song', id: snap.songId, index: snap.index || 0 });
      else if (snap.kind === 'bible' && snap.bible) { loadBible(snap.bible.book, snap.bible.chapter, 1); live.index = Math.min(snap.index || 0, live.slides.length - 1); }
      if (live.slides.length) live.index = Math.min(snap.index || 0, live.slides.length - 1);
      live.clear = !!snap.clear;
      live.logo = !!snap.logo;
      live.waiting = !!snap.waiting;
      live.showBase = !!snap.showBase && !!live.base;
      live.timing = { serviceStart: null, blockId: null, blockStart: null };
      if (live.player) live.player = { ...live.player, status: 'paused' };
      if (live.title) console.log('  Voltando para onde estava: ' + live.title + ' (slide ' + (live.index + 1) + ')');
    }
  } catch (e) {
    console.log('  Não deu para restaurar o ponto do culto:', e.message);
  }

  return new Promise((resolve) => {
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.log(`\n  O sistema já está aberto em outra janela (porta ${port} em uso).`);
        console.log(`  Use a janela que já está aberta e acesse http://localhost:${port}`);
        console.log('  ou feche a outra janela preta (Ctrl + C) e rode "npm start" de novo.\n');
        process.exit(1);
      }
      throw e;
    });
    server.listen(port, '0.0.0.0', () => {
      console.log(`\n  Projeção Igreja rodando:`);
      console.log(`  Painel do operador:  http://localhost:${port}`);
      console.log(`  Telão:               http://localhost:${port}/screen.html`);
      console.log(`  Retorno (palco):     http://localhost:${port}/stage.html`);
      console.log(`  Celular:             http://<ip-deste-computador>:${port}/remote.html\n`);
      resolve({ server, port, io, db });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startServer();
