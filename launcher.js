// Inicializador: abre o sistema e o reabre sozinho depois de uma atualização.
// Use "npm start" (ou iniciar.bat). Para fechar, Ctrl + C nesta janela.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RESTART_CODE = 42;

let child = null;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => (child ? child.kill(sig) : process.exit(0)));

const crashTimes = [];
const crashes = () => { const now = Date.now(); crashTimes.push(now); while (crashTimes.length && now - crashTimes[0] > 60000) crashTimes.shift(); return crashTimes.length - 1; };

function run() {
  child = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PROJECAO_LAUNCHER: '1' },
  });
  child.on('exit', (code, signal) => {
    if (code === RESTART_CODE) {
      console.log('\n  Atualização instalada. Reabrindo o sistema...\n');
      setTimeout(run, 800);
    } else if (code !== 0 && code !== 1 && signal !== 'SIGINT' && signal !== 'SIGTERM' && crashes() < 5) {
      // caiu sem querer: reabre sozinho e o telão volta para onde estava
      console.log('\n  O sistema fechou com erro. Reabrindo em 2 segundos...\n');
      setTimeout(run, 2000);
    } else {
      process.exit(code ?? (signal ? 1 : 0));
    }
  });
}
run();
