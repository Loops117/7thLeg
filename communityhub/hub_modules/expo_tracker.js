// /communityhub/hub_modules/expo_tracker.js
console.log("✅ expo_tracker.js loaded");

/* ------------------------ Dynamic CDN loaders --------------------------- */
let __fcLoading, __leafletLoading;
function loadScript(src){
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}
function loadCSS(href){
  return new Promise((resolve, reject) => {
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = href;
    l.onload = () => resolve(true);
    l.onerror = () => reject(new Error("Failed to load " + href));
    document.head.appendChild(l);
  });
}
async function ensureFullCalendar(){
  if (window.FullCalendar) return true;
  if (!__fcLoading) {
    __fcLoading = (async () => {
      try { await loadCSS("https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.css"); } catch {}
      await loadScript("https://cdn.jsdelivr.net/npm/luxon@3.4.4/build/global/luxon.min.js");
      await loadScript("https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js");
      return true;
    })();
  }
  try { await __fcLoading; } catch {}
  return !!window.FullCalendar;
}
async function ensureLeaflet(){
  if (window.L) return true;
  if (!__leafletLoading) {
    __leafletLoading = (async () => {
      try { await loadCSS("https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css"); } catch {}
      await loadScript("https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js");
      return true;
    })();
  }
  try { await __leafletLoading; } catch {}
  return !!window.L;
}

/* --------------------------------- BOOT ---------------------------------- */
(async function boot(){
  try {
    await start();
    console.log("✅ expo_tracker.js loaded successfully");
  } catch (e) {
    console.error("❌ Expo Tracker init failed:", e);
  }
})();

/* --------------------------------- MAIN ---------------------------------- */
async function start(){
  var map = null; var markers = [];
  const supabase = window.supabase;
  if (!supabase) throw new Error("Supabase client missing");

  const els = {
    tabs: document.getElementById("x-tabs"),
    state: document.getElementById("x-state"),
    search: document.getElementById("x-search"),
    clear: document.getElementById("x-clear"),
    openReg: document.getElementById("x-open-register"),
    vExplore: document.getElementById("x-view-explore"),
    vCalendar: document.getElementById("x-view-calendar"),
    list: document.getElementById("x-explore-list"),
    calRoot: document.getElementById("x-calendar-root"),
    map: document.getElementById("x-map"),
    selected: document.getElementById("x-selected"),
    selectedTitle: document.getElementById("x-selected-title"),
    selectedBody: document.getElementById("x-selected-body"),
    selectedToggle: document.getElementById("x-selected-toggle"),
    searchArea: document.getElementById("x-search-area"),
    vMy: document.getElementById("x-view-my"),
    myTable: document.getElementById("x-my-table"),
    myRefresh: document.getElementById("x-my-refresh"),
    myStatus: document.getElementById("x-my-status")
  };
  if (!els.tabs || !els.vExplore) return;

/* ------------------------------ Auth helper ----------------------------- */
async function getCurrentUser(){
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user || null;
  } catch(e){
    return null;
  }
}


  // filters
  els.clear && els.clear.addEventListener("click", () => { if (els.search) els.search.value = ""; refreshCurrentView(); });
  els.search && els.search.addEventListener("input", debounce(() => refreshCurrentView(), 250));
  els.state && els.state.addEventListener("change", refreshCurrentView);
  els.openReg && els.openReg.addEventListener("click", onOpenModal);
  els.myRefresh && els.myRefresh.addEventListener("click", () => loadMySubmissions());

  if (els.selectedToggle && els.selectedBody){
    els.selectedToggle.onclick = () => {
      const open = els.selectedToggle.getAttribute("aria-expanded") !== "false";
      if (open) { els.selectedBody.style.display="none"; els.selectedToggle.textContent="▼"; els.selectedToggle.setAttribute("aria-expanded","false"); }
      else { els.selectedBody.style.display=""; els.selectedToggle.textContent="▲"; els.selectedToggle.setAttribute("aria-expanded","true"); }
    };
  }

  // Tabs
  els.tabs.addEventListener("click", (e) => {
    const a = e.target.closest("[data-view]"); if (!a) return;
    const view = a.getAttribute("data-view");
    if (view === "register") { onOpenModal(); return; }
    setActiveTab(view);
    refreshCurrentView();
  });

  // Default from URL
  const params = new URLSearchParams(window.location.search);
  const v = params.get("view") || "explore";
  const st = params.get("state") || null;
  if (st && els.state) { els.state.value = normalizeState(st) || st; }
  setActiveTab(v);

  // initial load
  if (v === "explore") { await loadExplore(); } else { refreshCurrentView(); }


// refresh active view after a create/edit save
window.addEventListener("expo:saved", () => {
  const view = els.tabs.querySelector(".nav-link.active")?.getAttribute("data-view") || "explore";
  if (view === "my") loadMySubmissions();
  if (view === "explore") loadExplore();
  if (view === "calendar") loadCalendar();
});


  /* --------------------------- view management --------------------------- */
  function setActiveTab(view){
    const links = els.tabs.querySelectorAll(".nav-link");
    links.forEach(l => l.classList.remove("active"));
    const active = els.tabs.querySelector(`[data-view="${view}"]`);
    if (active) active.classList.add("active");

    els.vExplore.classList.add("d-none");
    els.vCalendar.classList.add("d-none");
    els.vMy && els.vMy.classList.add("d-none");
    if (view === "explore") els.vExplore.classList.remove("d-none");
    if (view === "calendar") els.vCalendar.classList.remove("d-none");
    if (view === "my" && els.vMy) els.vMy.classList.remove("d-none");

    const p = new URLSearchParams(window.location.search);
    p.set("view", view);
    if (els.state?.value) p.set("state", els.state.value);
    history.replaceState({}, "", `${location.pathname}?${p.toString()}`);
  }

  async function refreshCurrentView(){
    const view = els.tabs.querySelector(".nav-link.active")?.getAttribute("data-view") || "explore";
    if (view === "explore") return loadExplore();
    if (view === "calendar") return loadCalendar();
    if (view === "my") return loadMySubmissions();
  }


/* --------------------------- My submissions view ------------------------- */
async function loadMySubmissions(){
  if (!els.myTable) return;
  els.myStatus && (els.myStatus.textContent = "");
  els.myTable.innerHTML = `<tr><td colspan="4" class="text-muted small">Loading…</td></tr>`;

  const user = await getCurrentUser();
  if (!user?.id){
    els.myStatus && (els.myStatus.textContent = "You must be logged in to view your submissions.");
    els.myTable.innerHTML = `<tr><td colspan="4" class="text-muted small">Not logged in.</td></tr>`;
    return;
  }

  const { data, error } = await supabase
    .from("expos")
    .select("id, name, city, state, venue_name, approved, created_at")
    .eq("submitted_by", user.id)
    .order("created_at", { ascending: false });

  if (error){
    console.error("❌ my submissions load failed:", error);
    els.myStatus && (els.myStatus.textContent = "Failed to load your submissions.");
    els.myTable.innerHTML = `<tr><td colspan="4" class="text-muted small">Error loading submissions.</td></tr>`;
    return;
  }

  const rows = data || [];
  if (!rows.length){
    els.myTable.innerHTML = `<tr><td colspan="4" class="text-muted small">You haven’t submitted any expos yet.</td></tr>`;
    return;
  }

  els.myTable.innerHTML = rows.map(r => {
    const loc = [r.city, normalizeState(r.state)].filter(Boolean).join(", ");
    const status = r.approved
      ? `<span class="badge bg-success">Approved</span>`
      : `<span class="badge bg-warning text-dark">Pending</span>`;
    const actions = r.approved
      ? `<button class="btn btn-sm btn-outline-primary" type="button" data-action="suggest" data-id="${safe(r.id)}">Suggest Edit</button>`
      : `
        <button class="btn btn-sm btn-primary" data-action="edit" data-id="${safe(r.id)}">Edit</button>
        <button class="btn btn-sm btn-outline-primary" type="button" data-action="suggest" data-id="${safe(r.id)}">Suggest Edit</button>
      `;
    return `
      <tr>
        <td>
          <div class="fw-semibold">${safe(r.name)}</div>
          <div class="text-muted small">${safe(r.venue_name || "")}</div>
        </td>
        <td class="small text-muted">${safe(loc || "")}</td>
        <td>${status}</td>
        <td class="text-end">${actions}</td>
      </tr>
    `;
  }).join("");

  // delegate edit click
  els.myTable.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      await openEditModal(id);
    });
  });

  // delegate suggest click
  els.myTable.querySelectorAll('[data-action="suggest"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      await openSuggestModal(id);
    });
  });
}


  /* ---------------------------- Explore (list+map) ---------------------------- */
  async function loadExplore(byBounds=false){
    await ensureLeaflet();
    const hint = document.getElementById("x-map-hint");
    if (!window.L) { if (hint) hint.textContent = "Leaflet failed to load."; }
    else if (hint) { hint.textContent = "Tip: click a card to open its pin."; }

    if (!map && window.L) {
      map = L.map("x-map").setView([39.82,-98.58], 4); // USA
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OSM" }).addTo(map);
      setTimeout(() => { try { map.invalidateSize(); } catch(e){} }, 0);
    }

    const stateSel = normalizeState(els.state?.value || "");
    const q = (els.search?.value || "").trim().toLowerCase();

    let { data, error } = await supabase.from("expos").select("id, name, city, state, venue_name, lat, lng, hero_image, website, description, approved").eq("approved", true).order("name");
    if (error) { console.error("❌ expos load failed:", error); data = []; }

    let expos = (data || []).filter(e => {
      if (stateSel && normalizeState(e.state) !== stateSel) return false;
      if (!q) return true;
      return [e.name, e.city, e.state, e.venue_name].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    });

    if (byBounds && map) {
      const bounds = map.getBounds();
      expos = expos.filter(e => {
        const lat = parseFloat(e.lat), lng = parseFloat(e.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
        return bounds.contains([lat, lng]);
      });
    }

    if (!expos.length) {
      els.list.innerHTML = `<div class="list-group-item small text-muted">No expos found.</div>`;
    } else {
      els.list.innerHTML = expos.map(e => {
        const hero = e.hero_image || "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
        const sub = [e.city, normalizeState(e.state)].filter(Boolean).join(", ");
        return `
        <div class="list-group-item" data-expo="${e.id}">
          <div class="d-flex align-items-center gap-2">
            <img src="${safe(hero)}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;outline:1px solid rgba(0,0,0,0.08)">
            <div class="flex-grow-1">
              <div class="fw-semibold">${safe(e.name)}</div>
              <div class="text-muted small">${safe(sub)}${e.venue_name?` • ${safe(e.venue_name)}`:""}</div>
            </div>
            ${e.website ? `<a class="btn btn-sm btn-outline-secondary" target="_blank" href="${safe(e.website)}">Website</a>` : ""}
            <button class="btn btn-sm btn-outline-primary" type="button" data-action="suggest" data-id="${safe(e.id)}">Suggest Edit</button>
          </div>
          <div class="x-expando" id="expando-${e.id}">
            <div class="small mt-2">${safe(e.description || "")}</div>
            <div class="small text-muted mt-1" data-upcoming="${e.id}">Loading schedule…</div>
          </div>
        </div>`;
      }).join("");
    }

    markers.forEach(m => m.remove()); markers = [];
    const bounds = [];
    (expos || []).forEach(e => {
      const lat = parseFloat(e.lat), lng = parseFloat(e.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !window.L) return;
      const m = L.marker([lat,lng]).addTo(map).bindPopup(`<strong>${safe(e.name)}</strong><br>${safe(e.city||"")} ${safe(normalizeState(e.state)||"")}${e.venue_name?`<br>${safe(e.venue_name)}`:""}`);
      m.__expoId = e.id;
      markers.push(m); bounds.push([lat,lng]);
    });
    if (bounds.length && map) map.fitBounds(bounds, { padding: [16,16] });

    if (els.searchArea) els.searchArea.onclick = () => loadExplore(true);

    els.list.querySelectorAll("[data-expo]").forEach(item => {
      item.addEventListener("click", async () => {
        const id = item.getAttribute("data-expo");
        const exp = document.getElementById(`expando-${id}`);
        const show = !exp.classList.contains("show");
        els.list.querySelectorAll(".x-expando.show").forEach(x => x.classList.remove("show"));
        if (show) { exp.classList.add("show"); await fillUpcoming(id); }

        // Selected panel fill
        try {
          const title = item.querySelector(".fw-semibold")?.textContent || "";
          const sub = item.querySelector(".text-muted.small")?.textContent || "";
          if (els.selected && els.selectedTitle && els.selectedBody){
            els.selected.classList.remove("d-none");
            els.selectedTitle.textContent = title;
            els.selectedBody.innerHTML = `
              <div class="small text-muted mb-2">${safe(sub)}</div>
              <div class="small mb-2" id="x-selected-upcoming">Loading schedule…</div>
              <div class="small" id="x-selected-vendors"></div>
            `;
            await fillUpcomingInto("x-selected-upcoming", id);
            await fillVendorsForExpo(id);
          }
        } catch(e){ console.warn(e); }

        const m = markers.find(mm => mm.__expoId === id);
        if (m && map) { m.openPopup(); map.panTo(m.getLatLng()); }
      });
    });

    // Suggest Edit buttons inside Explore list
    els.list.querySelectorAll('[data-action="suggest"]').forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const id = btn.getAttribute("data-id");
        await openSuggestModal(id);
      });
    });

  }

  async function fillUpcoming(expoId){
    const root = document.querySelector(`[data-upcoming="${expoId}"]`);
    if (!root) return;
    root.textContent = "Loading schedule…";
    const merged = await getUpcomingMerged(expoId);
    if (!merged.length) root.textContent = "No upcoming dates found.";
    else root.innerHTML = merged.map(m => `<div>${m.date} <span class="text-muted">${safe(m.time||"")}</span></div>`).join("");
  }
  async function fillUpcomingInto(elId, expoId){
    const root = document.getElementById(elId);
    if (!root) return;
    root.textContent = "Loading schedule…";
    const merged = await getUpcomingMerged(expoId);
    if (!merged.length) root.textContent = "No upcoming dates found.";
    else root.innerHTML = merged.map(m => `<div>${m.date} <span class="text-muted">${safe(m.time||"")}</span></div>`).join("");
  }
  async function getUpcomingMerged(expoId){
    const from = new Date(); const to = new Date(from.getFullYear(), from.getMonth()+6, from.getDate());
    let { data: dates, error: dErr } = await supabase
      .from("expo_calendar_dates")
      .select("event_date, start_time, end_time, timezone")
      .eq("expo_id", expoId)
      .gte("event_date", iso(from))
      .lte("event_date", iso(to))
      .order("event_date");
    if (dErr) dates = [];
    let { data: rules, error: rErr } = await supabase
      .from("expo_schedules")
      .select("ordinal, day_of_week, start_time, end_time, timezone, active, valid_from, valid_to")
      .eq("expo_id", expoId)
      .eq("active", true);
    if (rErr) rules = [];
    const rec = expandRecurring(rules.map(r => ({ ...r, expo_id: expoId })), from, to);
    const datesKeys = new Set((dates||[]).map(x => x.event_date));
    const merged = [
      ...(dates||[]).map(x => ({ date: x.event_date, time: formatTimeRange(x.start_time, x.end_time, x.timezone) })),
      ...(rec||[]).filter(x => !datesKeys.has(x.date)).map(x => ({ date: x.date, time: x.time }))
    ].sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);
    return merged;
  }

  /* ----------------------------- Calendar view --------------------------- */
  let calendar;
  async function loadCalendar(){
    await ensureFullCalendar();
    const body = els.vCalendar?.querySelector(".card-body");
    if (!window.FullCalendar) {
      if (body) body.innerHTML = `<div class="text-muted small">Calendar failed to load.</div>`;
      return;
    }
    if (!calendar) {
      const el = els.calRoot;
      if (!el) return;
      calendar = new FullCalendar.Calendar(el, {
        initialView: (window.innerWidth <= 768) ? "listMonth" : "dayGridMonth",
        headerToolbar: { left: "title", center: "", right: "prev,next today dayGridMonth,listMonth" },
        height: "auto",
        datesSet: () => refreshEvents(),
        eventClick: (info) => {
          const e = info.event.extendedProps;
          const html = `<div><strong>${safe(info.event.title)}</strong><br>${safe(e.city || "")} ${safe(e.state || "")}<br>${safe(e.venue || "")}<br><span class="text-muted">${safe(e.time || "")}</span></div>`;
          alert(html.replace(/<br>/g, "\n"));
        }
      });
      calendar.render();
    }
    await refreshEvents();
  }

  async function refreshEvents(){
    if (!calendar) return;
    const range = calendar.view.activeStart && calendar.view.activeEnd
      ? { start: calendar.view.activeStart, end: calendar.view.activeEnd }
      : monthRange(new Date());
    const stateSel = normalizeState(els.state?.value || "");
    const q = (els.search?.value || "").trim();

    let { data: dates, error: dErr } = await supabase
      .from("expo_calendar_dates")
      .select("expo_id, event_date, start_time, end_time, timezone, expos:expo_id (id, name, city, state, venue_name, approved)")
      .gte("event_date", iso(range.start))
      .lte("event_date", iso(range.end))
      .order("event_date");
    if (dErr) dates = [];
    dates = (dates || []).filter(r => r.expos?.approved && (!stateSel || normalizeState(r.expos.state) === stateSel) && matchesSearch(r.expos, q));

    let { data: rules, error: rErr } = await supabase
      .from("expo_schedules")
      .select("expo_id, ordinal, day_of_week, start_time, end_time, timezone, active, valid_from, valid_to, expos:expo_id (id, name, city, state, venue_name, approved)")
      .eq("active", true);
    if (rErr) rules = [];
    rules = (rules || []).filter(r => r.expos?.approved && (!stateSel || normalizeState(r.expos.state) === stateSel) && matchesSearch(r.expos, q));

    const recInstances = expandRecurring(rules, range.start, range.end);
    const key = (expo_id, d) => `${expo_id}_${d}`;
    const dateKeys = new Set(dates.map(x => key(x.expo_id, x.event_date)));
    const merged = [
      ...dates.map(x => ({
        date: x.event_date,
        title: x.expos?.name || "Expo",
        time: formatTimeRange(x.start_time, x.end_time, x.timezone),
        city: x.expos?.city, state: x.expos?.state, venue: x.expos?.venue_name,
        expo_id: x.expo_id
      })),
      ...recInstances.filter(x => !dateKeys.has(key(x.expo_id, x.date)))
    ];

    calendar.removeAllEvents();
    calendar.addEventSource(merged.map(ev => ({
      title: ev.title,
      start: ev.date,
      allDay: true,
      extendedProps: { city: ev.city, state: ev.state, venue: ev.venue, time: ev.time, expo_id: ev.expo_id }
    })));
  }

  /* ----------------------------- Vendors helper -------------------------- */
  async function fillVendorsForExpo(expoId){
    try {
      const tgt = document.getElementById("x-selected-vendors");
      if (!tgt) return;
      const { data: links, error: lerr } = await supabase
        .from("store_expos").select("store_id").eq("expo_id", expoId);
      if (lerr || !links || !links.length) { tgt.innerHTML = '<div class="small text-muted">No vendors listed yet.</div>'; return; }
      const ids = Array.from(new Set(links.map(l => l.store_id)));
      const { data: stores, error: serr } = await supabase
        .from("store_profiles").select("id, name").in("id", ids);
      if (serr || !stores || !stores.length) { tgt.innerHTML = '<div class="small text-muted">No vendors listed yet.</div>'; return; }
      const rows = stores.map(s => `<a href="/communityhub/hub_modules/store/profile.html?id=${encodeURIComponent(s.id)}" class="me-2 small">${safe(s.name)}</a>`).join(" ");
      tgt.innerHTML = `<div class="small"><strong>Vendors:</strong> ${rows}</div>`;
    } catch(e){ console.warn(e); }
  }


/* ------------------------------ Edit modal ------------------------------ */
async function openEditModal(expoId){
  const user = await getCurrentUser();
  if (!user?.id) return alert("Please log in to edit your submission.");

  // fetch expo
  const { data: expo, error: eErr } = await supabase
    .from("expos")
    .select("id, name, website, description, venue_name, address, lat, lng, approved, submitted_by")
    .eq("id", expoId)
    .single();

  if (eErr || !expo){
    console.error("❌ fetch expo failed:", eErr);
    return alert("Could not load that expo.");
  }
  if (expo.approved) return alert("This expo has already been approved and can no longer be edited.");
  if (expo.submitted_by !== user.id) return alert("You can only edit expos you submitted.");

  const modalEl = document.getElementById("expoModal");
  if (!modalEl) return alert("Edit modal not found.");

  // Switch modal to edit mode
  modalEl._mode = "edit";
  
  setLocationLocked(true);
modalEl._editingExpoId = expoId;

  // Fill base fields
  document.getElementById("x-name").value = expo.name || "";
  document.getElementById("x-website").value = expo.website || "";
  document.getElementById("x-description").value = expo.description || "";
  document.getElementById("x-venue").value = expo.venue_name || "";
  document.getElementById("x-address").value = expo.address || "";
  document.getElementById("x-lat").value = (expo.lat ?? "") === null ? "" : String(expo.lat);
  document.getElementById("x-lng").value = (expo.lng ?? "") === null ? "" : String(expo.lng);

  // Clear hero input
  const hero = document.getElementById("x-hero"); if (hero) hero.value = "";

  // Load schedules/dates
  modalEl._state = { dates: [] };

  const { data: dates } = await supabase
    .from("expo_calendar_dates")
    .select("event_date, start_time, end_time, timezone")
    .eq("expo_id", expoId)
    .order("event_date");

  if (dates && dates.length){
    // Specific dates mode
    document.getElementById("x-specific").checked = true;
    document.getElementById("x-recurring").checked = false;
    toggleBlocks();
    modalEl._state.dates = dates.map(d => ({
      d: d.event_date,
      start: (d.start_time || "10:00").slice(0,5),
      end: (d.end_time || "16:00").slice(0,5),
      tz: d.timezone || "America/New_York"
    }));
    renderDatesList(modalEl);
  } else {
    // Recurring mode
    document.getElementById("x-recurring").checked = true;
    document.getElementById("x-specific").checked = false;
    toggleBlocks();

    const { data: sched } = await supabase
      .from("expo_schedules")
      .select("ordinal, day_of_week, start_time, end_time, timezone, valid_from, valid_to")
      .eq("expo_id", expoId)
      .eq("active", true);

    // reset checkboxes
    document.getElementById("x-day-sat").checked = false;
    document.getElementById("x-day-sun").checked = false;

    if (sched && sched.length){
      const first = sched[0];
      document.getElementById("x-ordinal").value = String(first.ordinal || 2);
      document.getElementById("x-start").value = (first.start_time || "10:00").slice(0,5);
      document.getElementById("x-end").value = (first.end_time || "16:00").slice(0,5);
      document.getElementById("x-tz").value = first.timezone || "America/New_York";
      document.getElementById("x-valid-from").value = first.valid_from || "";
      document.getElementById("x-valid-to").value = first.valid_to || "";

      sched.forEach(s => {
        if (parseInt(s.day_of_week,10) === 6) document.getElementById("x-day-sat").checked = true;
        if (parseInt(s.day_of_week,10) === 0) document.getElementById("x-day-sun").checked = true;
      });
    }
  }

  // Update modal title/button
  const title = modalEl.querySelector(".modal-title");
  if (title) title.textContent = "Edit Your Expo (Pending Approval)";
  const submitBtn = document.getElementById("x-submit");
  if (submitBtn) submitBtn.textContent = "Save Changes";

  setMStatus("");
  if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(modalEl).show();
  else { modalEl.classList.add("show"); modalEl.style.display = "block"; modalEl.removeAttribute("aria-hidden"); }
}


  

/* --------------------- Modal field locking helpers --------------------- */
window.pickExpoAllowed = function pickExpoAllowed(obj){
  // Excludes location/geo + admin fields by design
  return {
    name: obj?.name ?? null,
    description: obj?.description ?? null,
    website: obj?.website ?? null,
    start_date: obj?.start_date ?? null,
    end_date: obj?.end_date ?? null,
    hero_image: obj?.hero_image ?? null
  };
};

/* --------------------------- Suggest edit modal ------------------------- */
async function openSuggestModal(expoId){
  const supabase = window.supabase;
  const modalEl = document.getElementById("expoModal");
  if (!supabase || !modalEl) return;

  clearExpoForm();
  modalEl._mode = "suggest";
  
  setLocationLocked(true);
modalEl._editingExpoId = null;
  modalEl._suggestFromExpoId = expoId;
  modalEl._state = { dates: [] };

  // Load expo core info
  const { data: expo, error } = await supabase
    .from("expos")
    .select("id, name, website, description, venue_name, address, city, state, lat, lng")
    .eq("id", expoId)
    .single();

  if (error || !expo){
    console.error("❌ suggest prefill load failed:", error);
    setMStatus("Could not load that expo to prefill.", "error");
    return;
  }

  document.getElementById("x-name").value = expo.name || "";
  document.getElementById("x-website").value = expo.website || "";
  document.getElementById("x-description").value = expo.description || "";
  document.getElementById("x-venue").value = expo.venue_name || "";
  document.getElementById("x-address").value = expo.address || "";
  document.getElementById("x-lat").value = expo.lat ?? "";
  document.getElementById("x-lng").value = expo.lng ?? "";

  // Try to prefill schedule/dates
  const { data: dates } = await supabase
    .from("expo_calendar_dates")
    .select("event_date, start_time, end_time, timezone")
    .eq("expo_id", expoId)
    .order("event_date");

  if (dates && dates.length){
    document.getElementById("x-specific").checked = true;
    document.getElementById("x-recurring").checked = false;
    toggleBlocks();
    modalEl._state.dates = dates.map(d => ({
      d: d.event_date,
      start: (d.start_time || "10:00").slice(0,5),
      end: (d.end_time || "16:00").slice(0,5),
      tz: d.timezone || "America/New_York"
    }));
    renderDatesList(modalEl);
  } else {
    document.getElementById("x-recurring").checked = true;
    document.getElementById("x-specific").checked = false;
    toggleBlocks();

    const { data: sched } = await supabase
      .from("expo_schedules")
      .select("ordinal, day_of_week, start_time, end_time, timezone, valid_from, valid_to")
      .eq("expo_id", expoId)
      .eq("active", true);

    // reset checkboxes
    document.getElementById("x-day-sat").checked = false;
    document.getElementById("x-day-sun").checked = false;

    if (sched && sched.length){
      const first = sched[0];
      document.getElementById("x-ordinal").value = String(first.ordinal || 2);
      document.getElementById("x-start").value = (first.start_time || "10:00").slice(0,5);
      document.getElementById("x-end").value = (first.end_time || "16:00").slice(0,5);
      document.getElementById("x-tz").value = first.timezone || "America/New_York";
      document.getElementById("x-valid-from").value = first.valid_from || "";
      document.getElementById("x-valid-to").value = first.valid_to || "";

      sched.forEach(s => {
        if (parseInt(s.day_of_week,10) === 6) document.getElementById("x-day-sat").checked = true;
        if (parseInt(s.day_of_week,10) === 0) document.getElementById("x-day-sun").checked = true;
      });
    }
  }

  const title = modalEl.querySelector(".modal-title");
  if (title) title.textContent = "Suggest an Edit";
  const submitBtn = document.getElementById("x-submit");
  if (submitBtn) submitBtn.textContent = "Submit Suggested Edit";

  setMStatus("Make your changes and submit — this will go to review before appearing publicly.", "");
  if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(modalEl).show();
  else { modalEl.classList.add("show"); modalEl.style.display = "block"; modalEl.removeAttribute("aria-hidden"); }
}

/* ------------------------------ Utilities ------------------------------- */
  function safe(s){
    return String(s || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function debounce(fn, ms){ let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null,args), ms); }; }
  function iso(d){ return d.toISOString().slice(0,10); }
  function monthRange(d){ const start = new Date(d.getFullYear(), d.getMonth(), 1); const end = new Date(d.getFullYear(), d.getMonth()+1, 0); return { start, end }; }
  function matchesSearch(expo, q){ if (!q) return true; const s = q.toLowerCase(); return [expo.name, expo.city, expo.state, expo.venue_name].filter(Boolean).some(v => String(v).toLowerCase().includes(s)); }
  function formatTimeRange(start, end, tz){
    if (!start || !end) return "";
    const toDate = (t)=>{ const [h,m] = String(t).split(":").map(Number); const d = new Date(); d.setHours(h||0, m||0, 0, 0); return d; };
    const opts = { hour: 'numeric', minute: '2-digit', hour12: true };
    const s = toDate(start).toLocaleTimeString('en-US', opts);
    const e = toDate(end).toLocaleTimeString('en-US', opts);
    const tzMap = { 'America/New_York':'EST','America/Chicago':'CST','America/Denver':'MST','America/Los_Angeles':'PST' };
    const tag = tzMap[tz] || (tz && tz.split('/').pop()) || '';
    return `${s}–${e} ${tag}`.trim();
  }
  function nthDowOfMonth(year, month, dow, ordinal){
    const first = new Date(year, month, 1);
    const shift = (dow - first.getDay() + 7) % 7;
    const day = 1 + shift + (ordinal-1)*7;
    const d = new Date(year, month, day);
    if (d.getMonth() !== month) return null;
    return d;
  }
  function expandRecurring(rules, start, end){
    const out = [];
    const sY = start.getFullYear(), sM = start.getMonth();
    const eY = end.getFullYear(), eM = end.getMonth();
    let y = sY, m = sM;
    while (y < eY || (y === eY && m <= eM)) {
      rules.forEach(r => {
        const ord = parseInt(r.ordinal, 10);
        const dow = parseInt(r.day_of_week, 10);
        const dt = nthDowOfMonth(y, m, dow, ord);
        if (!dt) return;
        const dStr = dt.toISOString().slice(0,10);
        if (r.valid_from && dStr < r.valid_from) return;
        if (r.valid_to && dStr > r.valid_to) return;
        out.push({
          date: dStr,
          title: r.expos?.name || "Expo",
          time: formatTimeRange(r.start_time, r.end_time, r.timezone),
          city: r.expos?.city, state: r.expos?.state, venue: r.expos?.venue_name,
          expo_id: r.expo_id
        });
      });
      m++; if (m>11){ m=0; y++; }
    }
    return out.filter(x => x.date >= iso(start) && x.date <= iso(end));
  }
}

/* --------------------- Modal field locking helpers (GLOBAL) --------------------- */
function setLocationLocked(locked){
  const ids = ["x-venue","x-address","x-city","x-state","x-lat","x-lng"];
  ids.forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    if (locked){
      el.setAttribute("data-was-disabled", el.disabled ? "1":"0");
      el.disabled = true;
      el.setAttribute("readonly","readonly");
      el.classList.add("bg-light");
      el.title = "Location edits are locked. Contact an admin to correct location.";
    } else {
      const was = el.getAttribute("data-was-disabled");
      el.disabled = (was === "1");
      el.removeAttribute("readonly");
      el.classList.remove("bg-light");
      el.title = "";
      el.removeAttribute("data-was-disabled");
    }
  });
  const v = document.getElementById("x-verify");
  if (v){
    if (locked){ v.setAttribute("data-was-disabled", v.disabled ? "1":"0"); v.disabled = true; v.classList.add("disabled"); }
    else { const was = v.getAttribute("data-was-disabled"); v.disabled = (was === "1"); v.classList.remove("disabled"); v.removeAttribute("data-was-disabled"); }
  }
}

/* ------------------------------ Register flow --------------------------- */
function onOpenModal(){
  clearExpoForm();
  const modalEl = document.getElementById("expoModal");
  if (!modalEl) { console.warn("⚠️ expoModal not found"); return; }

  // create mode defaults
  modalEl._mode = "create";
  
  setLocationLocked(false);
modalEl._editingExpoId = null;
  modalEl._suggestFromExpoId = null;

  const t = modalEl.querySelector(".modal-title"); if (t) t.textContent = "Register an Event";
  const sb = document.getElementById("x-submit"); if (sb) sb.textContent = "Submit Event";

  modalEl._state = { dates: [] };
  const dl = document.getElementById("x-dates-list"); if (dl) dl.innerHTML = "";
  const hero = document.getElementById("x-hero"); if (hero) hero.value = "";

  // default to recurring
  const r = document.getElementById("x-recurring");
  const s = document.getElementById("x-specific");
  const rb = document.getElementById("x-recurring-block");
  const spb = document.getElementById("x-specific-block");
  if (r && s && rb && spb) { r.checked = true; s.checked = false; rb.classList.remove("d-none"); spb.classList.add("d-none"); }

  setMStatus("");
  if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(modalEl).show();
  else { modalEl.classList.add("show"); modalEl.style.display = "block"; modalEl.removeAttribute("aria-hidden"); }
}

document.getElementById("x-recurring")

document.getElementById("x-recurring")?.addEventListener("change", toggleBlocks);
document.getElementById("x-specific")?.addEventListener("change", toggleBlocks);
function toggleBlocks(){
  const s = document.getElementById("x-specific");
  const rb = document.getElementById("x-recurring-block");
  const sb = document.getElementById("x-specific-block");
  if (!s || !rb || !sb) return;
  if (s.checked) { rb.classList.add("d-none"); sb.classList.remove("d-none"); }
  else { rb.classList.remove("d-none"); sb.classList.add("d-none"); }
}

const addBtn = document.getElementById("x-add-date");
const dateInput = document.getElementById("x-date");
if (addBtn && dateInput) {
  if (addBtn._handler) addBtn.removeEventListener("click", addBtn._handler);
  addBtn._handler = () => {
    const d = (dateInput.value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    const modalEl = document.getElementById("expoModal");
    if (!modalEl._state) modalEl._state = { dates: [] };
    const arr = modalEl._state.dates;
    if (!arr.some(x => x.d === d)) arr.push({ d, start: "10:00", end: "16:00", tz: "America/New_York" });
    renderDatesList(modalEl);
  };
  addBtn.addEventListener("click", addBtn._handler);
}

document.getElementById("x-verify")?.addEventListener("click", onVerifyAddress);
async function onVerifyAddress(){
  const addr = (document.getElementById("x-address")?.value || "").trim();
  if (!addr) return setMStatus("Enter an address to verify.", "error");
  setMStatus("Verifying address…");
  const geo = await geocodeAddress(addr);
  if (!geo) return setMStatus("Could not find that address.", "error");
  document.getElementById("x-lat").value = geo.lat.toFixed(6);
  document.getElementById("x-lng").value = geo.lng.toFixed(6);
  const city = geo.address?.city || geo.address?.town || geo.address?.village || geo.address?.hamlet || geo.address?.municipality || null;
  const state = inferStateCode(geo.address);
  setMStatus(`Address verified ✓${city||state?` (${city||""} ${state||""})`:""}`, "success");
}

document.getElementById("x-submit")?.addEventListener("click", onSubmit);
async function onSubmit(){
  const supabase = window.supabase;
  const modalEl = document.getElementById("expoModal");
  const mode = modalEl ? (modalEl._mode || "create") : "create";
  const editingExpoId = modalEl ? (modalEl._editingExpoId || null) : null;
  const suggestFrom = modalEl ? (modalEl._suggestFromExpoId || null) : null;

  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user || null;
  if (!user?.id) return setMStatus("You must be logged in to submit expos.", "error");

  const name = (document.getElementById("x-name")?.value || "").trim();
  if (!name) return setMStatus("Event name is required", "error");

  // Location fields are locked for suggest/edit modes (policy: location is admin-only)
  const latEl = document.getElementById("x-lat");
  const lngEl = document.getElementById("x-lng");

  // CREATE mode: allow geocode + reverse-geocode for nice city/state autofill
  let city = null, state = null;
  if (mode === "create") {
    if ((!latEl?.value || !lngEl?.value) && (document.getElementById("x-address")?.value || "").trim()) {
      setMStatus("Finding location from address…");
      const geo = await geocodeAddress(document.getElementById("x-address").value);
      if (!geo) return setMStatus("Could not resolve that address.", "error");
      latEl.value = geo.lat.toFixed(6);
      lngEl.value = geo.lng.toFixed(6);
    }

    setMStatus("Submitting…");
    const rc = await reverseOrNull(latEl?.value, lngEl?.value);
    city = rc?.city || null;
    state = rc?.state || null;
  } else {
    setMStatus(mode === "suggest" ? "Submitting suggestion…" : "Saving…");
  }

  // Build base payload from form (location excluded from allowed set)
  const rawDesc = document.getElementById("x-description")?.value ?? null;
  const expoDraft = {
    name,
    website: (document.getElementById("x-website")?.value || null),
    description: rawDesc,
    start_date: (document.getElementById("x-start-date")?.value || null),
    end_date: (document.getElementById("x-end-date")?.value || null),
    hero_image: null
  };

  // Hero upload (for create/edit: update expos; for suggest: store URL in suggestion)
  const heroInput = document.getElementById("x-hero");
  const heroFile = heroInput?.files?.[0] || null;

  // Determine schedule payload from UI
  const isSpecific = document.getElementById("x-specific")?.checked === true;
  const tz = document.getElementById("x-tz")?.value || "America/New_York";

  function collectSchedule(){
    if (isSpecific){
      const rows = (modalEl?._state?.dates || []).map(x => ({
        event_date: x.d,
        start_time: x.start || "10:00",
        end_time: x.end || "16:00",
        timezone: x.tz || tz
      }));
      return { kind: "specific", rows };
    } else {
      const days = [
        document.getElementById("x-day-sat")?.checked ? 6 : null,
        document.getElementById("x-day-sun")?.checked ? 0 : null
      ].filter(v => v !== null);
      const ordinal = parseInt(document.getElementById("x-ordinal")?.value || "2", 10);
      const startT = document.getElementById("x-start")?.value || "10:00";
      const endT = document.getElementById("x-end")?.value || "16:00";
      const validFrom = document.getElementById("x-valid-from")?.value || null;
      const validTo = document.getElementById("x-valid-to")?.value || null;
      const rows = days.map(d => ({
        ordinal,
        day_of_week: d,
        start_time: startT,
        end_time: endT,
        timezone: tz,
        active: true,
        valid_from: validFrom,
        valid_to: validTo
      }));
      return { kind: "recurring", rows };
    }
  }

  const schedDraft = collectSchedule();
  if (schedDraft.kind === "specific" && !schedDraft.rows.length) return setMStatus("Add at least one date.", "error");
  if (schedDraft.kind === "recurring" && !schedDraft.rows.length) return setMStatus("Pick Saturday and/or Sunday", "error");

  /* ----------------------- SUGGEST MODE (NEW TABLE) ----------------------- */
  if (mode === "suggest") {
    if (!suggestFrom) return setMStatus("Missing expo id for suggestion.", "error");

    // Load current canonical expo + schedules/dates to snapshot (exclude location fields)
    const { data: curExpo, error: curErr } = await supabase
      .from("expos")
      .select("id,name,description,website,start_date,end_date,hero_image")
      .eq("id", suggestFrom)
      .single();
    if (curErr || !curExpo) { console.error(curErr); return setMStatus("Could not load expo for suggestion.", "error"); }

    const { data: curDates } = await supabase
      .from("expo_calendar_dates")
      .select("event_date,start_time,end_time,timezone,note")
      .eq("expo_id", suggestFrom);

    const { data: curSched } = await supabase
      .from("expo_schedules")
      .select("ordinal,day_of_week,start_time,end_time,timezone,active,valid_from,valid_to,effective_from,effective_to")
      .eq("expo_id", suggestFrom);

    // If a new hero image is selected, upload it now and set after_snapshot hero_image URL
    let suggestedHeroUrl = null;
    if (heroFile){
      try{
        const ext = heroFile.name.includes(".") ? heroFile.name.split(".").pop() : "jpg";
        const uid = (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2));
        const path = `expo_suggestions/${suggestFrom}/${uid}.${ext}`;
        const up = await supabase.storage.from("expo-images").upload(path, heroFile, { upsert: true, contentType: heroFile.type || "image/jpeg" });
        if (up?.error) { console.warn("Hero upload failed:", up.error); }
        else {
          const { data: pub } = await supabase.storage.from("expo-images").getPublicUrl(path);
          suggestedHeroUrl = pub?.publicUrl || null;
        }
      }catch(e){ console.warn("Hero upload error:", e); }
    }

    const before_snapshot = {
      expo: window.pickExpoAllowed(curExpo),
      schedule: {
        calendar_dates: curDates || [],
        schedules: curSched || []
      }
    };

    const afterExpo = window.pickExpoAllowed({
      ...expoDraft,
      hero_image: suggestedHeroUrl || curExpo.hero_image || null
    });

    const after_snapshot = {
      expo: afterExpo,
      schedule: (schedDraft.kind === "specific")
        ? { calendar_dates: schedDraft.rows, schedules: [] }
        : { calendar_dates: [], schedules: schedDraft.rows }
    };

    // Optional note field if you add it to the UI later
    const note = (document.getElementById("x-suggest-note")?.value || "").trim() || null;

    const { error: insErr } = await supabase.from("expo_edit_suggestions").insert({
      expo_id: suggestFrom,
      submitted_by: user.id,
      status: "pending",
      before_snapshot,
      after_snapshot,
      note
    });
    if (insErr) { console.error("❌ suggestion insert failed:", insErr); return setMStatus("Suggestion submit failed.", "error"); }

    setMStatus("Suggestion submitted! Pending review.", "success");
    try { window.dispatchEvent(new CustomEvent("expo:saved")); } catch(e){}
    setTimeout(() => { try { bootstrap.Modal.getOrCreateInstance(modalEl).hide(); } catch(e){} }, 250);
    return;
  }

  /* -------------------------- EDIT / CREATE EXPO -------------------------- */

  // Build expo payload including location only for create
  const expoPayload = {
    name: expoDraft.name,
    website: expoDraft.website,
    description: expoDraft.description,
    start_date: expoDraft.start_date,
    end_date: expoDraft.end_date,
    approved: false,
    submitted_by: user.id
  };

  if (mode === "create") {
    expoPayload.venue_name = (document.getElementById("x-venue")?.value || null);
    expoPayload.address = (document.getElementById("x-address")?.value || null);
    expoPayload.city = city;
    expoPayload.state = state;
    expoPayload.lat = latEl?.value ? parseFloat(latEl.value) : null;
    expoPayload.lng = lngEl?.value ? parseFloat(lngEl.value) : null;
  }

  let expoId = editingExpoId;

  if (mode === "edit") {
    if (!expoId) return setMStatus("Missing expo id for edit.", "error");

    const { data: cur, error: curErr } = await supabase
      .from("expos")
      .select("id, approved, submitted_by")
      .eq("id", expoId)
      .single();

    if (curErr || !cur) return setMStatus("Could not load expo for editing.", "error");
    if (cur.approved) return setMStatus("This expo is already approved and cannot be edited.", "error");
    if (cur.submitted_by !== user.id) return setMStatus("You can only edit expos you submitted.", "error");

    // Do not overwrite submitted_by, and never touch location fields (policy)
    const { submitted_by, venue_name, address, city, state, lat, lng, ...updatePayload } = expoPayload;

    const { error: upErr } = await supabase.from("expos").update(updatePayload).eq("id", expoId);
    if (upErr) { console.error("❌ expo update failed:", upErr); return setMStatus("Update failed", "error"); }

  } else {
    const { data: ins, error: insErr } = await supabase.from("expos").insert(expoPayload).select("id").single();
    if (insErr || !ins?.id) { console.error("❌ expo insert failed:", insErr); return setMStatus("Create failed", "error"); }
    expoId = ins.id;
  }

  // Hero upload for create/edit updates canonical expo hero_image
  if (heroFile) {
    const ext = heroFile.name.includes(".") ? heroFile.name.split(".").pop() : "jpg";
    const path = `expos/${expoId}/hero.${ext}`;
    const { error: upErr } = await supabase.storage.from("expo-images").upload(path, heroFile, { upsert: true, contentType: heroFile.type || "image/jpeg" });
    if (!upErr) {
      const { data: pub } = await supabase.storage.from("expo-images").getPublicUrl(path);
      const url = pub?.publicUrl || null;
      if (url) await supabase.from("expos").update({ hero_image: url }).eq("id", expoId);
    }
  }

  // Replace existing schedule on edit
  if (mode === "edit") {
    await supabase.from("expo_calendar_dates").delete().eq("expo_id", expoId);
    await supabase.from("expo_schedules").delete().eq("expo_id", expoId);
  }

  if (schedDraft.kind === "specific") {
    const rows = schedDraft.rows.map(r => ({ ...r, expo_id: expoId }));
    const { error: dErr } = await supabase.from("expo_calendar_dates").insert(rows);
    if (dErr) { console.warn("⚠️ date insert failed:", dErr); }
  } else {
    const rows = schedDraft.rows.map(r => ({ ...r, expo_id: expoId }));
    const { error: sErr } = await supabase.from("expo_schedules").insert(rows);
    if (sErr) { console.warn("⚠️ schedule insert failed:", sErr); }
  }

  setMStatus(mode === "edit" ? "Saved! Still pending approval." : "Submitted! Pending approval.", "success");
  try { window.dispatchEvent(new CustomEvent("expo:saved")); } catch(e){}
  setTimeout(() => { try { bootstrap.Modal.getOrCreateInstance(modalEl).hide(); } catch(e){} }, 250);
}


/* --------------------------- Specific Dates UI --------------------------- */
function renderDatesList(modalEl){
  const list = document.getElementById("x-dates-list");
  if (!list) return;
  const arr = (modalEl._state && Array.isArray(modalEl._state.dates)) ? modalEl._state.dates : [];
  list.innerHTML = "";
  if (!arr.length) {
    list.innerHTML = `<div class="list-group-item text-muted small">No dates added yet.</div>`;
    return;
  }
  arr.sort((a,b)=>a.d.localeCompare(b.d));
  arr.forEach((row, idx) => {
    const item = document.createElement("div");
    item.className = "list-group-item";
    item.innerHTML = `
      <div class="row g-2 align-items-center">
        <div class="col-md-3"><strong>${row.d}</strong></div>
        <div class="col-md-3"><input type="time" class="form-control form-control-sm" data-role="sd-start" data-ix="${idx}" value="${row.start}"></div>
        <div class="col-md-3"><input type="time" class="form-control form-control-sm" data-role="sd-end" data-ix="${idx}" value="${row.end}"></div>
        <div class="col-md-2">
          <select class="form-select form-select-sm" data-role="sd-tz" data-ix="${idx}">
            <option ${row.tz==='America/New_York'?'selected':''} value="America/New_York">America/New_York</option>
            <option ${row.tz==='America/Chicago'?'selected':''} value="America/Chicago">America/Chicago</option>
            <option ${row.tz==='America/Denver'?'selected':''} value="America/Denver">America/Denver</option>
            <option ${row.tz==='America/Los_Angeles'?'selected':''} value="America/Los_Angeles">America/Los_Angeles</option>
          </select>
        </div>
        <div class="col-md-1 text-end">
          <button class="btn btn-sm btn-outline-danger" data-role="sd-remove" data-ix="${idx}">Remove</button>
        </div>
      </div>`;
    list.appendChild(item);
  });
  list.querySelectorAll("[data-role='sd-start']").forEach(inp => {
    inp.addEventListener("change", (e)=>{
      const ix = parseInt(e.target.getAttribute("data-ix"),10);
      modalEl._state.dates[ix].start = e.target.value || "10:00";
    });
  });
  list.querySelectorAll("[data-role='sd-end']").forEach(inp => {
    inp.addEventListener("change", (e)=>{
      const ix = parseInt(e.target.getAttribute("data-ix"),10);
      modalEl._state.dates[ix].end = e.target.value || "16:00";
    });
  });
  list.querySelectorAll("[data-role='sd-tz']").forEach(sel => {
    sel.addEventListener("change", (e)=>{
      const ix = parseInt(e.target.getAttribute("data-ix"),10);
      modalEl._state.dates[ix].tz = e.target.value || "America/New_York";
    });
  });
  list.querySelectorAll("[data-role='sd-remove']").forEach(btn => {
    btn.addEventListener("click", (e)=>{
      const ix = parseInt(e.target.getAttribute("data-ix"),10);
      modalEl._state.dates.splice(ix,1);
      renderDatesList(modalEl);
    });
  });
}

/* ------------------------------ Utilities shared ------------------------------- */
function setMStatus(msg, type){
  const el = document.getElementById("x-status");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "small " + (type==="error" ? "text-danger" : type==="success" ? "text-success" : "text-muted");
}
function clearExpoForm(){
  const ids = ["x-name","x-website","x-description","x-venue","x-address","x-lat","x-lng","x-date"];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  const t = ["x-start","x-end"]; t.forEach(id => { const el = document.getElementById(id); if (el) el.value = (id==="x-start"?"10:00":"16:00"); });
  const dl = document.getElementById("x-dates-list"); if (dl) dl.innerHTML = "";
}

/* ------------------------------ Geocoding ------------------------------ */
async function geocodeAddress(q){
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;
    const hit = data[0];
    const lat = parseFloat(hit.lat), lng = parseFloat(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, address: hit.address || {}, display_name: hit.display_name };
  } catch(e){
    console.warn("⚠️ geocode error:", e);
    return null;
  }
}
async function reverseOrNull(lat, lng){
  try {
    if (!lat || !lng) return null;
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&addressdetails=1`;
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    const city = addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || null;
    const state = inferStateCode(addr);
    return { city, state };
  } catch(e){
    return null;
  }
}
const US_ABBR = {
  "alabama":"AL","alaska":"AK","arizona":"AZ","arkansas":"AR","california":"CA","colorado":"CO","connecticut":"CT","delaware":"DE",
  "district of columbia":"DC","florida":"FL","georgia":"GA","hawaii":"HI","idaho":"ID","illinois":"IL","indiana":"IN","iowa":"IA",
  "kansas":"KS","kentucky":"KY","louisiana":"LA","maine":"ME","maryland":"MD","massachusetts":"MA","michigan":"MI","minnesota":"MN",
  "mississippi":"MS","missouri":"MO","montana":"MT","nebraska":"NE","nevada":"NV","new hampshire":"NH","new jersey":"NJ",
  "new mexico":"NM","new york":"NY","north carolina":"NC","north dakota":"ND","ohio":"OH","oklahoma":"OK","oregon":"OR",
  "pennsylvania":"PA","rhode island":"RI","south carolina":"SC","south dakota":"SD","tennessee":"TN","texas":"TX","utah":"UT",
  "vermont":"VT","virginia":"VA","washington":"WA","west virginia":"WV","wisconsin":"WI","wyoming":"WY"
};
function normalizeState(s){
  if (!s) return "";
  const t = String(s).trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  const ab = US_ABBR[t.toLowerCase()];
  return ab || t.toUpperCase();
}
function inferStateCode(addr){
  if (!addr) return null;
  if (addr.state_code && /^[A-Za-z]{2}$/.test(addr.state_code)) return addr.state_code.toUpperCase();
  for (const k of Object.keys(addr)) {
    if (k.startsWith("ISO3166-2") && typeof addr[k] === "string") {
      const m = addr[k].match(/US-([A-Za-z]{2})/i);
      if (m) return m[1].toUpperCase();
    }
  }
  if (addr.state && US_ABBR[addr.state.toLowerCase()]) return US_ABBR[addr.state.toLowerCase()];
  return null;
}
