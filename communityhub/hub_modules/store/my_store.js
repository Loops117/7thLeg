console.log("✅ store/my_store.js loaded (null-safe options)");

export async function init(options) {
  // hub.loadModule() may pass null; default params only catch undefined
  const opts = options ?? {};
  const supabase = window.supabase;
  const content = document.getElementById("store-content");
  const subtitle = document.getElementById("store-subtitle");
  const subnav = document.getElementById("store-subnav");

  if (!supabase) {
    if (content) content.innerHTML = "<p class='text-danger'>Supabase client not available.</p>";
    return;
  }

  // 1) Ensure user
  let user = null;
  try {
    const res = await supabase.auth.getUser();
    user = res && res.data ? res.data.user : null;
  } catch (e) {
    console.error("❌ supabase.auth.getUser failed", e);
  }
  if (!user) {
    if (content) content.innerHTML = "<p class='text-danger'>You must be logged in to view this page.</p>";
    return;
  }

  // 2) Resolve store_id (owner first, then employee) unless provided
  let storeId = opts.store_id ?? null;
  let storeRow = null;

  try {
    if (!storeId) {
      // Try owner store
      const own = await supabase
        .from("store_profiles")
        .select("id, name, slug, status")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (own.data && own.data.id) {
        storeId = own.data.id;
        storeRow = own.data;
      }
    }
    if (!storeId) {
      // Try employee membership
      const emp = await supabase
        .from("store_employees")
        .select("store_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (emp.data && emp.data.store_id) {
        storeId = emp.data.store_id;
      }
    }
    if (!storeRow && storeId) {
      const sp = await supabase
        .from("store_profiles")
        .select("id, name, slug, status")
        .eq("id", storeId)
        .maybeSingle();
      if (sp.data && sp.data.id) {
        storeRow = sp.data;
      }
    }
  } catch (e) {
    console.error("❌ Failed to resolve store:", e);
  }

  if (!storeId) {
    if (content) {
      content.innerHTML = [
        "<div class='alert alert-warning'>",
        "  No store found for your account yet.",
        "  <div class='small text-muted'>Ask an owner to add you as an employee, or create a store from the dashboard.</div>",
        "</div>"
      ].join("");
    }
    if (subtitle) subtitle.textContent = "No store found";
    return;
  }

  // 3) Update subtitle
  if (subtitle) {
    const label = storeRow && storeRow.name
      ? `${storeRow.name} (${storeRow.slug || "no-slug"})`
      : storeId;
    subtitle.textContent = label;
  }

  // 4) Sub-nav loader
  const defaultSub = "store_details"; // default tab
  let currentSub = defaultSub;

  const openSub = async (subName) => {
    if (!content) return;
    currentSub = subName;

    // active state
    if (subnav) {
      const links = subnav.querySelectorAll(".nav-link");
      links.forEach((a) => {
        const isActive = a.getAttribute("data-sub") === subName;
        if (isActive) a.classList.add("active");
        else a.classList.remove("active");
      });
    }

    // load HTML (absolute path avoids relative issues)
    const htmlUrl = `/communityhub/hub_modules/store/${subName}.html?v=${Date.now()}`;
    try {
      const res = await fetch(htmlUrl);
      if (!res.ok) throw new Error(`Missing ${htmlUrl}`);
      const html = await res.text();
      content.innerHTML = html;
    } catch (err) {
      console.error("❌ Failed to fetch submodule HTML:", err);
      content.innerHTML = `<div class="alert alert-danger">Failed to load ${subName}.html</div>`;
      return;
    }

    // load JS
    const jsUrl = `/communityhub/hub_modules/store/${subName}.js?v=${Date.now()}`;
    try {
      const mod = await import(jsUrl);
      if (mod && typeof mod.init === "function") {
        await mod.init({ store_id: storeId });
      }
      console.log(`✅ ${subName}.js loaded and initialized`);
    } catch (err) {
      console.error("❌ Failed to import submodule JS:", err);
      content.innerHTML += `<div class="text-danger mt-2">Script error while loading ${subName}.js</div>`;
    }
  };

  // click handlers
  if (subnav) {
    subnav.addEventListener("click", (e) => {
      const a = e.target.closest("a.nav-link[data-sub]");
      if (!a) return;
      e.preventDefault();
      openSub(a.getAttribute("data-sub"));
    });
  }

  // open default
  await openSub(defaultSub);
}
