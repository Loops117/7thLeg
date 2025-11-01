// userspecies/excel.js — clean build for requested columns/features

export async function init(){
  await app.boot();
}

/* ---------------- state ---------------- */
const state = {
  USER_ID: null,
  COLS: [
    {key:'species',label:'Species Name',type:'text',required:true},
    {key:'morph_name',label:'Morph Name',type:'text'},
    {key:'insect_type',label:'Insect Type',type:'select'},   // dropdown BETWEEN Morph Name and Source
    {key:'source',label:'Source',type:'text'},
    {key:'price',label:'Price',type:'text'},
    {key:'date_obtained',label:'Date Obtained',type:'date'},
    {key:'acquisition_notes',label:'Acquisition Notes',type:'text'},

    // --- Added per request (no other changes) ---
    {key:'availability',label:'Available',type:'boolean'},
    {key:'avail_notes',label:'Availability Notes (HTML OK)',type:'text'}
  ],
  ROWS: [],
  FILTER: '',
  SAVE_QUEUE: new Map(),
  SAVE_TIMERS: new Map(),
  NEW_ROW_SEQ: 0,
  INSECT_TYPES: [],

  SORT: { key: null, dir: 'asc' },            // current single-column sort (click header)
  SORT_MULTI: [                                // initial multi-key sort on load
    { key: 'species', dir: 'asc' },
    { key: 'morph_name', dir: 'asc' },
    { key: 'insect_type', dir: 'asc' }
  ],
  COL_WIDTHS: {},                              // column width overrides by key
};
/* -- GFR EARLY -- */

// -- ensure getFilteredRows is available early
function getFilteredRows(){
  if (!state || !Array.isArray(state.ROWS)) return [];
  if (!state.FILTER) return state.ROWS;
  const q = String(state.FILTER || '').toLowerCase();
  return state.ROWS.filter(r => (
    `${r.species||''} ${r.morph_name||''} ${r.insect_type||''} ${r.source||''} ${r.price||''} ${r.date_obtained||''} ${r.acquisition_notes||''} ${r.avail_notes||''}`
      .toLowerCase()
      .includes(q)
  ));
}
try{if(typeof window!=='undefined') window.getFilteredRows=getFilteredRows;}catch{}

function compareVals(a,b){
  const sa = (a==null? '' : String(a)).toLowerCase();
  const sb = (b==null? '' : String(b)).toLowerCase();
  if (sa < sb) return -1;
  if (sa > sb) return +1;
  return 0;
}
function sortBySpec(rows, spec){
  const arr = rows.slice(0);
  if (!spec || !spec.length) return arr;
  arr.sort((ra, rb) => {
    for (const s of spec){
      const k = s.key;
      const dir = s.dir === 'desc' ? -1 : 1;
      const cmp = compareVals(ra[k], rb[k]);
      if (cmp !== 0) return cmp * dir;
    }
    return 0;
  });
  return arr;
}
function getSortedRows(){
  const base = getFilteredRows();
  if (state.SORT && state.SORT.key){
    return sortBySpec(base, [state.SORT]);
  }
  if (state.SORT_MULTI && state.SORT_MULTI.length){
    return sortBySpec(base, state.SORT_MULTI);
  }
  return base;
}
try{ if(typeof window!=='undefined') window.getSortedRows = getSortedRows; }catch{}
const TABLE = 'user_inventories';
const BUCKET = (window && window.USER_SPECIES_BUCKET) ? window.USER_SPECIES_BUCKET : 'user-inventories';
const GALLERY_MAX = 5;

/* ---------------- app ---------------- */
const app = {
  async boot(){
    const u = await supabase.auth.getUser();
    const user = u?.data?.user;
    if (!user) return ui.renderError('Not logged in.');
    state.USER_ID = user.id;
    ui.wireSearch();
    ui.wireAddRowButton();
    await this.loadData();
    await fetchInsectTypes();
    if (!state.INSECT_TYPES.length) state.INSECT_TYPES = buildInsectTypes(state.ROWS);
    ui.renderGrid();

    injectExcelEnhanceStyles();

    ui.wireGlobalKeys();
    ui.announce('Loaded.');
  },
  async loadData(){
    // Only fetch the fields we display + id
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, species, morph_name, insect_type, source, price, date_obtained, acquisition_notes, availability, avail_notes, cover_image, gallery_images')
      .eq('user_id', state.USER_ID)
      .order('created_at', { ascending: false });
    if (error){ console.warn(error); return ui.renderError('Failed to load inventory.'); }
    state.ROWS = data || [];
    ui.updateCount();
  },
};

/* ---------------- ui ---------------- */
const ui = {
  announce(msg){ const s = $('#excel-status'); if (s) { s.textContent = msg; setTimeout(()=>{ if (s.textContent===msg) s.textContent=''; }, 1200);} },
  renderError(msg){ const host = $('#excel-grid-host'); if (host) host.innerHTML = `<div class="text-danger">${esc(msg)}</div>`; },
  updateCount(){
    const c = $('#excel-count'); if (!c) return;
    const visible = getFilteredRows().length;
    c.textContent = `${visible} row${visible!==1?'s':''} (${state.ROWS.length} total)`;
  },
  renderGrid(){
    const thead = $('#excel-grid thead');
    const tbody = $('#excel-grid tbody');
    if (!thead || !tbody) return;
    thead.innerHTML = `<tr>
      <th style="min-width:44px; position:sticky; left:0; background:#f8f9fa; z-index:2;">#</th>
      ${state.COLS.map((c,idx) => headerCellHtml(c, idx)).join('')}
      <th style="min-width:80px">Status</th>
      <th style="min-width:140px">Actions</th>
    </tr>`;
    const rows = getSortedRows();
    const html = rows.map((r, i) => rowHtml(r, i)).join('') + newRowHtml();
    tbody.innerHTML = html;
    this.wireCells(tbody);
    wireActionButtons();

    wireHeaderSort();
    wireColumnResizers();

    const host = $('#excel-grid-host');
    if (host){ host.style.maxHeight = '70vh'; host.style.overflow = 'auto'; }
  },
  wireSearch(){
    const s = $('#excel-search');
    s?.addEventListener('input', () => { state.FILTER = s.value || ''; this.renderGrid(); this.updateCount(); });
  },
  wireAddRowButton(){
    const b = $('#excel-add-row');
    b?.addEventListener('click', () => {
      ensureBlankRow();
      const last = $('#excel-grid tbody tr.new-row:last-child');
      if (last){
        const firstCell = last.querySelector('td.cell');
        firstCell && focusCell(firstCell);
      }
    });
  },
  wireCells(tbody){
    tbody.querySelectorAll('td.cell').forEach(td => {
      const type = td.dataset.type;
      if (['boolean','date','number','select'].includes(type)){
        const input = td.querySelector('input,select');
        input?.addEventListener('change', () => onCellCommit(td, inputValue(input)));
        input?.addEventListener('keydown', (e)=> navKeys(e, td));
      } else {
        const div = td.querySelector('.cell-edit');
        div?.addEventListener('keydown', (e)=> {
          if (e.key === 'Enter'){ e.preventDefault(); onCellCommit(td, div.textContent.trim()); focusNext(td, e.shiftKey); }
          else if (e.key === 'Tab'){ e.preventDefault(); onCellCommit(td, div.textContent.trim()); focusNext(td, e.shiftKey); }
        });
        div?.addEventListener('blur', ()=> onCellCommit(td, div.textContent.trim()));
      }
      td.addEventListener('click', ()=> focusCell(td));
    });
    // multi-cell paste
    $('#excel-grid')?.addEventListener('paste', onPaste);
  },
  wireGlobalKeys(){
    document.addEventListener('keydown', (e)=>{
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){
        e.preventDefault();
        for (const [rowId] of state.SAVE_QUEUE){
          const tr = document.querySelector(`tr[data-rowid="${CSS.escape(rowId)}"]`);
          saveRow(rowId, tr);
        }
      }
    });
  }
};

/* ---------------- render helpers ---------------- */

function getSortDirFor(key){
  if (state.SORT && state.SORT.key === key) return state.SORT.dir;
  // show multi-sort only if no single sort active
  if ((!state.SORT || !state.SORT.key) && Array.isArray(state.SORT_MULTI)){
    const e = state.SORT_MULTI.find(s=>s.key===key);
    return e ? e.dir : null;
  }
  return null;
}
function headerCellHtml(col, idx){
  const dir = getSortDirFor(col.key);
  const arrow = dir ? (dir==='asc' ? ' ▲' : ' ▼') : '';
  const w = state.COL_WIDTHS[col.key];
  const style = (w ? `style="width:${w}px; min-width:${w}px;"` : '');
  return `<th data-colkey="${esc(col.key)}" ${style} class="excel-th-sort">
    <button type="button" class="btn btn-link p-0 text-decoration-none header-sort-btn">${esc(col.label)}${arrow}</button>
    <span class="col-resizer" data-col-index="${idx}"></span>
  </th>`;
}
function wireHeaderSort(){
  const head = document.querySelector('#excel-grid thead');
  if (!head) return;
  head.querySelectorAll('th .header-sort-btn').forEach(btn => {
    btn.addEventListener('click', (e)=>{
      const th = btn.closest('th');
      const key = th?.getAttribute('data-colkey');
      if (!key) return;
      const current = (state.SORT && state.SORT.key === key) ? state.SORT.dir : null;
      const nextDir = current === 'asc' ? 'desc' : (current === 'desc' ? null : 'asc');
      if (nextDir){
        state.SORT = { key, dir: nextDir };
      } else {
        state.SORT = { key: null, dir: 'asc' };
      }
      // when single sort is active, ignore multi
      document.querySelector('#excel-grid thead').innerHTML = `<tr>
        <th style="min-width:44px; position:sticky; left:0; background:#f8f9fa; z-index:2;">#</th>
        ${state.COLS.map((c,idx) => headerCellHtml(c, idx)).join('')}
        <th style="min-width:80px">Status</th>
        <th style="min-width:140px">Actions</th>
      </tr>`;
      const tbody = document.querySelector('#excel-grid tbody');
      tbody.innerHTML = getSortedRows().map((r,i)=>rowHtml(r,i)).join('') + newRowHtml();
      ui.wireCells(tbody);
      wireActionButtons();
      wireHeaderSort();
      wireColumnResizers();
      ui.updateCount();
    });
  });
}
/* ---------- column resize (basic drag) ---------- */
let _resize = null;
function wireColumnResizers(){
  const head = document.querySelector('#excel-grid thead tr');
  if (!head) return;
  head.querySelectorAll('th .col-resizer').forEach((h, idx)=>{
    h.addEventListener('mousedown', (e)=>{
      e.preventDefault();
      const th = h.closest('th');
      if (!th) return;
      const key = th.getAttribute('data-colkey');
      const startX = e.clientX;
      const startW = th.getBoundingClientRect().width;
      _resize = { th, key, startX, startW };
      document.body.classList.add('col-resize-active');
    });
  });
  document.addEventListener('mousemove', (e)=>{
    if (!_resize) return;
    const dx = e.clientX - _resize.startX;
       const newW = Math.max(80, Math.round(_resize.startW + dx));
    _resize.th.style.width = newW+'px';
    _resize.th.style.minWidth = newW+'px';
    if (_resize.key) state.COL_WIDTHS[_resize.key] = newW;
    // apply to all tds of that column index
    const index = Array.from(_resize.th.parentElement.children).indexOf(_resize.th); // th index in row
    const body = document.querySelector('#excel-grid tbody');
    if (body){
      for (const tr of body.children){
        if (tr.nodeName !== 'TR') continue;
        const tds = tr.children;
        const td = tds[index];
        if (td && td.classList.contains('cell-wrapper')){
          td.style.width = newW+'px';
          td.style.minWidth = newW+'px';
        }
      }
    }
  });
  document.addEventListener('mouseup', ()=>{
    if (_resize){
      document.body.classList.remove('col-resize-active');
      _resize = null;
    }
  });
}

function rowHtml(r, idx){
  const rid = r.id || `__new__:${++state.NEW_ROW_SEQ}`;
  const cells = state.COLS.map(c => cellHtml(rid, c, r[c.key]));
  return `<tr data-rowid="${rid}">
    <td class="text-muted" style="position:sticky; left:0; background:#fff; z-index:1;">${idx+1}</td>
    ${cells.join('')}
    <td class="status small text-muted"></td>
    <td class="actions">
      ${r.id ? `
        <button type="button" class="btn btn-sm btn-outline-secondary act-cover" title="Upload cover" data-id="${r.id}">Cover</button>
        <button type="button" class="btn btn-sm btn-outline-secondary act-gallery" title="Upload gallery" data-id="${r.id}">Gallery</button>
      ` : `<span class="text-muted small">Save first</span>`}
    </td>
  </tr>`;
}
function newRowHtml(){
  const rid = `__new__:${++state.NEW_ROW_SEQ}`;
  const cells = state.COLS.map(c => {
    // default availability to false (unchecked) in the UI for new rows
    const v = (c.key === 'availability') ? false : '';
    return cellHtml(rid, c, v);
  });
  return `<tr data-rowid="${rid}" class="new-row">
    <td class="text-muted" style="position:sticky; left:0; background:#fff; z-index:1;">+</td>
    ${cells.join('')}
    <td class="status small text-muted">New</td>
    <td class="actions"><span class="text-muted small">Save first</span></td>
  </tr>`;
}
function cellHtml(rid, col, val){
  const required = col.required ? ' data-required="true"' : '';
  let inner = '';
  const safe = (v)=> v==null? '': String(v);
  switch(col.type){
    case 'select': {
      const opts = (state.INSECT_TYPES || []).map(v => `<option value="${esc(v)}"${String(val||'')===v?' selected':''}>${esc(v)}</option>`).join('');
      inner = `<select class="form-select form-select-sm"><option value=""></option>${opts}</select>`;
      break;
    }
    case 'boolean':
      inner = `<input type="checkbox" ${val===true||safe(val)==='true'?'checked':''} class="form-check-input">`; break;
    case 'date':
      inner = `<input type="date" value="${safe(val).slice(0,10)}" class="form-control form-control-sm">`; break;
    case 'number':
      inner = `<input type="number" value="${safe(val)}" class="form-control form-control-sm">`; break;
    default:
      inner = `<div class="cell-edit" contenteditable="true" spellcheck="false" style="min-width:120px; min-height:20px; outline:none;">${esc(safe(val))}</div>`;
  }
  return `<td class="cell cell-wrapper" data-key="${col.key}" data-type="${col.type||'text'}" data-rowid="${rid}"${required}>${inner}</td>`;
}

/* ---------------- interactions ---------------- */
function onPaste(e){
  const active = document.activeElement;
  const td = active?.closest ? active.closest('td.cell') : null;
  if (!td) return;
  const text = (e.clipboardData || window.clipboardData)?.getData('text');
  if (!text) return;
  const rows = text.split(/\r?\n/).filter(r => r.length>0).map(r => r.split('\t'));
  if (!rows.length) return;
  e.preventDefault();
  const { row, col } = tdPos(td);
  const tbody = document.querySelector('#excel-grid tbody');
  for (let r=0; r<rows.length; r++){
    const tr = tbody.children[row + r] || addBlankRow();
    const cells = tr.querySelectorAll('td.cell');
    for (let c=0; c<rows[r].length && (col + c) < cells.length; c++){
      const target = cells[col + c];
      const type = target.dataset.type;
      let val = rows[r][c];
      if (type === 'boolean') val = /^(true|1|yes|y)$/i.test(val);
      if (type === 'number')  val = val.replace(/[^0-9\.\-]/g,'');
      if (type === 'select')  val = String(val || '');
      setCellValue(target, val);
      stageCell(target, val);
    }
  }
  flushSaveSoon();
}
function handleCellCommit(td, value, silent=false){
  const status = td.parentElement?.querySelector('.status');
  if (td.dataset.required && !String(value||'').trim()){ td.classList.add('table-danger'); }
  else { td.classList.remove('table-danger'); }
  stageCell(td, coerceByType(td.dataset.type, value));
  if (!silent && status) status.textContent = 'editing…';
  scheduleSave(td.dataset.rowid, td.parentElement);
}
const onCellCommit = handleCellCommit; // alias
function inputValue(input){ if (!input) return ''; return (input.type === 'checkbox') ? input.checked : input.value; }
function setCellValue(td, val){
  const type = td.dataset.type;
  if (type === 'boolean'){ const i = td.querySelector('input'); i.checked = !!val; }
  else if (type === 'date'){ const i = td.querySelector('input'); i.value = String(val).slice(0,10); }
  else if (type === 'number'){ const i = td.querySelector('input'); i.value = String(val); }
  else if (type === 'select'){ const i = td.querySelector('select'); if (i) i.value = String(val||''); }
  else { const d = td.querySelector('.cell-edit'); d.textContent = String(val || ''); }
}
function stageCell(td, value){
  let rowId = td.dataset.rowid;
  const tr = td.closest('tr');
  const trid = tr ? tr.getAttribute('data-rowid') : null;
  if (trid && trid !== rowId) rowId = trid;
  const key = td.dataset.key;
  const staged = state.SAVE_QUEUE.get(rowId) || {};
  staged[key] = value;
  state.SAVE_QUEUE.set(rowId, staged);
}
function coerceByType(type, v){
  if (type === 'number')  return (v===''||v==null) ? null : Number(v);
  if (type === 'boolean') return !!v;
  return v;
}

/* navigation */
function focusCell(td){ const el = td.querySelector('input, select, .cell-edit'); if (el){ el.focus(); if (el.select) el.select(); placeCaretEnd(el); } }
function placeCaretEnd(el){ try{ const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);}catch{} }
function tdPos(td){ const tr = td.parentElement; const row = Array.from(tr.parentElement.children).indexOf(tr); const col = Array.from(tr.children).indexOf(td) - 1; return { row, col }; }
function addBlankRow(){
  const tbody = document.querySelector('#excel-grid tbody');
  if (!tbody) return null;
  tbody.insertAdjacentHTML('beforeend', newRowHtml());
  ui.wireCells(tbody);
  return tbody.lastElementChild;
}
function move(td, dRow, dCol){
  const { row, col } = tdPos(td);
  const body = document.querySelector('#excel-grid tbody');
  const targetRow = body.children[row + dRow];
  if (!targetRow) return;
  const targetCell = targetRow.querySelectorAll('td.cell')[col + dCol];
  if (targetCell) focusCell(targetCell);
}
function focusNext(td, reverse){
  const { row, col } = tdPos(td);
  const body = document.querySelector('#excel-grid tbody');
  const cellsInRow = body.children[row]?.querySelectorAll('td.cell') || [];
  const nextCol = reverse ? col - 1 : col + 1;
  if (nextCol >= 0 && nextCol < cellsInRow.length){ focusCell(cellsInRow[nextCol]); }
  else {
    const nextRow = body.children[reverse ? row - 1 : row + 1];
    if (nextRow){
      const target = nextRow.querySelectorAll('td.cell')[reverse ? cellsInRow.length - 1 : 0];
      if (target) focusCell(target);
    }
  }
}
function navKeys(e, td){
  if (!['Enter','Tab','ArrowRight','ArrowLeft','ArrowUp','ArrowDown'].includes(e.key)) return;
  if (e.key === 'Enter' || e.key === 'Tab'){ e.preventDefault(); focusNext(td, e.shiftKey); }
  else if (e.key === 'ArrowRight'){ e.preventDefault(); move(td, 0, +1); }
  else if (e.key === 'ArrowLeft'){ e.preventDefault(); move(td, 0, -1); }
  else if (e.key === 'ArrowUp'){ e.preventDefault(); move(td, -1, 0); }
  else if (e.key === 'ArrowDown'){ e.preventDefault(); move(td, +1, 0); }
}

/* saving */
function scheduleSave(rowId, tr){
  // Normalize to TR's id if available (prevents saving under stale __new__ keys)
  const norm = (tr && tr.getAttribute) ? (tr.getAttribute('data-rowid') || rowId) : rowId;
  clearTimeout(state.SAVE_TIMERS.get(norm));
  const t = setTimeout(()=> saveRow(norm, tr), 500);
  state.SAVE_TIMERS.set(norm, t);
}
function flushSaveSoon(){
  setTimeout(()=>{
    for (const [rowId] of state.SAVE_QUEUE){
      const tr = document.querySelector(`tr[data-rowid="${CSS.escape(rowId)}"]`);
      saveRow(rowId, tr);
    }
  }, 300);
}
async function saveRow(rowId, tr){
  // Guard: if this was a __new__ row but the TR now has a real id, use that to avoid duplicate inserts
  if (tr && String(rowId).startsWith('__new__')){
    const current = tr.getAttribute('data-rowid');
    if (current && !String(current).startsWith('__new__')) rowId = current;
  }
  const staged = state.SAVE_QUEUE.get(rowId);
  if (!staged) return;
  const status = tr?.querySelector('.status');
  if (status) status.textContent = 'saving…';
  const record = collectRowRecord(rowId, tr);
  if (!record){ if (status) status.textContent = ''; return; }
  // required check
  const missing = state.COLS.filter(c => c.required && !String(record[c.key]||'').trim()).map(c=>c.label);
  if (missing.length){ if (status) status.textContent = 'fix required'; return; }
  try{
    let res;
    if (String(rowId).startsWith('__new__')){
      record.user_id = state.USER_ID;
      res = await supabase.from(TABLE).insert(record).select().single();
      if (res.error) throw res.error;
      const newId = res.data.id;
      tr?.setAttribute('data-rowid', newId);
      tr?.classList.remove('new-row');
      // Update all cells to carry the real row id
      try{ tr?.querySelectorAll('td.cell').forEach(td => td.dataset.rowid = newId); }catch{}
      // enable actions on this row
      const actions = tr.querySelector('.actions');
      if (actions){ actions.innerHTML = `<button type="button" class="btn btn-sm btn-outline-secondary act-cover" title="Upload cover" data-id="${newId}">Cover</button>
      <button type="button" class="btn btn-sm btn-outline-secondary act-gallery" title="Upload gallery" data-id="${newId}">Gallery</button>`; }
      ensureBlankRow();
      // Clear pending timer/queue for the temp id
      try{ clearTimeout(state.SAVE_TIMERS.get(rowId)); state.SAVE_TIMERS.delete(rowId); }catch{}
      state.SAVE_QUEUE.delete(rowId);
    } else {
      res = await supabase.from(TABLE).update(record).eq('id', rowId).select().single();
      if (res.error) throw res.error;
    }
    if (status) status.textContent = 'saved';
    state.SAVE_QUEUE.delete(rowId);
    ui.announce('Saved');
  } catch (e){
    console.warn('save error', e);
    if (status) status.textContent = 'error';
    writeConflict((e && (e.message||e.details||e.hint)) || 'Save failed');
    alert('Save failed. ' + ((e && (e.message||e.details||e.hint)) || 'Check connection.'));
  }
}
function collectRowRecord(rowId, tr){
  if (!tr){
    tr = document.querySelector(`tr[data-rowid="${CSS.escape(rowId)}"]`);
    if (!tr) return null;
  }
  const rec = {};
  tr.querySelectorAll('td.cell').forEach(td=>{
    const key = td.dataset.key;
    const type = td.dataset.type;
    let v;
    if (type === 'boolean'){ v = td.querySelector('input')?.checked || false; }
    else if (type === 'date'){ v = td.querySelector('input')?.value || null; }
    else if (type === 'number'){ const raw = td.querySelector('input')?.value || ''; v = raw===''? null : Number(raw); }
    else if (type === 'select'){ v = td.querySelector('select')?.value || ''; }
    else { v = td.querySelector('.cell-edit')?.textContent || ''; }
    if (typeof v === 'number' && Number.isNaN(v)) v = null;
    rec[key] = v;
  });
  if (!String(rowId).startsWith('__new__')) rec.id = rowId;
  return rec;
}

/* actions */
function wireActionButtons(){
  const tbody = document.querySelector('#excel-grid tbody');
  if (!tbody) return;
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (!id) return;
    if (btn.classList.contains('act-cover')){
      if (typeof window.userspeciesUploadCover === 'function') window.userspeciesUploadCover(id);
      else document.dispatchEvent(new CustomEvent('userspecies:uploadCover', { detail: { id } }));
    } else if (btn.classList.contains('act-gallery')){
      if (typeof window.userspeciesUploadGallery === 'function') window.userspeciesUploadGallery(id);
      else document.dispatchEvent(new CustomEvent('userspecies:uploadGallery', { detail: { id } }));
    }
  });
}

/* build insect types list from user rows with sensible fallback */
function buildInsectTypes(rows){
  const set = new Set();
  (rows||[]).forEach(r => { const v = (r.insect_type||'').trim(); if (v) set.add(v); });
  if (set.size === 0){
    ['Isopod','Tarantula','Scorpion','Millipede','Centipede','Mantis','Beetle','Roach','Stick Insect','Ant','Moth/Butterfly','Other']
      .forEach(v => set.add(v));
  }
  return Array.from(set).sort((a,b)=>a.localeCompare(b));
}

/* utils */
function $(sel, root=document){ return root.querySelector(sel); }
function esc(s){
  const map = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
  return String(s||'').replace(/[&<>"']/g, ch => map[ch]);
}


function ensureBlankRow(){
  const tbody = document.querySelector('#excel-grid tbody');
  if (!tbody) return;
  const last = tbody.lastElementChild;
  if (!last || !last.classList.contains('new-row')){
    tbody.insertAdjacentHTML('beforeend', newRowHtml());
    ui.wireCells(tbody);
  }
}
function writeConflict(msg){
  const el = document.getElementById('excel-conflict');
  if (!el) return;
  el.textContent = String(msg || '');
  setTimeout(()=>{ if (el.textContent === msg) el.textContent = ''; }, 5000);
}


async function fetchInsectTypes(){
  try{
    const { data, error } = await supabase
      .from('insect_types')
      .select('name, sort_order')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    const names = Array.from(new Set((data||[]).map(d => (d.name||'').trim()).filter(Boolean)));
    if (names.length) state.INSECT_TYPES = names;
    else if (!state.INSECT_TYPES.length) state.INSECT_TYPES = defaultInsectTypes();
  }catch(e){
    if (!state.INSECT_TYPES.length) state.INSECT_TYPES = defaultInsectTypes();
    console.warn('insect_types fetch failed; using fallback list', e);
  }
}

function defaultInsectTypes(){
  return ['Isopod','Tarantula','Scorpion','Millipede','Centipede','Mantis','Beetle','Roach','Stick Insect','Ant','Moth/Butterfly','Other'];
}


async function pickFiles({ accept='image/*', multiple=false } = {}){
  return await new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.multiple = !!multiple;
    i.style.display = 'none';
    document.body.appendChild(i);
    i.addEventListener('change', () => {
      const files = Array.from(i.files || []);
      document.body.removeChild(i);
      resolve(files);
    }, { once: true });
    i.click();
  });
}

function extOf(name){ const m = /\.([a-z0-9]+)$/i.exec(name||''); return m? m[1].toLowerCase() : 'jpg'; }

async function uploadToBucket(file, path){
  const r = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
  if (r.error) throw r.error;
  const pub = supabase.storage.from(BUCKET).getPublicUrl(path);
  return pub?.data?.publicUrl || null;
}

async function userspeciesHandleCoverUpload(id){
  const files = await pickFiles({ multiple: false });
  if (!files.length) return;
  const file = files[0];
  const path = `${state.USER_ID}/${id}/cover-${Date.now()}.${extOf(file.name)}`;
  const url = await uploadToBucket(file, path);
  const res = await supabase.from(TABLE).update({ cover_image: url }).eq('id', id).select('id, cover_image').single();
  if (res.error) throw res.error;
  const row = state.ROWS.find(r => r.id === id); if (row) row.cover_image = url;
  alert('Cover uploaded.');
}

async function userspeciesHandleGalleryUpload(id){
  const row = state.ROWS.find(r => r.id === id) || {};
  const existing = Array.isArray(row.gallery_images) ? row.gallery_images.slice(0) : [];
  const remain = Math.max(0, GALLERY_MAX - existing.length);
  if (remain <= 0){ alert('Gallery is full.'); return; }
  const files = await pickFiles({ multiple: true });
  if (!files.length) return;
  const chosen = files.slice(0, remain);
  const urls = [];
  for (const f of chosen){
    const path = `${state.USER_ID}/${id}/gallery/${Date.now()}-${Math.random().toString(36).slice(2)}.${extOf(f.name)}`;
    const url = await uploadToBucket(f, path);
    urls.push(url);
  }
  const next = (existing.concat(urls)).slice(0, GALLERY_MAX);
  const res = await supabase.from(TABLE).update({ gallery_images: next }).eq('id', id).select('id, gallery_images').single();
  if (res.error) throw res.error;
  if (row) row.gallery_images = next;
  alert('Gallery updated.');
}

try{
  if (typeof window !== 'undefined'){
    if (!window.userspeciesUploadCover) window.userspeciesUploadCover = (id) => userspeciesHandleCoverUpload(id);
    if (!window.userspeciesUploadGallery) window.userspeciesUploadGallery = (id) => userspeciesHandleGalleryUpload(id);
  }
}catch{}


function injectExcelEnhanceStyles(){
  if (document.getElementById('excel-enhance-styles')) return;
  const css = `
#excel-grid thead th { position: relative; white-space: nowrap; }
#excel-grid thead th .header-sort-btn { font-weight: 600; }
#excel-grid thead th .col-resizer {
  position: absolute; top:0; right: -3px; width: 6px; height: 100%;
  cursor: col-resize; user-select: none;
}
.col-resize-active { cursor: col-resize !important; }
#excel-grid td.cell-wrapper { white-space: nowrap; }
`;
  const s = document.createElement('style');
  s.id = 'excel-enhance-styles';
  s.textContent = css;
  document.head.appendChild(s);
}
