// communityhub/hub-history.js
// Back/forward controller for the Hub. Keeps navigation inside hub.html.
(function () {
  if (!window.HubHistory) window.HubHistory = {};
  const isHub = () => /\/hub\.html(\?|$)/.test(location.pathname);
  const currentModule = () => new URLSearchParams(location.search).get("module") || "home";
  let loadModuleFn = null;
  let confirmOnExit = false;

  function ensureBaseState() {
    if (!isHub()) return;
    const st = history.state;
    if (!st || !st.hub) {
      history.replaceState({ hub: true, module: currentModule(), _at: Date.now() }, "", location.href);
    }
  }

  function pushModule(mod, extra = {}) {
    if (!isHub()) return;
    const usp = new URLSearchParams(location.search);
    usp.set("module", mod);
    Object.entries(extra).forEach(([k, v]) => v == null ? usp.delete(k) : usp.set(k, String(v)));
    const url = location.pathname + "?" + usp.toString();
    history.pushState({ hub: true, module: mod, _at: Date.now() }, "", url);
    if (typeof loadModuleFn === "function") {
      try { loadModuleFn(mod, extra.id || null, extra); } catch (e) { console.error(e); }
    }
  }

  function onPopState(ev) {
    if (ev.state && ev.state.hub) {
      const mod = ev.state.module || currentModule();
      if (typeof loadModuleFn === "function") loadModuleFn(mod);
      return;
    }
    if (isHub() && confirmOnExit) {
      const ok = confirm("Leave the Hub?");
      if (!ok) {
        ensureBaseState();
        history.pushState({ hub: true, module: currentModule(), _at: Date.now() }, "", location.href);
      }
    }
  }

  window.HubHistory.navigate = (mod, params) => pushModule(mod, params || {});
  window.HubHistory.setConfirmOnExit = v => { confirmOnExit = !!v; };
  window.HubHistory.register = fn => { loadModuleFn = fn; ensureBaseState(); };

  ensureBaseState();
  addEventListener("popstate", onPopState);
  console.log("✅ HubHistory ready");
})();