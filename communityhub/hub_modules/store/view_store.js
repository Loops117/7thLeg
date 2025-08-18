// store/view_store.js — Public Store view module
export async function init(...args) {
  console.log("✅ view_store.js init");
  const supabase = await waitForSupabase();
  if (!supabase) return;

  // Accept loader params OR URL query (?id= / ?slug=)
  let passed = null;
  for (const a of args) { if (a && typeof a === "object" && (a.id || a.slug)) { passed = a; break; } }
  const qs = new URLSearchParams(location.search);
  const id = passed?.id || qs.get("id");
  const slug = passed?.slug || qs.get("slug");

  if (!id && !slug) {
    console.warn("view_store: no id/slug passed");
  }

  const store = await fetchStore(supabase, { id, slug });
  if (!store) {
    const root = document.getElementById("store-view-root");
    if (root) root.innerHTML = `<div class="container py-5"><div class="alert alert-warning">Store not found.</div></div>`;
    return;
  }

  renderStoreHeader(store);
  renderPolicies(store);
  await renderReviews(supabase, store.id);
  await renderProducts(supabase, store);
  wireReviewComposer(supabase, store);
}

export default { init };

/* ---------- utils ---------- */
function hEsc(s){
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[m]);
}
function initialsFrom(name){
  const parts = String(name||"").trim().split(/\s+/).filter(Boolean);
  const init = parts.slice(0,2).map(w => (w && w[0] ? w[0].toUpperCase() : "")).join("");
  return init || "?";
}
function logoHtml(url, alt, size=96){
  if (url){
    return `<img src="${hEsc(url)}" alt="${hEsc(alt||'')}" style="width:${size}px;height:${size}px;object-fit:cover;">`;
  }
  return `<div class="d-inline-flex align-items-center justify-content-center text-muted border rounded" style="width:${size}px;height:${size}px;background:#f3f4f6;">${hEsc((alt||'')[0]||'S')}</div>`;
}
function avatarHtml(url, name, size=36){
  if (url){
    return `<img src="${hEsc(url)}" alt="${hEsc(name||'')}" class="rounded-circle border" style="width:${size}px;height:${size}px;object-fit:cover;">`;
  }
  const initials = initialsFrom(name);
  return `<div class="rounded-circle border bg-light-subtle d-inline-flex align-items-center justify-content-center" style="width:${size}px;height:${size}px;"><span class="small text-muted">${hEsc(initials)}</span></div>`;
}
function stars(n){
  n = Math.max(1, Math.min(5, parseInt(n||0,10)||0));
  return `<span class="text-warning" aria-label="${n} star rating">${"★".repeat(n)}${"☆".repeat(5-n)}</span>`;
}
function profileLink(userId, text){
  const href = `/communityhub/hub.html?module=profile&id=${encodeURIComponent(userId)}`;
  return `<a href="${href}" class="text-decoration-none">${hEsc(text||'Profile')}</a>`;
}
async function waitForSupabase(timeoutMs = 8000){
  const start = Date.now();
  while (Date.now() - start < timeoutMs){
    if (window.supabase?.auth && window.supabase?.from) return window.supabase;
    await new Promise(r => setTimeout(r, 60));
  }
  console.error("Supabase not available");
  return null;
}

/* ---------- data ---------- */
async function fetchStoreProducts(supabase, storeId, { limit = 24 } = {}){
  try {
    let q = supabase
      .from("store_listings")
      .select(`
        id,
        product_type,
        species,
        morph_name,
        dry_name,
        dry_description,
        description,
        batch_size,
        qty_available,
        price_per_batch,
        currency,
        store_id,
        cover_image
      `)
      .eq("active", true)
      .eq("store_id", storeId)
      .order("updated_at", { ascending: false })
      .limit(limit);
    const { data, error } = await q;
    if (error){ console.warn("fetchStoreProducts error", error); return []; }
    return data || [];
  } catch(e){ console.warn("fetchStoreProducts ex", e); return []; }
}

async function fetchStore(supabase, { id, slug }){
  try {
    let q = supabase.from("store_profiles").select("id, owner_id, name, slug, logo_url, banner_url, website_url, bio, location, policies, status, created_at");
    if (id) q = q.eq("id", id);
    else if (slug) q = q.eq("slug", slug);
    else return null;
    const { data, error } = await q.maybeSingle();
    if (error) { console.warn("fetchStore error", error); return null; }
    return data || null;
  } catch(e){ console.warn("fetchStore ex", e); return null; }
}

async function fetchStoreReviews(supabase, storeId){
  try {
    const { data, error } = await supabase
      .from("bulletins")
      .select("id,user_id,message,rating,created_at,profiles:profiles!bulletins_user_id_fkey(id,full_name,avatar_url)")
      .eq("type","review")
      .eq("review_target_type","store")
      .eq("review_target_id", storeId)
      .order("created_at",{ ascending:false });
    if (error){ console.warn("reviews error", error); return []; }
    return data || [];
  } catch(e){ console.warn("fetchStoreReviews ex", e); return []; }
}

/* ---------- render ---------- */
function renderStoreHeader(store){
  // Banner
  const banner = document.getElementById("store-banner");
  if (banner && store.banner_url){
    banner.style.backgroundImage = `url('${String(store.banner_url).replace(/'/g, "%27")}')`;
  }

  // Logo
  const logo = document.getElementById("store-logo");
  if (logo) logo.innerHTML = logoHtml(store.logo_url, store.name, 96);

  // Name, meta
  const nameEl = document.getElementById("store-name");
  if (nameEl) nameEl.textContent = store.name || "Store";

  const loc = document.getElementById("store-location");
  if (loc && store.location) loc.textContent = store.location;

  const created = document.getElementById("store-created");
  if (created && store.created_at){
    const dt = new Date(store.created_at);
    created.textContent = `Joined ${dt.toLocaleDateString()}`;
  }

  const site = document.getElementById("store-website");
  if (site && store.website_url){
    site.href = store.website_url;
    site.classList.remove("d-none");
  }

  const pub = document.getElementById("store-slug-link");
  if (pub && store.slug){
    pub.href = `https://www.7thleg.com/${encodeURIComponent(store.slug)}`;
    pub.classList.remove("d-none");
  }

  // Bio
  const bio = document.getElementById("store-bio");
  if (bio){
    bio.textContent = store.bio || "No description yet.";
  }
}

function renderPolicies(store){
  const box = document.getElementById("store-policies");
  if (!box) return;
  const pol = store.policies && typeof store.policies === "object" ? store.policies : null;
  if (!pol || Object.keys(pol).length === 0){
    box.textContent = "No policies published.";
    return;
  }
  const rows = [];
  for (const [k,v] of Object.entries(pol)){
    rows.push(`<div class="mb-1"><span class="text-uppercase small text-muted">${hEsc(k)}</span><div>${hEsc(String(v))}</div></div>`);
  }
  box.innerHTML = rows.join("");
}

async function renderReviews(supabase, storeId){
  const wrap = document.getElementById("store-reviews");
  const countEl = document.getElementById("store-reviews-count");
  if (!wrap) return;
  wrap.innerHTML = `<div class="text-muted small">Loading…</div>`;

  const list = await fetchStoreReviews(supabase, storeId);
  if (countEl) countEl.textContent = list.length ? `${list.length}` : "";

  if (!list.length){
    wrap.innerHTML = `<div class="text-muted small">No reviews yet.</div>`;
    return;
  }

  wrap.innerHTML = "";
  for (const r of list){
    const u = r.profiles || {};
    const row = document.createElement("div");
    row.className = "p-2 border rounded-3";
    row.innerHTML = `
      <div class="d-flex align-items-start gap-2">
        <div>${avatarHtml(u.avatar_url, u.full_name)}</div>
        <div class="flex-grow-1">
          <div class="d-flex align-items-center justify-content-between">
            <div class="fw-semibold">${profileLink(u.id, u.full_name || "User")}</div>
            <div class="small text-muted">${new Date(r.created_at).toLocaleDateString()}</div>
          </div>
          <div>${stars(r.rating)}</div>
          <div class="mt-1">${hEsc(r.message || "")}</div>
        </div>
      </div>`;
    wrap.appendChild(row);
  }
}


/* ---------- products render ---------- */
async function renderProducts(supabase, store){
  const wrap = document.getElementById("store-products-grid");
  const status = document.getElementById("store-products-status");
  const countEl = document.getElementById("store-products-count");
  if (!wrap) return;
  if (status) status.textContent = "Loading products…";
  wrap.innerHTML = "";

  const rows = await fetchStoreProducts(supabase, store.id, { limit: 24 });
  if (countEl) countEl.textContent = rows.length ? String(rows.length) : "";
  if (!rows.length){
    if (status) status.textContent = "No products listed yet.";
    return;
  }
  if (status) status.textContent = "";

  wrap.innerHTML = rows.map(l => renderProductCard(l, store)).join("");
}

function renderProductCard(l, store){
  const isDry = l.product_type === "drygood" || l.product_type === "dry_good";
  const species = (l.species || "").trim();
  const morph = (l.morph_name || "").trim();
  const batchSize = Number.isFinite(l.batch_size) ? l.batch_size : null;         // individuals per batch
  const batchCount = Number.isFinite(l.qty_available) ? l.qty_available : null;  // number of batches available

  // Title rules like market.js
  let title;
  if (!isDry) {
    const qtyPrefix = batchSize ? `${batchSize}x ` : "";
    const namePart = [species || "Live Item", morph].filter(Boolean).join(" - ");
    title = `${qtyPrefix}${namePart}`;
  } else {
    title = l.dry_name || "Dry Good";
  }

  const desc = isDry ? (l.dry_description || l.description || "") : (l.description || "");
  const price = formatPrice(l.price_per_batch, l.currency);
  const fallback = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

  return `
  <div class="col-12 col-sm-6 col-md-4">
    <div class="card h-100 shadow-sm">
      <div class="ratio ratio-1x1 bg-light">
        <img src="${escapeAttr(l.cover_image) || fallback}" alt="${escapeAttr(title)}" class="card-img-top" style="object-fit:cover;">
      </div>
      <div class="card-body d-flex flex-column">
        <h6 class="mb-1">${escapeHTML(title)}</h6>
        ${desc ? `<p class="mb-2 small text-muted" style="min-height:2.5em">${escapeHTML(desc).slice(0,150)}${desc.length>150?'…':''}</p>` : ``}
        <div class="mt-auto d-flex align-items-center justify-content-between">
          <div class="small text-muted">${batchCount !== null ? `Batches: ${batchCount}` : ``}</div>
          <div class="fw-semibold">${price}</div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ---- product utils (mirroring market.js) ---- */
function escapeHTML(s){ return String(s || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHTML(s); }
function formatPrice(v, cur){
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${(cur || "USD").toUpperCase()} $${n.toFixed(2)}`;
}
/* ---------- composer ---------- */
function setVMsg(txt, cls){
  const el = document.getElementById("vr-msg");
  if (!el) return;
  el.className = "small " + (cls || "text-muted");
  el.textContent = txt || "";
}

function wireReviewComposer(supabase, store){
  const btn = document.getElementById("btn-write-review");
  const modalEl = document.getElementById("storeReviewModal");
  if (!btn || !modalEl) return;
  const modal = new bootstrap.Modal(modalEl);

  btn.addEventListener("click", async () => {
    setVMsg("");
    const msgEl = document.getElementById("vr-message");
    const rateEl = document.getElementById("vr-rating");
    if (msgEl) msgEl.value = "";
    if (rateEl) rateEl.value = "5";
    modal.show();
  });

  document.getElementById("vr-submit")?.addEventListener("click", async () => {
    try {
      setVMsg("Posting…");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setVMsg("Please sign in to post.", "text-danger"); return; }
      const rating = parseInt(document.getElementById("vr-rating").value || "0", 10);
      const message = (document.getElementById("vr-message").value || "").trim();
      if (!rating || !message){ setVMsg("Please add a rating and message.", "text-danger"); return; }

      const { error } = await supabase.from("bulletins").insert({
        type: "review",
        message,
        rating,
        review_target_type: "store",
        review_target_id: store.id
      });
      if (error){ setVMsg(error.message || "Failed.", "text-danger"); return; }

      setVMsg("✅ Posted.", "text-success");
      setTimeout(() => modal.hide(), 300);
      await renderReviews(supabase, store.id);
    } catch(e){
      console.warn("post review failed", e);
      setVMsg("Failed to post.", "text-danger");
    }
  });
}
