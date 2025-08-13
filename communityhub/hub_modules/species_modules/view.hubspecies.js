console.log("✅ view.species.js loaded");



async function loadSpeciesView(speciesId) {
  const { data: inv, error: invError } = await supabase
    .from("user_inventories")
    .select("*")
    .eq("id", speciesId)
    .single();

  const container = document.getElementById("species-view");

  if (invError || !inv) {
    container.innerHTML = `<div class="alert alert-danger mt-4">❌ Failed to load species.</div>`;
    console.error(invError);
    return;
  }

  // Owner name
  let ownerName = "Unknown Owner";
  if (inv.user_id) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", inv.user_id)
      .single();
    if (!profileError && profile) {
      ownerName = profile.full_name;
    }
  }

  const commonName = inv.common_name || "";
  const morphname = inv.morph_name || "";
  const speciesName = inv.species || "";

  document.title = `${commonName || speciesName} — ${ownerName}`;

  // Combine cover + gallery
  let galleryImages = [];
  if (inv.cover_image) galleryImages.push(inv.cover_image);
  if (inv.gallery_images && inv.gallery_images.length > 0) {
    galleryImages = [...new Set([...galleryImages, ...inv.gallery_images])];
  }

  // Hero section
  let heroSection = "";
  if (inv.cover_image) {
    heroSection = `
      <section class="hero-section" style="background-image: url('${inv.cover_image}'); background-size: cover; background-position: center; position: relative; height: 300px;">
        <div class="overlay d-flex flex-column justify-content-center align-items-center text-white text-center" style="background: rgba(0,0,0,0.5); height: 100%;">
          <h1 class="fw-light"><i>${speciesName}</i></h1>
          <h2 class="display-2">${morphname || ""} ${commonName || ""}</h2>
          <p class="mt-2">
            Owned by  <a href="#" onclick="loadModule('profile', '${inv.user_id}')" class="text-white text-decoration-underline">
            ${ownerName}
            </a>
          </p>
        </div>
      </section>
    `;
  }




  // ✅ Gallery section
  let gallerySection = "";
  if (galleryImages.length > 0) {
    gallerySection = `
      <div class="container my-4">
        <h4 class="mb-3">Photo Gallery</h4>
        <div class="d-flex flex-wrap gap-2">
          ${galleryImages.map((url, idx) => `
            <img src="${url}" 
                 class="rounded shadow-sm gallery-thumb" 
                 style="width: 120px; height: 120px; object-fit: cover; cursor: pointer;" 
                 alt="Gallery image ${idx + 1}" 
                 data-bs-toggle="modal" 
                 data-bs-target="#galleryModal" 
                 onclick="openGallery(${idx})">
          `).join("")}
        </div>
      </div>
      
      <!-- Bootstrap Modal for Lightbox -->
      <div class="modal fade" id="galleryModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered modal-lg">
          <div class="modal-content bg-dark">
            <div class="modal-body text-center">
              <img id="galleryModalImage" src="" class="img-fluid rounded" alt="Gallery Image">
            </div>
            <div class="modal-footer justify-content-between">
              <button type="button" class="btn btn-light btn-sm" onclick="prevGallery()">⟨ Prev</button>
              <button type="button" class="btn btn-light btn-sm" onclick="nextGallery()">Next ⟩</button>
              <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Inject species details
  container.innerHTML = `
    ${heroSection}
    ${gallerySection}
    <div class="container my-4">
      <div class="accordion" id="speciesAccordion">
        <div class="accordion-item">
          <h2 class="accordion-header">
            <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#idPanel" aria-expanded="true">
              Identification
            </button>
          </h2>
          <div id="idPanel" class="accordion-collapse collapse show">
            <div class="accordion-body">
              <p><strong>Species:</strong> ${inv.species || "N/A"}</p>
              <p><strong>Morph Name:</strong> ${inv.morph_name || "N/A"}</p>
              <p><strong>Common Name:</strong> ${inv.common_name || "N/A"}</p>
            </div>
          </div>
        </div>

        <div class="accordion-item">
          <h2 class="accordion-header">
            <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#acquisitionPanel" aria-expanded="true">
              Species Card
            </button>
          </h2>
          <div id="acquisitionPanel" class="accordion-collapse collapse show">
            <div class="accordion-body">
              <p><strong>Coming Soon......</strong>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  // Save gallery images globally for lightbox
  window.galleryImages = galleryImages;
  window.currentGalleryIndex = 0;
}

// Lightbox controls
function openGallery(idx) {
  window.currentGalleryIndex = idx;
  document.getElementById("galleryModalImage").src = window.galleryImages[idx];
}
function prevGallery() {
  window.currentGalleryIndex =
    (window.currentGalleryIndex - 1 + window.galleryImages.length) % window.galleryImages.length;
  openGallery(window.currentGalleryIndex);
}
function nextGallery() {
  window.currentGalleryIndex =
    (window.currentGalleryIndex + 1) % window.galleryImages.length;
  openGallery(window.currentGalleryIndex);
}




export async function init(userId, params = {}) {
  const speciesId = params.id;
  await loadSpeciesView(speciesId);
}
