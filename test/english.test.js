import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSong } from '../public/shared/parser.js';
import { setEnStatus, englishLines, insertTranslations, lyricLines } from '../public/shared/enhance.js';
import { alignOfficial } from '../server/ai.js';
import { openDb, makeRepo } from '../server/db.js';

const PT = `A Bênção
Artista: Gabriel Guedes
Tom: D

[Verso 1]
Que o Senhor Te abençoe
E faça brilhar Seu rosto em Ti

[Refrão]
Amém, amém, amém

[Refrão]`;

test('marca de inglês automático/oficial', () => {
  const a = setEnStatus(PT, 'automático');
  assert.match(a, /Tom: D\nInglês: automático/);
  assert.equal(parseSong(a).enStatus, 'auto');
  assert.equal(parseSong(a).title, 'A Bênção');
  assert.equal(lyricLines(a).lyric.length, 3);
  const b = setEnStatus(a, 'oficial');
  assert.equal((b.match(/Inglês:/g) || []).length, 1);
  assert.equal(parseSong(b).enStatus, 'oficial');
  assert.ok(!/Inglês/.test(setEnStatus(b, '')));
});

test('linhas da letra oficial sem rótulos e cifras', () => {
  assert.deepEqual(englishLines('[Verse 1]\nG D\nThe Lord bless you\n\n[Chorus]\nAmen (2x)'), ['The Lord bless you', 'Amen']);
});

test('alignOfficial usa a resposta da IA e confere a quantidade', async () => {
  const fake = async (url, o) => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: '["The Lord bless you","Make His face shine upon you","Amen, amen, amen"]' }] }) });
  const r = await alignOfficial(['Que o Senhor Te abençoe', 'E faça brilhar Seu rosto em Ti', 'Amém, amém, amém'], 'x', { apiKey: 'k', fetchImpl: fake });
  assert.equal(r[1], 'Make His face shine upon you');
  const lyric = lyricLines(PT).lyric;
  const out = setEnStatus(insertTranslations(PT, new Map(lyric.map((l, k) => [l.i, r[k]]))), 'oficial');
  const p = parseSong(out);
  assert.ok(p.hasEn);
  assert.equal(p.sections[0].lines[0].en, 'The Lord bless you');
  await assert.rejects(alignOfficial(['a', 'b'], 'x', { apiKey: 'k', fetchImpl: fake }));
});

test('remover duplicados mantém uma cópia e repassa o culto', () => {
  const repo = makeRepo(openDb(':memory:'));
  const a = repo.createSong(PT);
  const b = repo.createSong(PT + '\n');
  repo.createSong(PT.replace('Amém', 'Aleluia'));
  const sid = repo.createService('Culto', '2026-11-29');
  repo.addItem(sid, { kind: 'song', song_id: b });
  assert.deepEqual(repo.dedupeSongs({ dry: true }), { removed: 1, total: 3 });
  repo.dedupeSongs();
  assert.equal(repo.listSongs().length, 2);
  assert.equal(repo.getService(sid).items[0].song_id, a);
  assert.equal(repo.getSong(a).has_en, 0);
  repo.updateSong(a, setEnStatus(PT.replace('Amém, amém, amém', 'Amém, amém, amém\n| Amen'), 'automático'), {});
  assert.equal(repo.getSong(a).has_en, 2);
});
