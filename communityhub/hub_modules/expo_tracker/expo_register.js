// /communityhub/hub_modules/expo_tracker/expo_register.js
console.log("✅ expo_register.js loaded");

const getSupabase = () => window.supabase || (window.parent && window.parent.supabase) || null;

const els = {
  form: document.getElementById("expo-form"),
  status: document.getElementById("x-status"),
  name: document.getElementById("name"),
  website: document.getElementById("website"),
  description: document.getElementById("description"),
  venue: document.getElementById("venue_name"),
  address: document.getElementById("address"),
  lat: document.getElementById("lat"),
  lng: document.getElementById("lng"),
  hero: document.getElementById("hero"),
  ordinal: document.getElementById("ordinal"),
  daySat: document.getElementById("day-sat"),
  daySun: document.getElementById("day-sun"),
  start: document.getElementById("start_time"),
  end: document.getElementById("end_time"),
  tz: document.getElementById("tz"),
};

function setStatus(msg, kind = "muted") {
  if (!els.status) return;
  const cls = kind === "error" ? "text-danger" : (kind === "success" ? "text-success" : "text-muted");
  els.status.className = `${cls} small mb-3`;
  els.status.textContent = msg || "";
}

/* ------------------------------ Map boot ------------------------------- */
(function initMap() {
  if (!window.L) {
    console.warn("⚠️ Leaflet not loaded; skipping map.");
    return;
  }
  const center = [39.82, -98.57]; // US center
  const map = L.map("map").setView(center, 4);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  const marker = L.marker(center, { draggable: true }).addTo(map);
  marker.on("dragend", () => {
    const { lat, lng } = marker.getLatLng();
    els.lat.value = lat.toFixed(6);
    els.lng.value = lng.toFixed(6);
  });
  // seed hidden inputs
  els.lat.value = center[0];
  els.lng.value = center[1];
})();

/* ---------------------------- Submit handler --------------------------- */
if (els.form) {
  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    console.log("🟦 Submit clicked");
    const supabase = getSupabase();
    if (!supabase) { setStatus("Supabase not initialized.", "error"); return; }

    const name = (els.name.value || "").trim();
    if (!name) { setStatus("Expo name is required.", "error"); return; }

    const days = [];
    if (els.daySat.checked) days.push(6);
    if (els.daySun.checked) days.push(0);
    if (!days.length) { setStatus("Please select at least one day (Saturday/Sunday).", "error"); return; }

    setStatus("Submitting…");

    // 1) Insert the expo (approved=false by default)
    const expoPayload = {
      name,
      website: (els.website.value || null),
      description: (els.description.value || null),
      venue_name: (els.venue.value || null),
      address: (els.address.value || null),
      lat: els.lat.value ? parseFloat(els.lat.value) : null,
      lng: els.lng.value ? parseFloat(els.lng.value) : null,
      approved: false,
    };

    const { data: expoRes, error: expoErr } = await supabase
      .from("expos").insert(expoPayload).select("id").single();

    if (expoErr || !expoRes?.id) {
      console.error("❌ expo insert failed:", expoErr);
      setStatus(expoErr?.message || "Failed to create expo.", "error");
      return;
    }
    const expoId = expoRes.id;

    // 2) Optional hero image upload
    try {
      const file = els.hero.files?.[0];
      if (file) {
        const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
        const path = `expos/${expoId}/hero.${ext}`;
        const { error: upErr } = await supabase.storage.from("expo-images")
          .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
        if (upErr) {
          console.warn("⚠️ hero upload failed (continuing):", upErr);
        } else {
          const { data: pub } = await supabase.storage.from("expo-images").getPublicUrl(path);
          const heroUrl = pub?.publicUrl || null;
          if (heroUrl) {
            await supabase.from("expos").update({ hero_image: heroUrl }).eq("id", expoId);
          }
        }
      }
    } catch (e) {
      console.warn("⚠️ hero upload error (continuing):", e);
    }

    // 3) Schedules (one row per checked day)
    const ordinal = parseInt(els.ordinal.value, 10) || 1;
    const start = els.start.value || "10:00";
    const end = els.end.value || "16:00";
    const tz = els.tz.value || "America/New_York";

    const schedRows = days.map(d => ({
      expo_id: expoId,
      ordinal,
      day_of_week: d,
      start_time: start,
      end_time: end,
      timezone: tz,
      active: true,
    }));

    const { error: schedErr } = await supabase.from("expo_schedules").insert(schedRows);
    if (schedErr) {
      console.warn("⚠️ schedule insert failed (continuing):", schedErr);
    }

    setStatus("Submitted! Your expo is pending approval.", "success");
    console.log("✅ Expo submitted:", expoId);
    els.form.reset();
  });
} else {
  console.warn("⚠️ expo form not found");
}
