// expos.js — Expos tab: list + approve + search/sort + totals
(function () {
  console.log("✅ expos.js (expos table + approve + search/sort + totals)");

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
  function fmtDate(d){
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString(); } catch(e){ return "—"; }
  }
  function expoLocation(e){
    var parts = [];
    if (e.venue_name) parts.push(e.venue_name);
    var cs = [e.city||"", e.state||""].filter(Boolean).join(", ");
    if (cs) parts.push(cs);
    return parts.join(" — ") || "—";
  }

  /* ----------------------------- fetch ----------------------------- */
  async function fetchExpos(supabase){
    try{
      var res = await supabase
        .from("expos")
        .select("id,name,city,state,venue_name,start_date,end_date,created_at,approved,active")
        .order("created_at", { ascending: false });
      if (res.error) throw res.error;
      return res.data || [];
    }catch(e){
      console.error("Failed to fetch expos", e);
      return [];
    }
  }

  async function approveExpo(supabase, id){
    try{
      var res = await supabase.from("expos").update({ approved: true }).eq("id", id);
      if (res.error) throw res.error;
      return true;
    }catch(e){
      console.warn("Approve failed", e);
      return false;
    }
  }

  /* ---------------------------- render ---------------------------- */
  function renderTable(box, rows, state, actions){
    // sort
    var key = state.sortKey || "created";
    var dir = state.sortDir === "asc" ? 1 : -1;
    var data = rows.slice();
    data.sort(function(a,b){
      function dnum(x){ return x ? new Date(x).getTime() : 0; }
      if (key === "name"){ return String(a.name||"").localeCompare(String(b.name||"")) * dir; }
      if (key === "location"){
        return String(expoLocation(a)).localeCompare(String(expoLocation(b))) * dir;
      }
      if (key === "start"){ return (dnum(a.start_date) - dnum(b.start_date)) * dir; }
      if (key === "end"){ return (dnum(a.end_date) - dnum(b.end_date)) * dir; }
      if (key === "created"){ return (dnum(a.created_at) - dnum(b.created_at)) * dir; }
      if (key === "approved"){ return ((a.approved?1:0) - (b.approved?1:0)) * dir; }
      return 0;
    });

    // totals
    var T = { expos: data.length, approved:0, pending:0, active:0 };
    data.forEach(function(e){
      if (e.approved) T.approved += 1; else T.pending += 1;
      if (e.active) T.active += 1;
    });

    box.innerHTML = ''
      + '<div class="d-flex flex-wrap gap-2 mb-2">'
      +   '<span class="badge text-bg-dark">Expos: <strong>'+T.expos+'</strong></span>'
      +   '<span class="badge text-bg-secondary">Approved: <strong>'+T.approved+'</strong></span>'
      +   '<span class="badge text-bg-secondary">Pending: <strong>'+T.pending+'</strong></span>'
      +   '<span class="badge text-bg-secondary">Active: <strong>'+T.active+'</strong></span>'
      + '</div>'
      + '<div class="d-flex flex-wrap justify-content-between align-items-center mb-2 gap-2">'
      +   '<div class="input-group" style="max-width: 360px;">'
      +     '<span class="input-group-text">Search</span>'
      +     '<input id="expo-search" type="search" class="form-control" placeholder="name, city, state" value="'+hEsc(state.q||"")+'">'
      +   '</div>'
      +   '<div class="d-flex align-items-center gap-2">'
      +     '<label class="small text-muted mb-0">Sort by:</label>'
      +     '<select id="expo-sort-key" class="form-select form-select-sm" style="min-width:160px;">'
      +       '<option value="created">Created</option>'
      +       '<option value="name">Name</option>'
      +       '<option value="location">Location</option>'
      +       '<option value="start">Start date</option>'
      +       '<option value="end">End date</option>'
      +       '<option value="approved">Approved</option>'
      +     '</select>'
      +     '<select id="expo-sort-dir" class="form-select form-select-sm" style="min-width:120px;">'
      +       '<option value="desc">Desc</option>'
      +       '<option value="asc">Asc</option>'
      +     '</select>'
      +   '</div>'
      + '</div>'
      + '<div class="table-responsive">'
      +   '<table class="table align-middle">'
      +     '<thead class="table-light">'
      +       '<tr>'
      +         '<th>Name</th>'
      +         '<th>Location</th>'
      +         '<th>Dates</th>'
      +         '<th>Created</th>'
      +         '<th>Approved</th>'
      +         '<th>Action</th>'
      +       '</tr>'
      +     '</thead>'
      +     '<tbody></tbody>'
      +   '</table>'
      + '</div>';

    var tbody = box.querySelector("tbody");
    tbody.innerHTML = data.map(function(e){
      var loc = expoLocation(e);
      var dates = (fmtDate(e.start_date) + (e.end_date ? ' - ' + fmtDate(e.end_date) : ''));
      var badge = e.approved ? '<span class="badge text-bg-success">Yes</span>' : '<span class="badge text-bg-warning text-dark">No</span>';
      var btn = e.approved
        ? '<button class="btn btn-sm btn-outline-secondary" disabled>Approved</button>'
        : '<button class="btn btn-sm btn-primary btn-approve-expo" data-id="'+hEsc(e.id)+'">Approve</button>';
      return ''
        + '<tr>'
        +   '<td class="align-middle">'+hEsc(e.name || "Expo")+'</td>'
        +   '<td class="align-middle">'+hEsc(loc)+'</td>'
        +   '<td class="align-middle">'+hEsc(dates || "—")+'</td>'
        +   '<td class="align-middle">'+hEsc(fmtDate(e.created_at))+'</td>'
        +   '<td class="align-middle">'+badge+'</td>'
        +   '<td class="align-middle">'+btn+'</td>'
        + '</tr>';
    }).join("");

    // Wire controls
    var input = box.querySelector("#expo-search");
    var keySel = box.querySelector("#expo-sort-key");
    var dirSel = box.querySelector("#expo-sort-dir");
    if (keySel) keySel.value = state.sortKey || "created";
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
        state.sortKey = ev.target.value || "created";
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

    // Approve button (event delegation)
    tbody.addEventListener("click", async function(ev){
      var btn = ev.target.closest(".btn-approve-expo");
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      if (!id) return;
      if (!confirm("Approve this expo?")) return;
      btn.disabled = true;
      btn.textContent = "Approving…";
      var ok = await actions.onApprove(id);
      if (ok){
        // reflect in current dataset
        var hit = rows.find(function(x){ return x.id === id; });
        if (hit){ hit.approved = true; }
        state.draw();
      } else {
        btn.disabled = false;
        btn.textContent = "Approve";
        alert("Failed to approve. Check console / RLS policy.");
      }
    });
  }

  /* ------------------------------ boot ------------------------------ */
  document.addEventListener("DOMContentLoaded", async function(){
    var box = document.getElementById("expo-table-container");
    if (!box) return;
    var supabase = await waitForSupabase();
    if (!supabase){
      box.innerHTML = '<div class="alert alert-danger">Supabase not initialized.</div>';
      return;
    }
    box.innerHTML = '<p class="text-muted">Loading expos…</p>';

    var expos = await fetchExpos(supabase);

    var STATE = { q: "", sortKey: "created", sortDir: "desc", draw: null };

    function applyFilter(rows){
      var q = (STATE.q || "").toLowerCase();
      if (!q) return rows;
      return rows.filter(function(e){
        var name = String(e.name||"").toLowerCase();
        var city = String(e.city||"").toLowerCase();
        var state = String(e.state||"").toLowerCase();
        return name.indexOf(q) >= 0 || city.indexOf(q) >= 0 || state.indexOf(q) >= 0;
      });
    }

    STATE.draw = function(){
      var filtered = applyFilter(expos);
      renderTable(box, filtered, STATE, {
        onApprove: function(id){ return approveExpo(supabase, id); }
      });
    };

    STATE.draw(); // initial
  });
})();