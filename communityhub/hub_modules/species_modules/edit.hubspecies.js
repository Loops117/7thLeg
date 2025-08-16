
// edit.hubspecies.js — add per-image delete for gallery (keeps previous fixes: reset, preserve, double-submit guard)
(function () {
  console.log("✅ edit.hubspecies.js loaded (gallery per-image delete + state reset + guards)");

  let editId = null;
  let originalCover = null;
  let existingGallery = [];
  let pendingRemovals = new Set();
  let saving = false;

  function resetForm() {
    ["species","morph_name","insect_type","source","price","acquisition_notes"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const coverFileEl = document.getElementById("cover_image_file");
    const removeCoverEl = document.getElementById("remove_cover");
    const galleryEl = document.getElementById("gallery_images");
    const galleryPreview = document.getElementById("gallery-preview");
    const currentCover = document.getElementById("current-cover");
    const coverPreview = document.getElementById("cover-preview");

    if (coverFileEl) coverFileEl.value = "";
    if (galleryEl) galleryEl.value = "";
    if (removeCoverEl) removeCoverEl.checked = false;
    if (galleryPreview) galleryPreview.innerHTML = "";
    if (currentCover) currentCover.classList.add("d-none");
    if (coverPreview) coverPreview.src = "";

    originalCover = null;
    existingGallery = [];
    pendingRemovals = new Set();
  }

  function renderGalleryPreview() {
    const wrap = document.getElementById("gallery-preview");
    if (!wrap) return;
    wrap.innerHTML = "";

    if (!existingGallery || existingGallery.length === 0) {
      wrap.innerHTML = `<div class="text-muted small">No gallery images yet.</div>`;
      return;
    }

    const visible = existingGallery.filter(u => !pendingRemovals.has(u));
    if (visible.length === 0) {
      wrap.innerHTML = `<div class="text-muted small">All gallery images removed (will apply on Save).</div>`;
      return;
    }

    wrap.innerHTML = visible.map(url => `
      <div class="d-inline-block position-relative me-2 mb-2" data-url="${url}">
        <img src="${url}" class="rounded shadow-sm border" style="height:80px;width:80px;object-fit:cover;" alt="Gallery image">
        <button type="button" class="btn btn-sm btn-danger rounded-circle position-absolute top-0 start-100 translate-middle"
                title="Remove image" aria-label="Remove image" data-action="remove-img">&times;</button>
      </div>
    `).join("");

    // Delegate click for remove buttons
    wrap.querySelectorAll('[data-action="remove-img"]').forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tile = btn.closest("[data-url]");
        const url = tile?.getAttribute("data-url");
        if (!url) return;
        pendingRemovals.add(url);
        // Soft remove from DOM (keeps UX snappy)
        tile.remove();
        // If list becomes empty, show note
        if (!wrap.querySelector("[data-url]")) {
          wrap.innerHTML = `<div class="text-muted small">All gallery images removed (will apply on Save).</div>`;
        }
      });
    });
  }

  // Public: open editor
  window.loadEditSpecies = async function (id) {
    editId = id || null;
    document.getElementById("form-title").textContent = editId ? "Edit Species" : "Add Species";
    resetForm();

    // Load dropdown: insect type
    async function loadDropdown(table, selectEl) {
      const { data, error } = await supabase.from(table).select("*").order("sort_order", { ascending: true });
      if (error) { console.error(table, error); return; }
      selectEl.innerHTML = `<option value="">-- Select --</option>`;
      (data || []).forEach(opt => selectEl.innerHTML += `<option value="${opt.name}">${opt.name}</option>`);
    }
    await loadDropdown("insect_types", document.getElementById("insect_type"));

    if (!editId) return renderGalleryPreview();

    // Load existing row
    const { data, error } = await supabase.from("user_inventories").select("*").eq("id", editId).single();
    if (error || !data) {
      document.getElementById("form-message").innerHTML =
        `<div class="alert alert-danger py-2">❌ Failed to load species.</div>`;
      return;
    }

    document.getElementById("species").value = data.species || "";
    document.getElementById("morph_name").value = data.morph_name || "";
    document.getElementById("insect_type").value = data.insect_type || "";
    document.getElementById("source").value = data.source || "";
    document.getElementById("price").value = data.price ?? "";
    document.getElementById("acquisition_notes").value = data.notes || "";

    if (data.cover_image) {
      originalCover = data.cover_image;
      const coverPreview = document.getElementById("cover-preview");
      const currentCover = document.getElementById("current-cover");
      if (coverPreview && currentCover) {
        coverPreview.src = originalCover;
        currentCover.classList.remove("d-none");
      }
    }

    existingGallery = Array.isArray(data.gallery_images) ? data.gallery_images.slice() : [];
    pendingRemovals = new Set();
    renderGalleryPreview();
  };

  // Back to list
  window.cancelEdit = function () {
    if (typeof window.loadModule === "function") {
      loadModule("userspecies");
    } else {
      history.back();
    }
  };

  // Form submit handler
  document.addEventListener("submit", async (e) => {
    if (e.target.id !== "inventory-form") return;
    e.preventDefault();
    if (saving) return;
    saving = true;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Saving..."; }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be logged in.");

      // Required
      const species = (document.getElementById("species").value || "").trim();
      const invertType = (document.getElementById("insect_type").value || "").trim();
      if (!species || !invertType) throw new Error("Species and Invert Type are required.");

      // Cover
      let coverImageUrl = originalCover;
      const coverFile = document.getElementById("cover_image_file")?.files?.[0];
      const removeCover = document.getElementById("remove_cover")?.checked;
      if (coverFile) {
        const timestamp = Date.now();
        const cleanSpecies = species.replace(/\s+/g, '-').toLowerCase();
        const filename = `${user.id}/${timestamp}-${cleanSpecies}.jpg`;
        const { error: upErr } = await supabase.storage.from("inventory-images").upload(filename, coverFile, { upsert: true });
        if (upErr) throw new Error("Image upload failed: " + upErr.message);
        const { data: { publicUrl } } = supabase.storage.from("inventory-images").getPublicUrl(filename);
        coverImageUrl = publicUrl;
      } else if (removeCover) {
        coverImageUrl = null;
      }

      // Build final gallery list: (existing - pendingRemovals) + newly uploaded
      let finalGallery = existingGallery.filter(u => !pendingRemovals.has(u));

      // New gallery uploads (optional)
      const newFiles = Array.from(document.getElementById("gallery_images")?.files || []).slice(0, 5);
      for (const file of newFiles) {
        const timestamp = Date.now();
        const cleanName = file.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9.\-_]/g, "");
        const cleanSpecies = species.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9.\-_]/g, "");
        const filename = `${user.id}/${editId || 'new'}/${timestamp}-${cleanSpecies}-${cleanName}`;
        const { error: upErr } = await supabase.storage.from("species-gallery").upload(filename, file, { upsert: true });
        if (upErr) throw new Error("Gallery upload failed: " + upErr.message);
        const { data: { publicUrl } } = supabase.storage.from("species-gallery").getPublicUrl(filename);
        finalGallery.push(publicUrl);
      }
      // Dedup
      finalGallery = Array.from(new Set(finalGallery));

      // Prepare row
      const entry = {
        user_id: (await supabase.auth.getUser()).data.user.id,
        species: species,
        morph_name: (document.getElementById("morph_name").value || "").trim() || null,
        insect_type: invertType,
        source: (document.getElementById("source").value || "").trim() || null,
        price: document.getElementById("price").value || null,
        notes: (document.getElementById("acquisition_notes").value || "").trim() || null,
        cover_image: coverImageUrl ?? null,
        gallery_images: finalGallery,
        updated_at: new Date().toISOString()
      };

      let result;
      if (editId) {
        result = await supabase.from("user_inventories").update(entry).eq("id", editId).eq("user_id", entry.user_id);
      } else {
        result = await supabase.from("user_inventories").insert(entry);
      }
      if (result.error) throw new Error(result.error.message);

      // Attempt to remove deleted images from storage if they belong to species-gallery bucket
      const toRemove = Array.from(pendingRemovals).map(url => {
        const m = url.match(/\/storage\/v1\/object\/public\/species-gallery\/(.+)$/);
        return m ? m[1] : null;
        }).filter(Boolean);

      if (toRemove.length) {
        try {
          const { error: remErr } = await supabase.storage.from("species-gallery").remove(toRemove);
          if (remErr) console.warn("⚠️ Failed to remove some storage objects:", remErr.message);
        } catch (err) {
          console.warn("⚠️ Storage remove skipped:", err.message || err);
        }
      }

      document.getElementById("form-message").innerHTML =
        `<div class="alert alert-success py-2">✅ Entry saved${toRemove.length ? ` (removed ${toRemove.length} image${toRemove.length>1?'s':''})` : ""}.</div>`;

      // Return to list
      if (typeof window.loadModule === "function") {
        setTimeout(() => loadModule("userspecies"), 400);
      }
    } catch (err) {
      document.getElementById("form-message").innerHTML =
        `<div class="alert alert-danger py-2">❌ ${String(err.message || err)}</div>`;
    } finally {
      saving = false;
      const submitBtn2 = e.target.querySelector('button[type="submit"]');
      if (submitBtn2) { submitBtn2.disabled = false; submitBtn2.textContent = "Save Entry"; }
    }
  });

})();

export async function init(userId, params = {}) {
  if (typeof window.loadEditSpecies === "function") {
    window.loadEditSpecies(params.id || null);
  }
}
