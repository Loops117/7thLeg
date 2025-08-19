console.log("✅ store/store_advertising.js loaded");

const STORAGE_BUCKET = "store-images";

export async function init(options = {}) {
  const supabase = window.supabase;
  const storeId = options?.store_id || null;
  if (!supabase || !storeId) {
    document.querySelector("#store-content")?.insertAdjacentHTML("afterbegin",
      `<div class="alert alert-danger">Missing Supabase client or store_id.</div>`);
    return;
  }

  const els = {
    status: document.getElementById("store-ads-status"),
    // vertical
    vPreview: document.getElementById("ads-vert-preview"),
    vPH: document.getElementById("ads-vert-ph"),
    vUrl: document.getElementById("ads-vert-url"),
    vApply: document.getElementById("ads-vert-apply"),
    vFile: document.getElementById("ads-vert-file"),
    // horizontal
    hPreview: document.getElementById("ads-horiz-preview"),
    hPH: document.getElementById("ads-horiz-ph"),
    hUrl: document.getElementById("ads-horiz-url"),
    hApply: document.getElementById("ads-horiz-apply"),
    hFile: document.getElementById("ads-horiz-file"),
    // actions
    save: document.getElementById("ads-save"),
    reset: document.getElementById("ads-reset"),
  };

  // size constraints
  const V_MIN_W = 240, V_MIN_H = 480, V_AR = 1/2, V_TOL = 0.15;
  const H_MIN_W = 600, H_MIN_H = 75,  H_AR = 728/90, H_TOL = 0.15;

  function setStatus(msg){ if (els.status) els.status.textContent = msg || ""; }
  function checkDimsOK(w,h, minW,minH, ar,tol){
    if (!w||!h) return false;
    if (w<minW || h<minH) return false;
    const r = w/h, lo=ar*(1-tol), hi=ar*(1+tol);
    return r>=lo && r<=hi;
  }
  async function validateFileDims(file, kind){
    const url = URL.createObjectURL(file);
    try{
      const img = new Image();
      const dims = await new Promise((resolve,reject)=>{
        img.onload = ()=>resolve({w:img.naturalWidth,h:img.naturalHeight});
        img.onerror = ()=>reject(new Error("image load failed"));
        img.src = url;
      });
      if (kind==='vertical'){
        return checkDimsOK(dims.w,dims.h,V_MIN_W,V_MIN_H,V_AR,V_TOL) ? dims : null;
      } else {
        return checkDimsOK(dims.w,dims.h,H_MIN_W,H_MIN_H,H_AR,H_TOL) ? dims : null;
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function setVSrc(src){
    if (!els.vPreview || !els.vPH) return;
    if (src){
      els.vPreview.src = src;
      els.vPreview.style.display = "block";
      els.vPH.style.display = "none";
    } else {
      els.vPreview.src = "";
      els.vPreview.style.display = "none";
      els.vPH.style.display = "inline";
    }
  }
  function setHSrc(src){
    if (!els.hPreview || !els.hPH) return;
    if (src){
      els.hPreview.src = src;
      els.hPreview.style.display = "block";
      els.hPH.style.display = "none";
    } else {
      els.hPreview.src = "";
      els.hPreview.style.display = "none";
      els.hPH.style.display = "inline";
    }
  }

  // state
  let current = null;
  let vFile = null;
  let hFile = null;

  // load current
  setStatus("Loading…");
  const { data, error } = await supabase
    .from("store_profiles")
    .select("id, vertical_ad_url, horizontal_ad_url")
    .eq("id", storeId)
    .maybeSingle();
  if (error || !data){
    setStatus("Failed to load store");
    console.warn("load store failed", error);
    return;
  }
  current = data;
  setVSrc(current.vertical_ad_url || "");
  setHSrc(current.horizontal_ad_url || "");
  setStatus("");

  // URL apply
  els.vApply?.addEventListener("click", ()=>{
    const url = (els.vUrl.value||"").trim();
    setVSrc(url || "");
    vFile = null;
  });
  els.hApply?.addEventListener("click", ()=>{
    const url = (els.hUrl.value||"").trim();
    setHSrc(url || "");
    hFile = null;
  });

  // file pick
  els.vFile?.addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    vFile = null;
    if (!f){ setVSrc(""); return; }
    const ok = await validateFileDims(f,'vertical');
    if (!ok){
      alert("Vertical ad must be at least 240×480 and ~1:2 aspect (±15%).");
      e.target.value = "";
      setVSrc("");
      return;
    }
    vFile = f;
    setVSrc(URL.createObjectURL(f));
  });
  els.hFile?.addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    hFile = null;
    if (!f){ setHSrc(""); return; }
    const ok = await validateFileDims(f,'horizontal');
    if (!ok){
      alert("Horizontal ad must be at least 600×75 and ~8:1 aspect (±15%).");
      e.target.value = "";
      setHSrc("");
      return;
    }
    hFile = f;
    setHSrc(URL.createObjectURL(f));
  });

  async function uploadPublic(file, tag){
    const safeName = `${tag}_${storeId}_${Date.now()}_${file.name}`.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path = `stores/${storeId}/${safeName}`;
    const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true, contentType: file.type || "image/*" });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  function setSaving(){ if(els.save){ els.save.disabled = true; els.save.textContent = "Saving…"; } }
  function setSaved(){ if(els.save){ els.save.disabled = false; els.save.textContent = "Save"; } }

  // Save
  els.save?.addEventListener("click", async ()=>{
    setStatus("Saving…"); setSaving();
    const payload = {};

    try{
      if (vFile){
        payload.vertical_ad_url = await uploadPublic(vFile, "ad_vertical");
      } else {
        const url = (els.vUrl.value||"").trim();
        if (url) payload.vertical_ad_url = url;
      }
      if (hFile){
        payload.horizontal_ad_url = await uploadPublic(hFile, "ad_horizontal");
      } else {
        const url = (els.hUrl.value||"").trim();
        if (url) payload.horizontal_ad_url = url;
      }
    } catch (e){
      console.error("ad upload failed", e);
      alert(e?.message || "Ad image upload failed. Paste image URL as fallback.");
      setStatus(""); setSaved();
      return;
    }

    if (Object.keys(payload).length === 0){
      setStatus("Nothing to save"); setSaved();
      return;
    }

    const { data: updated, error: upErr } = await supabase
      .from("store_profiles")
      .update(payload)
      .eq("id", storeId)
      .select("vertical_ad_url, horizontal_ad_url")
      .maybeSingle();
    if (upErr){
      console.warn("save failed", upErr);
      alert("Save failed. Check console.");
      setStatus(""); setSaved();
      return;
    }

    current = { ...current, ...updated };
    setVSrc(current.vertical_ad_url || "");
    setHSrc(current.horizontal_ad_url || "");
    // clear url inputs but keep files cleared
    els.vUrl.value = ""; els.hUrl.value = "";
    vFile = null; hFile = null;
    setStatus("Saved ✓"); setSaved();
  });

  // Reset (reload current from DB)
  els.reset?.addEventListener("click", async ()=>{
    setStatus("Reloading…");
    const { data, error } = await supabase
      .from("store_profiles")
      .select("vertical_ad_url, horizontal_ad_url")
      .eq("id", storeId)
      .maybeSingle();
    if (!error && data){
      current = { ...current, ...data };
      setVSrc(current.vertical_ad_url || "");
      setHSrc(current.horizontal_ad_url || "");
      els.vUrl.value = ""; els.hUrl.value = "";
      vFile = null; hFile = null;
      setStatus("");
    } else {
      setStatus("Failed to reload");
    }
  });
}
