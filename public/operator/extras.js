// Busca única (Ctrl+K), atalhos numéricos, ensaio, escala, histórico, pedidos pelo celular,
// tempos do playback e endereço do OBS.
import { refText } from '/shared/bible.js';

export function initExtras(ctx) {
  const { api, cmd, toast, esc, socket, getService, openService, getLive } = ctx;
  const $ = (id) => document.getElementById(id);
  const typing = (e) => e.target.closest('input, textarea, select') || document.querySelector('dialog[open]');

  // ---------- Atalhos numéricos: 1–9 pulam para o slide; R vai para o próximo refrão ----------
  document.addEventListener('keydown', (e) => {
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const s = getLive();
    if (!s?.total) return;
    if (/^[0-9]$/.test(e.key)) {
      const i = e.key === '0' ? 9 : +e.key - 1;
      if (i < s.total) cmd({ type: 'goto', index: i });
    } else if (e.key === 'r' || e.key === 'R') {
      const sl = s.slides || [];
      const n = sl.length;
      for (let k = 1; k <= n; k++) {
        const j = (s.index + k) % n;
        if (sl[j]?.type === 'refrao') return cmd({ type: 'goto', index: j });
      }
    }
  });

  // ---------- Busca única ----------
  let results = [];
  let sel = 0;
  let qT;
  $('palBtn').onclick = openPal;
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openPal(); }
  });
  function openPal() {
    $('palQ').value = '';
    results = [];
    renderPal();
    $('palDlg').showModal();
    setTimeout(() => $('palQ').focus(), 20);
  }
  $('palDlg').addEventListener('click', (e) => { if (e.target === $('palDlg')) $('palDlg').close(); });
  $('palQ').oninput = () => { clearTimeout(qT); qT = setTimeout(search, 160); };
  $('palQ').onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); renderPal(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); renderPal(); }
    else if (e.key === 'Enter' && results[sel]) { e.preventDefault(); act(results[sel], e.shiftKey); }
  };
  $('palList').onclick = (e) => {
    const r = e.target.closest('[data-i]');
    if (!r) return;
    act(results[+r.dataset.i], !!e.target.closest('.pal-add'));
  };
  const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  async function search() {
    const q = $('palQ').value.trim();
    sel = 0;
    if (!q) { results = []; return renderPal(); }
    const nq = norm(q);
    const live = getLive();
    const [songs, bible, media, posters, decks] = await Promise.all([
      api('/api/songs?q=' + encodeURIComponent(q)).catch(() => []),
      api('/api/bible/search?q=' + encodeURIComponent(q) + '&v=' + encodeURIComponent(live?.bibleMain || '')).catch(() => ({})),
      api('/api/media').catch(() => []),
      api('/api/posters').catch(() => []),
      api('/api/decks').catch(() => []),
    ]);
    const out = [];
    const svc = getService();
    (svc?.items || []).filter((it) => it.kind !== 'block' && norm(it.kind === 'song' ? it.song_title : it.title).includes(nq)).slice(0, 4)
      .forEach((it) => out.push({ k: 'item', label: it.kind === 'song' ? it.song_title : it.title, sub: 'No culto', id: it.id }));
    if (bible.ref) out.push({ k: 'bible', label: refText(bible.ref.book, bible.ref.chapter, bible.ref.verse), sub: 'Bíblia', ...bible.ref, verse: bible.ref.verse || 1 });
    songs.slice(0, 6).forEach((s) => out.push({ k: 'song', label: s.title, sub: 'Louvor' + (s.artist ? ' · ' + s.artist : ''), id: s.id }));
    const pn = new Set(posters.map((p) => p.name));
    const title = (m) => m.title || m.name.replace(/-[a-z0-9]{6,}\.\w+$/, '').replace(/\.\w+$/, '').replace(/-/g, ' ');
    posters.filter((m) => norm(title(m)).includes(nq)).slice(0, 3).forEach((m) => out.push({ k: 'poster', label: title(m), sub: 'Cartaz', m }));
    media.filter((m) => !pn.has(m.name) && m.type !== 'audio' && norm(title(m)).includes(nq)).slice(0, 4).forEach((m) => out.push({ k: 'media', label: title(m), sub: m.type === 'video' ? 'Vídeo' : 'Imagem', m }));
    decks.filter((d) => norm(d.title + ' ' + d.author).includes(nq)).slice(0, 3).forEach((d) => out.push({ k: 'deck', label: d.title, sub: 'Apresentação' + (d.author ? ' · ' + d.author : ''), d }));
    (bible.hits || []).slice(0, 5).forEach((h) => out.push({ k: 'bible', label: refText(h.book, h.chapter, h.verse), sub: h.text.slice(0, 90), book: h.book, chapter: h.chapter, verse: h.verse }));
    results = out;
    renderPal();
  }
  function renderPal() {
    const q = $('palQ').value.trim();
    $('palList').innerHTML = results.length
      ? results.map((r, i) => `<div class="pal-row ${i === sel ? 'on' : ''}" data-i="${i}"><span class="pal-k k-${r.k}">${{ item: 'Culto', bible: 'Bíblia', song: 'Louvor', poster: 'Cartaz', media: 'Mídia', deck: 'Slides' }[r.k]}</span><div class="pal-t"><b>${esc(r.label)}</b><span>${esc(r.sub || '')}</span></div>${['song', 'bible', 'media', 'deck', 'poster'].includes(r.k) ? '<button class="pal-add" title="Adicionar ao culto (Shift+Enter)">+ culto</button>' : ''}</div>`).join('')
      : `<div class="pal-empty">${q ? 'Nada encontrado' : 'Digite para buscar em tudo: louvores, Bíblia, cartazes, mídias, apresentações e o culto'}</div>`;
    $('palList').querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }
  async function act(r, add) {
    $('palDlg').close();
    if (add) {
      const svc = getService();
      if (!svc) return toast('Abra um culto primeiro');
      const body = r.k === 'song' ? { kind: 'song', song_id: r.id }
        : r.k === 'bible' ? { kind: 'bible', title: refText(r.book, r.chapter, r.verse), text: JSON.stringify({ book: r.book, chapter: r.chapter, verse: r.verse }) }
        : r.k === 'deck' ? { kind: 'deck', title: r.label, text: JSON.stringify({ deck: r.d.id, count: r.d.count }) }
        : { kind: 'media', title: r.label, text: JSON.stringify({ type: r.m.type, url: r.m.url, name: r.label, after: r.m.type === 'video' ? 'tema' : 'stop' }) };
      await api(`/api/services/${svc.id}/items`, { method: 'POST', body });
      await openService(svc.id);
      return toast('Adicionado ao culto');
    }
    if (r.k === 'item') cmd({ type: 'item', id: r.id, index: 0 });
    else if (r.k === 'song') cmd({ type: 'song', id: r.id });
    else if (r.k === 'bible') cmd({ type: 'bible', book: r.book, chapter: r.chapter, verse: r.verse });
    else if (r.k === 'deck') cmd({ type: 'deck', id: r.d.id });
    else if (r.k === 'poster') cmd({ type: 'base-set', url: r.m.url, mtype: r.m.type, name: r.label, show: true });
    else cmd({ type: 'media', url: r.m.url, mtype: r.m.type, name: r.label });
  }

  // ---------- Ensaio ----------
  $('rehBtn').onclick = () => {
    const on = !getLive()?.rehearsal;
    cmd({ type: 'rehearsal', value: on });
    toast(on ? 'Ensaio: o telão ficou parado. Passe o culto à vontade; o retorno acompanha.' : 'Ensaio encerrado. O telão continua congelado: aperte “Jogar no telão” quando quiser.');
  };

  // ---------- Escala ----------
  let scale = {};
  async function loadScale() {
    const svc = getService();
    if (!svc) return;
    scale = await api(`/api/services/${svc.id}/scale`).catch(() => ({}));
    const parts = [scale.dirigente && 'Dirigente: ' + scale.dirigente, scale.pregador && 'Pregador: ' + scale.pregador, scale.louvor && 'Louvor: ' + scale.louvor].filter(Boolean);
    $('svcScale').textContent = parts.join(' · ');
    $('svcScale').title = parts.join('\n');
  }
  $('scaleBtn').onclick = async () => {
    await loadScale();
    document.querySelectorAll('#scaleDlg [data-k]').forEach((i) => (i.value = scale[i.dataset.k] || ''));
    $('scaleDlg').showModal();
  };
  $('scCancel').onclick = () => $('scaleDlg').close();
  $('scSave').onclick = async () => {
    const body = {};
    document.querySelectorAll('#scaleDlg [data-k]').forEach((i) => (body[i.dataset.k] = i.value.trim()));
    await api(`/api/services/${getService().id}/scale`, { method: 'PUT', body });
    $('scaleDlg').close();
    loadScale();
    toast('Escala salva');
  };
  document.getElementById('serviceSel').addEventListener('change', () => setTimeout(loadScale, 300));
  setTimeout(loadScale, 1500);

  // ---------- Pedidos pelo celular ----------
  $('reqBtn').onclick = async () => {
    const svc = getService();
    if (!svc) return toast('Abra um culto primeiro');
    const r = await api('/api/qr?path=' + encodeURIComponent('/pedidos.html?s=' + svc.id));
    $('qrImg').src = r.qr;
    $('qrUrl').textContent = r.url;
    $('qrDlg').querySelector('h2').textContent = 'Pedidos de louvores';
    $('qrDlg').querySelector('.qr-body p').innerHTML = '<b>O ministro de louvor aponta a câmera para o código.</b>';
    $('qrDlg').querySelector('.qr-body p.muted').innerHTML = `Ele busca os louvores e adiciona direto no culto <b>“${esc(svc.title)}”</b>. Você vê cada pedido chegar aqui.`;
    $('qrDlg').showModal();
  };
  socket.on('service-changed', ({ id, by, text }) => {
    if (getService()?.id !== id) return;
    if (by === 'pedido') toast('Novo pedido: ' + text);
    if (by === 'scale') loadScale();
  });

  // ---------- Histórico ----------
  $('histBtn').onclick = async (e) => {
    e.preventDefault();
    const rows = await api('/api/history?days=180');
    const byDay = new Map();
    rows.forEach((r) => { if (!byDay.has(r.day)) byDay.set(r.day, []); byDay.get(r.day).push(r); });
    const count = new Map();
    rows.forEach((r) => count.set(r.id, { ...r, n: (count.get(r.id)?.n || 0) + 1 }));
    const top = [...count.values()].sort((a, b) => b.n - a.n).slice(0, 12);
    const fmt = (d) => d.split('-').reverse().join('/');
    $('hiBody').innerHTML = rows.length
      ? `<div class="hi-cols"><div><h3>Mais cantados (6 meses)</h3>${top.map((t) => `<div class="hi-row"><b>${esc(t.title)}</b><span>${t.n}× · ${esc(t.artist || '')}</span></div>`).join('')}</div>
         <div><h3>Por culto</h3>${[...byDay.entries()].slice(0, 20).map(([d, list]) => `<div class="hi-day"><span>${fmt(d)}</span>${list.map((r) => esc(r.title)).join(' · ')}</div>`).join('')}</div></div>`
      : '<div class="empty">Ainda não há louvores projetados. O histórico começa a contar a partir de agora.</div>';
    $('histDlg').showModal();
  };
  $('hiClose').onclick = () => $('histDlg').close();

  // ---------- Letra seguindo o playback ----------
  $('plRec').onclick = () => {
    const p = getLive()?.player;
    if (!p?.rec) toast('Gravando: dê play e passe os slides no ritmo da música. No fim, clique de novo para salvar.');
    else toast('Tempos salvos. Nas próximas vezes a letra passa sozinha (Auto).');
    cmd({ type: 'player', action: 'rec' });
  };
  $('plAuto').onclick = () => cmd({ type: 'player', action: 'auto' });
  socket.on('state', (s) => {
    const p = s.player;
    const song = p && p.type === 'audio' && p.itemId && p.itemId === s.itemId && s.kind === 'song';
    $('plRec').hidden = !song;
    $('plAuto').hidden = !song || !p.timings || p.rec;
    $('plRec').classList.toggle('on', !!p?.rec);
    $('plRec').textContent = p?.rec ? '■ Salvar tempos' : '⏺ Gravar tempos';
    $('plAuto').classList.toggle('on', !!p?.auto);
    $('plAuto').textContent = p?.auto ? 'Auto ligado' : 'Auto desligado';
    $('rehBtn').classList.toggle('on', !!s.rehearsal);
    document.body.classList.toggle('is-rehearsal', !!s.rehearsal);
  });

  // ---------- OBS ----------
  document.getElementById('settingsBtn').addEventListener('click', async () => {
    const info = await api('/api/info').catch(() => null);
    obsBase = (location.origin || (info?.urls?.[0] ?? '')) + '/obs.html';
    obsBuild();
  });
  // ---------- Endereço da legenda do OBS (montado pelas opções) ----------
  let obsBase = location.origin + '/obs.html';
  function obsBuild() {
    const q = new URLSearchParams();
    const st = $('obsStyle').value;
    if (st === 'faixa') q.set('faixa', '1');
    if (st === 'tv') q.set('estilo', 'tv');
    if ($('obsPos').value) q.set('pos', $('obsPos').value);
    if ($('obsSize').value) q.set('tamanho', $('obsSize').value);
    if ($('obsLines').value) q.set('linhas', $('obsLines').value);
    $('obsUrl').textContent = obsBase + (q.toString() ? '?' + q : '');
  }
  ['obsStyle', 'obsPos', 'obsSize', 'obsLines'].forEach((id) => ($(id).onchange = obsBuild));
  // ---------- Segurança e Stream Deck ----------
  const SD = [['next', 'Próximo slide'], ['prev', 'Slide anterior'], ['next-item', 'Próximo item do culto'], ['prev-item', 'Item anterior'], ['black', 'Tela preta (liga/desliga)'], ['clear', 'Sem letra'], ['freeze', 'Congelar'], ['logo', 'Logo'], ['waiting', 'Tela de espera'], ['cartaz', 'Cartaz'], ['play', 'Play/pausa do vídeo'], ['stop', 'Parar vídeo']];
  async function loadSecurity() {
    let s;
    try { s = await api('/api/security'); } catch { $('secBox').hidden = true; return; }
    $('secBox').hidden = false;
    $('secStatus').innerHTML = s.hasPin
      ? `<span class="ok">● PIN ativo</span> · ${s.devices} aparelho${s.devices === 1 ? '' : 's'} conectado${s.devices === 1 ? '' : 's'} pela rede`
      : '<span class="warn">● Sem PIN</span> · celulares e outros computadores <b>não conseguem</b> controlar até você criar um PIN';
    $('secPinDel').hidden = !s.hasPin;
    $('secPinSave').textContent = s.hasPin ? 'Trocar PIN' : 'Criar PIN';
    const base = location.origin;
    $('sdList').innerHTML = SD.map(([a, n]) => `<div class="sd-row"><span>${n}</span><code>${esc(base)}/api/control/${a}?k=${esc(s.controlKey)}</code><button class="btn sm" data-copy="${esc(base)}/api/control/${a}?k=${esc(s.controlKey)}">Copiar</button></div>`).join('');
  }
  document.getElementById('settingsBtn').addEventListener('click', loadSecurity);
  $('sdList').onclick = (e) => { const b = e.target.closest('[data-copy]'); if (b) { navigator.clipboard?.writeText(b.dataset.copy); toast('Endereço copiado'); } };
  $('secPinSave').onclick = async () => {
    try { await api('/api/security/pin', { method: 'PUT', body: { pin: $('secPin').value.trim() } }); $('secPin').value = ''; toast('PIN salvo. Os aparelhos precisam digitar o PIN novo.'); loadSecurity(); }
    catch (e) { toast(e.message); }
  };
  $('secPinDel').onclick = async () => { if (!confirm('Tirar o PIN? Celulares e outros computadores deixam de controlar até você criar outro.')) return; await api('/api/security/pin', { method: 'DELETE' }); toast('PIN removido'); loadSecurity(); };
  $('secRevoke').onclick = async () => { await api('/api/security/revoke', { method: 'POST' }); toast('Todos os aparelhos foram desconectados'); loadSecurity(); };
  $('secInvites').onclick = async () => { await api('/api/security/rotate-invites', { method: 'POST' }); toast('QRs antigos não funcionam mais. Gere um QR novo para o pregador.'); };
  try { $('introOn').checked = localStorage.getItem('introOff') !== '1'; } catch {}
  $('introOn').onchange = () => { try { localStorage.setItem('introOff', $('introOn').checked ? '0' : '1'); } catch {} };
  $('introSee').onclick = () => { try { sessionStorage.removeItem('introSeen'); localStorage.setItem('introOff', '0'); } catch {} location.reload(); };
  $('sysQuit').onclick = async () => { if (!confirm('Fechar o sistema agora? O telão e os celulares vão parar.')) return; await api('/api/system/quit', { method: 'POST' }).catch(() => {}); document.body.innerHTML = '<div style="display:grid;place-items:center;height:100vh;font:600 18px Inter,sans-serif;color:#aab">Sistema fechado. Para abrir de novo, use o atalho “Projeção Igreja”.</div>'; };
  $('sdRotate').onclick = async () => { if (!confirm('Gerar chave nova? Os botões do Stream Deck já configurados param de funcionar.')) return; await api('/api/security/rotate-control', { method: 'POST' }); loadSecurity(); };
  $('obsCopy').onclick = () => { navigator.clipboard?.writeText($('obsUrl').textContent); toast('Endereço copiado'); };
}
