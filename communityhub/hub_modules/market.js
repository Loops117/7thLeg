// /communityhub/hub_modules/market.js
console.log("✅ market.js loaded");

const supabase = window.supabase;

(async function initMarket() {
  if (!supabase) {
    console.error("Supabase not found on window");
    return;
  }

  const els = {
    grid: document.getElementById("market-grid"),
    status: document.getElementById("market-status"),
    search: document.getElementById("market-search"),
    clear: document.getElementById("market-clear"),
    stores: document.getElementById("store-filter-list"),
    storesStatus: document.getElementById("store-filter-status"),
    typeRadios: document.querySelectorAll("input[name='typeFilter']")
  };

  // Events
  els.search?.addEventListener("input", debounce(refresh, 300));
  els.clear?.addEventListener("click", () => { els.search.value = ""; refresh(); });
  els.typeRadios?.forEach(r => r.addEventListener("change", refresh));

  await loadStores();
  await refresh();

  /* ----------------------------- load stores ----------------------------- */
  async function loadStores() {
    setStatus("Loading stores…");
    els.stores.innerHTML = "";

    // Fetch stores that currently have at least one active listing
    // Join through store_listings -> store_profiles to avoid relying on store_profiles.active
    const { data, error } = await supabase
      .from("store_listings")
      .select("store_id, store_profiles!inner ( id, name, slug, logo_url )")
      .eq("active", true)
      .order("store_id", { ascending: true })
      .limit(500);

    if (error) {
      console.error("❌ stores fetch failed", error);
      els.storesStatus.textContent = "Failed to load stores.";
      setStatus("");
      return;
    }

    // Deduplicate stores by id
    const byId = new Map();
    (data || []).forEach(row => {
      const sp = row.store_profiles;
      if (sp?.id && !byId.has(sp.id)) byId.set(sp.id, { id: sp.id, name: sp.name || "Untitled Store" });
    });
    const stores = Array.from(byId.values());

    if (!stores.length) {
      els.stores.innerHTML = `<div class="list-group-item text-muted">No stores with active items.</div>`;
      els.storesStatus.textContent = "";
      setStatus("");
      return;
    }

    const html = stores.map(s => {
      const id = `store-${s.id}`;
      return `
        <label class="list-group-item d-flex align-items-center gap-2" for="${id}" style="cursor:pointer;">
          <input class="form-check-input me-1" type="checkbox" id="${id}" data-store-id="${s.id}">
          <span class="flex-grow-1">${escapeHTML(s.name)}</span>
        </label>`;
    }).join("");

    els.stores.innerHTML = html;
    els.stores.querySelectorAll("input[type='checkbox']")?.forEach(cb => {
      cb.addEventListener("change", refresh);
    });
    els.storesStatus.textContent = `${stores.length} store(s)`;
    setStatus("");
  }

  /* ---------------------------- fetch listings --------------------------- */
  async function refresh() {
    const queryText = (els.search?.value || "").trim();
    const selectedType = document.querySelector("input[name='typeFilter']:checked")?.value || "all";
    const selectedStores = Array.from(els.stores?.querySelectorAll("input[type='checkbox']:checked") || [])
      .map(cb => cb.getAttribute("data-store-id"));

    setStatus("Loading items…");

    // Build base query
    let q = supabase
      .from("store_listings")
      .select(`
        id,
        product_type,
        species,
        morph_name,
        dry_name,
        dry_description,
        description,
        batch_size,
        qty_available,
        price_per_batch,
        currency,
        store_id,
        cover_image,
        store_profiles!inner ( id, name, slug, logo_url )
      `)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(60);

    // Type filter
    if (selectedType === "live") {
      q = q.in("product_type", ["live","inventory"]);
    } else if (selectedType === "drygood") {
      q = q.eq("product_type", "drygood");
    }

    // Store filter
    if (selectedStores.length) {
      q = q.in("store_id", selectedStores);
    }

    // Search filter
    if (queryText.length >= 2) {
      const like = ilike(queryText);
      q = q.or([
        `species.ilike.${like}`,
        `morph_name.ilike.${like}`,
        `dry_name.ilike.${like}`,
        `description.ilike.${like}`,
        `dry_description.ilike.${like}`
      ].join(","));
    }

    const { data, error } = await q;
    if (error) {
      console.error("❌ listings fetch failed", error);
      els.grid.innerHTML = `<div class="col-12"><div class="alert alert-danger">Failed to load items.</div></div>`;
      setStatus("");
      return;
    }

    renderGrid(data || []);
    setStatus(data?.length ? "" : "No items match your filters.");
  }

  /* ----------------------------- render cards ---------------------------- */
  function renderGrid(rows) {
    if (!rows.length) {
      els.grid.innerHTML = `<div class="col-12"><div class="text-muted">No results.</div></div>`;
      return;
    }

    els.grid.innerHTML = rows.map(renderCard).join("");
  }

  function renderCard(l) {
    const isDry = l.product_type === "drygood" || l.product_type === "dry_good";
    const species = (l.species || "").trim();
    const morph = (l.morph_name || "").trim();
    const batchSize = Number.isFinite(l.batch_size) ? l.batch_size : null;         // individuals per batch
    const batchCount = Number.isFinite(l.qty_available) ? l.qty_available : null;  // number of batches available

    // Title rules:
    // - Live items: "{batchSize}x {species} - {morph}" (omit morph if empty; omit "x" if batchSize missing)
    // - Dry goods: dry_name
    let title;
    if (!isDry) {
      const qtyPrefix = batchSize ? `${batchSize}x ` : "";
      const namePart = [species || "Live Item", morph].filter(Boolean).join(" - ");
      title = `${qtyPrefix}${namePart}`;
    } else {
      title = l.dry_name || "Dry Good";
    }

    const desc = isDry ? (l.dry_description || l.description || "") : (l.description || "");
    const sp = l.store_profiles || {};
    const storeName = sp.name || "Store";
    const storeId = sp.id;
    const storeSlug = sp.slug;
    const price = formatPrice(l.price_per_batch, l.currency);
    const fallback = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

    return `
    <div class="col-12 col-sm-6 col-md-4 col-lg-3">
      <div class="card h-100 shadow-sm">
        <div class="ratio ratio-1x1 bg-light">
          <img src="${escapeAttr(l.cover_image) || fallback}" alt="${escapeAttr(title)}" class="card-img-top" style="object-fit:cover;">
        </div>
        <div class="card-body d-flex flex-column">
          <div class="d-flex align-items-center gap-2 small mb-1">${logoHtml(sp.logo_url, storeName, 18)}<a class="text-decoration-none" href="${storeSlug ? `/communityhub/hub.html?module=store/view_store&slug=${encodeURIComponent(storeSlug)}` : `/communityhub/hub.html?module=store/view_store&id=${encodeURIComponent(storeId)}`}">${escapeHTML(storeName)}</a></div>
          <h6 class="mb-1">${escapeHTML(title)}</h6>
          ${desc ? `<p class="mb-2 small text-muted" style="min-height:2.5em">${escapeHTML(desc).slice(0,150)}${desc.length>150?'…':''}</p>` : ``}
          <div class="mt-auto d-flex align-items-center justify-content-between">
            <div class="small text-muted">${batchCount !== null ? `Batches: ${batchCount}` : ``}</div>
            <div class="fw-semibold">${price}</div>
          </div>
        </div>
      </div>
    </div>`;
  }

  /* -------------------------------- utils -------------------------------- */
  function setStatus(msg){ if (els.status) els.status.textContent = msg || ""; }
  function debounce(fn, ms){ let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null,args), ms); }; }
  function ilike(s){ return `%${String(s).replace(/[%_]/g, m => "\\"+m)}%`; }
  function escapeHTML(s){ return String(s || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escapeAttr(s){ return escapeHTML(s); }
  function logoHtml(url, alt, size=18){
    if (url) {
      return `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt||'')}" class="rounded border" style="width:${size}px;height:${size}px;object-fit:cover;background:#fff;">`;
    }
    return `<span class="rounded-circle border bg-light d-inline-block" style="width:${size}px;height:${size}px;"></span>`;
  }
  function formatPrice(v, cur){
    if (v === null || v === undefined || v === "") return "";
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return `${(cur || "USD").toUpperCase()} $${n.toFixed(2)}`;
  }
})();