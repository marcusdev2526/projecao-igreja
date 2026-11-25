// Modo aplicativo (opcional): abre o painel e, se houver 2º monitor/projetor, o telão em tela cheia nele.
// Uso: npm i -D electron && npm run app
import { app, BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { startServer } from '../server/index.js';

app.whenReady().then(async () => {
  const { port } = await startServer({ dataDir: path.join(app.getPath('userData'), 'data') });
  const base = `http://localhost:${port}`;
  const op = new BrowserWindow({ width: 1440, height: 900, title: 'Projeção Igreja', autoHideMenuBar: true, backgroundColor: '#0d1015' });
  op.loadURL(base);
  const primary = screen.getPrimaryDisplay();
  const ext = screen.getAllDisplays().find((d) => d.id !== primary.id);
  if (ext) {
    const tel = new BrowserWindow({ ...ext.bounds, fullscreen: true, frame: false, autoHideMenuBar: true, backgroundColor: '#000' });
    tel.loadURL(base + '/screen.html');
  }
});
app.on('window-all-closed', () => app.quit());
