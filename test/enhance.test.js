import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoKeywords, markChunk, missingTranslations, insertTranslations, sameWords, chunksOf } from '../public/shared/enhance.js';
import { translateLines, keywordChunks } from '../server/ai.js';
import { extractFromHtml } from '../server/urlimport.js';
import { parseSong } from '../public/shared/parser.js';

const SRC = `Graça Sem Fim
Artista: Teste

[Verso 1]
Sem você
Não sei pra onde ir
| I don't know where to go

[Refrão]
Tudo é graça
Graça sem fim
`;

test('palavra-chave automática mantém as palavras e a tradução', () => {
  const out = autoKeywords(SRC, { title: 'Graça Sem Fim' });
  const p = parseSong(out);
  assert.equal(p.title, 'Graça Sem Fim');
  for (const s of p.sections) for (const l of s.lines) assert.ok(/[*]/.test(l.pt) || /[\^~]/.test(l.pt), l.pt);
  assert.equal(p.sections[0].lines[1].en, "I don't know where to go");
  const before = parseSong(SRC).sections.flatMap((s) => s.lines.map((l) => l.pt));
  const after = p.sections.flatMap((s) => s.lines.map((l) => l.pt));
  before.forEach((b, i) => assert.ok(sameWords(b, after[i]), b + ' -> ' + after[i]));
  // não mexe em slide já marcado
  assert.deepEqual(markChunk(['*JÁ* marcado']), ['*JÁ* marcado']);
});

test('linhas sem tradução e inserção', () => {
  const miss = missingTranslations(SRC);
  assert.deepEqual(miss.map((m) => m.text), ['Sem você', 'Tudo é graça', 'Graça sem fim']);
  const out = insertTranslations(SRC, new Map(miss.map((m, k) => [m.i, ['Without You', 'All is grace', 'Endless grace'][k]])));
  const p = parseSong(out);
  assert.equal(p.sections[0].lines[0].en, 'Without You');
  assert.equal(p.sections[1].lines[1].en, 'Endless grace');
  assert.equal(chunksOf(SRC, 2).chunks.length, 2);
});

const fakeFetch = (reply) => async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: reply }] }) });

test('IA: tradução e palavra-chave validadas', async () => {
  const t = await translateLines(['Sem você', 'Tudo é graça'], { apiKey: 'x', fetchImpl: fakeFetch('["Without You","All is grace"]') });
  assert.deepEqual(t, ['Without You', 'All is grace']);
  await assert.rejects(translateLines(['a', 'b'], { apiKey: 'x', fetchImpl: fakeFetch('["só uma"]') }));
  const k = await keywordChunks([['Sem você', 'Não sei'], ['Tudo é graça']], { apiKey: 'x', fetchImpl: fakeFetch('[["^sem^ *VOCÊ*","~Não sei~"],["_tudo é_ *GRAÇA* extra"]]') });
  assert.deepEqual(k[0], ['^sem^ *VOCÊ*', '~Não sei~']);
  assert.equal(k[1], null); // mudou as palavras: rejeitado
});

test('importar por link: extrai título, artista e letra', () => {
  const html = `<html><head><meta property="og:title" content="Tua Graça - Ministério Teste - LETRAS.MUS.BR"><title>x</title></head>
  <body><nav>Menu Login</nav><div class="lyric-original"><p>Primeira linha<br>Segunda linha</p><p>Refrão um<br/>Refrão dois</p></div><footer>© 2026</footer></body></html>`;
  const src = extractFromHtml(html, 'https://exemplo.com/x');
  const p = parseSong(src);
  assert.equal(p.title, 'Tua Graça');
  assert.equal(p.artist, 'Ministério Teste');
  assert.equal(p.sections.length, 2);
  const html2 = `<html><head><title>Hino Teste</title></head><body><div>Cabeçalho do site com um texto bem comprido que não é letra de música nenhuma, só navegação e propaganda</div>
  <div>Linha a<br>Linha b<br>Linha c<br><br>Linha d<br>Linha e</div></body></html>`;
  const p2 = parseSong(extractFromHtml(html2));
  assert.equal(p2.title, 'Hino Teste');
  assert.equal(p2.sections.flatMap((s) => s.lines).length, 5);
});

test('importar de site de cifra (<pre>, rótulos com acordes, invisíveis, sublinhados)', async () => {
  const { extractFromHtml } = await import('../server/urlimport.js');
  const pre = '<div class="x">\u200b[Intro] <b>Am7</b>  <b>G</b>\n</div><div>\u200b\n</div><div>\u200b[Primeira Parte]\n</div><div>\u200b\n</div><div>\u200b      <b>Am7</b>\n</div><div>\u200bTu és o Deus dessa terra\n</div><div>\u200bNesse luga________ar\n</div><div>\u200b\n</div><div>\u200b[Refrão]\n</div><div>\u200bGrandes coisas\n</div><div>\u200bNinguém como De__eus\n</div>';
  const html = `<html><head><meta property="og:title" content="Grandes Coisas - Fernandinho - Cifra Club"></head><body><pre class="_c">${pre}</pre></body></html>`;
  const p = parseSong(extractFromHtml(html));
  assert.equal(p.title, 'Grandes Coisas');
  assert.equal(p.artist, 'Fernandinho');
  assert.deepEqual(p.sections.map((s) => s.code), ['V1', 'R']);
  assert.deepEqual(p.sections[0].lines.map((l) => l.pt), ['Tu és o Deus dessa terra', 'Nesse lugar']);
  assert.equal(p.sections[0].lines[0].chords, 'Am7');
  assert.equal(p.sections[1].lines[1].pt, 'Ninguém como Deus');
});
