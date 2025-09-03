
// home-qna-nudge.loader.v2.js
(function () {
  if (window.__QNA_NUDGE_LOADER__) {
    console.info('[QNA] loader: already initialized');
    return;
  }
  window.__QNA_NUDGE_LOADER__ = true;
  console.info('[QNA] loader: start');

  function ready() {
    return typeof window.supabase === 'object' && window.supabase !== null;
  }

  async function start() {
    try {
      console.info('[QNA] loader: importing nudge module...');
      await import('/communityhub/hub_modules/home-qna-nudge.once.v2.js?v=' + Date.now());
      console.info('[QNA] loader: nudge module imported');
    } catch (e) {
      console.warn('[QNA] loader failed:', e);
    }
  }

  if (ready()) {
    console.info('[QNA] loader: supabase ready');
    start();
  } else {
    console.info('[QNA] loader: waiting for supabase...');
    const t = setInterval(() => {
      if (ready()) {
        clearInterval(t);
        console.info('[QNA] loader: supabase ready');
        start();
      }
    }, 120);
    setTimeout(() => clearInterval(t), 15000);
  }
})();
