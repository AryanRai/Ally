const STYLE = `
.ally-brand-mark{position:relative;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;flex-shrink:0}
.ally-brand-mark img{width:100%;height:100%;object-fit:contain;image-rendering:pixelated}
.ally-brand-mark[data-working="true"] img{animation:ally-working 1.4s ease-in-out infinite}
.ally-brand-count{position:absolute;right:-5px;bottom:-4px;border-radius:8px;background:#237fac;color:white;font:600 9px/14px system-ui;min-width:14px;text-align:center;padding:0 2px}
@keyframes ally-working{50%{opacity:.55}}
@media(prefers-reduced-motion:reduce){.ally-brand-mark img{animation:none!important}}
`;

export function createMark(host, {width = 24} = {}) {
  if (!document.getElementById('ally-brand-style')) {
    const style = document.createElement('style');
    style.id = 'ally-brand-style'; style.textContent = STYLE;
    document.head.appendChild(style);
  }
  const element = document.createElement('span');
  element.className = 'ally-brand-mark';
  element.style.width = `${width}px`; element.style.height = `${width}px`;
  element.setAttribute('aria-hidden', 'true');
  const image = document.createElement('img');
  image.src = 'assets/ally.png'; image.alt = '';
  const count = document.createElement('span');
  count.className = 'ally-brand-count'; count.hidden = true;
  element.append(image, count); host.replaceChildren(element);
  let working = false;
  const refresh = () => { element.dataset.working = String(working && !document.hidden); };
  document.addEventListener('visibilitychange', refresh);
  return {
    element,
    blink() {},
    setWorking(value, number = 0) {
      working = Boolean(value);
      count.hidden = !working || number < 1;
      count.textContent = number > 9 ? '9+' : String(number);
      refresh();
    },
  };
}
