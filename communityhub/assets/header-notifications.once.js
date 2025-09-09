// /communityhub/assets/header-notifications.once.js
console.info('[notif] script loaded');

(function(){
  function supa(){ return window.supabase; }
  function $(sel, root=document){ return root.querySelector(sel); }
  function esc(s){ const m={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}; return String(s??'').replace(/[&<>"']/g,c=>m[c]); }
  function timeAgo(ts){
    try{ const d=(ts instanceof Date)?ts:new Date(ts); const s=((Date.now()-d.getTime())/1000)|0;
      if(s<60) return s+'s'; const m=(s/60)|0; if(m<60) return m+'m'; const h=(m/60)|0; if(h<24) return h+'h'; const dd=(h/24)|0; if(dd<7) return dd+'d'; return d.toLocaleDateString();
    }catch{ return ''; }
  }

  const TARGETS = [
    '#site-header .header-actions',
    '#header .header-actions',
    '#header .ms-auto',
    '#header .navbar-nav',
    '#header',
    '#header-actions',
    'header .header-actions',
    'header .ms-auto',
    'header nav .ms-auto',
    'header nav .navbar-nav',
    '.header-actions',
    '.navbar .ms-auto',
    '.navbar-nav'
  ];

  function findHeader(){
    for (const sel of TARGETS){
      const el = $(sel);
      if (el){ console.info('[notif] header target:', sel, el); return el; }
    }
    return null;
  }

  function mountBell(into){
    if ($('#notif-bell-wrap')) return; // already mounted
    const wrap = document.createElement('div');
    wrap.id = 'notif-bell-wrap';
    wrap.style.position = into ? 'relative' : 'fixed';
    if (!into){
      wrap.style.top = '10px';
      wrap.style.right = '10px';
      wrap.style.zIndex = '2000';
    }
    wrap.innerHTML = `
      <button id="notif-bell" class="btn btn-link p-2" style="text-decoration:none">
        <span style="font-size:18px">🔔</span>
        <span id="notif-dot" class="position-absolute translate-middle badge rounded-pill bg-danger" style="top:4px; right:2px; display:none;">0</span>
      </button>
      <div id="notif-menu" class="dropdown-menu shadow" style="display:none; position:absolute; right:0; top:100%; min-width:320px; max-height:70vh; overflow:auto;">
        <div class="px-3 py-2 small text-muted border-bottom">Notifications</div>
        <div id="notif-list"></div>
        <div class="px-3 py-2 small text-muted border-top"><a href="/communityhub/hub.html?module=messages/inbox">Open Inbox</a></div>
      </div>
    `;
    if (into) into.appendChild(wrap); else document.body.appendChild(wrap);
    console.info('[notif] bell mounted', into ? 'in header' : 'floating');
    wireBell();
  }

  async function fetchNotifications(limit=15){
    try{
      const s = supa(); if (!s || !s.auth) return [];
      const { data: { user } } = await s.auth.getUser();
      if (!user) return [];
      const { data, error } = await s
        .from('notifications')
        .select('id, type, snippet, created_at, read_at, entity_type, entity_id, conversation_id, actor_user_id, metadata')
        .eq('recipient_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    }catch(e){ console.warn('[notif] fetch error', e); return []; }
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

  function itemRow(n){
    const url = buildLink(n);
    const text = n.snippet || (n.type ? String(n.type).replace(/_/g,' ') : 'Notification');
    const ago = timeAgo(n.created_at);
    const unreadDot = !n.read_at ? '<span class="badge bg-primary ms-2">new</span>' : '';
    return `
      <a class="dropdown-item d-flex align-items-start gap-2" href="${esc(url)}">
        <div class="flex-grow-1">
          <div class="small">${esc(text)} ${unreadDot}</div>
          <div class="text-muted xsmall">${esc(ago)}</div>
        </div>
      </a>`;
  }

  async function renderMenu(){
    const list = $('#notif-list'); const dot = $('#notif-dot'); if (!list) return;
    list.innerHTML = '<div class="px-3 py-2 small text-muted">Loading…</div>';
    const items = await fetchNotifications(15);
    list.innerHTML = items.length ? items.map(itemRow).join('') : '<div class="px-3 py-2 small text-muted">No notifications</div>';
    const unread = items.filter(x => !x.read_at).length;
    if (dot) { dot.style.display = unread>0 ? 'inline-block' : 'none'; if (unread>0) dot.textContent = String(Math.min(unread,9)); }
  }

  async function markAllRead(){
    try{
      const s = supa(); if (!s || !s.auth) return;
      const { data: { user } } = await s.auth.getUser();
      if (!user) return;
      await s.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null).eq('recipient_user_id', user.id);
    }catch{}
  }

  function wireBell(){
    const btn = $('#notif-bell'); const menu = $('#notif-menu'); if (!btn || !menu) return;
    let open = false;
    function toggle(next){
      open = (next==null) ? !open : !!next;
      menu.style.display = open ? 'block' : 'none';
      if (open){ renderMenu(); markAllRead(); }
    }
    btn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); toggle(); });
    document.addEventListener('click', (e)=>{ if (open && !$('#notif-bell-wrap')?.contains(e.target)) toggle(false); });
  }

  function boot(){
    // Try immediate mount
    const target = findHeader();
    if (target) mountBell(target);
    else mountBell(null); // floating fallback

    // If header appears later, move the bell inside it
    const mo = new MutationObserver(() => {
      if ($('#notif-bell-wrap') && $('#notif-bell-wrap').parentElement && $('#notif-bell-wrap').parentElement.matches && $('#notif-bell-wrap').parentElement.matches('#header, .header-actions, .ms-auto, .navbar-nav')){
        return;
      }
      const t = findHeader();
      if (t){
        const wrap = $('#notif-bell-wrap');
        if (wrap && wrap.parentElement !== t){ t.appendChild(wrap); wrap.style.position = 'relative'; console.info('[notif] bell moved into header'); }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // Poll Supabase until ready to fetch
    (function waitForSupabase(attempts=0){
      if (supa() && supa().auth){ setTimeout(renderMenu, 50); return; }
      if (attempts > 60) return;
      setTimeout(()=>waitForSupabase(attempts+1), 250);
    })();

    // Periodic refresh
    setInterval(renderMenu, 60*1000);

    // Refresh on auth change
    try{ supa()?.auth?.onAuthStateChange?.(()=> setTimeout(renderMenu, 200)); }catch{}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  // Local helpers
  function findHeader(){
    for (const sel of TARGETS){
      const el = document.querySelector(sel);
      if (el){ console.info('[notif] header target:', sel, el); return el; }
    }
    return null;
  }
})();