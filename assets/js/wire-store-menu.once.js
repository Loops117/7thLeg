// /assets/js/wire-store-menu.once.js
// Defines window.wireStoreMenu() so hub.js can call it after the header loads.
// Shows the "My Store" nav item if the user is a store owner or employee.
// Single-fetch: reuses header-auth.once cache if present; otherwise does one read.
// Idempotent: safe to call multiple times.

(function(){
  if (window.__WIRE_STORE_MENU_INSTALLED__) return;
  window.__WIRE_STORE_MENU_INSTALLED__ = true;

  // Try to locate possible "My Store" elements in both header and hub sidebar.
  function resolveTargets(){
    const selectors = [
      '#nav-mystore',
      '#mystore-link',
      '.nav-my-store',
      '#hub-sidebar .nav-link[data-module="store/my_store"]',
      '#hub-sidebar .nav-link[data-module="my_store"]',
      '#hub-sidebar a[href*="module=store/my_store"]',
      '#hub-sidebar a[href*="module=store"]',
      'a[href*="module=store/my_store"]',
      'a[href*="module=store"]',
    ];
    const dedup = new Set();
    const out = [];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (!el) return;
        if (!dedup.has(el)) { dedup.add(el); out.push(el); }
      });
    });
    return out;
  }

  function showEl(el, show){
    const li = el.closest('li') || el;
    if (show) {
      li.classList.remove('d-none');
      li.style.display = '';
      // optional: ensure clickable
      if (li.tagName === 'A') li.removeAttribute('aria-disabled');
    } else {
      li.classList.add('d-none');
    }
  }

  async function getRolesOnce(){
    const cache = window.__headerAuthCache;
    if (cache && cache.user) {
      return { uid: cache.user.id, owner: !!cache.roles?.owner, employee: !!cache.roles?.employee };
    }

    if (!window.supabase) return { uid: null, owner: false, employee: false };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { uid: null, owner: false, employee: false };

    window.__storeRoleCache = window.__storeRoleCache || new Map();
    if (window.__storeRoleCache.has(user.id)) {
      return window.__storeRoleCache.get(user.id);
    }

    const [ownerRes, empRes] = await Promise.allSettled([
      supabase.from('v_store_owners').select('user_id').eq('user_id', user.id).limit(1),
      supabase.from('store_employees').select('store_id').eq('user_id', user.id).limit(1),
    ]);

    const ownerRows = ownerRes.status === 'fulfilled' ? (ownerRes.value.data || []) : [];
    const empRows   = empRes.status === 'fulfilled' ? (empRes.value.data || []) : [];
    const roles = { uid: user.id, owner: ownerRows.length > 0, employee: empRows.length > 0 };
    window.__storeRoleCache.set(user.id, roles);
    return roles;
  }

  async function wireStoreMenu(){
    try{
      const targets = resolveTargets();
      if (!targets.length) {
        // If nav hasn't been injected yet, wait briefly and retry once
        setTimeout(wireStoreMenu, 300);
        return;
      }

      const roles = await getRolesOnce();
      const shouldShow = !!(roles.owner || roles.employee);

      targets.forEach(el => showEl(el, shouldShow));

      // Also update any "My Store" CTA button that might exist
      const ctas = document.querySelectorAll('[data-cta="my-store"]');
      ctas.forEach(el => showEl(el, shouldShow));

      console.log('✅ wireStoreMenu: applied', { show: shouldShow, roles });
    }catch(e){
      console.warn('wireStoreMenu failed', e);
    }
  }

  // Expose the function for hub.js to await
  window.wireStoreMenu = wireStoreMenu;
})();
