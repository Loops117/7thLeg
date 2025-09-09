document.addEventListener("DOMContentLoaded", () => {
  const content = document.getElementById("hub-content");
  const links = document.querySelectorAll("#hub-sidebar .nav-link");
  const sidebarWrapper = document.getElementById("sidebar-wrapper");

  // Inject header/footer, then init auth ONCE, then load Home or URL param
  includeHTML(async () => {
    if (!window.__HEADER_SCRIPT_ATTACHED__) {
      window.__HEADER_SCRIPT_ATTACHED__ = true;

      const script = document.createElement("script");
      script.src = "/assets/js/header-auth.once.js"; // ← single-fetch version, no cache-bust
      script.onload = async () => {
        console.log("✅ header-auth.once loaded after header");

        // Run once after header is ready
        await (window.wireStoreMenu?.());
        await (window.loadAdRail?.());
        await (window.wirePromoCard?.());

        const params = new URLSearchParams(window.location.search);
        const module = params.get("module") || "home";
        const userId = params.get("id");

        const currentLink = document.querySelector(`#hub-sidebar [data-module="${module}"]`);
        if (currentLink) {
          links.forEach(l => l.classList.remove("active"));
          currentLink.classList.add("active");
        }

        loadModule(module, userId);
      };
      document.head.appendChild(script);
    } else {
      // Header auth already attached (e.g., soft re-init) — just load the target module
      const params = new URLSearchParams(window.location.search);
      const module = params.get("module") || "home";
      const userId = params.get("id");
      loadModule(module, userId);
    }
  });


  async function loadModule(name, userId = null, params = {}) {
    
    // Keep the URL canonical (strip stale params; flatten object ids)
    try {
      const toPlain = (v) => {
        if (v === undefined || v === null) return v;
        if (typeof v === 'object') {
          if (v && (typeof v.id === 'string' || typeof v.id === 'number')) return v.id;
          if (v && (typeof v.value === 'string' || typeof v.value === 'number')) return v.value;
          if (Array.isArray(v)) return v.join(',');
          return String(v);
        }
        return v;
      };
      const norm = {};
      if (params && typeof params === 'object') {
        for (const [k, v] of Object.entries(params)) {
          const pv = toPlain(v);
          if (pv !== undefined && pv !== null && String(pv) !== '') norm[k] = pv;
        }
      }
      const idPlain = toPlain(userId);
      if (idPlain !== undefined && idPlain !== null && String(idPlain) !== '') norm.id = idPlain;
      const usp = new URLSearchParams();
      usp.set('module', name || 'home');
      Object.entries(norm).forEach(([k, v]) => usp.set(k, v));
      history.replaceState({ module: name, params: norm }, '', `/communityhub/hub.html?${usp.toString()}`);
    } catch {}
try {
      const res = await fetch(`hub_modules/${name}.html`);
      if (!res.ok) throw new Error(`Module ${name} not found`);
      const html = await res.text();
      content.innerHTML = html;

      // Reload module JS with cache-busting + better logging
      const scriptUrl = `./hub_modules/${name}.js?v=${Date.now()}`;
      import(scriptUrl).then(mod => {
        console.log(`✅ ${name}.js loaded successfully`);
        if (mod.init) {
          console.log(`📌 Running init() for ${name}`);
          // Support both (id, params) and ({...options}) styles
          try { mod.init(userId, params); } catch {
            mod.init({ id: userId, ...params });
          }
        }
      }).catch(err => {
        console.error(`❌ Failed to import ${name}.js:`, err);
        content.innerHTML += `<p class="text-danger">Failed to load ${name}.js</p>`;
      });

    } catch (err) {
      console.error(`❌ Error loading module ${name}:`, err);
      content.innerHTML = `<p class="text-danger">Failed to load ${name}.</p>`;
    }
  }

  // ✅ Make loadModule globally available
  window.loadModule = loadModule;

  // Sidebar link clicks
  links.forEach(link => {
    link.addEventListener("click", e => {
      const moduleName = link.dataset.module;

      // ✅ If no data-module, let browser handle navigation (like Dashboard)
      if (!moduleName) return;

      e.preventDefault();
      links.forEach(l => l.classList.remove("active"));
      link.classList.add("active");
      loadModule(moduleName);
      sidebarWrapper.classList.remove("open"); // close on mobile
    });
  });

  // -------- My Store menu reveal (owner or employee) ----------
  async function wireStoreMenu() {
    const li = document.getElementById("nav-store-item");
    if (!li || !window.supabase) return;

    try {
      const { data: { user } } = await window.supabase.auth.getUser();
      if (!user) { li.style.display = "none"; return; }

      let eligible = false;

      // Try subscription-based owner view (if present)
      try {
        const { data: ownerRow, error } = await window.supabase
          .from("v_store_owners")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!error && ownerRow?.user_id) eligible = true;
      } catch (_) { /* view may not exist yet */ }

      // Fallbacks: owner of a store OR employee of a store
      if (!eligible) {
        const [owned, employed] = await Promise.all([
          window.supabase.from("store_profiles").select("id").eq("owner_id", user.id).limit(1),
          window.supabase.from("store_employees").select("store_id").eq("user_id", user.id).limit(1),
        ]);
        eligible = (owned?.data?.length > 0) || (employed?.data?.length > 0);
      }

      li.style.display = eligible ? "" : "none";

      // Also listen for auth changes to re-evaluate (login/logout)
      window.supabase.auth.onAuthStateChange(() => wireStoreMenuSafe());
    } catch {
      li.style.display = "none";
    }
  }

  // Debounced wrapper so we don't spam queries on rapid auth events
  let _wireTimer = null;
  function wireStoreMenuSafe() {
    clearTimeout(_wireTimer);
    _wireTimer = setTimeout(() => wireStoreMenu(), 200);
  }

  // Load a random vertical ad from store_profiles.vertical_ad_url (non-null/non-empty)
  async function waitForSupabase(timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (window.supabase && window.supabase.from && window.supabase.auth) return window.supabase;
      await new Promise(r => setTimeout(r, 60));
    }
    console.error("Supabase not available for ad rail");
    return null;
  }

  async function loadAdRail() {
    const supabase = await waitForSupabase();
    const img = document.getElementById("hub-vert-ad-img");
    const ph = document.getElementById("hub-vert-ad-ph");
    const brand = document.getElementById("hub-ad-brand");
    const link = document.getElementById("hub-vert-ad-link");
    if (!supabase || !img || !ph || !brand || !link) return;

    try {
      const { data, error } = await supabase
        .from("store_profiles")
        .select("id, slug, name, vertical_ad_url")
        .not("vertical_ad_url", "is", null)
        .neq("vertical_ad_url", "")
        .limit(100);
      if (error) throw error;
      const list = Array.isArray(data) ? data.filter(r => !!r.vertical_ad_url) : [];
      if (!list.length) {
        // No ads available; keep placeholder text
        return;
      }
      const pick = list[Math.floor(Math.random() * list.length)];

      // Render
      img.src = pick.vertical_ad_url;
      img.style.display = "block";
      ph.style.display = "none";
      brand.textContent = pick.name ? `Visit ${pick.name}` : "Visit store";

      // Click → open store view module in hub
      const targetParams = pick.slug ? { slug: pick.slug } : { id: pick.id };
      const href = pick.slug
        ? `/communityhub/hub.html?module=store/view_store&slug=${encodeURIComponent(pick.slug)}`
        : `/communityhub/hub.html?module=store/view_store&id=${encodeURIComponent(pick.id)}`;
      link.setAttribute("href", href);
      link.addEventListener("click", (e) => {
        // route inside the hub
        e.preventDefault();
        if (window.loadModule) {
          window.loadModule("store/view_store", null, targetParams);
        } else {
          // Fallback: navigate
          window.location.href = href;
        }
      }, { once: true });
    } catch (e) {
      console.warn("Ad rail load failed", e);
    }
  }

  // expose for boot
  window.loadAdRail = loadAdRail;



  async function wirePromoCard() {
    try {
      const supabase = await waitForSupabase();
      const btn = document.getElementById("btn-store-promo");
      if (!supabase || !btn) return;

      // default: owner flow
      const ownerHref = "/communityhub/hub.html?module=store/my_store&sub=store_advertising";
      let isStoreUser = false;

      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.id) {
        try {
          const owned = await supabase.from("store_profiles").select("id").eq("owner_id", user.id).limit(1);
          const emp = await supabase.from("store_employees").select("store_id").eq("user_id", user.id).limit(1);
          isStoreUser = (Array.isArray(owned.data) && owned.data.length > 0) || (Array.isArray(emp.data) && emp.data.length > 0);
        } catch (e) {
          console.warn("store owner check failed", e);
        }
      }

      if (isStoreUser) {
        // keep text & link, route inside hub if possible
        btn.textContent = "Advertise your store";
        btn.setAttribute("href", ownerHref);
        btn.onclick = (ev) => {
          ev.preventDefault();
          if (window.loadModule) {
            window.loadModule("store/my_store", null, { sub: "store_advertising" });
          } else {
            window.location.href = ownerHref;
          }
        };
      } else {
        // change to "Add your store" and show popup
        btn.textContent = "Add your store";
        btn.setAttribute("href", "#");
        btn.onclick = (ev) => {
          ev.preventDefault();
          alert("Store Sign-up isn't open yet.");
        };
      }
    } catch (e) {
      console.warn("wirePromoCard failed", e);
    }
  }

  // expose for boot
  window.wirePromoCard = wirePromoCard;


  // Inject header/footer, then init auth ONCE, then load module
  includeHTML(async () => {
    if (window.__HUB_BOOTED__) return;   // ← add this line
    window.__HUB_BOOTED__ = true;        // ← and this

    // ... your existing injection of header-auth.once.js and subsequent code
  });

  

});
