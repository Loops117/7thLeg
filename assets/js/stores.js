// stores.js — Stores tab: presence fields, counts, status, search/sort, totals
(function () {
  console.log("✅ stores.js (stores table + metrics + search/sort + totals)");

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
  function logoHtml(url, name, size){
    size = size || 40;
    if (url){
      var safe = hEsc(url);
      return '<img src="'+safe+'" alt="'+hEsc(name||"")+'" class="border bg-light flex-shrink-0 rounded" style="width:'+size+'px;height:'+size+'px;object-fit:cover;">';
    }
    var init = initialsFrom(name);
    return '<div class="border bg-light d-inline-flex align-items-center justify-content-center text-secondary-emphasis flex-shrink-0 rounded" style="width:'+size+'px;height:'+size+'px;"><span class="small fw-semibold">'+hEsc(init)+'</span></div>';
  }
  function storeHref(store){
    if (store.slug) return '/communityhub/hub.html?module=store/view_store&slug='+encodeURIComponent(store.slug);
    return '/communityhub/hub.html?module=store/view_store&id='+encodeURIComponent(store.id);
  }
  function yesNo(v){
    return v ? "Yes" : "—";
  }
  function isNonEmpty(v){
    if (v == null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  }

  /* ----------------------------- fetch ----------------------------- */
  async function fetchStores(supabase){
    try{
      var res = await supabase
        .from("store_profiles")
        .select("id, owner_id, name, slug, logo_url, banner_url, website_url, bio, location, policies, status, created_at")
        .order("created_at", { ascending: false });
      if (res.error) throw res.error;
      return res.data || [];
    }catch(e){
      console.error("Failed to fetch store profiles", e);
      return [];
    }
  }

  async function fetchListingCounts(supabase, storeIds){
    // Count active listings by product_type
    var out = {}; storeIds.forEach(function(id){ out[id] = { live:0, dry:0 }; });
    try{
      var res = await supabase
        .from("store_listings")
        .select("id, store_id, product_type, active")
        .in("store_id", storeIds)
        .eq("active", true)
        .limit(100000);
      if (res.error) throw res.error;
      (res.data||[]).forEach(function(r){
        var sid = r.store_id;
        var t = String(r.product_type||"").toLowerCase();
        if (t === "drygood") out[sid].dry += 1;
        else if (t === "live" || t === "inventory") out[sid].live += 1;
      });
    }catch(e){
      console.warn("listing counts failed; leaving zeros", e);
    }
    return out;
  }

  async function fetchEmployeeCounts(supabase, storeIds){
    var out = {}; storeIds.forEach(function(id){ out[id] = 0; });
    try{
      var res = await supabase
        .from("store_employees")
        .select("store_id")
        .in("store_id", storeIds)
        .limit(100000);
      if (res.error) throw res.error;
      (res.data||[]).forEach(function(r){
        out[r.store_id] = (out[r.store_id]||0) + 1;
      });
    }catch(e){
      console.warn("employee counts failed; leaving zeros", e);
    }
    return out;
  }

  /* ---------------------------- render ---------------------------- */
  function renderTable(box, rows, metrics, state){
    // sort
    var key = state.sortKey || "live";
    var dir = state.sortDir === "asc" ? 1 : -1;
    var sortable = {"live":1,"dry":1,"employees":1,"name":1,"location":1,"joined":1};
    var data = rows.slice();
    data.sort(function(a,b){
      if (key === "name"){ return String(a.name||"").localeCompare(String(b.name||"")) * dir; }
      else if (key === "location"){ return String(a.location||"").localeCompare(String(b.location||"")) * dir; }
      else if (key === "joined"){ var av=a.created_at?new Date(a.created_at).getTime():0, bv=b.created_at?new Date(b.created_at).getTime():0; return (av-bv)*dir; }
      else if (sortable[key]){ var am=(metrics[a.id]&&metrics[a.id][key])||0, bm=(metrics[b.id]&&metrics[b.id][key])||0; return (am-bm)*dir; }
      return 0;
    });

    // totals for displayed set
    var T = { stores: data.length, live:0, dry:0, employees:0 };
    data.forEach(function(s){
      var m = metrics[s.id] || {};
      T.live += m.live||0;
      T.dry += m.dry||0;
      T.employees += m.employees||0;
    });

    box.innerHTML = ''
      + '<div class="d-flex flex-wrap gap-2 mb-2">'
      +   '<span class="badge text-bg-dark">Stores: <strong>'+T.stores+'</strong></span>'
      +   '<span class="badge text-bg-secondary">Live: <strong>'+T.live+'</strong></span>'
      +   '<span class="badge text-bg-secondary">Dry goods: <strong>'+T.dry+'</strong></span>'
      +   '<span class="badge text-bg-secondary">Employees: <strong>'+T.employees+'</strong></span>'
      + '</div>'
      + '<div class="d-flex flex-wrap justify-content-between align-items-center mb-2 gap-2">'
      +   '<div class="input-group" style="max-width: 360px;">'
      +     '<span class="input-group-text">Search</span>'
      +     '<input id="store-search" type="search" class="form-control" placeholder="name, slug, location, id" value="'+hEsc(state.q||"")+'">'
      +   '</div>'
      +   '<div class="d-flex align-items-center gap-2">'
      +     '<label class="small text-muted mb-0">Sort by:</label>'
      +     '<select id="store-sort-key" class="form-select form-select-sm" style="min-width:160px;">'
      +       '<option value="live">Live</option>'
      +       '<option value="dry">Dry goods</option>'
      +       '<option value="employees">Employees</option>'
      +       '<option value="name">Name</option>'
      +       '<option value="location">Location</option>'
      +       '<option value="joined">Joined</option>'
      +     '</select>'
      +     '<select id="store-sort-dir" class="form-select form-select-sm" style="min-width:120px;">'
      +       '<option value="desc">Desc</option>'
      +       '<option value="asc">Asc</option>'
      +     '</select>'
      +   '</div>'
      + '</div>'
      + '<div class="table-responsive">'
      +   '<table class="table align-middle">'
      +     '<thead class="table-light">'
      +       '<tr>'
      +         '<th>Store</th>'
      +         '<th>Status</th>'
      +         '<th>Slug</th>'
      +         '<th>Logo</th>'
      +         '<th>Banner</th>'
      +         '<th>Website</th>'
      +         '<th>Bio</th>'
      +         '<th>Location</th>'
      +         '<th>Policies</th>'
      +         '<th>Live</th>'
      +         '<th>Dry</th>'
      +         '<th>Employees</th>'
      +       '</tr>'
      +     '</thead>'
      +     '<tbody></tbody>'
      +   '</table>'
      + '</div>';

    var tbody = box.querySelector("tbody");
    tbody.innerHTML = data.map(function(s){
      var m = metrics[s.id] || {};
      var link = storeHref(s);
      var statusBadge = (String(s.status||"").toLowerCase()==="active")
        ? '<span class="badge text-bg-success">active</span>'
        : '<span class="badge text-bg-secondary">'+hEsc(s.status||"")+'</span>';
      var has = {
        slug: isNonEmpty(s.slug),
        logo: isNonEmpty(s.logo_url),
        banner: isNonEmpty(s.banner_url),
        site: isNonEmpty(s.website_url),
        bio: isNonEmpty(s.bio),
        loc: isNonEmpty(s.location),
        pol: isNonEmpty(s.policies || {}),
      };
      return ''
        + '<tr>'
        +   '<td class="align-middle">'
        +     '<div class="d-flex align-items-center gap-2">'
        +       logoHtml(s.logo_url, s.name, 40)
        +       '<div class="d-flex flex-column">'
        +         '<a class="fw-semibold text-decoration-none" href="'+link+'">'+hEsc(s.name || "Store")+'</a>'
        +         '<span class="text-muted small">'+hEsc(s.id)+'</span>'
        +       '</div>'
        +     '</div>'
        +   '</td>'
        +   '<td class="align-middle">'+statusBadge+'</td>'
        +   '<td class="align-middle">'+yesNo(has.slug)+'</td>'
        +   '<td class="align-middle">'+yesNo(has.logo)+'</td>'
        +   '<td class="align-middle">'+yesNo(has.banner)+'</td>'
        +   '<td class="align-middle">'+yesNo(has.site)+'</td>'
        +   '<td class="align-middle">'+yesNo(has.bio)+'</td>'
        +   '<td class="align-middle">'+yesNo(has.loc)+'</td>'
        +   '<td class="align-middle">'+yesNo(has.pol)+'</td>'
        +   '<td class="align-middle">'+(m.live||0)+'</td>'
        +   '<td class="align-middle">'+(m.dry||0)+'</td>'
        +   '<td class="align-middle">'+(m.employees||0)+'</td>'
        + '</tr>';
    }).join("");

    // Wire controls
    var input = box.querySelector("#store-search");
    var keySel = box.querySelector("#store-sort-key");
    var dirSel = box.querySelector("#store-sort-dir");
    if (keySel) keySel.value = key;
    if (dirSel) dirSel.value = state.sortDir || "desc";

    if (input && !input.dataset.wired){
      input.dataset.wired = "1";
      input.addEventListener("input", debounce(function(ev){
        state.q = ev.target.value || "";
        state.draw();
      }, 250));
    }
    if (keySel && !keySel.dataset.wired){
      keySel.dataset.wired = "1";
      keySel.addEventListener("change", function(ev){
        state.sortKey = ev.target.value || "live";
        state.draw();
      });
    }
    if (dirSel && !dirSel.dataset.wired){
      dirSel.dataset.wired = "1";
      dirSel.addEventListener("change", function(ev){
        state.sortDir = ev.target.value || "desc";
        state.draw();
      });
    }
  }

  /* ------------------------------ boot ------------------------------ */
  document.addEventListener("DOMContentLoaded", async function(){
    var box = document.getElementById("store-table-container");
    if (!box) return; // not on this page
    var supabase = await waitForSupabase();
    if (!supabase){
      box.innerHTML = '<div class="alert alert-danger">Supabase not initialized.</div>';
      return;
    }
    box.innerHTML = '<p class="text-muted">Loading stores…</p>';

    var stores = await fetchStores(supabase);
    var ids = stores.map(function(s){ return s.id; }).filter(Boolean);

    var listingCounts = await fetchListingCounts(supabase, ids);
    var employeeCounts = await fetchEmployeeCounts(supabase, ids);

    var metrics = {};
    ids.forEach(function(id){
      metrics[id] = {
        live: (listingCounts[id] && listingCounts[id].live) || 0,
        dry: (listingCounts[id] && listingCounts[id].dry) || 0,
        employees: employeeCounts[id] || 0
      };
    });

    var STATE = { q: "", sortKey: "live", sortDir: "desc", draw: null };

    function applyFilter(rows){
      var q = (STATE.q || "").toLowerCase();
      if (!q) return rows;
      return rows.filter(function(s){
        var name = String(s.name||"").toLowerCase();
        var slug = String(s.slug||"").toLowerCase();
        var loc = String(s.location||"").toLowerCase();
        return name.indexOf(q) >= 0 || slug.indexOf(q) >= 0 || loc.indexOf(q) >= 0 || String(s.id).toLowerCase().indexOf(q) >= 0;
      });
    }

    STATE.draw = function(){
      var filtered = applyFilter(stores);
      renderTable(box, filtered, metrics, STATE);
    };

    STATE.draw(); // initial
  });
})();