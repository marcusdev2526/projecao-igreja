// Tela da Bíblia: grade de livros, capítulos e versículos, lista com versões, favoritos, histórico e busca rápida
import { BOOKS, GROUPS, refText, bookName } from '/shared/bible.js';

export function initBibleView({ api, cmd, toast, esc, getLive, getService, openService, loadVersions, onState }) {
  const $ = (id) => document.getElementById(id);
  const st = { book: 43, chapter: 3, verses: [], second: new Map(), chapters: 21, favs: [], focus: null, versions: [] };
  const isFav = (b, c, v) => st.favs.some((f) => f.book === b && f.chapter === c && f.verse === v);
  const visible = () => !$('bibleView').hidden;

  // ---------- Troca de tela: Culto | Bíblia ----------
  function setView(v) {
    if (v !== 'biblia') v = 'inicio';
    document.querySelectorAll('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    document.querySelector('main.cols').hidden = v === 'biblia';
    $('bibleView').hidden = v !== 'biblia';
    if (v === 'biblia') {
      if (!st.verses.length) {
        const l = getLive();
        if (l?.kind === 'bible' && l.bible) loadChapter(l.bible.book, l.bible.chapter, { focus: l.slide?.verse });
        else loadChapter(st.book, st.chapter);
      }
      setTimeout(() => $('bvQ').focus(), 50);
    }
  }
  $('viewSeg').onclick = (e) => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); };
  setTimeout(() => setView('inicio'), 0);

  // ---------- Grade de livros ----------
  $('bvBooks').innerHTML = BOOKS.map((b) => `<button class="book g-${b.group}" data-b="${b.n}" title="${esc(b.pt)}"><b>${esc(b.short)}</b><span>${esc(b.pt)}</span></button>`).join('');
  $('bvLegend').innerHTML = Object.entries(GROUPS).map(([k, n]) => `<span><i class="g-${k}"></i>${esc(n)}</span>`).join('');
  $('bvBooks').onclick = (e) => {
    const b = e.target.closest('.book');
    if (b) loadChapter(+b.dataset.b, 1);
  };

  // ---------- Capítulo ----------
  async function loadChapter(book, chapter, { focus = null, project = false } = {}) {
    const main = $('bibleMain').value || getLive()?.bibleMain;
    const second = $('bibleSecond').value;
    const [a, b] = await Promise.all([
      api(`/api/bible/chapter?v=${encodeURIComponent(main)}&book=${book}&chapter=${chapter}`),
      second ? api(`/api/bible/chapter?v=${encodeURIComponent(second)}&book=${book}&chapter=${chapter}`) : { verses: [] },
    ]);
    if (!a.verses.length) return toast('Capítulo não encontrado nesta versão');
    Object.assign(st, { book, chapter, verses: a.verses, chapters: a.chapters, second: new Map(b.verses.map((v) => [v.verse, v.text])), focus });
    render();
    if (focus) scrollTo(focus);
    if (project) cmd({ type: 'bible', book, chapter, verse: focus || 1 });
  }

  function render() {
    const { book, chapter } = st;
    $('bvRef').textContent = refText(book, chapter);
    document.querySelectorAll('#bvBooks .book').forEach((el) => el.classList.toggle('on', +el.dataset.b === book));
    $('bvChInfo').textContent = `· ${bookName(book)} tem ${st.chapters}`;
    $('bvVsInfo').textContent = `· ${st.verses.length} no capítulo ${chapter}`;
    $('bvChaps').innerHTML = Array.from({ length: st.chapters }, (_, i) => `<button data-c="${i + 1}" class="${i + 1 === chapter ? 'on' : ''}">${i + 1}</button>`).join('');
    $('bvVerses').innerHTML = st.verses.map((v) => `<button data-v="${v.verse}">${v.verse}</button>`).join('');
    $('bvList').innerHTML = st.verses
      .map((v) => {
        const en = st.second.get(v.verse);
        const fav = isFav(book, chapter, v.verse);
        return `<div class="vrow" data-v="${v.verse}"><span class="n">${v.verse}</span><div class="t">${esc(v.text)}${en ? `<div class="en">${esc(en)}</div>` : ''}</div>
          <button class="star ${fav ? 'on' : ''}" data-star="${v.verse}" title="Favorito">${fav ? '★' : '☆'}</button></div>`;
      })
      .join('');
    const info = (code) => st.versions.find((x) => x.code === code);
    const lic = [info($('bibleMain').value), info($('bibleSecond').value)].filter(Boolean).map((v) => `<b>${esc(v.code)}</b> · ${esc(v.license && v.license.includes(v.name) ? v.license : v.name + (v.license ? ' · ' + v.license : ''))}`);
    $('bvLic').innerHTML = lic.join('<br>');
    markLive();
  }
  const scrollTo = (v) => {
    const row = document.querySelector(`#bvList .vrow[data-v="${v}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center' });
    row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 1200);
  };

  // Destaca o que está no telão
  function markLive() {
    const l = getLive();
    const on = l?.kind === 'bible' && l.bible?.book === st.book && l.bible?.chapter === st.chapter;
    const nums = new Set(on ? (l.slide?.verses || []).map((v) => v.n) : []);
    document.querySelectorAll('#bvList .vrow').forEach((r) => r.classList.toggle('live', nums.has(+r.dataset.v)));
    document.querySelectorAll('#bvVerses button').forEach((b) => b.classList.toggle('live', nums.has(+b.dataset.v)));
    document.querySelectorAll('#bvPer button').forEach((b) => b.classList.toggle('on', +b.dataset.v === (l?.biblePer || 1)));
    $('bvBlack').classList.toggle('on', !!l?.black);
    $('bvClear').classList.toggle('on', !!l?.clear);
    return on;
  }
  let lastLive = '';
  onState((s) => {
    if (!visible()) return;
    const on = markLive();
    const key = s.kind === 'bible' && s.bible ? `${s.bible.book}:${s.bible.chapter}:${s.index}` : '';
    if (on && key !== lastLive) document.querySelector('#bvList .vrow.live')?.scrollIntoView({ block: 'nearest' });
    lastLive = key;
  });

  $('bvChaps').onclick = (e) => e.target.dataset.c && loadChapter(st.book, +e.target.dataset.c);
  $('bvVerses').onclick = (e) => {
    const v = +e.target.dataset.v;
    if (!v) return;
    scrollTo(v);
    project(v);
  };
  const project = (verse) => {
    const l = getLive();
    const same = l?.kind === 'bible' && l.bible?.book === st.book && l.bible?.chapter === st.chapter;
    const idx = same ? l.slides.findIndex((s, i) => i === Math.floor((verse - 1) / (l.biblePer || 1))) : -1;
    if (same && idx >= 0) cmd({ type: 'goto', index: idx });
    else cmd({ type: 'bible', book: st.book, chapter: st.chapter, verse });
    st.focus = verse;
  };
  $('bvList').onclick = async (e) => {
    const star = e.target.closest('[data-star]');
    if (star) {
      st.favs = await api('/api/bible/favorites', { method: 'POST', body: { book: st.book, chapter: st.chapter, verse: +star.dataset.star } });
      const on = isFav(st.book, st.chapter, +star.dataset.star);
      star.classList.toggle('on', on);
      star.textContent = on ? '★' : '☆';
      return toast(on ? 'Adicionado aos favoritos' : 'Removido dos favoritos');
    }
    const row = e.target.closest('.vrow');
    if (row) project(+row.dataset.v);
  };

  // Capítulo anterior / próximo (passa de um livro para o outro)
  $('bvPrevCh').onclick = async () => {
    if (st.chapter > 1) return loadChapter(st.book, st.chapter - 1);
    if (st.book > 1) {
      const main = $('bibleMain').value;
      const { chapters } = await api(`/api/bible/chapter?v=${encodeURIComponent(main)}&book=${st.book - 1}&chapter=1`);
      loadChapter(st.book - 1, chapters);
    }
  };
  $('bvNextCh').onclick = () => {
    if (st.chapter < st.chapters) loadChapter(st.book, st.chapter + 1);
    else if (st.book < 66) loadChapter(st.book + 1, 1);
  };

  // ---------- Versões e versículos por slide ----------
  const changeVersions = () => {
    cmd({ type: 'bible-versions', main: $('bibleMain').value, second: $('bibleSecond').value });
    setTimeout(() => loadChapter(st.book, st.chapter, { focus: st.focus }), 120);
  };
  $('bibleMain').onchange = changeVersions;
  $('bibleSecond').onchange = changeVersions;
  $('bvPer').onclick = (e) => e.target.dataset.v && cmd({ type: 'bible-per', value: +e.target.dataset.v });

  // ---------- Controles do telão ----------
  $('bvPrev').onclick = () => cmd({ type: 'prev' });
  $('bvNext').onclick = () => cmd({ type: 'next' });
  $('bvBlack').onclick = () => cmd({ type: 'black' });
  $('bvClear').onclick = () => cmd({ type: 'clear' });
  $('bvAdd').onclick = async () => {
    const svc = getService();
    if (!svc) return;
    const l = getLive();
    const same = l?.kind === 'bible' && l.bible?.book === st.book && l.bible?.chapter === st.chapter;
    const verse = st.focus || (same && l.slide?.verse) || 1;
    await api(`/api/services/${svc.id}/items`, { method: 'POST', body: { kind: 'bible', title: refText(st.book, st.chapter, verse), text: JSON.stringify({ book: st.book, chapter: st.chapter, verse }) } });
    await openService(svc.id);
    toast(`${refText(st.book, st.chapter, verse)} adicionado ao culto`);
  };

  // ---------- Busca ----------
  async function search(q) {
    q = q.trim();
    if (!q) return;
    const main = $('bibleMain').value;
    const r = await api(`/api/bible/search?v=${encodeURIComponent(main)}&q=${encodeURIComponent(q)}`);
    if (r.ref) {
      hidePop();
      await loadChapter(r.ref.book, r.ref.chapter, { focus: r.ref.verse || 1, project: true });
      $('bvQ').select();
      return;
    }
    showPop(`${r.hits.length}${r.hits.length === 80 ? '+' : ''} resultado(s) para "${q}"`, r.hits, q);
  }
  $('bvQ').onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); search($('bvQ').value); }
    if (e.key === 'Escape') { $('bvQ').value = ''; hidePop(); $('bvQ').blur(); }
  };

  // ---------- Favoritos / Histórico / Resultados ----------
  const mark = (text, q) => {
    let out = esc(text);
    if (!q) return out;
    for (const w of q.split(/\s+/).filter((x) => x.length > 2)) {
      const re = new RegExp(`(${w.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split('').map((c) => (/[a-z]/i.test(c) ? `[${c}${accentsOf(c)}]` : c)).join('')})`, 'gi');
      out = out.replace(re, '<mark>$1</mark>');
    }
    return out;
  };
  const ACC = { a: 'áàâãä', e: 'éèêë', i: 'íìîï', o: 'óòôõö', u: 'úùûü', c: 'ç' };
  const accentsOf = (c) => ACC[c.toLowerCase()] || '';
  async function showPop(title, items, q) {
    $('bvPopTitle').textContent = title;
    const texts = await Promise.all(items.map(async (h) => h.text ?? null));
    $('bvPopList').innerHTML = items.length
      ? items.map((h, i) => `<button class="hitrow" data-b="${h.book}" data-c="${h.chapter}" data-v="${h.verse}"><b>${esc(refText(h.book, h.chapter, h.verse))}</b>${texts[i] ? `<span>${mark(texts[i], q)}</span>` : ''}</button>`).join('')
      : '<div class="empty">Nada por aqui ainda</div>';
    $('bvPop').hidden = false;
  }
  const hidePop = () => ($('bvPop').hidden = true);
  $('bvPopClose').onclick = hidePop;
  $('bvPopList').onclick = (e) => {
    const h = e.target.closest('.hitrow');
    if (!h) return;
    hidePop();
    loadChapter(+h.dataset.b, +h.dataset.c, { focus: +h.dataset.v, project: true });
  };
  $('bvFavBtn').onclick = async () => {
    st.favs = await api('/api/bible/favorites');
    showPop(`Favoritos (${st.favs.length})`, st.favs);
  };
  $('bvHistBtn').onclick = async () => showPop('Últimos projetados', await api('/api/bible/history'));

  // Digitar em qualquer lugar da tela da Bíblia vai para a busca (como no Holyrics)
  document.addEventListener('keydown', (e) => {
    if (!visible() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, dialog[open]')) return;
    if (e.key.length === 1 && /[\p{L}\p{N}]/u.test(e.key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      $('bvQ').focus();
      $('bvQ').value = e.key;
    }
  }, true);

  // versões instaladas (licenças) e favoritos
  (async () => {
    st.versions = await api('/api/bible/versions');
    st.favs = await api('/api/bible/favorites');
  })();
  const _lv = loadVersions;
  return { setView, reloadVersions: async () => { await _lv(); st.versions = await api('/api/bible/versions'); } };
}
