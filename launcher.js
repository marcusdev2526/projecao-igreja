// Inicializador: abre o sistema e o reabre sozinho depois de uma atualização.
// Use "npm start" (ou iniciar.bat). Para fechar, Ctrl + C nesta janela.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RESTART_CODE = 42;

let child = null;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => (child ? child.kill(sig) : process.exit(0)));

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
    } else {
      process.exit(code ?? (signal ? 1 : 0));
    }
  });
}
run();
