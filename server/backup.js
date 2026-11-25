// Backup automático: banco (louvores, cultos, temas, configurações) + mídias + apresentações num .zip por dia
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

export function makeBackup({ db, dataDir, getDir, keep = 10 }) {
  let running = false;
  async function run() {
    const dir = String(getDir() || '').trim();
    if (!dir) throw new Error('Escolha a pasta do backup em Configurações');
    if (!fs.existsSync(dir)) throw new Error('A pasta do backup não existe: ' + dir);
    if (running) throw new Error('Um backup já está em andamento');
    running = true;
    const stamp = new Date().toLocaleDateString('sv-SE');
    const tmpDb = path.join(dataDir, `backup-${Date.now()}.db`);
    try {
      db.exec(`VACUUM INTO '${tmpDb.replace(/'/g, "''")}'`);
      const zip = new AdmZip();
      zip.addLocalFile(tmpDb, '', 'projecao.db');
      for (const sub of ['media', 'decks']) {
        const p = path.join(dataDir, sub);
        if (fs.existsSync(p)) zip.addLocalFolder(p, sub);
      }
      const file = path.join(dir, `projecao-backup-${stamp}.zip`);
      await new Promise((res, rej) => zip.writeZip(file, (err) => (err ? rej(err) : res())));
      // mantém só os mais recentes
      fs.readdirSync(dir)
        .filter((f) => /^projecao-backup-\d{4}-\d{2}-\d{2}\.zip$/.test(f))
        .sort()
        .reverse()
        .slice(keep)
        .forEach((f) => fs.rmSync(path.join(dir, f), { force: true }));
      return { file, size: fs.statSync(file).size, date: stamp };
    } finally {
      fs.rmSync(tmpDb, { force: true });
      running = false;
    }
  }
  return { run };
}
