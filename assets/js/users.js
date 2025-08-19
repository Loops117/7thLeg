// users.js — Community Members with analytics, badges, search/sort, and totals (stable wiring)
(function () {
  console.log("✅ users.js (profiles + analytics + badges + search/sort + totals)");

  async function waitForSupabase(timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (window.supabase && window.supabase.from && window.supabase.auth) return window.supabase;
      await new Promise(r => setTimeout(r, 60));
    }
    console.error("Supabase client not found (config.js must set window.supabase).");
    return null;
  }

  /* ----------------------------- utils ----------------------------- */
  function hEsc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(m){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m];
    });
  }
  function debounce(fn, ms){ var t; return function(){ clearTimeout(t); var a=arguments; t=setTimeout(function(){ fn.apply(null,a); }, ms); }; }
  function initialsFrom(name){
    var parts = String(name||"").trim().split(/\s+/).filter(Boolean);
    var init = parts.slice(0,2).map(function(w){ return w && w[0] ? w[0].toUpperCase() : ""; }).join("");
    return init || "?";
  }
  function avatarHtml(url, name, size){
    size = size || 40;
    if (url){
      var safe = hEsc(url);
      var alt = hEsc(name || "Profile");
      return '<img src="'+safe+'" alt="'+alt+'" class="rounded-circle border bg-light flex-shrink-0" style="width:'+size+'px;height:'+size+'px;object-fit:cover;">';
    }
    var init = hEsc(initialsFrom(name));
    return '<div class="rounded-circle border bg-light d-inline-flex align-items-center justify-content-center text-secondary-emphasis flex-shrink-0" style="width:'+size+'px;height:'+size+'px;"><span class="small fw-semibold">'+init+'</span></div>';
  }
  function profileHref(userId){
    return '/communityhub/hub.html?module=profile&id=' + encodeURIComponent(userId);
  }
  function countGallery(g){
    try{
      if (Array.isArray(g)) return g.filter(Boolean).length;
      if (!g) return 0;
      if (typeof g === "string"){
        var s = g.trim();
        if (!s) return 0;
        if ((s[0] === "[" && s[s.length-1] === "]") || (s[0] === "{" && s[s.length-1] === "}")){
          var parsed = JSON.parse(s);
          if (Array.isArray(parsed)) return parsed.filter(Boolean).length;
          if (parsed && Array.isArray(parsed.images)) return parsed.images.filter(Boolean).length;
        }
        return s.split(/[,;\n\r]+/).map(function(x){ return x.trim(); }).filter(Boolean).length;
      }
      return 0;
    }catch(e){ return 0; }
  }

  /* ----------------------------- fetch ----------------------------- */
  async function fetchProfiles(supabase){
    try {
      var res = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, created_at, about_me, location")
        .order("created_at", { ascending: false });
      if (res.error) throw res.error;
      return res.data || [];
    } catch (e) {
      console.error("Failed to fetch profiles", e);
      return [];
    }
  }

  async function fetchBulletinAgg(supabase, userIds){
    var out = {}; userIds.forEach(function(id){ out[id] = { bulletins:0, reviews:0, help:0 }; });
    try {
      var res = await supabase
        .from("bulletins")
        .select("id,user_id,type,help")
        .in("user_id", userIds)
        .limit(100000);
      if (res.error) throw res.error;
      (res.data||[]).forEach(function(b){
        var u = b.user_id; if (!out[u]) out[u] = { bulletins:0, reviews:0, help:0 };
        out[u].bulletins++;
        if (b.type === "review") out[u].reviews++;
        if (b.type === "help" || (b.type === "general" && b.help === true)) out[u].help++;
      });
    } catch(e){ console.warn("bulletins aggregate failed; leaving zeros", e); }
    return out;
  }

  async function fetchSpeciesAndImages(supabase, userIds){
    var out = {}; userIds.forEach(function(id){ out[id] = { species:0, images:0 }; });
    try {
      var res = await supabase
        .from("user_inventories")
        .select("id,user_id,cover_image,gallery_images")
        .in("user_id", userIds)
        .limit(100000);
      if (res.error) throw res.error;
      (res.data||[]).forEach(function(inv){
        var uid = inv.user_id;
        var cover = inv.cover_image ? 1 : 0;
        var gallery = countGallery(inv.gallery_images);
        if (!out[uid]) out[uid] = { species:0, images:0 };
        out[uid].species += 1;
        out[uid].images += (cover + gallery);
      });
    } catch(e){ console.warn("species/images fetch failed; leaving zeros", e); }
    return out;
  }

  async function fetchAuctionsTrades(supabase, userIds){
    var out = {}; userIds.forEach(function(id){ out[id] = { auctions:0, trades:0 }; });
    async function countBy(tbl, col){
      var map = {}; userIds.forEach(function(id){ map[id]=0; });
      var res = await supabase
        .from(tbl)
        .select("id,"+col)
        .in(col, userIds)
        .limit(100000);
      if (res.error) throw res.error;
      (res.data||[]).forEach(function(r){ var uid = r[col]; if (uid) map[uid] = (map[uid]||0)+1; });
      return map;
    }
    try {
      var a = await countBy("user_auctions","user_id");
      if (Object.values(a).every(function(v){ return v===0; })) a = await countBy("user_auctions","owner_id");
      userIds.forEach(function(uid){ out[uid].auctions = (a[uid]||0); });
    } catch(e){ console.warn("auctions count failed", e); }
    try {
      var t = await countBy("user_trades","user_id");
      if (Object.values(t).every(function(v){ return v===0; })) t = await countBy("user_trades","owner_id");
      userIds.forEach(function(uid){ out[uid].trades = (t[uid]||0); });
    } catch(e){ console.warn("trades count failed", e); }
    return out;
  }

  async function fetchBadges(supabase, userIds){
    var out = {}; userIds.forEach(function(id){ out[id] = []; });
    async function tryJoin(){ try{
      var res = await supabase.from("user_badges").select("user_id, badges(name, icon_url)").in("user_id", userIds).limit(100000);
      if (res.error) throw res.error;
      (res.data||[]).forEach(function(r){
        var uid=r.user_id, b=r.badges||{};
        if (b.name) (out[uid]=out[uid]||[]).push({name:b.name, icon_url:b.icon_url||null});
      });
      return true;
    }catch(e){ return false; } }
    async function tryFlat(){ try{
      var res = await supabase.from("badges").select("user_id, name, icon_url").in("user_id", userIds).limit(100000);
      if (res.error) throw res.error;
      (res.data||[]).forEach(function(r){
        if (r.user_id && r.name) (out[r.user_id]=out[r.user_id]||[]).push({name:r.name, icon_url:r.icon_url||null});
      });
      return true;
    }catch(e){ return false; } }
    if (!(await tryJoin())) { await tryFlat(); }
    return out;
  }

  /* ---------------------------- render ---------------------------- */
  function renderTable(box, rows, metrics, badges, state){
    var key = state.sortKey || "bulletins";
    var dir = state.sortDir === "asc" ? 1 : -1;
    var sortable = {"species":1,"images":1,"bulletins":1,"reviews":1,"help":1,"auctions":1,"trades":1,"joined":1};
    var data = rows.slice();
    data.sort(function(a,b){
      if (key === "name"){ return String(a.full_name||"").localeCompare(String(b.full_name||"")) * dir; }
      else if (key === "location"){ return String(a.location||"").localeCompare(String(b.location||"")) * dir; }
      else if (key === "joined"){ var av=a.created_at?new Date(a.created_at).getTime():0, bv=b.created_at?new Date(b.created_at).getTime():0; return (av-bv)*dir; }
      else if (sortable[key]){ var am=(metrics[a.id]&&metrics[a.id][key])||0, bm=(metrics[b.id]&&metrics[b.id][key])||0; return (am-bm)*dir; }
      return 0;
    });

    var T = { users: data.length, species:0, images:0, bulletins:0, reviews:0, help:0, auctions:0, trades:0 };
    data.forEach(function(p){
      var m=metrics[p.id]||{};
      T.species+=m.species||0; T.images+=m.images||0; T.bulletins+=m.bulletins||0; T.reviews+=m.reviews||0;
      T.help+=m.help||0; T.auctions+=m.auctions||0; T.trades+=m.trades||0;
    });

    box.innerHTML = ''
      + '<div class="d-flex flex-wrap gap-2 mb-2">'
      +   '<span class="badge text-bg-dark">Users: <strong>'+T.users+'</strong></span>'
      +   '<span class="badge text-bg-secondary">Species: <strong>'+T.species+'</strong></span>'
      +   '<span class="badge text-bg-secondary">Images: <strong>'+T.images+'</strong></span>'
      +   '<span class="badge text-bg-secondary">Bulletins: <strong>'+T.bulletins+'</strong></span>'
      +   '<span class="badge text-bg-secondary">Reviews: <strong>'+T.reviews+'</strong></span>'
      +   '<span class="badge text-bg-secondary">Help: <strong>'+T.help+'</strong></span>'
      +   '<span class="badge text-bg-secondary">Auctions: <strong>'+T.auctions+'</strong></span>'
      +   '<span class="badge text-bg-secondary">Trades: <strong>'+T.trades+'</strong></span>'
      + '</div>'
      + '<div class="d-flex flex-wrap justify-content-between align-items-center mb-2 gap-2">'
      +   '<div class="input-group" style="max-width: 360px;">'
      +     '<span class="input-group-text">Search</span>'
      +     '<input id="user-search" type="search" class="form-control" placeholder="name, location, badges, id" value="'+hEsc(state.q||"")+'">'
      +   '</div>'
      +   '<div class="d-flex align-items-center gap-2">'
      +     '<label class="small text-muted mb-0">Sort by:</label>'
      +     '<select id="user-sort-key" class="form-select form-select-sm" style="min-width:160px;">'
      +       '<option value="bulletins">Bulletins</option>'
      +       '<option value="reviews">Reviews</option>'
      +       '<option value="help">Help</option>'
      +       '<option value="auctions">Auctions</option>'
      +       '<option value="trades">Trades</option>'
      +       '<option value="images">Images</option>'
      +       '<option value="species">Species</option>'
      +       '<option value="name">Name</option>'
      +       '<option value="location">Location</option>'
      +       '<option value="joined">Joined</option>'
      +     '</select>'
      +     '<select id="user-sort-dir" class="form-select form-select-sm" style="min-width:120px;">'
      +       '<option value="desc">Desc</option>'
      +       '<option value="asc">Asc</option>'
      +     '</select>'
      +   '</div>'
      + '</div>'
      + '<div class="table-responsive">'
      +   '<table class="table align-middle">'
      +     '<thead class="table-light">'
      +       '<tr>'
      +         '<th>User</th>'
      +         '<th>Location</th>'
      +         '<th>Joined</th>'
      +         '<th>About?</th>'
      +         '<th>Species</th>'
      +         '<th>Images</th>'
      +         '<th>Bulletins</th>'
      +         '<th>Reviews</th>'
      +         '<th>Help</th>'
      +         '<th>Auctions</th>'
      +         '<th>Trades</th>'
      +         '<th>Badges</th>'
      +       '</tr>'
      +     '</thead>'
      +     '<tbody></tbody>'
      +   '</table>'
      + '</div>';

    var tbody = box.querySelector("tbody");
    tbody.innerHTML = data.map(function(p){
      var m = metrics[p.id] || {};
      var b = badges[p.id] || [];
      var aboutFilled = (p.about_me && String(p.about_me).trim().length) ? "Yes" : "—";
      var joined = p.created_at ? new Date(p.created_at).toLocaleDateString() : "—";
      var link = profileHref(p.id);
      var badgesHtml = b.length ? b.map(function(bb){
        var icon = bb.icon_url ? '<img src="'+hEsc(bb.icon_url)+'" alt="'+hEsc(bb.name)+'" class="me-1" style="width:16px;height:16px;object-fit:cover;">' : "";
        return '<span class="badge bg-secondary-subtle text-dark me-1 mb-1">'+icon+hEsc(bb.name)+'</span>';
      }).join("") : '<span class="text-muted small">—</span>';
      return ''
        + '<tr>'
        +   '<td class="align-middle">'
        +     '<div class="d-flex align-items-center gap-2">'
        +       avatarHtml(p.avatar_url, p.full_name, 40)
        +       '<div class="d-flex flex-column">'
        +         '<a class="fw-semibold text-decoration-none" href="'+link+'">'+hEsc(p.full_name || "Unnamed")+'</a>'
        +         '<span class="text-muted small">'+hEsc(p.id)+'</span>'
        +       '</div>'
        +     '</div>'
        +   '</td>'
        +   '<td class="align-middle">'+hEsc(p.location || "—")+'</td>'
        +   '<td class="align-middle">'+hEsc(joined)+'</td>'
        +   '<td class="align-middle">'+aboutFilled+'</td>'
        +   '<td class="align-middle">'+(m.species||0)+'</td>'
        +   '<td class="align-middle">'+(m.images||0)+'</td>'
        +   '<td class="align-middle">'+(m.bulletins||0)+'</td>'
        +   '<td class="align-middle">'+(m.reviews||0)+'</td>'
        +   '<td class="align-middle">'+(m.help||0)+'</td>'
        +   '<td class="align-middle">'+(m.auctions||0)+'</td>'
        +   '<td class="align-middle">'+(m.trades||0)+'</td>'
        +   '<td class="align-middle" style="min-width:180px;"><div class="d-flex flex-wrap">'+badgesHtml+'</div></td>'
        + '</tr>';
    }).join("");

    var input = box.querySelector("#user-search");
    var keySel = box.querySelector("#user-sort-key");
    var dirSel = box.querySelector("#user-sort-dir");
    if (keySel) keySel.value = state.sortKey || "bulletins";
    if (dirSel) dirSel.value = state.sortDir || "desc";

    if (input && !input.dataset.wired){
      input.dataset.wired = "1";
      input.addEventListener("input", debounce(function(ev){ state.q = ev.target.value || ""; state.draw(); }, 250));
    }
    if (keySel && !keySel.dataset.wired){
      keySel.dataset.wired = "1";
      keySel.addEventListener("change", function(ev){ state.sortKey = ev.target.value || "bulletins"; state.draw(); });
    }
    if (dirSel && !dirSel.dataset.wired){
      dirSel.dataset.wired = "1";
      dirSel.addEventListener("change", function(ev){ state.sortDir = ev.target.value || "desc"; state.draw(); });
    }
  }

  /* ------------------------------ boot ------------------------------ */
  document.addEventListener("DOMContentLoaded", async function(){
    var supabase = await waitForSupabase();
    var box = document.getElementById("user-table-container");
    if (!supabase){ if (box) box.innerHTML = '<div class="alert alert-danger">Supabase not initialized.</div>'; return; }
    if (box) box.innerHTML = '<p class="text-muted">Loading users…</p>';

    var profiles = await fetchProfiles(supabase);
    var ids = profiles.map(function(p){ return p.id; }).filter(Boolean);

    var results = await Promise.all([
      fetchBulletinAgg(supabase, ids),
      fetchSpeciesAndImages(supabase, ids),
      fetchAuctionsTrades(supabase, ids),
      fetchBadges(supabase, ids)
    ]);
    var bulletins = results[0], speciesImgs = results[1], auctTrade = results[2], badges = results[3];

    var metrics = {};
    ids.forEach(function(id){
      metrics[id] = {
        species: (speciesImgs[id] && speciesImgs[id].species) || 0,
        images: (speciesImgs[id] && speciesImgs[id].images) || 0,
        bulletins: (bulletins[id] && bulletins[id].bulletins) || 0,
        reviews: (bulletins[id] && bulletins[id].reviews) || 0,
        help: (bulletins[id] && bulletins[id].help) || 0,
        auctions: (auctTrade[id] && auctTrade[id].auctions) || 0,
        trades: (auctTrade[id] && auctTrade[id].trades) || 0
      };
    });

    var STATE = { q: "", sortKey: "bulletins", sortDir: "desc", draw: null };

    function applyFilter(rows){
      var q = (STATE.q || "").toLowerCase();
      if (!q) return rows;
      return rows.filter(function(p){
        var name = String(p.full_name||"").toLowerCase();
        var loc = String(p.location||"").toLowerCase();
        var about = String(p.about_me||"").toLowerCase();
        var tags = (badges[p.id] || []).map(function(b){ return (b.name||"").toLowerCase(); }).join(" ");
        return name.indexOf(q) >= 0 || loc.indexOf(q) >= 0 || about.indexOf(q) >= 0 || tags.indexOf(q) >= 0 || String(p.id).toLowerCase().indexOf(q) >= 0;
      });
    }

    STATE.draw = function(){
      var filtered = applyFilter(profiles);
      renderTable(box, filtered, metrics, badges, STATE);
    };

    STATE.draw(); // initial render
  });
})();