console.log("✅ store/store_details.js loaded (save button feedback + store-images bucket)");

const STORAGE_BUCKET = "store-images"; // dedicated bucket for store logos/banners

export async function init(options = {}) {
  const supabase = window.supabase;
  const storeId = options?.store_id || null;
  if (!supabase || !storeId) {
    document.querySelector("#store-content")?.insertAdjacentHTML("afterbegin",
      `<div class="alert alert-danger">Missing Supabase client or store_id.</div>`);
    return;
  }

  const els = {
    status: document.getElementById("store-details-status"),
    name: document.getElementById("store-name"),
    slug: document.getElementById("store-slug"),
    website: document.getElementById("store-website"),
    bio: document.getElementById("store-bio"),
    location: document.getElementById("store-location"),
    contact: document.getElementById("store-contact"),
    logoUrl: document.getElementById("logo-url"),
    bannerUrl: document.getElementById("banner-url"),
    logoApply: document.getElementById("logo-apply-url"),
    bannerApply: document.getElementById("banner-apply-url"),
    logoFile: document.getElementById("logo-file"),
    bannerFile: document.getElementById("banner-file"),
    logoPreview: document.getElementById("store-logo-preview"),
    logoPlaceholder: document.getElementById("store-logo-placeholder"),
    bannerPreview: document.getElementById("store-banner-preview"),
    bannerPlaceholder: document.getElementById("store-banner-placeholder"),
    policyShipping: document.getElementById("policy-shipping"),
    policyDoa: document.getElementById("policy-doa"),
    policyReturns: document.getElementById("policy-returns"),
    saveBtn: document.getElementById("store-save"),
    resetBtn: document.getElementById("store-reset")
  };

  // local state for current profile + pending files
  let current = null;
  let pendingLogoFile = null;
  let pendingBannerFile = null;

  const setStatus = (msg) => { if (els.status) els.status.textContent = msg || ""; };

  // util: slugify
  const slugify = (s) => (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .substring(0, 60);

  // util: preview helpers
  const setLogoSrc = (src) => {
    if (!els.logoPreview || !els.logoPlaceholder) return;
    if (src) {
      els.logoPreview.src = src;
      els.logoPreview.style.display = "block";
      els.logoPlaceholder.style.display = "none";
    } else {
      els.logoPreview.src = "";
      els.logoPreview.style.display = "none";
      els.logoPlaceholder.style.display = "inline";
    }
  };
  const setBannerSrc = (src) => {
    if (!els.bannerPreview || !els.bannerPlaceholder) return;
    if (src) {
      els.bannerPreview.src = src;
      els.bannerPreview.style.display = "block";
      els.bannerPlaceholder.style.display = "none";
    } else {
      els.bannerPreview.src = "";
      els.bannerPreview.style.display = "none";
      els.bannerPlaceholder.style.display = "inline";
    }
  };

  // 1) Load existing profile
  setStatus("Loading…");
  const { data: row, error } = await supabase
    .from("store_profiles")
    .select("id, name, slug, logo_url, banner_url, website_url, bio, location, policies")
    .eq("id", storeId)
    .maybeSingle();
  if (error) {
    setStatus("Load failed");
    console.error("❌ store_details load failed:", error);
    return;
  }
  current = row || {};
  // Fill inputs
  els.name.value = current.name || "";
  els.slug.value = current.slug || "";
  els.website.value = current.website_url || "";
  els.bio.value = current.bio || "";
  els.location.value = current.location || "";
  setLogoSrc(current.logo_url || "");
  setBannerSrc(current.banner_url || "");

  // Parse policies
  let pol = {};
  const rawPol = current.policies || "";
  try {
    pol = typeof rawPol === "string" ? JSON.parse(rawPol) : (rawPol || {});
  } catch {
    // treat as simple text -> shipping
    pol = { shipping: rawPol };
  }
  els.contact.value = pol.contact || "";
  els.policyShipping.value = pol.shipping || "";
  els.policyDoa.value = pol.doa || "";
  els.policyReturns.value = pol.returns || "";

  setStatus("");

  // 2) Wire events
  els.logoApply?.addEventListener("click", () => {
    const url = (els.logoUrl.value || "").trim();
    setLogoSrc(url || "");
    pendingLogoFile = null; // prefer URL if user clicks apply
  });
  els.bannerApply?.addEventListener("click", () => {
    const url = (els.bannerUrl.value || "").trim();
    setBannerSrc(url || "");
    pendingBannerFile = null;
  });
  els.logoFile?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    pendingLogoFile = f || null;
    if (f) setLogoSrc(URL.createObjectURL(f));
  });
  els.bannerFile?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    pendingBannerFile = f || null;
    if (f) setBannerSrc(URL.createObjectURL(f));
  });
  els.name?.addEventListener("input", () => {
    if (!els.slug.value) els.slug.value = slugify(els.name.value);
  });
  els.resetBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    // Reset to loaded values
    els.name.value = current.name || "";
    els.slug.value = current.slug || "";
    els.website.value = current.website_url || "";
    els.bio.value = current.bio || "";
    els.location.value = current.location || "";
    setLogoSrc(current.logo_url || "");
    setBannerSrc(current.banner_url || "");
    els.logoUrl.value = "";
    els.bannerUrl.value = "";
    els.contact.value = pol.contact || "";
    els.policyShipping.value = pol.shipping || "";
    els.policyDoa.value = pol.doa || "";
    els.policyReturns.value = pol.returns || "";
    pendingLogoFile = null;
    pendingBannerFile = null;
    // Reset button label too
    restoreSaveButton();
    setStatus("");
  });

  // util: normalize URL
  const normalizeUrl = (u) => {
    const s = (u || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    return "https://" + s;
  };

  // Save button helpers
  function setSaving() {
    if (!els.saveBtn) return;
    els.saveBtn.disabled = true;
    els.saveBtn.dataset.originalLabel = els.saveBtn.dataset.originalLabel || els.saveBtn.textContent;
    els.saveBtn.textContent = "Saving…";
  }
  function setSaved() {
    if (!els.saveBtn) return;
    els.saveBtn.disabled = true;
    els.saveBtn.textContent = "Saved ✓";
    els.saveBtn.classList.add("btn-success");
    els.saveBtn.classList.remove("btn-primary");
    setTimeout(restoreSaveButton, 1400);
  }
  function restoreSaveButton() {
    if (!els.saveBtn) return;
    els.saveBtn.disabled = false;
    els.saveBtn.textContent = els.saveBtn.dataset.originalLabel || "Save";
    els.saveBtn.classList.add("btn-primary");
    els.saveBtn.classList.remove("btn-success");
  }

  // util: upload helper -> returns public URL
  async function uploadPublic(file, keyPrefix) {
    if (!STORAGE_BUCKET) throw new Error("No storage bucket defined");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `stores/${storeId}/${keyPrefix}_${Date.now()}.${ext}`;

    // The client can't check bucket existence; attempt upload and surface a friendly error.
    const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
    if (upErr) {
      // Common: Bucket not found
      if (String(upErr.message || upErr).toLowerCase().includes("bucket not found")) {
        throw new Error(`Bucket "${STORAGE_BUCKET}" not found. Create it in Supabase Storage or change STORAGE_BUCKET in store_details.js.`);
      }
      throw upErr;
    }
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  // 3) Save
  els.saveBtn?.addEventListener("click", async () => {
    const name = (els.name.value || "").trim();
    if (!name) { alert("Store name is required."); return; }

    // build payload
    setStatus("Saving…");
    setSaving();

    // Start with existing, then override
    const payload = {
      name,
      slug: (els.slug.value || slugify(name)),
      website_url: normalizeUrl(els.website.value),
      bio: (els.bio.value || "").trim(),
      location: (els.location.value || "").trim()
    };

    // policies (stored as JSON string)
    const polOut = {
      contact: (els.contact.value || "").trim(),
      shipping: (els.policyShipping.value || "").trim(),
      doa: (els.policyDoa.value || "").trim(),
      returns: (els.policyReturns.value || "").trim()
    };
    payload.policies = JSON.stringify(polOut);

    // images: priority file > url input > existing
    try {
      if (pendingLogoFile) {
        payload.logo_url = await uploadPublic(pendingLogoFile, "logo");
      } else if ((els.logoUrl.value || "").trim()) {
        payload.logo_url = (els.logoUrl.value || "").trim();
      }
      if (pendingBannerFile) {
        payload.banner_url = await uploadPublic(pendingBannerFile, "banner");
      } else if ((els.bannerUrl.value || "").trim()) {
        payload.banner_url = (els.bannerUrl.value || "").trim();
      }
    } catch (e) {
      console.error("❌ Upload failed:", e);
      alert(e?.message || "Image upload failed. Paste an image URL as a fallback, or create a storage bucket named 'store-images'.");
      setStatus("");
      restoreSaveButton();
      return;
    }

    // send update
    const { data: updated, error: upErr } = await supabase
      .from("store_profiles")
      .update(payload)
      .eq("id", storeId)
      .select()
      .maybeSingle();

    if (upErr) {
      console.error("❌ Save failed:", upErr);
      setStatus("Save failed");
      alert("Save failed. Check console for details.");
      restoreSaveButton();
      return;
    }

    // success -> update current + previews
    current = updated || current;
    setLogoSrc(current.logo_url || payload.logo_url || "");
    setBannerSrc(current.banner_url || payload.banner_url || "");
    setStatus("Saved ✓");
    setSaved();
  });
}
