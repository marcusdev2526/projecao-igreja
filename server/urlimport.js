// Importar letra a partir do link de uma página (sites de letras e cifras).
// Lê só a página que o usuário colou, para uso na biblioteca da própria igreja.
import { parse } from 'node-html-parser';

// Onde a letra costuma ficar em sites conhecidos (o primeiro que existir na página)
const SELECTORS = ['.lyric-original', '.cnt-letra', '.letra', '.lyrics', '[data-lyrics-container]', '.cifra_cnt pre', 'pre', '.song-lyrics', '#lyrics'];

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

// HTML → texto preservando quebras de linha e estrofes
function htmlToText(html) {
  return decode(
    html
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h\d|li|pre)>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// <pre> (sites de cifra): cada linha já termina com \n; só tira as tags
const preToText = (html) => decode(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));

const ORD = { primeira: 1, segunda: 2, terceira: 3, quarta: 4, quinta: 5, sexta: 6 };
// Limpa o texto vindo de sites: caracteres invisíveis, rótulos de cifra, tablaturas, "luga____ar"
export function normalizeImported(text) {
  return String(text)
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    // "[Intro] Am7 G F" → rótulo numa linha e acordes na outra
    .flatMap((l) => {
      const m = l.match(/^\s*(\[[^\]]+\])\s+(\S.*)$/);
      return m ? [m[1], m[2]] : [l];
    })
    .map((l) => l.replace(/^\s*\[(primeira|segunda|terceira|quarta|quinta|sexta)\s+parte\]\s*$/i, (_, o) => `[Verso ${ORD[o.toLowerCase()]}]`))
    // tablatura (E|---3---) não vai para o telão
    .filter((l) => !/^\s*[EADGBe]\s*\|[-\d|hpbr\/\\~x\s]*$/.test(l))
    // "luga____ar" → "lugar", "De__eus" → "Deus"; outros "_" saem (são a marcação de itálico do sistema)
    .map((l) => l.replace(/(\p{L})_+\1/gu, '$1').replace(/_+/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Sem seletor conhecido: pega o maior trecho de linhas curtas (cara de letra)
function guessLyrics(text) {
  const lines = text.split('\n');
  let best = [];
  let cur = [];
  let blanks = 0;
  const flush = () => {
    const real = cur.filter(Boolean);
    if (real.length > best.filter(Boolean).length) best = cur;
    cur = [];
  };
  for (const l of lines) {
    if (!l) { blanks++; if (blanks <= 1) cur.push(''); else flush(); continue; }
    blanks = 0;
    if (l.length > 80 || /cookies|copyright|©|compartilhe|inscreva|login|menu/i.test(l)) { flush(); continue; }
    cur.push(l);
  }
  flush();
  return best.join('\n').trim();
}

export function extractFromHtml(html, url = '') {
  const root = parse(html, { comment: false, blockTextElements: { script: false, style: false, pre: true } });
  const meta = (p) => root.querySelector(`meta[property="${p}"]`)?.getAttribute('content') || root.querySelector(`meta[name="${p}"]`)?.getAttribute('content') || '';
  let title = decode(meta('og:title') || root.querySelector('title')?.text || '').trim();
  let artist = '';
  // "Nome da música - Artista - LETRAS.MUS.BR" / "Nome - Artista (Cifra)"
  title = title.replace(/\s*[-|–]\s*(LETRAS\.MUS\.BR|Cifra Club|Letras|Lyrics).*$/i, '').replace(/\s*\((letra|cifra|lyrics)[^)]*\)\s*/i, ' ').trim();
  const parts = title.split(/\s+[-–|]\s+/);
  if (parts.length >= 2) { title = parts[0].trim(); artist = parts[1].trim(); }
  const h1 = root.querySelector('h1')?.text?.trim();
  if (!title && h1) title = h1;

  let lyrics = '';
  for (const sel of SELECTORS) {
    const els = root.querySelectorAll(sel);
    if (!els.length) continue;
    const isPre = sel === 'pre' || sel.endsWith(' pre') || els[0].tagName === 'PRE';
    const txt = els.map((e) => (isPre ? preToText(e.innerHTML) : htmlToText(e.innerHTML))).join('\n\n').trim();
    if (txt.split('\n').filter(Boolean).length >= 3) { lyrics = txt; break; }
  }
  if (!lyrics) lyrics = guessLyrics(htmlToText(root.querySelector('body')?.innerHTML || html));
  lyrics = normalizeImported(lyrics);
  if (!lyrics) throw new Error('Não encontrei a letra nesta página. Copie a letra e cole no campo de texto.');
  const head = [title || 'Sem título'];
  if (artist) head.push('Artista: ' + artist);
  if (url) head.push('Notas: importado de ' + url);
  return head.join('\n') + '\n\n' + lyrics + '\n';
}

export async function fetchLyrics(url, { fetchImpl = fetch } = {}) {
  let u;
  try { u = new URL(url); } catch { throw new Error('Link inválido'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Use um link http(s)');
  // não acessa endereços da rede interna
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/i.test(u.hostname)) throw new Error('Link não permitido');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const r = await fetchImpl(u.href, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36', accept: 'text/html,application/xhtml+xml', 'accept-language': 'pt-BR,pt;q=0.9' } });
    if (!r.ok) throw new Error(`A página respondeu com erro ${r.status}`);
    const html = await r.text();
    if (html.length > 5_000_000) throw new Error('Página grande demais');
    return extractFromHtml(html, u.href);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('A página demorou demais para abrir');
    if (/fetch failed|ENOTFOUND/i.test(e.message)) throw new Error('Não consegui abrir o link (sem internet ou site fora do ar)');
    throw e;
  } finally {
    clearTimeout(t);
  }
}
