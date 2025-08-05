(function () {
  console.log("✅ edit.species.js loaded");

  let editId = null;
  let originalCover = null;

  // Load the form with data (edit or add)
  window.loadEditSpecies = async function (id) {
    editId = id;
    document.getElementById("form-title").textContent = id ? "Edit Species" : "Add Species";

    if (!id) {
      document.getElementById("date_obtained").value = new Date().toISOString().split("T")[0];
    }

    async function loadDropdown(table, selectEl) {
      const { data, error } = await supabase.from(table).select("*").order("sort_order", { ascending: true });
      if (error) { console.error(table, error); return; }
      selectEl.innerHTML = `<option value="">-- Select --</option>`;
      data.forEach(opt => selectEl.innerHTML += `<option value="${opt.name}">${opt.name}</option>`);
    }

    await loadDropdown("insect_types", document.getElementById("insect_type"));
    await loadDropdown("climate_types", document.getElementById("climate"));
    await loadDropdown("humidity_levels", document.getElementById("humidity"));
    await loadDropdown("hydration_methods", document.getElementById("hydration"));
    await loadDropdown("diet_presets", document.getElementById("diet"));
    await loadDropdown("status_options", document.getElementById("status_select"));

    if (id) {
      const { data, error } = await supabase.from("user_inventories").select("*").eq("id", id).single();
      if (error || !data) {
        document.getElementById("form-message").innerHTML =
          `<div class="alert alert-danger py-2">❌ Failed to load species.</div>`;
        return;
      }

      document.getElementById("species").value = data.species || "";
      document.getElementById("common_name").value = data.common_name || "";
      document.getElementById("insect_type").value = data.insect_type || "";
      document.getElementById("date_obtained").value = data.date_obtained || new Date().toISOString().split("T")[0];
      document.getElementById("source").value = data.source || "";
      document.getElementById("climate").value = data.climate || "";
      document.getElementById("humidity").value = data.humidity || "";
      document.getElementById("hydration").value = data.hydration || "";
      document.getElementById("diet").value = data.diet || "";
      document.getElementById("status_select").value = data.status || "";
      document.getElementById("care_sheet").value = data.care_sheet || "";
      document.getElementById("notes").value = data.notes || "";

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
    console.log("📌 Back pressed — directly loading Inventory tab");

    // Hide edit tab
    const editPane = document.getElementById("edit-species");
    if (editPane) editPane.classList.remove("show", "active");

    // Show Inventory visually
    const inventoryTabBtn = document.querySelector('#dashboardTabs button[data-bs-target="#inventory"]');
    const inventoryPane = document.getElementById("inventory");
    if (inventoryTabBtn && inventoryPane) {
      // Mark tab active
      inventoryTabBtn.classList.add("active");
      document.querySelectorAll(".dashboard-tabs .nav-link").forEach(btn => btn.classList.remove("active"));
      inventoryTabBtn.classList.add("active");

      // Show inventory pane
      document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.remove("show", "active"));
      inventoryPane.classList.add("show", "active");

      // Reload inventory content
      if (typeof window.loadTabContent === "function" && typeof tabMap !== "undefined") {
        console.log("📌 Reloading Inventory content directly");
        await window.loadTabContent("inventory", tabMap["inventory"]);

        if (typeof window.initInventory === "function") {
          console.log("📌 Running initInventory after reload");
          window.initInventory();
        }
      }
    } else {
      console.error("❌ Could not find Inventory tab button or pane");
    }
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

    let coverImageUrl = originalCover;
    const coverFile = document.getElementById("cover_image_file").files[0];
    const removeCover = document.getElementById("remove_cover")?.checked;

    if (coverFile) {
      const timestamp = Date.now();
      const cleanSpecies = document.getElementById("species").value.replace(/\s+/g, '-').toLowerCase();
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
        const cleanSpecies = document.getElementById("species").value
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9.\-_]/g, "");
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
      user_id: user.id,
      species: document.getElementById("species").value,
      common_name: document.getElementById("common_name").value,
      insect_type: document.getElementById("insect_type").value,
      cover_image: coverImageUrl,
      date_obtained: document.getElementById("date_obtained").value,
      source: document.getElementById("source").value,
      climate: document.getElementById("climate").value,
      humidity: document.getElementById("humidity").value,
      hydration: document.getElementById("hydration").value,
      diet: document.getElementById("diet").value,
      status: document.getElementById("status_select").value,
      care_sheet: document.getElementById("care_sheet").value,
      notes: document.getElementById("notes").value,
      gallery_images: galleryImageUrls,
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
