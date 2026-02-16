// userspecies.js — loads subviews from /communityhub/hub_modules/userspecies/
(function () {
  const BASE = '/communityhub/hub_modules/userspecies/';
  function ensureCSS() {
    if (!document.querySelector('link[href*="hub_modules/userspecies/userspecies.css"]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = BASE + 'userspecies.css';
      document.head.appendChild(l);
    }
  }
  function getViewFromURL() {
    const u = new URL(location.href);
    const m = (u.searchParams.get('module') || '').toLowerCase();
    let v = (u.searchParams.get('view') || '').toLowerCase();
    if (!v) {
      if (m === 'userspecies_cards') v = 'cards';
      else if (m === 'userspecies_table') v = 'table';
      else if (m === 'userspecies_excel') v = 'excel';
    }
    return v || 'excel'; // default to TABLE
  }
  async function loadView(view) {
    ensureCSS();
    const host = document.getElementById('userspecies-host');
    if (!host) return;
    // Load HTML
    const htmlURL = BASE + view + '.html';
    const r = await fetch(htmlURL);
    host.innerHTML = await r.text();
    // Load JS module and run init()
    try {
      const mod = await import(BASE + view + '.js');
      if (mod && typeof mod.init === 'function') await mod.init();
    } catch (e) {
      console.warn('[userspecies] failed to init view', view, e);
    }
    updateButtons(view);
    cleanURL(view);
    wireAddButton(); // ensure Add button is live after the view loads
  }
  function cleanURL(view) {
    try {
      const u = new URL(location.href);
      if (u.searchParams.get('module')?.startsWith('userspecies_')) u.searchParams.set('module', 'userspecies');
      else if (!u.searchParams.get('module')) u.searchParams.set('module', 'userspecies');
      u.searchParams.set('view', view);
      u.searchParams.delete('id');
      history.replaceState(history.state, '', u.pathname + '?' + u.searchParams.toString());
      document.body.dataset.activeModule = 'userspecies';
    } catch { }
  }
  function updateButtons(view) {
    document.querySelectorAll('#userspecies-shell [data-view]').forEach(el => {
      const on = el.getAttribute('data-view') === view;
      el.classList.toggle('btn-primary', on);
      el.classList.toggle('btn-outline-secondary', !on);
    });
  }
  function wireNav() {
    document.querySelectorAll('#userspecies-shell [data-view]').forEach(el => {
      el.addEventListener('click', (e) => {
        const v = el.getAttribute('data-view');
        if (el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true') return;
        e.preventDefault();
        loadView(v);
      });
    });
  }
  function wireAddButton() {
    const btn = document.getElementById('add-species-top');
    if (!btn) return;
    btn.onclick = (e) => {
      e.preventDefault();
      if (typeof window.openAddSpecies === 'function') { window.openAddSpecies(); }
      else {
        setTimeout(() => { if (typeof window.openAddSpecies === 'function') window.openAddSpecies(); }, 200);
      }
    };
  }

  function buildPublicLink(userId, list) {
    try {
      const u = new URL('/userprofile.html', location.origin);
      u.searchParams.set('id', userId);
      if (list) u.searchParams.set('list', list); // 'inventory' | 'wishlist'
      return u.toString();
    } catch {
      return '/userprofile.html?id=' + encodeURIComponent(userId) + (list ? '&list=' + encodeURIComponent(list) : '');
    }
  }
  async function copyText(txt) {
    try {
      await navigator.clipboard.writeText(txt);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch { return false; }
    }
  }
  function wireCopyInventoryButton() {
    const btn = document.getElementById('copy-inventory-link');
    const icon = document.getElementById('copy-icon');
    const label = document.getElementById('copy-label');
    if (!btn) return;

    const supa = window.supabase;

    async function getUserId() {
      try { const { data: { user } } = await supa.auth.getUser(); return user?.id || null; }
      catch { return null; }
    }

    btn.addEventListener('click', async (e) => {
      e.preventDefault();

      const uid = await getUserId();
      if (!uid) { alert('Please sign in first.'); return; }

      // Uses your existing link builder
      const url = buildPublicLink(uid, 'inventory');

      btn.disabled = true;

      const ok = await copyText(url);

      // nice feedback
      if (ok) {
        if (icon) icon.textContent = '✅';
        if (label) label.textContent = 'Copied!';
        btn.classList.remove('btn-outline-secondary');
        btn.classList.add('btn-success');
      } else {
        if (icon) icon.textContent = '⚠️';
        if (label) label.textContent = 'Copy failed';
        btn.classList.remove('btn-outline-secondary');
        btn.classList.add('btn-outline-danger');
      }

      setTimeout(() => {
        btn.disabled = false;
        if (icon) icon.textContent = '📋';
        if (label) label.textContent = 'Copy Inventory Link';
        btn.classList.remove('btn-success', 'btn-outline-danger');
        btn.classList.add('btn-outline-secondary');
      }, 1200);
    });
  }

  function init() {
    wireCopyInventoryButton();
    wireNav();
    wireAddButton();
    loadView(getViewFromURL());
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();