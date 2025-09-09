
// hub_modules/userspecies/shared.js — helpers & common actions
export function escapeHtml(str){
  return String(str||"").replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
}
export function placeholderIcon(size=30){
  const s = Math.max(10, size|0);
  const svg = encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}' viewBox='0 0 24 24'>
      <rect width='24' height='24' fill='#f1f3f5' rx='4'/>
      <path d='M6 17l3-4 3 3 2-2 4 5H6z' fill='#ced4da'/>
      <circle cx='9' cy='8' r='2' fill='#ced4da'/>
    </svg>`).replace(/\s+/g, " ");
  return `<img src="data:image/svg+xml;utf8,${svg}" alt="-" style="height:${s}px;width:${s}px;">`;
}
export function pushAlert(msg, kind="info"){
  const host = document.getElementById("import-errors");
  if (!host) return alert(msg);
  const div = document.createElement("div");
  div.className = `alert alert-${kind}`;
  div.textContent = msg;
  host.appendChild(div);
  setTimeout(()=>div.remove(), 7000);
}
export function wireCommonActions(){
  window.openViewSpecies = function (id) { loadModule('species_modules/view.hubspecies', null, { id }); };
  window.openEditSpecies = (function(){
    let busy = false, __openAddDebounceAt = 0;
    return function (id) {
      const now = Date.now();
      if (now - __openAddDebounceAt < 700) { return; }
      __openAddDebounceAt = now;
      if (busy) { return; }
      busy = true;
      try { loadModule('species_modules/edit.hubspecies', null, { id }); }
      finally { setTimeout(()=>{ busy = false; }, 1200); }
    };
  })();
  window.openAddSpecies = function () {
    if (window.__addSpeciesOpening) return;
    window.__addSpeciesOpening = true;
    try { window.openEditSpecies(null); }
    finally { setTimeout(()=>{ window.__addSpeciesOpening = false; }, 1200); }
  };
  window.deleteSpecies = async function(id, speciesText){
    if (!confirm(`Delete ${speciesText || "this item"}?`)) return;
    const { error } = await supabase.from("user_inventories").delete().eq("id", id);
    if (error) { console.warn("deleteSpecies error", error); pushAlert("Failed to delete item.", "warning"); return; }
    pushAlert("Item deleted.", "success");
    if (window.__reloadInventory) window.__reloadInventory();
  };
}
