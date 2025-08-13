(function () {
  console.log("✅ edit.hubspecies.js loaded");

  let editId = null;
  let originalCover = null;

  // Load the form with data (edit or add)
  window.loadEditSpecies = async function (id) {
    editId = id || null;
    document.getElementById("form-title").textContent = editId ? "Edit Species" : "Add Species";

    // helper to load dropdowns (only invert type now)
    async function loadDropdown(table, selectEl) {
      const { data, error } = await supabase.from(table).select("*").order("sort_order", { ascending: true });
      if (error) { console.error(table, error); return; }
      selectEl.innerHTML = `<option value="">-- Select --</option>`;
      data.forEach(opt => selectEl.innerHTML += `<option value="${opt.name}">${opt.name}</option>`);
    }

    await loadDropdown("insect_types", document.getElementById("insect_type"));

    if (editId) {
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

      if (data.gallery_images && data.gallery_images.length > 0) {
        const previewDiv = document.getElementById("gallery-preview");
        previewDiv.innerHTML = data.gallery_images
          .map(url => `<img src="${url}" style="max-height:80px;" class="rounded shadow-sm">`)
          .join("");
      }
    }
  };

  // ✅ Back button: ensure Inventory is shown and reloaded
  window.cancelEdit = async function () {
    console.log("📌 Back pressed — reloading My Species in Hub");
    setTimeout(() => {
      if (typeof window.loadModule === "function") {
        loadModule("userspecies");
      } else {
        console.error("❌ loadModule is not defined.");
      }
    }, 100);
  };

  // Handle form submit
  document.addEventListener("submit", async (e) => {
    if (e.target.id !== "inventory-form") return;
    e.preventDefault();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      document.getElementById("form-message").innerHTML =
        `<div class="alert alert-danger py-2">❌ You must be logged in.</div>`;
      return;
    }

    // Required fields
    const species = document.getElementById("species").value.trim();
    const invertType = document.getElementById("insect_type").value.trim();
    if (!species || !invertType) {
      document.getElementById("form-message").innerHTML =
        `<div class="alert alert-danger py-2">❌ Species and Invert Type are required.</div>`;
      return;
    }

    let coverImageUrl = originalCover;
    const coverFile = document.getElementById("cover_image_file").files[0];
    const removeCover = document.getElementById("remove_cover")?.checked;

    if (coverFile) {
      const timestamp = Date.now();
      const cleanSpecies = species.replace(/\s+/g, '-').toLowerCase();
      const filename = `${user.id}/${timestamp}-${cleanSpecies}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("inventory-images")
        .upload(filename, coverFile, { upsert: true });

      if (uploadError) {
        document.getElementById("form-message").innerHTML =
          `<div class="alert alert-danger py-2">❌ Image upload failed: ${uploadError.message}</div>`;
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("inventory-images")
        .getPublicUrl(filename);

      coverImageUrl = publicUrl;
    } else if (removeCover) {
      coverImageUrl = null;
    }

    // Gallery uploads
    const galleryFiles = Array.from(document.getElementById("gallery_images").files).slice(0, 5);
    let galleryImageUrls = [];

    if (galleryFiles.length > 0) {
      for (const file of galleryFiles) {
        const timestamp = Date.now();
        const cleanName = file.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9.\-_]/g, "");
        const cleanSpecies = species.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9.\-_]/g, "");
        const filename = `${user.id}/${editId || 'new'}/${timestamp}-${cleanSpecies}-${cleanName}`;

        const { error: uploadError } = await supabase.storage
          .from("species-gallery")
          .upload(filename, file, { upsert: true });

        if (uploadError) {
          document.getElementById("form-message").innerHTML =
            `<div class="alert alert-danger py-2">❌ Gallery upload failed: ${uploadError.message}</div>`;
          return;
        }

        const { data: { publicUrl } } = supabase.storage
          .from("species-gallery")
          .getPublicUrl(filename);

        galleryImageUrls.push(publicUrl);
      }
    }

    const entry = {
      user_id: user.id,                  // Required (from auth)
      species: species,                  // Required
      morph_name: document.getElementById("morph_name").value || null, // Optional
      insect_type: invertType,           // Required
      source: document.getElementById("source").value || null,         // Optional
      price: document.getElementById("price").value || null,           // Optional
      notes: document.getElementById("acquisition_notes").value || null, // Optional (stored in notes)
      cover_image: coverImageUrl,        // Optional
      gallery_images: galleryImageUrls,  // Optional
      updated_at: new Date().toISOString()
    };

    let result;
    if (editId) {
      result = await supabase.from("user_inventories").update(entry).eq("id", editId);
    } else {
      result = await supabase.from("user_inventories").insert(entry);
    }

    if (result.error) {
      document.getElementById("form-message").innerHTML =
        `<div class="alert alert-danger py-2">❌ Save failed: ${result.error.message}</div>`;
    } else {
      document.getElementById("form-message").innerHTML =
        `<div class="alert alert-success py-2">✅ Entry saved successfully!</div>`;
      await window.cancelEdit();
    }
  });
})();


export async function init(userId, params = {}) {
  if (typeof window.loadEditSpecies === "function") {
    window.loadEditSpecies(params.id || null);
  }
}
