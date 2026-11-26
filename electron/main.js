// Modo aplicativo (opcional): abre o painel e, se houver 2º monitor/projetor, o telão em tela cheia nele.
// Uso: npm i -D electron && npm run app
import { app, BrowserWindow, screen, shell } from 'electron';

// Segurança: janelas sem acesso ao Node, isoladas, e presas ao endereço do sistema
const openOut = (url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); };
const SAFE = { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true };
function lock(win, base) {
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(base)) { e.preventDefault(); openOut(url); } });
  win.webContents.setWindowOpenHandler(({ url }) => (url.startsWith(base) ? { action: 'allow' } : (openOut(url), { action: 'deny' })));
  win.webContents.session.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'fullscreen' || perm === 'clipboard-sanitized-write'));
}
import path from 'node:path';
import { startServer } from '../server/index.js';

app.whenReady().then(async () => {
  const { port } = await startServer({ dataDir: path.join(app.getPath('userData'), 'data') });
  const base = `http://localhost:${port}`;
  const op = new BrowserWindow({ width: 1440, height: 900, title: 'Projeção Igreja', autoHideMenuBar: true, backgroundColor: '#0d1015', webPreferences: SAFE });
  lock(op, base);
  op.loadURL(base);
  const primary = screen.getPrimaryDisplay();
  const ext = screen.getAllDisplays().find((d) => d.id !== primary.id);
  if (ext) {
    const tel = new BrowserWindow({ ...ext.bounds, fullscreen: true, frame: false, autoHideMenuBar: true, backgroundColor: '#000', webPreferences: SAFE });
    lock(tel, base);
    tel.loadURL(base + '/screen.html');
  }
});
app.on('window-all-closed', () => app.quit());
