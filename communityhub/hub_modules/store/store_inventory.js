// /communityhub/hub_modules/store/store_inventory.js
console.log("✅ store/store_inventory.js loaded (gallery for dry goods)");

export async function init(options = {}) {
  const supabase = window.supabase;
  const storeId = options?.store_id || null;
  if (!supabase || !storeId) {
    document.querySelector("#store-content")?.insertAdjacentHTML("afterbegin",
      `<div class="alert alert-danger">Missing Supabase client or store_id.</div>`);
    return;
  }

  // Elements
  const els = {
    grid: document.getElementById("listings-grid"),
    status: document.getElementById("listings-status"),
    refresh: document.getElementById("inv-refresh-btn"),
    searchInput: document.getElementById("inv-search-input"),
    searchClear: document.getElementById("inv-search-clear"),
    searchResults: document.getElementById("inv-search-results"),
    addDryBtn: document.getElementById("add-drygood-btn"),
    dg: {
      modal: document.getElementById("drygoodModal"),
      name: document.getElementById("dg-name"),
      desc: document.getElementById("dg-desc"),
      batch: document.getElementById("dg-batch"),
      qty: document.getElementById("dg-qty"),
      price: document.getElementById("dg-price"),
      currency: document.getElementById("dg-currency"),
      cover: document.getElementById("dg-cover"),
      save: document.getElementById("dg-save-btn"),
      status: document.getElementById("dg-status")
    }
  };

  // Bootstrap modal (if available in page)
  let bsModal = null;
  if (window.bootstrap && els.dg.modal) {
    try { bsModal = new bootstrap.Modal(els.dg.modal); } catch { bsModal = null; }
  }

  // Resolve store owner
  const { data: storeRow, error: storeErr } = await supabase
    .from("store_profiles")
    .select("id, owner_id, name")
    .eq("id", storeId)
    .maybeSingle();
  if (storeErr || !storeRow) {
    setStatus("Failed to load store.");
    console.error("❌ store load error:", storeErr);
    return;
  }
  const ownerId = storeRow.owner_id;

  // Permissions (UI only)
  let myRole = "viewer";
  const { data: auth } = await supabase.auth.getUser();
  const myId = auth?.user?.id || null;
  if (myId) {
    if (myId === ownerId) myRole = "owner";
    else {
      const { data: me } = await supabase.from("store_employees")
        .select("role").eq("store_id", storeId).eq("user_id", myId).maybeSingle();
      myRole = me?.role || "viewer";
    }
  }
  const canManage = ["owner", "manager", "staff"].includes(myRole);

  // Wire events
  els.refresh?.addEventListener("click", () => loadListings());
  els.searchClear?.addEventListener("click", () => { if (els.searchInput) els.searchInput.value = ""; renderInvHint(); });
  els.searchInput?.addEventListener("input", debounce(runInventorySearch, 300));
  els.addDryBtn?.addEventListener("click", () => {
    if (!canManage) return alert("You don't have permission to add listings.");
    clearDryForm();
    if (bsModal) bsModal.show();
    else if (els.dg.modal) els.dg.modal.style.display = "block"; // naive fallback
  });
  els.dg.save?.addEventListener("click", addDryGood);

  renderInvHint();
  await loadListings();

  /* ----------------------------- listing CRUD ----------------------------- */

  async function loadListings() {
    setStatus("Loading…");
    const { data, error } = await supabase
      .from("store_listings")
      .select("id, product_type, user_inventory_id, dry_name, dry_description, cover_image, description, batch_size, qty_available, price_per_batch, currency, active, sku, species, morph_name, insect_type, updated_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ listings load failed:", error);
      setStatus("Failed to load listings");
      return;
    }

    renderListings(data || []);
    setStatus("");
  }

  function renderListings(listings) {
    els.grid.innerHTML = (listings.length ? listings.map(renderListingCard).join("") :
      `<div class="col-12"><div class="text-muted p-3">No listings yet.</div></div>`);

    // bind handlers
    els.grid.querySelectorAll("[data-action='save']")?.forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const card = btn.closest("[data-card]");
        const patch = collectPatchFromCard(card);
        updateListing(id, patch, card);
      });
    });
    els.grid.querySelectorAll("[data-action='toggle']")?.forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const active = btn.dataset.active === "true";
        updateListing(id, { active: !active }).then(() => loadListings());
      });
    });
    els.grid.querySelectorAll("[data-action='remove']")?.forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name || "this listing";
        if (!confirm(`Remove ${name}?`)) return;
        deleteListing(id);
      });
    });
    els.grid.querySelectorAll("[data-action='upload']")?.forEach(input => {
      input.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        const id = e.target.dataset.id;
        if (file && id) await uploadCover(file, id);
      });
    });

    // hydrate gallery sections for dry goods
    els.grid.querySelectorAll("[data-gallery][data-id]")?.forEach(async wrap => {
      const id = wrap.getAttribute("data-id");
      await loadGallery(id, wrap);
    });

    // bind gallery uploaders
    els.grid.querySelectorAll("[data-gallery-upload]")?.forEach(input => {
      input.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files || []);
        const id = e.target.getAttribute("data-id");
        if (!files.length || !id) return;
        await uploadGalleryFiles(files, id);
        // reload just this gallery
        const wrap = e.target.closest("[data-gallery]");
        if (wrap) await loadGallery(id, wrap);
        e.target.value = ""; // reset
      });
    });
  }

  function renderListingCard(l) {
    const isDry = l.product_type === "drygood" || l.product_type === "dry_good";
    const title = isDry
      ? (l.dry_name || "Dry Good")
      : `${safe(l.species || "Unknown")}${l.morph_name ? " - " + safe(l.morph_name) : ""}`;

    const sub = isDry ? "Dry Good" : safe(l.insect_type || "");

    const editable = canManage;
    const activeBadge = l.active ? `<span class="badge text-bg-success">Active</span>` : `<span class="badge text-bg-secondary">Inactive</span>`;

    const fallbackImg = "data:image/gif;base64,R0lGODlhAQABAAAAACw="; // 1x1 transparent

    return `
    <div class="col-12 col-md-6 col-lg-4" data-card data-id="${l.id}">
      <div class="card h-100 shadow-sm">
        <div class="ratio ratio-16x9 bg-light">
          <img src="${safe(l.cover_image) || fallbackImg}" class="card-img-top" style="object-fit:cover;">
        </div>
        <div class="card-body pb-2">
          <div class="d-flex justify-content-between align-items-start mb-1">
            <div>
              <div class="fw-semibold">${title}</div>
              <div class="small text-muted">${sub}</div>
            </div>
            <div>${activeBadge}</div>
          </div>

          <div class="row g-2 align-items-center mt-1">
            <div class="col-4">
              <label class="form-label small mb-0">Batch Size</label>
              <input type="number" min="1" class="form-control form-control-sm" data-field="batch_size" value="${l.batch_size ?? ""}" ${editable ? "" : "disabled"}>
            </div>
            <div class="col-4">
              <label class="form-label small mb-0">Qty (batches)</label>
              <input type="number" min="0" class="form-control form-control-sm" data-field="qty_available" value="${l.qty_available ?? ""}" ${editable ? "" : "disabled"}>
            </div>
            <div class="col-4">
              <label class="form-label small mb-0">Price</label>
              <input type="number" step="0.01" min="0" class="form-control form-control-sm" data-field="price_per_batch" value="${l.price_per_batch ?? ""}" ${editable ? "" : "disabled"}>
            </div>
          </div>

          <div class="mt-2">
            <label class="form-label small mb-0">Description</label>
            <textarea rows="2" class="form-control form-control-sm" data-field="description" ${editable ? "" : "disabled"}>${safe(l.description || "")}</textarea>
          </div>

          ${isDry ? `
          <div class="mt-2 border-top pt-2" data-gallery data-id="${l.id}">
            <div class="d-flex align-items-center justify-content-between mb-1">
              <div class="small text-muted">Gallery</div>
              <label class="btn btn-outline-secondary btn-sm mb-0">
                Add Images <input type="file" class="d-none" data-gallery-upload data-id="${l.id}" accept="image/*" multiple ${editable ? "" : "disabled"}>
              </label>
            </div>
            <div class="d-flex flex-wrap gap-2" data-gallery-thumbs>
              <div class="text-muted small">Loading…</div>
            </div>
          </div>` : ``}

          <div class="d-flex align-items-center gap-2 mt-2">
            <label class="btn btn-outline-secondary btn-sm mb-0">
              Change Cover <input type="file" class="d-none" data-action="upload" data-id="${l.id}" accept="image/*" ${editable ? "" : "disabled"}>
            </label>
            <button class="btn btn-sm btn-primary" data-action="save" data-id="${l.id}" ${editable ? "" : "disabled"}>Save</button>
            <button class="btn btn-sm btn-outline-secondary" data-action="toggle" data-id="${l.id}" data-active="${l.active ? "true" : "false"}" ${editable ? "" : "disabled"}>${l.active ? "Deactivate" : "Activate"}</button>
            <button class="btn btn-sm btn-outline-danger ms-auto" data-action="remove" data-id="${l.id}" data-name="${title}" ${editable ? "" : "disabled"}>Remove</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  function collectPatchFromCard(card) {
    const o = {};
    card.querySelectorAll("[data-field]")?.forEach(input => {
      const key = input.dataset.field;
      let val = input.value;
      if (["batch_size","qty_available"].includes(key)) {
        const n = parseInt(val, 10);
        val = Number.isFinite(n) ? n : null;
      }
      if (["price_per_batch"].includes(key)) {
        const f = parseFloat(val);
        val = Number.isFinite(f) ? f : null;
      }
      o[key] = (val === "" || Number.isNaN(val)) ? null : val;
    });
    return o;
  }

  async function updateListing(id, patch, cardEl) {
    setStatus("Saving…");
    const { error } = await supabase.from("store_listings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("❌ update listing failed:", error);
      setStatus("Save failed");
      alert("Failed to save listing.");
      return;
    }
    if (cardEl) {
      const btn = cardEl.querySelector("[data-action='save']");
      if (btn) { btn.textContent = "Saved ✓"; setTimeout(() => btn.textContent = "Save", 1000); }
    }
    setStatus("Saved ✓");
    setTimeout(() => setStatus(""), 800);
  }

  async function deleteListing(id) {
    setStatus("Removing…");
    const { error } = await supabase.from("store_listings").delete().eq("id", id);
    if (error) {
      console.error("❌ delete listing failed:", error);
      setStatus("Remove failed");
      alert("Failed to remove listing.");
      return;
    }
    await loadListings();
  }

  async function uploadCover(file, listingId) {
    setStatus("Uploading image…");
    const ext = (file.name && file.name.includes(".")) ? file.name.split(".").pop() : "jpg";
    const path = `stores/${storeId}/listings/${listingId}/cover_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("store-images")
      .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
    if (upErr) {
      console.error("❌ upload failed:", upErr);
      setStatus("Upload failed");
      alert("Cover upload failed.");
      return;
    }
    const { data: pub } = await supabase.storage.from("store-images").getPublicUrl(path);
    const url = pub?.publicUrl || null;
    if (url) {
      await updateListing(listingId, { cover_image: url });
      await loadListings();
    } else {
      console.error("❌ public URL not returned for cover");
      setStatus("Upload URL error");
    }
  }

  /* -------------------------- add from inventory -------------------------- */

  function renderInvHint() {
    if (els.searchResults)
      els.searchResults.innerHTML = `<div class="list-group-item text-muted">Type at least 2 characters to search…</div>`;
  }

  async function runInventorySearch() {
    const q = (els.searchInput?.value || "").trim();
    if (!q || q.length < 2) { renderInvHint(); return; }

    if (els.searchResults)
      els.searchResults.innerHTML = `<div class="list-group-item small text-muted">Searching…</div>`;

    const { data, error } = await supabase
      .from("user_inventories")
      .select("id, species, morph_name, insect_type, cover_image")
      .eq("user_id", ownerId)
      .or(`species.ilike.%${escapeLike(q)}%,morph_name.ilike.%${escapeLike(q)}%,insect_type.ilike.%${escapeLike(q)}%`)
      .order("species", { ascending: true })
      .limit(50);

    if (error) {
      console.error("❌ inventory search failed:", error);
      if (els.searchResults)
        els.searchResults.innerHTML = `<div class="list-group-item text-danger small">Search failed.</div>`;
      return;
    }

    if (!data?.length) {
      if (els.searchResults)
        els.searchResults.innerHTML = `<div class="list-group-item small text-muted">No results.</div>`;
      return;
    }

    if (els.searchResults)
      els.searchResults.innerHTML = data.map(inv => {
        const title = `${safe(inv.species || "Unknown")}${inv.morph_name ? " - " + safe(inv.morph_name) : ""}`;
        return `<div class="list-group-item d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-2">
            <img src="${safe(inv.cover_image) || "data:image/gif;base64,R0lGODlhAQABAAAAACw="}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;">
            <div>
              <div class="fw-semibold small">${title}</div>
              <div class="text-muted small">${safe(inv.insect_type || "")}</div>
            </div>
          </div>
          <button class="btn btn-sm btn-primary" data-add="${inv.id}">Add</button>
        </div>`;
      }).join("");

    els.searchResults?.querySelectorAll("[data-add]")?.forEach(btn => {
      btn.addEventListener("click", () => addFromInventory(btn.getAttribute("data-add")));
    });
  }

  async function addFromInventory(invId) {
    if (!canManage) return alert("You don't have permission to add listings.");
    setStatus("Adding listing…");

    const { data: inv, error: invErr } = await supabase
      .from("user_inventories")
      .select("id, species, morph_name, insect_type, cover_image")
      .eq("id", invId)
      .maybeSingle();

    if (invErr || !inv) {
      console.error("❌ inventory fetch failed:", invErr);
      setStatus("Add failed");
      return;
    }

    const base = {
      store_id: storeId,
      product_type: "inventory",
      user_inventory_id: inv.id,
      species: inv.species,
      morph_name: inv.morph_name,
      insect_type: inv.insect_type,
      cover_image: inv.cover_image || null,
      batch_size: 1,
      qty_available: 0,
      price_per_batch: null,
      currency: "USD",
      active: false,
      description: ""
    };

    const { error } = await supabase
      .from("store_listings")
      .insert(base);

    if (error) {
      console.error("❌ add listing failed:", error);
      setStatus("Add failed");
      alert("Failed to add listing.");
      return;
    }

    setStatus("Added ✓");
    setTimeout(() => setStatus(""), 800);
    await loadListings();
  }

  /* ------------------------------- dry goods ------------------------------ */

  function clearDryForm() {
    if (!els.dg) return;
    if (els.dg.name) els.dg.name.value = "";
    if (els.dg.desc) els.dg.desc.value = "";
    if (els.dg.batch) els.dg.batch.value = "1";
    if (els.dg.qty) els.dg.qty.value = "0";
    if (els.dg.price) els.dg.price.value = "";
    if (els.dg.currency) els.dg.currency.value = "USD";
    if (els.dg.cover) els.dg.cover.value = "";
    if (els.dg.status) els.dg.status.textContent = "";
  }

  async function addDryGood() {
    if (!els.dg?.save) return;
    const name = (els.dg.name?.value || "").trim();
    if (!name) {
      if (els.dg.status) els.dg.status.textContent = "Name is required";
      return;
    }
    els.dg.save.disabled = true;

    const toInt = (v, d) => {
      const n = parseInt(String(v || "").trim(), 10);
      return Number.isFinite(n) ? n : d;
    };
    const toFloat = (v, d=null) => {
      const f = parseFloat(String(v || "").trim());
      return Number.isFinite(f) ? f : d;
    };

    if (els.dg.status) els.dg.status.textContent = "Creating…";
    const base = {
      store_id: storeId,
      product_type: "drygood",
      dry_name: name,
      dry_description: (els.dg.desc?.value || "").trim(),
      batch_size: toInt(els.dg.batch?.value, 1),
      qty_available: toInt(els.dg.qty?.value, 0),
      price_per_batch: toFloat(els.dg.price?.value),
      currency: String((els.dg.currency?.value || "USD")).toUpperCase(),
      active: false,
      description: ""
    };

    const { data: ins, error } = await supabase.from("store_listings")
      .insert(base).select("id").single();

    if (error) {
      console.error("❌ dry good insert failed:", error);
      if (els.dg.status) els.dg.status.textContent = "Create failed";
      els.dg.save.disabled = false;
      alert(error?.message || "Failed to create dry good.");
      return;
    }

    // optional cover upload
    const file = els.dg.cover?.files?.[0];
    if (file) {
      if (els.dg.status) els.dg.status.textContent = "Uploading image…";
      const upRes = await uploadDryCover(ins.id, file);
      if (!upRes) {
        if (els.dg.status) els.dg.status.textContent = "Image upload failed (item created)";
        els.dg.save.disabled = false;
        await loadListings();
        return;
      }
    }

    if (els.dg.status) els.dg.status.textContent = "Created ✓";
    await loadListings();
    setTimeout(() => {
      if (els.dg.status) els.dg.status.textContent = "";
      els.dg.save.disabled = false;
      if (bsModal) bsModal.hide();
      else if (els.dg.modal) els.dg.modal.style.display = "none";
    }, 600);
  }

  async function uploadDryCover(listingId, file) {
    const ext = (file.name && file.name.includes(".")) ? file.name.split(".").pop() : "jpg";
    const path = `stores/${storeId}/listings/${listingId}/cover_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("store-images")
      .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
    if (upErr) {
      console.error("❌ dry cover upload failed:", upErr);
      return false;
    }
    const { data: pub } = await supabase.storage.from("store-images").getPublicUrl(path);
    const url = pub?.publicUrl || null;
    if (!url) {
      console.error("❌ public URL not returned for dry cover");
      return false;
    }
    const { error: setErr } = await supabase.from("store_listings")
      .update({ cover_image: url }).eq("id", listingId);
    if (setErr) {
      console.error("❌ set cover url failed:", setErr);
      return false;
    }
    return true;
  }

  /* ----------------------- gallery (dry goods only) ----------------------- */

  async function loadGallery(listingId, wrapEl) {
    const thumbs = wrapEl.querySelector("[data-gallery-thumbs]");
    if (!thumbs) return;
    thumbs.innerHTML = `<div class="text-muted small">Loading…</div>`;
    const { data, error } = await supabase
      .from("store_listing_images")
      .select("id,url,alt,sort_order")
      .eq("listing_id", listingId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      console.error("❌ load gallery failed:", error);
      thumbs.innerHTML = `<div class="text-danger small">Failed to load images.</div>`;
      return;
    }
    if (!data?.length) {
      thumbs.innerHTML = `<div class="text-muted small">No images yet.</div>`;
      return;
    }
    thumbs.innerHTML = data.map(img => `
      <div class="position-relative" data-gimg="${img.id}" style="width:72px;height:72px;">
        <img src="${safe(img.url)}" alt="${safe(img.alt||'')}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;border:1px solid rgba(0,0,0,0.08);">
        <button class="btn btn-sm btn-outline-danger position-absolute top-0 end-0 p-0 px-1" title="Remove" data-remove-image="${img.id}" style="border-top-right-radius:8px;border-bottom-left-radius:8px;">×</button>
      </div>
    `).join("");

    // bind remove buttons
    thumbs.querySelectorAll("[data-remove-image]")?.forEach(btn => {
      btn.addEventListener("click", async () => {
        const imgId = btn.getAttribute("data-remove-image");
        if (!confirm("Remove this image?")) return;
        const ok = await removeGalleryImage(imgId);
        if (ok) {
          const node = thumbs.querySelector(`[data-gimg="${imgId}"]`);
          node?.remove();
          if (!thumbs.children.length) thumbs.innerHTML = `<div class="text-muted small">No images yet.</div>`;
        }
      });
    });
  }

  async function uploadGalleryFiles(files, listingId) {
    setStatus("Uploading images…");
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = (file.name && file.name.includes(".")) ? file.name.split(".").pop() : "jpg";
      const path = `stores/${storeId}/listings/${listingId}/gallery/${Date.now()}_${i}.${ext}`;
      const { error: upErr } = await supabase.storage.from("store-images")
        .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (upErr) { console.error("❌ gallery upload failed:", upErr); continue; }
      const { data: pub } = await supabase.storage.from("store-images").getPublicUrl(path);
      const url = pub?.publicUrl || null;
      if (!url) { console.error("❌ gallery public URL missing"); continue; }
      const { error: insErr } = await supabase.from("store_listing_images")
        .insert({ listing_id: listingId, url, alt: null });
      if (insErr) { console.error("❌ gallery insert failed:", insErr); }
    }
    setStatus("");
  }

  async function removeGalleryImage(imageId) {
    const { error } = await supabase.from("store_listing_images").delete().eq("id", imageId);
    if (error) { console.error("❌ remove gallery image failed:", error); return false; }
    return true;
  }

  /* --------------------------------- utils -------------------------------- */

  function setStatus(msg){ if (els.status) els.status.textContent = msg || ""; }
  function safe(s){ return String(s || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escapeLike(s){ return String(s || "").replace(/[%_]/g, m => "\\" + m); }
  function debounce(fn, ms){ let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null,args), ms); }; }
}
