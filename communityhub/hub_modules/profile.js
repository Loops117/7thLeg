const supabase = window.supabase;

// ---- helpers ----
function initialsFrom(name){
  const parts = String(name||"").trim().split(/\s+/).filter(Boolean);
  const init = parts.slice(0,2).map(w => (w && w[0] ? w[0].toUpperCase() : "")).join("");
  return init || "?";
}
function avatarHtml(url, name, size=48){
  if (url){
    return `<img src="${String(url).replace(/"/g,'&quot;')}" alt="${(name||'').replace(/["&<>]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]))}" class="rounded-circle border" style="width:${size}px;height:${size}px;object-fit:cover;">`;
  }
  const initials = initialsFrom(name);
  return `<div class="rounded-circle border bg-light-subtle d-inline-flex align-items-center justify-content-center" style="width:${size}px;height:${size}px;"><span class="fw-semibold text-muted">${initials}</span></div>`;
}
function profileLink(userId, text){
  const href = `/communityhub/hub.html?module=profile&id=${encodeURIComponent(userId||'')}`;
  return `<a class="text-decoration-none" href="${href}">${(text||'Profile').replace(/["&<>]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]))}</a>`;
}
function stars(n){
  n = Math.max(1, Math.min(5, parseInt(n||0,10)||0));
  return `<span class="text-warning" aria-label="${n} star rating">${"★".repeat(n)}${"☆".repeat(5-n)}</span>`;
}
function sanitizeHtml(html){
  // allow only a small set of tags: b,strong,i,em,u,br,p,ul,ol,li,a
  const allowed = { B:1, STRONG:1, I:1, EM:1, U:1, BR:1, P:1, UL:1, OL:1, LI:1, A:1 };
  const container = document.createElement('div');
  container.innerHTML = String(html||"");
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, null);
  const toRemove = [];
  while (walker.nextNode()){
    const el = walker.currentNode;
    if (!allowed[el.tagName]){
      toRemove.push(el);
    } else if (el.tagName === 'A'){
      // keep only safe hrefs
      const href = el.getAttribute('href') || '';
      if (!/^(https?:|mailto:)/i.test(href)) {
        el.removeAttribute('href');
      } else {
        el.setAttribute('target','_blank');
        el.setAttribute('rel','noopener noreferrer');
      }
      // strip other attributes
      [...el.attributes].forEach(a => { if (a.name.toLowerCase() !== 'href' && a.name.toLowerCase() !== 'target' && a.name.toLowerCase() !== 'rel') el.removeAttribute(a.name); });
    } else {
      // strip all attributes from non-A tags
      [...el.attributes].forEach(a => el.removeAttribute(a.name));
    }
  }
  toRemove.forEach(n => n.replaceWith(document.createTextNode(n.textContent)));
  return container.innerHTML;
}


(async () => {
  console.log("✅ hub profile.js running with window.supabase");

  const params = new URLSearchParams(window.location.search);
  let userId = params.get("id");

  const profileNameEl = document.getElementById("profile-name");
  const profileRoleEl = document.getElementById("profile-role");
  const profileAboutEl = document.getElementById("profile-about");
  const profileBadgesEl = document.getElementById("profile-badges");
  const profileRatingEl = document.getElementById("profile-rating");
  const profileReviewsEl = document.getElementById("profile-reviews");
  const profileBulletinsEl = document.getElementById("profile-bulletins");
  const profileInventoryEl = document.getElementById("profile-inventory");
  const profileWishlistEl = document.getElementById("profile-wishlist");
  const searchInput = document.getElementById("profile-search");

  async function fetchAndRenderProfile(uid) {
    if (!uid) {
      document.getElementById("hub-content").innerHTML = "<p class='text-danger'>You must be logged in to view your profile.</p>";
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role, about_me, avatar_url")
      .eq("id", uid)
      .single();

    if (!profile) {
      profileNameEl.textContent = "User not found";
      profileRoleEl.textContent = "";
      profileAboutEl.textContent = "";
      profileBadgesEl.innerHTML = "";
      profileRatingEl.textContent = "";
      profileReviewsEl.innerHTML = "";
      profileBulletinsEl.innerHTML = "";
      profileInventoryEl.innerHTML = "";
      profileWishlistEl.innerHTML = "";
      return;
    }

    profileNameEl.textContent = profile?.full_name || "Unnamed User";
    profileRoleEl.textContent = profile?.role || "Member";
    // About Me: render limited HTML
    profileAboutEl.innerHTML = profile?.about_me ? sanitizeHtml(profile.about_me) : "No about me yet.";
    // Avatar: show image if available, otherwise hide container
    (function(){
      const mount = document.getElementById("profile-avatar");
      if (!mount) return;
      if (profile?.avatar_url){
        mount.innerHTML = avatarHtml(profile.avatar_url, profile.full_name, 48);
        mount.classList.remove("d-none");
      } else {
        mount.classList.add("d-none");
        mount.innerHTML = "";
      }
    })();

    // Badges
    const { data: badges } = await supabase
      .from("user_badges")
      .select("badges(name, description, icon_url)")
      .eq("user_id", uid);

    profileBadgesEl.innerHTML = badges?.length
      ? badges.map(b => `
        <span class="badge bg-success d-flex align-items-center p-2 shadow-sm"
          title="${b.badges.description || ''}">
          ${b.badges.icon_url ? `<img src="${b.badges.icon_url}" alt="${b.badges.name}" style="height:20px; margin-right:6px;">` : ""}
          ${b.badges.name}
        </span>`).join("")
      : "<p>No badges</p>";

    // Reviews (from bulletins: reviews about this user + written by this user)
    const { data: aboutMe } = await supabase
      .from("bulletins")
      .select("id,user_id,message,rating,created_at,profiles:profiles!bulletins_user_id_fkey(id,full_name,avatar_url)")
      .eq("type","review")
      .eq("review_target_type","user")
      .eq("review_target_id", uid)
      .order("created_at",{ ascending:false });

    const { data: myWritten } = await supabase
      .from("bulletins")
      .select("id,review_target_type,review_target_id,message,rating,created_at")
      .eq("type","review")
      .eq("user_id", uid)
      .order("created_at",{ ascending:false });

    const recvd = Array.isArray(aboutMe) ? aboutMe : [];
    if (!recvd.length) {
      profileRatingEl.textContent = "⭐ No reviews yet";
    } else {
      const avg = recvd.reduce((a, r) => a + (r.rating||0), 0) / recvd.length;
      const rounded = Math.max(1, Math.min(5, Math.round(avg)));
      profileRatingEl.innerHTML = stars(rounded) + ` <span class="small text-muted">(${recvd.length})</span>`;
    }

    function rowFromAbout(r){
      const u = r.profiles || {};
      return `<div class="mb-2 d-flex align-items-start gap-2">
        <div>${avatarHtml(u.avatar_url, u.full_name, 28)}</div>
        <div>
          <div class="d-flex align-items-center gap-2">
            <strong>${profileLink(u.id, u.full_name || "User")}</strong>
            <span class="small text-muted">${new Date(r.created_at).toLocaleDateString()}</span>
          </div>
          <div>${stars(r.rating || 5)}</div>
          <div class="small text-muted">${(r.message||"").replace(/[&<>]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))}</div>
        </div>
      </div>`;
    }

    async function rowFromMine(r){
      // Resolve target name
      let label = "User";
      try{
        if (r.review_target_type === "user"){
          const { data } = await supabase.from("profiles").select("full_name").eq("id", r.review_target_id).maybeSingle();
          label = (data && data.full_name) || "User";
        } else if (r.review_target_type === "store"){
          const { data } = await supabase.from("store_profiles").select("name").eq("id", r.review_target_id).maybeSingle();
          label = (data && data.name) || "Store";
        }
      }catch(e){}
      return `<div class="mb-2">
        <div class="d-flex align-items-center justify-content-between">
          <strong>About ${ (r.review_target_type === "store" ? "Store" : "User") }: ${(label||"").replace(/[&<>]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))}</strong>
          <span class="small text-muted">${new Date(r.created_at).toLocaleDateString()}</span>
        </div>
        <div>${stars(r.rating || 5)}</div>
        <div class="small text-muted">${(r.message||"").replace(/[&<>]/g,s=>({'&':'&amp;','<':'&gt;'}[s]))}</div>
      </div>`;
    }

    // Build the Reviews panel content: received first, then written
    const parts = [];
    parts.push(`<div class="fw-semibold mb-1">Reviews about this user</div>`);
    if (recvd.length){
      parts.push(recvd.map(rowFromAbout).join(""));
    } else {
      parts.push(`<div class="small text-muted mb-2">No reviews yet.</div>`);
    }

    parts.push(`<hr class="my-2">`);
    parts.push(`<div class="fw-semibold mb-1">Reviews written by this user</div>`);
    if (Array.isArray(myWritten) && myWritten.length){
      const built = [];
      for (const r of myWritten){ built.push(await rowFromMine(r)); }
      parts.push(built.join(""));
    } else {
      parts.push(`<div class="small text-muted">No reviews written yet.</div>`);
    }

    profileReviewsEl.innerHTML = parts.join("");

    // Bulletins
    const { data: bulletins } = await supabase
      .from("bulletins")
      .select("message, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(5);

    profileBulletinsEl.innerHTML = bulletins?.length
      ? bulletins.map(b =>
        `<div class="mb-2">
          ${sanitizeHtml(b.message || '')}
          <small class="text-muted d-block">${new Date(b.created_at).toLocaleDateString()}</small>
        </div>`
      ).join("")
      : "<p>No recent bulletins.</p>";

    // Inventory
    const { data: inventory } = await supabase
      .from("user_inventories")
      .select("id, species, common_name, morph_name, cover_image, insect_type")
      .eq("user_id", uid);
// analytics hook
try{ window._lastProfileInventory = inventory || []; renderProfileAnalytics(window._lastProfileInventory); }catch(e){ console.warn(e); }


    if (inventory?.length) {
      inventory.sort((a, b) => a.species.localeCompare(b.species));
      profileInventoryEl.innerHTML = inventory.map(i => `
        <div class="d-flex align-items-center mb-2">
          <img src="${i.cover_image || '/assets/images/default-species.jpg'}"
              alt="${i.species}" class="me-2 rounded" style="width:50px;height:50px;object-fit:cover;">
          <div>
            <a href="#" onclick="loadModule('species_modules/view.hubspecies', null, { id: '${i.id}' })">
              <i>${i.species}</i>
            ${i.common_name ? ` – ${i.common_name}` : ""}
            </a>${i.morph_name ? ` – ${i.morph_name}` : ""}
            <div class="text-muted small">${i.insect_type || ""}</div>
          </div>
        </div>`).join("");
    } else {
      profileInventoryEl.innerHTML = "<p>No inventory yet.</p>";
    }

    // Wishlist
    const { data: wishlist } = await supabase
      .from("user_wishlist")
      .select("species, common_name, insect_type, date_added")
      .eq("user_id", uid);

    if (wishlist?.length) {
      wishlist.sort((a, b) => a.species.localeCompare(b.species));
      profileWishlistEl.innerHTML = wishlist.map(w => `
        <div class="mb-2">
          <i>${w.species}</i>${w.common_name ? ` – ${w.common_name}` : ""}
          <div class="text-muted small">${w.insect_type || ""} – Added ${new Date(w.date_added).toLocaleDateString()}</div>
        </div>`).join("");
    } else {
      profileWishlistEl.innerHTML = "<p>No wishlist yet.</p>";
    }
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!userId && user?.id) {
    userId = user.id;
  }

  await fetchAndRenderProfile(userId);

  // Add My Profile button
  const form = document.getElementById("profile-search-form");
  const myBtn = document.createElement("button");
  myBtn.className = "btn btn-outline-secondary btn-sm ms-2";
  myBtn.textContent = "My Profile";
  myBtn.onclick = async (e) => {
    e.preventDefault();
    if (user?.id) {
      await fetchAndRenderProfile(user.id);
    }
  };
  form.appendChild(myBtn);

  // Search
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (!query) return;

    const { data: matches } = await supabase
      .from("profiles")
      .select("id, full_name")
      .ilike("full_name", `%${query}%`)
      .limit(10);

    if (!matches?.length) {
      const box = document.createElement("div");
      box.className = "dropdown-menu show";
      box.style.position = "absolute";
      box.style.top = `${form.offsetTop + form.offsetHeight}px`;
      box.style.left = `${form.offsetLeft}px`;
      box.style.zIndex = 9999;
      box.innerHTML = `<span class="dropdown-item text-muted">User not found</span>`;
      document.body.appendChild(box);
      setTimeout(() => box.remove(), 3000);
      return;
    }

    // Autoselect first match for now
    await fetchAndRenderProfile(matches[0].id);
  });

})();

// ===== Profile Analytics (compact stats + pie) =====
function renderProfileAnalytics(inventory){
  try{
    const totalsEl = document.getElementById("profile-stats-total");
    const uniqueEl = document.getElementById("profile-stats-unique");
    const typesWrap = document.getElementById("profile-stats-types");
    const legendEl = document.getElementById("profile-stats-legend");
    const pieCanvas = document.getElementById("profile-type-pie");
    if (!totalsEl && !pieCanvas) return;

    const items = Array.isArray(inventory) ? inventory : [];
    const total = items.length;
    const speciesSet = new Set(items.map(i => (i.species || "").trim()).filter(Boolean));
    const byType = {};
    for (const row of items) {
      const key = (row.insect_type || "Unspecified").trim() || "Unspecified";
      byType[key] = (byType[key] || 0) + 1;
    }

    if (totalsEl) totalsEl.textContent = String(total);
    if (uniqueEl) uniqueEl.textContent = String(speciesSet.size);

    if (typesWrap) {
      typesWrap.innerHTML = Object.keys(byType).length
        ? Object.entries(byType).sort((a,b)=> b[1]-a[1]).map(([k,v]) =>
            `<span class="badge rounded-pill border bg-light text-dark">${k}: ${v}</span>`
          ).join(" ")
        : '<span class="text-muted small">No inventory yet.</span>';
    }

    // Wait for Chart.js if needed
    if (!window.Chart) { setTimeout(() => renderProfileAnalytics(inventory), 200); return; }

    if (pieCanvas && total > 0 && Object.keys(byType).length > 0) {
      const labels = Object.keys(byType);
      const values = labels.map(k => byType[k]);
      const data = { labels, datasets: [{ data: values }] };
      new Chart(pieCanvas.getContext('2d'), { type: 'pie', data, options: { plugins:{ legend:{ display:false } } } });
      if (legendEl) legendEl.innerHTML = labels.map((k, i) => `<span class="badge rounded-pill border bg-light text-dark me-1">${k}: ${values[i]}</span>`).join("");
    } else if (pieCanvas && total === 0) {
      const ctx = pieCanvas.getContext('2d');
      ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto';
      ctx.fillStyle = '#6c757d';
      ctx.fillText('No inventory yet.', 10, 20);
    }
  }catch(e){ console.warn('Stats render error:', e); }
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const t = document.getElementById('profile-stats-total');
    if (t && t.textContent === '—' && Array.isArray(window._lastProfileInventory)) {
      try{ renderProfileAnalytics(window._lastProfileInventory); }catch(e){}
    }
  }, 400);
});
