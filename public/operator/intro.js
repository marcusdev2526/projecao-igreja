// Abertura do sistema: a logo da ADPC se montando peça por peça.
// Toca uma vez por sessão (ao abrir o sistema), não em cada F5. Clique ou tecla pula.
// Desligar: Configurações › Sistema › "Animação de abertura".
(() => {
  let off = false;
  try {
    off = localStorage.getItem('introOff') === '1' || sessionStorage.getItem('introSeen') === '1';
    sessionStorage.setItem('introSeen', '1');
  } catch {}
  if (off || new URLSearchParams(location.search).has('semintro')) return;

  const P = '/brand/intro/';
  const parts = ['book', 'globe', 'swoosh', 'flames', 'flameb', 'A', 'D', 'P', 'C'];
  const el = document.createElement('div');
  el.className = 'intro';
  el.innerHTML = `
    <div class="in-glow"></div>
    <div class="in-logo">
      ${parts.map((p) => `<img class="in-p in-${p}" src="${P}${p}.png" alt="" draggable="false">`).join('')}
      <div class="in-shine"></div>
      <div class="in-embers">${Array.from({ length: 22 }, (_, i) => `<i style="--x:${(30 + Math.random() * 40).toFixed(1)}%;--d:${(1.4 + Math.random() * 1.4).toFixed(2)}s;--dl:${(1.5 + Math.random() * 1.6).toFixed(2)}s;--dx:${((Math.random() - 0.5) * 120).toFixed(0)}px"></i>`).join('')}</div>
    </div>
    <div class="in-name">Projeção</div>
    <div class="in-skip">clique para pular</div>`;
  const css = document.createElement('style');
  css.textContent = `
  .intro { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; align-content: center; gap: 18px; background: radial-gradient(ellipse at 50% 45%, #0d1d34 0%, #070b13 60%, #04060b 100%); cursor: pointer; overflow: hidden; animation: in-out .6s ease 4.3s forwards; }
  .intro.skip { animation: in-out .35s ease forwards; }
  @keyframes in-out { to { opacity: 0; visibility: hidden; } }
  .in-glow { position: absolute; left: 50%; top: 45%; width: 70vmin; height: 70vmin; transform: translate(-50%, -50%) scale(.6); border-radius: 50%; background: radial-gradient(circle, rgba(43,147,208,.35), rgba(242,146,30,.08) 45%, transparent 70%); opacity: 0; animation: in-glow 2.6s ease .5s forwards; }
  @keyframes in-glow { to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
  .in-logo { position: relative; width: min(46vmin, 420px); aspect-ratio: 1280 / 1263; }
  .in-p { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; user-select: none; }
  /* 1. o livro abre */
  .in-book { transform-origin: 50% 77%; animation: in-book .8s cubic-bezier(.2,.8,.2,1) .2s forwards; }
  @keyframes in-book { from { opacity: 0; transform: translateY(40px) scaleY(.05); } 60% { opacity: 1; } to { opacity: 1; transform: none; } }
  /* 2. o globo gira e aparece */
  .in-globe { transform-origin: 50% 44.7%; animation: in-globe 1s cubic-bezier(.2,.8,.2,1) .75s forwards; }
  @keyframes in-globe { from { opacity: 0; transform: scale(.4) rotate(-40deg); filter: blur(8px) brightness(2); } to { opacity: 1; transform: none; filter: none; } }
  /* 3. a faixa azul (Espírito) é desenhada */
  .in-swoosh { clip-path: inset(0 100% 0 0); animation: in-wipe-x 1s cubic-bezier(.6,0,.3,1) 1.2s forwards; }
  @keyframes in-wipe-x { from { opacity: 1; clip-path: inset(0 100% 0 0); } to { opacity: 1; clip-path: inset(0 0 0 0); } }
  /* 4. as chamas sobem */
  .in-flames { clip-path: inset(100% 0 0 0); animation: in-wipe-y .9s cubic-bezier(.3,.7,.2,1) 1.55s forwards, in-flick 1.2s ease-in-out 2.5s 2 alternate; }
  .in-flameb { clip-path: inset(100% 0 0 0); animation: in-wipe-y .8s cubic-bezier(.3,.7,.2,1) 1.85s forwards; }
  @keyframes in-wipe-y { from { opacity: 1; clip-path: inset(100% 0 0 0); } to { opacity: 1; clip-path: inset(0 0 0 0); } }
  @keyframes in-flick { to { filter: brightness(1.25) drop-shadow(0 0 14px rgba(255,190,60,.55)); } }
  /* 5. as letras A D P C sobem uma por uma */
  .in-A, .in-D, .in-P, .in-C { animation: in-letter .6s cubic-bezier(.2,.9,.25,1.2) forwards; }
  .in-A { animation-delay: 2.2s; } .in-D { animation-delay: 2.32s; } .in-P { animation-delay: 2.44s; } .in-C { animation-delay: 2.56s; }
  @keyframes in-letter { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: none; } }
  /* 6. brilho passando pela logo */
  .in-shine { position: absolute; inset: 0; pointer-events: none; -webkit-mask: url(${P}mask.png) center / 100% 100% no-repeat; mask: url(${P}mask.png) center / 100% 100% no-repeat;
    background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.75) 50%, transparent 65%) -150% 0 / 250% 100% no-repeat; animation: in-shine 1s ease 3.1s forwards; }
  @keyframes in-shine { to { background-position: 150% 0; } }
  .in-embers i { position: absolute; left: var(--x); top: 40%; width: 4px; height: 4px; border-radius: 50%; background: #ffd36b; box-shadow: 0 0 8px 2px rgba(242,146,30,.8); opacity: 0; animation: in-ember var(--d) ease-out var(--dl) forwards; }
  @keyframes in-ember { 0% { opacity: 0; transform: translate(0, 0); } 15% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx), -260px); } }
  .in-name { font: 600 13px Inter, system-ui, sans-serif; letter-spacing: .5em; text-transform: uppercase; color: rgba(220,230,245,.75); padding-left: .5em; opacity: 0; animation: in-name .8s ease 2.9s forwards; }
  @keyframes in-name { from { opacity: 0; letter-spacing: .9em; } to { opacity: 1; letter-spacing: .5em; } }
  .in-skip { position: absolute; bottom: 22px; font: 12px Inter, system-ui, sans-serif; color: rgba(200,210,225,.35); }
  @media (prefers-reduced-motion: reduce) { .in-p { animation: none !important; opacity: 1 !important; clip-path: none !important; } .intro { animation-delay: 1.2s; } }`;
  document.head.appendChild(css);
  const mount = () => document.body.appendChild(el);
  document.body ? mount() : document.addEventListener('DOMContentLoaded', mount);
  const done = () => { el.classList.add('skip'); setTimeout(() => { el.remove(); css.remove(); }, 400); removeEventListener('keydown', done, true); };
  el.addEventListener('click', done);
  addEventListener('keydown', done, true);
  setTimeout(() => { el.remove(); css.remove(); removeEventListener('keydown', done, true); }, 5200);
})();
