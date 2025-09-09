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

  // ================= Notifications Bell (once) =================
  if (!window.__HEADER_NOTIF_ONCE__) {
    window.__HEADER_NOTIF_ONCE__ = true;

    function esc(s){ return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
    function timeAgo(ts){
      try{
        const d = (ts instanceof Date) ? ts : new Date(ts);
        const s = Math.floor((Date.now()-d.getTime())/1000);
        if (s<60) return s+'s';
        const m = Math.floor(s/60); if (m<60) return m+'m';
        const h = Math.floor(m/60); if (h<24) return h+'h';
        const dd = Math.floor(h/24); if (dd<7) return dd+'d';
        return d.toLocaleDateString();
      }catch{ return ''; }
    }

    function ensureBellSlot(){
      // Find the UL that contains #nav-user
      const userLi = document.querySelector('#nav-user');
      if (!userLi) return null;
      const ul = userLi.closest('ul.navbar-nav');
      if (!ul) return null;

      let bell = document.getElementById('nav-notifications');
      if (bell) return bell;

      bell = document.createElement('li');
      bell.id = 'nav-notifications';
      bell.className = 'nav-item dropdown';

      bell.innerHTML = `
        <a class="nav-link position-relative" href="#" id="notifBell" role="button" data-bs-toggle="dropdown" aria-expanded="false" title="Notifications">
          <span class="me-1">🔔</span>
          <span id="notifBadge" class="badge bg-danger rounded-pill position-absolute translate-middle" style="top:6px; right:0; display:none;">0</span>
        </a>
        <ul class="dropdown-menu dropdown-menu-end" id="notifMenu" style="max-height:70vh; overflow:auto;">
          <li><h6 class="dropdown-header">Notifications</h6></li>
          <li id="notifItems"><div class="px-3 py-2 small text-muted">Loading…</div></li>
          <li><hr class="dropdown-divider"></li>
          <li><a class="dropdown-item" href="/communityhub/hub.html?module=messages%2Fmessages_inbox">Open Inbox</a></li>
        </ul>
      `;

      // Insert before user menu
      ul.insertBefore(bell, userLi);
      return bell;
    }

    function buildLink(n){
      const meta = n?.metadata || {};
      const base = '/communityhub/hub.html';
      if (n.conversation_id) return `${base}?module=messages/conversation&id=${encodeURIComponent(n.conversation_id)}`;
      const bId = meta.bulletin_id || meta.post_id || (meta.bulletin && meta.bulletin.id);
      if (n.entity_type === 'bulletin_comment' || bId) return `${base}?module=bulletins/view&id=${encodeURIComponent(bId)}`;
      if (n.entity_type === 'review' || meta.review_id){
        const storeId = meta.store_id || meta.review_target_id;
        const userId = meta.user_id || meta.reviewed_user_id;
        if (storeId) return `${base}?module=store/view_store&id=${encodeURIComponent(storeId)}&sub=reviews`;
        if (userId)  return `${base}?module=profile&id=${encodeURIComponent(userId)}&sub=reviews`;
        return `${base}?module=home`;
      }
      if (n.entity_type === 'bulletin') return `${base}?module=bulletins/view&id=${encodeURIComponent(n.entity_id)}`;
      return `${base}?module=home`;
    }

    function notifRow(n){
      const url = buildLink(n);
      const txt = n.snippet || (n.type ? String(n.type).replace(/_/g,' ') : 'Notification');
      const ago = timeAgo(n.created_at);
      const badge = !n.read_at ? '<span class="badge bg-primary ms-2">new</span>' : '';
      return '<li><a class="dropdown-item d-flex align-items-start gap-2" href="'+esc(url)+'">'
        + '<div class="flex-grow-1 small">'+esc(txt)+' '+badge+'</div>'
        + '<div class="text-muted xsmall">'+esc(ago)+'</div>'
        + '</a></li>';
    }

    async function fetchNotifications(limit=15){
      const sb = window.supabase;
      if (!sb || !sb.auth) return [];
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return [];
      const { data, error } = await sb
        .from('notifications')
        .select('id, type, snippet, created_at, read_at, entity_type, entity_id, conversation_id, actor_user_id, metadata')
        .eq('recipient_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) { console.warn('[notif] fetch error', error); return []; }
      return data || [];
    }

    async function markAllRead(){
      try{
        const sb = window.supabase; if (!sb || !sb.auth) return;
        const { data: { user } } = await sb.auth.getUser(); if (!user) return;
        await sb.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null).eq('recipient_user_id', user.id);
      }catch{}
    }

    async function refreshMenu(){
      ensureBellSlot();
      const list = document.getElementById('notifItems');
      const badge = document.getElementById('notifBadge');
      if (!list) return;
      list.innerHTML = '<div class="px-3 py-2 small text-muted">Loading…</div>';
      const items = await fetchNotifications(15);
      if (!items.length) {
        list.innerHTML = '<div class="px-3 py-2 small text-muted">No notifications</div>';
      } else {
        list.innerHTML = items.map(notifRow).join('');
      }
      const unread = items.filter(x=>!x.read_at).length;
      if (badge){
        if (unread>0){ badge.style.display='inline-block'; badge.textContent = String(Math.min(unread,9)); }
        else { badge.style.display='none'; }
      }
    }

    function wireBell(){
      const bellLi = ensureBellSlot(); if (!bellLi) return;
      const menuEl = bellLi.querySelector('#notifMenu');
      const bell = bellLi.querySelector('#notifBell');
      if (!menuEl || !bell) return;

      // If Bootstrap is available, refresh on dropdown show
      const hasBs = !!(window.bootstrap && window.bootstrap.Dropdown);
      if (hasBs){
        bell.addEventListener('shown.bs.dropdown', function(){ markAllRead(); });
        bell.addEventListener('show.bs.dropdown', function(){ refreshMenu(); });
      } else {
        // Fallback: click toggles menu + refresh
        bell.addEventListener('click', function(e){
          e.preventDefault();
          const open = menuEl.classList.toggle('show');
          if (open){ refreshMenu(); markAllRead(); }
        });
        document.addEventListener('click', function(e){
          if (!bellLi.contains(e.target)) menuEl.classList.remove('show');
        });
      }
    }

    function initNotifications(){
      ensureBellSlot();
      wireBell();
      // Initial preload (best-effort)
      setTimeout(refreshMenu, 200);
      // Periodic refresh
      setInterval(refreshMenu, 60*1000);
      // Refresh on auth change
      try{ window.supabase?.auth?.onAuthStateChange?.(function(){ setTimeout(refreshMenu, 200); }); }catch{}
    }

    onDomReady(initNotifications);
  }

})();