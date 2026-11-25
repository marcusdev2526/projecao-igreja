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
  play: '<path d="M7 5v14l12-7z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
};
export const icon = (k, cls = 'ki') => `<svg class="${cls}" viewBox="0 0 24 24">${ICONS[k] || ICONS.text}</svg>`;
const jsonOf = (t) => { try { return JSON.parse(t || '{}'); } catch { return {}; } };
const fmt = (t) => { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
const size = (b) => (b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
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
  const PANES = { louvores: 'songsPane', midia: 'mediaPane', apresentacoes: 'decksPane', avisos: 'avisosPane' };
  function showTab(t) {
    Object.entries(PANES).forEach(([k, id]) => ($(id).hidden = k !== t));
    if (t === 'midia') loadMedia();
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
      ? list.map((m) => `<div class="mrow" data-n="${esc(m.name)}">
          <div class="mth">${m.type === 'video' ? `<video src="${esc(m.url)}#t=1" muted preload="metadata"></video>` : m.type === 'image' ? `<img src="${esc(m.url)}" loading="lazy" alt="">` : icon('audio')}</div>
          <div class="info"><div class="t">${esc(m.name.replace(/-[a-z0-9]{6,}\.\w+$/, '').replace(/-/g, ' '))}</div><div class="a">${TYPE_LABEL[m.type]} · ${size(m.size)}</div></div>
          <button class="mini" data-act="show" title="Mostrar agora no telão">${icon('play')}</button>
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
    const title = row.querySelector('.t').textContent;
    if (act === 'show') cmd({ type: 'media', url: m.url, mtype: m.type, name: title });
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
    const row = (d) => `<div class="mrow" data-id="${d.id}">
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
    media: 'video/*,image/*,audio/*,.mp3,.m4a,.wav',
    deck: '.pptx,.ppt,.ppsx,.pps,.pdf,image/*',
    audio: 'audio/*,.mp3,.m4a,.wav,.aac,.ogg',
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
  let dragDepth = 0;
  const isFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files') && !document.querySelector('dialog[open]');
  window.addEventListener('dragenter', (e) => { if (!isFiles(e)) return; dragDepth++; $('dropOv').hidden = false; });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropOv').hidden = true; } });
  window.addEventListener('dragover', (e) => { if (isFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    if (!isFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    $('dropOv').hidden = true;
    if (!getService()) return toast('Abra um culto primeiro');
    upload(e.dataTransfer.files, { toService: true });
  });

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
    if (item.kind === 'deck') {
      const d = await api('/api/decks/' + j.deck);
      if (!d) { $('slideGrid').innerHTML = '<div class="empty">Apresentação não encontrada</div>'; return; }
      $('slideGrid').innerHTML = d.urls.map((u, i) => `<div class="slide thumb" data-i="${i}"><img src="${esc(u)}" loading="lazy" alt=""><span class="num">${i + 1}</span></div>`).join('');
    } else {
      $('slideGrid').innerHTML = `<div class="slide thumb big" data-i="0">${j.type === 'video' ? `<video src="${esc(j.url)}#t=1" muted preload="metadata"></video>` : j.type === 'image' ? `<img src="${esc(j.url)}" alt="">` : `<div class="aud-ph">${icon('audio')}<span>${esc(item.title)}</span></div>`}<span class="num">${TYPE_LABEL[j.type] || ''}</span></div>
        <div class="media-hint">Clique para ${j.type === 'image' ? 'mostrar' : 'tocar'} no telão. O controle aparece embaixo do telão.</div>`;
    }
  }

  // ---------- Player (vídeo e áudio) ----------
  let seeking = false;
  function renderPlayer(s) {
    const p = s.player;
    const show = !!p && (p.status !== 'stopped' || (p.itemId && p.itemId === s.itemId));
    $('playerBar').hidden = !show;
    if (!show) return;
    $('playerBar').classList.toggle('playing', p.status === 'playing');
    $('plName').textContent = (p.type === 'audio' && p.name === 'Playback' ? 'Playback · ' + s.title : p.name) || '';
    if (document.activeElement !== $('plVol')) $('plVol').value = p.volume ?? 1;
    $('plAfter').value = p.after || 'tema';
    $('plAfter').querySelector('[value="next"]').hidden = !p.itemId;
    if (p.status === 'stopped') { $('plSeek').value = 0; $('plCur').textContent = '0:00'; }
  }
  socket.on('player-time', ({ t, d }) => {
    if (seeking) return;
    $('plSeek').max = d || 100;
    $('plSeek').value = t;
    $('plCur').textContent = fmt(t);
    $('plDur').textContent = fmt(d);
  });
  socket.on('player-blocked', () => toast('O navegador bloqueou o som: clique uma vez na janela do telão para liberar'));
  $('plToggle').onclick = () => cmd({ type: 'player', action: 'toggle' });
  $('plRestart').onclick = () => cmd({ type: 'player', action: 'restart' });
  $('plStop').onclick = () => cmd({ type: 'player', action: 'stop' });
  $('plSeek').oninput = () => { seeking = true; $('plCur').textContent = fmt(+$('plSeek').value); };
  $('plSeek').onchange = () => { cmd({ type: 'player', action: 'seek', value: +$('plSeek').value }); setTimeout(() => (seeking = false), 600); };
  $('plVol').oninput = () => cmd({ type: 'player', action: 'volume', value: +$('plVol').value });
  $('plAfter').onchange = () => cmd({ type: 'player', action: 'after', value: $('plAfter').value });

  return { icon, itemKind, itemSub, renderSelected, renderPlayer, openAudioFor, showTab, hasAudio: (it) => !!jsonOf(it.text).audio };
}
