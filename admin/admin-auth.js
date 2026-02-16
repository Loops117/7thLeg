// admin-auth.js — Admin gate that loads admin tab scripts ONLY after admin passes
(function () {
  console.log("✅ admin-auth.js (admin gate)");

  async function waitForSupabase(timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (window.supabase && window.supabase.from && window.supabase.auth) return window.supabase;
      await new Promise(r => setTimeout(r, 60));
    }
    return null;
  }

  function showGate(msg, isError) {
    const box = document.getElementById("admin-gate");
    if (!box) return;
    box.innerHTML =
      '<div style="font-weight:600;color:' + (isError ? '#b00020' : '#111') + ';">' + msg + '</div>' +
      (isError ? '<div style="opacity:.75;font-size:13px;margin-top:6px;">Check DevTools → Console for details.</div>' : '');
  }

  function setHeader() {
    const el = document.getElementById("admin-header");
    if (!el) return;
    el.innerHTML = ''
      + '<header style="position:sticky;top:0;z-index:50;padding:12px 16px;background:#111;color:#fff;display:flex;align-items:center;justify-content:space-between;">'
      +   '<div style="display:flex;align-items:center;gap:10px;">'
      +     '<strong>7th Leg Admin</strong>'
      +     '<span style="opacity:.75;font-size:12px;">/admin/ad-dash.html</span>'
      +   '</div>'
      +   '<div style="display:flex;align-items:center;gap:10px;">'
      +     '<a href="/index.html" style="color:#fff;text-decoration:none;opacity:.9;">Exit</a>'
      +   '</div>'
      + '</header>';
  }

  function wireTabs() {
    const btns = Array.from(document.querySelectorAll("[data-tab]"));
    const panels = Array.from(document.querySelectorAll("[data-tabpanel]"));

    function activate(name) {
      btns.forEach(b => {
        const on = b.getAttribute("data-tab") === name;
        b.classList.toggle("btn-primary", on);
        b.classList.toggle("btn-outline-primary", !on);
      });
      panels.forEach(p => {
        p.style.display = (p.getAttribute("data-tabpanel") === name) ? "" : "none";
      });
    }

    btns.forEach(b => b.addEventListener("click", () => activate(b.getAttribute("data-tab"))));
    activate("users");
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = false; // preserve order
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error("Failed to load: " + src));
      document.head.appendChild(s);
    });
  }

  async function boot() {
    setHeader();
    showGate("Checking admin access…");

    const supabase = await waitForSupabase();
    if (!supabase) {
      console.error("Supabase client not found. Is /assets/js/config.js loading and setting window.supabase?");
      showGate("Supabase not initialized.", true);
      return;
    }

    const { data, error } = await supabase.auth.getUser();
    if (error) console.warn("getUser error:", error);

    const user = data && data.user;
    if (!user) {
      console.warn("No session. Redirecting.");
      window.location.href = "/login.html";
      return;
    }

    // Admin check (expects profiles.role === 'admin')
    let prof;
    try {
      const res = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", user.id)
        .single();
      if (res.error) throw res.error;
      prof = res.data;
    } catch (e) {
      console.error("Profile/role fetch failed:", e);
      showGate("Cannot verify admin role (profiles query failed).", true);
      return;
    }

    if (!prof || String(prof.role || "").toLowerCase() !== "admin") {
      console.warn("Not admin:", prof && prof.role);
      window.location.href = "/index.html";
      return;
    }

    // Passed
    const who = document.getElementById("admin-who");
    if (who) who.textContent = (prof.full_name ? prof.full_name + " • " : "") + user.email;

    const gate = document.getElementById("admin-gate");
    const shell = document.getElementById("admin-shell");
    if (gate) gate.style.display = "none";
    if (shell) shell.style.display = "";

    wireTabs();

    // Load admin tab scripts ONLY after admin passes
    try {
      await loadScript("/assets/js/users.js");
      await loadScript("/assets/js/stores.js");
      await loadScript("/assets/js/expos.js");
      console.log("✅ Admin tab scripts loaded.");
    } catch (e) {
      console.error(e);
      showGate("Admin scripts failed to load. Check paths in console.", true);
      const gate2 = document.getElementById("admin-gate");
      if (gate2) gate2.style.display = "";
      const shell2 = document.getElementById("admin-shell");
      if (shell2) shell2.style.display = "none";
      return;
    }

    // Refresh button just reloads page (simple + safe)
    const refBtn = document.getElementById("admin-refresh");
    if (refBtn && !refBtn.dataset.wired) {
      refBtn.dataset.wired = "1";
      refBtn.addEventListener("click", () => window.location.reload());
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})(); 
