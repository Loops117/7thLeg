
// home.js — smaller uploaded images (resized to webp), tiny thumbnails in editor/feed, plus reviews+search+comments
(function () {
  console.log("✅ home.js (small-image uploads + tiny thumbs + reviews target + search + comments)");

  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);

  async function boot() {
    try {
      const supabase = await waitForSupabase();
      if (!supabase) { console.error("❌ Supabase not available"); return; }

      teardown();
      ensureMarkup();
      await renderPromptAvatar(supabase);
      wireModal();
      wireComposer(supabase);
      await FEED.init(supabase);
    } catch (e) {
      console.error("❌ home.js boot failed", e);
    }
  }

  async function waitForSupabase(timeoutMs = 8000){
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (window.supabase && window.supabase.auth && window.supabase.from) return window.supabase;
      await new Promise(r => setTimeout(r, 60));
    }
    return null;
  }

  /* ---------------- TEARDOWN (for SPA nav) ---------------- */
  function teardown(){
    try { window.__HOME_OBS__?.disconnect(); } catch {}
    window.__HOME_OBS__ = null;
    ["composer-prompt-card","home-feed","home-feed-sentinel","bulletin-modal","home-inline-style"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  /* ---------------- MARKUP INJECTION ---------------- */
  function ensureMarkup(){
    const root = document.getElementById("home-root") || document.getElementById("hub-content") || document.querySelector("main") || document.body;
    // Prompt card
    const card = document.createElement("div");
    card.id = "composer-prompt-card";
    card.className = "card border-0 shadow-sm mb-3";
    card.innerHTML = `<div class="card-body py-2 d-flex align-items-center gap-2">
        <div id="composer-avatar" class="rounded-circle bg-light-subtle border" style="width:36px;height:36px;"></div>
        <button id="open-bulletin-modal" class="prompt-button flex-grow-1 text-start">Post a bulletin</button>
      </div>`;
    root.prepend(card);

    // Feed containers
    const feed = document.createElement("div");
    feed.id = "home-feed";
    feed.className = "d-flex flex-column gap-3";
    (document.getElementById("home-root") || root).appendChild(feed);

    const s = document.createElement("div");
    s.id = "home-feed-sentinel";
    s.className = "py-4 text-center text-muted";
    s.textContent = "Loading…";
    (document.getElementById("home-root") || root).appendChild(s);

    // Modal
    const modal = document.createElement("div");
    modal.id = "bulletin-modal";
    modal.className = "bulletin-modal";
    modal.setAttribute("aria-hidden","true");
    modal.innerHTML = `
      <div class="bulletin-backdrop" data-role="modal-close"></div>
      <div class="bulletin-dialog" role="dialog" aria-modal="true" aria-labelledby="bulletin-title">
        <div class="bulletin-header">
          <div id="bulletin-title">Create bulletin</div>
          <button class="btn-close" type="button" aria-label="Close" data-role="modal-close">×</button>
        </div>
        <div class="bulletin-body">
          <div class="mb-2">
            <label class="form-label small mb-1">Type</label>
            <select id="composer-type" class="form-select form-select-sm">
              <option value="general" selected>General</option>
              <option value="review">Review</option>
              <option value="help">Help</option>
            </select>
          </div>
          <div id="review-controls" class="review-controls d-none">
            <div class="small fw-semibold mb-1">Review details</div>
            <div class="mb-2 position-relative">
              <label class="form-label small mb-1">Review target</label>
              <input id="review-target-search" type="text" class="form-control form-control-sm" placeholder="Search stores or users...">
              <div id="review-target-results" class="dropdown-menu show" style="display:none; position:absolute; left:0; right:0; top:100%; z-index:10; max-height:240px; overflow:auto;"></div>
              <div class="small mt-1" id="review-target-picked"></div>
              <input type="hidden" id="review-target-type">
              <input type="hidden" id="review-target-id">
            </div>
            <div class="mt-2">
              <label class="form-label small mb-1">Rating</label>
              <select id="review-rating" class="form-select form-select-sm">
                <option value="5">★★★★★ (5)</option>
                <option value="4">★★★★☆ (4)</option>
                <option value="3">★★★☆☆ (3)</option>
                <option value="2">★★☆☆☆ (2)</option>
                <option value="1">★☆☆☆☆ (1)</option>
              </select>
            </div>
            <hr class="my-2">
          </div>
          <div id="composer-editor" class="form-control" contenteditable="true" aria-label="Bulletin editor (HTML allowed)" style="min-height:160px;border-radius:12px;"></div>
          <div class="d-flex align-items-center gap-2 mt-2 flex-wrap">
            <input type="file" id="composer-image" accept="image/*" class="form-control form-control-sm" style="max-width:260px;">
            <button class="btn btn-sm btn-outline-secondary" id="composer-insert-image" type="button">Add Photo</button>
            <div class="text-secondary fw-semibold">Images will be resized automatically. HTML allowed; scripts/handlers removed.</div>
          </div>
        </div>
        <div class="bulletin-footer">
          <button class="btn btn-light" type="button" data-role="modal-close">Cancel</button>
          <button class="btn btn-primary" id="composer-post" type="button">Post</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    // Styles
    const st = document.createElement("style");
    st.id = "home-inline-style";
    st.textContent = `
      #composer-prompt-card { border-radius: 14px; }
      .prompt-button{ display:block;border:1px solid rgba(0,0,0,.1);background:#f8f9fa;padding:.6rem .9rem;border-radius:999px;color:#6c757d;}
      .prompt-button:hover{ background:#f1f3f5; color:#495057; }

      /* Overlay container spans the viewport and centers the dialog using flexbox */
      .bulletin-modal{ position:fixed; inset:0; display:none; z-index:5000; }
      .bulletin-modal.open{
        display:flex;
        align-items:flex-start;
        justify-content:center;
        padding: var(--bulletin-modal-top, 220px) 24px 24px;
      }
      .bulletin-backdrop{ position:absolute; inset:0; background:rgba(0,0,0,.4); }

      .bulletin-dialog{
        position:relative;
        background:#fff; width:min(720px,92vw);
        border-radius:14px; box-shadow:0 .5rem 1rem rgba(0,0,0,.15);
        overflow:hidden;
        max-height: calc(100vh - var(--bulletin-modal-top, 220px) - 32px);
        display:flex; flex-direction:column;
      }

      @media (max-width: 576px){
        .bulletin-modal.open{ padding: 10vh 3vw 3vh; }
        .bulletin-dialog{
          width: 94vw;
          max-height: calc(100vh - 13vh);
        }
      }

      .bulletin-header,.bulletin-footer{ padding:.75rem 1rem; background:#f8f9fa; }
      .bulletin-header{ display:flex; align-items:center; justify-content:space-between; font-weight:700; }
      .btn-close{ border:0; background:transparent; font-size:1.25rem; line-height:1; }
      .bulletin-body{ padding:1rem; overflow:auto; }
      .review-controls.d-none{ display:none !important; }
      .dropdown-item small{ color:#6c757d; }
      /* Tiny thumbnails in editor and in feed when our class is used */
      #composer-editor img.bulletin-inline-img{ width:128px !important; height:auto !important; object-fit:contain; border-radius:8px; }
      .bulletin-content img.bulletin-inline-img{ width:128px !important; height:auto !important; object-fit:contain; border-radius:8px; }
      .bulletin-card .card-body{ display:block; }
      .bulletin-card .bulletin-meta{ display:flex; align-items:center; gap:.5rem; margin-bottom:.5rem; flex-wrap:wrap; }
      .bulletin-card .bulletin-content{ display:block; width:100%; }
      .bulletin-card img{ max-width:100%; height:auto; border-radius:8px; }
    `;
    document.head.appendChild(st);
  }

  /* ---------------- MODAL & COMPOSER ---------------- */
  function readCssVarPx(name){
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!v) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  function detectHeaderOffsetPx(){
    if (typeof window.HOME_MODAL_TOP === "number" && isFinite(window.HOME_MODAL_TOP)) return window.HOME_MODAL_TOP;
    const cssTop = readCssVarPx('--bulletin-modal-top'); if (cssTop) return cssTop;

    const selectors = ['#hub-header', 'header', '.navbar', '#header', '.topbar'];
    let maxH = 0;
    for (const sel of selectors){
      const el = document.querySelector(sel);
      if (!el) continue;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if ((cs.position === 'fixed' || cs.position === 'sticky')) {
        maxH = Math.max(maxH, el.offsetHeight || rect.height || 0);
      }
    }
    return Math.max(220, maxH + 40);
  }

  function wireModal(){
    const modal = document.getElementById("bulletin-modal");
    const openBtn = document.getElementById("open-bulletin-modal");
    const editor = document.getElementById("composer-editor");
    const typeSel = document.getElementById("composer-type");
    const reviewBox = document.getElementById("review-controls");

    const open = () => {
      const topPx = detectHeaderOffsetPx();
      document.documentElement.style.setProperty('--bulletin-modal-top', topPx + 'px');

      modal.classList.add("open");
      document.documentElement.style.overflow = "hidden";
      if (editor) editor.innerHTML = "";
      if (typeSel) typeSel.value = "general";
      if (reviewBox) reviewBox.classList.add("d-none");
      // Reset target picker
      const picked = document.getElementById("review-target-picked");
      const hidT = document.getElementById("review-target-type");
      const hidI = document.getElementById("review-target-id");
      const search = document.getElementById("review-target-search");
      if (picked) picked.innerHTML = "";
      if (hidT) hidT.value = "";
      if (hidI) hidI.value = "";
      if (search) search.value = "";
    };
    const close = () => {
      modal.classList.remove("open");
      document.documentElement.style.overflow = "";
    };

    openBtn?.addEventListener("click", open);
    modal?.querySelectorAll("[data-role='modal-close']")?.forEach(el => el.addEventListener("click", close));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal?.classList.contains("open")) close();
    });
    typeSel?.addEventListener("change", () => {
      if (!reviewBox) return;
      reviewBox.classList.toggle("d-none", typeSel.value !== "review");
    });

    wireTargetSearch();
  }

  function wireTargetSearch(){
    const box = document.getElementById("review-controls");
    if (!box) return;
    const search = document.getElementById("review-target-search");
    const menu = document.getElementById("review-target-results");
    const picked = document.getElementById("review-target-picked");
    const hidT = document.getElementById("review-target-type");
    const hidI = document.getElementById("review-target-id");
    if (!search || !menu || !picked || !hidT || !hidI) return;

    let t = null;
    const debounce = (fn, ms=250) => (...args) => { clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
    const doSearch = debounce(async (q) => {
      q = (q||"").trim();
      if (!q) { menu.style.display="none"; menu.innerHTML=""; return; }
      const supabase = window.supabase;
      try {
        const [stores, users] = await Promise.all([
          supabase.from("store_profiles").select("id,name").ilike("name", `%${q}%`).order("name",{ascending:true}).limit(6),
          supabase.from("profiles").select("id,full_name").ilike("full_name", `%${q}%`).order("full_name",{ascending:true}).limit(6)
        ]);
        const s = (stores.data||[]).map(r => ({ id: r.id, label: r.name || "Store", type: "store" }));
        const u = (users.data||[]).map(r => ({ id: r.id, label: r.full_name || "User", type: "user" }));
        const results = [...s, ...u]; // stores listed first
        if (!results.length) { menu.style.display="none"; menu.innerHTML=""; return; }
        menu.innerHTML = results.map(r => `<button type="button" class="dropdown-item" data-type="${r.type}" data-id="${r.id}">${escapeHtml(r.label)} <small>(${r.type})</small></button>`).join("");
        menu.style.display = "block";
        menu.querySelectorAll(".dropdown-item").forEach(btn => btn.addEventListener("click", () => {
          const type = btn.getAttribute("data-type");
          const id = btn.getAttribute("data-id");
          const label = btn.textContent.replace(/\s*\(\w+\)\s*$/,"").trim();
          hidT.value = type; hidI.value = id;
          picked.innerHTML = `<span class="badge text-bg-light border">${escapeHtml(label)} <span class="text-muted">(${type})</span></span>`;
          menu.style.display="none"; menu.innerHTML="";
          search.value = label;
        }));
      } catch (e) {
        console.warn("target search failed", e);
        menu.style.display="none"; menu.innerHTML="";
      }
    });

    search.addEventListener("input", () => doSearch(search.value));
    search.addEventListener("focus", () => { if (search.value.trim()) doSearch(search.value); });
    document.addEventListener("click", (e) => {
      if (!box.contains(e.target)) { menu.style.display="none"; }
    });
  }

  function wireComposer(supabase){
    const insertBtn = document.getElementById("composer-insert-image");
    const fileInput = document.getElementById("composer-image");
    const postBtn = document.getElementById("composer-post");

    async function addSelectedFile(){
      const file = fileInput?.files?.[0];
      if (!file) return;
      // Resize client-side to keep bucket small; produce WEBP (max 512x512)
      const resized = await resizeImageFile(file, { maxW: 512, maxH: 512, mime: "image/webp", quality: 0.82 });
      if (!resized) { alert("Could not process image."); return; }
      const res = await uploadAndSign(supabase, resized.blob, { originalName: file.name, forceExt: ".webp", contentType: "image/webp" });
      if (!res) { alert("Upload failed (permissions or bucket). Check console."); return; }
      const { path, signedUrl } = res;
      insertHtmlAtCaret(`<img class="bulletin-inline-img" data-supa-path="${escapeHtml(path)}" src="${escapeHtml(signedUrl)}" alt="" loading="lazy">`);
      console.log("📸 uploaded resized image", { path, bytes: resized.blob.size, w: resized.w, h: resized.h });
      fileInput.value = "";
    }

    insertBtn?.addEventListener("click", addSelectedFile);
    fileInput?.addEventListener("change", addSelectedFile); // auto upload on choose

    postBtn?.addEventListener("click", async () => {
      try{
        const { data: { user } } = await supabase.auth.getUser();
        const isEdit = postBtn?.dataset?.mode === "edit";
        const editId = postBtn?.dataset?.editId || null;
        if (!user) { alert("Please sign in."); return; }
        const typeSel = document.getElementById("composer-type");
        const editor = document.getElementById("composer-editor");
        const raw = String(editor?.innerHTML || "").trim();
        const clean = sanitizeHtml(raw);
        if (!clean) { alert("Write something first."); return; }

        let saveType = "general", help = false, review_target_type = null, review_target_id = null, rating = null;
        const t = (typeSel?.value || "general");
        if (t === "review"){
          saveType = "review";
          review_target_type = document.getElementById("review-target-type")?.value || null;
          review_target_id = document.getElementById("review-target-id")?.value?.trim() || null;
          rating = parseInt(document.getElementById("review-rating")?.value || "0", 10);
          if (!review_target_type || !review_target_id || !rating) { alert("Select review target + rating."); return; }
        } else if (t === "help"){
          saveType = "general"; help = true;
        }

        const row = { user_id: user.id, type: saveType, message: clean, help, review_target_type, review_target_id, rating };
        let data = null, error = null;
        if (isEdit && editId){
          ({ data, error } = await supabase.from('bulletins').update(row).eq('id', editId).eq('user_id', user.id).select('id').maybeSingle());
        } else {
          ({ data, error } = await supabase.from('bulletins').insert(row).select('id').single());
        }
        if (error) { console.error("post insert error", error); alert(error.message || "Failed to post."); return; }
        document.querySelector("#bulletin-modal")?.classList.remove("open");
        if (postBtn){ postBtn.textContent = "Post"; delete postBtn.dataset.mode; delete postBtn.dataset.editId; }
        document.documentElement.style.overflow = "";
        await FEED.prependById(supabase, data.id);
      }catch(err){
        console.error("post handler failed", err);
      }
    });
  }

  /* ---------------- FEED ---------------- */
  const FEED = (() => {
    let offset = 0, loading = false, cycle = 0, observer = null;
    const container = () => document.getElementById("home-feed");
    const TARGET_NAME_CACHE = { store: {}, user: {} };

    async function init(supabase){
      offset = 0; cycle = 0; loading = false;
      if (container()) container().innerHTML = "";
      await loadNext(supabase);
      const sentinel = document.getElementById("home-feed-sentinel");
      if ("IntersectionObserver" in window && sentinel){
        observer?.disconnect();
        observer = new IntersectionObserver(async (entries) => {
          for (const e of entries) if (e.isIntersecting) await loadNext(supabase);
        }, { rootMargin: "600px" });
        observer.observe(sentinel);
        window.__HOME_OBS__ = observer;
      }
    }

    async function loadNext(supabase){
      if (loading) return; loading = true;
      const span = 2 + (cycle % 5);
      const rows = await fetchBulletins(supabase, span, offset);
      if (!rows.length && offset === 0){
        const empty = document.createElement("div");
        empty.className = "text-center text-muted py-3";
        empty.textContent = "No bulletins yet.";
        container().appendChild(empty);
      }
      offset += rows.length;
      for (const b of rows) container().appendChild(await renderBulletinCard(supabase, b));
      try {
        if (cycle % 3 === 0) container().appendChild(await renderStoresBlock(supabase));
        else if (cycle % 3 === 1) container().appendChild(await renderAuctionsBlock(supabase));
        else container().appendChild(await renderTradesBlock(supabase));
      } catch (e) { console.warn("interleave error", e); }
      cycle++; loading = false;
    }

    async function prependById(supabase, id){
      const row = await fetchById(supabase, id);
      if (row) container().insertBefore(await renderBulletinCard(supabase, row), container().firstChild);
    }

    async function fetchById(supabase, id){
      const { data, error } = await supabase
        .from("bulletins")
        .select("id, user_id, message, help, type, review_target_type, review_target_id, rating, created_at, profiles:profiles!bulletins_user_id_fkey(id,full_name,avatar_url), bulletin_comments(count)")
        .eq("id", id).maybeSingle();
      if (error) { console.warn("fetchById error", error); return null; }
      return data;
    }

    async function fetchBulletins(supabase, limit, start){
      const { data, error } = await supabase
        .from("bulletins")
        .select("id, user_id, message, help, type, review_target_type, review_target_id, rating, created_at, profiles:profiles!bulletins_user_id_fkey(id,full_name,avatar_url), bulletin_comments(count)")
        .order("created_at", { ascending:false })
        .range(start, start + limit - 1);
      if (error) { console.warn("bulletins fetch error", error); return []; }
      return data || [];
    }

    async function resolveReviewTargetName(supabase, type, id){
      if (!type || !id) return null;
      if (TARGET_NAME_CACHE[type] && TARGET_NAME_CACHE[type][id]) return TARGET_NAME_CACHE[type][id];
      try {
        if (type === "store"){
          const { data } = await supabase.from("store_profiles").select("name").eq("id", id).maybeSingle();
          const n = data?.name || "Store";
          TARGET_NAME_CACHE.store[id] = n; return n;
        } else if (type === "user"){
          const { data } = await supabase.from("profiles").select("full_name").eq("id", id).maybeSingle();
          const n = data?.full_name || "User";
          TARGET_NAME_CACHE.user[id] = n; return n;
        }
      } catch {}
      return null;
    }

    async function renderBulletinCard(supabase, b){
      const wrap = document.createElement("div");
      wrap.className = "card border-0 shadow-sm rounded-4 bulletin-card";
      const name = b?.profiles?.full_name || "User";
      const when = new Date(b.created_at).toLocaleString();
      const count = Array.isArray(b.bulletin_comments) && b.bulletin_comments[0]?.count ? b.bulletin_comments[0].count : 0;
      const helpBadge = (b.type === "general" && b.help) ? `<span class="badge bg-danger ms-1">Help</span>` : "";
      const reviewBadge = (b.type === "review") ? `<span class="badge bg-primary ms-1">Review</span>` : "";
      const stars = (b.type === "review" && b.rating) ? ` <span class="text-warning">${"★".repeat(b.rating)}${"☆".repeat(5-b.rating)}</span>` : "";
      const reviewOf = (b.type === "review") ? `<span class="text-muted small" data-role="target-name">• reviewing…</span>` : "";

      wrap.innerHTML = `
        <div class="card-body">
          <div class="bulletin-meta">
            <div class="bulletin-avatar d-inline-block" style="width:32px;height:32px;"></div>
            <strong>${profileLinkHtml(b.user_id, name)}</strong>
            ${helpBadge}${reviewBadge}${stars}
            ${reviewOf}
            <span class="text-muted small ms-2">${escapeHtml(when)}</span>
            <span class="text-muted small ms-auto" data-role="comment-count">${count} comment${count===1?"":"s"}</span>
          </div>
          <div class="bulletin-content">${b.message || ""}</div>
          <div class="mt-3 d-flex gap-2 flex-wrap">
            <button class="btn btn-sm btn-outline-secondary" data-role="comment-btn" data-id="${b.id}">Comment</button>
            <button class="btn btn-sm btn-outline-primary" data-role="view-comments" data-id="${b.id}">View comments (${count})</button>
          
            <button class="btn btn-sm btn-outline-secondary d-none" data-role="edit-bulletin" data-id="${b.id}">Edit</button>
            <button class="btn btn-sm btn-outline-danger d-none" data-role="delete-bulletin" data-id="${b.id}">Delete</button>
</div>
          <div class="mt-2 d-none" data-role="comment-box" data-id="${b.id}">
            <div class="input-group">
              <input type="text" class="form-control form-control-sm" placeholder="Write a comment...">
              <button class="btn btn-sm btn-primary" type="button" data-role="send-comment" data-id="${b.id}">Send</button>
            </div>
          </div>
          <div class="mt-2 d-none" data-role="comments" data-id="${b.id}"></div>
        </div>`;

      
      // Render poster avatar
      // Owner actions (show edit/delete to post author)
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.id === b.user_id) {
          const editBtn = wrap.querySelector('[data-role="edit-bulletin"]');
          const delBtn  = wrap.querySelector('[data-role="delete-bulletin"]');
          editBtn?.classList.remove('d-none');
          delBtn?.classList.remove('d-none');
          editBtn?.addEventListener('click', () => {
            const openBtn = document.getElementById('open-bulletin-modal');
            openBtn?.click();
            const typeSel = document.getElementById('composer-type');
            const reviewBox = document.getElementById('review-controls');
            const editor = document.getElementById('composer-editor');
            if (typeSel) typeSel.value = b.type || 'general';
            if (reviewBox){
              if (b.type === 'review'){
                reviewBox.classList.remove('d-none');
                const rt = document.getElementById('review-target-type');
                const rid = document.getElementById('review-target-id');
                const rr = document.getElementById('review-rating');
                if (rt) rt.value = b.review_target_type || '';
                if (rid) rid.value = b.review_target_id || '';
                if (rr && b.rating) rr.value = String(b.rating);
              } else {
                reviewBox.classList.add('d-none');
              }
            }
            if (editor) editor.innerHTML = b.message || '';
            const postBtn = document.getElementById('composer-post');
            if (postBtn){ postBtn.textContent = 'Save'; postBtn.dataset.mode = 'edit'; postBtn.dataset.editId = b.id; }
          });
          delBtn?.addEventListener('click', async () => {
            if (!confirm('Delete this post?')) return;
            const { error } = await supabase.from('bulletins').delete().eq('id', b.id).eq('user_id', user.id);
            if (!error) wrap.remove();
          });
        }
      } catch {}

      try {
        const av = wrap.querySelector('.bulletin-avatar');
        if (av) {
          const url = b?.profiles?.avatar_url || null;
          av.innerHTML = avatarHtml(url, name, 32);
        }
      } catch {}
    if (b.type === "review"){
        (async() => {
          const target = await resolveReviewTargetName(supabase, b.review_target_type, b.review_target_id);
          const span = wrap.querySelector('[data-role="target-name"]');
          if (span) span.textContent = target ? `• review of ${target}` : '• review';
        })();
      }

      const cbtn = wrap.querySelector('[data-role="comment-btn"]');
      const cbox = wrap.querySelector('[data-role="comment-box"]');
      const send = wrap.querySelector('[data-role="send-comment"]');
      const vbtn = wrap.querySelector('[data-role="view-comments"]');
      const list = wrap.querySelector('[data-role="comments"]');
      const countEl = wrap.querySelector('[data-role="comment-count"]');

      cbtn?.addEventListener("click", () => {
        cbox.classList.toggle("d-none");
        cbox.querySelector("input")?.focus();
      });

      send?.addEventListener("click", async () => {
        const inp = cbox.querySelector("input");
        const msg = (inp?.value || "").trim();
        if (!msg) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { alert("Please sign in."); return; }
        const key = `cpost:${b.id}:${msg}`;
        if (sessionStorage.getItem(key)) { return; }
        sessionStorage.setItem(key, Date.now().toString());
        setTimeout(()=>sessionStorage.removeItem(key), 15000);
        const { error } = await supabase.from("bulletin_comments").insert({ bulletin_id: b.id, user_id: user.id, message: msg });
        if (error) { console.warn("comment insert failed", error); return; }
        inp.value = "";
        const m = /(\d+)/.exec(countEl?.textContent || "0"); const current = m ? parseInt(m[1],10) : 0;
        const next = current + 1;
        if (countEl) countEl.textContent = `${next} comment${next===1?"":"s"}`;
        vbtn.textContent = `View comments (${next})`;
        if (!list.classList.contains("d-none")){
          const now = new Date().toLocaleString();
          const item = document.createElement("div");
          item.className = "border rounded-3 p-2 mb-2";
          item.innerHTML = `<div class="text-secondary fw-semibold">${now}</div><div>${escapeHtml(msg)}</div>`;
          list.appendChild(item);
        }
      });

      vbtn?.addEventListener("click", async () => {
        if (list.classList.contains("d-none")){
          list.classList.remove("d-none");
          if (!list.dataset.loaded){
            list.innerHTML = `<div class="text-muted small">Loading comments…</div>`;
            const items = await fetchCommentsWithNames(supabase, b.id);
            if (!items.length){
              list.innerHTML = `<div class="text-muted small">No comments yet.</div>`;
            } else {
              list.innerHTML = items.map(c => `
                <div class="border rounded-3 p-2 mb-2" data-comment-id="${c.id}" data-user-id="${c.user_id}">
                  <div class="d-flex align-items-center gap-2 mb-1">
                    ${avatarHtml(c.avatar_url, c.full_name, 24)}
                    <strong class="small"><a class="text-decoration-none" href="/communityhub/hub.html?module=profile&id=${encodeURIComponent(c.user_id)}">${escapeHtml(c.full_name)}</a></strong>
                    <span class="small text-muted ms-auto">${escapeHtml(new Date(c.created_at).toLocaleString())}</span>
                  </div>
                  <div data-role="comment-text">${escapeHtml(c.message)}</div>
                  <div class="mt-1 d-flex gap-2 small">
                    <button type="button" class="btn btn-link p-0" data-role="reply-comment" data-id="${c.id}" data-name="${escapeHtml(c.full_name)}">Reply</button>
                    <button type="button" class="btn btn-link p-0 d-none" data-role="edit-comment" data-id="${c.id}">Edit</button>
                    <button type="button" class="btn btn-link text-danger p-0 d-none" data-role="delete-comment" data-id="${c.id}">Delete</button>
                  </div>
                  <div class="mt-2 d-none" data-role="edit-row" data-id="${c.id}">
                    <div class="input-group input-group-sm">
                      <input type="text" class="form-control" value="${escapeHtml(c.message)}">
                      <button class="btn btn-primary" type="button" data-role="save-comment" data-id="${c.id}">Save</button>
                      <button class="btn btn-outline-secondary" type="button" data-role="cancel-edit" data-id="${c.id}">Cancel</button>
                    </div>
                  </div>
                </div>`).join("");
            // Unhide edit/delete for own comments right after render
            try{
              const { data: { user } } = await supabase.auth.getUser();
              list.querySelectorAll('[data-comment-id]').forEach(row => {
                const uid = (row.getAttribute('data-user-id')||'').trim();
                if (user && user.id === uid){
                  row.querySelector('[data-role="edit-comment"]')?.classList.remove('d-none');
                  row.querySelector('[data-role="delete-comment"]')?.classList.remove('d-none');
                }
              });
            }catch{}
            }
            list.dataset.loaded = "1";
          }
          vbtn.textContent = "Hide comments";
            // Wire comment actions: reply, edit, save, cancel, delete
            list.addEventListener("click", async (ev) => {
              const btn = ev.target.closest("[data-role]");
              if (!btn) return;
              const role = btn.getAttribute("data-role");
              const commentId = btn.getAttribute("data-id");
              if (!role) return;

              if (role === "reply-comment") {
                const name = btn.getAttribute("data-name") || "";
                const inp = cbox.querySelector("input");
                cbox.classList.remove("d-none");
                inp.value = (inp.value ? inp.value + " " : "") + "@" + name + " ";
                inp.focus();
              }

              if (role === "edit-comment") {
                const row = list.querySelector(`[data-comment-id="${commentId}"]`);
                if (!row) return;
                row.querySelector('[data-role="edit-row"]')?.classList.remove("d-none");
              }

              if (role === "cancel-edit") {
                const row = list.querySelector(`[data-comment-id="${commentId}"]`);
                if (!row) return;
                row.querySelector('[data-role="edit-row"]')?.classList.add("d-none");
              }

              if (role === "save-comment") {
                const row = list.querySelector(`[data-comment-id="${commentId}"]`);
                if (!row) return;
                const input = row.querySelector('input[type="text"]');
                const newMsg = (input?.value || "").trim();
                if (!newMsg) return;
                try {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) { alert("Please sign in."); return; }
                  const { error } = await supabase.from("bulletin_comments").update({ message: newMsg }).eq("id", commentId).eq("user_id", user.id);
                  if (error) { alert(error.message || "Update failed."); return; }
                  row.querySelector('[data-role="comment-text"]').textContent = newMsg;
                  row.querySelector('[data-role="edit-row"]')?.classList.add("d-none");
                } catch (e) { console.warn("save-comment failed", e); }
              }

              if (role === "delete-comment") {
                try {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) { alert("Please sign in."); return; }
                  if (!confirm("Delete this comment?")) return;
                  const { error } = await supabase.from("bulletin_comments").delete().eq("id", commentId).eq("user_id", user.id);
                  if (error) { alert(error.message || "Delete failed."); return; }
                  const row = list.querySelector(`[data-comment-id="${commentId}"]`);
                  if (row) row.remove();
                  // Decrement counts
                  const m = /(\d+)/.exec(countEl?.textContent || "0"); const current = m ? parseInt(m[1],10) : 0;
                  const next = Math.max(0, current - 1);
                  if (countEl) countEl.textContent = `${next} comment${next===1?"":"s"}`;
                  vbtn.textContent = `View comments (${next})`;
                } catch (e) { console.warn("delete-comment failed", e); }
              }
            }, { once: false });

        } else {
          list.classList.add("d-none");
          const m = /(\d+)/.exec(countEl?.textContent || "0"); const current = m ? parseInt(m[1],10) : 0;
          vbtn.textContent = `View comments (${current})`;
        }
      });

      try { await refreshSignedImages(window.supabase, wrap); } catch {}

      return wrap;
    }

    async function fetchCommentsWithNames(supabase, bulletinId){
      const { data: comments, error } = await supabase
        .from("bulletin_comments")
        .select("id, user_id, message, created_at")
        .eq("bulletin_id", bulletinId)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error || !comments) return [];

      const ids = Array.from(new Set(comments.map(c => c.user_id).filter(Boolean)));
      let names = {}; let avatars = {};
      if (ids.length){
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", ids);
        if (profs) for (const p of profs){ names[p.id] = p.full_name || "User"; avatars[p.id] = p.avatar_url || null; }
      }
      return comments.map(c => ({ ...c, full_name: names[c.user_id] || "User", avatar_url: avatars[c.user_id] || null }));
    }

    async function renderStoresBlock(supabase){
      const wrap = document.createElement("div");
      wrap.className = "card border-0 shadow-sm rounded-4";
      try {
        const { data } = await supabase.from("store_profiles").select("id, name, logo_url").order("id",{ascending:false}).limit(12);
        const items = (data||[]).slice(0,6);
        wrap.innerHTML = `<div class="card-body">
          <div class="d-flex align-items-center justify-content-between mb-2"><strong>Stores</strong>
            <a class="small text-decoration-none" href="#" data-role="see-stores">See all</a></div>
          <div class="d-flex flex-wrap gap-3">
            ${items.length?items.map(s=>`<a href="#" data-role="open-store" data-id="${s.id}" class="d-flex align-items-center text-decoration-none">
              ${logoHtml(s.logo_url, s.name, 40)}
              <span>${escapeHtml(s.name||"Store")}</span></a>`).join(""):`<div class="text-muted small">No stores yet.</div>`}
          </div></div>`;
        wrap.querySelector('[data-role="see-stores"]')?.addEventListener("click", (e)=>{
          e.preventDefault();
          try{ if (typeof window.loadModule === "function") loadModule("market"); else window.location.href="/communityhub/hub.html?module=market"; }catch{ window.location.href="/communityhub/hub.html?module=market"; }
        });
        wrap.querySelectorAll('[data-role="open-store"]').forEach(a => {
          a.addEventListener("click", (e) => {
            e.preventDefault();
            const id = a.getAttribute("data-id");
            try{
              if (typeof window.loadModule === "function") loadModule("store/view_store", { id });
              else window.location.href = `/communityhub/hub.html?module=store/view_store&id=${encodeURIComponent(id)}`;
            }catch{
              window.location.href = `/communityhub/hub.html?module=store/view_store&id=${encodeURIComponent(id)}`;
            }
          });
        });
      } catch {}
      return wrap;
    }

    async function renderAuctionsBlock(supabase){
      const wrap = document.createElement("div");
      wrap.className = "card border-0 shadow-sm rounded-4";
      try {
        const { data } = await supabase.from("user_auctions").select("id, description, common_name, current_bid, starting_bid, end_date").order("created_at",{ascending:false}).limit(6);
        const items = data||[];
        wrap.innerHTML = `<div class="card-body">
          <div class="d-flex align-items-center justify-content-between mb-2"><strong>Recent Auctions</strong>
            <a class="small text-decoration-none" href="#" data-role="see-auctions">See all</a></div>
          <div class="d-flex flex-column gap-2">
            ${items.length?items.map(a=>{const title=(a.description?.trim()||a.common_name?.trim()||"Auction");const bid=(a.current_bid??a.starting_bid??0);const money=Number(bid).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
              return `<div><a href="#" data-auction-id="${a.id}" class="open-auction-card">${escapeHtml(title)}</a> <span class="text-muted">— $${money}</span></div>`;}).join(""):`<div class="text-muted small">No auctions found</div>`}
          </div></div>`;
        wrap.querySelector('[data-role="see-auctions"]')?.addEventListener("click", (e)=>{
          e.preventDefault();
          try{ if (typeof window.loadModule === "function") loadModule("auctions_trades"); else window.location.href="/communityhub/hub.html?module=auctions_trades"; }catch{ window.location.href="/communityhub/hub.html?module=auctions_trades"; }
        });
        wrap.querySelectorAll("a.open-auction-card").forEach(el=>el.addEventListener("click",(e)=>{
          e.preventDefault(); const id=el.getAttribute("data-auction-id");
          try{ if(typeof window.loadModule==="function") loadModule("auctions/auction_card",{id});
               else window.location.href=`/communityhub/hub.html?module=auctions/auction_card&id=${encodeURIComponent(id)}`;
          }catch{
            window.location.href=`/communityhub/hub.html?module=auctions/auction_card&id=${encodeURIComponent(id)}`;
          }
        }));
      } catch {}
      return wrap;
    }

    async function renderTradesBlock(supabase){
      const wrap = document.createElement("div");
      wrap.className = "card border-0 shadow-sm rounded-4";
      try {
        const { data } = await supabase.from("trades").select("id, status").order("created_at",{ascending:false}).limit(6);
        const items = data||[];
        wrap.innerHTML = `<div class="card-body">
          <div class="d-flex align-items-center justify-content-between mb-2"><strong>Recent Trades</strong>
            <a class="small text-decoration-none" href="#" data-role="see-trades">See all</a></div>
          <div class="d-flex flex-column gap-2">
            ${items.length?items.map(t=>`<div><a href="#" data-role="open-trade" data-id="${t.id}">Trade #${escapeHtml(t.id)}</a> <span class="text-muted">— ${escapeHtml(t.status||"")}</span></div>`).join(""):`<div class="text-muted small">No trades found</div>`}
          </div></div>`;
        wrap.querySelector('[data-role="see-trades"]')?.addEventListener("click", (e)=>{
          e.preventDefault();
          try{ if (typeof window.loadModule === "function") loadModule("auctions_trades"); else window.location.href="/communityhub/hub.html?module=auctions_trades"; }catch{ window.location.href="/communityhub/hub.html?module=auctions_trades"; }
        });
        wrap.querySelectorAll('[data-role="open-trade"]').forEach(a => a.addEventListener("click", (e) => {
          e.preventDefault();
          const id = a.getAttribute("data-id");
          try{
            if (typeof window.loadModule === "function") loadModule("auctions_trades", { id });
            else window.location.href = `/communityhub/hub.html?module=auctions_trades#trade-${encodeURIComponent(id)}`;
          }catch{
            window.location.href = `/communityhub/hub.html?module=auctions_trades#trade-${encodeURIComponent(id)}`;
          }
        }));
      } catch {}
      return wrap;
    }

    return { init, prependById };
  })();

  
  /* ---- Avatar / Logo helpers ---- */
  function initialsFrom(name){
    const parts = String(name||"").trim().split(/\s+/).filter(Boolean);
    const init = parts.slice(0,2).map(w => w[0]?.toUpperCase() || "").join("");
    return init || "?";
  }
  function avatarHtml(url, name, size=32){
    const initials = initialsFrom(name);
    if (url){
      const safe = escapeHtml(url);
      return `<img src="${safe}" alt="${escapeHtml(name||'')}" class="rounded-circle border" style="width:${size}px;height:${size}px;object-fit:cover;">`;
    }
    return `<div class="rounded-circle border bg-light-subtle d-inline-flex align-items-center justify-content-center" style="width:${size}px;height:${size}px;"><span class="text-secondary fw-semibold">${escapeHtml(initials)}</span></div>`;
  }
  function logoHtml(url, alt, size=40){
    if (url){
      const safe = escapeHtml(url);
      return `<img src="${safe}" alt="${escapeHtml(alt||'')}" class="rounded border" style="width:${size}px;height:${size}px;object-fit:cover;background:#fff;">`;
    }
    return `<div class="rounded border bg-light-subtle" style="width:${size}px;height:${size}px;"></div>`;
  }
  function profileLinkHtml(userId, text){
    const href = `/communityhub/hub.html?module=profile&id=${encodeURIComponent(userId||'')}`;
    return `<a href="${href}" class="text-decoration-none">${escapeHtml(text||'Profile')}</a>`;
  }

  async function renderPromptAvatar(supabase){
    try{
      const { data:{ user } } = await supabase.auth.getUser();
      const mount = document.getElementById("composer-avatar");
      if (!mount) return;
      if (!user){ mount.innerHTML = avatarHtml(null, ""); return; }
      const { data: prof } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle();
      mount.innerHTML = avatarHtml(prof?.avatar_url || null, prof?.full_name || "");
    }catch(e){ /* ignore */ }
  }
/* ---------------- HELPERS ---------------- */
  function escapeHtml(str){ return String(str||"").replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function sanitizeHtml(html){
    try{
      const doc = new DOMParser().parseFromString(`<div>${html}</div>`,"text/html");
      const root = doc.body.firstChild;
      root.querySelectorAll("script,iframe,object,embed").forEach(n=>n.remove());
      root.querySelectorAll("*").forEach(el=>{[...el.attributes].forEach(a=>{ if(/^on/i.test(a.name)) el.removeAttribute(a.name); });});
      return root.innerHTML;
    }catch(e){ return html; }
  }
  function insertHtmlAtCaret(html){
    const sel=window.getSelection(); const ed=document.getElementById("composer-editor");
    if(!sel||sel.rangeCount===0){ ed?.insertAdjacentHTML("beforeend", html); return; }
    const range=sel.getRangeAt(0); range.deleteContents();
    const frag=range.createContextualFragment(html); range.insertNode(frag); sel.collapseToEnd();
  }

  // Resize an image client-side to keep bucket small
  async function resizeImageFile(file, { maxW=512, maxH=512, mime="image/webp", quality=0.82 } = {}){
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    let { width, height } = img;
    const ratio = Math.min(maxW / width, maxH / height, 1);
    const w = Math.max(1, Math.round(width * ratio));
    const h = Math.max(1, Math.round(height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, mime, quality));
    return { blob, w, h };
  }

  // Upload a blob to storage and create a signed URL
  async function uploadAndSign(supabase, blobOrFile, { originalName="upload", forceExt=".webp", contentType="image/webp" } = {}){
    try{
      const { data:{ user } } = await supabase.auth.getUser(); if(!user) { console.warn("no user"); return null; }
      const bucket="bulletin-images"; const ts=Date.now();
      const base = originalName.replace(/\.[^.]+$/,"").replace(/[^a-zA-Z0-9._-]/g,"_");
      const path=`${user.id}/${ts}_${base}${forceExt}`;
      const up=await supabase.storage.from(bucket).upload(path, blobOrFile, { upsert:false, contentType, cacheControl:"3600" });
      if(up.error) { console.warn("upload error", up.error); return null; }
      const sig=await supabase.storage.from(bucket).createSignedUrl(path, 60*60*24*7);
      if(sig.error) { console.warn("sign error", sig.error); return null; }
      return { path, signedUrl: sig.data.signedUrl };
    }catch(e){ console.warn("uploadAndSign failed", e); return null; }
  }

  async function refreshSignedImages(supabase, scopeEl){
    try{
      const imgs=(scopeEl||document).querySelectorAll("img[data-supa-path]"); if(!imgs.length) return;
      for(const img of imgs){ const path=img.getAttribute("data-supa-path"); if(!path) continue;
        const sig=await supabase.storage.from("bulletin-images").createSignedUrl(path, 60*60*24*7);
        if(!sig.error) img.src=sig.data.signedUrl;
      }
    }catch(e){ console.warn("refreshSignedImages failed", e); }
  }
  console.log("✅ home-post-guard.js loaded (post button guard + idempotency)");
  if (window.__POST_GUARD_WIRED__) return;
  window.__POST_GUARD_WIRED__ = true;

  function simpleHash(s){
    let h = 5381, i = s.length; while(i) h = (h*33) ^ s.charCodeAt(--i); return (h>>>0).toString(36);
  }
  function sanitizeHtml(html){
    try{
      const doc = new DOMParser().parseFromString(`<div>${html}</div>`,"text/html");
      const root = doc.body.firstChild;
      root.querySelectorAll("script,iframe,object,embed").forEach(n=>n.remove());
      root.querySelectorAll("*").forEach(el=>{[...el.attributes].forEach(a=>{ if(/^on/i.test(a.name)) el.removeAttribute(a.name); });});
      return root.innerHTML.trim();
    }catch{ return String(html||"").trim(); }
  }

  document.addEventListener("click", async function(e){
    const btn = e.target.closest("#composer-post");
    if (!btn) return;
    if (btn.disabled) { e.preventDefault(); e.stopPropagation(); return; }
    try{
      const editor = document.getElementById("composer-editor");
      const typeSel = document.getElementById("composer-type");
      const clean = sanitizeHtml(editor?.innerHTML || "");
      const type = (typeSel?.value || "general");
      const tgtType = document.getElementById("review-target-type")?.value || "";
      const tgtId = document.getElementById("review-target-id")?.value || "";
      const rating = document.getElementById("review-rating")?.value || "";

      if (!window.supabase || !window.supabase.auth) return; // let original handler run
      const { data:{ user } } = await window.supabase.auth.getUser();
      if (!user) return;

      const sig = simpleHash(`${user.id}|${type}|${tgtType}|${tgtId}|${rating}|${clean}`);
      const key = `post:${user.id}:${sig}`;
      if (sessionStorage.getItem(key)){
        e.preventDefault(); e.stopPropagation();
        alert("Looks like you already posted that just now.");
        return;
      }
      // mark and auto-clear
      sessionStorage.setItem(key, Date.now().toString());
      setTimeout(()=>sessionStorage.removeItem(key), 20000);

      // Single-flight: disable briefly so double clicks don't fire multiple inserts
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = "Posting…";
      setTimeout(()=>{ btn.disabled = false; btn.textContent = old; }, 5000);
      // Allow your existing click handler to continue (we're augmenting, not replacing)
    }catch(err){
      console.warn("post guard error", err);
    }
  }, true); // capture: run before original handler
})();