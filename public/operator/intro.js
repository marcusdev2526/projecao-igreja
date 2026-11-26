// Abertura do sistema:
//   1. a logo da ADPC se monta (mesma animação do botão Logo do telão, em shared/stage.css)
//   2. a logo sobe, entra um versículo sobre a obra de Deus (muda a cada dia) palavra por palavra
//   3. o botão "Entrar" sobe de baixo — o sistema só abre quando você clica (ou aperta Enter)
// Toca uma vez por sessão (ao abrir o sistema), não a cada F5. Clique na tela adianta a montagem.
// Desligar: Configurações › Sistema › "Animação de abertura".
(() => {
  let off = false;
  try {
    off = localStorage.getItem('introOff') === '1' || sessionStorage.getItem('introSeen') === '1';
    sessionStorage.setItem('introSeen', '1');
  } catch {}
  if (off || new URLSearchParams(location.search).has('semintro')) return;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const P = '/brand/intro/';
  let seed = 3;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const BUILD_MS = 4500;

  // saudação + data por extenso
  const now = new Date();
  const h = now.getHours();
  const hello = h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const date = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  const el = document.createElement('div');
  el.className = 'intro';
  el.innerHTML = `
    <div class="in-logo">
      <div class="logo-build" style="--m:url(${P}mask.png);--lb-h:min(46vmin,430px)">
        <div class="lb-rays"></div><div class="lb-halo"></div>
        <div class="lb-cam">
          ${['book', 'globe', 'swoosh', 'flames', 'flameb', 'A', 'D', 'P', 'C'].map((p) => `<img class="lb-p lb-${p}" src="${P}${p}.png" alt="" draggable="false">`).join('')}
          <div class="lb-flare"></div><div class="lb-shine"></div>
          <div class="lb-embers">${Array.from({ length: 14 }, () => `<i style="--x:${(34 + rnd() * 32).toFixed(1)}%;--d:${(2.6 + rnd() * 2.2).toFixed(2)}s;--dl:${(2.4 + rnd() * 4).toFixed(2)}s;--dx:${((rnd() - 0.5) * 0.12).toFixed(3)}"></i>`).join('')}</div>
        </div>
      </div>
    </div>
    <div class="in-word" aria-live="polite">
      <div class="in-eyebrow"><span>${esc(hello)}</span><i></i><span>${esc(date)}</span></div>
      <blockquote class="in-verse" id="inVerse"></blockquote>
      <div class="in-ref" id="inRef"></div>
    </div>
    <button class="in-enter" id="inEnter" type="button"><span>Entrar no sistema</span><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg><kbd>Enter</kbd></button>
    <div class="in-skip">clique para adiantar</div>`;

  const css = document.createElement('style');
  css.textContent = `
  .intro { position: fixed; inset: 0; z-index: 10000; overflow: hidden; display: grid; place-items: center; cursor: default; font-family: Inter, system-ui, sans-serif; color: #e8eef6;
    background: radial-gradient(ellipse 80% 70% at 50% 42%, #0c1a2e 0%, #070b13 62%, #04060b 100%); --ez: cubic-bezier(.16, 1, .3, 1); }
  .intro::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,.45) 100%); }
  .in-logo { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); transition: transform 1.5s var(--ez); }
  .intro.s2 .in-logo { transform: translate(-50%, calc(-50% - 21vh)) scale(.62); }
  /* versículo */
  .in-word { position: absolute; left: 50%; top: 50%; width: min(820px, 86vw); transform: translate(-50%, -2vh); text-align: center; pointer-events: none; }
  .in-eyebrow { display: flex; align-items: center; justify-content: center; gap: 12px; font-size: 12px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; color: rgba(160, 196, 235, .75); opacity: 0; transform: translateY(10px); }
  .in-eyebrow i { width: 4px; height: 4px; border-radius: 50%; background: #f2921e; box-shadow: 0 0 10px rgba(242, 146, 30, .8); }
  .in-verse { margin: 22px 0 0; font-family: 'Instrument Serif', 'Playfair Display', Georgia, serif; font-style: italic; font-weight: 400; font-size: clamp(26px, 3.4vmin, 40px); line-height: 1.32; letter-spacing: .005em; color: #f3f6fb; text-wrap: balance; }
  .in-verse::before, .in-verse::after { font-family: 'Instrument Serif', Georgia, serif; color: rgba(242, 146, 30, .85); font-style: normal; }
  .in-verse::before { content: '“'; margin-right: .06em; } .in-verse::after { content: '”'; margin-left: .04em; }
  .in-verse::before { opacity: 0; transition: opacity .8s ease .8s; } .in-verse::after { opacity: 0; transition: opacity .8s ease var(--ref-dl, 1.6s); }
  .intro.s2 .in-verse::before, .intro.s2 .in-verse::after { opacity: 1; }
  .in-verse .w { display: inline-block; opacity: 0; transform: translateY(.45em); filter: blur(6px); }
  .intro.s2 .in-verse .w { animation: in-w .9s var(--ez) forwards; animation-delay: calc(.95s + var(--i) * 55ms); }
  @keyframes in-w { to { opacity: 1; transform: none; filter: none; } }
  .in-ref { margin-top: 20px; display: inline-flex; align-items: center; gap: 12px; font-size: 13px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: #ffc861; opacity: 0; transform: translateY(8px); }
  .in-ref::before, .in-ref::after { content: ''; width: 34px; height: 1px; background: linear-gradient(90deg, transparent, rgba(255, 200, 97, .6)); }
  .in-ref::after { transform: scaleX(-1); }
  .in-ref small { font-weight: 500; letter-spacing: .08em; color: rgba(200, 212, 230, .55); text-transform: none; }
  .intro.s2 .in-eyebrow { animation: in-up .9s var(--ez) .75s forwards; }
  .intro.s2 .in-ref { animation: in-up .9s var(--ez) var(--ref-dl, 1.6s) forwards; }
  @keyframes in-up { to { opacity: 1; transform: none; } }
  /* botão Entrar: sobe de baixo */
  .in-enter { position: absolute; left: 50%; bottom: 9vh; transform: translate(-50%, 140%); opacity: 0; display: inline-flex; align-items: center; gap: 12px; height: 54px; padding: 0 16px 0 26px; border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, .14); background: linear-gradient(180deg, #2f8fde, #1f6fbf); color: #fff; font: 600 16px Inter, system-ui, sans-serif; letter-spacing: .01em; cursor: pointer;
    box-shadow: 0 1px 0 rgba(255, 255, 255, .25) inset, 0 18px 40px rgba(31, 111, 191, .35), 0 2px 6px rgba(0, 0, 0, .4); transition: background .2s, box-shadow .2s, transform .2s; }
  .intro.s3 .in-enter { animation: in-btn 1s var(--ez) forwards; }
  @keyframes in-btn { to { opacity: 1; transform: translate(-50%, 0); } }
  .in-enter:hover { background: linear-gradient(180deg, #45a0ea, #2779cc); box-shadow: 0 1px 0 rgba(255, 255, 255, .3) inset, 0 22px 48px rgba(31, 111, 191, .5), 0 2px 6px rgba(0, 0, 0, .4); }
  .in-enter:focus-visible { outline: 2px solid #8fd8ff; outline-offset: 3px; }
  .in-enter svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; transition: transform .25s var(--ez); }
  .in-enter:hover svg { transform: translateX(3px); }
  .in-enter kbd { margin-left: 6px; font: 600 10.5px Inter, system-ui, sans-serif; padding: 3px 7px; border-radius: 6px; background: rgba(0, 0, 0, .22); border: 1px solid rgba(255, 255, 255, .18); color: rgba(255, 255, 255, .8); }
  .intro.s3 .in-enter::after { content: ''; position: absolute; inset: -1px; border-radius: inherit; box-shadow: 0 0 0 0 rgba(90, 170, 235, .5); animation: in-ring 2.4s ease-out 1.2s infinite; pointer-events: none; }
  @keyframes in-ring { 0% { box-shadow: 0 0 0 0 rgba(90, 170, 235, .45); } 70%, 100% { box-shadow: 0 0 0 14px rgba(90, 170, 235, 0); } }
  .in-skip { position: absolute; bottom: 18px; left: 0; right: 0; text-align: center; font-size: 12px; color: rgba(200, 210, 225, .3); transition: opacity .5s; }
  .intro.s2 .in-skip { opacity: 0; }
  /* clicou para adiantar: logo pronta na hora */
  .intro.fast .logo-build *, .intro.fast .lb-cam { animation-delay: 0s !important; animation-duration: .01s !important; }
  .intro.fast .lb-embers i, .intro.fast .lb-rays { animation-duration: revert !important; }
  /* saída */
  .intro.bye { animation: in-bye .9s cubic-bezier(.4, 0, .2, 1) forwards; pointer-events: none; }
  .intro.bye .in-logo { transform: translate(-50%, calc(-50% - 23vh)) scale(.58); opacity: 0; transition: transform .9s var(--ez), opacity .6s ease; }
  .intro.bye .in-word, .intro.bye .in-enter { opacity: 0 !important; transition: opacity .4s ease; }
  @keyframes in-bye { 0% { opacity: 1; } 100% { opacity: 0; visibility: hidden; } }
  @media (max-height: 640px) { .intro.s2 .in-logo { transform: translate(-50%, calc(-50% - 24vh)) scale(.5); } .in-word { transform: translate(-50%, -6vh); } .in-enter { bottom: 5vh; } }
  @media (prefers-reduced-motion: reduce) { .in-verse .w, .in-eyebrow, .in-ref, .in-enter { animation-duration: .01s !important; animation-delay: 0s !important; } .in-logo { transition: none; } }`;
  document.head.appendChild(css);
  const mount = () => document.body.appendChild(el);
  document.body ? mount() : document.addEventListener('DOMContentLoaded', mount);

  // versículo do dia (da Bíblia instalada no sistema); se falhar, um fixo
  const fallback = { text: 'Portanto, meus amados irmãos, sede firmes, imóveis e sempre abundantes na obra do Senhor, sabendo que o vosso trabalho não é vão no Senhor.', ref: '1 Coríntios 15:58', version: 'Bíblia Livre' };
  const verse = fetch('/api/bible/obra').then((r) => (r.ok ? r.json() : fallback)).catch(() => fallback);
  verse.then((v) => {
    const words = String(v.text || fallback.text).split(/\s+/);
    el.querySelector('#inVerse').innerHTML = words.map((w, i) => `<span class="w" style="--i:${i}">${esc(w)}</span>`).join(' ');
    el.querySelector('#inRef').innerHTML = `${esc(v.ref)} <small>· ${esc(v.version || '')}</small>`;
    el.style.setProperty('--ref-dl', (1.15 + words.length * 0.055).toFixed(2) + 's');
    el.dataset.words = words.length;
  });

  let stage = 1;
  let t2;
  let t3;
  const toStage2 = () => {
    if (stage >= 2) return;
    stage = 2;
    el.classList.add('s2');
    verse.then(() => {
      const wait = 1600 + (+el.dataset.words || 20) * 55;
      t3 = setTimeout(() => { el.classList.add('s3'); stage = 3; setTimeout(() => el.querySelector('#inEnter').focus({ preventScroll: true }), 300); }, wait);
    });
  };
  t2 = setTimeout(toStage2, BUILD_MS);
  const finish = () => {
    clearTimeout(t2); clearTimeout(t3);
    removeEventListener('keydown', onKey, true);
    el.classList.add('bye');
    setTimeout(() => { el.remove(); css.remove(); }, 950);
  };
  const advance = () => {
    if (stage === 1) { el.classList.add('fast'); clearTimeout(t2); setTimeout(toStage2, 60); }
    else if (stage === 2) { clearTimeout(t3); el.classList.add('s3'); stage = 3; el.querySelector('#inEnter').focus({ preventScroll: true }); }
  };
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') { e.preventDefault(); if (stage === 3 || e.key === 'Escape') finish(); else advance(); }
  };
  el.addEventListener('click', (e) => { if (e.target.closest('#inEnter')) finish(); else advance(); });
  addEventListener('keydown', onKey, true);
})();
