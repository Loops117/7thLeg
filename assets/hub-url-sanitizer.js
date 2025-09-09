
/*! 7th Leg — Hub URL Sanitizer (drop-in)
 * Prevents runaway query strings and cleans auth fragments.
 * Include AFTER your hub scripts on hub.html (last <script>).
 */
(function(){
  const ORIGIN = location.origin;
  const PATH = location.pathname; // keep current path (e.g., /communityhub/hub.html)

  // keys we keep in the URL
  const SAFE_KEYS = new Set([
    'module','view','id','tab',
    'q','query','sort','page',
    'group','filter','filters',
    'type','status','scope',
    'from','to','date','start','end',
    'species','morph','store','user','slug'
  ]);

  // params that often carry nested URLs and explode over time
  const DROP_REDIRECT_KEYS = new Set(['return','redirect','next','callback','back','ref','prev','r','u']);

  // auth-like keys we never want lingering in URL/search or hash
  const AUTH_KEYS = ['access_token','refresh_token','provider_token','id_token','expires_in','token_type','code','state'];

  function parseSearch(search){
    const p = new URLSearchParams(search || '');
    return p;
  }

  function sanitizeParams(params){
    const out = new URLSearchParams();
    // keep only SAFE_KEYS, drop values that look like full URLs
    for (const [k,v] of params.entries()){
      if (DROP_REDIRECT_KEYS.has(k)) continue;
      if (!SAFE_KEYS.has(k)) continue;
      if (/https?:\/\//i.test(v)) continue; // nested URL - drop
      out.set(k, v);
    }
    return out;
  }

  function sanitizeURL(href){
    const url = new URL(href, ORIGIN);
    // merge hash-if-query into params (Supabase may put tokens in hash)
    const hash = (url.hash || '').replace(/^#/, '');
    const hashParams = new URLSearchParams(hash);
    const params = parseSearch(url.search);

    // Drop auth keys from both
    for (const k of AUTH_KEYS){
      params.delete(k);
      hashParams.delete(k);
    }
    // Drop redirect-ish keys
    for (const k of DROP_REDIRECT_KEYS){
      params.delete(k);
      hashParams.delete(k);
    }

    // Sanitize and rebuild
    const cleaned = sanitizeParams(params);
    // if module missing but present in hash, carry it over
    if (!cleaned.has('module') && hashParams.has('module')) {
      cleaned.set('module', hashParams.get('module'));
    }

    const qs = cleaned.toString();
    const outPath = PATH; // stick to current path
    const out = outPath + (qs ? ('?' + qs) : '');
    return ORIGIN + out;
  }

  function replaceWithClean(reason){
    try{
      const currentFull = ORIGIN + PATH + location.search + location.hash;
      const cleanFull = sanitizeURL(currentFull);
      if (currentFull !== cleanFull){
        // console.info('[URL sanitiser] replace:', reason, '→', cleanFull);
        history.replaceState(history.state, '', cleanFull);
      }
    }catch(e){
      console.warn('[URL sanitiser] replace failed', e);
    }
  }

  // Monkey-patch history to prevent future growth
  (function(){
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function(state, title, url){
      try{
        if (typeof url === 'string'){ url = sanitizeURL(url); }
      }catch(e){ /* keep original url */ }
      return origPush.apply(this, [state, title, url]);
    };
    history.replaceState = function(state, title, url){
      try{
        if (typeof url === 'string'){ url = sanitizeURL(url); }
      }catch(e){ /* keep original url */ }
      return origReplace.apply(this, [state, title, url]);
    };
  })();

  // Initial cleanup and on back/forward
  replaceWithClean('initial');
  window.addEventListener('popstate', () => replaceWithClean('popstate'));
})();
