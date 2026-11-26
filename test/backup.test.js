import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { DatabaseSync } from 'node:sqlite';
import { makeBackup, SECRET_KEYS } from '../server/backup.js';

test('backup não leva senhas, PIN nem tokens', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bkout-'));
  const db = new DatabaseSync(path.join(dataDir, 'x.db'));
  db.exec('CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT)');
  const ins = db.prepare('INSERT INTO setting VALUES (?, ?)');
  for (const k of SECRET_KEYS) ins.run(k, 'SEGREDO');
  ins.run('church_name', 'ADPC');
  const { file } = await makeBackup({ db, dataDir, getDir: () => out }).run();
  const zip = new AdmZip(file);
  const tmp = path.join(out, 'check.db');
  fs.writeFileSync(tmp, zip.getEntry('projecao.db').getData());
  const rows = new DatabaseSync(tmp).prepare('SELECT key, value FROM setting').all();
  assert.deepEqual(rows.map((r) => r.key), ['church_name']);
  assert.ok(!zip.getEntry('projecao.db').getData().includes(Buffer.from('SEGREDO')));
});
