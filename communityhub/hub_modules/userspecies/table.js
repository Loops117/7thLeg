
import { escapeHtml, placeholderIcon, pushAlert, wireCommonActions } from './shared.js';

let inventoryData = [];
const INV_STATE = { search: '', sort: 'species_az', disabledTypes: new Set(), groupByType: false };

export async function init(){
  wireCommonActions();
  setupControls();
  await loadInventory();
  window.__reloadInventory = loadInventory;
}

function setupControls(){
  const search = document.getElementById('inventory-search');
  const sort = document.getElementById('inventory-sort');
  const group = document.getElementById('group-by-type');
  search?.addEventListener('input', (e) => { INV_STATE.search = (e.target.value||'').toLowerCase(); render(); });
  sort?.addEventListener('change', (e) => { INV_STATE.sort = e.target.value; render(); });
  group?.addEventListener('change', (e) => { INV_STATE.groupByType = !!e.target.checked; render(); });
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
    btnAll.onclick = () => { INV_STATE.disabledTypes.clear(); rebuildTypeChips(); render(); };
  }
  host.querySelectorAll('.type-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.getAttribute('data-type');
      if (INV_STATE.disabledTypes.has(t)) INV_STATE.disabledTypes.delete(t);
      else INV_STATE.disabledTypes.add(t);
      rebuildTypeChips(); render();
    });
  });
}

async function loadInventory(){
  const { data: { user } } = await supabase.auth.getUser();
  const tableC = document.getElementById('inventory-table-container');
  const alerts = document.getElementById('import-errors');
  alerts && (alerts.innerHTML = '');
  if (!user){ tableC && (tableC.innerHTML = "<p class='text-danger'>Not logged in.</p>"); return; }
  const { data: inventories, error } = await supabase.from('user_inventories').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error){ console.warn('loadInventory error', error); tableC && (tableC.innerHTML = "<p class='text-danger'>Failed to load inventory.</p>"); return; }
  if (!inventories || inventories.length === 0){ tableC && (tableC.innerHTML = "<p>No species in your inventory yet.</p>"); return; }
  inventoryData = inventories.slice();
  rebuildTypeChips();
  render();
}

function filteredSortedRows(){
  let rows = inventoryData.slice();
  if (INV_STATE.disabledTypes.size > 0){
    rows = rows.filter(r => !INV_STATE.disabledTypes.has((r.insect_type || '').trim()));
  }
  if (INV_STATE.search){
    const q = INV_STATE.search;
    rows = rows.filter(r => (`${r.species||''} ${r.morph_name||''} ${r.insect_type||''}`.toLowerCase()).includes(q));
  }
  const cmp = {
    species_az:(a,b)=> (a.species||'').localeCompare(b.species||'','en',{sensitivity:'base'}),
    species_za:(a,b)=> (b.species||'').localeCompare(a.species||'','en',{sensitivity:'base'}),
    morph_az:(a,b)=> (a.morph_name||'').localeCompare(b.morph_name||'','en',{sensitivity:'base'}),
    type_az:(a,b)=> (a.insect_type||'').localeCompare(b.insect_type||'','en',{sensitivity:'base'}),
    created_new:(a,b)=> new Date(b.created_at) - new Date(a.created_at),
    created_old:(a,b)=> new Date(a.created_at) - new Date(b.created_at),
  }[INV_STATE.sort] || ((a,b)=>0);
  rows.sort(cmp);
  return rows;
}

function render(){
  const rows = filteredSortedRows();
  renderTable(rows);
}

function rowHtml(i){
  const imgTag = i.cover_image ? `<img src="${i.cover_image}" alt="${escapeHtml(i.species || '')}" style="height:30px; width:auto;">` : placeholderIcon(30);
  return `<tr class="inventory-row" id="row-${i.id}" data-inventory-id="${i.id}">
    <td class="actions">
      <button class="btn btn-sm btn-info me-1" onclick="openViewSpecies('${i.id}')">View</button>
      <button class="btn btn-sm btn-primary me-1" onclick="openEditSpecies('${i.id}')">Edit</button>
      <button class="btn btn-sm btn-danger" onclick="deleteSpecies('${i.id}', '${escapeHtml(i.species)}')">Delete</button>
    </td>
    <td><i>${escapeHtml(i.species || '')}</i></td>
    <td><i>${escapeHtml(i.morph_name || '')}</i></td>
    <td>${escapeHtml(i.insect_type || '')}</td>
    <td>${imgTag}</td>
  </tr>`;
}

function renderTable(rows){
  const host = document.getElementById('inventory-table-container');
  if (!host) return;
  if (!rows.length){ host.innerHTML = "<p>No results.</p>"; return; }

  if (INV_STATE.groupByType){
    const buckets = {};
    for (const r of rows){ const t = (r.insect_type || '—').trim(); (buckets[t] ||= []).push(r); }
    let html = `<div class="table-responsive" style="max-height:70vh; overflow-x:auto; overflow-y:auto">`;
    html += `<table id="species-table" class="table table-bordered table-hover align-middle text-nowrap"><thead class="table-light sticky-top"><tr>
      <th class="actions" style="min-width:56px;">Actions</th><th>Species</th><th>Morph</th><th>Type</th><th style="width:50px;">Image</th></tr></thead><tbody>`;
    for (const t of Object.keys(buckets).sort((a,b)=>a.localeCompare(b))){
      html += `<tr class="type-header"><td colspan="5"><strong>${t}</strong> <span class="text-muted">(${buckets[t].length})</span></td></tr>`;
      for (const i of buckets[t]) html += rowHtml(i);
    }
    html += `</tbody></table></div>`;
    host.innerHTML = html;
    try { if (window.__enhanceSpeciesTable) window.__enhanceSpeciesTable(); } catch(e){}
  } else {
    let html = `<div class="table-responsive" style="max-height:70vh; overflow-x:auto; overflow-y:auto">`;
    html += `<table id="species-table" class="table table-bordered table-hover align-middle text-nowrap"><thead class="table-light sticky-top"><tr>
      <th class="actions" style="min-width:56px;">Actions</th><th>Species</th><th>Morph</th><th>Type</th><th style="width:50px;">Image</th></tr></thead><tbody>`;
    for (const i of rows) html += rowHtml(i);
    html += `</tbody></table></div>`;
    host.innerHTML = html;
    try { if (window.__enhanceSpeciesTable) window.__enhanceSpeciesTable(); } catch(e){}
  }

  document.querySelectorAll("#inventory-table-container .inventory-row").forEach(row => {
    row.addEventListener("click", () => {
      document.querySelectorAll("#inventory-table-container .inventory-row").forEach(r => r.classList.remove("selected"));
      row.classList.add("selected");
    });
  });
}

// Mobile enhancer (3-dot -> down-arrow menu)
(function(){
  const mq = window.matchMedia('(max-width: 576px)');
  const q  = (s, r=document) => r.querySelector(s);
  const qa = (s, r=document) => Array.from(r.querySelectorAll(s));
  function table(){ return q('#inventory-table-container table') || q('#species-table'); }
  function ensureActionsFirst(t){
    if (!t) return;
    const head = t.tHead?.rows[0];
    if (head) {
      let th = head.querySelector('th.actions') || qa('th', head).find(th => /actions/i.test((th.textContent||'').trim()));
      if (th) {
        if (!th.classList.contains('actions')) th.classList.add('actions');
        if (head.cells[0] !== th) head.insertBefore(th, head.cells[0]);
      }
    }
    const body = t.tBodies[0] || t;
    qa('tr', body).forEach(tr => {
      let td = tr.querySelector('td.actions') || tr.cells[0];
      if (td) {
        td.classList.add('actions');
        if (tr.cells[0] !== td) tr.insertBefore(td, tr.cells[0]);
      }
    });
  }
  function enhanceRow(tr){
    const cell = tr.querySelector('td.actions') || tr.cells[0];
    if (!cell || cell.querySelector('.spm-toggle')) return;
    const buttons = qa('a.btn, button.btn', cell);
    if (!buttons.length) return;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'spm-toggle';
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('title', 'Actions');
    toggle.textContent = '▾';
    const menu = document.createElement('div');
    menu.className = 'spm-menu';
    buttons.forEach(btn => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'spm-item';
      item.textContent = (btn.textContent || btn.ariaLabel || 'Action').trim();
      item.addEventListener('click', (e) => { e.preventDefault(); btn.click(); });
      menu.appendChild(item);
    });
    cell.prepend(toggle); cell.appendChild(menu);
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle('spm-open');
      toggle.setAttribute('aria-expanded', String(open));
      qa('.spm-menu.spm-open', table()).forEach(m => { if (m !== menu) m.classList.remove('spm-open'); });
    });
    document.addEventListener('click', () => {
      if (menu.classList.contains('spm-open')) { menu.classList.remove('spm-open'); toggle.setAttribute('aria-expanded', 'false'); }
    }, { passive: true });
  }
  function enhanceSpeciesTable(){
    const t = table();
    if (!t) return;
    ensureActionsFirst(t);
    if (mq.matches) qa('tbody tr', t).forEach(enhanceRow);
  }
  window.__enhanceSpeciesTable = enhanceSpeciesTable;
  setTimeout(enhanceSpeciesTable, 0);
  mq.addEventListener('change', enhanceSpeciesTable);
  const t0 = table();
  if (t0) {
    const body = t0.tBodies[0] || t0;
    new MutationObserver(enhanceSpeciesTable).observe(body, { childList: true, subtree: true });
  }
})();
