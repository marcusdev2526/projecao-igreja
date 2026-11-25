// Apresentações (pregação, avisos em carrossel): cada uma é uma pasta com as imagens dos slides
//   data/decks/<id>/deck.json  { title, author, slides: ['001.png', ...], auto (segundos, 0 = manual), loop, created }
// PowerPoint (.pptx/.ppt) vira imagens pelo próprio PowerPoint do Windows. PDF vira imagens no navegador (pdf.js).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';

const IMG = /\.(png|jpe?g|webp|gif)$/i;
const num = (f) => +(f.match(/(\d+)(?!.*\d)/)?.[1] || 0);

export function makeDecks(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const metaFile = (id) => path.join(dir, id, 'deck.json');
  const safeId = (id) => String(id).replace(/[^a-z0-9]/gi, '');

  function get(id) {
    id = safeId(id);
    try {
      const m = JSON.parse(fs.readFileSync(metaFile(id), 'utf8'));
      return { id, ...m, count: m.slides.length, urls: m.slides.map((f) => `/decks/${id}/${encodeURIComponent(f)}`) };
    } catch {
      return null;
    }
  }
  function list() {
    return fs.readdirSync(dir)
      .map(get)
      .filter(Boolean)
      .sort((a, b) => String(b.created).localeCompare(String(a.created)))
      .map(({ urls, ...d }) => ({ ...d, thumb: urls[0] || '' }));
  }
  // images: caminhos de arquivos de imagem, na ordem dos slides (são movidos/copiados para a pasta)
  function create({ title, author = '', images, auto = 0, loop = false, move = true }) {
    if (!images?.length) throw new Error('Nenhum slide encontrado no arquivo');
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const d = path.join(dir, id);
    fs.mkdirSync(d);
    const slides = images.map((src, i) => {
      const ext = (path.extname(src) || '.png').toLowerCase().replace('.jpeg', '.jpg');
      const name = String(i + 1).padStart(3, '0') + ext;
      if (move) {
        try { fs.renameSync(src, path.join(d, name)); } catch { fs.copyFileSync(src, path.join(d, name)); fs.rmSync(src, { force: true }); }
      } else fs.copyFileSync(src, path.join(d, name));
      return name;
    });
    const meta = { title: String(title || 'Apresentação').slice(0, 120), author: String(author || '').slice(0, 80), slides, auto: Math.max(0, +auto || 0), loop: !!loop, created: new Date().toISOString() };
    fs.writeFileSync(metaFile(id), JSON.stringify(meta, null, 1));
    return get(id);
  }
  function update(id, patch = {}) {
    const m = get(id);
    if (!m) throw new Error('Apresentação não encontrada');
    const { id: _i, count, urls, ...meta } = m;
    if (patch.title != null) meta.title = String(patch.title).slice(0, 120);
    if (patch.author != null) meta.author = String(patch.author).slice(0, 80);
    if (patch.auto != null) meta.auto = Math.max(0, +patch.auto || 0);
    if (patch.loop != null) meta.loop = !!patch.loop;
    fs.writeFileSync(metaFile(m.id), JSON.stringify(meta, null, 1));
    return get(m.id);
  }
  function remove(id) {
    id = safeId(id);
    if (id) fs.rmSync(path.join(dir, id), { recursive: true, force: true });
  }
  return { dir, get, list, create, update, remove };
}

// Lista as imagens de uma pasta (recursivo), na ordem dos números do nome (Slide1, Slide2, … Slide10)
export function imagesIn(folder) {
  const out = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (IMG.test(e.name)) out.push(p);
  });
  walk(folder);
  return out.sort((a, b) => num(path.basename(a)) - num(path.basename(b)));
}

const psQuote = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// Converte .pptx/.ppt em imagens PNG usando o PowerPoint instalado (Windows).
// Não fecha o PowerPoint se ele já estava aberto com outras apresentações.
export function convertWithPowerPoint(file, outDir, { timeout = 240000 } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const script = `
$ErrorActionPreference = 'Stop'
$in = ${psQuote(path.resolve(file))}
$out = ${psQuote(path.resolve(outDir))}
$app = New-Object -ComObject PowerPoint.Application
$had = $app.Presentations.Count
$p = $app.Presentations.Open($in, -1, 0, 0)
try {
  $w = 1920
  $h = [int](1920 * $p.PageSetup.SlideHeight / $p.PageSetup.SlideWidth)
  $p.Export($out, 'PNG', $w, $h)
} catch {
  $p.SaveAs((Join-Path $out 'slides'), 18)
}
$p.Close()
if ($had -eq 0) { $app.Quit() }
[void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app)
Write-Output 'OK'
`;
  const enc = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { timeout, windowsHide: true }, (err, stdout, stderr) => {
      const imgs = fs.existsSync(outDir) ? imagesIn(outDir) : [];
      if (imgs.length) return resolve(imgs);
      reject(new Error('O PowerPoint não conseguiu converter o arquivo' + (stderr ? ': ' + String(stderr).split('\n')[0].slice(0, 160) : '')));
    });
  });
}

export async function convertPresentation(file, outDir) {
  if (os.platform() !== 'win32') {
    throw new Error('Para abrir PowerPoint direto, o sistema precisa rodar no Windows com o PowerPoint instalado. Ou salve a apresentação como PDF.');
  }
  return convertWithPowerPoint(file, outDir);
}
