// Abas Mídia, Apresentações e Avisos · player de vídeo/áudio · arrastar arquivos · QR do pregador
import { sendFiles } from '/shared/uploader.js';

const ICONS = {
  song: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  bible: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M12 7v6M9 10h6"/>',
  text: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 9a4 4 0 0 1 0 6"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  audio: '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  deck: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/>',
  seq: '<rect x="3" y="5" width="8" height="6" rx="1"/><rect x="13" y="5" width="8" height="6" rx="1"/><rect x="3" y="13" width="8" height="6" rx="1"/><path d="m15.5 14.5 3 1.5-3 1.5z"/>',
  play: '<path d="M7 5v14l12-7z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  pin: '<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3zM12 14v6"/>',
};
export const icon = (k, cls = 'ki') => `<svg class="${cls}" viewBox="0 0 24 24">${ICONS[k] || ICONS.text}</svg>`;
const jsonOf = (t) => { try { return JSON.parse(t || '{}'); } catch { return {}; } };
const fmt = (t) => { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
const size = (b) => (b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
const pretty = (m) => m.title || m.name.replace(/-[a-z0-9]{6,}\.\w+$/, '').replace(/\.\w+$/, '').replace(/-/g, ' ');
const when = (t) => { const d = new Date(t); const today = new Date().toDateString() === d.toDateString(); return today ? 'hoje ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR'); };
const TYPE_LABEL = { video: 'Vídeo', image: 'Imagem', audio: 'Áudio' };

export function initMedia(ctx) {
  const { api, cmd, toast, esc, socket, getService, openService, getLive } = ctx;
  const $ = (id) => document.getElementById(id);
  let media = [];
  let decks = [];
  let filter = '';
  let pickMode = 'media';
  let audioItem = null;

  // ---------- Abas ----------
  const PANES = { louvores: 'songsPane', biblia: 'bibleSrcPane', cartazes: 'postersPane', midia: 'mediaPane', apresentacoes: 'decksPane', avisos: 'avisosPane' };
  function showTab(t) {
    Object.entries(PANES).forEach(([k, id]) => ($(id).hidden = k !== t));
    if (t === 'midia') loadMedia();
    if (t === 'cartazes') loadPosters();
    if (t === 'apresentacoes' || t === 'avisos') loadDecks();
  }
  window.addEventListener('libtab', (e) => showTab(e.detail));

  // ---------- Itens do culto: ícone e subtítulo ----------
  function itemKind(it) {
    if (it.kind === 'media') return jsonOf(it.text).type || 'video';
    return it.kind;
  }
  function itemSub(it) {
    const j = jsonOf(it.text);
    if (it.kind === 'media') return TYPE_LABEL[j.type] || 'Mídia';
    if (it.kind === 'deck') return 'Apresentação' + (j.count ? ` · ${j.count} slides` : '');
    if (it.kind === 'seq') { const v = (j.items || []).filter((x) => x.type === 'video').length; const n = (j.items || []).length; return `Sequência · ${n} ${n === 1 ? 'item' : 'itens'}${v ? ` (${v} vídeo${v > 1 ? 's' : ''})` : ''}`; }
    return null;
  }

  // ---------- Biblioteca de mídia ----------
  async function loadMedia() {
    media = await api('/api/media');
    renderMedia();
  }
  function renderMedia() {
    const q = $('mediaSearch').value.trim().toLowerCase();
    const list = media.filter((m) => (!filter || m.type === filter) && (!q || m.name.toLowerCase().includes(q)));
    $('mediaList').innerHTML = list.length
      ? list.map((m) => `<div class="mrow" draggable="true" data-n="${esc(m.name)}" title="Arraste para o telão">
          <div class="mth">${m.type === 'video' ? `<video src="${esc(m.url)}#t=1" muted preload="metadata"></video>` : m.type === 'image' ? `<img src="${esc(m.url)}" loading="lazy" alt="">` : icon('audio')}</div>
          <div class="info"><div class="t">${esc(pretty(m))}</div><div class="a">${TYPE_LABEL[m.type]} · ${size(m.size)} · ${when(m.mtime)}</div></div>
          <button class="mini" data-act="show" title="Mostrar agora no telão">${icon('play')}</button>
          ${m.type !== 'audio' ? `<button class="mini" data-act="poster" title="Usar como cartaz">${icon('pin')}</button>` : ''}
          <button class="mini" data-act="add" title="Adicionar ao culto">${icon('plus')}</button>
          <button class="mini danger" data-act="del" title="Excluir">${icon('trash')}</button></div>`).join('')
      : `<div class="empty">${media.length ? 'Nada encontrado' : 'Arraste vídeos, imagens ou músicas para cá'}</div>`;
  }
  $('mediaFilter').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    filter = b.dataset.f;
    $('mediaFilter').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    renderMedia();
  };
  $('mediaSearch').oninput = renderMedia;
  $('mediaList').onclick = async (e) => {
    const row = e.target.closest('.mrow');
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!row || !act) return;
    const m = media.find((x) => x.name === row.dataset.n);
    const title = pretty(m);
    if (act === 'show') cmd({ type: 'media', url: m.url, mtype: m.type, name: title });
    if (act === 'poster') { await api('/api/posters', { method: 'POST', body: { names: [m.name] } }); toast('Adicionado aos Cartazes'); }
    if (act === 'add') {
      const svc = getService();
      if (!svc) return toast('Abra um culto primeiro');
      await api(`/api/services/${svc.id}/items`, { method: 'POST', body: { kind: 'media', title, text: JSON.stringify({ type: m.type, url: m.url, name: title, after: m.type === 'video' ? 'tema' : 'stop' }) } });
      await openService(svc.id);
      toast('Adicionado ao culto');
    }
    if (act === 'del' && confirm(`Excluir "${title}"?`)) {
      await api('/api/media/' + encodeURIComponent(m.name), { method: 'DELETE' });
      loadMedia();
    }
  };

  // ---------- Apresentações e carrosséis ----------
  async function loadDecks() {
    decks = await api('/api/decks');
    const row = (d) => `<div class="mrow" draggable="true" data-id="${d.id}" title="Arraste para o telão">
        <div class="mth wide"><img src="${esc(d.thumb)}" loading="lazy" alt=""></div>
        <div class="info"><div class="t">${esc(d.title)}</div><div class="a">${d.author ? esc(d.author) + ' · ' : ''}${d.count} slide${d.count > 1 ? 's' : ''}${d.auto ? ` · ${d.auto} s${d.loop ? ' · repete' : ''}` : ''}</div></div>
        <button class="mini" data-act="show" title="Apresentar agora">${icon('play')}</button>
        <button class="mini" data-act="add" title="Adicionar ao culto">${icon('plus')}</button>
        <button class="mini" data-act="edit" title="Renomear">${icon('edit')}</button>
        <button class="mini danger" data-act="del" title="Excluir">${icon('trash')}</button></div>`;
    const pres = decks.filter((d) => !d.auto);
    const cars = decks.filter((d) => d.auto);
    $('deckList').innerHTML = pres.length ? pres.map(row).join('') : '<div class="empty">Arraste um PowerPoint ou PDF para cá, ou use “Receber do pregador”.</div>';
    $('avList').innerHTML = cars.length ? '<div class="sub-h">Carrosséis</div>' + cars.map(row).join('') : '';
  }
  async function deckAction(e) {
    const row = e.target.closest('.mrow');
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!row || !act) return;
    const d = decks.find((x) => x.id === row.dataset.id);
    if (act === 'show') cmd({ type: 'deck', id: d.id });
    if (act === 'add') {
      const svc = getService();
      if (!svc) return toast('Abra um culto primeiro');
      await api(`/api/services/${svc.id}/items`, { method: 'POST', body: { kind: 'deck', title: d.title + (d.author ? ' · ' + d.author : ''), text: JSON.stringify({ deck: d.id, count: d.count }) } });
      await openService(svc.id);
      toast('Adicionado ao culto');
    }
    if (act === 'edit') {
      const t = prompt('Nome da apresentação', d.title);
      if (t == null) return;
      const body = { title: t.trim() || d.title };
      if (d.auto) {
        const s = prompt('Segundos por imagem', d.auto);
        if (s != null && +s > 0) body.auto = +s;
      }
      await api('/api/decks/' + d.id, { method: 'PUT', body });
      loadDecks();
    }
    if (act === 'del' && confirm(`Excluir "${d.title}"?`)) {
      await api('/api/decks/' + d.id, { method: 'DELETE' });
      loadDecks();
    }
  }
  $('deckList').onclick = deckAction;
  $('avList').onclick = deckAction;
  $('avTextBtn').onclick = () => $('addTextBtn').click();

  // ---------- Enviar arquivos (botões, arrastar e soltar) ----------
  const ACCEPT = {
    media: 'video/*,image/*,audio/*,.mp3,.m4a,.wav,.opus,.ogg',
    deck: '.pptx,.ppt,.ppsx,.pps,.pdf,image/*',
    audio: 'audio/*,.mp3,.m4a,.wav,.aac,.ogg',
    poster: 'image/*,video/*',
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    pickMode = b.dataset.pick;
    $('fileIn').accept = ACCEPT[pickMode];
    $('fileIn').click();
  });
  $('fileIn').onchange = async () => {
    const files = [...$('fileIn').files];
    $('fileIn').value = '';
    if (!files.length) return;
    if (pickMode === 'audio') return uploadAudioForItem(files[0]);
    if (pickMode === 'poster') return uploadPosters(files);
    // pelo botão da biblioteca: só guarda na biblioteca (não põe no culto); fotos em Apresentações viram slides
    await upload(files, { toService: false, asDeck: pickMode === 'deck' });
    if (!$('carDlg').hidden && $('carDlg').open) renderCarGrid();
  };
  async function upload(files, { toService = true, asDeck = false } = {}) {
    const svc = getService();
    const bar = $('toast');
    const res = await sendFiles(files, {
      serviceId: toService && svc ? svc.id : '',
      asDeck,
      status: (t) => { bar.textContent = t; bar.classList.add('on'); },
    });
    const okN = res.filter((r) => r.ok).length;
    const bad = res.filter((r) => !r.ok);
    toast(bad.length ? `${okN} enviado(s) · erro em ${bad[0].name}: ${bad[0].error}` : `${okN} arquivo(s) ${toService && svc ? 'adicionado(s) ao culto' : 'enviado(s)'}`);
    if (svc && toService) openService(svc.id);
    loadMedia();
    loadDecks();
    return res;
  }
  // Arrastar (do computador, WhatsApp, Telegram) ou colar (Ctrl+V).
  // Na aba Mídia vai só para a biblioteca; no resto da tela entra também no culto.
  let dragDepth = 0;
  const inMediaTab = () => !$('mediaPane').hidden || $('mediaBig').open;
  const otherDialog = () => [...document.querySelectorAll('dialog[open]')].some((d) => d.id !== 'mediaBig');
  const accepts = (dt) => { const t = [...(dt?.types || [])]; return t.includes('Files') || t.includes('text/uri-list'); };
  let internal = false; // arrasto que começou dentro do próprio painel (reordenar, miniaturas)
  window.addEventListener('dragstart', () => (internal = true));
  window.addEventListener('dragend', () => (internal = false));
  const isDrop = (e) => !internal && accepts(e.dataTransfer) && !otherDialog();
  function dropText() {
    const lib = inMediaTab();
    $('dropOv').querySelector('b').textContent = lib ? 'Solte para guardar na Mídia' : 'Solte para adicionar ao culto';
  }
  window.addEventListener('dragenter', (e) => { if (!isDrop(e)) return; dragDepth++; dropText(); $('dropOv').hidden = false; });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropOv').hidden = true; } });
  window.addEventListener('dragover', (e) => { if (isDrop(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    if (!isDrop(e)) return;
    e.preventDefault();
    dragDepth = 0;
    $('dropOv').hidden = true;
    receive(e.dataTransfer);
  });
  window.addEventListener('paste', (e) => {
    const t = e.target;
    if (t.closest?.('input, textarea, [contenteditable]') || otherDialog()) return;
    const files = [...(e.clipboardData?.files || [])];
    const text = (e.clipboardData?.getData('text') || '').trim();
    if (!files.length && !/^https?:\/\/\S+\.(mp4|webm|mov|jpe?g|png|webp|gif|mp3|m4a|ogg|opus)(\?\S*)?$/i.test(text)) return;
    e.preventDefault();
    receive(e.clipboardData);
  });
  async function receive(dt) {
    const toService = !inMediaTab();
    if (toService && !getService()) return toast('Abra um culto primeiro');
    // arquivos colados sem nome (ex.: imagem copiada) ganham um nome
    const files = [...(dt.files || [])].map((f) => (f.name && f.name !== 'image.png' ? f : new File([f], `colado-${Date.now().toString(36)}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('quicktime', 'mov')}`, { type: f.type })));
    if (files.length) return upload(files, { toService });
    const url = (dt.getData('text/uri-list') || dt.getData('text') || '').split('\n').find((l) => /^https?:/i.test(l.trim()));
    if (!url) return toast(/^blob:/.test(dt.getData('text/uri-list') || '') ? 'Esse arquivo não pode ser arrastado do navegador. Salve no computador e arraste de lá.' : 'Não encontrei um arquivo para adicionar');
    toast('Baixando…');
    try {
      const svc = getService();
      await api('/api/media/url', { method: 'POST', body: { url: url.trim(), service_id: toService && svc ? svc.id : '' } });
      toast(toService ? 'Adicionado ao culto' : 'Guardado na Mídia');
      if (toService && svc) openService(svc.id);
      loadMedia();
    } catch (err) {
      toast(err.message);
    }
  }

  // ---------- QR do pregador ----------
  $('qrBtn').onclick = async () => {
    const svc = getService();
    if (!svc) return toast('Abra um culto primeiro');
    const r = await api('/api/qr?path=' + encodeURIComponent('/enviar.html?s=' + svc.id));
    $('qrImg').src = r.qr;
    $('qrUrl').textContent = r.url;
    $('qrCulto').textContent = '“' + svc.title + '”';
    $('qrDlg').showModal();
  };
  $('qrClose').onclick = () => $('qrDlg').close();
  socket.on('service-changed', async ({ id }) => {
    const svc = getService();
    if (svc?.id === id) { await openService(id); toast('Arquivo recebido no culto'); }
  });
  socket.on('library', () => { if (!$('mediaPane').hidden) loadMedia(); if (!$('decksPane').hidden || !$('avisosPane').hidden) loadDecks(); });

  // ---------- Carrossel de imagens ----------
  let carSel = [];
  async function renderCarGrid() {
    media = await api('/api/media');
    const imgs = media.filter((m) => m.type === 'image');
    $('carGrid').innerHTML = imgs.length
      ? imgs.map((m) => { const k = carSel.indexOf(m.name); return `<div class="car-it ${k >= 0 ? 'on' : ''}" data-n="${esc(m.name)}"><img src="${esc(m.url)}" loading="lazy" alt="">${k >= 0 ? `<b>${k + 1}</b>` : ''}</div>`; }).join('')
      : '<div class="empty">Envie as imagens dos avisos primeiro (botão “+ Enviar imagens”).</div>';
  }
  $('avCarBtn').onclick = async () => { carSel = []; await renderCarGrid(); $('carDlg').showModal(); };
  $('carCancel').onclick = () => $('carDlg').close();
  $('carGrid').onclick = (e) => {
    const it = e.target.closest('.car-it');
    if (!it) return;
    const n = it.dataset.n;
    const k = carSel.indexOf(n);
    if (k >= 0) carSel.splice(k, 1);
    else carSel.push(n);
    renderCarGrid();
  };
  $('carGo').onclick = async () => {
    if (!carSel.length) return toast('Escolha pelo menos uma imagem');
    const svc = getService();
    await api('/api/decks/from-media', { method: 'POST', body: { names: carSel, title: $('carTitle').value.trim() || 'Avisos', auto: +$('carSecs').value || 8, loop: $('carLoop').checked, service_id: svc?.id } });
    $('carDlg').close();
    if (svc) await openService(svc.id);
    loadDecks();
    toast('Carrossel criado' + (svc ? ' e adicionado ao culto' : ''));
  };

  // ---------- Playback ligado a um louvor do culto ----------
  async function openAudioFor(item) {
    audioItem = item;
    media = await api('/api/media');
    const cur = jsonOf(item.text).audio;
    const auds = media.filter((m) => m.type === 'audio');
    $('audList').innerHTML = auds.length
      ? auds.map((m) => `<div class="mrow ${m.url === cur ? 'on' : ''}" data-url="${esc(m.url)}"><div class="mth">${icon('audio')}</div><div class="info"><div class="t">${esc(m.name.replace(/-[a-z0-9]{6,}\.\w+$/, '').replace(/-/g, ' '))}</div><div class="a">${size(m.size)}</div></div>${m.url === cur ? '<span class="badge">em uso</span>' : ''}</div>`).join('')
      : '<div class="empty">Nenhum áudio ainda. Envie o playback (mp3).</div>';
    $('audRemove').hidden = !cur;
    if (!$('audioDlg').open) $('audioDlg').showModal();
  }
  async function setAudio(url) {
    const j = jsonOf(audioItem.text);
    if (url) j.audio = url;
    else delete j.audio;
    await api('/api/items/' + audioItem.id, { method: 'PUT', body: { text: JSON.stringify(j), title: audioItem.title || '' } });
    await openService(getService().id);
    $('audioDlg').close();
    toast(url ? 'Playback ligado ao louvor' : 'Playback removido');
  }
  async function uploadAudioForItem(file) {
    const res = await sendFiles([file], { status: (t) => toast(t) });
    if (!res[0]?.ok) return toast('Erro: ' + (res[0]?.error || 'envio'));
    media = await api('/api/media');
    const m = media.filter((x) => x.type === 'audio').sort((a, b) => b.name.localeCompare(a.name)).find((x) => x.name.startsWith(file.name.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-]+/g, '-').slice(0, 40)));
    if (m) setAudio(m.url);
    else openAudioFor(audioItem);
  }
  $('audList').onclick = (e) => { const r = e.target.closest('.mrow'); if (r) setAudio(r.dataset.url); };
  $('audRemove').onclick = () => setAudio(null);
  $('audClose').onclick = () => $('audioDlg').close();

  // ---------- Item selecionado: slides da apresentação / mídia ----------
  async function renderSelected(item) {
    const j = jsonOf(item.text);
    if (item.kind === 'seq') {
      $('slideGrid').innerHTML = (j.items || []).map((m, i) => `<div class="slide thumb" data-i="${i}">${m.type === 'video' ? `<video src="${esc(m.url)}#t=1" muted preload="metadata"></video><span class="mb-play">${icon('play')}</span>` : `<img src="${esc(m.url)}" loading="lazy" alt="">`}<span class="num">${i + 1}${m.type === 'video' ? ' · vídeo' : ''}</span></div>`).join('') || '<div class="empty">Sequência vazia</div>';
      return;
    }
    if (item.kind === 'deck') {
      const d = await api('/api/decks/' + j.deck);
      if (!d) { $('slideGrid').innerHTML = '<div class="empty">Apresentação não encontrada</div>'; return; }
      $('slideGrid').innerHTML = d.urls.map((u, i) => `<div class="slide thumb" data-i="${i}"><img src="${esc(u)}" loading="lazy" alt=""><span class="num">${i + 1}</span></div>`).join('');
    } else {
      $('slideGrid').innerHTML = `<div class="slide thumb big" data-i="0">${j.type === 'video' ? `<video src="${esc(j.url)}#t=1" muted preload="metadata"></video>` : j.type === 'image' ? `<img src="${esc(j.url)}" alt="">` : `<div class="aud-ph">${icon('audio')}<span>${esc(item.title)}</span></div>`}<span class="num">${TYPE_LABEL[j.type] || ''}</span></div>
        <div class="media-hint">Clique para ${j.type === 'image' ? 'mostrar' : 'tocar'} no telão. O controle aparece embaixo do telão.</div>`;
    }
  }

  // ---------- Player (vídeo e áudio), no estilo do player do Windows ----------
  let seeking = false;
  let lastVol = 1;
  let dur = 0;
  function renderPlayer(s) {
    const p = s.player;
    // só mostra o player se o vídeo/áudio é do que está no ar (ou se está tocando)
    const onAir = p && ((p.itemId && p.itemId === s.itemId && (s.kind !== 'seq' || s.slide?.url === p.url)) || (s.kind === 'media' && s.slide?.url === p.url));
    const show = !!p && (p.status === 'playing' || onAir);
    $('playerBar').hidden = !show;
    if (!show) return;
    $('playerBar').classList.toggle('playing', p.status === 'playing');
    $('playerBar').classList.toggle('is-audio', p.type === 'audio');
    $('plName').textContent = (p.type === 'audio' && p.name === 'Playback' ? 'Playback · ' + s.title : p.name) || '';
    if (document.activeElement !== $('plVol')) $('plVol').value = p.volume ?? 1;
    $('playerBar').classList.toggle('muted', (p.volume ?? 1) === 0);
    $('plAfter').value = p.after || 'tema';
    $('plAfter').querySelector('[value="next"]').hidden = !p.itemId;
    $('plRate').value = String(p.rate || 1);
    if (p.status === 'stopped') { $('plSeek').value = 0; $('plCur').textContent = '0:00'; }
  }
  socket.on('player-time', ({ t, d }) => {
    if (seeking) return;
    dur = d || dur;
    $('plSeek').max = dur || 100;
    $('plSeek').value = t;
    $('plCur').textContent = fmt(t);
    $('plDur').textContent = fmt(dur);
    $('plSeek').style.setProperty('--pct', dur ? (t / dur) * 100 + '%' : '0%');
  });
  socket.on('player-blocked', () => toast('O navegador bloqueou o som: clique uma vez na janela do telão para liberar'));
  const pc = (action, value) => cmd({ type: 'player', action, value });
  $('plToggle').onclick = () => pc(getLive()?.player?.status === 'stopped' ? 'restart' : 'toggle');
  $('plRestart').onclick = () => pc('restart');
  $('plStop').onclick = () => pc('stop');
  $('plBack').onclick = () => pc('skip', -10);
  $('plFwd').onclick = () => pc('skip', 10);
  $('plPrevItem').onclick = () => cmd({ type: 'prev' });
  $('plNextItem').onclick = () => cmd({ type: 'next' });
  $('plSeek').oninput = () => { seeking = true; $('plCur').textContent = fmt(+$('plSeek').value); $('plSeek').style.setProperty('--pct', dur ? (+$('plSeek').value / dur) * 100 + '%' : '0%'); };
  $('plSeek').onchange = () => { pc('seek', +$('plSeek').value); setTimeout(() => (seeking = false), 600); };
  // mostra o tempo onde o mouse está na linha do tempo
  $('plSeek').addEventListener('mousemove', (e) => {
    if (!dur) return;
    const r = e.target.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    $('plTip').hidden = false;
    $('plTip').textContent = fmt(x * dur);
    $('plTip').style.left = x * 100 + '%';
  });
  $('plSeek').addEventListener('mouseleave', () => ($('plTip').hidden = true));
  $('plVol').oninput = () => pc('volume', +$('plVol').value);
  $('plMute').onclick = () => {
    const v = getLive()?.player?.volume ?? 1;
    if (v > 0) { lastVol = v; pc('volume', 0); } else pc('volume', lastVol || 1);
  };
  $('plRate').onchange = () => pc('rate', +$('plRate').value);
  $('plAfter').onchange = () => pc('after', $('plAfter').value);
  // P = tocar/pausar quando tem vídeo ou áudio
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, dialog[open]') || e.ctrlKey || e.metaKey) return;
    if ((e.key === 'p' || e.key === 'P') && getLive()?.player) $('plToggle').click();
  });

  // ---------- Biblioteca grande (Expandir) ----------
  let mbFilter = '';
  let mbSel = null;
  let selMode = false;
  let picked = []; // nomes na ordem em que foram clicados
  function updSel() {
    $('mbSelBar').hidden = !selMode;
    $('mbSelMode').classList.toggle('on', selMode);
    $('mbSelMode').textContent = selMode ? 'Sair da seleção' : 'Selecionar';
    $('mbSelCount').textContent = picked.length + (picked.length === 1 ? ' selecionado' : ' selecionados');
    $('mbDelSel').disabled = $('mbSeq').disabled = !picked.length;
  }
  const visibleList = () => {
    const q = $('mbSearch').value.trim().toLowerCase();
    return media.filter((m) => (!mbFilter || m.type === mbFilter) && (!q || pretty(m).toLowerCase().includes(q)));
  };
  async function openBig() {
    media = await api('/api/media');
    renderBig();
    $('mediaBig').showModal();
  }
  function renderBig() {
    const q = $('mbSearch').value.trim().toLowerCase();
    const sort = $('mbSort').value;
    let list = visibleList();
    list = list.sort((a, b) => sort === 'old' ? a.mtime - b.mtime : sort === 'name' ? pretty(a).localeCompare(pretty(b)) : sort === 'size' ? b.size - a.size : b.mtime - a.mtime);
    $('mbGrid').innerHTML = list.length
      ? list.map((m) => { const k = picked.indexOf(m.name); return `<div class="mb-card ${mbSel === m.name && !selMode ? 'on' : ''} ${k >= 0 ? 'picked' : ''} ${selMode ? 'sel-mode' : ''}" draggable="true" data-n="${esc(m.name)}">
          <span class="mb-check" title="Selecionar">${k >= 0 ? k + 1 : ''}</span>
          <div class="mb-th">${m.type === 'video' ? `<video src="${esc(m.url)}#t=1" muted preload="metadata"></video><span class="mb-play">${icon('play')}</span>` : m.type === 'image' ? `<img src="${esc(m.url)}" loading="lazy" alt="">` : `<div class="mb-aud">${icon('audio')}</div>`}<span class="mb-type">${TYPE_LABEL[m.type]}</span></div>
          <div class="mb-t">${esc(pretty(m))}</div><div class="mb-a">${size(m.size)} · ${when(m.mtime)}</div></div>`; }).join('')
      : '<div class="empty">Nada por aqui. Arraste arquivos ou clique em “+ Enviar”.</div>';
    renderSide();
  }
  function renderSide() {
    const m = media.find((x) => x.name === mbSel);
    if (!m) { $('mbSide').innerHTML = '<div class="empty">Clique numa mídia para ver aqui</div>'; return; }
    $('mbSide').innerHTML = `<div class="mb-pv">${m.type === 'video' ? `<video src="${esc(m.url)}#t=0.5" controls preload="metadata"></video>` : m.type === 'image' ? `<img src="${esc(m.url)}" alt="">` : `<div class="mb-aud big">${icon('audio')}</div><audio src="${esc(m.url)}" controls></audio>`}</div>
      <div class="mb-info"><b>${esc(pretty(m))}</b><span>${TYPE_LABEL[m.type]} · ${size(m.size)} · enviado ${when(m.mtime)}</span></div>
      <div class="mb-acts">
        <button class="btn primary" data-b="show">${icon('play')} Mostrar no telão</button>
        <button class="btn" data-b="add">${icon('plus')} Adicionar ao culto</button>
        <button class="btn" data-b="ren">${icon('edit')} Renomear</button>
        <button class="btn danger" data-b="del">${icon('trash')} Excluir</button>
      </div>`;
  }
  $('mediaExpand').onclick = openBig;
  $('mbClose').onclick = () => { $('mbSide').querySelectorAll('video,audio').forEach((v) => v.pause()); $('mediaBig').close(); loadMedia(); };
  $('mbFilter').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; mbFilter = b.dataset.f; $('mbFilter').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); renderBig(); };
  $('mbSearch').oninput = renderBig;
  $('mbSort').onchange = renderBig;
  $('mbGrid').onclick = (e) => {
    const c = e.target.closest('.mb-card');
    if (!c) return;
    if (selMode || e.target.closest('.mb-check')) {
      if (!selMode) { selMode = true; }
      const n = c.dataset.n;
      const k = picked.indexOf(n);
      if (k >= 0) picked.splice(k, 1); else picked.push(n);
      updSel();
      return renderBig();
    }
    mbSel = c.dataset.n;
    renderBig();
  };
  $('mbSelMode').onclick = () => { selMode = !selMode; if (!selMode) picked = []; updSel(); renderBig(); };
  $('mbSelAll').onclick = () => { visibleList().forEach((m) => { if (!picked.includes(m.name)) picked.push(m.name); }); updSel(); renderBig(); };
  $('mbSelNone').onclick = () => { picked = []; updSel(); renderBig(); };
  $('mbDelSel').onclick = async () => {
    if (!picked.length || !confirm(`Excluir ${picked.length} arquivo(s)? Não dá para desfazer.`)) return;
    for (const n of picked) await api('/api/media/' + encodeURIComponent(n), { method: 'DELETE' });
    toast(picked.length + ' arquivo(s) excluído(s)');
    picked = [];
    mbSel = null;
    media = await api('/api/media');
    updSel();
    renderBig();
    loadMedia();
  };
  // Sequência: várias imagens e vídeos, na ordem clicada, como um item só do culto
  $('mbSeq').onclick = async () => {
    const svc = getService();
    if (!svc) return toast('Abra um culto primeiro');
    const items = picked.map((n) => media.find((m) => m.name === n)).filter((m) => m && m.type !== 'audio').map((m) => ({ url: m.url, type: m.type, name: pretty(m) }));
    if (!items.length) return toast('Escolha imagens ou vídeos');
    const title = prompt('Nome da sequência (ex.: Imagens do Pr. João):', 'Imagens da pregação');
    if (title == null) return;
    await api(`/api/services/${svc.id}/items`, { method: 'POST', body: { kind: 'seq', title: title.trim() || 'Sequência', text: JSON.stringify({ items }) } });
    await openService(svc.id);
    picked = [];
    selMode = false;
    updSel();
    $('mediaBig').close();
    toast(`Sequência com ${items.length} itens adicionada ao culto. Use → para passar; vídeo entra pausado.`);
  };
  $('mbGrid').ondblclick = (e) => { const c = e.target.closest('.mb-card'); if (c) $('mbSide').querySelector('[data-b="show"]')?.click(); };
  $('mbSide').onclick = async (e) => {
    const b = e.target.closest('[data-b]')?.dataset.b;
    const m = media.find((x) => x.name === mbSel);
    if (!b || !m) return;
    if (b === 'show') { cmd({ type: 'media', url: m.url, mtype: m.type, name: pretty(m) }); toast(m.type === 'image' ? 'No telão' : 'No telão, pausado: aperte play no player'); }
    if (b === 'add') {
      const svc = getService();
      if (!svc) return toast('Abra um culto primeiro');
      await api(`/api/services/${svc.id}/items`, { method: 'POST', body: { kind: 'media', title: pretty(m), text: JSON.stringify({ type: m.type, url: m.url, name: pretty(m), after: m.type === 'video' ? 'tema' : 'stop' }) } });
      await openService(svc.id);
      toast('Adicionado ao culto');
    }
    if (b === 'ren') {
      const t = prompt('Nome da mídia:', pretty(m));
      if (t == null) return;
      await api('/api/media/' + encodeURIComponent(m.name), { method: 'PUT', body: { title: t } });
      media = await api('/api/media');
      renderBig();
    }
    if (b === 'del' && confirm(`Excluir "${pretty(m)}"?`)) {
      await api('/api/media/' + encodeURIComponent(m.name), { method: 'DELETE' });
      mbSel = null;
      media = await api('/api/media');
      renderBig();
    }
  };
  socket.on('library', () => { if ($('mediaBig').open) api('/api/media').then((l) => { media = l; renderBig(); }); });

  // ---------- Arrastar para o telão (ou para o monitor "Preparado" quando congelado) ----------
  const DT = 'application/x-projecao';
  document.addEventListener('dragstart', (e) => {
    const r = e.target.closest?.('#posterList .pst, #mediaList .mrow, #mbGrid .mb-card, #deckList .mrow, #avList .mrow, #songList .song, #bsList .bs-hit, #itemList .item:not(.block)');
    if (!r) return;
    let payload;
    if (r.matches('.song')) payload = { kind: 'song', id: +r.dataset.id };
    else if (r.matches('.bs-hit')) payload = { kind: 'bible', book: +r.dataset.b, chapter: +r.dataset.c, verse: +r.dataset.v };
    else if (r.matches('.item')) payload = { kind: 'item', id: +r.dataset.id };
    else if (r.dataset.n) {
      const m = media.find((x) => x.name === r.dataset.n) || posters.find((x) => x.name === r.dataset.n);
      if (!m) return;
      payload = { kind: 'media', url: m.url, mtype: m.type, name: pretty(m) };
    } else {
      const d = decks.find((x) => x.id === r.dataset.id);
      payload = { kind: 'deck', id: r.dataset.id, title: d ? d.title + (d.author ? ' · ' + d.author : '') : '', count: d?.count };
    }
    e.dataTransfer.setData(DT, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copyMove';
    document.body.classList.add('dragging-media');
    if ($('mediaBig').open) setTimeout(() => $('mediaBig').close(), 0); // fecha a biblioteca grande para ver o telão
  });
  document.addEventListener('dragend', () => document.body.classList.remove('dragging-media'));
  const show = (p) => {
    if (p.kind === 'deck') return cmd({ type: 'deck', id: p.id });
    if (p.kind === 'song') return cmd({ type: 'song', id: p.id });
    if (p.kind === 'bible') return cmd({ type: 'bible', book: p.book, chapter: p.chapter, verse: p.verse });
    if (p.kind === 'item') return cmd({ type: 'item', id: p.id, index: 0 });
    cmd({ type: 'media', url: p.url, mtype: p.mtype, name: p.name });
  };
  document.querySelectorAll('.pv-drop').forEach((z) => {
    z.addEventListener('dragover', (e) => {
      const t = [...e.dataTransfer.types];
      if (!t.includes(DT) && !t.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      z.classList.add('over');
      document.body.classList.add('drop-pv');
    });
    z.addEventListener('dragleave', () => { z.classList.remove('over'); document.body.classList.remove('drop-pv'); });
    z.addEventListener('drop', async (e) => {
      z.classList.remove('over');
      document.body.classList.remove('drop-pv', 'dragging-media');
      const raw = e.dataTransfer.getData(DT);
      const files = [...e.dataTransfer.files];
      if (!raw && !files.length) return;
      e.preventDefault();
      e.stopPropagation();
      $('dropOv').hidden = true;
      // no monitor "No telão" com o telão congelado: solta direto no telão
      const goLive = z.dataset.drop === 'live' && getLive()?.frozen;
      if (raw) show(JSON.parse(raw));
      else {
        const res = await upload(files, { toService: false });
        const first = res.find((r) => r.ok && r.url);
        if (first) show({ kind: 'media', url: first.url, mtype: first.type, name: first.title });
        else if (res.find((r) => r.ok && r.kind === 'deck')) { const d = (await api('/api/decks'))[0]; if (d) show({ kind: 'deck', id: d.id }); }
      }
      if (goLive) setTimeout(() => cmd({ type: 'freeze', value: false }), 150);
      const frozen = getLive()?.frozen && !goLive;
      toast(frozen ? 'Preparado. Aperte “Jogar no telão” quando for a hora.' : 'No telão' + (raw && JSON.parse(raw).mtype === 'video' ? ' (pausado: aperte ▶)' : ''));
      document.body.classList.remove('dragging-media');
    });
  });

  // ---------- Cartazes (tela base fixa) ----------
  let posters = [];
  async function loadPosters() {
    posters = await api('/api/posters');
    renderPosters();
  }
  function renderPosters() {
    const base = getLive()?.base;
    $('posterList').innerHTML = posters.length
      ? posters.map((m) => {
        const fixed = base?.url === m.url;
        return `<div class="pst ${fixed ? 'fixed' : ''}" draggable="true" data-n="${esc(m.name)}" title="Clique: fixar e mostrar no telão">
          <div class="pst-th">${m.type === 'video' ? `<video src="${esc(m.url)}#t=1" muted preload="metadata"></video><span class="pst-motion">motion</span>` : `<img src="${esc(m.url)}" loading="lazy" alt="">`}${fixed ? '<span class="pst-fix">FIXO</span>' : ''}</div>
          <div class="pst-t">${esc(pretty(m))}</div>
          <div class="pst-acts"><button data-pa="pin" title="Fixar sem mostrar agora">Fixar</button><button data-pa="del" title="Tirar dos cartazes (o arquivo continua na Mídia)">✕</button></div></div>`;
      }).join('')
      : '<div class="empty">Envie as artes do evento (cartaz do congresso, do pregador) ou motions em vídeo. Também dá para arrastar aqui.</div>';
  }
  $('posterList').onclick = async (e) => {
    const c = e.target.closest('.pst');
    if (!c) return;
    const m = posters.find((x) => x.name === c.dataset.n);
    const pa = e.target.closest('[data-pa]')?.dataset.pa;
    if (pa === 'del') { await api('/api/posters/' + encodeURIComponent(m.name), { method: 'DELETE' }); if (getLive()?.base?.url === m.url) cmd({ type: 'base-set', url: '' }); return loadPosters(); }
    cmd({ type: 'base-set', url: m.url, mtype: m.type, name: pretty(m), show: pa !== 'pin' });
    toast(pa === 'pin' ? 'Cartaz fixado. Aperte Esc para mostrar.' : 'Cartaz fixado e no telão');
  };
  async function uploadPosters(files) {
    const res = await upload(files, { toService: false });
    const names = res.filter((r) => r.ok && r.url).map((r) => decodeURIComponent(r.url.split('/').pop()));
    if (names.length) await api('/api/posters', { method: 'POST', body: { names } });
    loadPosters();
  }
  // arrastar arquivo para a lista de cartazes
  $('posterList').addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.stopPropagation(); } });
  $('posterList').addEventListener('drop', (e) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    e.stopPropagation();
    $('dropOv').hidden = true;
    uploadPosters([...e.dataTransfer.files]);
  });
  // botão Cartaz / Esc
  $('baseBtn').onclick = () => {
    if (!getLive()?.base) {
      document.querySelector('#srcTabs [data-src="cartazes"]')?.click();
      return toast('Escolha um cartaz para fixar');
    }
    cmd({ type: 'base-show' });
  };
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]') || e.target.closest('input, textarea, select')) return;
    $('baseBtn').click();
  });
  socket.on('state', (s) => {
    $('baseBtn').classList.toggle('on', !!s.showBase);
    $('baseBtn').classList.toggle('has', !!s.base);
    $('baseThumb').style.backgroundImage = s.base?.mtype === 'image' ? `url("${s.base.url}")` : '';
    $('baseThumb').classList.toggle('vid', s.base?.mtype === 'video');
    if (!$('postersPane').hidden) renderPosters();
  });

  return { icon, itemKind, itemSub, renderSelected, renderPlayer, openAudioFor, showTab, hasAudio: (it) => !!jsonOf(it.text).audio };
}
