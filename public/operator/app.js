// Painel do operador
import { parseSong, buildSlides, slideMaxLines } from '/shared/parser.js';
import { createStage, slideHTML, stripMarkup } from '/shared/render.js';
import { THEMES, THEME_CATS, themeById, FONTS, newCustomTheme } from '/shared/themes.js';
import { BOOKS, parseRef, refText, bookName } from '/shared/bible.js';
import { initBibleView } from '/operator/bible.js';
import { renderProgress } from '/shared/progress.js';
import { autoKeywords, chunksOf, markChunk, wordFreq, applyChunks, missingTranslations, insertTranslations, setEnStatus } from '/shared/enhance.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = async (url, opts = {}) => {
  const r = await fetch(url, {
    ...opts,
    headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Erro');
  return data;
};
let toastT;
const toast = (msg) => {
  $('toast').textContent = msg;
  $('toast').classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => $('toast').classList.remove('on'), 2600);
};

const socket = io();
const cmd = (c) => socket.emit('cmd', c);
let live = null; // estado do servidor
let service = null; // culto aberto
let selected = null; // {item, slides}
const songCache = new Map();
let customThemes = [];
const themeLabel = (id) => customThemes.find((t) => t.id === id)?.name || themeById(id).name;
const themeDefOf = (id) => customThemes.find((t) => t.id === id) || null;
async function loadThemes() {
  customThemes = await api('/api/themes');
  $('edTheme').innerHTML = '<option value="">Tema do culto (padrão)</option>' +
    [...THEMES, ...customThemes].map((t) => `<option value="${esc(t.id)}">Tema: ${esc(t.name)}</option>`).join('');
  if (live) $('themeName').textContent = themeLabel(live.themeId);
  renderQuickThemes();
}
socket.on('themes', loadThemes);

// ---------------- Estado ao vivo ----------------
socket.on('state', (s) => {
  const prevItem = live?.itemId;
  const prevMode = live?.mode;
  live = s;
  if (prevMode !== s.mode && service) renderItems();
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === s.mode));
  $('themeName').textContent = themeLabel(s.themeId);
  markQuickTheme();
  if ($('bibleMain').options.length) { $('bibleMain').value = s.bibleMain; $('bibleSecond').value = s.bibleSecond || ''; }
  $('blackBtn').classList.toggle('on', s.black);
  $('clearBtn').classList.toggle('on', s.clear);
  $('liveTitle').textContent = s.title || '—';
  const prog = { slides: s.slides, index: s.index, onPick: (i) => cmd({ type: 'goto', index: i }) };
  renderProgress($('liveProg'), prog);
  renderProgress($('bvProg'), prog);
  $('livePos').textContent = s.total ? `Slide ${s.index + 1} de ${s.total}${s.slide ? ' · ' + s.slide.name : ''}` : '';
  $('liveNext').textContent = s.next ? '' : s.total ? 'Fim — próximo item do culto' : '';
  renderNextPreview(s);
  document.querySelectorAll('.item').forEach((el) => el.classList.toggle('live', +el.dataset.id === s.itemId));
  // seleção acompanha o que está no ar (ex.: avançou pelo celular para o próximo louvor)
  if (s.itemId && s.itemId !== prevItem && service?.items.some((i) => i.id === s.itemId)) selectItem(s.itemId, { keepScroll: false });
  else if (selected?.item && s.mode !== selected.mode && selected.item.kind === 'song') selectItem(selected.item.id);
  else markLiveSlide();
});

// ---------------- Biblioteca ----------------
const enBadge = (v) => (v === 2 ? '<span class="badge auto" title="Inglês traduzido automaticamente — revise no editor">EN auto</span>' : v ? '<span class="badge">EN</span>' : '');
async function loadSongs() {
  const list = await api('/api/songs?q=' + encodeURIComponent($('search').value));
  $('songCount').textContent = `${list.length} louvor${list.length === 1 ? '' : 'es'}`;
  $('songList').innerHTML = list.length
    ? list.map((s) => `<div class="song" data-id="${s.id}" title="Duplo clique: projetar agora">
        <div class="info"><div class="t">${esc(s.title)}</div><div class="a">${esc(s.artist || '—')}${s.song_key ? ' · ' + esc(s.song_key) : ''}</div></div>
        ${enBadge(s.has_en)}
        <button class="mini" data-act="edit" title="Editar">✎</button>
        <button class="mini" data-act="add" title="Adicionar ao culto">＋</button></div>`).join('')
    : '<div class="empty">Nenhum louvor encontrado</div>';
}
let searchT;
$('search').oninput = () => { clearTimeout(searchT); searchT = setTimeout(loadSongs, 150); };
$('songList').onclick = async (e) => {
  const row = e.target.closest('.song');
  if (!row) return;
  const id = +row.dataset.id;
  const act = e.target.dataset.act;
  if (act === 'edit') return openEditor(id);
  if (act === 'add') return addSongToService(id);
};
$('songList').ondblclick = (e) => {
  const row = e.target.closest('.song');
  if (row && !e.target.dataset.act) cmd({ type: 'song', id: +row.dataset.id });
};

// ---------------- Culto ----------------
async function loadServices(selectId) {
  const list = await api('/api/services');
  if (!list.length) {
    const { id } = await api('/api/services', { method: 'POST', body: { title: 'Culto', date: new Date().toLocaleDateString('sv-SE') } });
    return loadServices(id);
  }
  const id = selectId || service?.id || list[0].id;
  $('serviceSel').innerHTML = list.map((s) => `<option value="${s.id}" ${s.id === id ? 'selected' : ''}>${esc(s.title)} · ${s.date.split('-').reverse().join('/')}</option>`).join('');
  await openService(id);
}
async function openService(id) {
  service = await api('/api/services/' + id);
  cmd({ type: 'service', id: service.id });
  renderItems();
}
$('serviceSel').onchange = () => openService(+$('serviceSel').value);
$('newServiceBtn').onclick = async () => {
  const title = prompt('Nome do culto:', 'Culto de domingo');
  if (!title) return;
  const date = prompt('Data (AAAA-MM-DD):', new Date().toLocaleDateString('sv-SE'));
  const { id } = await api('/api/services', { method: 'POST', body: { title, date } });
  loadServices(id);
};

let nextStage = null;
function renderNextPreview(s) {
  const host = $('nextPv');
  host.hidden = !s.next;
  if (!s.next) return;
  if (!nextStage) { nextStage = createStage(host); nextStage.el.classList.add('static'); }
  nextStage.setTheme(s.themeId, themeDefOf(s.themeId));
  nextStage.el.querySelectorAll('video').forEach((v) => v.pause());
  nextStage.resize();
  nextStage.show(slideHTML(s.next, s.mode), { animate: false });
}
window.addEventListener('resize', () => nextStage?.resize());
const wantsEn = () => !!live && live.mode !== 'pt';
let enPending = new Set();
socket.on('en-queue', (ids) => { enPending = new Set(ids); if (service) renderItems(); });
let chT;
socket.on('songs-changed', async ({ id }) => {
  songCache.delete(id);
  if (!service?.items.some((it) => it.song_id === id)) return;
  service = await api('/api/services/' + service.id);
  renderItems();
  if (selected?.item?.song_id === id) selectItem(selected.item.id, { fresh: true });
  clearTimeout(chT); chT = setTimeout(loadSongs, 800);
});
socket.on('en-error', ({ message }) => toast('Tradução automática: ' + message));
function renderItems() {
  $('itemList').innerHTML = service.items.length
    ? service.items.map((it, i) => `<div class="item ${selected?.item?.id === it.id ? 'sel' : ''} ${live?.itemId === it.id ? 'live' : ''}" draggable="true" data-id="${it.id}">
        <div class="n">${i + 1}</div>
        <div class="info"><div class="t">${esc(it.kind === 'song' ? it.song_title : it.title || 'Aviso')}</div>
        <div class="a">${it.kind === 'song' ? esc(it.song_artist || '') + (it.has_en ? ' · ' + enBadge(it.has_en) : enPending.has(it.song_id) ? ' · <span class="badge auto pulse">traduzindo…</span>' : wantsEn() ? ' · <span class="badge no-en" data-song="' + it.song_id + '" title="' + (aiState.hasKey ? 'Não deu para traduzir — clique para abrir' : 'Cadastre a chave da IA em Configurações para traduzir sozinho') + '">sem inglês</span>' : '') : it.kind === 'bible' ? 'Bíblia' : 'Aviso / texto'}</div></div>
        <button class="x" title="Remover do culto">×</button></div>`).join('')
    : '<div class="empty">Adicione louvores pelo botão ＋ da lista ao lado</div>';

}
async function addSongToService(songId) {
  await api(`/api/services/${service.id}/items`, { method: 'POST', body: { kind: 'song', song_id: songId } });
  await openService(service.id);
  toast('Adicionado ao culto');
}
$('itemList').onclick = async (e) => {
  const row = e.target.closest('.item');
  if (!row) return;
  const id = +row.dataset.id;
  if (e.target.dataset.song) return openEditor(+e.target.dataset.song);
  if (e.target.classList.contains('x')) {
    await api('/api/items/' + id, { method: 'DELETE' });
    if (selected?.item?.id === id) { selected = null; renderSlides(); }
    return openService(service.id);
  }
  selectItem(id);
};
$('itemList').ondblclick = (e) => {
  const row = e.target.closest('.item');
  if (row && !e.target.classList.contains('x')) cmd({ type: 'item', id: +row.dataset.id, index: 0 });
};
// arrastar para reordenar
let dragId = null;
$('itemList').addEventListener('dragstart', (e) => { const r = e.target.closest('.item'); if (r) { dragId = +r.dataset.id; r.classList.add('dragging'); } });
$('itemList').addEventListener('dragend', () => document.querySelectorAll('.item').forEach((x) => x.classList.remove('dragging', 'over')));
$('itemList').addEventListener('dragover', (e) => {
  e.preventDefault();
  document.querySelectorAll('.item').forEach((x) => x.classList.remove('over'));
  e.target.closest('.item')?.classList.add('over');
});
$('itemList').addEventListener('drop', async (e) => {
  e.preventDefault();
  const target = e.target.closest('.item');
  const ids = service.items.map((i) => i.id).filter((i) => i !== dragId);
  const at = target ? ids.indexOf(+target.dataset.id) : ids.length;
  ids.splice(at < 0 ? ids.length : at, 0, dragId);
  await api(`/api/services/${service.id}/reorder`, { method: 'POST', body: { ids } });
  openService(service.id);
});

// Aviso
let editingTextId = null;
$('addTextBtn').onclick = () => { editingTextId = null; $('txTitle').value = 'Avisos'; $('txText').value = ''; $('textItem').showModal(); };
$('txCancel').onclick = () => $('textItem').close();
$('txSave').onclick = async () => {
  const body = { kind: 'text', title: $('txTitle').value || 'Aviso', text: $('txText').value };
  if (editingTextId) await api('/api/items/' + editingTextId, { method: 'PUT', body });
  else await api(`/api/services/${service.id}/items`, { method: 'POST', body });
  $('textItem').close();
  await openService(service.id);
  if (editingTextId) selectItem(editingTextId);
};

// ---------------- Slides do item selecionado ----------------
async function getSong(id, fresh = false) {
  if (fresh || !songCache.has(id)) songCache.set(id, await api('/api/songs/' + id));
  return songCache.get(id);
}
function textSlides(item) {
  return String(item.text || '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean)
    .map((text, index) => ({ index, kind: 'text', name: item.title || 'Aviso', text, lines: text.split('\n').map((pt) => ({ pt, en: '' })) }));
}
async function selectItem(id, { fresh = false } = {}) {
  const item = service?.items.find((i) => i.id === id);
  if (!item) return;
  const mode = live?.mode || 'pt';
  let slides;
  if (item.kind === 'bible') {
    const r = JSON.parse(item.text || '{}');
    return showBibleChapter(r.book, r.chapter, r.verse, item);
  }
  if (item.kind === 'song') {
    const song = await getSong(item.song_id, fresh);
    slides = buildSlides(parseSong(song.source), { maxLines: slideMaxLines(mode) });
  } else slides = textSlides(item);
  selected = { item, slides, mode };
  document.querySelectorAll('.item').forEach((el) => el.classList.toggle('sel', +el.dataset.id === id));
  renderSlides();
}
function renderSlides() {
  $('editSelBtn').hidden = !selected || !!selected.bible;
  $('addBibleBtn').hidden = !selected?.bible || !!selected.item;
  if (!selected) {
    $('selTitle').textContent = 'Selecione um item do culto';
    $('slideGrid').innerHTML = '';
    return;
  }
  if (selected.bible) return renderBibleSlides();
  const it = selected.item;
  $('selTitle').textContent = it.kind === 'song' ? it.song_title : it.title || 'Aviso';
  $('slideGrid').innerHTML = selected.slides.length
    ? selected.slides.map((s) => `<div class="slide" data-i="${s.index}">
        <div class="tag"><span>${esc(s.name)}${s.parts > 1 ? ` · ${s.part}/${s.parts}` : ''}</span><span class="num">${s.index + 1}</span></div>
        ${s.lines.map((l) => `<div class="pt">${esc(stripMarkup(l.pt))}</div>${l.en ? `<div class="en">${esc(l.en)}</div>` : ''}`).join('')}</div>`).join('')
    : '<div class="empty">Sem slides — edite a letra</div>';
  markLiveSlide(true);
}
function markLiveSlide(scroll) {
  const isLive = selected && live && (selected.bible
    ? live.kind === 'bible' && live.bible?.book === selected.bible.book && live.bible?.chapter === selected.bible.chapter
    : live.itemId === selected.item.id);
  document.querySelectorAll('.slide').forEach((el) => el.classList.toggle('live', isLive && +el.dataset.i === live.index));
  const el = document.querySelector('.slide.live');
  if (el && scroll !== false) el.scrollIntoView({ block: 'nearest' });
}
$('slideGrid').onclick = (e) => {
  const el = e.target.closest('.slide');
  if (!el || !selected) return;
  const index = +el.dataset.i;
  if (selected.bible) {
    const b = selected.bible;
    const sameChapter = live?.kind === 'bible' && live.bible?.book === b.book && live.bible?.chapter === b.chapter;
    if (sameChapter) cmd({ type: 'goto', index });
    else if (selected.item) cmd({ type: 'item', id: selected.item.id, index });
    else cmd({ type: 'bible', book: b.book, chapter: b.chapter, verse: +el.dataset.v });
    return;
  }
  if (live?.itemId === selected.item.id) cmd({ type: 'goto', index });
  else cmd({ type: 'item', id: selected.item.id, index });
};
$('editSelBtn').onclick = () => {
  if (!selected) return;
  if (selected.item.kind === 'song') openEditor(selected.item.song_id);
  else { editingTextId = selected.item.id; $('txTitle').value = selected.item.title; $('txText').value = selected.item.text; $('textItem').showModal(); }
};

// ---------------- Barra superior ----------------
$('modes').onclick = (e) => e.target.dataset.mode && cmd({ type: 'mode', value: e.target.dataset.mode });
$('blackBtn').onclick = () => cmd({ type: 'black' });
$('clearBtn').onclick = () => cmd({ type: 'clear' });
$('openScreen').onclick = () => window.open('/screen.html', 'telao', 'popup,width=1280,height=720');
$('openStage').onclick = () => window.open('/stage.html', 'retorno', 'popup,width=1280,height=720');
$('msgSend').onclick = () => { cmd({ type: 'message', value: $('msgIn').value }); toast($('msgIn').value ? 'Recado enviado ao retorno' : 'Recado removido'); };
$('msgIn').onkeydown = (e) => e.key === 'Enter' && $('msgSend').click();

$('phoneBtn').onclick = async () => {
  const info = await api('/api/info');
  $('qr').src = info.qr;
  $('phUrls').innerHTML = (info.urls.length ? info.urls : ['http://localhost:' + location.port]).map((u) => `<a href="${u}/remote.html" target="_blank">${u}/remote.html</a>`).join('');
  $('phone').showModal();
};
$('phClose').onclick = () => $('phone').close();

// Temas
function renderThemeGallery() {
  $('themeGrid').innerHTML = '';
  const sample = { lines: [{ pt: '_tudo é_ *graça*', en: 'It is all grace' }] };
  const all = [...customThemes.map((t) => ({ ...t, desc: 'Tema da igreja', cat: 'igreja' })), ...THEMES];
  const cats = { igreja: 'Temas da igreja', ...THEME_CATS };
  const order = Object.keys(cats);
  all.sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat));
  let lastCat = null;
  for (const th of all) {
    if (th.cat !== lastCat) {
      lastCat = th.cat;
      const h = document.createElement('h3');
      h.className = 'theme-cat';
      h.textContent = cats[th.cat] || 'Outros';
      $('themeGrid').appendChild(h);
    }
    const card = document.createElement('div');
    card.className = 'theme-card' + (live?.themeId === th.id ? ' on' : '');
    card.innerHTML = `<div class="host"></div><div class="nm">${esc(th.name)}</div><div class="ds">${esc(th.desc)}</div>
      ${th.custom ? '<button class="btn sm edit">Editar</button>' : '<button class="btn sm edit" data-copy>Copiar e editar</button>'}`;
    $('themeGrid').appendChild(card);
    const st = createStage(card.querySelector('.host'));
    st.setTheme(th.id, th.custom ? th : null);
    // miniaturas sem animação (mais leve)
    st.el.classList.add('static');
    st.el.querySelectorAll('video').forEach((v) => v.pause());
    st.show(slideHTML(sample, 'pt'), { animate: false });
    card.onclick = (e) => {
      if (e.target.closest('.edit')) {
        e.stopPropagation();
        const base = th.custom ? th : { ...newCustomTheme(), name: th.name + ' (cópia)', bg: { ...newCustomTheme().bg, type: th.id === 'simples' ? 'color' : 'anim', anim: th.id, color: '#000000' } };
        return openThemeEditor(base);
      }
      cmd({ type: 'theme', value: th.id });
      $('themes').close();
      toast('Tema: ' + th.name);
    };
  }
}
function renderQuickThemes() {
  const box = $('quickThemes');
  if (!box) return;
  const sample = { lines: [{ pt: '*graça*', en: '' }] };
  const all = [...customThemes.map((t) => ({ ...t, cat: 'igreja' })), ...THEMES];
  box.innerHTML = '';
  for (const th of all) {
    const el = document.createElement('div');
    el.className = 'qt' + (live?.themeId === th.id ? ' on' : '');
    el.dataset.id = th.id;
    el.title = th.desc || th.name;
    el.innerHTML = `<div class="host"></div><div class="nm">${esc(th.name)}</div>`;
    box.appendChild(el);
    const st = createStage(el.querySelector('.host'));
    st.setTheme(th.id, th.custom ? th : null);
    st.el.classList.add('static');
    st.el.querySelectorAll('video').forEach((v) => v.pause());
    st.show(slideHTML(sample, 'pt'), { animate: false });
    el.onclick = () => cmd({ type: 'theme', value: th.id });
  }
}
const markQuickTheme = () => document.querySelectorAll('#quickThemes .qt').forEach((q) => q.classList.toggle('on', q.dataset.id === live?.themeId));
$('allThemesBtn').onclick = (e) => { e.preventDefault(); $('themeBtn').click(); };
$('themeBtn').onclick = async () => { await loadThemes(); renderThemeGallery(); $('themes').showModal(); };
$('newThemeBtn').onclick = () => openThemeEditor(newCustomTheme());
$('thClose').onclick = () => $('themes').close();

// Atalhos de teclado (fora de campos de texto)
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, dialog[open]') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); cmd({ type: 'next' }); }
  else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); cmd({ type: 'prev' }); }
  else if (e.key === 'b' || e.key === 'B' || e.key === '.') cmd({ type: 'black' });
  else if (e.key === 'c' || e.key === 'C') cmd({ type: 'clear' });
});

// ---------------- Editor de louvor ----------------
let edId = null;
let edMode = 'pt-en';
const NEW_TEMPLATE = `Título do louvor
Artista:
Tom:

[Verso 1]
Primeira linha
| First line (tradução, opcional)
Segunda linha

[Refrão]
_tudo é_ *GRAÇA*
~o que me basta~
`;

async function openEditor(id) {
  edId = id || null;
  if (id) {
    const s = await getSong(id, true);
    $('edSource').value = s.source;
    $('edTheme').value = s.theme_id || '';
    $('edTitle').textContent = 'Editar: ' + s.title;
  } else {
    $('edSource').value = NEW_TEMPLATE;
    $('edTheme').value = '';
    $('edTitle').textContent = 'Novo louvor';
  }
  $('edDelete').hidden = !id;
  $('editor').showModal();
  renderEditorPreview();
  $('edSource').focus();
}
let edT;
$('edSource').oninput = () => { clearTimeout(edT); edT = setTimeout(renderEditorPreview, 250); };
$('edTheme').onchange = renderEditorPreview;
$('edModes').onclick = (e) => { if (e.target.dataset.mode) { edMode = e.target.dataset.mode; renderEditorPreview(); } };
function renderEditorPreview() {
  document.querySelectorAll('#edModes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === edMode));
  const p = parseSong($('edSource').value);
  const slides = buildSlides(p, { maxLines: slideMaxLines(edMode) });
  const order = p.arrangement.join(' → ');
  $('edMeta').innerHTML = `<b>${esc(p.title || 'Sem título')}</b>${p.artist ? ' · ' + esc(p.artist) : ''}${p.key ? ' · Tom ' + esc(p.key) : ''}<br>
    ${p.sections.length} partes · ${slides.length} slides · ${p.hasEn ? (p.enStatus === 'auto' ? '<span class="ed-en">inglês automático (ao salvar, fica como revisado)</span>' : p.enStatus === 'oficial' ? 'inglês oficial' : 'com tradução EN') : 'sem tradução'}<br>Ordem: ${esc(order || '—')}`;
  const themeId = $('edTheme').value || live?.themeId || 'brasa';
  const box = $('edPreviews');
  box.innerHTML = '';
  box.classList.add('static');
  slides.slice(0, 40).forEach((s) => {
    const pv = document.createElement('div');
    pv.className = 'pv';
    pv.innerHTML = `<div class="host"></div><div class="cap">${s.index + 1}. ${esc(s.name)}</div>`;
    box.appendChild(pv);
    const st = createStage(pv.querySelector('.host'));
    st.setTheme(themeId, themeDefOf(themeId));
    st.show(slideHTML(s, edMode), { animate: false });
  });
}
// Sugestões automáticas (palavra-chave e tradução) com desfazer
let edUndo = [];
const edTitleNow = () => parseSong($('edSource').value).title;
function edSet(text, msg) {
  edUndo.push($('edSource').value);
  $('edUndo').disabled = false;
  $('edSource').value = text;
  renderEditorPreview();
  if (msg) toast(msg);
}
$('edUndo').onclick = () => {
  if (!edUndo.length) return;
  $('edSource').value = edUndo.pop();
  $('edUndo').disabled = !edUndo.length;
  renderEditorPreview();
};
let aiState = { hasKey: false };
const loadAi = async () => (aiState = await api('/api/settings/ai'));
$('edKw').onclick = async () => {
  const src = $('edSource').value;
  const title = edTitleNow();
  const { chunks } = chunksOf(src, 2);
  const todo = chunks.map((ch) => ch.map((l) => l.text));
  const pending = todo.filter((ch) => !ch.some((t) => /[*_^~]/.test(t))).length;
  if (!pending) return toast('Todos os slides já têm destaque. Use Desfazer ou edite à mão.');
  const freq = wordFreq(src);
  let marked = todo.map((ch) => markChunk(ch, { title, freq }));
  if (aiState.hasKey) {
    $('edKw').disabled = true;
    toast('Pedindo sugestões para a IA…');
    try {
      const ai = (await api('/api/ai/keywords', { method: 'POST', body: { chunks: todo, title } })).chunks;
      marked = marked.map((m, k) => (todo[k].some((t) => /[*_^~]/.test(t)) ? todo[k] : ai[k] || m));
    } catch (e) {
      toast(e.message + ' — usei a sugestão automática');
    } finally {
      $('edKw').disabled = false;
    }
  }
  edSet(applyChunks(src, 2, marked), `Destaque sugerido em ${pending} slide(s). Confira na prévia; ↶ desfaz.`);
};
$('edTr').onclick = async () => {
  const src = $('edSource').value;
  const miss = missingTranslations(src);
  if (!miss.length) return toast('Todas as linhas já têm tradução');
  if (!aiState.hasKey) { toast('Para traduzir, cadastre a chave da IA em Configurações (ícone de engrenagem no topo)'); return openSettings(); }
  $('edTr').disabled = true;
  toast(`Traduzindo ${miss.length} linha(s)…`);
  try {
    const { lines } = await api('/api/ai/translate', { method: 'POST', body: { lines: miss.map((m) => m.text), title: edTitleNow() } });
    edSet(setEnStatus(insertTranslations(src, new Map(miss.map((m, k) => [m.i, lines[k]]))), 'automático'), 'Tradução sugerida inserida. Revise antes de salvar; ↶ desfaz.');
  } catch (e) {
    toast(e.message);
  } finally {
    $('edTr').disabled = false;
  }
};
$('editor').addEventListener('close', () => { edUndo = []; $('edUndo').disabled = true; });
// Inglês oficial: encaixa a letra original nas linhas em português
$('edOfficial').onclick = () => {
  $('enUrl').value = '';
  $('enText').value = '';
  $('enHint').textContent = aiState.hasKey ? 'A IA encaixa cada linha no lugar certo.' : 'Sem a chave da IA: uma linha em inglês para cada linha em português.';
  $('enDlg').showModal();
};
$('enAuto').onclick = () => { $('enDlg').close(); $('edTr').click(); };
$('enCancel').onclick = () => $('enDlg').close();
$('enGo').onclick = async () => {
  const btn = $('enGo');
  btn.disabled = true; btn.textContent = 'Encaixando…';
  try {
    const { source } = await api('/api/en/align', { method: 'POST', body: { source: $('edSource').value, url: $('enUrl').value.trim(), english: $('enText').value } });
    $('enDlg').close();
    edSet(source, 'Inglês oficial encaixado. Confira na prévia (PT+EN) e salve; ↶ desfaz.');
    edMode = 'pt-en';
    renderEditorPreview();
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Encaixar';
  }
};
// Biblioteca: remover duplicados
$('dedupeBtn').onclick = async (e) => {
  e.preventDefault();
  const d = await api('/api/songs/dedupe', { method: 'POST', body: { dry: true } });
  if (!d.removed) return toast('Nenhum louvor repetido encontrado');
  if (!confirm(`Encontrei ${d.removed} louvor(es) repetido(s) com a letra igual.\nRemover e deixar só uma cópia de cada? (Os cultos continuam funcionando.)`)) return;
  const r = await api('/api/songs/dedupe', { method: 'POST', body: {} });
  toast(`${r.removed} repetido(s) removido(s)`);
  songCache.clear();
  loadSongs();
  openService(service.id);
};

// Configurações
async function openSettings() {
  await loadAi();
  $('stKey').value = '';
  $('stKeyInfo').textContent = aiState.hasKey ? `Chave cadastrada (${aiState.keyHint}). Deixe em branco para manter.` : 'Nenhuma chave cadastrada.';
  $('stModel').value = aiState.model || '';
  $('stTestRes').textContent = '';
  await loadUpdateSettings();
  $('upApply').hidden = !upState?.available;
  $('settings').showModal();
}
$('settingsBtn').onclick = openSettings;

// ---------------- Atualizações ----------------
let upState = null;
const fmtDate = (d) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
async function loadUpdateSettings() {
  const u = await api('/api/update/settings');
  $('upRepo').value = u.repo;
  $('upToken').value = '';
  $('upToken').placeholder = u.hasToken ? 'Token cadastrado (deixe em branco para manter)' : 'deixe em branco se for público';
  $('upInfo').textContent = u.installed?.sha ? `Versão instalada: ${u.installed.sha.slice(0, 7)} · ${fmtDate(u.installed.date)}` : 'Versão instalada: pacote manual (zip)';
  return u;
}
async function saveUpdateSettings() {
  const body = { repo: $('upRepo').value.trim() };
  if ($('upToken').value.trim()) body.token = $('upToken').value.trim();
  await api('/api/update/settings', { method: 'PUT', body });
}
async function checkUpdate({ silent = false } = {}) {
  try {
    upState = await api('/api/update/check');
    $('updBadge').hidden = !upState.available;
    $('upApply').hidden = !upState.available;
    if (!silent) $('upInfo').textContent = upState.available
      ? `Versão nova disponível: ${upState.latest.short} · ${fmtDate(upState.latest.date)} — ${upState.latest.message}`
      : `Você já está na versão mais recente (${upState.latest.short}).`;
  } catch (e) {
    if (!silent) $('upInfo').textContent = '⚠ ' + e.message;
  }
}
$('upCheck').onclick = async () => { await saveUpdateSettings(); $('upInfo').textContent = 'Procurando…'; checkUpdate(); };
async function applyUpdate() {
  if (!confirm('Instalar a atualização agora? O telão fica alguns segundos sem resposta enquanto o sistema reabre.')) return;
  $('settings').close();
  $('updOverlay').hidden = false;
  try {
    const r = await api('/api/update/apply', { method: 'POST' });
    if (!r.restarting) {
      $('updOverlay').hidden = true;
      return alert('Atualização baixada. Feche a janela preta e abra o sistema de novo (npm start) para terminar.');
    }
    // espera o sistema reabrir e recarrega a página
    await new Promise((ok) => setTimeout(ok, 2500));
    for (let i = 0; i < 60; i++) {
      try { await fetch('/api/info', { cache: 'no-store' }); location.reload(); return; } catch { await new Promise((ok) => setTimeout(ok, 1000)); }
    }
    $('updOverlay').hidden = true;
    toast('O sistema demorou para voltar. Confira a janela preta.');
  } catch (e) {
    $('updOverlay').hidden = true;
    toast(e.message);
  }
}
$('upApply').onclick = applyUpdate;
$('updBadge').onclick = applyUpdate;
// telas abertas em outros computadores recarregam sozinhas depois da atualização
socket.on('updating', () => { $('updOverlay').hidden = false; setTimeout(function wait() { fetch('/api/info', { cache: 'no-store' }).then(() => location.reload(), () => setTimeout(wait, 1500)); }, 3000); });
$('stClose').onclick = () => $('settings').close();
$('stSave').onclick = async () => {
  const body = { model: $('stModel').value.trim() };
  if ($('stKey').value.trim()) body.key = $('stKey').value.trim();
  await api('/api/settings/ai', { method: 'PUT', body });
  await loadAi();
  $('settings').close();
  toast('Configurações salvas');
};
$('stTest').onclick = async () => {
  if ($('stKey').value.trim()) await api('/api/settings/ai', { method: 'PUT', body: { key: $('stKey').value.trim(), model: $('stModel').value.trim() } });
  $('stTestRes').textContent = 'Testando…';
  try {
    await api('/api/ai/test', { method: 'POST' });
    $('stTestRes').textContent = '✅ Conectado';
    await loadAi();
  } catch (e) {
    $('stTestRes').textContent = '❌ ' + e.message;
  }
};

$('edCancel').onclick = () => $('editor').close();
$('edSave').onclick = async () => {
  const src0 = $('edSource').value;
  const body = { source: parseSong(src0).enStatus === 'auto' ? setEnStatus(src0, '') : src0, theme_id: $('edTheme').value };
  try {
    if (edId) await api('/api/songs/' + edId, { method: 'PUT', body });
    else {
      const { id } = await api('/api/songs', { method: 'POST', body });
      edId = id;
    }
    songCache.delete(edId);
    $('editor').close();
    toast('Louvor salvo');
    await loadSongs();
    if (service) await openService(service.id);
    if (selected?.item?.song_id === edId) selectItem(selected.item.id, { fresh: true });
  } catch (e) {
    toast(e.message);
  }
};
$('edDelete').onclick = async () => {
  if (!edId || !confirm('Excluir este louvor? Ele também sai dos cultos.')) return;
  await api('/api/songs/' + edId, { method: 'DELETE' });
  $('editor').close();
  toast('Louvor excluído');
  loadSongs();
  if (service) openService(service.id);
};
$('newSongBtn').onclick = () => openEditor(null);

// ---------------- Importação ----------------
let imFiles = [];
let imRows = [];
$('importBtn').onclick = () => {
  imFiles = [];
  $('imText').value = '';
  $('imUrl').value = '';
  $('imFileList').textContent = '';
  $('imStep1').hidden = false;
  $('imStep2').hidden = true;
  $('importer').showModal();
};
$('imClose').onclick = () => $('importer').close();
const setFiles = (files) => {
  imFiles = [...files];
  $('imFileList').textContent = imFiles.length ? `${imFiles.length} arquivo(s): ${imFiles.map((f) => f.name).join(', ')}` : '';
};
$('imFiles').onchange = (e) => setFiles(e.target.files);
$('drop').ondragover = (e) => { e.preventDefault(); $('drop').classList.add('over'); };
$('drop').ondragleave = () => $('drop').classList.remove('over');
$('drop').ondrop = (e) => { e.preventDefault(); $('drop').classList.remove('over'); setFiles(e.dataTransfer.files); };
$('imPreview').onclick = async () => {
  // link no campo de link, ou um link sozinho colado na caixa de texto: busca a página
  const pasted = $('imText').value.trim();
  if ($('imUrl').value.trim() && !pasted && !imFiles.length) return $('imUrlBtn').click();
  if (/^https?:\/\/\S+$/i.test(pasted) && !imFiles.length) { $('imUrl').value = pasted; $('imText').value = ''; return $('imUrlBtn').click(); }
  const fd = new FormData();
  if ($('imText').value.trim()) fd.append('text', $('imText').value);
  imFiles.forEach((f) => fd.append('files', f));
  if (!$('imText').value.trim() && !imFiles.length) return toast('Cole uma letra ou escolha arquivos');
  try {
    imRows = await api('/api/import/preview', { method: 'POST', body: fd });
  } catch (e) {
    return toast(e.message);
  }
  showImportRows();
};
$('imUrlBtn').onclick = async () => {
  const url = $('imUrl').value.trim();
  if (!url) return toast('Cole o link da página da letra');
  $('imUrlBtn').disabled = true;
  toast('Buscando a letra…');
  try {
    imRows = await api('/api/import/url', { method: 'POST', body: { url } });
    showImportRows();
    toast('Confira a letra antes de importar: dá para editar depois no editor');
  } catch (e) {
    toast(e.message);
  } finally {
    $('imUrlBtn').disabled = false;
  }
};
$('imUrl').onkeydown = (e) => e.key === 'Enter' && $('imUrlBtn').click();
function showImportRows() {
  $('imRows').innerHTML = imRows.map((r, i) => r.error
    ? `<tr><td>—</td><td colspan="4" class="err">${esc(r.error)}</td><td>${esc(r.from)}</td></tr>`
    : `<tr><td><select class="sel" data-i="${i}">
          <option value="create" ${r.action === 'create' ? 'selected' : ''}>Criar</option>
          ${r.duplicateId ? `<option value="replace">Substituir existente</option>` : ''}
          <option value="skip" ${r.action === 'skip' ? 'selected' : ''}>Pular</option></select></td>
        <td><b>${esc(r.title)}</b>${r.duplicateId ? '<div class="dup">Já existe na biblioteca</div>' : ''}</td>
        <td>${esc(r.artist || '—')}</td><td>${r.slides}</td><td>${r.hasEn ? '<span class="badge">EN</span>' : ''}</td><td class="muted small">${esc(r.from)}</td></tr>`).join('');
  $('imRows').querySelectorAll('select').forEach((s) => (s.onchange = () => { imRows[+s.dataset.i].action = s.value; summary(); }));
  $('imAll').value = 'new';
  summary();
  $('imStep1').hidden = true;
  $('imStep2').hidden = false;
}
function summary() {
  const n = (a) => imRows.filter((r) => r.action === a).length;
  $('imSummary').textContent = `${n('create')} novo(s) · ${n('replace')} substituição(ões) · ${n('skip')} pulado(s)`;
  const total = n('create') + n('replace');
  $('imCommit').textContent = total ? `Importar ${total} louvor${total > 1 ? 'es' : ''}` : 'Importar';
  $('imCommit').disabled = !total;
}
$('imAll').onchange = () => {
  const mode = $('imAll').value;
  imRows.forEach((r) => {
    if (r.error) return;
    if (mode === 'none') r.action = 'skip';
    else if (r.duplicateId) r.action = mode === 'replace' ? 'replace' : 'skip';
    else r.action = 'create';
  });
  $('imRows').querySelectorAll('select').forEach((s) => (s.value = imRows[+s.dataset.i].action));
  summary();
};
$('imBack').onclick = () => { $('imStep1').hidden = false; $('imStep2').hidden = true; };
$('imCommit').onclick = async () => {
  const btn = $('imCommit');
  btn.disabled = true; btn.textContent = 'Importando…';
  let r;
  try { r = await api('/api/import/commit', { method: 'POST', body: { items: imRows } }); }
  catch (e) { summary(); throw e; }
  $('importer').close();
  toast(`Importados: ${r.created} novo(s), ${r.replaced} substituído(s)`);
  songCache.clear();
  loadSongs();
};

// ---------------- Mídia ----------------
let mediaList = [];
async function loadMedia() {
  mediaList = await api('/api/media');
  return mediaList;
}
async function uploadMedia(files) {
  const fd = new FormData();
  [...files].forEach((f) => fd.append('files', f));
  toast('Enviando ' + files.length + ' arquivo(s)…');
  const r = await api('/api/media', { method: 'POST', body: fd });
  await loadMedia();
  toast('Arquivo(s) enviado(s)');
  return r.files;
}
async function renderMediaLib() {
  await loadMedia();
  $('mlGrid').innerHTML = mediaList.length
    ? mediaList.map((m) => `<div class="ml-item">${m.type === 'video'
        ? `<video class="th" src="${esc(m.url)}#t=1" muted preload="metadata"></video>`
        : `<div class="th" style="background-image:url('${esc(m.url)}')"></div>`}
        <div class="meta"><span title="${esc(m.name)}"><span class="badge">${m.type === 'video' ? 'Vídeo' : 'Imagem'}</span> ${esc(m.name)}</span><button class="btn sm danger" data-del="${esc(m.name)}">Excluir</button></div></div>`).join('')
    : '<div class="empty">Nenhuma mídia ainda. Envie vídeos ou imagens para usar como fundo e logos.</div>';
}
$('mediaBtn').onclick = async () => { await renderMediaLib(); $('mediaLib').showModal(); };
$('mlClose').onclick = () => $('mediaLib').close();
$('mlUpload').onchange = async (e) => { if (e.target.files.length) { await uploadMedia(e.target.files); renderMediaLib(); } e.target.value = ''; };
$('mlGrid').onclick = async (e) => {
  const n = e.target.dataset.del;
  if (!n || !confirm('Excluir ' + n + '?')) return;
  await api('/api/media/' + encodeURIComponent(n), { method: 'DELETE' });
  renderMediaLib();
};
$('mlGrid').ondragover = (e) => { e.preventDefault(); $('mlGrid').classList.add('over'); };
$('mlGrid').ondragleave = () => $('mlGrid').classList.remove('over');
$('mlGrid').ondrop = async (e) => { e.preventDefault(); $('mlGrid').classList.remove('over'); await uploadMedia(e.dataTransfer.files); renderMediaLib(); };

// ---------------- Editor de tema ----------------
let teDraft = null;
let teStage = null;
let teSample = 0;
const TE_SAMPLES = [
  { lines: [{ pt: '^sem^ *VOCÊ*', en: 'Without You' }, { pt: '~não sei pra onde ir~', en: "I don't know where to go" }] },
  { lines: [{ pt: 'Santo és, Senhor', en: 'Holy are You, Lord' }, { pt: 'Digno de todo louvor', en: 'Worthy of all praise' }] },
  { kind: 'bible', name: 'João 3:16', ref: { pt: 'João 3:16', en: 'John 3:16' }, versions: { pt: 'BLIVRE', en: 'KJV' },
    lines: [{ pt: 'Porque Deus amou ao mundo de tal maneira, que deu o seu Filho unigênito; para que todo aquele que nele crê não pereça, mas tenha a vida eterna.', en: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' }] },
];
const getK = (o, k) => k.split('.').reduce((a, x) => a?.[x], o);
const setK = (o, k, v) => { const ks = k.split('.'); const last = ks.pop(); ks.reduce((a, x) => (a[x] ||= {}), o)[last] = v; };
const fillSelect = (sel, items, withNone) => { sel.innerHTML = (withNone ? `<option value="">${withNone}</option>` : '') + items.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join(''); };

async function openThemeEditor(theme) {
  teDraft = JSON.parse(JSON.stringify(theme));
  const base = newCustomTheme();
  teDraft.bg = { ...base.bg, ...teDraft.bg };
  teDraft.text = { ...base.text, ...teDraft.text };
  teDraft.logo = { ...base.logo, ...teDraft.logo };
  teDraft.transition ||= base.transition;
  await loadMedia();
  fillSelect($('teAnim'), THEMES.filter((t) => t.id !== 'simples').map((t) => [t.id, t.name]));
  fillSelect($('teKw'), FONTS.kw.map((f) => [f, f]));
  fillSelect($('teBody'), FONTS.body.map((f) => [f, f]));
  fillSelect($('teSerif'), FONTS.serif.map((f) => [f, f]));
  refreshMediaSelects();
  $('teName').value = teDraft.name || 'Novo tema';
  $('teDelete').hidden = !teDraft.id;
  document.querySelectorAll('#teForm [data-k]').forEach((el) => {
    const v = getK(teDraft, el.dataset.k);
    if (el.type === 'checkbox') el.checked = v !== false;
    else el.value = v ?? '';
  });
  if ($('themes').open) $('themes').close();
  $('themeEd').showModal();
  if (!teStage) teStage = createStage($('teStage'), { live: true });
  teStage.themeKey = null;
  updateThemeForm();
}
function refreshMediaSelects() {
  const type = teDraft.bg.type;
  fillSelect($('teMedia'), mediaList.filter((m) => m.type === (type === 'video' ? 'video' : 'image')).map((m) => [m.url, m.name]), type === 'video' ? '— escolha um vídeo —' : '— escolha uma imagem —');
  $('teMedia').value = teDraft.bg.media || '';
  fillSelect($('teLogo'), mediaList.filter((m) => m.type === 'image').map((m) => [m.url, m.name]), 'Sem logo');
  $('teLogo').value = teDraft.logo.media || '';
}
function updateThemeForm() {
  const type = teDraft.bg.type;
  document.querySelectorAll('#teBgType button').forEach((b) => b.classList.toggle('on', b.dataset.v === type));
  document.querySelectorAll('#teForm [data-show]').forEach((el) => (el.hidden = !el.dataset.show.split(' ').includes(type)));
  document.querySelectorAll('#teForm output').forEach((o) => {
    const v = getK(teDraft, o.dataset.o);
    o.textContent = o.dataset.o === 'text.size' || o.dataset.o === 'bg.dim' ? v + '%' : v + 'px';
  });
  document.querySelectorAll('#teSample button').forEach((b) => b.classList.toggle('on', +b.dataset.v === teSample));
  teStage.setTheme('preview', { ...teDraft, name: $('teName').value });
  teStage.show(slideHTML(TE_SAMPLES[teSample], teSample === 0 ? 'pt' : 'pt-en'), { animate: false });
}
$('teForm').oninput = (e) => {
  const k = e.target.dataset.k;
  if (!k) return;
  let v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (e.target.type === 'range') v = +v;
  setK(teDraft, k, v);
  updateThemeForm();
};
$('teBgType').onclick = (e) => {
  const v = e.target.dataset.v;
  if (!v) return;
  teDraft.bg.type = v;
  if ((v === 'image' || v === 'video') && !mediaList.some((m) => m.url === teDraft.bg.media && m.type === (v === 'video' ? 'video' : 'image'))) teDraft.bg.media = '';
  refreshMediaSelects();
  updateThemeForm();
};
$('teSample').onclick = (e) => { if (e.target.dataset.v) { teSample = +e.target.dataset.v; updateThemeForm(); } };
$('teUpload').onchange = async (e) => {
  if (!e.target.files.length) return;
  const [url] = await uploadMedia(e.target.files);
  e.target.value = '';
  const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(decodeURIComponent(url));
  teDraft.bg.type = isVideo ? 'video' : 'image';
  teDraft.bg.media = url;
  refreshMediaSelects();
  updateThemeForm();
};
async function saveTheme(apply) {
  teDraft.name = $('teName').value.trim() || 'Tema';
  if ((teDraft.bg.type === 'image' || teDraft.bg.type === 'video') && !teDraft.bg.media) return toast('Escolha o arquivo do fundo ou troque o tipo de fundo');
  const { id } = await api('/api/themes', { method: 'POST', body: teDraft });
  teDraft.id = id;
  await loadThemes();
  if (apply) cmd({ type: 'theme', value: id });
  $('themeEd').close();
  toast(apply ? 'Tema salvo e aplicado no telão' : 'Tema salvo');
}
$('teSave').onclick = () => saveTheme(false);
$('teApply').onclick = () => saveTheme(true);
$('teCancel').onclick = () => $('themeEd').close();
$('teDelete').onclick = async () => {
  if (!teDraft.id || !confirm('Excluir o tema "' + teDraft.name + '"?')) return;
  await api('/api/themes/' + encodeURIComponent(teDraft.id), { method: 'DELETE' });
  await loadThemes();
  $('themeEd').close();
  toast('Tema excluído');
};
$('themeEd').addEventListener('close', () => teStage?.el.querySelectorAll('video').forEach((v) => v.pause()));

// ---------------- Bíblia ----------------
let versions = [];
const verName = (code) => versions.find((v) => v.code === code)?.name || code;
async function loadVersions() {
  versions = await api('/api/bible/versions');
  const opts = versions.map((v) => [v.code, `${v.code} · ${v.name}`]);
  fillSelect($('bibleMain'), opts);
  fillSelect($('bibleSecond'), opts, 'Nenhuma');
  if (live) { $('bibleMain').value = live.bibleMain; $('bibleSecond').value = live.bibleSecond || ''; }
  $('biVersions').innerHTML = versions.map((v) => `<div class="ver-row"><span><b>${esc(v.code)}</b> · ${esc(v.name)} <span class="muted small">(${v.verses} versículos)</span></span><button class="btn sm danger" data-delv="${esc(v.code)}">Remover</button></div>`).join('');
}

async function showBibleChapter(book, chapter, verse, item = null) {
  const main = $('bibleMain').value || live?.bibleMain;
  const second = $('bibleSecond').value;
  const [a, b] = await Promise.all([
    api(`/api/bible/chapter?v=${encodeURIComponent(main)}&book=${book}&chapter=${chapter}`),
    second ? api(`/api/bible/chapter?v=${encodeURIComponent(second)}&book=${book}&chapter=${chapter}`) : { verses: [] },
  ]);
  const en = new Map(b.verses.map((v) => [v.verse, v.text]));
  const slides = a.verses.map((v, index) => ({ index, verse: v.verse, lines: [{ pt: v.text, en: en.get(v.verse) || '' }] }));
  selected = { item, bible: { book, chapter }, slides, mode: live?.mode, focusVerse: verse };
  document.querySelectorAll('.item').forEach((el) => el.classList.toggle('sel', item && +el.dataset.id === item.id));
  renderSlides();
}
function renderBibleSlides() {
  const { book, chapter } = selected.bible;
  $('selTitle').textContent = `${refText(book, chapter)} · ${verName($('bibleMain').value)}${$('bibleSecond').value ? ' + ' + $('bibleSecond').value : ''}`;
  $('slideGrid').innerHTML = selected.slides.map((s) => `<div class="slide" data-i="${s.index}" data-v="${s.verse}">
      <div class="tag"><span>Versículo ${s.verse}</span><span class="num">${s.index + 1}</span></div>
      <div class="pt">${esc(s.lines[0].pt)}</div>${s.lines[0].en ? `<div class="en">${esc(s.lines[0].en)}</div>` : ''}</div>`).join('')
    || '<div class="empty">Capítulo não encontrado nesta versão</div>';
  markLiveSlide(false);
  const f = selected.focusVerse && document.querySelector(`.slide[data-v="${selected.focusVerse}"]`);
  if (f) { f.scrollIntoView({ block: 'center' }); f.style.outline = '2px dashed var(--accent2)'; }
}
$('addBibleBtn').onclick = async () => {
  if (!selected?.bible || !service) return;
  const { book, chapter } = selected.bible;
  const verse = selected.focusVerse || (live?.kind === 'bible' && live.bible?.book === book && live.bible?.chapter === chapter ? live.slide?.verse : 1) || 1;
  await api(`/api/services/${service.id}/items`, { method: 'POST', body: { kind: 'bible', title: refText(book, chapter, verse), text: JSON.stringify({ book, chapter, verse }) } });
  await openService(service.id);
  toast('Leitura adicionada ao culto');
};

// Importar versão
$('bibleImportBtn').onclick = async () => { await loadVersions(); $('bibleImp').showModal(); };
$('biCancel').onclick = () => $('bibleImp').close();
$('biVersions').onclick = async (e) => {
  const c = e.target.dataset.delv;
  if (!c || !confirm('Remover a versão ' + c + '?')) return;
  await api('/api/bible/versions/' + encodeURIComponent(c), { method: 'DELETE' });
  loadVersions();
};
$('biSave').onclick = async () => {
  const f = $('biFile').files[0];
  if (!f) return toast('Escolha o arquivo');
  const fd = new FormData();
  fd.append('file', f);
  fd.append('code', $('biCode').value);
  fd.append('name', $('biName').value);
  fd.append('lang', $('biLang').value);
  toast('Importando… pode levar alguns segundos');
  try {
    const r = await api('/api/bible/import', { method: 'POST', body: fd });
    toast(`${r.code}: ${r.verses} versículos importados`);
    await loadVersions();
  } catch (err) { toast(err.message); }
};

// ---------------- Início ----------------
loadSongs();
loadServices();
loadThemes();
loadVersions();
loadAi();
setTimeout(() => checkUpdate({ silent: true }), 4000);
initBibleView({ api, cmd, toast, esc, getLive: () => live, getService: () => service, openService, loadVersions, onState: (fn) => socket.on('state', fn) });
