// settings.js — Hub Dashboard module with avatar upload + location verification + full address storage
(function(){
  console.log("✅ settings.js loaded");

  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);

  async function boot(){
    const supabase = await waitForSupabase();
    if (!supabase) { console.error("❌ Supabase not available"); return; }

    wireAccountForm(supabase);
  }

  async function waitForSupabase(timeoutMs = 8000){
    const start = Date.now();
    while (Date.now() - start < timeoutMs){
      if (window.supabase && window.supabase.auth && window.supabase.from && window.supabase.storage) return window.supabase;
      await new Promise(r => setTimeout(r, 60));
    }
    return null;
  }

  function setMessage(el, txt, cls){
    if (!el) return;
    el.className = "ms-3 small " + (cls || "text-muted");
    el.textContent = txt;
  }

  function safeVal(v){ return (v === null || v === undefined) ? "" : v; }

  function renderAvatar(url){
    const img = document.getElementById("acct-avatar-img");
    if (!img) return;
    if (url) {
      img.src = url;
      img.style.display = "block";
    } else {
      img.removeAttribute("src");
      img.style.display = "none";
    }
  }

  // --- Geocoding helpers ---
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
    const cands = [addr?.state, addr?.region, addr?.state_district];
    for (const c of cands){
      if (!c) continue;
      const key = String(c).toLowerCase();
      if (US_ABBR[key]) return US_ABBR[key];
      if (/^[A-Z]{2}$/.test(c)) return c;
    }
    return null;
  }

  function buildFullAddress(addr){
    const line1Parts = [];
    if (addr?.house_number) line1Parts.push(addr.house_number);
    if (addr?.road) line1Parts.push(addr.road);
    const line1 = line1Parts.join(" ").trim();

    const city = addr?.city || addr?.town || addr?.village || addr?.hamlet || addr?.municipality || "";
    const state = inferStateCode(addr) || (addr?.state || "");
    const postcode = addr?.postcode || "";
    const country = addr?.country || "";

    const parts = [line1, city, state, postcode, country].filter(Boolean);
    return {
      full: parts.join(", "),
      postal_code: postcode || null,
      country: country || null,
      city: city || null,
      state: state || null
    };
  }

  async function reverseOrNull(lat, lng){
    try {
      if (!lat || !lng) return null;
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&addressdetails=1`;
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      if (!res.ok) return null;
      const data = await res.json();
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || null;
      const state = inferStateCode(addr);
      return { city, state, addr };
    } catch(e){
      return null;
    }
  }

  function wireAccountForm(supabase){
    const $name  = document.getElementById("acct-fullname");
    const $addr  = document.getElementById("acct-address");
    const $disp  = document.getElementById("acct-display-location");
    const $full  = document.getElementById("acct-full-address");
    const $lat   = document.getElementById("acct-lat");
    const $lng   = document.getElementById("acct-lng");
    const $msg   = document.getElementById("acct-msg");
    const $form  = document.getElementById("acct-form");
    const $about = document.getElementById("acct-about");

    const $file   = document.getElementById("acct-avatar-file");
    const $upload = document.getElementById("acct-avatar-upload");
    const $remove = document.getElementById("acct-avatar-remove");
    const $verify = document.getElementById("acct-verify");

    if (!$form) return;

    let currentAvatarPath = null;

    // Load current profile
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setMessage($msg, "Please log in to manage your profile.", "text-danger"); return; }

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("full_name, about_me, location, city, state, lat, lng, avatar_url, address_full, postal_code, country, created_at")
          .eq("id", user.id)
          .single();

        if (error) {
          console.warn("profiles select error:", error.message);
          setMessage($msg, "Loaded basic account view. Some fields may be unavailable.", "text-warning");
        }

        $name.value = safeVal(profile?.full_name);

        const disp = (profile?.city && profile?.state) ? `${profile.city}, ${profile.state}` : safeVal(profile?.location);
        $disp.value = disp || "";
        $full.value = safeVal(profile?.address_full);

        if (profile?.lat) $lat.value = profile.lat;
        if (profile?.lng) $lng.value = profile.lng;

        renderAvatar(profile?.avatar_url || "");

        if ($about) $about.value = safeVal(profile?.about_me);

        if (profile?.avatar_url && profile.avatar_url.includes("/profile-images/")) {
          const parts = profile.avatar_url.split("/profile-images/")[1];
          currentAvatarPath = parts ? parts.split("?")[0] : null;
        }
      } catch(err){
        console.error("load profile failed:", err);
        setMessage($msg, "Failed to load account.", "text-danger");
      }
    })();

    // Verify address
    $verify?.addEventListener("click", async () => {
      setMessage($msg, "Verifying address…");
      try {
        const raw = ($addr?.value || "").trim();
        if (!raw) { setMessage($msg, "Enter an address to verify.", "text-warning"); return; }
        const geo = await geocodeAddress(raw);
        if (!geo) { setMessage($msg, "Could not find that address.", "text-danger"); return; }
        const lat = geo.lat.toFixed(6), lng = geo.lng.toFixed(6);
        $lat.value = lat; $lng.value = lng;

        const rc = await reverseOrNull(lat, lng);
        const city = rc?.city || ""; const state = rc?.state || "";
        $disp.value = (city && state) ? `${city}, ${state}` : "";

        // Build a clean full address string for shipping
        const b = buildFullAddress(rc?.addr || geo.address || {});
        $full.value = b.full || "";

        setMessage($msg, (city && state) ? "Verified." : "Verified coordinates. City/State unavailable.", (city && state) ? "text-success" : "text-warning");
      } catch(err){
        console.error("verify failed:", err);
        setMessage($msg, "❌ Verify failed.", "text-danger");
      }
    });

    // Avatar upload
    $upload?.addEventListener("click", async () => {
      setMessage($msg, "Uploading…");
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setMessage($msg, "Not logged in.", "text-danger"); return; }
        if (!$file?.files?.length) { setMessage($msg, "Choose an image first.", "text-warning"); return; }

        const file = $file.files[0];
        if (!file.type.startsWith("image/")) {
          setMessage($msg, "Please select an image file.", "text-warning");
          return;
        }

        const ext  = (file.name.split('.').pop() || 'png').toLowerCase();
        const path = `${user.id}/avatar.${ext}`;

        const { error: upErr } = await supabase.storage.from("profile-images")
          .upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) throw upErr;

        const { data: pub } = await supabase.storage.from("profile-images").getPublicUrl(path);
        const publicUrl = pub?.publicUrl;
        if (!publicUrl) throw new Error("Failed to get public URL");

        const { error: updErr } = await supabase.from("profiles")
          .update({ avatar_url: publicUrl })
          .eq("id", user.id);
        if (updErr) throw updErr;

        currentAvatarPath = path;
        renderAvatar(publicUrl);
        setMessage($msg, "✅ Avatar updated.", "text-success");
        $file.value = "";
      } catch(err){
        console.error("avatar upload failed:", err);
        setMessage($msg, "❌ Upload failed. " + (err?.message || ""), "text-danger");
      }
    });

    // Remove avatar
    $remove?.addEventListener("click", async () => {
      setMessage($msg, "Removing…");
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setMessage($msg, "Not logged in.", "text-danger"); return; }

        const { error: updErr } = await supabase.from("profiles")
          .update({ avatar_url: null })
          .eq("id", user.id);
        if (updErr) throw updErr;

        if (currentAvatarPath) {
          await supabase.storage.from("profile-images").remove([currentAvatarPath]);
          currentAvatarPath = null;
        }

        renderAvatar("");
        setMessage($msg, "Avatar removed.", "text-success");
      } catch(err){
        console.error("avatar remove failed:", err);
        setMessage($msg, "❌ Remove failed. " + (err?.message || ""), "text-danger");
      }
    });

    // Save profile (name + verified location fields + full address for shipping)
    $form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setMessage($msg, "Saving…");

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setMessage($msg, "Not logged in.", "text-danger"); return; }

        const display = ($disp.value || "").trim();
        const full    = ($full.value || "").trim();
        const lat     = $lat.value ? parseFloat($lat.value) : null;
        const lng     = $lng.value ? parseFloat($lng.value) : null;

        let city = null, state = null, postal_code = null, country = null;

        // Try to parse City, ST from display (already set from verify)
        if (display.includes(",")){
          const parts = display.split(",");
          city = parts[0].trim() || null;
          state = (parts[1] || "").trim() || null;
        }

        // Roughly parse postal code from end of full address if present (best-effort)
        const zipMatch = full.match(/\b\d{5}(?:-\d{4})?\b/);
        postal_code = zipMatch ? zipMatch[0] : null;

        // Roughly parse country (last token if looks like country)
        const segs = full.split(",").map(s => s.trim()).filter(Boolean);
        if (segs.length) {
          const last = segs[segs.length - 1];
          if (last.length > 2) country = last; // skip "ST" two-char states
        }

        const payload = {
          full_name: ($name.value || "").trim() || null,
          about_me: ($about && $about.value ? $about.value.trim() : null),
          location: display || null, // public "City, ST"
          city, state, lat, lng,
          address_full: full || null, // private shipping address
          postal_code, country
        };

        // Progressive fallback in case some columns not present yet
        let { error } = await supabase.from("profiles").update(payload).eq("id", user.id);
        if (error) {
          const attempts = [
            ["about_me","address_full","postal_code","country","lat","lng","city","state","location"],
            ["postal_code","country","lat","lng","city","state","location"],
            ["lat","lng","city","state","location"],
            ["city","state","location"],
            ["location"]
          ];
          for (const drop of attempts){
            const p = { ...payload };
            for (const k of drop) delete p[k];
            const { error: e2 } = await supabase.from("profiles").update(p).eq("id", user.id);
            if (!e2) { error = null; break; }
          }
        }
        if (error) throw error;

        setMessage($msg, "✅ Saved.", "text-success");
      } catch(err){
        console.error("save profile failed:", err);
        setMessage($msg, "❌ Failed to save. " + (err?.message || ""), "text-danger");
      }
    });
  }
})();