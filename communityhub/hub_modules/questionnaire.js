
// questionnaire.js — clean build (Aug 28, 2025)
// Single Start -> action bar (Save & Quit, Next).
// No autosave; 5-day edit window (created_at).
// Global history (pre-start): Date -> Species+Morph -> Q&A with Edit buttons.
// Species history (after start): same structure but filtered to selected species.
// Cooldown-aware species dropdown; Start disabled only if ALL are cooling down.

/* EXPECTED HTML IDS:
   speciesSelect, qna-form, qna-steps, qna-toast, btn-start, qna-history, cooldownNotice
*/
console.log("✅ questionnaire.js ready");

const supabase = window.supabase;

// ---- Config ----
const SET_SIZE_MIN = 3;
const SET_SIZE_MAX = 5;
const POINTS_PER_ANSWER = 2;
const SET_BONUS = 3;
const COOLDOWN_DAYS = 30;
const EDIT_WINDOW_DAYS = 5;

// ---- Elements ----
const speciesSelect = document.getElementById('speciesSelect');
const formEl        = document.getElementById('qna-form');
const stepsEl       = document.getElementById('qna-steps');
const toastEl       = document.getElementById('qna-toast');
const btnStart      = document.getElementById('btn-start');
const historyEl     = document.getElementById('qna-history');
const cooldownNotice= document.getElementById('cooldownNotice');

// ---- State ----
let currentUser = null;
let inventory = [];
let invIndex = 0;
let sessionId = null;
let askedIds = new Set();
let started = false;
let questionMap = new Map(); // id -> { prompt, input_type, choices }
let prevAnswersByQid = new Map(); // species-scoped for prefill
let actionBarEl = null, btnSaveQuit = null, btnNextSet = null;

// ---- DEV bypass for cooldowns ----
function getQueryFlag(name){
  try{ const u = new URL(window.location.href); return u.searchParams.get(name); }catch{ return null; }
}
const DEV_NO_COOLDOWN = (getQueryFlag('nocooldown') === '1') || (localStorage.getItem('qnaDevNoCooldown') === '1');

// ---- Helpers ----
function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function daysAgo(ts){ return (Date.now() - new Date(ts).getTime()) / (1000*60*60*24); }
function addDays(d, n){ const dd = new Date(d); dd.setDate(dd.getDate()+n); return dd; }
function fmtDateKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtTime(d){ return d.toLocaleTimeString(); }

function speciesLabel(row){
  const base = (row.species && row.species.trim()) || row.common_name || row.species_name || "Species";
  const morph = row.morph_name ? ` — ${row.morph_name}` : '';
  return `${base}${morph}`;
}

// ---- Meta helpers ----
async function loadAnsweredMeta(userId){
  const { data, error } = await supabase
    .from('points_user_answers')
    .select('user_inventory_id, created_at')
    .eq('user_id', userId);
  if (error){ console.warn(error); return { counts:new Map(), lastAnswered:new Map() }; }
  const counts = new Map(), lastAnswered = new Map();
  (data||[]).forEach(r => {
    if (!r.user_inventory_id) return;
    counts.set(r.user_inventory_id, (counts.get(r.user_inventory_id)||0)+1);
    const prev = lastAnswered.get(r.user_inventory_id);
    if (!prev || new Date(r.created_at) > new Date(prev)) lastAnswered.set(r.user_inventory_id, r.created_at);
  });
  return { counts, lastAnswered };
}

function pickSuggestedIndex(inv, meta){
  const last = meta.lastAnswered, counts = meta.counts;
  for (let i=0;i<inv.length;i++){
    const row = inv[i]; const ts = last.get(row.id);
    if (!counts.has(row.id) && (!ts || daysAgo(ts) >= COOLDOWN_DAYS)) return i;
  }
  const eligible = inv.map((row,i)=>({row,i,ts:last.get(row.id)})).filter(x=>!x.ts||daysAgo(x.ts)>=COOLDOWN_DAYS);
  if (eligible.length){ eligible.sort((a,b)=>new Date(a.ts||0)-new Date(b.ts||0)); return eligible[0].i; }
  const all = inv.map((row,i)=>({row,i,ts:last.get(row.id)||0}));
  all.sort((a,b)=>new Date(a.ts||0)-new Date(b.ts||0)); return all[0]?.i ?? 0;
}

async function refreshCooldownUI(meta){
  if (!speciesSelect) return;
  let enabledCount = 0, earliestNext = null;
  Array.from(speciesSelect.options).forEach((opt,i)=>{
    const invRow = inventory[i]; const ts = meta.lastAnswered.get(invRow.id);
    opt.disabled = false;
    opt.textContent = opt.textContent.replace(/ \((available .*?)\)$/,'');
    if (!DEV_NO_COOLDOWN && ts && daysAgo(ts) < COOLDOWN_DAYS){
      opt.disabled = true;
      const next = addDays(new Date(ts), COOLDOWN_DAYS);
      opt.textContent += ` (available ${next.toLocaleDateString()})`;
      if (!earliestNext || next < earliestNext) earliestNext = next;
    } else { enabledCount++; }
  });
  const sel = speciesSelect.selectedIndex;
  if (sel>=0 && speciesSelect.options[sel] && speciesSelect.options[sel].disabled){
    const firstEnabled = Array.from(speciesSelect.options).findIndex(o=>!o.disabled);
    if (firstEnabled!==-1){ speciesSelect.selectedIndex = firstEnabled; invIndex = firstEnabled; }
  }
  if (enabledCount===0){
    if (cooldownNotice){
      cooldownNotice.style.display='';
      cooldownNotice.textContent = `All species are in cooldown. Next available ${earliestNext?earliestNext.toLocaleDateString():'soon'}.`;
    }
    if (btnStart) btnStart.disabled = true;
  } else {
    if (cooldownNotice){
      const cur = speciesSelect.options[speciesSelect.selectedIndex];
      if (cur && cur.disabled){ cooldownNotice.style.display=''; cooldownNotice.textContent='That species is cooling down. Pick any enabled one to continue.'; }
      else cooldownNotice.style.display='none';
    }
    if (btnStart) btnStart.disabled = false;
  }
}

// ---- Init ----
init().catch(console.error);

async function init(){
  const { data: { user } } = await supabase.auth.getUser();
  if (!user){ alert('Please sign in.'); return; }
  currentUser = user;

  const { data: inv, error } = await supabase
    .from('user_inventories')
    .select('id, species_registry_id, species_morph_id, species, common_name, morph_name, sort_order, date_obtained, created_at')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error){ console.warn(error); return; }

  inventory = (inv||[]).filter(row => !!(row.species_registry_id || (row.species && String(row.species).trim()) || row.common_name));
  if (!inventory.length){
    speciesSelect.innerHTML = '<option value="">No species in inventory</option>';
    formEl.innerHTML = '<p class="muted">No species found in your inventory yet.</p>';
    return;
  }

  speciesSelect.innerHTML = inventory.map((row,i)=>{
    return `<option value="${i}">${escapeHtml(speciesLabel(row))}</option>`;
  }).join('');

  await ensureQuestionsLoaded();

  const meta = await loadAnsweredMeta(user.id);
  invIndex = pickSuggestedIndex(inventory, meta);
  speciesSelect.value = String(invIndex);
  await refreshCooldownUI(meta);

  if (stepsEl){
    stepsEl.textContent = 'Pick a species and press Start';
    if (DEV_NO_COOLDOWN){
      const badge = document.createElement('span');
      badge.textContent = 'DEV: cooldown off';
      badge.style.cssText = 'margin-left:.5rem;font-size:.75rem;padding:.1rem .4rem;border-radius:6px;background:#fff3cd;color:#664d03;border:1px solid #ffecb5;';
      stepsEl.appendChild(badge);
    }
  }

  // Show global history on landing
  await renderGlobalHistory();
}

async function ensureQuestionsLoaded(){
  if (questionMap.size) return;
  const { data, error } = await supabase
    .from('points_questions')
    .select('id, prompt, input_type, choices');
  if (error){ console.warn(error); return; }
  (data||[]).forEach(q => questionMap.set(String(q.id), { prompt: q.prompt || String(q.id), input_type: q.input_type || 'text', choices: q.choices || [] }));
}

// ---- Events ----
speciesSelect?.addEventListener('change', async () => {
  if (started) return;
  invIndex = parseInt(speciesSelect.value||'0',10)||0;
  await renderGlobalHistory();
});

btnStart?.addEventListener('click', async () => {
  if (started) return;
  const meta = await loadAnsweredMeta(currentUser.id);
  const chosenOpt = speciesSelect.options[speciesSelect.selectedIndex];
  if (!DEV_NO_COOLDOWN && chosenOpt && chosenOpt.disabled){
    const nextIdx = pickSuggestedIndex(inventory, meta);
    speciesSelect.value = String(nextIdx); invIndex = nextIdx;
    const ts = meta.lastAnswered.get(inventory[invIndex].id);
    if (ts && daysAgo(ts) < COOLDOWN_DAYS){
      cooldownNotice.style.display=''; cooldownNotice.textContent=`All species are in cooldown. Next available ${addDays(new Date(ts),COOLDOWN_DAYS).toLocaleDateString()}.`;
      return;
    }
  }
  started = true; speciesSelect.disabled = true; btnStart.disabled = true;
  await startOrResumeCurrent();
  ensureActionBar(); actionBarEl.style.display='';
  await loadPrevAnswers(inventory[invIndex]);
  await loadBatch();
  await renderSpeciesHistory(inventory[invIndex]);
});

// ---- Sessions & Questions ----
async function startOrResumeCurrent(){
  const row = inventory[invIndex]; if (!row) return;
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('points_user_qna_sessions')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('user_inventory_id', row.id)
    .eq('status', 'active')
    .maybeSingle();
  if (error && error.code!=='PGRST116'){ console.warn(error); }
  if (data){ sessionId = data.id; return; }

  const ins = await supabase.from('points_user_qna_sessions').insert({
    user_id: user.id,
    species_registry_id: row.species_registry_id || null,
    species_morph_id: row.species_morph_id || null,
    user_inventory_id: row.id,
    status: 'active'
  }).select('id').single();
  if (ins.error){ console.warn(ins.error); return; }
  sessionId = ins.data.id;
}

async function loadPrevAnswers(row){
  prevAnswersByQid.clear();
  const { data, error } = await supabase
    .from('points_user_answers')
    .select('question_id, answer, created_at')
    .eq('user_id', currentUser.id)
    .eq('user_inventory_id', row.id)
    .order('created_at', { ascending: false });
  if (error){ console.warn(error); return; }
  (data||[]).forEach(r => { const k=String(r.question_id); if(!prevAnswersByQid.has(k)) prevAnswersByQid.set(k, r.answer); });
}

async function loadBatch(){
  const row = inventory[invIndex]; if (!row) return;

  let answered = []; let editableWithinWindow = new Set();
  if (sessionId){
    const { data: ans } = await supabase
      .from('points_user_answers')
      .select('question_id, created_at')
      .eq('session_id', sessionId);
    (ans||[]).forEach(a=>{
      answered.push(a.question_id);
      if (daysAgo(a.created_at) <= EDIT_WINDOW_DAYS) editableWithinWindow.add(a.question_id);
    });
  }

  const { data: qs, error } = await supabase
    .from('points_questions')
    .select('id, key, prompt, input_type, choices, priority, active')
    .eq('active', true)
    .order('priority', { ascending: true })
    .limit(100);
  if (error){ console.warn(error); return; }

  const poolRaw = (qs||[]).filter(q => {
    const p = (q.prompt || '').toLowerCase();
    return !(p.includes('how long') && p.includes('had') && p.includes('species'));
  });

  const pool = poolRaw.filter(q => (!answered.includes(q.id) || editableWithinWindow.has(q.id)) && !askedIds.has(q.id));
  const batch = pool.slice(0, Math.max(SET_SIZE_MIN, Math.min(SET_SIZE_MAX, pool.length)));

  renderHeader(row);
  renderBatch(batch, row);

  if (!batch.length){
    if (sessionId){
      await supabase.from('points_user_qna_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', sessionId);
    }
    started=false; speciesSelect.disabled=false; btnStart.disabled=false;
    formEl.innerHTML = '<p class="muted">No more questions available for this species right now. You can pick a different one.</p>';
    const meta = await loadAnsweredMeta(currentUser.id);
    await refreshCooldownUI(meta);
    await renderGlobalHistory();
  }
}

function renderHeader(row){
  stepsEl.textContent = speciesLabel(row);
}

function renderBatch(batch, row){
  formEl.innerHTML='';
  if (!batch.length) return;
  batch.forEach(q => {
    askedIds.add(q.id);
    const el = document.createElement('div');
    el.className='input-row'; el.dataset.qid = q.id;
    el.innerHTML = renderInput(q,row);
    formEl.appendChild(el);
  });
  attachDirtyMarkers();
}

function renderInput(q, row){
  const id = q.id;
  const label = `<label>${escapeHtml(q.prompt)}</label>`;

  // Prefill generic previous answer for this species
  let initial = '';
  const prevRaw = prevAnswersByQid.get(String(q.id));
  if (prevRaw){ try{ initial = String(JSON.parse(prevRaw)); }catch{ initial = String(prevRaw); } }

  // owned_days suggestion as fallback
  if (!initial && q.key==='owned_days' && row?.date_obtained){
    const d = new Date(row.date_obtained);
    const diff = Math.max(0, Math.floor((Date.now()-d.getTime())/(1000*60*60*24)));
    initial = String(diff);
  }

  if (q.input_type==='choice' && Array.isArray(q.choices)){
    return `${label}
      <select data-q="${id}">
        ${q.choices.map(c=>{
          const v=String(c); const sel = initial && v===initial ? ' selected':'';
          return `<option value="${escapeHtml(v)}"${sel}>${escapeHtml(v)}</option>`;
        }).join('')}
      </select>`;
  }
  if (q.input_type==='int'){
    const attr = initial? ` value="${escapeHtml(initial)}"`:'';
    return `${label}<input type="number" min="0" step="1" data-q="${id}"${attr}>`;
  }
  return `${label}<textarea rows="3" data-q="${id}" placeholder="Type your answer...">${initial?escapeHtml(initial):''}</textarea>`;
}

function attachDirtyMarkers(){
  const nodes = formEl.querySelectorAll('[data-q]');
  nodes.forEach(el => {
    const mark = () => { el.dataset.dirty='1'; };
    el.addEventListener('input', mark);
    el.addEventListener('change', mark);
    el.addEventListener('keyup', mark);
  });
}

function collectAnswers(){
  const els = formEl.querySelectorAll('[data-q]');
  const out = [];
  els.forEach(el => {
    const qid = el.getAttribute('data-q');
    const val = el.value;
    if (val==null || String(val).trim()==='') return;
    out.push({ question_id: qid, answer: val });
  });
  return out;
}

async function saveAnswers(list, setBonus){
  const row = inventory[invIndex];
  const { data: { user } } = await supabase.auth.getUser();
  let insertedCount = 0;

  for (const a of list){
    let existing = null;
    if (sessionId){
      const { data: existRows } = await supabase
        .from('points_user_answers')
        .select('id, created_at')
        .eq('session_id', sessionId)
        .eq('question_id', a.question_id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (existRows && existRows.length) existing = existRows[0];
    }

    const withinWindow = existing ? (daysAgo(existing.created_at) <= EDIT_WINDOW_DAYS) : false;

    if (existing && withinWindow){
      const { error: updErr } = await supabase
        .from('points_user_answers')
        .update({ answer: JSON.stringify(a.answer) })
        .eq('id', existing.id);
      if (updErr){ console.warn(updErr); }
      // no points on edits
    } else {
      const payload = {
        session_id: sessionId,
        user_id: user.id,
        species_registry_id: row.species_registry_id || null,
        species_morph_id: row.species_morph_id || null,
        user_inventory_id: row.id,
        species_name: row.species || row.common_name || null,
        morph_name: row.morph_name || null,
        question_id: a.question_id,
        answer: JSON.stringify(a.answer)
      };
      const { error: insErr } = await supabase.from('points_user_answers').insert([payload]);
      if (insErr){ console.warn(insErr); }
      await awardPoints({ action_type: 'question_answered', base_points: POINTS_PER_ANSWER, row });
      insertedCount += 1;
    }
  }

  if (setBonus && insertedCount >= 3){
    await awardPoints({ action_type: 'questionnaire_complete_set_bonus', base_points: SET_BONUS, row });
  }

  if (toastEl){
    toastEl.style.display='block'; setTimeout(()=>{ toastEl.style.display='none'; }, 1400);
  }
}

// ---- Action bar ----
function ensureActionBar(){
  if (actionBarEl) return;
  const card = document.querySelector('.qna-card') || document.body;
  actionBarEl = document.createElement('div');
  actionBarEl.className='qna-actions';
  actionBarEl.style.display='none';
  actionBarEl.style.gap='.5rem';
  actionBarEl.style.justifyContent='flex-end';
  actionBarEl.style.marginTop='.75rem';

  btnSaveQuit = document.createElement('button'); btnSaveQuit.type='button'; btnSaveQuit.textContent='Save & Quit';
  btnNextSet  = document.createElement('button'); btnNextSet.type='button';  btnNextSet.textContent='Next';
  actionBarEl.appendChild(btnSaveQuit); actionBarEl.appendChild(btnNextSet);
  card.appendChild(actionBarEl);

  btnSaveQuit.addEventListener('click', async () => {
    const answers = collectAnswers();
    if (answers.length){ await saveAnswers(answers, /*setBonus=*/false); }
    if (sessionId){
      await supabase.from('points_user_qna_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', sessionId);
    }
    started=false; speciesSelect.disabled=false; btnStart.disabled=false; actionBarEl.style.display='none';
    formEl.innerHTML = '<p class="muted">Session saved. You can pick a different species.</p>';
    const meta = await loadAnsweredMeta(currentUser.id); await refreshCooldownUI(meta);
    await renderGlobalHistory();
  });

  btnNextSet.addEventListener('click', async () => {
    const answers = collectAnswers();
    if (!answers.length){ alert('Answer at least one question or Save & Quit.'); return; }
    await saveAnswers(answers, /*setBonus=*/true);
    await loadPrevAnswers(inventory[invIndex]); // to prefill next batch
    await loadBatch();
    await renderSpeciesHistory(inventory[invIndex]);
  });
}

// ---- Points ----
async function awardPoints({ action_type, base_points, row }){
  const { data: { user } } = await supabase.auth.getUser();
  const createdAt = new Date(user.created_at);
  const ageDays = (Date.now()-createdAt.getTime())/(1000*60*60*24);
  if (ageDays < 7) return;

  let target_type, target_id;
  if (row.species_morph_id){ target_type='species_morph'; target_id=row.species_morph_id; }
  else if (row.species_registry_id){ target_type='species_registry'; target_id=row.species_registry_id; }
  else { target_type='user_inventory'; target_id=row.id; }

  await supabase.from('points_user_contributions').insert({
    actor_user_id: user.id, recipient_user_id: user.id,
    action_type, response_type: 'species_change', bulletin_type: null,
    target_type, target_id,
    species_registry_id: row.species_registry_id || null,
    species_morph_id: row.species_morph_id || null,
    base_points,
    auto_approved: true, approved: true,
    created_at: new Date().toISOString(),
    notes: `QnA award for ${speciesLabel(row)}`,
    source: 'system'
  });
}

// ---- History (accordion with inline edit) ----
async function fetchAnswers(filter){
  let q = supabase.from('points_user_answers')
    .select('id, user_inventory_id, species_name, morph_name, question_id, answer, created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (filter && filter.user_inventory_id){ q = q.eq('user_inventory_id', filter.user_inventory_id); }
  const { data, error } = await q;
  if (error){ console.warn(error); return []; }
  return data||[];
}

function speciesKeyFromRow(r){
  return `${r.species_name || 'Unknown species'}${r.morph_name ? ' — '+r.morph_name : ''}`;
}

function renderHistoryAccordion(rows){
  if (!historyEl) return;
  if (!rows.length){ historyEl.innerHTML='No previous answers yet.'; return; }

  // Group by date -> species
  const byDate = new Map();
  for (const r of rows){
    const d = new Date(r.created_at);
    const key = fmtDateKey(d);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(r);
  }

  const dateKeys = Array.from(byDate.keys()).sort((a,b)=> new Date(b) - new Date(a));
  const chunks = [];

  dateKeys.forEach(dkey => {
    const list = byDate.get(dkey);
    const bySpecies = new Map();
    list.forEach(r=>{
      const sKey = speciesKeyFromRow(r);
      if (!bySpecies.has(sKey)) bySpecies.set(sKey, []);
      bySpecies.get(sKey).push(r);
    });

    const speciesBlocks = [];
    for (const [sKey, arr] of bySpecies.entries()){
      arr.sort((a,b)=> new Date(a.created_at)-new Date(b.created_at));
      const items = arr.map(r => {
        const meta = questionMap.get(String(r.question_id)) || { prompt: `Q${r.question_id}`, input_type:'text', choices:[] };
        let val=''; try{ val=String(JSON.parse(r.answer)); }catch{ val=String(r.answer); }
        const canEdit = daysAgo(r.created_at) <= EDIT_WINDOW_DAYS;
        const disabledAttr = canEdit ? '' : ' disabled title="Edit window expired"';
        return `<li data-answer-id="${r.id}" data-question-id="${r.question_id}">
          <span class="time">${escapeHtml(fmtTime(new Date(r.created_at)))}</span> — 
          <span class="q">${escapeHtml(meta.prompt)}</span>: 
          <span class="a">${escapeHtml(val)}</span>
          <button class="btn-edit-answer"${disabledAttr}>Edit</button>
        </li>`;
      }).join('');
      speciesBlocks.push(`<details><summary>${escapeHtml(sKey)}</summary><ul class="answer-list">${items}</ul></details>`);
    }

    chunks.push(`<details><summary>${escapeHtml(dkey)}</summary>${speciesBlocks.join('')}</details>`);
  });

  const note = `<p class="muted" style="margin-top:.5rem;">You have ${EDIT_WINDOW_DAYS} days to edit an answer after saving. After that, the <em>Edit</em> button locks.</p>`;
  historyEl.innerHTML = chunks.join('') + note;
  historyEl.querySelectorAll('.btn-edit-answer').forEach(btn=>btn.addEventListener('click', onEditAnswerClick));
}

async function renderGlobalHistory(){
  const rows = await fetchAnswers(/* all */);
  renderHistoryAccordion(rows);
}

async function renderSpeciesHistory(row){
  const rows = await fetchAnswers({ user_inventory_id: row.id });
  renderHistoryAccordion(rows);
}

function createEditorControl(qmeta, currentValue){
  const wrap = document.createElement('span'); wrap.className='history-inline-editor';
  let control; const v = String(currentValue ?? '');
  if (qmeta.input_type==='choice' && Array.isArray(qmeta.choices) && qmeta.choices.length){
    control = document.createElement('select');
    qmeta.choices.forEach(c=>{
      const opt = document.createElement('option'); const val=String(c);
      opt.value = val; opt.textContent = val; if (val===v) opt.selected = true; control.appendChild(opt);
    });
  } else if (qmeta.input_type==='int'){
    control = document.createElement('input'); control.type='number'; control.min='0'; control.step='1'; control.value=v;
  } else {
    control = document.createElement('textarea'); control.rows=3; control.value=v;
  }
  wrap.appendChild(control);
  return { el: wrap, getValue: () => control.value };
}

async function onEditAnswerClick(ev){
  const btn = ev.currentTarget;
  if (btn.disabled) return;
  const li = btn.closest('li[data-answer-id]'); if (!li) return;
  const ansId = li.getAttribute('data-answer-id'); const qid = li.getAttribute('data-question-id');
  const aSpan = li.querySelector('.a'); const curVal = aSpan ? aSpan.textContent : '';
  const qmeta = questionMap.get(String(qid)) || { prompt:`Q${qid}`, input_type:'text', choices:[] };
  const editor = createEditorControl(qmeta, curVal);

  const controls = document.createElement('span'); controls.className='edit-controls';
  const bSave = document.createElement('button'); bSave.textContent='Save';
  const bCancel = document.createElement('button'); bCancel.textContent='Cancel';
  controls.appendChild(bSave); controls.appendChild(bCancel);

  aSpan.style.display='none'; btn.style.display='none';
  li.appendChild(editor.el); li.appendChild(controls);

  bCancel.addEventListener('click', ()=>{
    editor.el.remove(); controls.remove(); aSpan.style.display=''; btn.style.display='';
  });

  bSave.addEventListener('click', async ()=>{
    const newVal = editor.getValue();
    if (newVal==null || String(newVal).trim()===''){ alert('Answer cannot be blank.'); return; }
    // check edit window against created_at
    const { data, error } = await supabase.from('points_user_answers').select('id, created_at').eq('id', ansId).limit(1);
    if (error || !data || !data.length){ alert('Could not load answer.'); return; }
    const row = data[0];
    if (daysAgo(row.created_at) > EDIT_WINDOW_DAYS){
      alert(`Edit window (${EDIT_WINDOW_DAYS} days) has expired for this answer.`);
      return;
    }
    const upd = await supabase.from('points_user_answers').update({ answer: JSON.stringify(newVal) }).eq('id', ansId);
    if (upd.error){ alert('Save failed: '+upd.error.message); return; }
    if (started){ await renderSpeciesHistory(inventory[invIndex]); } else { await renderGlobalHistory(); }
  });
}
