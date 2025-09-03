
// home-qna-nudge.loader.js
// Drop-in loader that waits for window.supabase, then imports the nudge module exactly once.
(function () {
  if (window.__QNA_NUDGE_LOADER__) return;
  window.__QNA_NUDGE_LOADER__ = true;

  function ready() {
    return typeof window.supabase === 'object' && window.supabase !== null;
  }

  async function start() {
    try {
      // Import the actual nudge module
      await import('/communityhub/hub_modules/home-qna-nudge.once.js?v=' + Date.now());
    } catch (e) {
      console.warn('[QNA NUDGE] loader failed to import module:', e);
    }
  }

  if (ready()) {
    start();
  } else {
    const t = setInterval(() => {
      if (ready()) {
        clearInterval(t);
        start();
      }
    }, 120);
    // Safety stop after 15s
    setTimeout(() => clearInterval(t), 15000);
  }
})();
