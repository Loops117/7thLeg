// home.js — feed + prompt wiring (robust lazy-loader for bulletin_composer.js)
(function () {
  console.log("✅ home.js loaded");

  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);

  async function boot() {
    try {
      const supabase = await waitForSupabase();
      teardown();
      ensureMarkup();
      wirePromptButton();           // ensures the click is registered + lazy-loads composer
      await renderPromptAvatar(supabase);
      wireFilters(supabase);
      await FEED.init(supabase);
    } catch (e) {
      console.error("❌ home.js boot failed", e);
    }
  }

  
  // ---- Feed filters (All / ID Requests / Help / Reviews) ----
  window.__FEED_FILTER__ = window.__FEED_FILTER__ || 'all';
  function wireFilters(supabase){
    // prefer existing markup with [data-feed-filter], else inject minimal bar
    let buttons = Array.from(document.querySelectorAll('[data-feed-filter]'));
    if (!buttons.length){
      const promptCard = document.getElementById('composer-prompt-card');
      const bar = document.createElement('div');
      bar.className = 'd-flex gap-2 mb-3 flex-wrap';
      bar.innerHTML = `
        <button class="btn btn-sm btn-outline-secondary active" data-feed-filter="all">All</button>
        <button class="btn btn-sm btn-outline-secondary" data-feed-filter="id_request">ID Requests</button>
        <button class="btn btn-sm btn-outline-secondary" data-feed-filter="help">Help</button>
        <button class="btn btn-sm btn-outline-secondary" data-feed-filter="review">Reviews</button>
      `;
      promptCard?.insertAdjacentElement('afterend', bar);
      buttons = Array.from(bar.querySelectorAll('[data-feed-filter]'));
    }
    const applyActive = (val) => {
      buttons.forEach(b => b.classList.toggle('active', b.getAttribute('data-feed-filter') === val));
    };
    applyActive(window.__FEED_FILTER__);
    buttons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const val = btn.getAttribute('data-feed-filter') || 'all';
        if (window.__FEED_FILTER__ === val) return;
        window.__FEED_FILTER__ = val;
        applyActive(val);
        // reload feed
        try { await FEED.init(supabase); } catch(e){ console.warn('filter reload failed', e); }
      }, { passive: true });
    });
  }
async function waitForSupabase(timeoutMs = 8000){
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (window.supabase && window.supabase.auth && window.supabase.from) return window.supabase;
      await new Promise(r => setTimeout(r, 60));
    }
    return null;
  }

  /* ---------------- TEARDOWN ---------------- */
  function teardown(){
    try { window.__HOME_OBS__?.disconnect(); } catch {}
    window.__HOME_OBS__ = null;
    ["composer-prompt-card","home-feed","home-feed-sentinel","home-inline-style"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  /* ---------------- MARKUP ---------------- */
  function ensureMarkup(){
    const root = document.getElementById("home-root") || document.getElementById("hub-content") || document.querySelector("main") || document.body;
    // Prompt card
    const card = document.createElement("div");
    card.id = "composer-prompt-card";
    card.className = "card border-0 shadow-sm mb-3";
    card.innerHTML = `<div class="card-body py-2 d-flex align-items-center gap-2">
        <div id="composer-avatar" class="rounded-circle bg-light-subtle border" style="width:36px;height:36px;"></div>
        <button id="open-bulletin-modal" class="prompt-button flex-grow-1 text-start" data-composer-src="">Post a bulletin</button>
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

    // Styles
    const st = document.createElement("style");
    st.id = "home-inline-style";
    st.textContent = `
      #composer-prompt-card { border-radius: 14px; }
      .prompt-button{ display:block;border:1px solid rgba(0,0,0,.1);background:#f8f9fa;padding:.6rem .9rem;border-radius:999px;color:#6c757d;}
      .prompt-button:hover{ background:#f1f3f5; color:#495057; }
      .bulletin-content img.bulletin-inline-img{ width:128px !important; height:auto !important; object-fit:contain; border-radius:8px; }
      .bulletin-card .card-body{ display:block; }
      .bulletin-card .bulletin-meta{ display:flex; align-items:center; gap:.5rem; margin-bottom:.5rem; flex-wrap:wrap; }
      .bulletin-card .bulletin-content{ display:block; width:100%; }
      .bulletin-card img{ max-width:100%; height:auto; border-radius:8px; }
    
      .bulletin-gallery{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.5rem;}
      .bulletin-gallery .bulletin-thumb img{width:150px;height:150px;object-fit:cover;border-radius:8px;}
    `;
    document.head.appendChild(st);
  }

  /* ---------------- PROMPT BUTTON ---------------- */
  function wirePromptButton(){
    const btn = document.getElementById("open-bulletin-modal");
    if (!btn) { console.warn("⚠️ open-bulletin-modal not found to wire"); return; }
    console.log("🔗 wiring prompt button");

    btn.addEventListener("click", async () => {
      console.log("🖱️ prompt clicked");
      const modal = document.getElementById("bulletin-modal");
      if (modal) return openModal(modal);

      try {
        await loadComposerScript(btn);
      } catch (e) {
        console.error("❌ Failed to load bulletin_composer.js", e);
        return;
      }

      const modal2 = document.getElementById("bulletin-modal");
      if (modal2) openModal(modal2);
      else window.dispatchEvent(new CustomEvent("open-bulletin-composer"));
    }, { passive: true });
  }

  function openModal(modal){
    modal.classList.add("open");
    document.documentElement.style.overflow = "hidden";
  }

  function loadComposerScript(btn){
    return new Promise(async (resolve, reject) => {
      if (document.getElementById("bulletin-composer-script")) return resolve();
      const tried = [];

      // 0) Explicit overrides (win or attr)
      const override = (window.BULLETIN_COMPOSER_SRC || btn.getAttribute("data-composer-src") || "").trim();
      if (override) {
        tried.push(override);
        const ok = await trySrc(override);
        if (ok) return resolve();
      }

      // 1) Same directory as this home.js
      const dir = getScriptDir();
      const sameDir = dir + "bulletin_composer.js?v=" + Date.now();
      tried.push(sameDir);
      if (await trySrc(sameDir)) return resolve();

      // 2) Relative to current page (hub.html)
      const base = new URL(document.baseURI || window.location.href);
      const rel1 = new URL("./bulletin_composer.js?v=" + Date.now(), base).href;
      tried.push(rel1);
      if (await trySrc(rel1)) return resolve();

      // 3) common folders under communityhub
      const common = [
        "./hub_modules/bulletin_composer.js",
        "./modules/bulletin_composer.js",
        "./js/bulletin_composer.js",
        "../hub_modules/bulletin_composer.js",
        "../modules/bulletin_composer.js",
        "../js/bulletin_composer.js",
      ].map(p => new URL(p + "?v=" + Date.now(), base).href);

      for (const url of common){
        tried.push(url);
        if (await trySrc(url)) return resolve();
      }

      console.error("❌ Could not locate bulletin_composer.js. Tried:", tried);
      reject(new Error("load-failed"));
    });
  }

  function getScriptDir(){
    // Prefer the script tag that loaded this file (works with ?v= cache busters)
    let script = document.currentScript;
    if (!script) {
      const all = Array.from(document.scripts);
      script = all.find(s => (s.src||"").includes("home.js")) || all[all.length-1];
    }
    const src = script?.src || "";
    const url = new URL(src, window.location.href);
    const parts = url.pathname.split("/");
    parts.pop(); // remove file name
    const dir = parts.join("/") + "/";
    return url.origin + dir; // absolute dir
  }

  async function trySrc(src){
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.id = "bulletin-composer-script";
      s.src = src;
      s.async = true;
      s.onload = () => { console.log("📥 bulletin_composer.js loaded from", src); resolve(true); };
      s.onerror = () => { resolve(false); };
      document.head.appendChild(s);
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

    async function prependById(supabaseOrId, maybeId){
      const supa = (maybeId === undefined ? (window.supabase || null) : supabaseOrId);
      const id = (maybeId === undefined ? supabaseOrId : maybeId);
      if (!supa) { console.warn('prependById: supabase not ready'); return; }
      const row = await fetchById(supa, id);
      if (row) container().insertBefore(await renderBulletinCard(supa, row), container().firstChild);
    }

    
async function fetchById(supabase, id){
      const { data, error } = await supabase
        .from("bulletins")
        .select(`id, user_id, message, help, type, review_target_type, review_target_id, rating, bulletin_gallery, created_at,
                 profiles:bulletins_user_id_fkey(id,full_name,avatar_url),
                 bulletin_comments(count)`)
        .eq("id", id)
        .maybeSingle();
      if (error) { console.warn("fetchById error", error); return null; }
      return data;
    }


    
async function fetchBulletins(supabase, limit, start){
      const f = (window.__FEED_FILTER__ || 'all');
      let q = supabase
        .from("bulletins")
        .select(`id, user_id, message, help, type, review_target_type, review_target_id, rating, bulletin_gallery, created_at,
                 profiles:bulletins_user_id_fkey(id,full_name,avatar_url),
                 bulletin_comments(count)`)
        .order("created_at", { ascending:false })
        .range(start, start + limit - 1);
      if (f === 'help') q = q.eq('help', true);
      else if (f === 'id_request') q = q.eq('type', 'id_request');
      else if (f === 'review') q = q.eq('type', 'review');
      const { data, error } = await q;
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
      const galleryHtml = buildGalleryHtml(b);
      const wrap = document.createElement("div");
      wrap.className = "card border-0 shadow-sm rounded-4 bulletin-card";
      const name = b?.profiles?.full_name || "User";
      const when = new Date(b.created_at).toLocaleString();
      const count = Array.isArray(b.bulletin_comments) && b.bulletin_comments[0]?.count ? b.bulletin_comments[0].count : 0;
      const helpBadge = (b && b.help) ? `<span class="badge bg-danger ms-1">Help</span>` : "";
      const idBadge = (b && b.type === "id_request") ? `<span class="badge bg-warning text-dark ms-1">ID Request</span>` : "";
      const reviewBadge = (b && b.type === "review") ? `<span class="badge bg-success ms-1">Review</span>` : "";
      const stars = (b.type === "review" && b.rating) ? ` <span class="text-warning">${"★".repeat(b.rating)}${"☆".repeat(5-b.rating)}</span>` : "";
      const reviewOf = (b.type === "review") ? `<span class="text-muted small" data-role="target-name">• reviewing…</span>` : "";

      wrap.innerHTML = `
        <div class="card-body">
          <div class="bulletin-meta">
            <div class="bulletin-avatar d-inline-block" style="width:32px;height:32px;"></div>
            <strong>${profileLinkHtml(b.user_id, name)}</strong>
            ${helpBadge}${idBadge}${reviewBadge}${stars}
            ${reviewOf}
            <span class="text-muted small ms-2">${escapeHtml(when)}</span>
            <span class="text-muted small ms-auto" data-role="comment-count">${count} comment${count===1?"":"s"}</span>
          </div>
          <div class="bulletin-content">${b.message || ""}</div>${galleryHtml}
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

      // Render vote arrows for this bulletin
      try { await renderBulletinVotes(supabase, wrap, b); } catch(e){ console.warn('bulletin votes mount failed', e); }

      // Owner actions (show edit/delete to post author) — unchanged
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.id === b.user_id) {
          const editBtn = wrap.querySelector('[data-role="edit-bulletin"]');
          const delBtn  = wrap.querySelector('[data-role="delete-bulletin"]');
          editBtn?.classList.remove('d-none');
          delBtn?.classList.remove('d-none');
          editBtn?.addEventListener('click', async () => {
            // Ensure composer script is loaded
            if (!document.getElementById('bulletin-modal')){
              try { await loadComposerScript(editBtn); } catch(e){ console.error('❌ Failed to load composer for edit', e); return; }
            }
            // Open composer with full payload (prefill-first in composer listener)
            window.dispatchEvent(new CustomEvent('open-bulletin-composer', { detail: {
              id: b.id,
              type: b.type || 'general',
              message: b.message || '',
              review_target_type: b.review_target_type || '',
              review_target_id: b.review_target_id || '',
              rating: b.rating || null,
              bulletin_gallery: Array.isArray(b.bulletin_gallery) ? b.bulletin_gallery : []
            }}));
          });
delBtn?.addEventListener('click', async () => {
            if (!confirm('Delete this post?')) return;
            const { error } = await supabase.from('bulletins').delete().eq('id', b.id).eq('user_id', user.id);
            if (!error) wrap.remove();
          });
        }
      } catch {}

      // Avatar
      try {
        const av = wrap.querySelector('.bulletin-avatar');
        if (av) {
          const url = b?.profiles?.avatar_url || null;
          av.innerHTML = avatarHtml(url, name, 32);
        }
      } catch {}

      // Review target name
      if (b.type === "review"){
        (async() => {
          const target = await resolveReviewTargetName(supabase, b.review_target_type, b.review_target_id);
          const span = wrap.querySelector('[data-role="target-name"]');
          if (span) span.textContent = target ? `• review of ${target}` : '• review';
        })();
      }

      // Comments UI — unchanged
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
              // attach vote controls to each comment row
              try {
                list.querySelectorAll('[data-comment-id]').forEach(row => {
                  const cid = row.getAttribute('data-comment-id');
                  renderCommentVotes(supabase, row, cid);
                });
              } catch(e) { console.warn('comment votes render failed', e); }

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
          <div class="d-flex alignments-center justify-content-between mb-2"><strong>Recent Auctions</strong>
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

  // Expose feed so bulletin_composer.js can prepend newly created posts
  window.__HOME_FEED__ = FEED;

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
  function escapeHtml(str){
    return String(str || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }
  /* ---------- Bulletin gallery thumbnails ---------- */
  function buildGalleryHtml(b){
    try{
      const arr = Array.isArray(b && b.bulletin_gallery) ? b.bulletin_gallery : [];
      if (!arr.length) return "";
      const items = arr.slice(0, 12).map((p) => {
        if (!p) return "";
        const isUrl = /^https?:\/\//i.test(p);
        if (isUrl){
          const u = escapeHtml(p);
          return '<a class="bulletin-thumb" href="'+u+'" target="_blank" rel="noopener">'
               +   '<img src="'+u+'" alt="">'
               + '</a>';
        } else {
          const sp = escapeHtml(p);
          return '<a class="bulletin-thumb" data-supa-path="'+sp+'" href="#">'
               +   '<img data-supa-path="'+sp+'" alt="">'
               + '</a>';
        }
      }).join("");
      return '<div class="bulletin-gallery">'+items+'</div>';
    }catch(e){ console.warn("buildGalleryHtml failed", e); return ""; }
  }
  function attachGalleryLinkClicks(supabase, scopeEl){
    try{
      (scopeEl || document).querySelectorAll('.bulletin-gallery a[data-supa-path]').forEach((a)=>{
        a.addEventListener('click', async (ev)=>{
          ev.preventDefault();
          const path = a.getAttribute('data-supa-path');
          if (!path || !supabase) return;
          try{
            const r = await supabase.storage.from('bulletin-images').createSignedUrl(path, 60*60);
            if (r && r.data && r.data.signedUrl) window.open(r.data.signedUrl, "_blank", "noopener");
          }catch(e){ console.warn("open signed image failed", e); }
        }, { passive:false });
      });
    }catch(e){}
  }

async function refreshSignedImages(supabase, scopeEl){
    try{
      const imgs = (scopeEl || document).querySelectorAll('img[data-supa-path]');
      if (!imgs.length) return;
      for (const img of imgs){
        const path = img.getAttribute('data-supa-path');
        if (!path) continue;
        const sig = await supabase.storage
          .from('bulletin-images')
          .createSignedUrl(path, 60*60*24*7);
        if (!sig.error) img.src = sig.data.signedUrl;
      }
    }catch(e){
      console.warn('refreshSignedImages failed', e);
    }
  }
})();

// --- bulletin lightbox once ---
(function(){ 
  if (window.__bulletinLightboxOnce) return; 
  window.__bulletinLightboxOnce = true;

  const SIGN_CACHE = new Map(); // path -> signedUrl
  const BUCKET = 'bulletin-images';

  const qs  = (sel, root=document) => root.querySelector(sel);
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function ensureModal(){
    if (qs('#galleryModal')) return;
    const modal = document.createElement('div');
    modal.id = 'galleryModal';
    modal.className = 'modal fade';
    modal.tabIndex = -1;
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered modal-xl">
        <div class="modal-content bg-dark text-white position-relative">
          <div class="modal-header border-0">
            <h6 class="modal-title">Image</h6>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body d-flex justify-content-center align-items-center" style="min-height:60vh;overflow:hidden;">
            <img id="galleryModalImage" src="" alt="" style="max-width:100%;max-height:80vh; transform-origin:center center;"/>
          </div>
          <div class="modal-footer justify-content-between">
            <div class="btn-group">
              <button id="btn-prev" class="btn btn-outline-light">‹ Prev</button>
              <button id="btn-next" class="btn btn-outline-light">Next ›</button>
            </div>
            <div class="btn-group">
              <button id="btn-zoom-out" class="btn btn-outline-light">-</button>
              <button id="btn-zoom-reset" class="btn btn-outline-light">Reset</button>
              <button id="btn-zoom-in" class="btn btn-outline-light">+</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  async function signIfNeeded(urlOrPath){
    if (!urlOrPath) return urlOrPath;
    if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
    if (SIGN_CACHE.has(urlOrPath)) return SIGN_CACHE.get(urlOrPath);
    const sb = window.supabase;
    try{
      const r = await sb.storage.from(BUCKET).createSignedUrl(urlOrPath, 60*60);
      const u = r?.data?.signedUrl || urlOrPath;
      SIGN_CACHE.set(urlOrPath, u);
      return u;
    }catch{ return urlOrPath; }
  }

  function collectGallery(clickedEl){
    const gallery = clickedEl.closest('.bulletin-gallery');
    if (!gallery) return { list: [], index: 0 };
    const anchors = qsa('a.bulletin-thumb, .bulletin-gallery a[href]', gallery);
    const images  = qsa('img.gallery-thumb, .bulletin-gallery img', gallery);
    const nodes = anchors.length ? anchors : images;
    const list = nodes.map(el => {
      const path = el.getAttribute('data-supa-path') || el.dataset?.supaPath;
      const href = el.getAttribute('href') || el.getAttribute('src');
      return path || href || '';
    }).filter(Boolean);
    const index = Math.max(0, nodes.indexOf(clickedEl.closest('a, img')));
    return { list, index };
  }

  function openModalWith(urls, start=0){
    ensureModal();
    const img = qs('#galleryModalImage');
    let i = start|0, scale = 1, panX = 0, panY = 0;

    function setImg(idx){
      i = (idx + urls.length) % urls.length;
      img.dataset.index = i;
      img.src = urls[i];
      reset(false);
    }
    function reset(apply = true){
      scale = 1; panX = 0; panY = 0;
      if (apply) applyTransform();
    }
    function applyTransform(){
      img.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
      img.style.cursor = scale>1 ? 'grab' : 'default';
    }
    function next(){ setImg(i+1); }
    function prev(){ setImg(i-1); }

    let isDown = false, lastX=0, lastY=0;
    function onDown(e){ isDown = true; (img.style.cursor='grabbing'); const pt = (e.touches?.[0])||e; lastX=pt.clientX; lastY=pt.clientY; }
    function onMove(e){ if(!isDown||scale<=1) return; const pt=(e.touches?.[0])||e; panX += (pt.clientX-lastX); panY += (pt.clientY-lastY); lastX=pt.clientX; lastY=pt.clientY; applyTransform(); }
    function onUp(){ isDown = false; if(scale>1) img.style.cursor='grab'; }

    qs('#btn-next').onclick = next;
    qs('#btn-prev').onclick = prev;
    qs('#btn-zoom-in').onclick = () => { scale = Math.min(6, scale + 0.2); applyTransform(); };
    qs('#btn-zoom-out').onclick = () => { scale = Math.max(1, scale - 0.2); applyTransform(); };
    qs('#btn-zoom-reset').onclick = () => { reset(true); };

    img.onmousedown = onDown;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    img.ontouchstart = onDown;
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
    window.addEventListener('keydown', (e)=>{
      if (!document.body.classList.contains('modal-open')) return;
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === '+') { scale = Math.min(6, scale + 0.2); applyTransform(); }
      else if (e.key === '-') { scale = Math.max(1, scale - 0.2); applyTransform(); }
      else if (e.key === '0') reset(true);
    });

    // Bootstrap or fallback
    const modalEl = qs('#galleryModal');
    let Modal = window.bootstrap?.Modal || (window.bootstrap && window.bootstrap.Modal);
    const inst = Modal ? Modal.getOrCreateInstance(modalEl) : null;
    if (inst) inst.show(); 
    else {
      modalEl.classList.add('show'); modalEl.style.display='block'; modalEl.setAttribute('aria-modal','true'); modalEl.removeAttribute('aria-hidden');
      document.body.classList.add('modal-open');
      if (!qs('#galleryBackdrop')) { const bd=document.createElement('div'); bd.id='galleryBackdrop'; bd.className='modal-backdrop fade show'; bd.style.display='block'; document.body.appendChild(bd); }
      qs('#galleryModal .btn-close')?.addEventListener('click', ()=>{ modalEl.classList.remove('show'); modalEl.style.display='none'; document.body.classList.remove('modal-open'); const bd=qs('#galleryBackdrop'); if (bd) bd.remove(); }, { once:true });
    }

    setImg(i);
  }

  async function handleGalleryClick(e){
    const target = e.target.closest('.bulletin-gallery a, .bulletin-gallery img, img.gallery-thumb');
    if (!target) return;
    const isLeft = (e.button === 0 || e.button == null);
    if (!isLeft || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();

    const { list, index } = collectGallery(target);
    if (!list.length) return;
    const urls = await Promise.all(list.map(signIfNeeded));
    openModalWith(urls, index);
  }

  // Install capture-phase listener once
  if (document.readyState !== 'loading'){ ensureModal(); document.addEventListener('click', handleGalleryClick, { capture:true }); }
  else document.addEventListener('DOMContentLoaded', function(){ ensureModal(); document.addEventListener('click', handleGalleryClick, { capture:true }); });
})();


/* ---------------- VOTE HELPERS ---------------- */
function voteSvgButton(type, label){
  const isUp = type === 'up';
  const points = isUp ? "14,3 26,25 2,25" : "2,3 26,3 14,25";
  const textY = isUp ? 18 : 15;
  return `<button class="vote-btn ${isUp?'up':'down'}" data-vote="${type}" aria-label="${type === 'up' ? '+1' : '-1'}">
    <svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg" role="img" focusable="false">
      <polygon points="${points}" stroke-width="2" />
      <text x="14" y="${textY}" text-anchor="middle" dominant-baseline="middle">${label}</text>
    </svg>
  </button>`;
}

async function upsertReaction(supabase, { targetType, targetId, reactionType }){
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { alert("Please sign in."); return { error: { message: "not-signed-in" } }; }
  // Toggle model: insert, switch, or delete to neutral
  const { data: existing, error: fetchErr } = await supabase
    .from('points_reactions')
    .select('id, reaction_type')
    .eq('voter_id', user.id)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .limit(1)
    .maybeSingle();
  if (fetchErr && fetchErr.code !== 'PGRST116') {
    return { error: fetchErr };
  }
  if (!existing){
    const { error } = await supabase.from('points_reactions').insert({
      voter_id: user.id, target_type: targetType, target_id: targetId, reaction_type: reactionType
    });
    return { error };
  } else if (existing.reaction_type === reactionType){
    const { error } = await supabase.from('points_reactions').delete().eq('id', existing.id);
    return { error };
  } else {
    const { error } = await supabase.from('points_reactions').update({ reaction_type: reactionType }).eq('id', existing.id);
    return { error };
  }
}

async function fetchVoteScore(supabase, targetType, targetId){
  const { data, error } = await supabase
    .from('points_reactions')
    .select('reaction_type')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .limit(10000);
  if (error || !data) return 0;
  let up = 0, down = 0;
  for (const r of data){ if (r.reaction_type==='up') up++; else if (r.reaction_type==='down') down++; }
  return up - down;
}

async function markUserSelection(supabase, rootEl, targetType, targetId){
  try{
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('points_reactions')
      .select('reaction_type')
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .eq('voter_id', user.id)
      .maybeSingle();
    rootEl.querySelectorAll('.vote-btn').forEach(b=>b.classList.remove('selected'));
    if (data && data.reaction_type){
      const btn = rootEl.querySelector(`.vote-btn[data-vote="${data.reaction_type}"]`);
      if (btn) btn.classList.add('selected');
    }
  }catch{}
}


async function renderBulletinVotes(supabase, wrap, b){
  // Find the action bar that contains Comment/View Comments buttons
  const viewBtn = wrap.querySelector('[data-role="view-comments"][data-id="'+b.id+'"]');
  const bar = viewBtn ? viewBtn.parentElement : wrap.querySelector('.mt-3.d-flex');
  if (!bar) return;

  // Build horizontal vote controls
  const container = document.createElement('span');
  container.className = 'vote-horiz ms-auto'; // push toward the end if there's room
  container.setAttribute('data-target-type','bulletin');
  container.setAttribute('data-target-id', b.id);
  container.innerHTML = voteSvgButton('up','') + '<span class="vote-score">0</span>' + voteSvgButton('down','');
  bar.appendChild(container);

  const scoreEl = container.querySelector('.vote-score');
  // Initial score
  scoreEl.textContent = await fetchVoteScore(supabase, 'bulletin', b.id);

  // Hide buttons for the owner; still show score
  try{
    const { data: { user } } = await supabase.auth.getUser();
    const isOwner = !!(user && user.id === b.user_id);
    if (isOwner){
      container.querySelectorAll('.vote-btn').forEach(btn => btn.classList.add('d-none'));
    } else {
      await markUserSelection(supabase, container, 'bulletin', b.id);
      // Wire handlers for non-owners
      container.querySelectorAll('.vote-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const kind = btn.getAttribute('data-vote');
          const { error } = await upsertReaction(supabase, { targetType: 'bulletin', targetId: b.id, reactionType: kind });
          if (!error){
            scoreEl.textContent = await fetchVoteScore(supabase, 'bulletin', b.id);
            await markUserSelection(supabase, container, 'bulletin', b.id);
          } else {
            console.warn('vote failed', error);
          }
        });
      });
    }
  }catch(e){
    console.warn('bulletin vote init failed', e);
  }
}


async function renderCommentVotes(supabase, rowEl, commentId){
  // next to edit/delete, horizontal block
  const actions = rowEl.querySelector('.mt-1.d-flex');
  const mount = actions || rowEl;
  const wrap = document.createElement('span');
  wrap.className = 'vote-horiz';
  wrap.setAttribute('data-target-type','comment');
  wrap.setAttribute('data-target-id', commentId);
  wrap.innerHTML = voteSvgButton('up','') + `<span class="vote-score">0</span>` + voteSvgButton('down','');
  mount.appendChild(wrap);

  const scoreEl = wrap.querySelector('.vote-score');
  // Hide buttons for comment owner; still show score
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const isOwner = !!(user && user.id === rowEl.getAttribute('data-user-id'));
    if (isOwner){ wrap.querySelectorAll('.vote-btn').forEach(btn => btn.classList.add('d-none')); }
  } catch {}

  scoreEl.textContent = await fetchVoteScore(supabase, 'comment', commentId);
  await markUserSelection(supabase, wrap, 'comment', commentId);

  wrap.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const kind = btn.getAttribute('data-vote');
      const { error } = await upsertReaction(supabase, { targetType: 'comment', targetId: commentId, reactionType: kind });
      if (!error){
        scoreEl.textContent = await fetchVoteScore(supabase, 'comment', commentId);
        await markUserSelection(supabase, wrap, 'comment', commentId);
      } else {
        console.warn('comment vote failed', error);
      }
    });
  });
}

/* === QNA NUDGE AUTOLOAD (router-safe) === */
(function(){
  try{
    setTimeout(() => {
      import('/communityhub/hub_modules/home-qna-nudge.loader.v2.js?v=' + Date.now())
        .then(() => console.info('[QNA] autoload: loader requested'))
        .catch(e => console.warn('[QNA] autoload import failed', e));
    }, 0);
  }catch(e){
    console.warn('[QNA] autoload wrapper failed', e);
  }
})();