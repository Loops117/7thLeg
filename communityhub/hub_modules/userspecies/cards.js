
import { escapeHtml, placeholderIcon, pushAlert, wireCommonActions } from './shared.js';

let inventoryData = [];
const INV_STATE = { search: '', sort: 'species_az', disabledTypes: new Set() };

export async function init(){
  wireCommonActions();
  setupControls();
  await loadInventory();
  window.__reloadInventory = loadInventory;
}

function setupControls(){
  const search = document.getElementById('inventory-search');
  const sort = document.getElementById('inventory-sort');
  search?.addEventListener('input', (e) => { INV_STATE.search = (e.target.value||'').toLowerCase(); render(); });
  sort?.addEventListener('change', (e) => { INV_STATE.sort = e.target.value; render(); });
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
  const cardsC = document.getElementById('inventory-cards-container');
  const alerts = document.getElementById('import-errors');
  alerts && (alerts.innerHTML = '');
  if (!user){ cardsC && (cardsC.innerHTML = "<p class='text-danger'>Not logged in.</p>"); return; }
  const { data: inventories, error } = await supabase.from('user_inventories').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error){ console.warn('loadInventory error', error); cardsC && (cardsC.innerHTML = "<p class='text-danger'>Failed to load inventory.</p>"); return; }
  if (!inventories || inventories.length === 0){ cardsC && (cardsC.innerHTML = "<p>No species in your inventory yet.</p>"); return; }
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
  renderCards(rows);
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
      const actions = `        <div class="ms-auto inv-action-wrap">          <button type="button" class="inv-action-toggle" aria-haspopup="true" aria-expanded="false" title="Actions">▾</button>          <div class="inv-action-menu">            <button type="button" class="inv-action-item" data-act="view" data-id="${i.id}">View</button>            <button type="button" class="inv-action-item" data-act="edit" data-id="${i.id}">Edit</button>            <button type="button" class="inv-action-item" data-act="delete" data-id="${i.id}" data-label="${escapeHtml(i.species||'')}">Delete</button>          </div>        </div>`;
      return `<div class="d-flex align-items-center mb-2">${img}${label}${actions}</div>`;
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

  // Actions
  wireCardActionMenus(host);
}

function wireCardActionMenus(scope){
  const container = scope || document;
  function closeAll(except=null){
    container.querySelectorAll('.inv-action-menu.open').forEach(m => { if (m !== except) m.classList.remove('open'); });
    container.querySelectorAll('.inv-action-toggle[aria-expanded="true"]').forEach(t => t.setAttribute('aria-expanded','false'));
  }
  container.querySelectorAll('.inv-action-wrap').forEach(wrap => {
    const toggle = wrap.querySelector('.inv-action-toggle');
    const menu = wrap.querySelector('.inv-action-menu');
    if (!toggle || !menu) return;
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(isOpen));
      closeAll(isOpen ? menu : null);
    });
    wrap.querySelectorAll('.inv-action-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const act = btn.getAttribute('data-act');
        const label = btn.getAttribute('data-label') || '';
        if (act === 'view')      { window.openViewSpecies && window.openViewSpecies(id); }
        else if (act === 'edit') { window.openEditSpecies && window.openEditSpecies(id); }
        else if (act === 'delete'){ window.deleteSpecies && window.deleteSpecies(id, label); }
        closeAll();
      });
    });
  });
  document.addEventListener('click', () => closeAll(), { passive: true });
}
