document.addEventListener("DOMContentLoaded", () => {
  const content = document.getElementById("hub-content");
  const links = document.querySelectorAll("#hub-sidebar .nav-link");
  const sidebarWrapper = document.getElementById("sidebar-wrapper");

  // Inject header/footer, then init auth, then load Home or URL param
  includeHTML(async () => {
    const script = document.createElement("script");
    script.src = "/assets/js/header-auth.js?v=" + Date.now(); // cache-bust
    script.onload = async () => {
      console.log("✅ header-auth.js loaded after header");

      // After auth is ready, decide whether to reveal "My Store"
      await wireStoreMenu();

      // Read query params
      const params = new URLSearchParams(window.location.search);
      const module = params.get("module") || "home";
      const userId = params.get("id");

      // Highlight the correct nav on first load (if present)
      const currentLink = document.querySelector(`#hub-sidebar [data-module="${module}"]`);
      if (currentLink) {
        links.forEach(l => l.classList.remove("active"));
        currentLink.classList.add("active");
      }

      // Load the module with optional user ID
      loadModule(module, userId);
    };
    document.body.appendChild(script);
  });

  async function loadModule(name, userId = null, params = {}) {
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
});
