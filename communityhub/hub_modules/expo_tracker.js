// /communityhub/hub_modules/expo_tracker.js (Explore split-view, fixed state filter, styled tabs, expandable list)
console.log("✅ expo_tracker.js loaded");

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
  const supabase = window.supabase;
  if (!supabase) throw new Error("Supabase client missing");

  const els = {
    tabs: document.getElementById("x-tabs"),
    state: document.getElementById("x-state"),
    search: document.getElementById("x-search"),
    clear: document.getElementById("x-clear"),
    openReg: document.getElementById("x-open-register"),
    // views
    vExplore: document.getElementById("x-view-explore"),
    vCalendar: document.getElementById("x-view-calendar"),
    vVendors: document.getElementById("x-view-vendors"),
    list: document.getElementById("x-explore-list"),
    calRoot: document.getElementById("x-calendar-root"),
    map: document.getElementById("x-map"),
  };
  if (!els.tabs || !els.state || !els.vExplore) {
    console.warn("⚠️ Expo Tracker: missing required DOM elements");
    return;
  }

  // Wire filters
  els.clear?.addEventListener("click", () => { if (els.search) els.search.value = ""; refreshCurrentView(); });
  els.search?.addEventListener("input", debounce(() => refreshCurrentView(), 250));
  els.state?.addEventListener("change", refreshCurrentView);

  // Tabs
  els.tabs.addEventListener("click", (e) => {
    const a = e.target.closest("[data-view]"); if (!a) return;
    const view = a.getAttribute("data-view");
    if (view === "register") { onOpenModal(); return; }
    setActiveTab(view);
    refreshCurrentView();
  });

  // direct register button
  els.openReg?.addEventListener("click", onOpenModal);

  // Default from URL
  const params = new URLSearchParams(window.location.search);
  const v = params.get("view") || "explore";
  const st = params.get("state") || null;
  if (st && els.state) { els.state.value = normalizeState(st) || st; }
  setActiveTab(v);

  // initial load
  refreshCurrentView();

  /* --------------------------- view management --------------------------- */
  function setActiveTab(view){
    const links = els.tabs.querySelectorAll(".nav-link");
    links.forEach(l => l.classList.remove("active"));
    const active = els.tabs.querySelector(`[data-view="${view}"]`);
    if (active) active.classList.add("active");

    // Show/hide views
    els.vExplore.classList.add("d-none");
    els.vCalendar.classList.add("d-none");
    els.vVendors.classList.add("d-none");
    if (view === "explore") els.vExplore.classList.remove("d-none");
    if (view === "calendar") els.vCalendar.classList.remove("d-none");
    if (view === "vendors") els.vVendors.classList.remove("d-none");

    // update URL (no navigation)
    const p = new URLSearchParams(window.location.search);
    p.set("view", view);
    if (els.state?.value) p.set("state", els.state.value);
    history.replaceState({}, "", `${location.pathname}?${p.toString()}`);
  }

  async function refreshCurrentView(){
    const view = els.tabs.querySelector(".nav-link.active")?.getAttribute("data-view") || "explore";
    if (view === "explore") return loadExplore();
    if (view === "calendar") return loadCalendar();
    if (view === "vendors") return loadVendors();
  }

  /* ---------------------------- Explore (list+map) ---------------------------- */
  let map, markers = [];
  async function loadExplore(){
    // Map first so we can focus markers on item click
    await ensureLeaflet();
    const hint = document.getElementById("x-map-hint");
    if (!window.L) {
      hint && (hint.textContent = "Leaflet failed to load.");
    } else if (hint) {
      hint.textContent = "Tip: click a card to open its pin.";
    }
    if (!map && window.L) {
      map = L.map("x-map").setView([39.82,-98.58], 4); // USA
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OSM" }).addTo(map);
    }

    const stateSel = normalizeState(els.state?.value || "");
    const q = (els.search?.value || "").trim().toLowerCase();

    // fetch approved expos filtered by state (if any)
    let { data, error } = await supabase.from("expos").select("id, name, city, state, venue_name, lat, lng, hero_image, website, description, approved").eq("approved", true).order("name");
    if (error) { console.error("❌ expos load failed:", error); data = []; }

    const expos = (data || []).filter(e => {
      if (stateSel && normalizeState(e.state) !== stateSel) return false;
      if (!q) return true;
      return [e.name, e.city, e.state, e.venue_name].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    });

    // Render list
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
          </div>
          <div class="x-expando" id="expando-${e.id}">
            <div class="small mt-2">${safe(e.description || "")}</div>
            <div class="small text-muted mt-1" data-upcoming="${e.id}">Loading schedule…</div>
          </div>
        </div>`;
      }).join("");
    }

    // Render markers
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

    // Click handlers: expand + open marker + fetch upcoming
    els.list.querySelectorAll("[data-expo]").forEach(item => {
      item.addEventListener("click", async () => {
        const id = item.getAttribute("data-expo");
        const exp = document.getElementById(`expando-${id}`);
        const show = !exp.classList.contains("show");
        // collapse others
        els.list.querySelectorAll(".x-expando.show").forEach(x => x.classList.remove("show"));
        if (show) { exp.classList.add("show"); await fillUpcoming(id); }
        // open marker
        const m = markers.find(mm => mm.__expoId === id);
        if (m && map) { m.openPopup(); map.panTo(m.getLatLng()); }
      });
    });
  }

  async function fillUpcoming(expoId){
    const root = document.querySelector(`[data-upcoming="${expoId}"]`);
    if (!root) return;
    root.textContent = "Loading schedule…";
    // Next 6 months window
    const from = new Date(); const to = new Date(from.getFullYear(), from.getMonth()+6, from.getDate());
    // 1) specific dates in window
    let { data: dates, error: dErr } = await supabase
      .from("expo_calendar_dates")
      .select("event_date, start_time, end_time, timezone")
      .eq("expo_id", expoId)
      .gte("event_date", iso(from))
      .lte("event_date", iso(to))
      .order("event_date");
    if (dErr) dates = [];
    // 2) recurring rules
    let { data: rules, error: rErr } = await supabase
      .from("expo_schedules")
      .select("ordinal, day_of_week, start_time, end_time, timezone, active, valid_from, valid_to")
      .eq("expo_id", expoId)
      .eq("active", true);
    if (rErr) rules = [];

    // expand recurring for the window
    const rec = expandRecurring(rules.map(r => ({ expos: {}, ...r, expo_id: expoId })), from, to);
    // merge: specific overrides recurring same day
    const key = (d) => d;
    const datesKeys = new Set((dates||[]).map(x => x.event_date));
    const merged = [
      ...(dates||[]).map(x => ({ date: x.event_date, time: formatTimeRange(x.start_time, x.end_time, x.timezone) })),
      ...(rec||[]).filter(x => !datesKeys.has(x.date)).map(x => ({ date: x.date, time: x.time }))
    ].sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);

    if (!merged.length) {
      root.textContent = "No upcoming dates found.";
    } else {
      root.innerHTML = merged.map(m => `<div>${m.date} <span class="text-muted">${safe(m.time||"")}</span></div>`).join("");
    }
  }

  /* ----------------------------- Calendar view --------------------------- */
  let calendar; // FullCalendar instance
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
        headerToolbar: {
          left: "title",
          center: "",
          right: "prev,next today dayGridMonth,listMonth"
        },
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

    // specific dates
    let { data: dates, error: dErr } = await supabase
      .from("expo_calendar_dates")
      .select("expo_id, event_date, start_time, end_time, timezone, expos:expo_id (id, name, city, state, venue_name, approved)")
      .gte("event_date", iso(range.start))
      .lte("event_date", iso(range.end))
      .order("event_date");
    if (dErr) dates = [];
    dates = (dates || []).filter(r => r.expos?.approved && (!stateSel || normalizeState(r.expos.state) === stateSel) && matchesSearch(r.expos, q));

    // recurring rules
    let { data: rules, error: rErr } = await supabase
      .from("expo_schedules")
      .select("expo_id, ordinal, day_of_week, start_time, end_time, timezone, active, valid_from, valid_to, expos:expo_id (id, name, city, state, venue_name, approved)")
      .eq("active", true);
    if (rErr) rules = [];
    rules = (rules || []).filter(r => r.expos?.approved && (!stateSel || normalizeState(r.expos.state) === stateSel) && matchesSearch(r.expos, q));

    const recInstances = expandRecurring(rules, range.start, range.end);

    // override recurring by specific on same day
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

  /* ------------------------------- Vendors view -------------------------- */
  async function loadVendors(){
    const body = els.vVendors?.querySelector(".card-body");
    if (!body) return;
    body.innerHTML = `<div class="text-muted small">Loading vendors…</div>`;

    const stateSel = normalizeState(els.state?.value || "");

    // expos in state
    let { data: expos, error: eErr } = await supabase
      .from("expos")
      .select("id, name, city, state, venue_name")
      .eq("approved", true);
    if (eErr) { console.warn("⚠️ expos load failed:", eErr); expos = []; }
    expos = (expos || []).filter(x => (!stateSel || normalizeState(x.state) === stateSel));
    if (!expos.length) { body.innerHTML = `<div class="text-muted small">No expos found for this state.</div>`; return; }

    const expoIds = expos.map(x => x.id);

    // links
    let links = [];
    if (expoIds.length) {
      const res = await supabase.from("store_expos").select("expo_id, store_id").in("expo_id", expoIds);
      links = res.data || [];
      if (res.error) console.warn("⚠️ links load failed:", res.error);
    }
    if (!links.length) { body.innerHTML = `<div class="text-muted small">No vendors linked yet.</div>`; return; }

    // stores (only id,name to match your schema)
    const storeIds = Array.from(new Set(links.map(l => l.store_id)));
    let stores = [];
    const sres = await supabase.from("store_profiles").select("id, name").in("id", storeIds);
    if (sres.error) console.warn("⚠️ stores load failed:", sres.error);
    stores = sres.data || [];
    const storeMap = new Map(stores.map(s => [s.id, s]));

    const byExpo = new Map(expos.map(e => [e.id, { expo: e, vendors: [] }]));
    links.forEach(l => {
      const grp = byExpo.get(l.expo_id);
      const s = storeMap.get(l.store_id);
      if (grp && s) grp.vendors.push(s);
    });

    const sections = [];
    byExpo.forEach(({ expo, vendors }) => {
      if (!vendors.length) return;
      sections.push(`
        <div class="mb-3">
          <div class="d-flex align-items-center justify-content-between">
            <h6 class="mb-1">${safe(expo.name)}</h6>
            <div class="text-muted small">${safe([expo.city, expo.state].filter(Boolean).join(", "))}</div>
          </div>
          <div class="row g-2">
            ${vendors.map(v => `
              <div class="col-12 col-md-6">
                <div class="border rounded p-2 d-flex align-items-center gap-2">
                  <div class="rounded bg-light d-inline-flex align-items-center justify-content-center" style="width:36px;height:36px;">
                    <span class="small">🛍️</span>
                  </div>
                  <div>
                    <div class="fw-semibold small">${safe(v.name)}</div>
                  </div>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `);
    });

    body.innerHTML = sections.length ? sections.join("") : `<div class="text-muted small">No vendors linked yet.</div>`;
  }

  /* ----------------------------- Register flow --------------------------- */
  function onOpenModal(){
    clearExpoForm();
    const modalEl = document.getElementById("expoModal");
    if (!modalEl) return console.warn("⚠️ expoModal not found");
    modalEl._state = { dates: [] };
    const dl = document.getElementById("x-dates-list"); if (dl) dl.innerHTML = "";
    const hero = document.getElementById("x-hero"); if (hero) hero.value = "";

    // default schedule block
    const r = document.getElementById("x-recurring");
    const s = document.getElementById("x-specific");
    const rb = document.getElementById("x-recurring-block");
    const sb = document.getElementById("x-specific-block");
    if (r && s && rb && sb) { r.checked = true; s.checked = false; rb.classList.remove("d-none"); sb.classList.add("d-none"); }

    if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    else { modalEl.classList.add("show"); modalEl.style.display = "block"; modalEl.removeAttribute("aria-hidden"); }
  }

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
    const name = (document.getElementById("x-name")?.value || "").trim();
    if (!name) return setMStatus("Expo name is required", "error");

    // geocode if lat/lng missing
    const latEl = document.getElementById("x-lat");
    const lngEl = document.getElementById("x-lng");
    if ((!latEl.value || !lngEl.value) && document.getElementById("x-address")?.value) {
      setMStatus("Finding location from address…");
      const geo = await geocodeAddress(document.getElementById("x-address").value);
      if (!geo) return setMStatus("Could not resolve that address.", "error");
      latEl.value = geo.lat.toFixed(6);
      lngEl.value = geo.lng.toFixed(6);
    }

    setMStatus("Submitting…");
    const rc = await reverseOrNull(latEl.value, lngEl.value);
    const city = rc?.city || null;
    const state = rc?.state || null;

    const expoPayload = {
      name,
      website: (document.getElementById("x-website")?.value || null),
      description: (document.getElementById("x-description")?.value || null),
      venue_name: (document.getElementById("x-venue")?.value || null),
      address: (document.getElementById("x-address")?.value || null),
      city, state,
      lat: latEl.value ? parseFloat(latEl.value) : null,
      lng: lngEl.value ? parseFloat(lngEl.value) : null,
      approved: false
    };

    const { data: ins, error: insErr } = await supabase.from("expos").insert(expoPayload).select("id").single();
    if (insErr || !ins?.id) { console.error("❌ expo insert failed:", insErr); return setMStatus("Create failed", "error"); }
    const expoId = ins.id;

    // Upload hero
    const hero = document.getElementById("x-hero");
    const file = hero?.files?.[0];
    if (file) {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
      const path = `expos/${expoId}/hero.${ext}`;
      const { error: upErr } = await supabase.storage.from("expo-images").upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (!upErr) {
        const { data: pub } = await supabase.storage.from("expo-images").getPublicUrl(path);
        const url = pub?.publicUrl || null;
        if (url) await supabase.from("expos").update({ hero_image: url }).eq("id", expoId);
      }
    }

    // Branch: specific vs recurring
    const isSpecific = document.getElementById("x-specific")?.checked === true;
    if (isSpecific) {
      const modalEl = document.getElementById("expoModal");
      const rows = (modalEl._state?.dates || []).map(x => ({
        expo_id: expoId,
        event_date: x.d,
        start_time: x.start || "10:00",
        end_time: x.end || "16:00",
        timezone: x.tz || "America/New_York"
      }));
      if (!rows.length) return setMStatus("Add at least one date.", "error");
      const { error: dErr } = await supabase.from("expo_calendar_dates").insert(rows);
      if (dErr) { console.warn("⚠️ date insert failed:", dErr); }
    } else {
      const days = [
        document.getElementById("x-day-sat")?.checked ? 6 : null,
        document.getElementById("x-day-sun")?.checked ? 0 : null
      ].filter(v => v !== null);
      if (!days.length) return setMStatus("Pick Saturday and/or Sunday", "error");
      const ordinal = parseInt(document.getElementById("x-ordinal")?.value || "2", 10);
      const startT = document.getElementById("x-start")?.value || "10:00";
      const endT = document.getElementById("x-end")?.value || "16:00";
      const tz = document.getElementById("x-tz")?.value || "America/New_York";
      const validFrom = document.getElementById("x-valid-from")?.value || null;
      const validTo = document.getElementById("x-valid-to")?.value || null;
      const rows = days.map(d => ({
        expo_id: expoId, ordinal, day_of_week: d, start_time: startT, end_time: endT, timezone: tz, active: true,
        valid_from: validFrom, valid_to: validTo
      }));
      const { error: schedErr } = await supabase.from("expo_schedules").insert(rows);
      if (schedErr) console.warn("⚠️ schedule insert failed:", schedErr);
    }

    setMStatus("Submitted! Pending approval.", "success");
    setTimeout(() => {
      if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(document.getElementById("expoModal")).hide();
      else { const m = document.getElementById("expoModal"); m.classList.remove("show"); m.style.display="none"; m.setAttribute("aria-hidden","true"); }
    }, 700);
  }
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

/* ------------------------------ Utilities ------------------------------- */
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
function safe(s){
  return String(s || "").replace(/[&<>"']/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);
  });
}
function debounce(fn, ms){ let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null,args), ms); }; }
function iso(d){ return d.toISOString().slice(0,10); }
function monthRange(d){
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth()+1, 0);
  return { start, end };
}
function matchesSearch(expo, q){
  if (!q) return true;
  const s = q.toLowerCase();
  return [expo.name, expo.city, expo.state, expo.venue_name].filter(Boolean).some(v => String(v).toLowerCase().includes(s));
}
function formatTimeRange(start, end, tz){
  if (!start || !end) return "";
  const tzTag = (tz && tz.includes("/")) ? tz.split("/")[1] : (tz || "");
  return `${start}–${end} ${tzTag}`;
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
