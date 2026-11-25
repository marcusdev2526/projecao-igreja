// Importação de versões da Bíblia (JSON). Formatos aceitos:
//  1) deste sistema: { code, name, lang, books: [[ ["v1","v2"], [cap 2] ], ...] }
//  2) scrollmapper/bible_databases: { translation, books: [{ name, chapters: [{ chapter, verses: [{ verse, text }] }] }] }
//  3) thiagobodruk/biblia (comum no Brasil): [{ abbrev, chapters: [["v1","v2"], ...] }, ...]
// Arquivos .json ou .json.gz
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

export function parseBibleJson(buf) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const data = JSON.parse(buf.toString('utf8').replace(/^﻿/, ''));
  let books;
  let name = '';
  let lang = '';
  let code = '';
  let license = '';
  if (Array.isArray(data) && data[0]?.chapters) {
    books = data.map((b) => b.chapters.map((c) => c.map(String)));
  } else if (data.books && Array.isArray(data.books[0])) {
    ({ name = '', lang = '', code = '', license = '' } = data);
    books = data.books;
  } else if (data.books && data.books[0]?.chapters) {
    name = String(data.translation || '').split(':').pop().trim();
    code = String(data.translation || '').split(':')[0].trim();
    books = data.books.map((b) => {
      const chs = [];
      for (const c of b.chapters) {
        const vs = [];
        for (const v of c.verses) vs[(v.verse || vs.length + 1) - 1] = v.text;
        chs[(c.chapter || chs.length + 1) - 1] = vs;
      }
      return chs;
    });
  } else throw new Error('Formato de Bíblia não reconhecido');
  if (books.length < 27) throw new Error(`Arquivo tem só ${books.length} livros; esperado 66 (ou 27 do Novo Testamento)`);
  // só o Novo Testamento: encaixa a partir de Mateus
  if (books.length === 27) books = [...Array(39).fill([]), ...books];
  return { name, lang, code, license, books };
}

// Primeira execução: carrega as Bíblias livres que vêm com o sistema
// (também instala versões novas que vierem numa atualização do sistema)
export function seedBibles(repo, dir) {
  if (!fs.existsSync(dir)) return;
  const have = new Set(repo.listVersions().map((v) => v.code));
  for (const f of fs.readdirSync(dir).filter((f) => /\.json(\.gz)?$/.test(f))) {
    const code = f.replace(/\.json(\.gz)?$/, '').toUpperCase();
    if (have.has(code)) continue;
    const v = parseBibleJson(fs.readFileSync(path.join(dir, f)));
    const r = repo.importVersion(v);
    console.log(`  Bíblia carregada: ${v.name} (${r.verses} versículos)`);
  }
}
