import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSong, buildSlides, isChordLine } from '../public/shared/parser.js';

test('título, metadados, rótulos e repetição do refrão', () => {
  const p = parseSong(`Tua Luz
Artista: Ministério Exemplo
Tom: G

[Verso 1]
Quando a noite vem
Tua luz me guia

[Refrão]
*LUZ* que não se apaga
_tudo é_ *graça* (2x)

[Verso 2]
Eu sigo em paz
Teu amor me cerca

[Refrão]
`);
  assert.equal(p.title, 'Tua Luz');
  assert.equal(p.artist, 'Ministério Exemplo');
  assert.equal(p.key, 'G');
  assert.deepEqual(p.sections.map(s => s.code), ['V1', 'R', 'V2']);
  assert.deepEqual(p.arrangement, ['V1', 'R', 'R', 'V2', 'R']);
});

test('pares PT/EN e cifras', () => {
  const p = parseSong(`Teste
[Refrão]
G      D      Em
Santo, santo é o Senhor
| Holy, holy is the Lord
C       D
Digno de louvor
| Worthy of praise`);
  const l = p.sections[0].lines;
  assert.equal(l.length, 2);
  assert.equal(l[0].en, 'Holy, holy is the Lord');
  assert.equal(l[0].chords, 'G      D      Em');
  assert.equal(p.hasEn, true);
});

test('sem rótulos: detecta refrão repetido', () => {
  const p = parseSong(`Canção
Linha um
Linha dois

Coro aqui
Coro ali

Linha três
Linha quatro

Coro aqui
Coro ali`);
  assert.deepEqual(p.sections.map(s => s.type), ['verso', 'refrao', 'verso']);
  assert.deepEqual(p.arrangement, ['V1', 'R', 'V2', 'R']);
});

test('linha "Refrão 2x" e Ordem:', () => {
  const p = parseSong(`X\n\nVerso\na\nb\n\nRefrão:\nc\nd\n\nRefrão 2x`);
  assert.deepEqual(p.arrangement, ['V1', 'R', 'R', 'R']);
  const q = parseSong(`X\nOrdem: R V1 R\n\n[Verso 1]\na\n\n[Refrão]\nb`);
  assert.deepEqual(q.arrangement, ['R', 'V1', 'R']);
});

test('slides balanceados e quebra manual', () => {
  const p = parseSong(`X\n[Verso 1]\n1\n2\n3\n4\n5\n\n[Ponte]\na\n---\nb\nc`);
  const s2 = buildSlides(p, { maxLines: 2 });
  assert.deepEqual(s2.filter(s => s.code === 'V1').map(s => s.lines.length), [2, 2, 1]);
  const s4 = buildSlides(p, { maxLines: 4 });
  assert.deepEqual(s4.filter(s => s.code === 'V1').map(s => s.lines.length), [3, 2]);
  assert.deepEqual(s4.filter(s => s.code === 'P').map(s => s.lines.length), [1, 2]);
});

test('cifras x letras curtas', () => {
  assert.ok(isChordLine('G D/F# Em C'));
  assert.ok(isChordLine('Am7  F7M  C9  G4'));
  assert.ok(!isChordLine('Aleluia'));
  assert.ok(!isChordLine('Deus é bom'));
});

test('linha pequena (~abaixo~) não fica sozinha no slide', () => {
  const p = parseSong(`X\n[Ponte]\n_eu me rendo_\n*TODO*\n~a ti, Senhor~`);
  const s = buildSlides(p, { maxLines: 2 });
  assert.deepEqual(s.map((x) => x.lines.length), [3]);
});

test('Holyrics: cabeçalho, "Coro" sozinho e ordem', async () => {
  const { holyricsMusicToSource } = await import('../server/holyrics.js');
  const src = holyricsMusicToSource({
    title: 'Hino', artist: 'Cantor Cristão - 1', note: 'CC001', language: 'Cantor Cristão',
    lyrics: 'Verso um a\nVerso um b\n\nRefrão\nCoro a\nCoro b\n\n2\nVerso dois a\nVerso dois b\n\nCoro',
    order: [],
  });
  const p = parseSong(src);
  assert.deepEqual(p.arrangement, ['V1', 'R', 'V2', 'R']);
  assert.equal(p.sections.find((s) => s.code === 'V2').lines[0].pt, 'Verso dois a');
  assert.equal(p.note, 'CC001');
});
