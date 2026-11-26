// Painel do operador
import { parseSong, buildSlides, slideMaxLines } from '/shared/parser.js';
import { createStage, slideHTML, stripMarkup, niceCase } from '/shared/render.js';
import { THEMES, THEME_CATS, themeById, FONTS, newCustomTheme, MOTIONS } from '/shared/themes.js';
import { BOOKS, parseRef, refText, bookName } from '/shared/bible.js';
import { initBibleView } from '/operator/bible.js';
import { initMedia } from '/operator/media.js';
import { initOrganize } from '/operator/organize.js';
import { initExtras } from '/operator/extras.js';
let MEDIA = null;
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
  if (r.status === 401) { location.href = '/entrar.html?next=' + encodeURIComponent(location.pathname + location.search); throw new Error('Digite o PIN'); }
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
socket.on('auth', (a) => { if (!a.control) location.href = '/entrar.html?next=' + encodeURIComponent(location.pathname); });
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
  MEDIA?.renderPlayer(s);
  if (s.aspect) { document.documentElement.style.setProperty('--ar', s.aspect); document.body.classList.toggle('ar-wide', +s.aspect >= 2.05); }
  if (prevMode !== s.mode && service) renderItems();
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === s.mode));
  $('themeName').textContent = themeLabel(s.themeId);
  markQuickTheme();
  $('trSel').value = s.transition || 'suave';
  $('trSpeedSel').value = s.trSpeed || 'normal';
  if ($('bibleMain').options.length) { $('bibleMain').value = s.bibleMain; $('bibleSecond').value = s.bibleSecond || ''; }
  $('blackBtn').classList.toggle('on', s.black);
  $('clearBtn').classList.toggle('on', s.clear);
  $('liveTitle').textContent = s.title || '—';
  const prog = { slides: s.slides, index: s.index, onPick: (i) => cmd({ type: 'goto', index: i }) };
  renderProgress($('liveProg'), prog);
  renderProgress($('bvProg'), prog);
  $('livePos').textContent = s.total ? `Slide ${s.index + 1} de ${s.total}${s.slide ? ' · ' + s.slide.name : ''}` : '';
  $('liveNext').textContent = s.next ? '' : s.total ? 'Fim — próximo item do culto' : '';
  // linha "Próximo" acima do telão
  $('nextLine').innerHTML = s.next
    ? `<b>Próximo:</b> ${esc(s.next.name || '')}${(s.next.lines || []).length ? ' — ' + esc(niceCase(stripMarkup(s.next.lines.map((l) => l.pt).join(' / '))).slice(0, 90)) : ''}`
    : s.total ? '<b>Próximo:</b> próximo item do culto' : '';
  document.querySelectorAll('.item').forEach((el) => el.classList.toggle('live', +el.dataset.id === s.itemId));
  // seleção acompanha o que está no ar (ex.: avançou pelo celular para o próximo louvor)
  if (s.itemId && s.itemId !== prevItem && service?.items.some((i) => i.id === s.itemId)) selectItem(s.itemId, { keepScroll: false });
  else if (selected?.item && s.mode !== selected.mode && selected.item.kind === 'song') selectItem(selected.item.id);
  else markLiveSlide();
});

// ---------------- Biblioteca ----------------
const enBadge = (v) => (v === 2 ? '<span class="badge auto" title="Inglês traduzido automaticamente — revise no editor">EN auto</span>' : v ? '<span class="badge">EN</span>' : '');
let webQ = '';
let webRes = null;
let webBusy = false;
let webT;
const WEB_ICON = '<svg viewBox="0 0 24 24" class="bi"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>';
function webBlock(q) {
  if (q.length < 2) return '';
  if (webBusy) return `<div class="web-box"><div class="web-h">${WEB_ICON}Buscando “${esc(q)}” na internet…</div><div class="web-load"><i></i><i></i><i></i></div></div>`;
  if (webRes && webQ === q) {
    return `<div class="web-box"><div class="web-h">${WEB_ICON}Na internet <span>${webRes.length} resultado${webRes.length === 1 ? '' : 's'}</span></div>` +
      (webRes.length ? webRes.map((r, i) => `<div class="web-row" data-w="${i}"><div class="info"><div class="t">${esc(r.title)}</div><div class="a">${esc(r.artist || '—')} · <em>${esc(r.source)}</em></div></div>
        <button class="btn sm" data-wact="imp" title="Importar e conferir a letra">Importar</button><button class="btn sm primary" data-wact="svc" title="Importar e já colocar no culto">+ Culto</button></div>`).join('')
        : '<div class="empty">Nada encontrado. Tente com o nome do cantor, ex.: “Santo és Fernandinho”.</div>') + '</div>';
  }
  return `<button class="web-btn" id="webSearchBtn">${WEB_ICON}<span>Buscar <b>“${esc(q)}”</b> na internet</span><small>Letras.mus.br e outros</small></button>`;
}
async function webSearch(q) {
  webQ = q; webBusy = true; webRes = null; loadSongs(true);
  try { webRes = await api('/api/lyrics/search?q=' + encodeURIComponent(q)); }
  catch (e) { webRes = null; toast(e.message || 'Sem internet'); }
  webBusy = false;
  if ($('search').value.trim() === q) loadSongs(true);
}
// Etiquetas e sugestões na biblioteca
const TAG_PRESETS = ['Adoração', 'Celebração', 'Ceia', 'Batismo', 'Oferta', 'Jovens', 'Infantil', 'Natal', 'Páscoa'];
let tagFilter = '';
const tagsOf = (s) => String(s.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d.replace(' ', 'T'))) / 864e5) : null);
function renderTagRow(all) {
  const used = new Map();
  all.forEach((s) => tagsOf(s).forEach((t) => used.set(t, (used.get(t) || 0) + 1)));
  const tags = [...used.keys()].sort((a, b) => used.get(b) - used.get(a)).slice(0, 14);
  $('tagRow').innerHTML = `<button data-t="" class="${!tagFilter ? 'on' : ''}">Todos</button><button data-t="@sug" class="sug ${tagFilter === '@sug' ? 'on' : ''}" title="Louvores que a igreja canta, mas que não aparecem há mais de 2 meses">Sugestões</button>` +
    tags.map((t) => `<button data-t="${esc(t)}" class="${tagFilter === t ? 'on' : ''}">${esc(t)} <i>${used.get(t)}</i></button>`).join('');
}
$('tagRow').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; tagFilter = b.dataset.t; loadSongs(true); };
async function loadSongs(keepWeb = false) {
  const q = $('search').value.trim();
  let list = await api('/api/songs?q=' + encodeURIComponent($('search').value));
  renderTagRow(list);
  if (tagFilter === '@sug') list = list.filter((s) => s.plays > 0 && daysSince(s.last_played) > 60).sort((a, b) => b.plays - a.plays || daysSince(b.last_played) - daysSince(a.last_played));
  else if (tagFilter) list = list.filter((s) => tagsOf(s).includes(tagFilter));
  if (!keepWeb && q !== webQ) { webRes = null; webBusy = false; }
  $('songCount').textContent = `${list.length} louvor${list.length === 1 ? '' : 'es'}`;
  $('songList').innerHTML = (list.length
    ? list.map((s) => `<div class="song" draggable="true" data-id="${s.id}" title="Duplo clique: projetar agora · arraste para o telão ou para o culto">
        <div class="info"><div class="t">${esc(s.title)}</div><div class="a">${esc(s.artist || '—')}${s.song_key ? ' · Tom ' + esc(s.song_key) : ''}${s.bpm ? ' · ' + esc(s.bpm) + ' BPM' : ''}${tagFilter === '@sug' ? ` · cantado ${s.plays}x, último há ${daysSince(s.last_played)} dias` : ''}${tagsOf(s).length ? ' ' + tagsOf(s).slice(0, 3).map((t) => `<span class="tg">${esc(t)}</span>`).join('') : ''}</div></div>
        ${s.last_played && (Date.now() - new Date(s.last_played.replace(' ', 'T'))) < 21 * 864e5 ? `<span class="badge recent" title="Cantado em ${s.last_played.slice(0, 10).split('-').reverse().join('/')}">há ${Math.max(0, Math.round((Date.now() - new Date(s.last_played.replace(' ', 'T'))) / 864e5))}d</span>` : ''}
        ${enBadge(s.has_en)}
        <button class="mini" data-act="edit" title="Editar">✎</button>
        <button class="mini" data-act="add" title="Adicionar ao culto">＋</button></div>`).join('')
    : (tagFilter === '@sug' ? '<div class="empty">Nenhuma sugestão por enquanto: todos os louvores cantados apareceram nos últimos 2 meses.</div>' : tagFilter ? '<div class="empty">Nenhum louvor com essa etiqueta.</div>' : q ? '<div class="empty">Não está na biblioteca.</div>' : '<div class="empty">Nenhum louvor encontrado</div>')) + (tagFilter ? '' : webBlock(q));
  // Sem resultado aqui: já procura na internet sozinho
  clearTimeout(webT);
  if (!tagFilter && !list.length && q.length >= 3 && !webBusy && !(webRes && webQ === q)) webT = setTimeout(() => { if ($('search').value.trim() === q) webSearch(q); }, 500);
}
$('songList').addEventListener('click', async (e) => {
  if (e.target.closest('#webSearchBtn')) return webSearch($('search').value.trim());
  const b = e.target.closest('[data-wact]');
  if (!b) return;
  const r = webRes?.[+b.closest('.web-row').dataset.w];
  if (!r) return;
  b.disabled = true; const old = b.textContent; b.textContent = 'Baixando…';
  try {
    const j = await api('/api/lyrics/import', { method: 'POST', body: { url: r.url } });
    toast(j.existed ? 'Esse louvor já estava na biblioteca' : 'Letra importada');
    $('search').value = r.title; webRes = null; await loadSongs();
    if (b.dataset.wact === 'svc') await addSongToService(j.id);
    else openEditor(j.id);
  } catch (err) { toast(err.message || 'Não consegui importar'); b.disabled = false; b.textContent = old; }
});
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
const BLOCK_COLORS = { abertura: '#5fd0b8', louvor: '#ff9a62', palavra: '#b88cff', ofertas: '#f0c654', avisos: '#7fa8e8', outro: '#9aa3ae' };
const jsonOf = (t) => { try { return JSON.parse(t || '{}'); } catch { return {}; } };
function blockRow(it) {
  const j = jsonOf(it.text);
  const cur = live?.timing?.blockId === it.id;
  return `<div class="item block ${cur ? 'cur' : ''}" draggable="true" data-id="${it.id}" style="--bc:${BLOCK_COLORS[j.color] || BLOCK_COLORS.outro}">
    <span class="b-dot"></span><span class="b-name">${esc(it.title)}</span>
    <button class="b-min" data-act="min" title="Tempo previsto (clique para mudar)">${j.minutes ? j.minutes + ' min' : 'sem tempo'}</button>
    <button class="x" title="Remover bloco">×</button></div>`;
}
function renderItems() {
  let bc = '';
  $('itemList').innerHTML = service.items.length
    ? service.items.map((it, i) => {
      if (it.kind === 'block') { bc = BLOCK_COLORS[jsonOf(it.text).color] || BLOCK_COLORS.outro; return blockRow(it); }
      return `<div class="item ${bc ? 'in-block' : ''} ${selected?.item?.id === it.id ? 'sel' : ''} ${live?.itemId === it.id ? 'live' : ''}" draggable="true" data-id="${it.id}" style="${bc ? '--bc:' + bc : ''}">
        <div class="n">${MEDIA ? MEDIA.badge(it) : i + 1}</div>
        <div class="info"><div class="t">${esc(it.kind === 'song' ? it.song_title : it.title || 'Aviso')}</div>
        <div class="a">${MEDIA?.itemSub(it) ? esc(MEDIA.itemSub(it)) : it.kind === 'song' ? (MEDIA?.hasAudio(it) ? '<span class="badge pb">playback</span> ' : '') + esc(it.song_artist || '') + (it.has_en ? ' · ' + enBadge(it.has_en) : enPending.has(it.song_id) ? ' · <span class="badge auto pulse">traduzindo…</span>' : wantsEn() ? ' · <span class="badge no-en" data-song="' + it.song_id + '" title="' + (aiState.hasKey ? 'Não deu para traduzir — clique para abrir' : 'Cadastre a chave da IA em Configurações para traduzir sozinho') + '">sem inglês</span>' : '') : it.kind === 'bible' ? 'Bíblia' : 'Aviso / texto'}</div></div>
        ${it.kind === 'song' ? '<button class="mini aud" data-act="aud" title="Playback (áudio junto com a letra)">' + (MEDIA ? MEDIA.icon('audio') : '♪') + '</button>' : ''}
        <button class="x" title="Remover do culto">×</button></div>`;
    }).join('')
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
  if (e.target.closest('[data-act="aud"]')) return MEDIA.openAudioFor(service.items.find((x) => x.id === id));
  if (e.target.closest('[data-act="min"]')) {
    const it = service.items.find((x) => x.id === id);
    const j = jsonOf(it.text);
    const v = prompt(`Tempo previsto para "${it.title}" (minutos):`, j.minutes || '');
    if (v == null) return;
    j.minutes = Math.max(0, Math.round(+v || 0));
    await api('/api/items/' + id, { method: 'PUT', body: { text: JSON.stringify(j), title: it.title } });
    return openService(service.id);
  }
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
$('itemList').addEventListener('dragend', () => { dragId = null; document.querySelectorAll('.item').forEach((x) => x.classList.remove('dragging', 'over')); });
$('itemList').addEventListener('dragover', (e) => {
  e.preventDefault();
  document.querySelectorAll('.item').forEach((x) => x.classList.remove('over'));
  e.target.closest('.item')?.classList.add('over');
});
$('itemList').addEventListener('drop', async (e) => {
  const target = e.target.closest('.item');
  let id = dragId;
  if (id == null) {
    // veio das fontes (louvor, versículo, mídia, apresentação): entra no culto onde foi solto
    const raw = e.dataTransfer.getData('application/x-projecao');
    if (!raw) return; // arquivo do computador: quem cuida é o "arrastar e soltar" geral
    e.preventDefault();
    e.stopPropagation();
    const body = itemFromPayload(JSON.parse(raw));
    if (!body) return;
    id = (await api(`/api/services/${service.id}/items`, { method: 'POST', body })).id;
    service = await api('/api/services/' + service.id);
    toast('Adicionado ao culto');
  } else e.preventDefault();
  const ids = service.items.map((i) => i.id).filter((i) => i !== id);
  const at = target ? ids.indexOf(+target.dataset.id) : ids.length;
  ids.splice(at < 0 ? ids.length : at, 0, id);
  await api(`/api/services/${service.id}/reorder`, { method: 'POST', body: { ids } });
  dragId = null;
  openService(service.id);
});
function itemFromPayload(p) {
  if (p.kind === 'song') return { kind: 'song', song_id: p.id };
  if (p.kind === 'bible') return { kind: 'bible', title: refText(p.book, p.chapter, p.verse), text: JSON.stringify({ book: p.book, chapter: p.chapter, verse: p.verse }) };
  if (p.kind === 'media') return { kind: 'media', title: p.name, text: JSON.stringify({ type: p.mtype, url: p.url, name: p.name, after: p.mtype === 'video' ? 'tema' : 'stop' }) };
  if (p.kind === 'deck') return { kind: 'deck', title: p.title || 'Apresentação', text: JSON.stringify({ deck: p.id, count: p.count }) };
  return null;
}

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
  if (!item || item.kind === 'block') return;
  const mode = live?.mode || 'pt';
  let slides;
  if (item.kind === 'bible') {
    const r = JSON.parse(item.text || '{}');
    return showBibleChapter(r.book, r.chapter, r.verse, item);
  }
  if (item.kind === 'media' || item.kind === 'deck' || item.kind === 'seq') {
    selected = { item, slides: [], media: true, mode };
    document.querySelectorAll('.item').forEach((el) => el.classList.toggle('sel', +el.dataset.id === id));
    return renderSlides();
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
  if (selected.media) {
    $('editSelBtn').hidden = true;
    $('selTitle').textContent = it.title || 'Mídia';
    return MEDIA.renderSelected(it).then(() => markLiveSlide(true));
  }
  $('selTitle').textContent = it.kind === 'song' ? it.song_title : it.title || 'Aviso';
  $('slideGrid').innerHTML = selected.slides.length
    ? selected.slides.map((s) => `<div class="slide" data-i="${s.index}" data-type="${esc(s.type || 'verso')}">
        <div class="tag"><span>${esc(s.name)}${s.parts > 1 ? ` · ${s.part}/${s.parts}` : ''}</span><span class="num">${s.index + 1}</span></div>
        ${s.lines.map((l) => `<div class="pt">${esc(niceCase(stripMarkup(l.pt)))}</div>${l.en ? `<div class="en">${esc(niceCase(l.en))}</div>` : ''}`).join('')}</div>`).join('')
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
  if (live?.itemId === selected.item.id) {
    if (selected.item.kind === 'media' && live.player) return cmd({ type: 'player', action: live.player.status === 'stopped' ? 'restart' : 'toggle' });
    if (selected.item.kind === 'seq' && live.index === index && live.player?.seqIndex === index) return cmd({ type: 'player', action: live.player.status === 'stopped' ? 'restart' : 'toggle' });
    cmd({ type: 'goto', index });
  } else cmd({ type: 'item', id: selected.item.id, index });
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
// Aviso: telão fechado / painel sem conexão com o servidor
socket.on('screens', (n) => { $('screenWarn').hidden = n > 0; });
$('screenWarn').onclick = () => $('openScreen').click();
let lostT;
socket.on('disconnect', () => { clearTimeout(lostT); lostT = setTimeout(() => { $('connLost').hidden = false; }, 1500); });
socket.on('connect', () => { clearTimeout(lostT); $('connLost').hidden = true; });
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
$('trSel').onchange = () => cmd({ type: 'transition', value: $('trSel').value });
$('trSpeedSel').onchange = () => cmd({ type: 'transition', speed: $('trSpeedSel').value });
// Recado para o palco: abre uma caixinha acima da barra de comando
$('msgBtn').onclick = () => { $('msgPop').hidden = !$('msgPop').hidden; if (!$('msgPop').hidden) $('msgIn').focus(); };
$('msgSend').addEventListener('click', () => setTimeout(() => ($('msgPop').hidden = true), 50));

// ---------------- Fontes: abas da coluna da direita ----------------
$('srcTabs').onclick = (e) => {
  const b = e.target.closest('[data-src]');
  if (!b) return;
  $('srcTabs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  try { localStorage.setItem('src', b.dataset.src); } catch {}
  window.dispatchEvent(new CustomEvent('libtab', { detail: b.dataset.src }));
  if (b.dataset.src === 'biblia') { renderBibleSrc(); setTimeout(() => $('bsQ').focus(), 30); }
};
setTimeout(() => { let t = 'louvores'; try { t = localStorage.getItem('src') || 'louvores'; } catch {} $('srcTabs').querySelector(`[data-src="${t}"]`)?.click(); }, 0);

// Bíblia rápida: digite a referência ou palavras; os versículos aparecem no centro, um clique manda para o telão
let bsT;
async function renderBibleSrc() {
  $('bsVer').textContent = (live?.bibleMain || '') + (live?.bibleSecond ? ' + ' + live.bibleSecond : '');
  const q = $('bsQ').value.trim();
  if (!q) {
    const hist = await api('/api/bible/history').catch(() => []);
    $('bsList').innerHTML = hist.length
      ? '<div class="sub-h">Lidos agora há pouco</div>' + hist.slice(0, 12).map((h) => `<div class="bs-hit" draggable="true" data-b="${h.book}" data-c="${h.chapter}" data-v="${h.verse || 1}"><b>${esc(refText(h.book, h.chapter, h.verse))}</b></div>`).join('')
      : '<div class="empty">Digite uma referência (ex.: jo 3 16, sl 23) ou palavras do versículo</div>';
    return;
  }
  const r = await api('/api/bible/search?q=' + encodeURIComponent(q) + '&v=' + encodeURIComponent(live?.bibleMain || ''));
  if (r.ref) {
    $('bsList').innerHTML = `<div class="bs-hit on" draggable="true" data-b="${r.ref.book}" data-c="${r.ref.chapter}" data-v="${r.ref.verse || 1}"><b>${esc(refText(r.ref.book, r.ref.chapter, r.ref.verse))}</b><span>Enter para abrir</span></div>`;
    return;
  }
  $('bsList').innerHTML = (r.hits || []).length
    ? r.hits.map((h) => `<div class="bs-hit" draggable="true" data-b="${h.book}" data-c="${h.chapter}" data-v="${h.verse}"><b>${esc(refText(h.book, h.chapter, h.verse))}</b><span>${esc(h.text.slice(0, 120))}</span></div>`).join('')
    : '<div class="empty">Nada encontrado</div>';
}
$('bsQ').oninput = () => { clearTimeout(bsT); bsT = setTimeout(renderBibleSrc, 220); };
$('bsQ').onkeydown = (e) => { if (e.key === 'Enter') $('bsList').querySelector('.bs-hit')?.click(); };
$('bsList').onclick = async (e) => {
  const h = e.target.closest('.bs-hit');
  if (!h) return;
  if (!$('bibleMain').value) await loadVersions();
  await showBibleChapter(+h.dataset.b, +h.dataset.c, +h.dataset.v);
  $('bsQ').blur(); // libera os atalhos (F, setas, Enter)
  $('bsList').querySelectorAll('.bs-hit').forEach((x) => x.classList.toggle('on', x === h));
};
$('bsFull').onclick = () => document.querySelector('#viewSeg [data-view="biblia"]').click();
// Modo culto (tela limpa) e painel claro: preferências deste computador
const pref = { get: (k) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } }, set: (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch {} } };
// Aparência do painel: preto, grafite e três claros
const SKINS = [
  { id: 'preto', name: 'Preto', desc: 'Azul-marinho escuro da ADPC', light: false, sw: ['#060a11', '#0c1320', '#1f6fbf'] },
  { id: 'grafite', name: 'Grafite', desc: 'Cinza médio, confortável à noite', light: false, sw: ['#2a2c30', '#3c3f44', '#4d5054'] },
  { id: 'claro', name: 'Claro ADPC', desc: 'Cinza-azulado suave', light: true, sw: ['#eef2f6', '#dde3ea', '#1f6fbf'] },
  { id: 'areia', name: 'Claro areia', desc: 'Tom quente, cansa menos a vista', light: true, sw: ['#f3f0ea', '#e3ddd3', '#d9cdb9'] },
  { id: 'gelo', name: 'Claro gelo', desc: 'Cinza neutro, bem limpo', light: true, sw: ['#f4f4f5', '#e4e4e6', '#cfcfd3'] },
];
function getSkin() {
  let v = null;
  try { v = localStorage.getItem('skin'); } catch {}
  if (!SKINS.some((x) => x.id === v)) v = pref.get('light') ? 'claro' : 'preto';
  return v;
}
function applyPrefs() {
  const sk = SKINS.find((x) => x.id === getSkin());
  document.body.classList.toggle('focus', pref.get('focus'));
  document.body.classList.toggle('light', sk.light);
  SKINS.forEach((x) => document.body.classList.toggle('skin-' + x.id, x === sk));
  $('focusBtn').classList.toggle('on', pref.get('focus'));
  $('lightBtn').title = 'Aparência do painel: ' + sk.name;
}
$('focusBtn').onclick = () => { pref.set('focus', !pref.get('focus')); applyPrefs(); };
$('lightBtn').onclick = (e) => {
  e.stopPropagation();
  let pop = document.querySelector('.skin-pop');
  if (pop) { pop.remove(); return; }
  pop = document.createElement('div');
  pop.className = 'skin-pop';
  const cur = getSkin();
  pop.innerHTML = '<h4>Aparência do painel</h4>' + SKINS.map((x) => `<button data-skin="${x.id}" class="${x.id === cur ? 'on' : ''}"><span class="sw" style="--a:${x.sw[0]};--b:${x.sw[1]};--c:${x.sw[2]}"><i></i><i></i></span><span><b>${x.name}</b><small>${x.desc}</small></span></button>`).join('');
  document.body.appendChild(pop);
  const r = $('lightBtn').getBoundingClientRect();
  pop.style.top = r.bottom + 8 + 'px';
  pop.style.left = Math.min(window.innerWidth - 300, Math.max(8, r.right - 290)) + 'px';
  pop.onclick = (ev) => {
    const b = ev.target.closest('[data-skin]');
    if (!b) return;
    try { localStorage.setItem('skin', b.dataset.skin); } catch {}
    applyPrefs();
    pop.querySelectorAll('[data-skin]').forEach((x) => x.classList.toggle('on', x === b));
  };
  setTimeout(() => document.addEventListener('click', function close(ev) { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('click', close); } }), 0);
};
applyPrefs();
$('allThemesBtn').onclick = (e) => { e.preventDefault(); $('themeBtn').click(); };
$('themeBtn').onclick = async () => { await loadThemes(); renderThemeGallery(); $('themes').showModal(); };
$('newThemeBtn').onclick = () => openThemeEditor(newCustomTheme());
$('thClose').onclick = () => $('themes').close();

// Atalhos de teclado (fora de campos de texto)
document.addEventListener('keydown', (e) => {
  // passador de slides: o botão "apresentar" manda F5/Shift+F5 — não deixa recarregar o painel no meio do culto
  if (e.key === 'F5' && !e.ctrlKey) { e.preventDefault(); return; }
  if (e.target.closest('input, textarea, select, dialog[open]') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === ',' || e.key === 'w' || e.key === 'W') return cmd({ type: 'clear' });
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); cmd({ type: 'next' }); }
  else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); cmd({ type: 'prev' }); }
  else if (e.key === 'b' || e.key === 'B' || e.key === '.') cmd({ type: 'black' });
  else if (e.key === 'c' || e.key === 'C') cmd({ type: 'clear' });
  else if (e.key === 'l' || e.key === 'L') cmd({ type: 'logo' });
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
  syncMetaBar();
  renderEditorPreview();
  $('edSource').focus();
}
// Barra de dados: tom, BPM e etiquetas (gravados nas linhas "Tom:", "BPM:" e "Tags:" da letra)
const KEYS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
$('edKey').innerHTML = '<option value="">—</option>' + KEYS.flatMap((k) => [k, k + 'm']).map((k) => `<option>${k}</option>`).join('');
function setMeta(src, re, label, value) {
  const lines = src.split('\n');
  const i = lines.findIndex((l) => re.test(l));
  if (i >= 0) { if (value) lines[i] = label + ': ' + value; else lines.splice(i, 1); return lines.join('\n'); }
  if (!value) return src;
  // depois do título e das outras linhas de dados
  let at = 1;
  while (at < lines.length && /^\s*[\p{L} ]+\s*:/u.test(lines[at]) && !/^\s*\[/.test(lines[at])) at++;
  lines.splice(at, 0, label + ': ' + value);
  return lines.join('\n');
}
const RE_KEY = /^\s*(tom|key)\s*:/i;
const RE_BPM = /^\s*bpm\s*:/i;
const RE_TAGS = /^\s*tags\s*:/i;
function syncMetaBar() {
  const p = parseSong($('edSource').value);
  if (document.activeElement !== $('edKey')) { const k = p.key || ''; if (k && ![...$('edKey').options].some((o) => o.value === k)) $('edKey').insertAdjacentHTML('beforeend', `<option>${esc(k)}</option>`); $('edKey').value = k; }
  if (document.activeElement !== $('edBpm')) $('edBpm').value = p.bpm || '';
  const cur = (p.tags || []).map((t) => String(t).trim()).filter(Boolean);
  const all = [...new Set([...TAG_PRESETS, ...cur])];
  // atualiza no lugar (sem recriar os botões) para não perder o clique que está acontecendo
  const html = all.map((t) => `<button type="button" data-tag="${esc(t)}">${esc(t)}</button>`).join('');
  if ($('edTags').dataset.h !== html) { $('edTags').innerHTML = html; $('edTags').dataset.h = html; }
  $('edTags').querySelectorAll('[data-tag]').forEach((b) => b.classList.toggle('on', cur.includes(b.dataset.tag)));
}
function edMetaChange(re, label, value) {
  edUndo.push($('edSource').value);
  $('edUndo').disabled = false;
  $('edSource').value = setMeta($('edSource').value, re, label, value);
  syncMetaBar();
  renderEditorPreview();
}
$('edKey').onchange = () => edMetaChange(RE_KEY, 'Tom', $('edKey').value);
$('edBpm').onchange = () => edMetaChange(RE_BPM, 'BPM', String(Math.round(+$('edBpm').value) || ''));
$('edTags').onclick = (e) => {
  const b = e.target.closest('[data-tag]');
  if (!b) return;
  const cur = (parseSong($('edSource').value).tags || []).map((t) => String(t).trim()).filter(Boolean);
  const t = b.dataset.tag;
  const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
  edMetaChange(RE_TAGS, 'Tags', next.join(', '));
};
$('edTagNew').onkeydown = (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const t = $('edTagNew').value.trim().replace(/,/g, ' ');
  if (!t) return;
  const cur = (parseSong($('edSource').value).tags || []).map((x) => String(x).trim()).filter(Boolean);
  if (!cur.includes(t)) edMetaChange(RE_TAGS, 'Tags', [...cur, t].join(', '));
  $('edTagNew').value = '';
};
let edT;
$('edSource').oninput = () => { clearTimeout(edT); edT = setTimeout(() => { renderEditorPreview(); syncMetaBar(); }, 250); };
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
      : upState.tests === 'falhou' && upState.installed?.sha !== upState.latest.sha ? `Há uma versão nova (${upState.latest.short}), mas ela não passou nos testes automáticos. Ela não será instalada até ser corrigida.`
      : upState.tests === 'rodando' && upState.installed?.sha !== upState.latest.sha ? `Há uma versão nova (${upState.latest.short}) sendo testada agora. Procure de novo em alguns minutos.`
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
  mediaList = (await api('/api/media')).filter((m) => m.type !== 'audio');
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
  teDraft.bg.motion ??= 'none'; teDraft.bg.mcolor ??= '#ffffff'; teDraft.bg.speed ??= 100; teDraft.bg.mint ??= 60;
  if (!$('teMotion').options.length) $('teMotion').innerHTML = MOTIONS.map(([v, n]) => `<option value="${v}">${n}</option>`).join('');
  $('teMotion').value = teDraft.bg.motion;
  document.querySelectorAll('#teForm [data-mo]').forEach((el) => { if (teDraft.bg.motion === 'none' || teDraft.bg.motion === 'zoom') el.hidden = true; else if (!el.dataset.show || el.dataset.show.split(' ').includes(type)) el.hidden = false; });
  document.querySelectorAll('#teForm [data-k]').forEach((i) => { const v = getK(teDraft, i.dataset.k); if (v == null) return; if (i.type === 'checkbox') i.checked = !!v; else if (document.activeElement !== i) i.value = v; });
  document.querySelectorAll('#teForm output').forEach((o) => {
    const v = getK(teDraft, o.dataset.o);
    o.textContent = ['text.size', 'bg.dim', 'bg.speed', 'bg.mint'].includes(o.dataset.o) ? v + '%' : v + 'px';
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
// Baixar versões da internet (catálogo do projeto thiagobodruk/bible)
const FREE_BIBLES = new Set(['pt_tb', 'en_kjv', 'en_asv', 'en_bbe', 'en_darby', 'en_dra', 'en_gnv', 'en_web', 'en_webu', 'en_webbe', 'en_webus', 'en_wmb', 'en_wmbbe', 'en_ylt98', 'en_bsb', 'en_mbsb', 'en_lsv', 'en_fbv', 'en_engrv', 'en_kjvcpb', 'en_wbms', 'en_t4t', 'en_jub', 'es_rv1909', 'es_rvr1909']);
let bcCat = [];
let bcLang = 'pt';
const bcCode = (id) => id.split('_')[1].toUpperCase().slice(0, 16);
async function renderCatalog() {
  if (!bcCat.length) { try { bcCat = await api('/api/bible/catalog'); } catch { bcCat = []; } }
  const have = new Set(versions.map((v) => v.code));
  const q = $('bcQ').value.trim().toLowerCase();
  const list = bcCat.filter((b) => b.lang === bcLang && (!q || (b.name + ' ' + b.id).toLowerCase().includes(q)));
  $('bcList').innerHTML = list.map((b) => {
    const inst = have.has(bcCode(b.id));
    return `<div class="bc-row"><div><b>${esc(b.name)}</b> <span class="muted small">${bcCode(b.id)}</span>${FREE_BIBLES.has(b.id) ? ' <span class="pd">livre</span>' : ''}</div>
      ${inst ? '<span class="bc-ok">✓ instalada</span>' : `<button class="btn sm" data-dl="${esc(b.id)}">Baixar</button>`}</div>`;
  }).join('') || '<div class="empty">Nenhuma versão encontrada</div>';
}
$('bcQ').oninput = renderCatalog;
$('bcLang').onclick = (e) => { const b = e.target.closest('[data-l]'); if (!b) return; bcLang = b.dataset.l; $('bcLang').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); renderCatalog(); };
$('bcList').onclick = async (e) => {
  const b = e.target.closest('[data-dl]');
  if (!b) return;
  const item = bcCat.find((x) => x.id === b.dataset.dl);
  if (!FREE_BIBLES.has(item.id) && !confirm(`“${item.name}” tem direitos autorais da editora.\n\nSó instale se a igreja tiver permissão para projetar essa versão. Continuar?`)) return;
  b.disabled = true; b.textContent = 'Baixando…';
  try {
    const r = await api('/api/bible/download', { method: 'POST', body: { id: item.id } });
    toast(`${item.name}: ${r.verses} versículos instalados`);
    await loadVersions();
    renderCatalog();
  } catch (err) { toast(err.message || 'Não consegui baixar'); b.disabled = false; b.textContent = 'Baixar'; }
};
$('bibleImportBtn').onclick = async () => { await loadVersions(); renderCatalog(); $('bibleImp').showModal(); };
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
initOrganize({ api, cmd, toast, esc, socket, getService: () => service, openService, loadServices, getLive: () => live, renderItems: () => service && renderItems(), BLOCK_COLORS });
initExtras({ api, cmd, toast, esc, socket, getService: () => service, openService, getLive: () => live });
MEDIA = initMedia({ api, cmd, toast, esc, socket, getService: () => service, openService, getLive: () => live, selectItem: (id) => selectItem(id) });
initBibleView({ api, cmd, toast, esc, getLive: () => live, getService: () => service, openService, loadVersions, onState: (fn) => socket.on('state', fn) });
