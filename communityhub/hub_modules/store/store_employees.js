// /communityhub/hub_modules/store/store_employees.js
console.log("✅ store/store_employees.js loaded");

export async function init(options = {}) {
  const supabase = window.supabase;
  const storeId = options?.store_id || null;
  if (!supabase || !storeId) {
    document.querySelector("#store-content")?.insertAdjacentHTML("afterbegin",
      `<div class="alert alert-danger">Missing Supabase client or store_id.</div>`);
    return;
  }

  const els = {
    status: document.getElementById("employees-status"),
    search: document.getElementById("emp-search"),
    searchBtn: document.getElementById("emp-search-btn"),
    clearBtn: document.getElementById("emp-clear-btn"),
    results: document.getElementById("emp-search-results"),
    teamBody: document.getElementById("team-tbody")
  };

  const setStatus = (msg) => { if (els.status) els.status.textContent = msg || ""; };

  // cache
  let owner = null;            // { id, name, location }
  let employees = [];          // [{ user_id, role, added_at, profile: { id, full_name, location } }]
  let teamIds = new Set();     // owner + employee ids (for filtering search)

  // Load initial data
  await loadTeam();

  // Wire search
  const runSearch = debounce(async () => {
    const q = (els.search.value || "").trim();
    if (!q || q.length < 2) { els.results.innerHTML = ""; return; }
    els.results.innerHTML = `<div class="text-muted small">Searching…</div>`;

    // Search by full_name OR location (only columns available on public.profiles)
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, location")
      .or(`full_name.ilike.%${escapeLike(q)}%,location.ilike.%${escapeLike(q)}%`)
      .order("full_name", { ascending: true })
      .limit(25);

    if (error) {
      console.error("❌ profile search failed:", error);
      els.results.innerHTML = `<div class="text-danger small">Search failed</div>`;
      return;
    }

    // Filter out users already in the team (owner or employees)
    const filtered = (data || []).filter(p => !teamIds.has(p.id));

    els.results.innerHTML = filtered.length
      ? (`<div class="list-group">
            ${filtered.map(renderSearchItem).join("")}
          </div>`)
      : `<div class="text-muted small">No results.</div>`;

    // Bind add buttons
    els.results.querySelectorAll("[data-add]")?.forEach(btn => {
      btn.addEventListener("click", () => addEmployee(btn.dataset.userId, btn.dataset.userName));
    });
  }, 350);

  els.search?.addEventListener("input", runSearch);
  els.searchBtn?.addEventListener("click", runSearch);
  els.clearBtn?.addEventListener("click", () => {
    els.search.value = "";
    els.results.innerHTML = "";
  });

  // Helpers
  function renderSearchItem(p) {
    const name = p.full_name || p.id?.slice(0, 8) || "Unnamed";
    const loc = p.location || "";
    return `<button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" data-add data-user-id="${p.id}" data-user-name="${escapeHtml(name)}">
      <div>
        <div>${escapeHtml(name)}</div>
        <small class="text-muted">${escapeHtml(loc)}</small>
      </div>
      <span class="btn btn-sm btn-primary">Add</span>
    </button>`;
  }

  function renderTeamTable() {
    teamIds = new Set();
    if (owner?.id) teamIds.add(owner.id);
    employees.forEach(e => teamIds.add(e.user_id));

    // Rows
    const ownerRow = owner ? `
      <tr>
        <td title="Owner">👑</td>
        <td>${escapeHtml(owner.name || "")}</td>
        <td>${escapeHtml(owner.location || "")}</td>
        <td><span class="badge text-bg-secondary">owner</span></td>
        <td>—</td>
        <td></td>
      </tr>` : "";

    const empRows = employees.length ? employees.map(e => {
      const p = e.profile || {};
      const name = p.full_name || (p.id ? p.id.slice(0,8) : "User");
      const loc = p.location || "";
      const added = e.added_at ? new Date(e.added_at).toLocaleDateString() : "";
      const role = e.role || "staff";
      const uid = e.user_id;
      return `
        <tr data-uid="${uid}">
          <td>👤</td>
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(loc)}</td>
          <td>
            <select class="form-select form-select-sm" data-role>
              <option value="manager"${role === "manager" ? " selected" : ""}>manager</option>
              <option value="staff"${role === "staff" ? " selected" : ""}>staff</option>
            </select>
          </td>
          <td><small class="text-muted">${escapeHtml(added)}</small></td>
          <td>
            <button class="btn btn-sm btn-outline-danger" data-remove title="Remove"><i class="bi bi-trash"></i> Remove</button>
          </td>
        </tr>`;
    }).join("") : `<tr><td colspan="6" class="text-muted">No employees yet.</td></tr>`;

    els.teamBody.innerHTML = (ownerRow + empRows) || `<tr><td colspan="6" class="text-muted">No data.</td></tr>`;

    // Bind role change + remove
    els.teamBody.querySelectorAll("tr[data-uid]")?.forEach(tr => {
      const uid = tr.getAttribute("data-uid");
      tr.querySelector("[data-role]")?.addEventListener("change", (e) => saveRole(uid, e.target.value));
      tr.querySelector("[data-remove]")?.addEventListener("click", () => removeEmployee(uid));
    });
  }

  async function loadTeam() {
    setStatus("Loading team…");
    // Load store owner
    const { data: storeRow, error: storeErr } = await supabase
      .from("store_profiles")
      .select("id, owner_id, name")
      .eq("id", storeId)
      .maybeSingle();

    if (storeErr || !storeRow) {
      console.error("❌ failed to load store:", storeErr || "not found");
      setStatus("Failed to load store");
      return;
    }

    // Owner profile
    let ownerProfile = null;
    if (storeRow.owner_id) {
      const { data: op } = await supabase
        .from("profiles")
        .select("id, full_name, location")
        .eq("id", storeRow.owner_id)
        .maybeSingle();
      ownerProfile = op || { id: storeRow.owner_id, full_name: "Owner" };
    }
    owner = {
      id: ownerProfile?.id,
      name: ownerProfile?.full_name || (ownerProfile?.id ? ownerProfile.id.slice(0,8) : "Owner"),
      location: ownerProfile?.location || ""
    };

    // Employees for this store
    const { data: empRows, error: empErr } = await supabase
      .from("store_employees")
      .select("user_id, role, added_at")
      .eq("store_id", storeId)
      .order("added_at", { ascending: false });

    if (empErr) {
      console.error("❌ failed to load employees:", empErr);
      setStatus("Failed to load team");
      return;
    }

    // Fetch their profiles
    const ids = [...new Set((empRows || []).map(e => e.user_id).filter(Boolean))];
    let profilesMap = {};
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, location")
        .in("id", ids);
      profilesMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
    }

    employees = (empRows || []).map(e => ({
      ...e,
      profile: profilesMap[e.user_id] || { id: e.user_id }
    }));

    renderTeamTable();
    setStatus("");
  }

  async function addEmployee(userId, userName) {
    if (!userId) return;
    setStatus(`Adding ${userName || "user"}…`);

    // Default role: staff
    const { error } = await supabase
      .from("store_employees")
      .insert({ store_id: storeId, user_id: userId, role: "staff" });
    if (error) {
      console.error("❌ add employee failed:", error);
      setStatus("Add failed");
      alert("Failed to add employee. Check console for details.");
      return;
    }
    els.search.value = "";
    els.results.innerHTML = "";
    await loadTeam();
    setStatus(`Added ${userName || "user"} ✓`);
    setTimeout(() => setStatus(""), 1200);
  }

  async function saveRole(userId, role) {
    if (!userId) return;
    setStatus("Saving role…");
    const { error } = await supabase
      .from("store_employees")
      .update({ role })
      .eq("store_id", storeId)
      .eq("user_id", userId);
    if (error) {
      console.error("❌ update role failed:", error);
      setStatus("Save failed");
      alert("Failed to update role.");
      return;
    }
    setStatus("Saved ✓");
    setTimeout(() => setStatus(""), 1000);
  }

  async function removeEmployee(userId) {
    if (!userId) return;
    const row = employees.find(e => e.user_id === userId);
    const name = row?.profile?.full_name || userId.slice(0,8);
    if (!confirm(`Remove ${name} from your store?`)) return;

    setStatus("Removing…");
    const { error } = await supabase
      .from("store_employees")
      .delete()
      .eq("store_id", storeId)
      .eq("user_id", userId);
    if (error) {
      console.error("❌ remove failed:", error);
      setStatus("Remove failed");
      alert("Failed to remove employee.");
      return;
    }
    await loadTeam();
    setStatus("Removed ✓");
    setTimeout(() => setStatus(""), 1000);
  }

  // utils
  function escapeLike(s){ return String(s || "").replace(/[%_]/g, m => "\\" + m); }
  function escapeHtml(s){ return String(s || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function debounce(fn, ms){
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null,args), ms); };
  }
}
