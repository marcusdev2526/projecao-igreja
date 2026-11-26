// Abertura do sistema: a logo da ADPC se montando (mesma animação do botão Logo do telão, em shared/stage.css).
// Toca uma vez por sessão (ao abrir o sistema), não a cada F5. Clique ou tecla pula.
// Desligar: Configurações › Sistema › "Animação de abertura".
(() => {
  let off = false;
  try {
    off = localStorage.getItem('introOff') === '1' || sessionStorage.getItem('introSeen') === '1';
    sessionStorage.setItem('introSeen', '1');
  } catch {}
  if (off || new URLSearchParams(location.search).has('semintro')) return;

  const P = '/brand/intro/';
  let seed = 3;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const logo = `<div class="logo-build" style="--m:url(${P}mask.png);--lb-h:min(50vmin,460px)">
    <div class="lb-rays"></div><div class="lb-halo"></div>
    <div class="lb-cam">
      ${['book', 'globe', 'swoosh', 'flames', 'flameb', 'A', 'D', 'P', 'C'].map((p) => `<img class="lb-p lb-${p}" src="${P}${p}.png" alt="" draggable="false">`).join('')}
      <div class="lb-flare"></div><div class="lb-shine"></div>
      <div class="lb-embers">${Array.from({ length: 14 }, () => `<i style="--x:${(34 + rnd() * 32).toFixed(1)}%;--d:${(2.6 + rnd() * 2.2).toFixed(2)}s;--dl:${(2.4 + rnd() * 4).toFixed(2)}s;--dx:${((rnd() - 0.5) * 0.12).toFixed(3)}"></i>`).join('')}</div>
    </div>
  </div>`;
  const el = document.createElement('div');
  el.className = 'intro';
  el.innerHTML = `${logo}<div class="in-name">Projeção</div><div class="in-skip">clique para pular</div>`;
  const css = document.createElement('style');
  css.textContent = `
  .intro { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; align-content: center; gap: 4vmin; overflow: hidden; cursor: pointer;
    background: radial-gradient(ellipse 80% 70% at 50% 45%, #0c1a2e 0%, #070b13 62%, #04060b 100%); animation: in-out .8s cubic-bezier(.4,0,.2,1) 5.4s forwards; }
  .intro.skip { animation: in-out .4s ease forwards; }
  @keyframes in-out { to { opacity: 0; visibility: hidden; transform: scale(1.02); } }
  .in-name { font: 600 12px Inter, system-ui, sans-serif; letter-spacing: .6em; padding-left: .6em; text-transform: uppercase; color: rgba(215, 226, 242, .7); opacity: 0;
    animation: in-name 1.4s cubic-bezier(.16,1,.3,1) 3.9s forwards; }
  @keyframes in-name { from { opacity: 0; letter-spacing: 1.1em; filter: blur(4px); } to { opacity: 1; letter-spacing: .6em; filter: none; } }
  .in-skip { position: absolute; bottom: 22px; font: 12px Inter, system-ui, sans-serif; color: rgba(200, 210, 225, .3); }`;
  document.head.appendChild(css);
  const mount = () => document.body.appendChild(el);
  document.body ? mount() : document.addEventListener('DOMContentLoaded', mount);
  const end = () => { el.remove(); css.remove(); removeEventListener('keydown', skip, true); };
  const skip = () => { el.classList.add('skip'); setTimeout(end, 450); };
  el.addEventListener('click', skip);
  addEventListener('keydown', skip, true);
  setTimeout(end, 6400);
})();
