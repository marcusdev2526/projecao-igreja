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
import { translateLines, keywordChunks, askClaude, DEFAULT_MODEL } from './ai.js';
import { fetchLyrics } from './urlimport.js';
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
  for (const f of ['unbounded', 'instrument-serif', 'inter', 'anton', 'montserrat', 'playfair-display'])
    app.use('/fonts/' + f, express.static(path.join(ROOT, 'node_modules/@fontsource', f)));

  // ---------------- Estado ao vivo ----------------
  const live = {
    mode: repo.getSetting('mode', 'pt'),
    themeId: repo.getSetting('theme', 'brasa'),
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
    loggedSongs: new Set(),
    bibleMain: repo.getSetting('bible_main', 'BLIVRE'),
    bibleSecond: repo.getSetting('bible_second', 'KJV'),
    bible: null, // { book, chapter }
    biblePer: Math.min(3, Math.max(1, +repo.getSetting('bible_per', '1') || 1)),
  };
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
    return groups.map((g, index) => {
      const verses = g.map((v) => ({ n: v.verse, pt: v.text, en: byVerse.get(v.verse) || '' }));
      const join = (k) => verses.map((v) => (verses.length > 1 ? `${v.n} ` : '') + v[k]).filter((x) => x.trim()).join(' ');
      return {
        index,
        kind: 'bible',
        code: 'B',
        name: refText(book, chapter, range(g), langOf(live.bibleMain)),
        verse: g[0].verse,
        verses,
        ref: { pt: refText(book, chapter, range(g), langOf(live.bibleMain)), en: refText(book, chapter, range(g), langOf(live.bibleSecond)) },
        versions: { pt: live.bibleMain, en: live.bibleSecond },
        lines: [{ pt: join('pt'), en: verses.some((v) => v.en) ? join('en') : '' }],
      };
    });
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

  const preview = (s) => (s ? s.lines.map((l) => l.pt).join(' / ') : '');
  function publicState() {
    const slide = live.slides[live.index] || null;
    return {
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
      slides: live.slides.map((s) => ({ index: s.index, name: s.name, code: s.code, part: s.part, parts: s.parts, preview: preview(s) })),
      message: live.message,
      themeDef: themeDef(live.themeId),
      bibleMain: live.bibleMain,
      bibleSecond: live.bibleSecond,
      bible: live.bible,
      biblePer: live.biblePer,
    };
  }
  const broadcast = () => io.emit('state', publicState());

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
    switch (c.type) {
      case 'service':
        live.serviceId = c.id ?? null;
        break;
      case 'item': {
        const svc = live.serviceId && repo.getService(live.serviceId);
        const item = svc?.items.find((i) => i.id === c.id) || db.prepare('SELECT * FROM service_item WHERE id = ?').get(c.id);
        if (!item) return;
        if (item.kind === 'song') loadSong(item.song_id, { itemId: item.id, index: c.index || 0 });
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
        loadSong(c.id, { index: c.index || 0 });
        break;
      case 'bible':
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
        if (c.index >= 0 && c.index < live.slides.length) live.index = c.index;
        live.clear = false;
        break;
      case 'next':
        if (live.index < live.slides.length - 1) live.index++;
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
      case 'clear':
        live.clear = typeof c.value === 'boolean' ? c.value : !live.clear;
        break;
      case 'mode': {
        if (!['pt', 'pt-en', 'en', 'en-pt'].includes(c.value)) return;
        const cur = live.slides[live.index];
        live.mode = c.value;
        repo.setSetting('mode', c.value);
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
    broadcast();
  }

  // Avança para o próximo/anterior item do culto
  function nextItem(dir) {
    if (!live.serviceId || !live.itemId) return;
    const svc = repo.getService(live.serviceId);
    const i = svc.items.findIndex((x) => x.id === live.itemId);
    const target = svc.items[i + dir];
    if (!target) return;
    handleCmd({ type: 'item', id: target.id });
    if (dir < 0) {
      live.index = live.slides.length - 1;
      broadcast();
    }
  }

  io.on('connection', (socket) => {
    socket.emit('state', publicState());
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
  app.post('/api/services', wrap((req, res) => ok(res, { id: repo.createService(req.body.title || 'Culto', req.body.date || new Date().toLocaleDateString('sv-SE')) })));
  app.get('/api/services/:id', (req, res) => {
    const s = repo.getService(+req.params.id);
    s ? ok(res, s) : res.status(404).json({ error: 'Culto não encontrado' });
  });
  app.put('/api/services/:id', wrap((req, res) => { repo.renameService(+req.params.id, req.body.title, req.body.date); ok(res); }));
  app.delete('/api/services/:id', (req, res) => { repo.deleteService(+req.params.id); ok(res); });
  app.post('/api/services/:id/items', wrap((req, res) => ok(res, { id: repo.addItem(+req.params.id, req.body) })));
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
  const MEDIA_EXT = { jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image', mp4: 'video', webm: 'video', mov: 'video', m4v: 'video' };
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
  const listMedia = () => fs.readdirSync(mediaDir)
    .filter((f) => MEDIA_EXT[(f.split('.').pop() || '').toLowerCase()])
    .map((f) => ({ name: f, url: '/media/' + encodeURIComponent(f), type: MEDIA_EXT[f.split('.').pop().toLowerCase()], size: fs.statSync(path.join(mediaDir, f)).size }))
    .sort((a, b) => a.name.localeCompare(b.name));
  app.get('/api/media', (req, res) => ok(res, listMedia()));
  app.post('/api/media', mediaUpload.array('files', 50), wrap((req, res) => {
    if (!req.files?.length) throw new Error('Formato não aceito. Use imagem (jpg, png, webp) ou vídeo (mp4, webm, mov)');
    ok(res, { files: req.files.map((f) => '/media/' + encodeURIComponent(f.filename)) });
  }));
  app.delete('/api/media/:name', (req, res) => {
    const f = path.join(mediaDir, path.basename(req.params.name));
    if (f.startsWith(mediaDir) && fs.existsSync(f)) fs.unlinkSync(f);
    ok(res);
  });

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
    ok(res);
  }));
  app.post('/api/ai/test', wrap(async (req, res) => {
    const text = await askClaude({ ...aiConf(), system: 'Responda apenas OK.', prompt: 'Teste', maxTokens: 10 });
    ok(res, { ok: true, text });
  }));
  app.post('/api/ai/translate', wrap(async (req, res) => {
    ok(res, { lines: await translateLines(req.body.lines || [], { ...aiConf(), title: req.body.title }) });
  }));
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

  return new Promise((resolve) => {
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
