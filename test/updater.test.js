import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { makeUpdater } from '../server/updater.js';

test('atualização: baixa, copia sem tocar em data/ e grava a versão', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir);
  fs.writeFileSync(path.join(dataDir, 'louvores.db'), 'MEUS LOUVORES');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { a: '1' } }));
  fs.writeFileSync(path.join(root, 'velho.txt'), 'antigo');
  const zip = new AdmZip();
  zip.addFile('marcus-projecao-abc123/package.json', Buffer.from(JSON.stringify({ dependencies: { a: '1' } })));
  zip.addFile('marcus-projecao-abc123/public/novo.js', Buffer.from('novo'));
  zip.addFile('marcus-projecao-abc123/data/louvores.db', Buffer.from('APAGARIA TUDO'));
  zip.addFile('marcus-projecao-abc123/velho.txt', Buffer.from('atualizado'));
  const zbuf = zip.toBuffer();
  const fakeFetch = async (url) => {
    const json = (o) => ({ ok: true, status: 200, json: async () => o });
    if (url.endsWith('/repos/marcus/projecao')) return json({ default_branch: 'main' });
    if (url.includes('/commits/HEAD')) return json({ sha: 'abc123def456', commit: { message: 'Versão nova\nDetalhes', committer: { date: '2026-11-25T01:00:00Z' } } });
    if (url.includes('/zipball/abc123def456')) return { ok: true, status: 200, arrayBuffer: async () => zbuf };
    return { ok: false, status: 404 };
  };
  const up = makeUpdater({ root, dataDir, getRepo: () => 'https://github.com/marcus/projecao', getToken: () => '', fetchImpl: fakeFetch });
  const c = await up.check();
  assert.equal(c.available, true);
  assert.equal(c.latest.message, 'Versão nova');
  const r = await up.apply();
  assert.equal(r.depsChanged, false);
  assert.equal(fs.readFileSync(path.join(root, 'public/novo.js'), 'utf8'), 'novo');
  assert.equal(fs.readFileSync(path.join(root, 'velho.txt'), 'utf8'), 'atualizado');
  assert.equal(fs.readFileSync(path.join(dataDir, 'louvores.db'), 'utf8'), 'MEUS LOUVORES');
  assert.equal((await up.check()).available, false);
});

test('atualização: não oferece versão que falhou nos testes do GitHub', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-'));
  const dataDir = path.join(root, 'data');
  const json = (o) => ({ ok: true, status: 200, json: async () => o });
  const mk = (runs) => makeUpdater({ root, dataDir, getRepo: () => 'marcus/projecao', getToken: () => '', fetchImpl: async (url) => {
    if (url.endsWith('/repos/marcus/projecao')) return json({ default_branch: 'main' });
    if (url.endsWith('/check-runs')) return json({ check_runs: runs });
    if (url.includes('/commits/HEAD')) return json({ sha: 'fff111', commit: { message: 'x', committer: { date: '' } } });
    return { ok: false, status: 404 };
  } });
  let c = await mk([{ status: 'completed', conclusion: 'failure' }]).check();
  assert.equal(c.tests, 'falhou');
  assert.equal(c.available, false);
  c = await mk([{ status: 'in_progress', conclusion: null }]).check();
  assert.equal(c.tests, 'rodando');
  assert.equal(c.available, false);
  c = await mk([{ status: 'completed', conclusion: 'success' }]).check();
  assert.equal(c.tests, 'ok');
  assert.equal(c.available, true);
});
