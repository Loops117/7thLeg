// /assets/js/header-auth.once.js
// Fetch once per page load. No polling. No loops.
// Renders header user info when the target element appears (MutationObserver).
// Safe to include multiple times (guarded).

(function(){
  if (window.__HEADER_AUTH_ONCE__) return;
  window.__HEADER_AUTH_ONCE__ = true;

  const SEL_CONTAINER = '#nav-user, [data-nav-user], #navbar-user';
  const PROFILE_FIELDS = 'id, full_name, avatar_url';

  function onDomReady(fn){
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else { fn(); }
  }

  function onceElement(selector, timeoutMs){
    return new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const obs = new MutationObserver(() => {
        const el2 = document.querySelector(selector);
        if (el2) { obs.disconnect(); resolve(el2); }
      });
      obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
      if (timeoutMs && timeoutMs > 0) {
        setTimeout(() => { try{obs.disconnect();}catch{} resolve(null); }, timeoutMs);
      }
    });
  }

  function escapeHtml(s){
    return String(s||'').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  function initials(name){
    const parts = (name||'').trim().split(/\s+/).slice(0,2);
    return parts.map(p=>p[0]?.toUpperCase()||'').join('') || 'U';
  }

  function avatarHtml(url, name, size){
    size = size || 28;
    if (url) return `<img src="${escapeHtml(url)}" alt="" class="rounded-circle" style="width:${size}px;height:${size}px;object-fit:cover;">`;
    const ini = initials(name);
    return `<div class="rounded-circle bg-light border d-inline-flex align-items-center justify-content-center" style="width:${size}px;height:${size}px;font-size:${Math.max(10,Math.floor(size*0.5))}px;">${ini}</div>`;
  }

  async function fetchOnce(){
    try{
      if (!window.supabase) { console.warn('header-auth.once: supabase not found'); return null; }
      if (window.__headerAuthCache) return window.__headerAuthCache;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.__headerAuthCache = { user: null, profile: null, roles: { owner:false, employee:false } };
        return window.__headerAuthCache;
      }

      // Parallel: profile + store roles (owner/employee)
      const [profRes, ownerRes, empRes] = await Promise.allSettled([
        supabase.from('profiles').select(PROFILE_FIELDS).eq('id', user.id).single(),
        supabase.from('v_store_owners').select('user_id').eq('user_id', user.id).limit(1),
        supabase.from('store_employees').select('store_id').eq('user_id', user.id).limit(1),
      ]);

      const profile = profRes.status === 'fulfilled' ? (profRes.value.data || null) : null;
      const ownerRows = ownerRes.status === 'fulfilled' ? (ownerRes.value.data || []) : [];
      const empRows = empRes.status === 'fulfilled' ? (empRes.value.data || []) : [];
      const roles = { owner: ownerRows.length > 0, employee: empRows.length > 0 };

      window.__headerAuthCache = { user, profile, roles };
      return window.__headerAuthCache;
    }catch(e){
      console.warn('header-auth.once: fetch failed', e);
      return null;
    }
  }

  function render(container, cache){
    if (!container) return;
    const user = cache?.user || null;
    const prof = cache?.profile || null;
    const name = prof?.full_name || 'Guest';
    const avatar = prof?.avatar_url || null;

    if (!user) {
      container.innerHTML = `
        <a class="btn btn-sm btn-outline-success" href="/auth/login.html">Sign in</a>
      `;
      return;
    }

    container.innerHTML = `
      <div class="d-flex align-items-center gap-2">
        ${avatarHtml(avatar, name, 28)}
        <div class="d-flex flex-column">
          <strong class="small">${escapeHtml(name)}</strong>
          <a class="small text-decoration-none" href="/communityhub/hub.html?module=profile&id=${encodeURIComponent(user.id)}">My profile</a>
        </div>
        <a class="btn btn-sm btn-outline-secondary ms-2" href="/auth/logout.html">Logout</a>
      </div>
    `;
  }

  onDomReady(async () => {
    const cache = await fetchOnce();
    const container = await onceElement(SEL_CONTAINER, 5000);
    render(container, cache);
    console.log('✅ header-auth.once loaded (single fetch, no polling)');
  });
})();