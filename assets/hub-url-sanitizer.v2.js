
/*! 7th Leg — Hub URL Sanitizer v7 (DOM heuristics)
 * - Auto-detects the *current* module by scanning for visible containers
 * - If URL says module=profile but DOM shows e.g. gallery/home/messages, it rewrites to that module and drops stale ?id
 * - Cleans on push/replace/hash/popstate and clicks; rewrites internal <a href> targets; periodic gentle cleanup
 * - Still exposes window.__urlSanitizer.setModule('<name>') for explicit routing hooks
 * Include as the LAST script tag on hub.html.
 */
(function(){
  const ORIGIN = location.origin;
  const PATH = location.pathname;

  const DROP_REDIRECT_KEYS = new Set(['return','redirect','next','callback','back','ref','prev','r','u']);
  const AUTH_KEYS = ['access_token','refresh_token','provider_token','id_token','expires_in','token_type','code','state'];

  const DEFAULT_KEYS = ['module','view','tab','q','query','sort','page','group','filter','filters','type','status','scope','from','to','date','start','end','slug'];

  const MODULE_KEYS = {
    profile:   ['module','id','tab','view'],
    store:     ['module','id','tab','view'],
    species:   ['module','id','tab','view'],
    morph:     ['module','id','tab','view'],
    bulletin:  ['module','id','tab','view'],
    review:    ['module','id','tab','view'],
    listing:   ['module','id','tab','view'],
    post:      ['module','id','tab','view'],
    messages:  ['module','id','tab','page','view'],
    inbox:     ['module','id','tab','page','view'],

    gallery:   ['module','view','q','sort','page','filter','filters','group'],
    home:      ['module','view','q','sort','page'],
    explore:   ['module','view','q','sort','page'],
    search:    ['module','q','sort','page','filter','filters'],
    notifications: ['module','tab','page','view'],
    settings:  ['module','tab','view']
  };

  // DOM heuristics for detecting which module is actually displayed
  const MODULE_DOM = [
    ['profile',      '#profile-root, [data-role="profile"], .profile-page'],
    ['store',        '#store-root, [data-role="store"], .store-page'],
    ['species',      '#species-root, [data-role="species"], .species-page'],
    ['morph',        '#morph-root, [data-role="morph"], .morph-page'],
    ['messages',     '#messages-root, [data-role="messages"], .messages-page, [data-module="messages"].active'],
    ['inbox',        '#inbox-root, [data-role="inbox"], .inbox-page'],
    ['gallery',      '#gallery-root, [data-role="gallery"], .gallery-page'],
    ['home',         '#home-root, #home-feed, [data-role="home-feed"], .home-page'],
    ['explore',      '#explore-root, [data-role="explore"], .explore-page'],
    ['search',       '#search-root, [data-role="search"], .search-page'],
    ['notifications','#notifications-root, [data-role="notifications"], .notifications-page'],
    ['settings',     '#settings-root, [data-role="settings"], .settings-page']
  ];

  function allowedFor(moduleName){
    return new Set(MODULE_KEYS[(moduleName||'').toLowerCase()] || DEFAULT_KEYS);
  }

  function parseParams(search){ return new URLSearchParams(search || ''); }
  function buildURL(path, params){ const qs = params.toString(); return ORIGIN + path + (qs ? ('?' + qs) : ''); }

  function pickModuleFromURL(url) {
    const params = parseParams(url.search);
    const hashParams = new URLSearchParams((url.hash || '').replace(/^#/, ''));
    return (params.get('module') || hashParams.get('module') || '').toLowerCase();
  }
  function pickModuleFromString(href) {
    try {
      const u = new URL(href, ORIGIN);
      const m = pickModuleFromURL(u);
      if (m) return m;
      const hash = (u.hash || '').replace(/^#\/?/, '').toLowerCase();
      if (MODULE_KEYS[hash]) return hash;
    } catch {}
    return '';
  }

  function isVisible(el){
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return !!(el.offsetParent !== null || rect.width || rect.height);
  }

  function detectModuleFromDOM(){
    for (const [mod, sel] of MODULE_DOM){
      const el = document.querySelector(sel);
      if (el && isVisible(el)) return mod;
    }
    // Body data attribute is best if present
    const dataMod = (document.body.dataset.activeModule || '').toLowerCase();
    if (dataMod) return dataMod;
    return '';
  }

  let lastIntentModule = '';
  let lastIntentTime = 0;
  function currentIntentModule(){
    const now = Date.now();
    if (now - lastIntentTime < 1500 && lastIntentModule) return lastIntentModule; // ~1.5s window
    return '';
  }

  function sanitizeParamsFor(moduleName, params){
    const ALLOW = allowedFor(moduleName);
    // Remove auth + redirect-ish
    for (const k of AUTH_KEYS) params.delete(k);
    for (const k of DROP_REDIRECT_KEYS) params.delete(k);

    // Keep only allowed keys and drop nested URLs
    const out = new URLSearchParams();
    for (const [k, v] of params.entries()){
      if (!ALLOW.has(k)) continue;
      if (/https?:\/\//i.test(v)) continue;
      out.set(k, v);
    }
    // Ensure module is present when known
    if (moduleName) out.set('module', moduleName);
    return out;
  }

  function decideModule(href){
    const url = new URL(href, ORIGIN);
    const fromUrl = pickModuleFromURL(url);
    const intent = currentIntentModule();
    const fromDom = detectModuleFromDOM();
    // Priority: explicit intent > DOM detection > URL hint
    return (intent || fromDom || fromUrl || '').toLowerCase();
  }

  function sanitizeURL(href){
    const url = new URL(href, ORIGIN);
    const moduleName = decideModule(href);
    const params = parseParams(url.search);
    const cleaned = sanitizeParamsFor(moduleName, params);
    return buildURL(PATH, cleaned);
  }

  function replaceWithClean(reason){
    try{
      const currentFull = ORIGIN + PATH + location.search + location.hash;
      const cleanFull = sanitizeURL(currentFull);
      if (currentFull !== cleanFull){
        history.replaceState(history.state, '', cleanFull);
      }
    }catch(e){
      console.warn('[URL sanitiser v7] replace failed', reason, e);
    }
  }

  // Public API
  window.__urlSanitizer = {
    setModule(name){
      lastIntentModule = (name||'').toLowerCase();
      lastIntentTime = Date.now();
      burstClean('api:setModule');
      // Also mirror on body so future DOM detection works
      document.body.dataset.activeModule = lastIntentModule;
    },
    clean(){ replaceWithClean('api:clean'); },
    config: { MODULE_KEYS, DEFAULT_KEYS }
  };

  // Click handling + burst cleanup
  function burstClean(why){
    replaceWithClean(why + ':now');
    let n = 0;
    const t = setInterval(() => {
      replaceWithClean(why + ':burst');
      if (++n > 12) clearInterval(t);
    }, 80);
  }
  document.addEventListener('click', (e) => {
    const el = e.target && (e.target.closest ? e.target.closest('[data-module], [data-active-module], a[href]') : null);
    if (!el) return;
    let mod = '';
    if (el.hasAttribute && el.hasAttribute('data-module')) mod = (el.getAttribute('data-module') || '').toLowerCase();
    if (!mod && el.hasAttribute && el.hasAttribute('data-active-module')) mod = (el.getAttribute('data-active-module') || '').toLowerCase();
    if (!mod && el.tagName === 'A') mod = pickModuleFromString(el.getAttribute('href') || '');
    if (mod){
      lastIntentModule = mod;
      lastIntentTime = Date.now();
      document.body.dataset.activeModule = mod;
    }
    setTimeout(() => burstClean('click'), 0);
  }, true);

  // History patch
  (function(){
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function(state, title, url){
      try{ if (typeof url === 'string') url = sanitizeURL(url); }catch{}
      const ret = origPush.apply(this, [state, title, url]);
      setTimeout(() => burstClean('pushState'), 0);
      return ret;
    };
    history.replaceState = function(state, title, url){
      try{ if (typeof url === 'string') url = sanitizeURL(url); }catch{}
      const ret = origReplace.apply(this, [state, title, url]);
      setTimeout(() => burstClean('replaceState'), 0);
      return ret;
    };
  })();

  // Periodic gentle health check (every 5s)
  setInterval(() => replaceWithClean('interval'), 5000);

  // Sanitize internal <a href>
  function sanitizeAnchorHref(a){
    try{
      if (!a || !a.getAttribute) return;
      const href = a.getAttribute('href');
      if (!href) return;
      const u = new URL(href, ORIGIN);
      if (u.origin !== ORIGIN || u.pathname !== PATH) return;
      const targetModule = decideModule(href);
      const cleaned = sanitizeParamsFor((targetModule||'').toLowerCase(), parseParams(u.search));
      const newHref = buildURL(PATH, cleaned);
      if (newHref !== u.href) a.setAttribute('href', newHref);
    }catch{}
  }
  function sanitizeAllAnchors(root){ (root || document).querySelectorAll('a[href]').forEach(sanitizeAnchorHref); }
  sanitizeAllAnchors(document);
  const mo = new MutationObserver((muts) => {
    for (const m of muts){
      if (m.type === 'childList'){
        m.addedNodes.forEach(node => {
          if (node && node.querySelectorAll) sanitizeAllAnchors(node);
          else if (node && node.tagName === 'A') sanitizeAnchorHref(node);
        });
      } else if (m.type === 'attributes' && m.target && m.target.tagName === 'A' && m.attributeName === 'href'){
        sanitizeAnchorHref(m.target);
      }
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });

  // Initial + hash/popstate
  burstClean('initial');
  window.addEventListener('popstate', () => burstClean('popstate'));
  window.addEventListener('hashchange', () => burstClean('hashchange'));
})();
