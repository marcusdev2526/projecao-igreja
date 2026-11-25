// Banco SQLite local (arquivo data/louvores.db). Usa o SQLite embutido do Node 22+.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { parseSong } from '../public/shared/parser.js';

export function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS song (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT DEFAULT '',
      song_key TEXT DEFAULT '',
      bpm TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      theme_id TEXT DEFAULT '',
      has_en INTEGER DEFAULT 0,
      source TEXT NOT NULL,          -- letra no formato de texto (fonte única da verdade)
      search TEXT DEFAULT '',        -- texto normalizado para busca
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS service (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS service_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL REFERENCES service(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      kind TEXT NOT NULL,            -- 'song' | 'text'
      song_id INTEGER REFERENCES song(id) ON DELETE CASCADE,
      text TEXT DEFAULT '',
      title TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS play_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id INTEGER REFERENCES song(id) ON DELETE CASCADE,
      service_id INTEGER,
      played_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS setting (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS bible_version (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      lang TEXT DEFAULT 'pt',
      license TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS bible_verse (
      version TEXT NOT NULL REFERENCES bible_version(code) ON DELETE CASCADE,
      book INTEGER NOT NULL,
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      text TEXT NOT NULL,
      search TEXT NOT NULL,
      PRIMARY KEY (version, book, chapter, verse)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS theme (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
  return db;
}

export const normalize = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[*_^~|]/g, '')
    .replace(/\s+/g, ' ');

export function songFields(source, extra = {}) {
  const p = parseSong(source);
  const tags = extra.tags ?? p.tags ?? [];
  return {
    title: extra.title || p.title || 'Sem título',
    artist: extra.artist ?? p.artist ?? '',
    song_key: extra.key ?? p.key ?? '',
    bpm: extra.bpm ?? p.bpm ?? '',
    tags: Array.isArray(tags) ? tags.join(', ') : String(tags),
    theme_id: extra.theme_id || '',
    has_en: p.hasEn ? (p.enStatus === 'auto' ? 2 : 1) : 0,
    source,
    search: normalize([p.title, p.artist, source].join(' ')),
  };
}

export function makeRepo(db) {
  const q = (sql) => db.prepare(sql);
  return {
    listSongs(term = '') {
      const t = normalize(term).trim();
      const rows = q(`SELECT s.id, s.title, s.artist, s.song_key, s.tags, s.has_en, s.theme_id,
          (SELECT COUNT(DISTINCT date(p.played_at)) FROM play_log p WHERE p.song_id = s.id) AS plays,
          (SELECT MAX(p.played_at) FROM play_log p WHERE p.song_id = s.id) AS last_played
        FROM song s ${t ? 'WHERE s.search LIKE ?' : ''} ORDER BY s.title COLLATE NOCASE`).all(...(t ? [`%${t}%`] : []));
      // títulos que começam com o termo primeiro
      if (t) rows.sort((a, b) => (normalize(b.title).startsWith(t) ? 1 : 0) - (normalize(a.title).startsWith(t) ? 1 : 0));
      return rows;
    },
    getSong: (id) => q('SELECT * FROM song WHERE id = ?').get(id),
    findDuplicate: (title, artist) =>
      q("SELECT id, title, artist FROM song WHERE lower(title) = lower(?) AND (lower(artist) = lower(?) OR ? = '')").get(title, artist || '', artist || ''),
    createSong(source, extra) {
      const f = songFields(source, extra);
      const r = q(`INSERT INTO song (title, artist, song_key, bpm, tags, theme_id, has_en, source, search)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(f.title, f.artist, f.song_key, f.bpm, f.tags, f.theme_id, f.has_en, f.source, f.search);
      return Number(r.lastInsertRowid);
    },
    updateSong(id, source, extra) {
      const f = songFields(source, extra);
      q(`UPDATE song SET title=?, artist=?, song_key=?, bpm=?, tags=?, theme_id=?, has_en=?, source=?, search=?,
        updated_at=datetime('now','localtime') WHERE id=?`).run(f.title, f.artist, f.song_key, f.bpm, f.tags, f.theme_id, f.has_en, f.source, f.search, id);
    },
    deleteSong: (id) => q('DELETE FROM song WHERE id = ?').run(id),
    // Remove louvores repetidos (mesma letra). Mantém o mais antigo e repassa cultos e histórico para ele.
    dedupeSongs({ dry = false } = {}) {
      const key = (src) => String(src || '').replace(/\r/g, '').split('\n').map((l) => l.trim().replace(/\s+/g, ' ').toLowerCase()).filter(Boolean).join('\n');
      const keep = new Map();
      const drop = [];
      for (const r of q('SELECT id, source FROM song ORDER BY id').all()) {
        const k = key(r.source);
        if (keep.has(k)) drop.push([r.id, keep.get(k)]);
        else keep.set(k, r.id);
      }
      if (!dry && drop.length) {
        db.exec('BEGIN');
        try {
          for (const [id, to] of drop) {
            q('UPDATE service_item SET song_id = ? WHERE song_id = ?').run(to, id);
            q('UPDATE play_log SET song_id = ? WHERE song_id = ?').run(to, id);
            q('DELETE FROM song WHERE id = ?').run(id);
          }
          db.exec('COMMIT');
        } catch (e) { db.exec('ROLLBACK'); throw e; }
      }
      return { removed: drop.length, total: keep.size + drop.length };
    },
    allSongsFull: () => q('SELECT title, artist, song_key, bpm, tags, theme_id, source FROM song ORDER BY title').all(),

    // Cultos
    listServices: () => q('SELECT * FROM service ORDER BY date DESC, id DESC LIMIT 50').all(),
    createService(title, date) {
      return Number(q('INSERT INTO service (title, date) VALUES (?, ?)').run(title, date).lastInsertRowid);
    },
    getService(id) {
      const s = q('SELECT * FROM service WHERE id = ?').get(id);
      if (!s) return null;
      s.items = q(`SELECT i.*, s.title AS song_title, s.artist AS song_artist, s.has_en
        FROM service_item i LEFT JOIN song s ON s.id = i.song_id WHERE i.service_id = ? ORDER BY i.position`).all(id);
      return s;
    },
    renameService: (id, title, date) => q('UPDATE service SET title = ?, date = ? WHERE id = ?').run(title, date, id),
    deleteService: (id) => q('DELETE FROM service WHERE id = ?').run(id),
    addItem(serviceId, item) {
      const pos = (q('SELECT MAX(position) AS m FROM service_item WHERE service_id = ?').get(serviceId).m ?? -1) + 1;
      return Number(
        q('INSERT INTO service_item (service_id, position, kind, song_id, text, title) VALUES (?,?,?,?,?,?)').run(
          serviceId, pos, item.kind, item.song_id ?? null, item.text || '', item.title || ''
        ).lastInsertRowid
      );
    },
    updateItem: (id, item) => q('UPDATE service_item SET text = ?, title = ? WHERE id = ?').run(item.text || '', item.title || '', id),
    deleteItem: (id) => q('DELETE FROM service_item WHERE id = ?').run(id),
    reorderItems(serviceId, ids) {
      const st = q('UPDATE service_item SET position = ? WHERE id = ? AND service_id = ?');
      ids.forEach((id, i) => st.run(i, id, serviceId));
    },
    // Bíblia
    listVersions: () => q(`SELECT v.code, v.name, v.lang, v.license, (SELECT COUNT(*) FROM bible_verse b WHERE b.version = v.code) AS verses
      FROM bible_version v ORDER BY v.lang DESC, v.name`).all(),
    importVersion(v) {
      // v = { code, name, lang, license, books: [[ [versos do cap. 1], [cap. 2] ... ] por livro] }
      const code = String(v.code).toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16);
      if (!code) throw new Error('Código da versão inválido');
      db.exec('BEGIN');
      try {
        q('DELETE FROM bible_verse WHERE version = ?').run(code);
        q('INSERT INTO bible_version (code, name, lang, license) VALUES (?,?,?,?) ON CONFLICT(code) DO UPDATE SET name=excluded.name, lang=excluded.lang, license=excluded.license')
          .run(code, v.name || code, v.lang || 'pt', v.license || '');
        const ins = q('INSERT OR REPLACE INTO bible_verse (version, book, chapter, verse, text, search) VALUES (?,?,?,?,?,?)');
        let n = 0;
        v.books.forEach((chapters, bi) => (chapters || []).forEach((verses, ci) => (verses || []).forEach((t, vi) => {
          if (t == null || !String(t).trim()) return;
          ins.run(code, bi + 1, ci + 1, vi + 1, String(t).trim(), normalize(t));
          n++;
        })));
        db.exec('COMMIT');
        return { code, verses: n };
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    deleteVersion: (code) => { q('DELETE FROM bible_verse WHERE version = ?').run(code); q('DELETE FROM bible_version WHERE code = ?').run(code); },
    getChapter: (code, book, chapter) => q('SELECT verse, text FROM bible_verse WHERE version = ? AND book = ? AND chapter = ? ORDER BY verse').all(code, book, chapter),
    chapterCount: (code, book) => q('SELECT MAX(chapter) AS n FROM bible_verse WHERE version = ? AND book = ?').get(code, book)?.n || 0,
    searchBible(code, term, limit = 60) {
      const words = normalize(term).split(' ').filter((w) => w.length > 1);
      if (!words.length) return [];
      return q(`SELECT book, chapter, verse, text FROM bible_verse WHERE version = ? ${words.map(() => 'AND search LIKE ?').join(' ')}
        ORDER BY book, chapter, verse LIMIT ?`).all(code, ...words.map((w) => `%${w}%`), limit);
    },

    // Temas personalizados
    listThemes: () => q('SELECT id, name, data FROM theme ORDER BY name COLLATE NOCASE').all().map((t) => ({ ...JSON.parse(t.data), id: t.id, name: t.name, custom: true })),
    saveTheme(t) {
      const id = t.id || 'tema-' + Date.now().toString(36);
      const { id: _i, name, custom, ...data } = t;
      q(`INSERT INTO theme (id, name, data) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, data=excluded.data,
        updated_at=datetime('now','localtime')`).run(id, name || 'Tema', JSON.stringify(data));
      return id;
    },
    deleteTheme: (id) => q('DELETE FROM theme WHERE id = ?').run(id),

    logPlay: (songId, serviceId) => q('INSERT INTO play_log (song_id, service_id) VALUES (?, ?)').run(songId, serviceId ?? null),
    getSetting: (k, d) => q('SELECT value FROM setting WHERE key = ?').get(k)?.value ?? d,
    setSetting: (k, v) => q('INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v)),
  };
}
