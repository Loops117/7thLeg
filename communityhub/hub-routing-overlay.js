// /communityhub/hub-routing-overlay.js
// Drop this AFTER your existing hub.js include on hub.html
// Ensures Back/Forward actually loads modules + re-highlights the correct menu item.
// Also intercepts hub sidebar clicks to pushState + load the new module.
//
// Safe: does NOT modify hub.js. It wraps behavior externally.

(function () {
  if (window.__HubRoutingOverlayLoaded) return;
  window.__HubRoutingOverlayLoaded = true;

  const isHub = () => /\/hub\.html(\?|$)/.test(location.pathname);
  if (!isHub()) return;

  function getModuleFromUrl() {
    const usp = new URLSearchParams(location.search);
    return usp.get("module") || "home";
  }

  function setActiveByModule(mod) {
    const links = document.querySelectorAll("#hub-sidebar .nav-link");
    links.forEach(l => l.classList.remove("active"));
    const el = document.querySelector(`#hub-sidebar .nav-link[data-module="${mod}"]`);
    if (el) el.classList.add("active");
  }

  function pushAndLoad(mod, params) {
    if (!mod) return;
    const usp = new URLSearchParams(location.search);
    usp.set("module", mod);
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) usp.delete(k);
        else usp.set(k, String(v));
      }
    }
    const newUrl = location.pathname + "?" + usp.toString();
    history.pushState({ hub: true, module: mod, _at: Date.now() }, "", newUrl);
    setActiveByModule(mod);
    if (typeof window.loadModule === "function") {
      try { window.loadModule(mod, null, Object.fromEntries(usp.entries())); }
      catch (e) { console.error("Hub overlay: loadModule failed", e); }
    }
  }

  // Intercept clicks on hub sidebar + any anchor to hub.html?module=...
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest('a.nav-link[data-module], a[href*="hub.html?module="]');
    if (!a) return;
    // Ignore if modifier keys are used (open in new tab, etc.)
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button > 0) return;

    let mod = a.getAttribute("data-module");
    let params = {};
    if (!mod && a.tagName === "A") {
      try {
        const u = new URL(a.getAttribute("href"), location.origin);
        if (/hub\.html/.test(u.pathname)) {
          mod = u.searchParams.get("module");
          u.searchParams.forEach((v, k) => { if (k !== "module") params[k] = v; });
        }
      } catch {}
    }
    if (!mod) return;

    ev.preventDefault();
    pushAndLoad(mod, params);
    // Close mobile sidebar if present
    document.getElementById("sidebar-wrapper")?.classList.remove("open");
  }, true);

  // Make sure the initial entry has hub state, so Back knows we're inside
  (function ensureBaseState(){
    const st = history.state;
    if (!st || !st.hub) {
      history.replaceState({ hub: true, module: getModuleFromUrl(), _at: Date.now() }, "", location.href);
    }
  })();

  // Handle Back/Forward
  window.addEventListener("popstate", (ev) => {
    // If the pop has our hub state, load that module.
    if (ev.state && ev.state.hub) {
      const mod = ev.state.module || getModuleFromUrl();
      setActiveByModule(mod);
      if (typeof window.loadModule === "function") {
        try { window.loadModule(mod, null, Object.fromEntries(new URLSearchParams(location.search).entries())); }
        catch (e) { console.error("Hub overlay: popstate loadModule failed", e); }
      }
      return;
    }
    // If we’re still on hub.html but state isn't marked, treat as in-hub nav
    if (isHub()) {
      const mod = getModuleFromUrl();
      setActiveByModule(mod);
      if (typeof window.loadModule === "function") {
        try { window.loadModule(mod, null, Object.fromEntries(new URLSearchParams(location.search).entries())); }
        catch (e) { console.error("Hub overlay: popstate (no state) loadModule failed", e); }
      }
    }
  });

  console.log("✅ hub-routing-overlay.js active");
})();