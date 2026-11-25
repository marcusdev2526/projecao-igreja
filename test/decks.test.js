import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeDecks, imagesIn } from '../server/decks.js';

test('apresentações: criar, listar, editar e apagar', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-'));
  const src = path.join(tmp, 'src');
  fs.mkdirSync(src);
  ['Slide10.PNG', 'Slide2.PNG', 'Slide1.PNG'].forEach((f) => fs.writeFileSync(path.join(src, f), 'x'));
  const imgs = imagesIn(src);
  assert.deepEqual(imgs.map((f) => path.basename(f)), ['Slide1.PNG', 'Slide2.PNG', 'Slide10.PNG']);
  const decks = makeDecks(path.join(tmp, 'decks'));
  const d = decks.create({ title: 'Pregação', author: 'Pr. João', images: imgs });
  assert.equal(d.count, 3);
  assert.deepEqual(d.slides, ['001.png', '002.png', '003.png']);
  assert.equal(decks.list()[0].thumb, `/decks/${d.id}/001.png`);
  const u = decks.update(d.id, { auto: 8, loop: true });
  assert.equal(u.auto, 8);
  assert.equal(u.loop, true);
  decks.remove(d.id);
  assert.equal(decks.list().length, 0);
  assert.throws(() => decks.create({ title: 'x', images: [] }));
});
