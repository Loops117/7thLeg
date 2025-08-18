
console.log("✅ userspecies.js loaded (filters fixed + All button + vertical toggle)");

let inventoryData = [];
let __openAddDebounceAt = 0;

// View/filter state
const INV_STATE = {
  view: 'table',        // 'table' | 'cards'
  search: '',
  sort: 'species_az',
  disabledTypes: new Set(), // types hidden; empty = show all
  groupByType: false
};

export async function init() {
  console.log("📌 initUserspecies called");
  setupControls();
  await loadInventory();
}

/* ---------------- CONTROLS ---------------- */
function setupControls(){
  const toggleTable = document.getElementById('inv-toggle-table');
  const toggleCards = document.getElementById('inv-toggle-cards');
  const search = document.getElementById('inventory-search');
  const sort = document.getElementById('inventory-sort');
  const group = document.getElementById('group-by-type');

  toggleTable?.addEventListener('click', () => {
    INV_STATE.view = 'table';
    toggleTable.classList.add('active');
    toggleCards?.classList.remove('active');
    document.getElementById('inventory-table-container')?.classList.remove('d-none');
    document.getElementById('inventory-cards-container')?.classList.add('d-none');
    renderCurrent();
  });
  toggleCards?.addEventListener('click', () => {
    INV_STATE.view = 'cards';
    toggleCards.classList.add('active');
    toggleTable?.classList.remove('active');
    document.getElementById('inventory-table-container')?.classList.add('d-none');
    document.getElementById('inventory-cards-container')?.classList.remove('d-none');
    renderCurrent();
  });
  search?.addEventListener('input', (e) => { INV_STATE.search = (e.target.value||'').toLowerCase(); renderCurrent(); });
  sort?.addEventListener('change', (e) => { INV_STATE.sort = e.target.value; renderCurrent(); });
  group?.addEventListener('change', (e) => { INV_STATE.groupByType = !!e.target.checked; renderCurrent(); });
}

function rebuildTypeChips(){
  const host = document.getElementById('type-filters');
  const btnAll = document.getElementById('type-chip-all');
  if (!host) return;

  const types = Array.from(new Set(inventoryData.map(i => (i.insect_type || '').trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b));

  host.innerHTML = types.map(t => {
    const enabled = !INV_STATE.disabledTypes.has(t);
    const cls = enabled ? 'enabled' : 'disabled';
    return `<button type="button" class="type-chip ${cls}" data-type="${escapeHtml(t)}">${escapeHtml(t)}</button>`;
  }).join('');

  if (btnAll){
    btnAll.classList.toggle('active', INV_STATE.disabledTypes.size === 0);
    btnAll.onclick = () => {
      INV_STATE.disabledTypes.clear();
      rebuildTypeChips();
      renderCurrent();
    };
  }

  host.querySelectorAll('.type-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.getAttribute('data-type');
      if (INV_STATE.disabledTypes.has(t)) {
        INV_STATE.disabledTypes.delete(t);  // enable back
      } else {
        INV_STATE.disabledTypes.add(t);     // disable
      }
      rebuildTypeChips();
      renderCurrent();
    });
  });
}

/* ---------------- LOAD + RENDER ---------------- */
async function loadInventory() {
  const { data: { user } } = await supabase.auth.getUser();
  const tableC = document.getElementById('inventory-table-container');
  const cardsC = document.getElementById('inventory-cards-container');
  const alerts = document.getElementById('import-errors');
  alerts && (alerts.innerHTML = "");

  if (!user) {
    tableC && (tableC.innerHTML = "<p class='text-danger'>Not logged in.</p>");
    cardsC && (cardsC.innerHTML = "");
    return;
  }

  const { data: inventories, error } = await supabase
    .from("user_inventories")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("loadInventory error", error);
    tableC && (tableC.innerHTML = "<p class='text-danger'>Failed to load inventory.</p>");
    cardsC && (cardsC.innerHTML = "");
    return;
  }

  if (!inventories || inventories.length === 0) {
    tableC && (tableC.innerHTML = "<p>No species in your inventory yet.</p>");
    cardsC && (cardsC.innerHTML = "");
    return;
  }

  inventoryData = inventories.slice();

  rebuildTypeChips();
  try { renderDuplicateDetector(inventoryData, user.id); } catch (e) { console.warn("dup detector UI err", e); }

  renderCurrent();
}

function filteredSortedRows(){
  let rows = inventoryData.slice();

  // include only enabled types
  if (INV_STATE.disabledTypes.size > 0){
    rows = rows.filter(r => !INV_STATE.disabledTypes.has((r.insect_type || '').trim()));
  }

  // search
  if (INV_STATE.search){
    const q = INV_STATE.search;
    rows = rows.filter(r => {
      const text = `${r.species||''} ${r.morph_name||''} ${r.insect_type||''}`.toLowerCase();
      return text.includes(q);
    });
  }
  // sort
  const cmp = {
    species_az: (a,b)=> (a.species||'').localeCompare(b.species||'','en',{sensitivity:'base'}),
    species_za: (a,b)=> (b.species||'').localeCompare(a.species||'','en',{sensitivity:'base'}),
    morph_az:   (a,b)=> (a.morph_name||'').localeCompare(b.morph_name||'','en',{sensitivity:'base'}),
    type_az:    (a,b)=> (a.insect_type||'').localeCompare(b.insect_type||'','en',{sensitivity:'base'}),
    created_new:(a,b)=> new Date(b.created_at) - new Date(a.created_at),
    created_old:(a,b)=> new Date(a.created_at) - new Date(b.created_at),
  }[INV_STATE.sort] || ((a,b)=>0);
  rows.sort(cmp);

  return rows;
}

function renderCurrent(){
  const rows = filteredSortedRows();
  if (INV_STATE.view === 'table') renderTable(rows);
  else renderCards(rows);
}

function renderTable(rows){
  const host = document.getElementById('inventory-table-container');
  if (!host) return;
  if (!rows.length){ host.innerHTML = "<p>No results.</p>"; return; }

  if (INV_STATE.groupByType){
    const buckets = {};
    for (const r of rows){
      const t = (r.insect_type || '—').trim();
      (buckets[t] ||= []).push(r);
    }
    let html = `<div class="table-responsive" style="max-height: 70vh; overflow-y:auto">`;
    html += `<table class="table table-bordered table-hover align-middle text-nowrap"><thead class="table-light sticky-top"><tr>
      <th style="width:20px;">Actions</th><th>Species</th><th>Morph</th><th>Type</th><th style="width:50px;">Image</th></tr></thead><tbody>`;
    for (const t of Object.keys(buckets).sort((a,b)=>a.localeCompare(b))){
      html += `<tr class="type-header"><td colspan="5"><strong>${escapeHtml(t)}</strong> <span class="text-muted">(${buckets[t].length})</span></td></tr>`;
      for (const i of buckets[t]) html += rowHtml(i);
    }
    html += `</tbody></table></div>`;
    host.innerHTML = html;
  } else {
    let html = `<div class="table-responsive" style="max-height: 70vh; overflow-y:auto">`;
    html += `<table class="table table-bordered table-hover align-middle text-nowrap"><thead class="table-light sticky-top"><tr>
      <th style="width:20px;">Actions</th><th>Species</th><th>Morph</th><th>Type</th><th style="width:50px;">Image</th></tr></thead><tbody>`;
    for (const i of rows) html += rowHtml(i);
    html += `</tbody></table></div>`;
    host.innerHTML = html;
  }

  document.querySelectorAll("#inventory-table-container .inventory-row").forEach(row => {
    row.addEventListener("click", () => {
      document.querySelectorAll("#inventory-table-container .inventory-row").forEach(r => r.classList.remove("selected"));
      row.classList.add("selected");
    });
  });
}

function rowHtml(i){
  const imgTag = i.cover_image
      ? `<img src="${i.cover_image}" alt="${escapeHtml(i.species || "")}" style="height:30px; width:auto;">`
      : placeholderIcon(30);
  return `<tr class="inventory-row" id="row-${i.id}" data-inventory-id="${i.id}">
    <td>
      <button class="btn btn-sm btn-info me-1" onclick="openViewSpecies('${i.id}')">View</button>
      <button class="btn btn-sm btn-primary me-1" onclick="openEditSpecies('${i.id}')">Edit</button>
      <button class="btn btn-sm btn-danger" onclick="deleteSpecies('${i.id}', '${escapeHtml(i.species)}')">Delete</button>
    </td>
    <td><i>${escapeHtml(i.species || "")}</i></td>
    <td><i>${escapeHtml(i.morph_name || "")}</i></td>
    <td>${escapeHtml(i.insect_type || "")}</td>
    <td>${imgTag}</td>
  </tr>`;
}

function renderCards(rows){
  const host = document.getElementById('inventory-cards-container');
  if (!host) return;

  const byType = new Map();
  for (const r of rows){
    const t = (r.insect_type || '—').trim();
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(r);
  }
  if (byType.size === 0){ host.innerHTML = "<p>No results.</p>"; return; }

  let html = `<div class="row g-3">`;
  for (const [t, items] of Array.from(byType.entries()).sort((a,b)=>a[0].localeCompare(b[0]))){
    const list = items.slice(0, 6).map(i => {
      const img = i.cover_image ? `<img src="${i.cover_image}" alt="">` : placeholderIcon(36);
      const label = `<div class="ms-2 small"><div class="fw-semibold">${escapeHtml(i.species||'')}</div><div class="text-muted">${escapeHtml(i.morph_name||'')}</div></div>`;
      return `<div class="d-flex align-items-center mb-2">${img}${label}</div>`;
    }).join('');

    html += `<div class="col-12 col-sm-6 col-md-4 col-lg-3">
      <div class="card inv-card border-0 shadow-sm h-100">
        <div class="card-body">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <strong>${escapeHtml(t)}</strong>
            <span class="badge bg-light text-dark border">${items.length}</span>
          </div>
          ${list || `<div class="text-muted small">No items</div>`}
        </div>
      </div>
    </div>`;
  }
  html += `</div>`;
  host.innerHTML = html;
}

/* ---------------- DUPLICATE DETECTOR ---------------- */
function canonicalKey(row){
  return [
    row.user_id || "",
    (row.species || "").trim().toLowerCase(),
    (row.morph_name || "").trim().toLowerCase(),
    (row.insect_type || "").trim().toLowerCase()
  ].join("|");
}
function findRecentDuplicates(rows){
  const byKey = new Map();
  for (const r of rows){
    const key = canonicalKey(r);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  }
  const dups = [];
  for (const [key, arr] of byKey){
    if (arr.length <= 1) continue;
    arr.sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));
    const base = arr[0];
    const tooClose = arr.slice(1).filter(r => Math.abs(new Date(r.created_at) - new Date(base.created_at)) < 15000);
    if (tooClose.length){
      dups.push({ key, keep: base, remove: tooClose });
    }
  }
  return dups;
}
function renderDuplicateDetector(rows, currentUserId){
  const host = document.getElementById("import-errors");
  if (!host) return;
  const dups = findRecentDuplicates(rows).filter(d => d.keep.user_id === currentUserId);
  if (!dups.length) { host.innerHTML = ""; return; }
  const totalRemove = dups.reduce((n, d) => n + d.remove.length, 0);
  host.innerHTML = `
    <div class="alert alert-warning d-flex align-items-start gap-2" role="alert">
      <div>Detected <strong>${dups.length}</strong> duplicate group${dups.length>1?"s":""} (<strong>${totalRemove}</strong> extra record${totalRemove>1?"s":""}) just created.</div>
      <div class="ms-auto d-flex gap-2">
        <button id="fix-dups-btn" class="btn btn-sm btn-outline-danger">Fix duplicates</button>
        <button id="dismiss-dups-btn" class="btn btn-sm btn-outline-secondary">Dismiss</button>
      </div>
    </div>
  `;
  document.getElementById("dismiss-dups-btn")?.addEventListener("click", () => host.innerHTML = "");
  document.getElementById("fix-dups-btn")?.addEventListener("click", async () => {
    await fixDuplicates(dups, currentUserId);
  });
}
async function fixDuplicates(dups, currentUserId){
  const idsToDelete = [];
  for (const d of dups){
    for (const r of d.remove) if (r.user_id === currentUserId) idsToDelete.push(r.id);
  }
  if (!idsToDelete.length) return;

  let ok = 0, fail = 0;
  const errors = [];

  for (const id of idsToDelete){
    const { error } = await supabase.from("user_inventories").delete().eq("id", id);
    if (error){
      fail++; errors.push({ id, error });
      console.warn("dedupe delete error", id, error);
      if (String(error.code) === '23503'){
        pushAlert(`Can't remove an item because it's linked to a store listing. Delete the store listing first. (id: ${id})`, "danger");
      }
    } else ok++;
  }
  if (ok) pushAlert(`Removed ${ok} duplicate record${ok>1?"s":""}.`, "success");
  if (fail && !errors.some(e => String(e.error.code) === '23503')){
    pushAlert(`Some duplicates could not be removed. See console for details.`, "warning");
  }
  await loadInventory();
}

function pushAlert(msg, kind="info"){
  const host = document.getElementById("import-errors");
  if (!host) return alert(msg);
  const div = document.createElement("div");
  div.className = `alert alert-${kind}`;
  div.textContent = msg;
  host.appendChild(div);
  setTimeout(()=>div.remove(), 7000);
}

/* ---------------- ACTIONS ---------------- */
window.openViewSpecies = function (id) {
  loadModule('species_modules/view.hubspecies', null, { id });
};

window.openEditSpecies = (function(){
  let busy = false;
  return function (id) {
    const now = Date.now();
    if (now - __openAddDebounceAt < 700) {
      console.log("⏳ ignoring rapid re-open");
      return;
    }
    __openAddDebounceAt = now;
    if (busy) { console.log("⏳ editor already opening"); return; }
    busy = true;
    try {
      loadModule('species_modules/edit.hubspecies', null, { id });
    } finally {
      setTimeout(()=>{ busy = false; }, 1200);
    }
  };
})();

window.openAddSpecies = function () {
  if (window.__addSpeciesOpening) return;
  window.__addSpeciesOpening = true;
  try {
    openEditSpecies(null);
  } finally {
    setTimeout(()=>{ window.__addSpeciesOpening = false; }, 1200);
  }
};

window.deleteSpecies = async function(id, speciesText){
  if (!confirm(`Delete ${speciesText || "this item"}?`)) return;
  const { error } = await supabase.from("user_inventories").delete().eq("id", id);
  if (error) {
    console.warn("deleteSpecies error", error);
    if (String(error.code) === '23503'){
      pushAlert("This inventory item is linked to a store listing. Delete the store item first.", "danger");
    } else {
      pushAlert("Failed to delete item.", "warning");
    }
    return;
  }
  pushAlert("Item deleted.", "success");
  await loadInventory();
};

/* ---------------- UTILS ---------------- */
function escapeHtml(str){
  return String(str||"").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function placeholderIcon(size=30){
  const s = Math.max(10, size|0);
  const svg = encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}' viewBox='0 0 24 24'>
      <rect width='24' height='24' fill='#f1f3f5' rx='4'/>
      <path d='M6 17l3-4 3 3 2-2 4 5H6z' fill='#ced4da'/>
      <circle cx='9' cy='8' r='2' fill='#ced4da'/>
    </svg>`).replace(/\s+/g, " ");
  return `<img src="data:image/svg+xml;utf8,${svg}" alt="-" style="height:${s}px;width:${s}px;">`;
}
