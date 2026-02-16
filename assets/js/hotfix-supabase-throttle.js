// assets/js/hotfix-supabase-throttle.js
// GLOBAL HOTFIX: throttle/block noisy REST calls that are hammering Supabase.
// Include this EARLY in <head> (before other scripts).
// It intercepts window.fetch and tames calls to these endpoints:
//   - /rest/v1/notifications
//   - /rest/v1/user_messages

(function () {
  if (window.__SUPA_FETCH_THROTTLED__) return;
  window.__SUPA_FETCH_THROTTLED__ = true;

  const ORIG_FETCH = window.fetch.bind(window);
  const BLOCK_LIST = [
    /\/rest\/v1\/notifications\b/i,
    /\/rest\/v1\/user_messages\b/i,
  ];

  // minimum ms between requests per URL
  const MIN_INTERVAL_MS = 5000; // 5s
  const lastCallAt = new Map();
  const lastResultCache = new Map();

  function shouldThrottle(url) {
    return BLOCK_LIST.some(rx => rx.test(url));
  }

  function now() { return Date.now(); }

  function asUrl(input) {
    try { return (typeof input === 'string') ? input : (input && input.url) || String(input); }
    catch { return String(input); }
  }

  function makeEmptyResponse() {
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  window.fetch = async function (input, init) {
    const url = asUrl(input);
    if (!url) return ORIG_FETCH(input, init);

    if (shouldThrottle(url)) {
      const t = now();
      const last = lastCallAt.get(url) || 0;
      const delta = t - last;

      if (delta < MIN_INTERVAL_MS) {
        // return cached result if we have it; otherwise short-circuit with empty array
        if (lastResultCache.has(url)) {
          console.warn('[hotfix-throttle] returning cached result for', url);
          return lastResultCache.get(url).clone();
        } else {
          console.warn('[hotfix-throttle] short-circuit (empty) for', url);
          return makeEmptyResponse();
        }
      }

      // proceed, but capture result for short-term cache
      const resp = await ORIG_FETCH(input, init);
      try { lastResultCache.set(url, resp.clone()); } catch {}
      lastCallAt.set(url, t);
      console.warn('[hotfix-throttle] allowed', url);
      return resp;
    }

    return ORIG_FETCH(input, init);
  };

  console.warn('[hotfix-throttle] installed (5s per URL).');
})();