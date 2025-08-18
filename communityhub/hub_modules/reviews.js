
// reviews.js — Community Hub module (shows + manages user/store reviews)
export async function init() {
  console.log("✅ reviews.js init");
  const supabase = await waitForSupabase();
  if (!supabase) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const root = document.getElementById("reviews-root");
    if (root) root.innerHTML = "<div class='alert alert-danger'>Please sign in to view your reviews.</div>";
    return;
  }

  wireComposerUI(supabase, user);
  await refreshLists(supabase, user);
}
export default { init };

/* ------------- utils ------------- */
function $(sel){ return document.querySelector(sel); }
function hEsc(s){
  s = String(s ?? "");
  s = s.replace(/&/g, "&amp;");
  s = s.replace(/</g, "&lt;");
  s = s.replace(/>/g, "&gt;");
  s = s.replace(/"/g, "&quot;");
  s = s.replace(/'/g, "&#39;");
  return s;
}
function stars(n){
  n = Math.max(1, Math.min(5, parseInt(n||0,10)||0));
  return `<span class="text-warning" aria-label="${n} star rating">${"★".repeat(n)}${"☆".repeat(5-n)}</span>`;
}
function avatar(url, name, size=40){
  const safe = hEsc(url||"");
  const initials = (name||"").trim().split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase() || "?";
  if (safe){
    return `<img src="${safe}" alt="${hEsc(name||'')}" class="rounded-circle border" style="width:${size}px;height:${size}px;object-fit:cover;">`;
  }
  return `<div class="rounded-circle border bg-light d-flex align-items-center justify-content-center" style="width:${size}px;height:${size}px;"><span class="small text-muted">${hEsc(initials)}</span></div>`;
}
function logo(url, alt, size=40){
  const safe = hEsc(url||"");
  if (safe){
    return `<img src="${safe}" alt="${hEsc(alt||'')}" class="rounded border" style="width:${size}px;height:${size}px;object-fit:cover;background:#fff;">`;
  }
  return `<div class="rounded border bg-light" style="width:${size}px;height:${size}px;"></div>`;
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

/* ------------- data fetching ------------- */
async function getMyStores(supabase, userId){
  const ids = new Set();
  const meta = {}; // id -> {name, logo_url}
  try {
    const { data: owned } = await supabase.from("store_profiles").select("id,name,logo_url").eq("owner_id", userId);
    (owned||[]).forEach(s => { ids.add(s.id); meta[s.id] = { name: s.name, logo_url: s.logo_url }; });
  } catch {}
  try {
    const { data: emp } = await supabase.from("store_employees").select("store_id").eq("user_id", userId);
    const storeIds = (emp||[]).map(r => r.store_id);
    if (storeIds.length){
      const { data: stores } = await supabase.from("store_profiles").select("id,name,logo_url").in("id", storeIds);
      (stores||[]).forEach(s => { ids.add(s.id); meta[s.id] = { name: s.name, logo_url: s.logo_url }; });
    }
  } catch {}
  return { ids: Array.from(ids), meta };
}

async function fetchReviewsAboutMe(supabase, userId){
  const { data, error } = await supabase
    .from("bulletins")
    .select("id,user_id,message,rating,created_at,review_target_type,review_target_id,profiles:profiles!bulletins_user_id_fkey(id,full_name,avatar_url)")
    .eq("type","review")
    .eq("review_target_type","user")
    .eq("review_target_id", userId)
    .order("created_at",{ ascending:false });
  if (error) { console.warn("about me reviews error", error); return []; }
  return data||[];
}

async function fetchMyReviews(supabase, userId){
  const { data, error } = await supabase
    .from("bulletins")
    .select("id,user_id,message,rating,created_at,review_target_type,review_target_id")
    .eq("type","review").eq("user_id", userId)
    .order("created_at",{ ascending:false });
  if (error) { console.warn("my reviews error", error); return []; }
  return data||[];
}

async function fetchStoreReviews(supabase, storeIds){
  if (!storeIds?.length) return [];
  const { data, error } = await supabase
    .from("bulletins")
    .select("id,user_id,message,rating,created_at,review_target_type,review_target_id,profiles:profiles!bulletins_user_id_fkey(id,full_name,avatar_url)")
    .eq("type","review")
    .eq("review_target_type","store")
    .in("review_target_id", storeIds)
    .order("created_at",{ ascending:false });
  if (error) { console.warn("store reviews error", error); return []; }
  return data||[];
}

async function resolveTargetName(supabase, type, id){
  try {
    if (type === "user"){
      const { data } = await supabase.from("profiles").select("full_name").eq("id", id).maybeSingle();
      return data?.full_name || "User";
    } else if (type === "store"){
      const { data } = await supabase.from("store_profiles").select("name").eq("id", id).maybeSingle();
      return data?.name || "Store";
    }
  } catch {}
  return type === "user" ? "User" : "Store";
}

/* ------------- render ------------- */
async function refreshLists(supabase, user){
  const aboutWrap = $("#rv-list-about");
  const mineWrap  = $("#rv-list-mine");
  const storeWrap = $("#rv-list-store");
  if (!aboutWrap || !mineWrap || !storeWrap) return;

  aboutWrap.innerHTML = `<div class="text-muted small">Loading…</div>`;
  mineWrap.innerHTML  = `<div class="text-muted small">Loading…</div>`;
  storeWrap.innerHTML = `<div class="text-muted small">Loading…</div>`;

  const [about, mine, storeInfo] = await Promise.all([
    fetchReviewsAboutMe(supabase, user.id),
    fetchMyReviews(supabase, user.id),
    getMyStores(supabase, user.id)
  ]);
  const storeRevs = await fetchStoreReviews(supabase, storeInfo.ids);

  const aboutCount = document.getElementById("rv-count-about");
  const mineCount = document.getElementById("rv-count-mine");
  const storeCount = document.getElementById("rv-count-store");
  if (aboutCount) aboutCount.textContent = about.length ? String(about.length) : "";
  if (mineCount) mineCount.textContent = mine.length ? String(mine.length) : "";
  if (storeCount) storeCount.textContent = storeRevs.length ? String(storeRevs.length) : "";

  // About me
  aboutWrap.innerHTML = about.length ? "" : `<div class="text-muted small">No reviews yet.</div>`;
  for (const r of about){
    const author = r.profiles || {};
    const card = reviewRow({
      avatarHtml: avatar(author.avatar_url, author.full_name),
      nameHtml: profileLink(author.id, author.full_name || "User"),
      titleHtml: stars(r.rating),
      date: new Date(r.created_at).toLocaleDateString(),
      message: r.message
    }, [
      {label:"Dispute", cls:"btn-outline-danger", onClick: () => openDispute(r.id, "your profile")}
    ]);
    aboutWrap.appendChild(card);
  }

  // My written
  mineWrap.innerHTML = mine.length ? "" : `<div class="text-muted small">No reviews written yet.</div>`;
  for (const r of mine){
    const targetLabel = await resolveTargetName(supabase, r.review_target_type, r.review_target_id);
    const card = reviewRow({
      avatarHtml: avatar(null, targetLabel),
      nameHtml: hEsc(`${r.review_target_type === "store" ? "Store" : "User"}: ${targetLabel}`),
      titleHtml: stars(r.rating),
      date: new Date(r.created_at).toLocaleDateString(),
      message: r.message
    }, [
      {label:"Edit", cls:"btn-outline-primary", onClick: () => openEdit(r)}
    ]);
    mineWrap.appendChild(card);
  }

  // Store reviews
  storeWrap.innerHTML = storeRevs.length ? "" : `<div class="text-muted small">No reviews for your stores yet.</div>`;
  for (const r of storeRevs){
    const author = r.profiles || {};
    const storeMeta = storeInfo.meta[r.review_target_id] || {};
    const card = reviewRow({
      avatarHtml: logo(storeMeta.logo_url, storeMeta.name),
      nameHtml: hEsc(storeMeta.name || "Store"),
      titleHtml: stars(r.rating),
      date: new Date(r.created_at).toLocaleDateString(),
      message: r.message,
      rightMeta: `From ${hEsc(author.full_name || "User")}`
    }, [
      {label:"Dispute", cls:"btn-outline-danger", onClick: () => openDispute(r.id, storeMeta.name || "your store")}
    ]);
    storeWrap.appendChild(card);
  }
}

function reviewRow(meta, actions){
  const row = document.createElement("div");
  row.className = "p-2 border rounded-3";
  row.innerHTML = `
    <div class="d-flex align-items-start gap-2">
      <div>${meta.avatarHtml||""}</div>
      <div class="flex-grow-1">
        <div class="d-flex align-items-center justify-content-between">
          <div class="fw-semibold">${meta.nameHtml||""}</div>
          <div class="small text-muted">${hEsc(meta.date||"")}</div>
        </div>
        <div>${meta.titleHtml||""}</div>
        <div class="mt-1">${hEsc(meta.message||"")}</div>
        <div class="mt-2 d-flex gap-2">${(actions||[]).map(a=>`<button class="btn btn-sm ${a.cls||'btn-outline-secondary'}">${hEsc(a.label)}</button>`).join("")}</div>
      </div>
      <div class="small text-muted ms-2">${meta.rightMeta||""}</div>
    </div>`;
  const btns = row.querySelectorAll("button");
  (actions||[]).forEach((a,i) => btns[i]?.addEventListener("click", a.onClick));
  return row;
}

/* ------------- composer / actions ------------- */
function wireComposerUI(supabase, user){
  // New review launchers
  $("#btn-new-review-user")?.addEventListener("click", (e) => {
    e.preventDefault(); openComposer("user");
  });
  $("#btn-new-review-store")?.addEventListener("click", async (e) => {
    e.preventDefault(); openComposer("store");
    // If user has exactly one store, preselect it
    try {
      const { ids, meta } = await getMyStores(supabase, user.id);
      if (ids.length === 1){
        setComposerTarget("store", ids[0], meta[ids[0]]?.name || "Store");
      }
    } catch {}
  });

  // Search
  const search = $("#rv-target-search");
  const typeSel = $("#rv-target-type");
  let _searchTimer = null;
  function doSearchNow(){
    searchTargets(supabase, typeSel.value, search.value.trim());
  }
  search?.addEventListener("input", () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(doSearchNow, 250);
  });
  typeSel?.addEventListener("change", () => { $("#rv-target-results").innerHTML = ""; $("#rv-target-picked").textContent = ""; $("#rv-target-id").value=""; search.value=""; });

  $("#rv-target-clear")?.addEventListener("click", () => {
    $("#rv-target-results").innerHTML = ""; $("#rv-target-picked").textContent = ""; $("#rv-target-id").value=""; search.value="";
  });

  // Submit
  $("#rv-submit")?.addEventListener("click", async () => {
    const editId = $("#rv-edit-id").value || null;
    const targetType = $("#rv-target-type").value;
    const targetId = $("#rv-target-id").value;
    const rating = parseInt($("#rv-rating").value || "0", 10);
    const msg = ($("#rv-message").value || "").trim();
    if (!targetId || !rating || !msg) { setMsg("Please choose a target, rating, and write a message.", "text-danger"); return; }

    setMsg(editId ? "Saving…" : "Posting…");
    const payload = { type: "review", message: msg, rating, review_target_type: targetType, review_target_id: targetId };
    let error = null;
    if (editId){
      ({ error } = await supabase.from("bulletins").update(payload).eq("id", editId).eq("user_id", user.id));
    } else {
      ({ error } = await supabase.from("bulletins").insert(payload));
    }
    if (error){ setMsg(error.message || "Failed.", "text-danger"); return; }

    setMsg("✅ Done.", "text-success");
    setTimeout(() => bootstrap.Modal.getInstance(document.getElementById("reviewComposer"))?.hide(), 300);
    await refreshLists(supabase, user);
  });

  // Dispute submit
  $("#rv-dispute-submit")?.addEventListener("click", async () => {
    const id = $("#rv-dispute-id").value;
    const text = ($("#rv-dispute-text").value||"").trim();
    if (!id || !text) { setDisputeMsg("Please write a reason.", "text-danger"); return; }
    setDisputeMsg("Submitting…");
    const { error } = await supabase.from("bulletins").insert({
      type: "help",
      message: `[Dispute Review #${id}] ${text}`
    });
    if (error){ setDisputeMsg(error.message || "Failed.", "text-danger"); return; }
    setDisputeMsg("✅ Submitted.", "text-success");
    setTimeout(() => bootstrap.Modal.getInstance(document.getElementById("disputeModal"))?.hide(), 300);
  });
}

function openComposer(defaultType="user"){
  $("#rv-edit-id").value = "";
  $("#rv-message").value = "";
  $("#rv-target-type").value = defaultType;
  $("#rv-target-search").value = "";
  $("#rv-target-results").innerHTML = "";
  $("#rv-target-picked").textContent = "";
  $("#rv-target-id").value = "";
  $("#reviewComposerTitle").textContent = "Write a review";
  $("#rv-submit").textContent = "Post review";
  setMsg("");
  new bootstrap.Modal(document.getElementById("reviewComposer")).show();
}

function openEdit(r){
  $("#rv-edit-id").value = r.id;
  $("#rv-message").value = r.message || "";
  $("#rv-target-type").value = r.review_target_type;
  $("#rv-rating").value = String(r.rating || 5);
  $("#reviewComposerTitle").textContent = "Edit review";
  $("#rv-submit").textContent = "Save changes";
  $("#rv-target-picked").textContent = ""; // clear until we resolve
  $("#rv-target-id").value = r.review_target_id;
  $("#rv-target-search").value = "";
  $("#rv-target-results").innerHTML = "";
  setMsg("");
  new bootstrap.Modal(document.getElementById("reviewComposer")).show();
}

function openDispute(bulletinId, contextLabel){
  $("#rv-dispute-id").value = bulletinId;
  $("#rv-dispute-text").value = `I would like to dispute this review${contextLabel ? " about " + contextLabel : ""}.`;
  setDisputeMsg("");
  new bootstrap.Modal(document.getElementById("disputeModal")).show();
}

function setComposerTarget(type, id, label){
  $("#rv-target-type").value = type;
  $("#rv-target-id").value = id;
  $("#rv-target-picked").textContent = label || "";
}

async function searchTargets(supabase, type, q){
  const list = $("#rv-target-results");
  list.innerHTML = "";
  if (!q || q.length < 2) return;
  if (type === "user"){
    const { data, error } = await supabase.from("profiles").select("id,full_name,avatar_url").ilike("full_name", `%${q}%`).limit(10);
    if (error) return;
    for (const p of (data||[])){
      const item = document.createElement("button");
      item.type = "button";
      item.className = "list-group-item list-group-item-action d-flex align-items-center gap-2";
      item.innerHTML = `${avatar(p.avatar_url, p.full_name, 28)} <span>${hEsc(p.full_name || "User")}</span>`;
      item.addEventListener("click", () => { setComposerTarget("user", p.id, p.full_name || "User"); list.innerHTML=""; });
      list.appendChild(item);
    }
  } else {
    const { data, error } = await supabase.from("store_profiles").select("id,name,logo_url").ilike("name", `%${q}%`).limit(10);
    if (error) return;
    for (const s of (data||[])){
      const item = document.createElement("button");
      item.type = "button";
      item.className = "list-group-item list-group-item-action d-flex align-items-center gap-2";
      item.innerHTML = `${logo(s.logo_url, s.name, 28)} <span>${hEsc(s.name || "Store")}</span>`;
      item.addEventListener("click", () => { setComposerTarget("store", s.id, s.name || "Store"); list.innerHTML=""; });
      list.appendChild(item);
    }
  }
}

function setMsg(txt, cls){
  const el = $("#rv-msg"); if (!el) return;
  el.className = "me-auto small " + (cls || "text-muted");
  el.textContent = txt || "";
}
function setDisputeMsg(txt, cls){
  const el = $("#rv-dispute-msg"); if (!el) return;
  el.className = "me-auto small " + (cls || "text-muted");
  el.textContent = txt || "";
}
