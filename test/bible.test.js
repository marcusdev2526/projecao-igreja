import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRef, findBook } from '../public/shared/bible.js';

test('referências bíblicas', () => {
  assert.deepEqual(parseRef('jo 3 16'), { book: 43, chapter: 3, verse: 16, verseEnd: null });
  assert.deepEqual(parseRef('João 3:16-18'), { book: 43, chapter: 3, verse: 16, verseEnd: 18 });
  assert.equal(parseRef('Jó 1').book, 18);
  assert.deepEqual(parseRef('1co 13'), { book: 46, chapter: 13, verse: null, verseEnd: null });
  assert.equal(parseRef('1 Coríntios 13.4').verse, 4);
  assert.equal(parseRef('sl 23').book, 19);
  assert.equal(parseRef('apoc 22 21').book, 66);
  assert.equal(parseRef('gen 1').book, 1);
  assert.equal(parseRef('Rm 8:28').book, 45);
  assert.equal(findBook('mat').n, 40);
  assert.equal(parseRef('xyz 1'), null);
});
