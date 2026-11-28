// Teste de fumaça do servidor: sobe o sistema numa pasta temporária e confere as páginas, a API e as regras de segurança.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server/index.js';

let srv;
let base;
const lanIp = Object.values(os.networkInterfaces()).flat().find((n) => n && n.family === 'IPv4' && !n.internal)?.address;

before(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pj-'));
  srv = await startServer({ port: 0, dataDir });
  base = `http://localhost:${srv.server.address().port}`;
});
after(() => { srv?.io.close(); srv?.server.close(); });

const j = (r) => r.json();
const post = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('páginas principais abrem', async () => {
  for (const p of ['/', '/screen.html', '/stage.html', '/remote.html', '/obs.html', '/enviar.html', '/pedidos.html', '/entrar.html', '/sw.js', '/shared/render.js', '/shared/scenes.js', '/operator/app.js']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
  }
});

test('API básica: louvores, cultos, temas, Bíblia', async () => {
  const songs = await j(await fetch(base + '/api/songs'));
  assert.ok(songs.length >= 1);
  const svcs = await j(await fetch(base + '/api/services'));
  assert.ok(svcs.length >= 1);
  const svc = await j(await fetch(base + '/api/services/' + svcs[0].id));
  assert.ok(Array.isArray(svc.items));
  assert.equal((await fetch(base + '/api/themes')).status, 200);
  assert.equal((await fetch(base + '/api/bible/versions')).status, 200);
});

test('segurança: bloqueia site de fora (Host falso e Origin de outro site)', async () => {
  // fetch não deixa trocar o Host; usa http direto
  const http = await import('node:http');
  const status = await new Promise((res) => http.get({ host: 'localhost', port: srv.server.address().port, path: '/api/songs', headers: { Host: 'evil.example' } }, (r) => res(r.statusCode)));
  assert.equal(status, 403);
  assert.equal((await post(base + '/api/services', { title: 'x' }, { origin: 'http://evil.example' })).status, 403);
  assert.equal((await fetch(base + '/api/songs', { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
});

test('segurança: PIN fraco é recusado e o controle por link exige chave', async () => {
  assert.equal((await fetch(base + '/api/security/pin', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: '1234' }) })).status, 400);
  assert.equal((await fetch(base + '/api/security/pin', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: '4826' }) })).status, 200);
  assert.equal((await fetch(base + '/api/control/next')).status, 401);
  const { controlKey } = await j(await fetch(base + '/api/security'));
  assert.equal((await fetch(base + '/api/control/next?k=' + controlKey)).status, 200);
});

test('segurança: link do QR leva chave que só vale para aquele culto', async () => {
  const { url } = await j(await fetch(base + '/api/qr?path=' + encodeURIComponent('/pedidos.html?s=1')));
  assert.match(url, /pedidos\.html\?s=1&k=[\w-]{18}$/);
});

test('segurança: pela rede, sem PIN não controla; com PIN controla', { skip: !lanIp && 'sem IP de rede' }, async () => {
  const lan = `http://${lanIp}:${srv.server.address().port}`;
  assert.equal((await fetch(lan + '/api/songs')).status, 401);
  assert.equal((await fetch(lan + '/', { redirect: 'manual' })).status, 302);
  assert.equal((await post(lan + '/api/auth/login', { pin: '0000' })).status, 401);
  const r = await post(lan + '/api/auth/login', { pin: '4826' });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(lan + '/api/songs', { headers: { cookie } })).status, 200);
  // configurações sensíveis: só no computador da projeção
  assert.equal((await fetch(lan + '/api/security', { headers: { cookie } })).status, 403);
  // pedidos com a chave do QR: só adiciona louvor naquele culto
  const { url } = await j(await fetch(base + '/api/qr?path=' + encodeURIComponent('/pedidos.html?s=1')));
  const k = new URL(url).searchParams.get('k');
  assert.equal((await fetch(`${lan}/api/songs?s=1&k=${k}`)).status, 200);
  assert.equal((await fetch(`${lan}/api/songs?s=2&k=${k}`)).status, 401);
  assert.equal((await fetch(`${lan}/api/items/1?s=1&k=${k}`, { method: 'DELETE' })).status, 401);
});

test('Ctrl+Z: desfaz e refaz mudanças no culto (lote vira um passo só)', async () => {
  const h = { origin: base };
  const { id } = await j(await post(base + '/api/services', { title: 'Teste desfazer', date: '2026-01-01' }, h));
  for (const t of ['a', 'b', 'c']) await post(`${base}/api/services/${id}/items`, { kind: 'text', title: t }, h);
  const titles = async () => (await j(await fetch(base + '/api/services/' + id))).items.map((i) => i.title);
  assert.deepEqual(await titles(), ['a', 'b', 'c']);
  const u = await j(await post(base + '/api/undo', {}, h));
  assert.match(u.label, /3 itens/);
  assert.deepEqual(await titles(), []);
  await post(base + '/api/redo', {}, h);
  assert.deepEqual(await titles(), ['a', 'b', 'c']);
});

test('blocos prontos e tirar vários itens de uma vez', async () => {
  const h = { origin: base };
  const { id } = await j(await post(base + '/api/services', { title: 'Teste blocos', date: '2026-01-02' }, h));
  for (const t of ['x', 'y', 'z']) await post(`${base}/api/services/${id}/items`, { kind: 'text', title: t }, h);
  const items = (await j(await fetch(base + '/api/services/' + id))).items;
  await post(base + '/api/blocktpls', { service_id: id, ids: items.slice(0, 2).map((i) => i.id), name: 'Quarta' }, h);
  const tpls = await j(await fetch(base + '/api/blocktpls'));
  const t = tpls.find((x) => x.name === 'Quarta');
  assert.equal(t.count, 2);
  await post(`${base}/api/services/${id}/remove`, { ids: items.map((i) => i.id) }, h);
  assert.equal((await j(await fetch(base + '/api/services/' + id))).items.length, 0);
  await post(`${base}/api/services/${id}/blocktpl`, { i: t.i }, h);
  const after = (await j(await fetch(base + '/api/services/' + id))).items;
  assert.deepEqual(after.map((i) => i.kind), ['block', 'text', 'text']);
});
