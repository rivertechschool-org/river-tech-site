(() => {
  const host = document.querySelector('#rt-living-world');
  if (!host) return;
  const frame = host.querySelector('iframe');
  const origin = new URL(frame.dataset.src).origin;
  const mobileLayout = matchMedia('(max-width: 900px)');
  const menu = document.querySelector('.mobile-nav-overlay');
  let visible = false, started = false, retry;
  function active() { return visible && !document.hidden && !menu?.classList.contains('open'); }
  function signal() {
    if (started) frame.contentWindow?.postMessage({type:'rt-world-visibility', visible:active(), mobileLayout:mobileLayout.matches}, origin);
  }
  function start() {
    if (!active() || started) return;
    started = true;
    frame.src = frame.dataset.src;
    // A blocked or failed frame leaves the local logo and school links available.
    // Retrying only an unready, visible frame also handles a brief Render restart.
    retry = setTimeout(() => { if (host.dataset.ready !== 'true') { started = false; start(); } }, 30000);
  }
  addEventListener('message', event => {
    if (event.source !== frame.contentWindow || event.origin !== origin) return;
    if (event.data?.type === 'rt-world-mounted') signal();
    if (event.data?.type === 'rt-world-ready') {
      clearTimeout(retry);
      host.dataset.ready = 'true';
      frame.removeAttribute('tabindex');
      frame.removeAttribute('aria-hidden');
    }
  });
  frame.addEventListener('load', signal);
  mobileLayout.addEventListener('change', signal);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; start(); signal(); }, {threshold:.05}).observe(host);
  document.addEventListener('visibilitychange', () => { start(); signal(); });
  addEventListener('online', () => { start(); signal(); });
  if (menu) new MutationObserver(() => { start(); signal(); }).observe(menu, {attributes:true,attributeFilter:['class']});
})();
