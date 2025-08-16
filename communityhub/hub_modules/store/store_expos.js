// /communityhub/hub_modules/store/store_expos.js (v2 with Recurring or Specific Dates)
console.log("✅ store/store_expos.js v2 loaded");

export async function init(options = {}) {
  const supabase = window.supabase;
  const storeId = options?.store_id || null;
  if (!supabase || !storeId) {
    document.querySelector("#store-content")?.insertAdjacentHTML("afterbegin",
      `<div class="alert alert-danger">Missing Supabase client or store_id.</div>`);
    return;
  }

  const EXPO_BUCKET = (window && window.EXPO_BUCKET) ? window.EXPO_BUCKET : 'expo-images';

  const els = ensureUI();
  if (!els) return;

  // Resolve permissions (UI only; RLS later)
  let myRole = "viewer";
  try {
    const { data: storeRow } = await supabase.from("store_profiles")
      .select("id, owner_id, name").eq("id", storeId).maybeSingle();
    const ownerId = storeRow?.owner_id || null;
    const { data: auth } = await supabase.auth.getUser();
    const myId = auth?.user?.id || null;
    if (myId) {
      if (myId === ownerId) myRole = "owner";
      else {
        const { data: me } = await supabase.from("store_employees")
          .select("role").eq("store_id", storeId).eq("user_id", myId).maybeSingle();
        myRole = me?.role || "viewer";
      }
    }
  } catch (e) {
    console.warn("⚠️ role resolve failed", e);
  }
  const canManage = ["owner","manager","staff"].includes(myRole);
  if (!canManage) {
    els.status.textContent = "View only";
    els.search.disabled = true;
    els.clear.disabled = true;
    els.register.disabled = true;
  }

  // Wire events
  els.clear.addEventListener("click", () => { els.search.value = ""; renderHint(); });
  els.search.addEventListener("input", debounce(runSearch, 300));
  els.register.addEventListener("click", onOpenRegisterModal);

  renderHint();
  await loadCurrent();

  /* ----------------------------- functions ------------------------------ */
  function ensureUI(){
    let root = document.getElementById("store-expos");
    if (!root) {
      root = document.createElement("div");
      root.id = "store-expos";
      root.className = "card shadow-sm";
      root.innerHTML = `
        <div class="card-header d-flex align-items-center justify-content-between">
          <div class="fw-semibold">Expos you attend</div>
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-primary" id="se-register">Register a new expo</button>
            <div class="text-muted small" id="se-status"></div>
          </div>
        </div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label small mb-1">Find an expo</label>
              <div class="input-group">
                <input type="text" class="form-control" id="se-search" placeholder="Type at least 2 characters…">
                <button class="btn btn-outline-secondary" type="button" id="se-clear">Clear</button>
              </div>
              <div class="list-group mt-2" id="se-results"></div>
            </div>
            <div class="col-md-6">
              <label class="form-label small mb-1">Currently attending</label>
              <div class="list-group" id="se-current">
                <div class="list-group-item text-muted small">Nothing yet.</div>
              </div>
            </div>
          </div>
        </div>`;
      document.querySelector("#store-content")?.appendChild(root);
    }

    // Modal markup (with schedule mode)
    if (!document.getElementById("seModal")) {
      const modal = document.createElement("div");
      modal.innerHTML = `
      <div class="modal fade" id="seModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Register a New Expo</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div id="se-m-status" class="text-muted small mb-2"></div>
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label">Expo Name</label>
                  <input type="text" id="se-m-name" class="form-control" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Website (optional)</label>
                  <input type="url" id="se-m-website" class="form-control" placeholder="https://…">
                </div>
                <div class="col-12">
                  <label class="form-label">Description (optional)</label>
                  <textarea id="se-m-description" class="form-control" rows="2"></textarea>
                </div>

                <div class="col-md-6">
                  <label class="form-label">Venue Name</label>
                  <input type="text" id="se-m-venue" class="form-control">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Address</label>
                  <div class="input-group">
                    <input type="text" id="se-m-address" class="form-control" placeholder="Street, City, State ZIP">
                    <button class="btn btn-outline-secondary" type="button" id="se-m-verify">Verify</button>
                  </div>
                  <div class="form-text">We’ll validate and save lat/lng automatically.</div>
                </div>

                <input type="hidden" id="se-m-lat">
                <input type="hidden" id="se-m-lng">

                <div class="col-md-8">
                  <label class="form-label">Hero Image (optional)</label>
                  <input type="file" id="se-m-hero" class="form-control" accept="image/*">
                </div>

                <div class="col-12"><hr/></div>

                <div class="col-12">
                  <label class="form-label d-block">Schedule Type</label>
                  <div class="form-check form-check-inline">
                    <input class="form-check-input" type="radio" name="se-m-schedtype" id="se-m-recurring" value="recurring" checked>
                    <label class="form-check-label" for="se-m-recurring">Recurring (monthly)</label>
                  </div>
                  <div class="form-check form-check-inline">
                    <input class="form-check-input" type="radio" name="se-m-schedtype" id="se-m-specific" value="specific">
                    <label class="form-check-label" for="se-m-specific">Specific dates</label>
                  </div>
                </div>

                <!-- Recurring block -->
                <div class="col-12" id="se-m-recurring-block">
                  <div class="row g-3">
                    <div class="col-md-4">
                      <label class="form-label">Week</label>
                      <select id="se-m-ordinal" class="form-select">
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
                        <input class="form-check-input" type="checkbox" id="se-m-day-sat" value="6">
                        <label class="form-check-label" for="se-m-day-sat">Saturday</label>
                      </div>
                      <div class="form-check form-check-inline">
                        <input class="form-check-input" type="checkbox" id="se-m-day-sun" value="0">
                        <label class="form-check-label" for="se-m-day-sun">Sunday</label>
                      </div>
                    </div>
                    <div class="col-md-2">
                      <label class="form-label">Opens</label>
                      <input type="time" id="se-m-start" class="form-control" value="10:00">
                    </div>
                    <div class="col-md-2">
                      <label class="form-label">Closes</label>
                      <input type="time" id="se-m-end" class="form-control" value="16:00">
                    </div>
                    <div class="col-md-4">
                      <label class="form-label">Timezone</label>
                      <select id="se-m-tz" class="form-select">
                        <option value="America/New_York" selected>America/New_York</option>
                        <option value="America/Chicago">America/Chicago</option>
                        <option value="America/Denver">America/Denver</option>
                        <option value="America/Los_Angeles">America/Los_Angeles</option>
                      </select>
                    </div>
                    <div class="col-md-4">
                      <label class="form-label">Valid From</label>
                      <input type="date" id="se-m-valid-from" class="form-control">
                    </div>
                    <div class="col-md-4">
                      <label class="form-label">Valid To</label>
                      <input type="date" id="se-m-valid-to" class="form-control">
                    </div>
                  </div>
                </div>

                <!-- Specific dates block -->
                <div class="col-12 d-none" id="se-m-specific-block">
                  <div class="row g-3">
                    <div class="col-md-4">
                      <label class="form-label">Pick a date</label>
                      <div class="input-group">
                        <input type="date" id="se-m-date" class="form-control">
                        <button class="btn btn-outline-secondary" type="button" id="se-m-add-date">Add</button>
                      </div>
                    </div>
                    <div class="col-md-2">
                      <label class="form-label">Opens</label>
                      <input type="time" id="se-m-sd-start" class="form-control" value="10:00">
                    </div>
                    <div class="col-md-2">
                      <label class="form-label">Closes</label>
                      <input type="time" id="se-m-sd-end" class="form-control" value="16:00">
                    </div>
                    <div class="col-md-4">
                      <label class="form-label">Timezone</label>
                      <select id="se-m-sd-tz" class="form-select">
                        <option value="America/New_York" selected>America/New_York</option>
                        <option value="America/Chicago">America/Chicago</option>
                        <option value="America/Denver">America/Denver</option>
                        <option value="America/Los_Angeles">America/Los_Angeles</option>
                      </select>
                    </div>
                    <div class="col-12">
                      <div id="se-m-dates-list" class="list-group"></div>
                      <div class="form-text">Times apply to all selected dates above.</div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button id="se-m-submit" class="btn btn-primary">Submit Expo</button>
            </div>
          </div>
        </div>
      </div>`;
      document.body.appendChild(modal.firstElementChild);
    }

    const els = {
      root,
      status: root.querySelector("#se-status"),
      search: root.querySelector("#se-search"),
      clear: root.querySelector("#se-clear"),
      results: root.querySelector("#se-results"),
      current: root.querySelector("#se-current"),
      register: root.querySelector("#se-register"),
    };
    return els;
  }

  function getModalEls(){
    return {
      status: document.getElementById("se-m-status"),
      name: document.getElementById("se-m-name"),
      website: document.getElementById("se-m-website"),
      desc: document.getElementById("se-m-description"),
      venue: document.getElementById("se-m-venue"),
      address: document.getElementById("se-m-address"),
      lat: document.getElementById("se-m-lat"),
      lng: document.getElementById("se-m-lng"),
      hero: document.getElementById("se-m-hero"),
      // schedule type + blocks
      schedRecurring: document.getElementById("se-m-recurring"),
      schedSpecific: document.getElementById("se-m-specific"),
      recurringBlock: document.getElementById("se-m-recurring-block"),
      specificBlock: document.getElementById("se-m-specific-block"),
      // recurring controls
      ordinal: document.getElementById("se-m-ordinal"),
      daySat: document.getElementById("se-m-day-sat"),
      daySun: document.getElementById("se-m-day-sun"),
      start: document.getElementById("se-m-start"),
      end: document.getElementById("se-m-end"),
      tz: document.getElementById("se-m-tz"),
      validFrom: document.getElementById("se-m-valid-from"),
      validTo: document.getElementById("se-m-valid-to"),
      // specific controls
      date: document.getElementById("se-m-date"),
      addDate: document.getElementById("se-m-add-date"),
      sdStart: document.getElementById("se-m-sd-start"),
      sdEnd: document.getElementById("se-m-sd-end"),
      sdTz: document.getElementById("se-m-sd-tz"),
      datesList: document.getElementById("se-m-dates-list"),
      // actions
      submit: document.getElementById("se-m-submit"),
      verify: document.getElementById("se-m-verify"),
      modal: document.getElementById("seModal"),
    };
  }

  function onOpenRegisterModal(){
    const m = getModalEls();
    if (!m?.modal) return;
    m.status.textContent = "";
    m.name.value = "";
    m.website.value = "";
    m.desc.value = "";
    m.venue.value = "";
    m.address.value = "";
    m.lat.value = "";
    m.lng.value = "";
    if (m.hero) m.hero.value = "";
    // (re)init modal-scoped state
    m.modal._state = { dates: [] };
    // schedule defaults
    m.schedRecurring.checked = true;
    m.schedSpecific.checked = false;
    m.recurringBlock.classList.remove("d-none");
    m.specificBlock.classList.add("d-none");

    m.ordinal.value = "2";
    m.daySat.checked = false;
    m.daySun.checked = false;
    m.start.value = "10:00";
    m.end.value = "16:00";
    m.tz.value = "America/New_York";
    m.validFrom.value = "";
    m.validTo.value = "";
    m.date.value = "";
    m.sdStart.value = "10:00";
    m.sdEnd.value = "16:00";
    m.sdTz.value = "America/New_York";
    m.datesList.innerHTML = "";
    // state.dates lives on modal

    // Wire once
    // (re)bind verify each open
if (m.verify._handler) m.verify.removeEventListener("click", m.verify._handler);
m.verify._handler = async () => {
  const addr = (m.address.value || "").trim();
  if (!addr) return setMStatus("Enter an address to verify.", "error");
  setMStatus("Verifying address…");
  const geo = await geocodeAddress(addr);
  if (!geo) return setMStatus("Could not find that address.", "error");
  const city = geo.address?.city || geo.address?.town || geo.address?.village || geo.address?.hamlet || geo.address?.municipality || null;
  const state = inferStateCode(geo.address);
  m.lat.value = geo.lat.toFixed(6);
  m.lng.value = geo.lng.toFixed(6);
  setMStatus(`Address verified ✓${city||state?` (${city||""} ${state||""})`:""}`, "success");
};
m.verify.addEventListener("click", m.verify._handler);

    // Toggle schedule blocks
    // (re)bind schedule toggle each open
if (m._toggleRecurring) {
  m.schedRecurring.removeEventListener("change", m._toggleRecurring);
  m.schedSpecific.removeEventListener("change", m._toggleRecurring);
}
m._toggleRecurring = () => {
  if (m.schedSpecific.checked) {
    m.recurringBlock.classList.add("d-none");
    m.specificBlock.classList.remove("d-none");
  } else {
    m.recurringBlock.classList.remove("d-none");
    m.specificBlock.classList.add("d-none");
  }
};
m.schedRecurring.addEventListener("change", m._toggleRecurring);
m.schedSpecific.addEventListener("change", m._toggleRecurring);

    // Add dates
    // (re)bind add-date each open
if (m.addDate._handler) m.addDate.removeEventListener("click", m.addDate._handler);
m.addDate._handler = () => {
  const d = (m.date.value || "").trim();
  if (!d) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return alert("Invalid date");
  const arr = m.modal._state.dates;
  if (!arr.includes(d)) arr.push(d);
  renderDatesList(m);
};
m.addDate.addEventListener("click", m.addDate._handler);

    if (m.submit._handler) m.submit.removeEventListener("click", m.submit._handler);
m.submit._handler = () => onSubmitExpo(m);
m.submit.addEventListener("click", m.submit._handler);

    // Show
    if (window.bootstrap) {
      const md = bootstrap.Modal.getOrCreateInstance(m.modal);
      md.show();
    } else {
      m.modal.classList.add("show");
      m.modal.style.display = "block";
      m.modal.removeAttribute("aria-hidden");
    }
  }

  function renderDatesList(m){
    m.datesList.innerHTML = "";
    if (!(m.modal._state?.dates || []).length) {
      m.datesList.innerHTML = `<div class="list-group-item text-muted small">No dates added yet.</div>`;
      return;
    }
    (m.modal._state.dates).sort();
    m.modal._state.dates.forEach(d => {
      const li = document.createElement("div");
      li.className = "list-group-item d-flex align-items-center justify-content-between";
      li.innerHTML = `<div>${d}</div><button class="btn btn-sm btn-outline-danger" data-remove="${d}">Remove</button>`;
      m.datesList.appendChild(li);
    });
    m.datesList.querySelectorAll("[data-remove]")?.forEach(btn => {
      btn.addEventListener("click", () => {
        const d = btn.getAttribute("data-remove");
        m.modal._state.dates = m.modal._state.dates.filter(x => x !== d);
        renderDatesList(m);
      });
    });
  }

  async function onSubmitExpo(m){
    const name = (m.name.value || "").trim();
    if (!name) return setMStatus("Expo name is required", "error");

    // Geocode if needed
    if ((!m.lat.value || !m.lng.value) && m.address.value) {
      setMStatus("Finding location from address…");
      const geo = await geocodeAddress(m.address.value);
      if (!geo) return setMStatus("Could not resolve that address.", "error");
      m.lat.value = geo.lat.toFixed(6);
      m.lng.value = geo.lng.toFixed(6);
    }

    setMStatus("Submitting…");

    // Save expo
    const geoCityState = await reverseOrNull(m.lat.value, m.lng.value);
    const city = geoCityState?.city || null;
    const state = geoCityState?.state || null;

    const expoPayload = {
      name,
      website: (m.website.value || null),
      description: (m.desc.value || null),
      venue_name: (m.venue.value || null),
      address: (m.address.value || null),
      city,
      state,
      lat: m.lat.value ? parseFloat(m.lat.value) : null,
      lng: m.lng.value ? parseFloat(m.lng.value) : null,
      approved: false,
    };

    const { data: ins, error: insErr } = await supabase.from("expos").insert(expoPayload).select("id").single();
    if (insErr || !ins?.id) { console.error("❌ expo insert failed:", insErr); return setMStatus("Create failed", "error"); }
    const expoId = ins.id;

    // Upload hero
    const file = m.hero?.files?.[0];
    if (file) {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
      const path = `expos/${expoId}/hero.${ext}`;
      const { error: upErr } = await supabase.storage.from(EXPO_BUCKET).upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (upErr) { console.warn("⚠️ hero upload failed:", upErr); }
      else {
        const { data: pub } = await supabase.storage.from(EXPO_BUCKET).getPublicUrl(path);
        const url = pub?.publicUrl || null;
        if (url) await supabase.from("expos").update({ hero_image: url }).eq("id", expoId);
      }
    }

    // Branch: recurring vs specific
    if (document.getElementById("se-m-specific").checked) {
      // Specific dates → insert many into expo_calendar_dates
      const dates = (m.modal._state && Array.isArray(m.modal._state.dates)) ? m.modal._state.dates : [];
      if (!dates.length) return setMStatus("Add at least one date.", "error");

      const rows = dates.map(d => ({
        expo_id: expoId,
        event_date: d,
        start_time: m.sdStart.value || "10:00",
        end_time: m.sdEnd.value || "16:00",
        timezone: m.sdTz.value || "America/New_York"
      }));
      const { error: dErr } = await supabase.from("expo_calendar_dates").insert(rows);
      if (dErr) { console.warn("⚠️ date insert failed:", dErr); }
    } else {
      // Recurring monthly → insert schedule rows with valid_from/valid_to
      const days = [];
      if (m.daySat.checked) days.push(6);
      if (m.daySun.checked) days.push(0);
      if (!days.length) return setMStatus("Pick Saturday and/or Sunday", "error");

      const ordinal = parseInt(m.ordinal.value || "2", 10);
      const rows = days.map(d => ({
        expo_id: expoId,
        ordinal,
        day_of_week: d,
        start_time: m.start.value || "10:00",
        end_time: m.end.value || "16:00",
        timezone: m.tz.value || "America/New_York",
        active: true,
        valid_from: m.validFrom.value || null,
        valid_to: m.validTo.value || null
      }));
      const { error: schedErr } = await supabase.from("expo_schedules").insert(rows);
      if (schedErr) console.warn("⚠️ schedule insert failed:", schedErr);
    }

    // Link store immediately (active)
    const { error: linkErr } = await supabase.from("store_expos").upsert({ store_id: storeId, expo_id: expoId, active: true }, { onConflict: "store_id,expo_id" });
    if (linkErr) console.warn("⚠️ link store→expo failed:", linkErr);

    setMStatus("Submitted! Pending approval.", "success");
    setTimeout(() => {
      if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(m.modal).hide();
      else { m.modal.classList.remove("show"); m.modal.style.display = "none"; m.modal.setAttribute("aria-hidden","true"); }
      loadCurrent();
      renderHint();
    }, 700);
  }

  async function loadCurrent(){
    setStatus("Loading…");
    const { data, error } = await supabase
      .from("store_expos")
      .select("expo_id, booth, note, active, expos:expo_id (id, name, city, state, venue_name, hero_image)")
      .eq("store_id", storeId)
      .eq("active", true)
      .order("expo_id");
    if (error) {
      console.error("❌ current expos load failed:", error);
      setStatus("Load failed");
      return;
    }
    renderCurrent(data || []);
    setStatus("");
  }

  function renderCurrent(rows){
    els.current.innerHTML = "";
    if (!rows.length) {
      els.current.innerHTML = `<div class="list-group-item text-muted small">Nothing yet.</div>`;
      return;
    }
    rows.forEach(r => {
      const e = r.expos || {};
      const hero = e.hero_image || "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
      const item = document.createElement("div");
      item.className = "list-group-item d-flex align-items-center justify-content-between gap-2";
      item.innerHTML = `
        <div class="d-flex align-items-center gap-2">
          <img src="${safe(hero)}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;outline:1px solid rgba(0,0,0,0.08)">
          <div>
            <div class="fw-semibold small">${safe(e.name || "Expo")}</div>
            <div class="text-muted small">${safe(e.city || "")} ${safe(e.state || "")}</div>
          </div>
        </div>
        <div class="d-flex align-items-center gap-2">
          <button class="btn btn-sm btn-outline-danger" data-remove="${e.id}">Remove</button>
        </div>`;
      els.current.appendChild(item);
    });
    els.current.querySelectorAll("[data-remove]")?.forEach(btn => {
      btn.addEventListener("click", async () => {
        const expoId = btn.getAttribute("data-remove");
        if (!expoId) return;
        if (!confirm("Remove this expo from your store?")) return;
        await removeAttendance(expoId);
      });
    });
  }

  function renderHint(){
    els.results.innerHTML = `<div class="list-group-item text-muted small">Type at least 2 characters to search…</div>`;
  }

  async function runSearch(){
    const q = (els.search.value || "").trim();
    if (q.length < 2) return renderHint();
    els.results.innerHTML = `<div class="list-group-item small text-muted">Searching…</div>`;
    const like = `%${q.replace(/[%_]/g, m => "\\"+m)}%`;
    const { data, error } = await supabase
      .from("expos")
      .select("id, name, city, state, venue_name, hero_image, approved")
      .eq("approved", true)
      .or([
        `name.ilike.${like}`,
        `city.ilike.${like}`,
        `state.ilike.${like}`,
        `venue_name.ilike.${like}`
      ].join(","))
      .order("name");
    if (error) {
      console.error("❌ search expos failed:", error);
      els.results.innerHTML = `<div class="list-group-item text-danger small">Search failed.</div>`;
      return;
    }
    if (!data?.length) {
      els.results.innerHTML = `<div class="list-group-item small text-muted">No results.</div>`;
      return;
    }
    els.results.innerHTML = data.map(e => {
      const hero = e.hero_image || "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
      return `<div class="list-group-item d-flex align-items-center justify-content-between">
        <div class="d-flex align-items-center gap-2">
          <img src="${safe(hero)}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;outline:1px solid rgba(0,0,0,0.08)">
          <div>
            <div class="fw-semibold small">${safe(e.name || "Expo")}</div>
            <div class="text-muted small">${safe(e.city || "")} ${safe(e.state || "")}${e.venue_name?` • ${safe(e.venue_name)}`:""}</div>
          </div>
        </div>
        <button class="btn btn-sm btn-primary" data-add="${e.id}">Add</button>
      </div>`;
    }).join("");

    els.results.querySelectorAll("[data-add]")?.forEach(btn => {
      btn.addEventListener("click", () => addAttendance(btn.getAttribute("data-add")));
    });
  }

  async function addAttendance(expoId){
    if (!expoId) return;
    setStatus("Saving…");
    const row = { store_id: storeId, expo_id: expoId, active: true };
    const { error } = await supabase.from("store_expos").upsert(row, { onConflict: "store_id,expo_id" });
    if (error) {
      console.error("❌ add attendance failed:", error);
      setStatus("Save failed");
      alert("Failed to add expo.");
      return;
    }
    setStatus("Saved ✓");
    await loadCurrent();
  }

  async function removeAttendance(expoId){
    setStatus("Removing…");
    const { error } = await supabase.from("store_expos")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("store_id", storeId).eq("expo_id", expoId);
    if (error) {
      console.error("❌ remove attendance failed:", error);
      setStatus("Remove failed");
      alert("Failed to remove expo.");
      return;
    }
    setStatus("Removed ✓");
    await loadCurrent();
  }

  function setStatus(msg){ if (els.status) els.status.textContent = msg || ""; }
  function setMStatus(msg, type){
    const el = document.getElementById("se-m-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "small " + (type==="error" ? "text-danger" : type==="success" ? "text-success" : "text-muted");
  }
  function safe(s){ return String(s || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function debounce(fn, ms){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); }; }

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
}
