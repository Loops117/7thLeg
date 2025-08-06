console.log("✅ gallery.js loaded");

let allPhotos = [];

async function initGallery() {
  const container = document.getElementById("gallery-container");
  if (!container) {
    console.error("❌ gallery-container not found in DOM");
    return;
  }

  const { data: inventories, error } = await supabase
    .from("user_inventories")
    .select("id, species, common_name, cover_image, insect_type, profiles(id, full_name)")
    .not("cover_image", "is", null);

  if (error || !inventories) {
    console.error("Gallery query error:", error);
    container.innerHTML = "<p class='text-danger'>Failed to load gallery.</p>";
    return;
  }

  if (inventories.length === 0) {
    container.innerHTML = "<p>No photos available in the gallery.</p>";
    return;
  }

  // ✅ Shuffle client-side
  inventories.sort(() => Math.random() - 0.5);

  allPhotos = inventories;

  // Populate insect type filter
  const uniqueTypes = [...new Set(inventories.map(i => i.insect_type).filter(Boolean))].sort();
  const filterSelect = document.getElementById("species-filter");
  filterSelect.innerHTML = "<option value=''>All Types</option>" +
    uniqueTypes.map(t => `<option value="${t}">${t}</option>`).join("");

  filterSelect.addEventListener("change", applyGalleryFilters);
  document.getElementById("gallery-search").addEventListener("input", applyGalleryFilters);

  renderGallery(inventories);
}

function applyGalleryFilters() {
  const search = document.getElementById("gallery-search").value.toLowerCase();
  const typeFilter = document.getElementById("species-filter").value;

  const filtered = allPhotos.filter(p => {
    const matchesSearch =
      p.species.toLowerCase().includes(search) ||
      (p.common_name || "").toLowerCase().includes(search) ||
      (p.profiles?.full_name || "").toLowerCase().includes(search);

    const matchesType = !typeFilter || p.insect_type === typeFilter;
    return matchesSearch && matchesType;
  });

  renderGallery(filtered);
}

function renderGallery(data) {
  const container = document.getElementById("gallery-container");
  if (!container) return;

  if (!data.length) {
    container.innerHTML = "<p>No photos match your filters.</p>";
    return;
  }

  container.innerHTML = data.map(inv => `
    <div class="col-md-3">
      <div class="card h-100 shadow-sm" onclick="openViewSpecies('${inv.id}')">
        <img src="${inv.cover_image}" class="gallery-img" alt="${inv.species}">
        <div class="card-body text-center">
          <h6 class="card-title"><i>${inv.species}</i></h6>
          <p class="card-text">${inv.common_name || ""}</p>
          <small class="text-muted">
            Type: ${inv.insect_type || "Unknown"}<br>
            By <a href="/profiles/index.html?user=${inv.profiles?.id || ""}">
                 ${inv.profiles?.full_name || "Unknown"}
               </a>
          </small>
        </div>
      </div>
    </div>
  `).join("");
}

document.addEventListener("DOMContentLoaded", initGallery);

function openViewSpecies(id) {
  window.location.href = `/tabs/Inventory/view.species.html?id=${id}`;
}
