// bulletin_composer.js — full modal + review wiring (rebuild)
(function () {
  if (window.__BULLETIN_COMPOSER_INITED__) return;
  window.__BULLETIN_COMPOSER_INITED__ = true;
  window.bulletin_composer_loaded = true;
  console.log("✅ bulletin_composer.js executing");

  // Boot when DOM ready
  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);

  function boot() {
    ensureModalMarkup();
    injectStyles();
    wireOpenClose();
    wireTypeSwitch();
    wireReviewSearch();
    wireGalleryUploads();
    wirePost();
    // react if home.js broadcasts a request to open (optionally with payload to prefill)
    window.addEventListener("open-bulletin-composer", (ev) => {
      const payload = ev && ev.detail ? ev.detail : null;
      if (payload) prefillFromPayload(payload);
      openModal();
    });
}

  /* ---------------- DOM + styles ---------------- */
  function ensureModalMarkup() {
    if (document.getElementById("bulletin-modal")) return;
    const wrap = document.createElement("div");
    wrap.id = "bulletin-modal";
    wrap.className = "bulletin-modal";
    wrap.innerHTML = `
      <div class="bulletin-backdrop" data-role="modal-close"></div>
      <div class="bulletin-sheet">
        <div class="bulletin-header">
          <div>New bulletin</div>
          <button class="btn-close" aria-label="Close" data-role="modal-close">×</button>
        </div>
        <div class="bulletin-body">
          <div class="mb-2">
            <label class="form-label">Type</label>
            <select id="composer-type" class="form-select form-select-sm">
              <option value="general">General</option>
              <option value="help">Help</option>
              <option value="id_request">ID Request</option>
              <option value="review">Review</option>
            </select>
          </div>

          <div id="review-controls" class="review-controls d-none">
            <div class="row g-2 align-items-end">
              <div class="col-5">
                <label class="form-label">Review target</label>
                <select id="review-target-type" class="form-select form-select-sm">
                  <option value="">Choose…</option>
                  <option value="user">User</option>
                  <option value="store">Store</option>
                </select>
              </div>
              <div class="col-7">
                <label class="form-label">Search</label>
                <input id="review-target-search" class="form-control form-control-sm" placeholder="Search users or stores">
                <input type="hidden" id="review-target-id">
                <div id="review-search-results" class="list-group small mt-1 d-none"></div>
                <div id="review-target-picked" class="text-muted small mt-1"></div>
              </div>
            </div>
            <div class="mt-2">
              <label class="form-label">Rating</label>
              <select id="review-rating" class="form-select form-select-sm" style="max-width:140px;">
                <option value="">—</option>
                <option>1</option><option>2</option><option>3</option><option>4</option><option>5</option>
              </select>
            </div>
          </div>

          <div class="mt-3">
            <label class="form-label">Message</label>
            <div id="composer-editor" class="form-control" contenteditable="true" style="min-height:120px;"></div>
          </div>

          <div class="mt-3">
            <label class="form-label">Gallery</label>
            <div class="d-flex align-items-center gap-2 mb-2">
              <button id="composer-gallery-add" class="btn btn-sm btn-outline-secondary" type="button">Add photos</button>
              <input id="composer-gallery-input" type="file" accept="image/*" multiple class="d-none">
              <span class="text-muted small">Up to 10 images</span>
            </div>
            <div id="composer-gallery" class="d-flex flex-wrap"></div>
          </div>
        </div>
        <div class="bulletin-footer d-flex justify-content-end gap-2">
          <button id="composer-cancel" class="btn btn-light" data-role="modal-close">Cancel</button>
          <button id="composer-post" class="btn btn-primary">Post</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
  }

  function injectStyles(){
    if (document.getElementById("bulletin-composer-styles")) return;
    const st = document.createElement("style");
    st.id = "bulletin-composer-styles";
    st.textContent = `
      .bulletin-modal{ position:fixed; inset:0; display:none; z-index:1050; }
      .bulletin-modal.open{ display:block; }
      .bulletin-backdrop{ position:absolute; inset:0; background:rgba(0,0,0,.45); }
      .bulletin-sheet{ position:relative; margin:5vh auto; background:#fff; border-radius:12px; width:min(900px,96vw); max-height:90vh; display:flex; flex-direction:column; overflow:hidden; }
      .bulletin-header,.bulletin-footer{ padding:.75rem 1rem; background:#f8f9fa; }
      .bulletin-header{ display:flex; align-items:center; justify-content:space-between; font-weight:700; }
      .btn-close{ border:0; background:transparent; font-size:1.25rem; line-height:1; }
      .bulletin-body{ padding:1rem; overflow:auto; }
      .review-controls.d-none{ display:none !important; }
      #review-search-results{ max-height:180px; overflow:auto; border:1px solid rgba(0,0,0,.1); border-radius:.5rem; }
      #review-search-results .list-group-item{ cursor:pointer; }
      #composer-gallery { gap: 8px; }
      .bulletin-thumb { display:flex; flex-direction:column; align-items:center; margin:4px; }
      .bulletin-thumb img { width:100px; height:100px; object-fit:cover; border-radius:8px; }
      .bulletin-thumb { position:relative; }
      .bulletin-thumb .remove { position:absolute; top:-6px; right:-6px; background:#000; color:#fff; border-radius:50%; width:22px; height:22px; line-height:20px; text-align:center; font-size:.8rem; opacity:.8; border:0; }
      .bulletin-thumb .remove:hover { opacity:1; }
      .bulletin-thumb .status { position:absolute; left:4px; bottom:4px; background:rgba(0,0,0,.6); color:#fff; font-size:.7rem; padding:0 .3rem; border-radius:.25rem; }
    `;
    document.head.appendChild(st);
  }


  /* ---------------- Gallery state + helpers ---------------- */
  const BUCKET = "bulletin-images";
  let GALLERY = []; // items: { id, path, url, objectURL, uploaded, removed }

  function clearGalleryUI(){ 
    const box = document.getElementById("composer-gallery"); 
    if (box) box.innerHTML = ""; 
    GALLERY = [];
  }

  function uuid4(){
    const a = crypto.getRandomValues(new Uint8Array(16));
    a[6] = (a[6] & 0x0f) | 0x40; // version 4
    a[8] = (a[8] & 0x3f) | 0x80; // variant 10
    const h = Array.from(a, b => b.toString(16).padStart(2,'0'));
    return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10,16).join('')}`;
  }

  function sanitizeName(name){ return String(name||'').replace(/[^a-z0-9_.-]+/gi,'-').slice(0,80); }

  async function signPathToUrl(path){
    try{ 
      if (!window.supabase) return null;
      const r = await window.supabase.storage.from(BUCKET).createSignedUrl(path, 60*60*24*7);
      if (r.error) return null;
      return r.data.signedUrl;
    }catch{ return null; }
  }

  function renderThumb(item){
    const box = document.getElementById("composer-gallery"); if (!box) return;
    const el = document.createElement('div');
    el.className = 'bulletin-thumb';
    el.dataset.id = item.id;
    el.innerHTML = `
      <img src="${item.objectURL || item.url || ''}" alt="">
      <button class="remove" type="button" title="Remove">&times;</button>
      <div class="status">${item.uploaded ? '✓' : '…'}</div>
    `;
    el.querySelector('.remove').addEventListener('click', () => {
      item.removed = true;
      el.remove();
    }, { passive: true });
    box.appendChild(el);
  }

  async function uploadOne(file){
    if (!window.supabase) throw new Error('Supabase not available');
    const { data: auth } = await window.supabase.auth.getUser();
    const uid = auth && auth.user ? auth.user.id : 'anon';
    const key = `${uid}/${uuid4()}-${sanitizeName(file.name)}`;
    const up = await window.supabase.storage.from(BUCKET).upload(key, file, { upsert:false, contentType:file.type||'application/octet-stream' });
    if (up.error) throw up.error;
    return key;
  }

  function filesFromEvent(e){
    const arr = [];
    if (e && e.target && e.target.files) arr.push(...e.target.files);
    if (e && e.dataTransfer && e.dataTransfer.files) arr.push(...e.dataTransfer.files);
    return arr.filter(f => f && f.type && f.type.startsWith('image/'));
  }

  function setExistingGallery(paths){
    clearGalleryUI();
    const arr = Array.isArray(paths) ? paths : [];
    arr.forEach(async (p) => {
      const item = { id: uuid4(), path: null, url: null, objectURL: null, uploaded: true, removed:false };
      if (/^https?:\/\//i.test(p)){ item.url = p; }
      else { item.path = p; item.url = await signPathToUrl(p) || null; }
      GALLERY.push(item);
      renderThumb(item);
    });
  }

  function gatherGalleryPaths(){
    return GALLERY.filter(x => !x.removed).map(x => x.path ? x.path : (x.url || null)).filter(Boolean);
  }

  function wireGalleryUploads(){
    const addBtn = document.getElementById('composer-gallery-add');
    const input  = document.getElementById('composer-gallery-input');
    const box    = document.getElementById('composer-gallery');
    if (!addBtn || !input || !box) return;

    addBtn.addEventListener('click', () => input.click(), { passive:true });
    input.addEventListener('change', async (e) => { await handleAdd(filesFromEvent(e)); input.value = ''; });

    ;['dragenter','dragover'].forEach(ev => box.addEventListener(ev, (e) => { e.preventDefault(); box.classList.add('drag'); }, false));
    ;['dragleave','drop'].forEach(ev => box.addEventListener(ev, (e) => { e.preventDefault(); box.classList.remove('drag'); }, false));
    box.addEventListener('drop', async (e) => { await handleAdd(filesFromEvent(e)); });

    async function handleAdd(files){
      if (!files || !files.length) return;
      const remaining = 10 - GALLERY.filter(x=>!x.removed).length;
      const batch = Array.from(files).slice(0, Math.max(0, remaining));
      for (const f of batch){
        const temp = { id: uuid4(), path: null, url: null, objectURL: URL.createObjectURL(f), uploaded:false, removed:false };
        GALLERY.push(temp);
        renderThumb(temp);
        try{ 
          const key = await uploadOne(f);
          temp.path = key;
          temp.url = await signPathToUrl(key) || temp.objectURL;
          temp.uploaded = true;
          const el = document.querySelector(`.bulletin-thumb[data-id="${temp.id}"] .status`);
          if (el) el.textContent = '✓';
        }catch(err){
          console.warn('upload failed', err);
          const el = document.querySelector(`.bulletin-thumb[data-id="${temp.id}"] .status`);
          if (el) el.textContent = '!';
        }
      }
    }
  }

  /* ---------------- Open / Close ---------------- */
  function openModal(){
    const modal = document.getElementById("bulletin-modal");
    if (!modal) return;
    modal.classList.add("open");
    document.documentElement.style.overflow = "hidden";
  }
  function closeModal(){
    const modal = document.getElementById("bulletin-modal");
    if (!modal) return;
    modal.classList.remove("open");
    document.documentElement.style.overflow = "";
    clearGalleryUI();
    // reset edit mode text
    const postBtn = document.getElementById("composer-post");
    if (postBtn){ postBtn.textContent = "Post"; postBtn.dataset.mode = ""; postBtn.dataset.editId = ""; }
  }
  function wireOpenClose(){
    const modal = document.getElementById("bulletin-modal");
    if (!modal) return;
    modal.querySelectorAll("[data-role='modal-close']").forEach(btn => {
      btn.addEventListener("click", closeModal, { passive: true });
    });
    modal.querySelector(".bulletin-backdrop")?.addEventListener("click", closeModal, { passive: true });
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && modal.classList.contains("open")) closeModal(); });
  }

  /* ---------------- Type toggle ---------------- */
  function wireTypeSwitch(){
    const typeSel = document.getElementById("composer-type");
    const reviewBox = document.getElementById("review-controls");
    if (!typeSel || !reviewBox) return;
    const apply = () => {
      if (typeSel.value === "review") reviewBox.classList.remove("d-none");
      else reviewBox.classList.add("d-none");
    };
    typeSel.addEventListener("change", apply);
    apply();
  }

  /* ---------------- Review search (user/store) ---------------- */
  function wireReviewSearch(){
    const typeSel = document.getElementById("review-target-type");
    const input = document.getElementById("review-target-search");
    const results = document.getElementById("review-search-results");
    const picked = document.getElementById("review-target-picked");
    const hiddenId = document.getElementById("review-target-id");
    if (!typeSel || !input || !results || !hiddenId) return;

    function clearPick(){
      hiddenId.value = "";
      picked.textContent = "";
    }
    function setPick(id, label){
      hiddenId.value = id;
      picked.textContent = `Selected: ${label}`;
      results.classList.add("d-none");
      results.innerHTML = "";
    }

    input.addEventListener("input", async () => {
      const q = (input.value || "").trim();
      clearPick();
      results.innerHTML = "";
      if (!q || !window.supabase) { results.classList.add("d-none"); return; }
      const target = typeSel.value;
      try{
        if (target === "user"){
          const { data, error } = await window.supabase
            .from("profiles")
            .select("id, full_name, avatar_url")
            .ilike("full_name", `%${q}%`)
            .limit(8);
          if (!error && Array.isArray(data)) {
            renderResults(data.map(r => ({ id:r.id, label:r.full_name || "(no name)"})));
          }
        } else if (target === "store"){
          const { data, error } = await window.supabase
            .from("store_profiles")
            .select("id, name, slug")
            .ilike("name", `%${q}%`)
            .limit(8);
          if (!error && Array.isArray(data)) {
            renderResults(data.map(r => ({ id:r.id, label:r.name || r.slug || "(store)"})));
          }
        } else {
          results.classList.add("d-none");
        }
      }catch(e){
        console.warn("review search failed", e);
        results.classList.add("d-none");
      }
    });

    function renderResults(list){
      results.classList.remove("d-none");
      results.innerHTML = list.length ? list.map(item =>
        `<div class="list-group-item list-group-item-action" data-id="${item.id}">${item.label}</div>`
      ).join("") : `<div class="list-group-item text-muted">No matches</div>`;
    }

    results.addEventListener("click", (e) => {
      const row = e.target.closest(".list-group-item[data-id]");
      if (!row) return;
      const id = row.getAttribute("data-id");
      const label = row.textContent.trim();
      setPick(id, label);
    });
  }

  /* ---------------- Prefill for editing ---------------- */
  function prefillFromPayload(b){
    try{
      const typeSel = document.getElementById("composer-type");
      const reviewBox = document.getElementById("review-controls");
      const editor = document.getElementById("composer-editor");
      if (typeSel) typeSel.value = b.type || "general";
      if (reviewBox){
        if (b.type === "review"){
          reviewBox.classList.remove("d-none");
          const rt = document.getElementById("review-target-type");
          const rid = document.getElementById("review-target-id");
          const rr = document.getElementById("review-rating");
          if (rt) rt.value = b.review_target_type || "";
          if (rid) rid.value = b.review_target_id || "";
          if (rr && b.rating) rr.value = String(b.rating);
        } else {
          reviewBox.classList.add("d-none");
        }
      }
      if (editor) editor.innerHTML = b.message || "";
      clearGalleryUI();
      if (Array.isArray(b.bulletin_gallery)) setExistingGallery(b.bulletin_gallery);
      const postBtn = document.getElementById("composer-post");
      if (postBtn && b.id){ postBtn.textContent = "Save"; postBtn.dataset.mode = "edit"; postBtn.dataset.editId = b.id; }
    }catch(e){ console.warn("prefill failed", e); }
  }

  /* ---------------- Post / Save ---------------- */
  function gatherPayload(){
    const typeSel = document.getElementById("composer-type");
    const editor = document.getElementById("composer-editor");
    const reviewBox = document.getElementById("review-controls");
    const payload = {
      type: typeSel ? (typeSel.value || "general") : "general",
      message: editor ? editor.innerHTML.trim() : "",
      bulletin_gallery: gatherGalleryPaths()
    };
    if (reviewBox && !reviewBox.classList.contains("d-none") && payload.type === "review"){
      const rt = document.getElementById("review-target-type");
      const rid = document.getElementById("review-target-id");
      const rr = document.getElementById("review-rating");
      payload.review_target_type = rt ? (rt.value || null) : null;
      payload.review_target_id   = rid ? (rid.value || null) : null;
      payload.rating             = rr ? (rr.value ? Number(rr.value) : null) : null;
    }
    // Help legacy compatibility: if type==help, also set help=true; if id_request keep as type
    if (payload.type === "help") payload.help = true;
    return payload;
  }

  function wirePost(){
    const postBtn = document.getElementById("composer-post");
    if (!postBtn) return;
    postBtn.addEventListener("click", async () => {
      const supabase = window.supabase;
      const mode = postBtn.dataset.mode || "";
      const editId = postBtn.dataset.editId || "";
      const data = gatherPayload();
      try{
        if (!supabase){
          // Fallback: tell home.js to handle it
          window.dispatchEvent(new CustomEvent("composer-submit", { detail: { mode, editId, data } }));
          closeModal();
          return;
        }
        if (mode === "edit" && editId){
          const { data: upd, error } = await supabase.from("bulletins").update(data).eq("id", editId).select("id").maybeSingle();
          if (error) throw error;
          if (window.__HOME_FEED__ && window.__HOME_FEED__.prependById) window.__HOME_FEED__.prependById(editId);
        } else {
          // set user_id if available
          try {
            const auth = await supabase.auth.getUser();
            if (auth && auth.data && auth.data.user) data.user_id = auth.data.user.id;
          } catch {}
          const { data: ins, error } = await supabase.from("bulletins").insert(data).select("id").maybeSingle();
          if (error) throw error;
          const newId = ins && ins.id ? ins.id : null;
          if (newId && window.__HOME_FEED__ && window.__HOME_FEED__.prependById) window.__HOME_FEED__.prependById(newId);
        }
        closeModal();
      }catch(e){
        console.warn("composer post failed:", e);
        alert("Could not save bulletin. Please try again.");
      }
    });
  }
})();
