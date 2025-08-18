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
              <img id="galleryModalImage" src="" class="img-fluid rounded" alt="Gallery Image" style="transform-origin:center center; cursor: grab;">
            </div>
            <div class="modal-footer justify-content-between">
              <button type="button" class="btn btn-light btn-sm" onclick="prevGallery()">⟨ Prev</button>
              <div class="btn-group btn-group-sm ms-2">
                <button type="button" id="btn-zoom-out" class="btn btn-light">−</button>
                <button type="button" id="btn-zoom-reset" class="btn btn-light">Reset</button>
                <button type="button" id="btn-zoom-in" class="btn btn-light">+</button>
              </div>
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
function setModalImage(idx){
  const list = Array.isArray(window.galleryImages) ? window.galleryImages : [];
  const url = list[idx];
  const img = document.getElementById("galleryModalImage");
  if (!img) return;
  if (url){
    img.src = url;
    img.dataset.index = String(idx);
  } else {
    // fallback: clear or keep previous to avoid broken icon
    if (!img.src) img.src = "";
  }
}

function openGallery(idx) {
  window.currentGalleryIndex = idx;
  setModalImage(idx);
}
function prevGallery() {
  const total = (window.galleryImages || []).length || 0;
  if (!total) return;
  const current = parseInt(document.getElementById("galleryModalImage")?.dataset.index || "0", 10) || 0;
  const next = (current - 1 + total) % total;
  window.currentGalleryIndex = next;
  setModalImage(next);
}
function nextGallery() {
  const total = (window.galleryImages || []).length || 0;
  if (!total) return;
  const current = parseInt(document.getElementById("galleryModalImage")?.dataset.index || "0", 10) || 0;
  const next = (current + 1) % total;
  window.currentGalleryIndex = next;
  setModalImage(next);
}
// expose to inline handlers
window.openGallery = openGallery;
window.prevGallery = prevGallery;
window.nextGallery = nextGallery;





// Zoom / Pan for modal image
(function(){
  let scale = 1;
  let panX = 0, panY = 0;
  let dragging = false, lastX = 0, lastY = 0;

  function apply(){
    const img = document.getElementById("galleryModalImage");
    if (!img) return;
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    img.style.cursor = scale > 1 ? (dragging ? "grabbing" : "grab") : "default";
  }
  function zoomBy(delta){
    const img = document.getElementById("galleryModalImage");
    if (!img) return;
    const prev = scale;
    scale = Math.max(1, Math.min(4, scale + delta));
    // when zooming, keep pan within reasonable bounds
    const rect = img.getBoundingClientRect();
    const maxX = (rect.width * (scale-1)) / 2;
    const maxY = (rect.height * (scale-1)) / 2;
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
    apply();
  }
  function reset(){
    scale = 1; panX = 0; panY = 0; apply();
  }

  // Buttons
  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "btn-zoom-in"){ zoomBy(0.25); }
    if (e.target && e.target.id === "btn-zoom-out"){ zoomBy(-0.25); }
    if (e.target && e.target.id === "btn-zoom-reset"){ reset(); }
  });

  // Wheel zoom
  document.addEventListener("wheel", (e) => {
    const img = document.getElementById("galleryModalImage");
    if (!img) return;
    if (!img.closest("#galleryModal.show")) return; // only when modal open
    if (!e.ctrlKey && !e.altKey) return; // require ctrl/alt to avoid hijacking page scroll
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 0.2 : -0.2);
  }, { passive: false });

  // Drag to pan
  function onDown(e){
    const img = document.getElementById("galleryModalImage");
    if (!img || scale <= 1) return;
    dragging = True
    lastX = (e.touches ? e.touches[0].clientX : e.clientX);
    lastY = (e.touches ? e.touches[0].clientY : e.clientY);
    apply();
  }
  function onMove(e){
    if (!dragging) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    const y = (e.touches ? e.touches[0].clientY : e.clientY);
    panX += (x - lastX);
    panY += (y - lastY);
    lastX = x; lastY = y;
    apply();
  }
  function onUp(){ dragging = false; apply(); }

  document.addEventListener("mousedown", (e) => {
    if (e.target && e.target.id === "galleryModalImage") onDown(e);
  });
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);

  document.addEventListener("touchstart", (e) => {
    if (e.target && e.target.id === "galleryModalImage") onDown(e);
  }, { passive: true });
  document.addEventListener("touchmove", onMove, { passive: true });
  document.addEventListener("touchend", onUp);
  document.addEventListener("touchcancel", onUp);

  // Reset zoom when a new image is shown or modal closed
  document.addEventListener("shown.bs.modal", (e) => {
    if (e.target && e.target.id === "galleryModal") reset();
  });
  document.addEventListener("hidden.bs.modal", (e) => {
    if (e.target && e.target.id === "galleryModal") reset();
  });
})();

export async function init(userId, params = {}) {
  const speciesId = params.id;
  await loadSpeciesView(speciesId);
}
