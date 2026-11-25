// Organização do culto: barra de comando, blocos com tempo, cronômetro, biblioteca recolhível,
// novo culto a partir de modelo, igreja/tela de espera e backup.

export function initOrganize(ctx) {
  const { api, cmd, toast, esc, socket, getService, openService, loadServices, getLive, renderItems } = ctx;
  const $ = (id) => document.getElementById(id);
  const pref = {
    get: (k) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } },
    set: (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch {} },
  };

  // ---------- Barra de comando ----------
  $('prevBtn').onclick = () => cmd({ type: 'prev' });
  $('nextBtn').onclick = () => cmd({ type: 'next' });
  $('logoBtn').onclick = () => cmd({ type: 'logo' });
  $('waitBtn').onclick = () => cmd({ type: 'waiting' });
  // Congelar: o público continua vendo o que está agora; você prepara o próximo e solta quando quiser
  $('freezeBtn').onclick = () => cmd({ type: 'freeze' });
  $('prepGo').onclick = () => cmd({ type: 'freeze', value: false });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, dialog[open]') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'f' || e.key === 'F') cmd({ type: 'freeze' });
    if (e.key === 'Enter' && getLive()?.frozen) cmd({ type: 'freeze', value: false });
  });

  // ---------- Cronômetro ----------
  const fmt = (ms) => {
    const t = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(t % 60).padStart(2, '0');
  };
  let lastBlock = null;
  function tick() {
    const s = getLive();
    $('tmClock').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (!s) return;
    const t = s.timing || {};
    $('tmSvc').textContent = t.serviceStart ? 'Culto ' + fmt(Date.now() - t.serviceStart) : 'Culto não iniciado';
    const b = s.block;
    $('tmBlock').hidden = !b || !t.blockStart;
    if (b && t.blockStart) {
      const el = Date.now() - t.blockStart;
      const plan = (b.minutes || 0) * 60000;
      $('tmBName').textContent = b.title;
      $('tmBTime').textContent = fmt(el) + (plan ? ' / ' + b.minutes + ':00' : '');
      const over = plan && el > plan;
      $('timerCard').classList.toggle('over', !!over);
      $('tmBBar').style.width = plan ? Math.min(100, (el / plan) * 100) + '%' : '0';
      $('tmBlock').style.setProperty('--bc', ctx.BLOCK_COLORS[b.color] || ctx.BLOCK_COLORS.outro);
    } else $('timerCard').classList.remove('over');
  }
  setInterval(tick, 1000);
  $('tmReset').onclick = () => { if (confirm('Zerar o cronômetro do culto?')) cmd({ type: 'timer', action: 'reset' }); };
  socket.on('state', (s) => {
    $('logoBtn').classList.toggle('on', !!s.logo);
    $('waitBtn').classList.toggle('on', !!s.waiting);
    $('freezeBtn').classList.toggle('on', !!s.frozen);
    $('freezeBtn').querySelector('span').textContent = s.frozen ? 'Soltar no telão (Enter)' : 'Congelar';
    $('frozenBadge').hidden = !s.frozen;
    // congelado: aparecem dois monitores — Preparado (o que vai entrar) e No telão (o que o público vê)
    $('prepMon').hidden = !s.frozen;
    $('liveLbl').hidden = !s.frozen;
    $('pvFrame').classList.toggle('dual', !!s.frozen);
    if (s.frozen && !$('prepPreview').src) $('prepPreview').src = '/screen.html?embed&real';
    document.body.classList.toggle('is-frozen', !!s.frozen);
    const lbl = document.querySelector('#liveTitle')?.previousElementSibling;
    if (lbl) lbl.textContent = s.frozen ? 'Preparado · fora do telão' : 'No ar';
    const bid = s.timing?.blockId ?? null;
    if (bid !== lastBlock) { lastBlock = bid; renderItems(); }
    tick();
  });

  // ---------- Blocos ----------
  $('addBlockBtn').onclick = () => { if (!getService()) return toast('Abra um culto primeiro'); $('blockDlg').showModal(); };
  $('blkCancel').onclick = () => $('blockDlg').close();
  $('blkGrid').onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    let title = b.dataset.b;
    if (!title) { title = prompt('Nome do bloco:', ''); if (!title) return; }
    const svc = getService();
    await api(`/api/services/${svc.id}/items`, { method: 'POST', body: { kind: 'block', title, text: JSON.stringify({ minutes: +b.dataset.m, color: b.dataset.c }) } });
    $('blockDlg').close();
    await openService(svc.id);
    toast(`Bloco "${title}" criado no fim do culto. Arraste para o lugar certo.`);
  };

  // ---------- Biblioteca recolhível ----------
  const applyLib = () => {
    document.body.classList.toggle('lib-min', pref.get('libMin'));
    $('libToggle').title = pref.get('libMin') ? 'Mostrar a biblioteca' : 'Recolher a biblioteca';
  };
  $('libToggle').onclick = () => { pref.set('libMin', !pref.get('libMin')); applyLib(); };
  applyLib();

  // ---------- Novo culto (em branco ou a partir de modelo) ----------
  $('newServiceBtn').onclick = async () => {
    const tpls = await api('/api/templates');
    $('nsTpl').innerHTML = '<option value="">Culto em branco</option>' + tpls.map((t) => `<option value="${t.i}">Modelo: ${esc(t.name)} (${t.count} itens)</option>`).join('');
    if (tpls.length) $('nsTpl').value = String(tpls[tpls.length - 1].i);
    $('nsDate').value = nextSunday();
    $('newSvcDlg').showModal();
  };
  $('nsCancel').onclick = () => $('newSvcDlg').close();
  $('nsGo').onclick = async () => {
    const body = { title: $('nsTitle').value.trim() || 'Culto', date: $('nsDate').value || new Date().toLocaleDateString('sv-SE') };
    if ($('nsTpl').value !== '') body.template = +$('nsTpl').value;
    const { id } = await api('/api/services', { method: 'POST', body });
    $('newSvcDlg').close();
    await loadServices(id);
    toast('Culto criado');
  };
  $('nsSaveTpl').onclick = async () => {
    const svc = getService();
    if (!svc) return;
    const name = prompt('Nome do modelo:', svc.title + ' padrão');
    if (!name) return;
    await api('/api/templates', { method: 'POST', body: { service_id: svc.id, name } });
    $('newSvcDlg').close();
    toast(`Modelo "${name}" salvo`);
  };
  function nextSunday() {
    const d = new Date();
    if (d.getDay() !== 0) d.setDate(d.getDate() + (7 - d.getDay()));
    return d.toLocaleDateString('sv-SE');
  }

  // ---------- Configurações: igreja, tela de espera e backup ----------
  async function loadChurch() {
    const [c, media, decks, bk] = await Promise.all([api('/api/settings/church'), api('/api/media'), api('/api/decks'), api('/api/settings/backup')]);
    $('chName').value = c.name || '';
    $('chStart').value = c.start || '19:00';
    $('chText').value = c.waitText || '';
    $('chLogo').innerHTML = '<option value="">Sem logo (mostra o nome)</option>' + media.filter((m) => m.type === 'image').map((m) => `<option value="${esc(m.url)}">${esc(m.name)}</option>`).join('');
    $('chLogo').value = c.logo || '';
    showLogo();
    $('chDeck').innerHTML = '<option value="">Sem avisos</option>' + decks.map((d) => `<option value="${d.id}">${esc(d.title)} (${d.count})</option>`).join('');
    $('chDeck').value = c.deckId || '';
    $('bkDir').value = bk.dir || '';
    $('bkOn').checked = !!bk.on;
    $('bkInfo').textContent = bk.last ? 'Último backup: ' + bk.last.split('-').reverse().join('/') : 'Nenhum backup ainda';
  }
  const showLogo = () => { $('chLogoImg').hidden = !$('chLogo').value; $('chLogoImg').src = $('chLogo').value || ''; };
  $('chLogo').onchange = showLogo;
  $('settingsBtn').addEventListener('click', () => loadChurch().catch(() => {}));
  $('stSave').addEventListener('click', async () => {
    try {
      await api('/api/settings/church', { method: 'PUT', body: { name: $('chName').value.trim(), logo: $('chLogo').value, start: $('chStart').value, waitText: $('chText').value.trim(), deckId: $('chDeck').value } });
      await api('/api/settings/backup', { method: 'PUT', body: { dir: $('bkDir').value.trim(), on: $('bkOn').checked } });
    } catch (e) {
      toast(e.message);
    }
  });
  $('bkNow').onclick = async () => {
    try {
      await api('/api/settings/backup', { method: 'PUT', body: { dir: $('bkDir').value.trim(), on: $('bkOn').checked } });
      $('bkInfo').textContent = 'Fazendo backup…';
      const r = await api('/api/backup/run', { method: 'POST' });
      $('bkInfo').textContent = `Salvo: ${r.file} (${(r.size / 1048576).toFixed(1)} MB)`;
    } catch (e) {
      $('bkInfo').textContent = e.message;
    }
  };
}
