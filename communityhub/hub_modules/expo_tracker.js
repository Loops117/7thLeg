// /communityhub/hub_modules/expo_tracker.js
console.log("✅ expo_tracker.js loaded");

const supabase = window.supabase;

// Globals used across functions (define BEFORE use to avoid TDZ)
let __leafletLoading = false;
let __map = null, __layer = null, __mapRetry = null;

/* =============================== BOOT =================================== */
function boot(){
  try {
    ensureShell();
    ensureMapShell();
    ensureModalHTML();
    bindRegisterWiring();
    ensureLeaflet().finally(() => start()); // start regardless; we'll retry map init inside
    console.log("🟢 expo_tracker booted");
  } catch (e) {
    console.error("❌ expo_tracker boot error:", e);
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

/* ---------------------------- ENSURE BASIC UI ---------------------------- */
function ensureShell(){
  const root = document.getElementById("expo-root") || document.body;

  // Register button
  if (!document.getElementById("register-expo-btn")) {
    const header = document.getElementById("expo-header")
      || root.querySelector(".d-flex.align-items-center.justify-content-between")
      || root;
    const btn = document.createElement("button");
    btn.id = "register-expo-btn";
    btn.type = "button";
    btn.className = "btn btn-primary ms-auto";
    btn.textContent = "Register an Expo";
    header.appendChild(btn);
    console.log("🟩 Injected register button");
  }

  // State filter
  if (!document.getElementById("state-select")) {
    const cardBody = root.querySelector("#expo-list")?.closest(".card")?.querySelector(".card-body")
      || root.querySelector(".card-body")
      || root;
    const wrap = document.createElement("div");
    wrap.className = "mb-2";
    wrap.innerHTML = `
      <label class="form-label mb-1 small">State</label>
      <select id="state-select" class="form-select form-select-sm"></select>`;
    cardBody.prepend(wrap);
    console.log("🟩 Injected state filter shell");
  }

  // Populate states if empty
  const sel = document.getElementById("state-select");
  if (sel && !sel._filled) {
    const states = ["","AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","IA","ID","IL","IN","KS","KY","LA","MA","MD","ME","MI","MN","MO","MS","MT","NC","ND","NE","NH","NJ","NM","NV","NY","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VA","VT","WA","WI","WV","WY"];
    sel.innerHTML = `<option value="">Pick a state</option>` + states.filter(Boolean).map(s => `<option value="${s}">${s}</option>`).join("");
    sel._filled = true;
    console.log("🟩 Populated state options");
  }
}

/* --------------------------- ENSURE MAP MARKUP --------------------------- */
function ensureMapShell(){
  // Guarantee a visible map container exists
  let mapEl = document.getElementById("map");
  if (!mapEl) {
    mapEl = document.createElement("div");
    mapEl.id = "map";
    (document.getElementById("expo-root") || document.body).appendChild(mapEl);
    console.log("🟩 Injected #map container");
  }
  // enforce dimensions in case external CSS zeroes it out
  mapEl.style.height = mapEl.style.height || "calc(100vh - 140px)";
  mapEl.style.minHeight = mapEl.style.minHeight || "420px";
  mapEl.style.borderRadius = mapEl.style.borderRadius || "12px";
}

/* -------------------------- ENSURE LEAFLET LOADED ------------------------ */
function ensureLeaflet(){
  return new Promise((resolve, reject) => {
    if (window.L) return resolve();
    if (__leafletLoading) {
      let tries = 0;
      const iv = setInterval(() => {
        if (window.L) { clearInterval(iv); resolve(); }
        else if ((tries += 1) > 100) { clearInterval(iv); reject(new Error("Leaflet load timeout")); }
      }, 60);
      return;
    }
    __leafletLoading = true;

    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    const s = document.createElement("script");
    s.id = "leaflet-js";
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => { resolve(); };
    s.onerror = () => { reject(new Error("Leaflet script failed to load")); };
    document.head.appendChild(s);
  });
}

/* --------------------------- ENSURE MODAL MARKUP ------------------------- */
function ensureModalHTML(){
  if (document.getElementById("expoModal")) return;
  const modal = document.createElement("div");
  modal.innerHTML = `
  <div class="modal fade" id="expoModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Register an Expo</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div id="x-status" class="text-muted small mb-2"></div>
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label">Expo Name</label>
              <input type="text" id="x-name" class="form-control" required>
            </div>
            <div class="col-md-6">
              <label class="form-label">Website (optional)</label>
              <input type="url" id="x-website" class="form-control" placeholder="https://…">
            </div>
            <div class="col-12">
              <label class="form-label">Description (optional)</label>
              <textarea id="x-description" class="form-control" rows="2"></textarea>
            </div>

            <div class="col-md-6">
              <label class="form-label">Venue Name</label>
              <input type="text" id="x-venue" class="form-control">
            </div>
            <div class="col-md-6">
              <label class="form-label">Address</label>
              <div class="input-group">
                <input type="text" id="x-address" class="form-control" placeholder="Street, City, State ZIP">
                <button class="btn btn-outline-secondary" type="button" id="x-verify">Verify</button>
              </div>
              <div class="form-text">We’ll validate and place the pin automatically.</div>
            </div>

            <input type="hidden" id="x-lat">
            <input type="hidden" id="x-lng">

            <div class="col-md-8">
              <label class="form-label">Hero Image (optional)</label>
              <input type="file" id="x-hero" class="form-control" accept="image/*">
            </div>

            <div class="col-12"><hr/></div>

            <div class="col-md-4">
              <label class="form-label">Week</label>
              <select id="x-ordinal" class="form-select">
                <option value="1">First</option>
                <option value="2" selected>Second</option>
                <option value="3">Third</option>
                <option value="4">Fourth</option>
                <option value="5">Fifth</option>
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label d-block">Days</label>
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="checkbox" id="x-day-sat" value="6">
                <label class="form-check-label" for="x-day-sat">Saturday</label>
              </div>
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="checkbox" id="x-day-sun" value="0">
                <label class="form-check-label" for="x-day-sun">Sunday</label>
              </div>
            </div>
            <div class="col-md-2">
              <label class="form-label">Opens</label>
              <input type="time" id="x-start" class="form-control" value="10:00">
            </div>
            <div class="col-md-2">
              <label class="form-label">Closes</label>
              <input type="time" id="x-end" class="form-control" value="16:00">
            </div>
            <div class="col-md-4">
              <label class="form-label">Timezone</label>
              <select id="x-tz" class="form-select">
                <option value="America/New_York" selected>America/New_York</option>
                <option value="America/Chicago">America/Chicago</option>
                <option value="America/Denver">America/Denver</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
          <button id="x-submit" class="btn btn-primary">Submit Expo</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(modal.firstElementChild);
  console.log("🟩 Injected modal markup");
}

/* -------------------------- WIRE REGISTER HANDLERS ----------------------- */
function bindRegisterWiring(){
  const btn = document.getElementById("register-expo-btn");
  if (btn && !btn._wired) {
    btn.addEventListener("click", onOpenModal);
    btn._wired = true;
    console.log("🟩 Register button wired (direct)");
  }
  if (!bindRegisterWiring._delegated) {
    document.addEventListener("click", (e) => {
      const el = e.target.closest("#register-expo-btn");
      if (!el) return;
      console.log("🟦 Register clicked (delegated)");
      e.preventDefault();
      onOpenModal();
    });
    bindRegisterWiring._delegated = true;
    console.log("🟩 Register (delegated) handler attached");
  }
}

function onOpenModal(){
  clearExpoForm();
  const modalEl = document.getElementById("expoModal");
  if (!modalEl) return console.warn("⚠️ expoModal not found");
  if (window.bootstrap) {
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  } else {
    modalEl.classList.add("show");
    modalEl.style.display = "block";
    modalEl.removeAttribute("aria-hidden");
  }
}

/* --------------------------- FORM HELPERS (GLOBAL) ----------------------- */
function clearExpoForm(){
  const els = getModalEls();
  if (!els) return;
  els.status.textContent = "";
  els.name.value = "";
  els.website.value = "";
  els.desc.value = "";
  els.venue.value = "";
  els.address.value = "";
  els.lat.value = "";
  els.lng.value = "";
  if (els.hero) els.hero.value = "";
  els.ordinal.value = "2";
  els.daySat.checked = false;
  els.daySun.checked = false;
  els.start.value = "10:00";
  els.end.value = "16:00";
  els.tz.value = "America/New_York";
}

function getModalEls(){
  const o = {
    status: document.getElementById("x-status"),
    name: document.getElementById("x-name"),
    website: document.getElementById("x-website"),
    desc: document.getElementById("x-description"),
    venue: document.getElementById("x-venue"),
    address: document.getElementById("x-address"),
    lat: document.getElementById("x-lat"),
    lng: document.getElementById("x-lng"),
    hero: document.getElementById("x-hero"),
    ordinal: document.getElementById("x-ordinal"),
    daySat: document.getElementById("x-day-sat"),
    daySun: document.getElementById("x-day-sun"),
    start: document.getElementById("x-start"),
    end: document.getElementById("x-end"),
    tz: document.getElementById("x-tz"),
    submit: document.getElementById("x-submit"),
    verify: document.getElementById("x-verify"),
  };
  return o.name ? o : null;
}

/* --------------------------------- MAIN ---------------------------------- */
function start() {
  // Rebind in case DOM changed
  bindRegisterWiring();

  const els = {
    map: document.getElementById("map"),
    state: document.getElementById("state-select"),
    search: document.getElementById("search"),
    list: document.getElementById("expo-list"),
    status: document.getElementById("status"),
    m: getModalEls()
  };

  // Try to init the map now, and keep retrying until Leaflet shows up
  initMainMap(els);
  scheduleMapRetry(els);

  /* -------------------------- filters + search --------------------------- */
  els.state?.addEventListener("change", refresh);
  els.search?.addEventListener("input", debounce(refresh, 250));

  /* --------------------------- verify address ---------------------------- */
  if (els.m?.verify && !els.m.verify._wired) {
    els.m.verify.addEventListener("click", async () => {
      const addr = (els.m.address.value || "").trim();
      if (!addr) return setMStatus("Enter an address to verify.", "error");
      setMStatus("Verifying address…");
      const geo = await geocodeAddress(addr);
      if (!geo) return setMStatus("Could not find that address.", "error");
      els.m.lat.value = geo.lat.toFixed(6);
      els.m.lng.value = geo.lng.toFixed(6);
      setMStatus(`Address verified ✓`, "success");
    });
    els.m.verify._wired = true;
  }

  /* ---------------------------- submit handler --------------------------- */
  if (els.m?.submit && !els.m.submit._wired) {
    els.m.submit.addEventListener("click", () => onExpoSubmit(els));
    els.m.submit._wired = true;
    console.log("🟩 Modal submit wired");
  }

  /* ------------------------------ initial load --------------------------- */
  refresh();

  /* ------------------------------ inner funcs ---------------------------- */
  async function onExpoSubmit(els){
    const name = (els.m.name.value || "").trim();
    if (!name) { setMStatus("Expo name is required", "error"); return; }

    // Geocode if needed
    if ((!els.m.lat.value || !els.m.lng.value) && els.m.address.value) {
      setMStatus("Finding location from address…");
      const geo = await geocodeAddress(els.m.address.value);
      if (geo) {
        els.m.lat.value = geo.lat.toFixed(6);
        els.m.lng.value = geo.lng.toFixed(6);
      } else {
        setMStatus("Could not resolve that address.", "error");
        return;
      }
    }

    const days = [];
    if (els.m.daySat.checked) days.push(6);
    if (els.m.daySun.checked) days.push(0);
    if (!days.length) { setMStatus("Pick Saturday and/or Sunday", "error"); return; }

    setMStatus("Submitting…");

    const expoPayload = {
      name,
      website: (els.m.website.value || null),
      description: (els.m.desc.value || null),
      venue_name: (els.m.venue.value || null),
      address: (els.m.address.value || null),
      lat: els.m.lat.value ? parseFloat(els.m.lat.value) : null,
      lng: els.m.lng.value ? parseFloat(els.m.lng.value) : null,
      approved: false,
    };
    const { data: ins, error: insErr } = await supabase.from("expos").insert(expoPayload).select("id").single();
    if (insErr || !ins?.id) { console.error("❌ expo insert failed:", insErr); setMStatus("Create failed"); return; }
    const expoId = ins.id;

    const file = els.m.hero?.files?.[0];
    if (file) {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
      const path = `expos/${expoId}/hero.${ext}`;
      const { error: upErr } = await supabase.storage.from("expo-images").upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (upErr) { console.warn("⚠️ hero upload failed:", upErr); }
      else {
        const { data: pub } = await supabase.storage.from("expo-images").getPublicUrl(path);
        const url = pub?.publicUrl || null;
        if (url) await supabase.from("expos").update({ hero_image: url }).eq("id", expoId);
      }
    }

    const ordinal = parseInt(els.m.ordinal.value || "2", 10);
    const startT = els.m.start.value || "10:00";
    const endT = els.m.end.value || "16:00";
    const tz = els.m.tz.value || "America/New_York";
    const rows = [els.m.daySat.checked ? 6 : null, els.m.daySun.checked ? 0 : null]
      .filter(v => v !== null)
      .map(d => ({ expo_id: expoId, ordinal, day_of_week: d, start_time: startT, end_time: endT, timezone: tz, active: true }));
    if (rows.length) {
      const { error: schedErr } = await supabase.from("expo_schedules").insert(rows);
      if (schedErr) console.warn("⚠️ schedule insert failed:", schedErr);
    }

    setMStatus("Submitted! Pending approval.", "success");
    setTimeout(() => { setMStatus(""); closeModal(); refresh(); }, 700);
  }

  function setMStatus(msg, kind){
    const node = document.getElementById("x-status");
    if (node) {
      node.className = `small ${kind==="error"?"text-danger":kind==="success"?"text-success":"text-muted"}`;
      node.textContent = msg || "";
    }
  }

  function closeModal(){
    const modalEl = document.getElementById("expoModal");
    if (!modalEl) return;
    if (window.bootstrap) {
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.hide();
    } else {
      modalEl.classList.remove("show");
      modalEl.style.display = "none";
      modalEl.setAttribute("aria-hidden","true");
    }
  }

  async function refresh() {
    setStatus("");
    if (__layer) __layer.clearLayers();
    if (els.list) els.list.innerHTML = "";

    const st = els.state ? els.state.value : "";
    const qtext = (els.search?.value || "").trim();

    let q = supabase.from("expos").select("*").eq("approved", true);
    if (st) q = q.eq("state", st);
    if (qtext.length >= 2) {
      const like = ilike(qtext);
      q = q.or([`name.ilike.${like}`,`description.ilike.${like}`,`venue_name.ilike.${like}`,`address.ilike.${like}`,`city.ilike.${like}`].join(","));
    }
    const { data: expos, error } = await q.order("name", { ascending: true });
    if (error) { console.error("❌ expos fetch failed:", error); setStatus("Failed to load expos."); return; }

    const ids = expos?.map(e => e.id) || [];
    let schedByExpo = {};
    if (ids.length) {
      const { data: schedules } = await supabase
        .from("expo_schedules").select("expo_id, ordinal, day_of_week, start_time, end_time, timezone, active")
        .in("expo_id", ids).eq("active", true);
      schedByExpo = groupBy(schedules || [], r => r.expo_id);
    }

    const bounds = window.L && __map ? L.latLngBounds() : null;
    (expos || []).forEach(expo => {
      const hero = expo.hero_image || "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
      const occ = nextOccurrences(schedByExpo[expo.id] || [], 6);
      const occText = occ.length ? occ.map(o => o.label).slice(0,2).join(" • ") : "Schedule: see site";

      if (__layer && window.L && isFiniteNum(expo.lat) && isFiniteNum(expo.lng)) {
        const m = L.marker([expo.lat, expo.lng]).addTo(__layer);
        bounds && bounds.extend([expo.lat, expo.lng]);
        m.bindPopup(`<div style="min-width:220px"><div class="fw-semibold">${escapeHTML(expo.name || "Expo")}</div><div class="small text-muted">${occText}</div>${expo.website ? `<div class="small"><a href="${escapeAttr(expo.website)}" target="_blank" rel="noopener">Website</a></div>` : ""}</div>`);
      }

      const li = document.createElement("button");
      li.type = "button";
      li.className = "list-group-item list-group-item-action d-flex gap-2";
      li.innerHTML = `
        <img src="${escapeAttr(hero)}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;outline:1px solid rgba(0,0,0,0.08)">
        <div class="flex-grow-1 text-start">
          <div class="d-flex justify-content-between align-items-start">
            <div class="fw-semibold">${escapeHTML(expo.name || "Expo")}</div>
            ${expo.website ? `<a class="small" href="${escapeAttr(expo.website)}" target="_blank" rel="noopener">Website</a>` : ""}
          </div>
          <div class="small text-muted">${occText}</div>
          ${expo.venue_name ? `<div class="small">${escapeHTML(expo.venue_name)}</div>` : ""}
          ${(expo.city || expo.state) ? `<div class="small">${escapeHTML(expo.city || "")} ${escapeHTML(expo.state || "")}</div>` : ""}
        </div>`;
      li.addEventListener("click", () => {
        if (__map && isFiniteNum(expo.lat) && isFiniteNum(expo.lng)) __map.setView([expo.lat, expo.lng], 12);
      });
      els.list?.appendChild(li);
    });

    if (__map && bounds && bounds.isValid()) {
      __map.fitBounds(bounds.pad(0.2));
    }
  }
}

/* ------------------------- MAP INIT & RETRY LOGIC ------------------------ */
function initMainMap(els){
  if (__map || !window.L || !els?.map) return;
  const center = [39.82, -98.57];
  __map = L.map(els.map).setView(center, 4);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(__map);
  __layer = L.layerGroup().addTo(__map);
  setTimeout(() => __map.invalidateSize(), 250);
  window.addEventListener("resize", () => __map && __map.invalidateSize());
  console.log("🗺️ Map initialized");
}

function scheduleMapRetry(els){
  if (__mapRetry) return;
  let tries = 0;
  __mapRetry = setInterval(() => {
    if (__map) { clearInterval(__mapRetry); __mapRetry = null; return; }
    if (window.L) {
      initMainMap(els);
      if (__map) { clearInterval(__mapRetry); __mapRetry = null; return; }
    }
    if ((tries += 1) > 120) { // ~30s
      console.warn("⚠️ Map init timeout");
      clearInterval(__mapRetry);
      __mapRetry = null;
    }
  }, 250);
}

/* ------------------------------- UTILITIES ------------------------------- */
function setStatus(msg){ const el=document.getElementById("status"); if (el) el.textContent = msg || ""; }
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
function ilike(s){ return `%${String(s).replace(/[%_]/g, m => "\\"+m)}%`; }
function escapeHTML(s){ return String(s||"").replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHTML(s); }
function groupBy(arr, fn){ return (arr||[]).reduce((m,x)=>{ const k=fn(x); (m[k]=m[k]||[]).push(x); return m; },{}); }
function isFiniteNum(v){ return typeof v==="number" && Number.isFinite(v); }
function nextOccurrences(schedules, months){
  const out=[]; const now=new Date();
  for(let i=0;i<months;i++){
    const y=now.getFullYear(); const m=now.getMonth()+i;
    (schedules||[]).forEach(s=>{
      const dt=nthDowOfMonth(y,m,s.ordinal,s.day_of_week);
      if(!dt) return;
      const label=formatLabel(dt,s.start_time,s.end_time);
      out.push({date:dt,label});
    });
  }
  return out.sort((a,b)=>a.date-b.date);
}
function nthDowOfMonth(year, monthIndex, ordinal, dow){
  let count=0;
  for(let day=1; day<=31; day++){
    const dt=new Date(year,monthIndex,day);
    if(dt.getMonth()!==monthIndex) break;
    if(dt.getDay()===dow){ count++; if(count===ordinal) return dt; }
  }
  return null;
}
function formatLabel(dt,start,end){
  const d=dt.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
  let t=d; if(start) t+=` ${start}`; if(end) t+=`–${end}`; return t;
}

/* ------------------------------- GEOCODING ------------------------------- */
async function geocodeAddress(q){
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;
    const hit = data[0];
    const lat = parseFloat(hit.lat), lng = parseFloat(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, display_name: hit.display_name };
  } catch(e){
    console.warn("⚠️ geocode error:", e);
    return null;
  }
}
