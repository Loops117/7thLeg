// assets/js/index_landing.js
console.log("✅ index_landing.js loaded");

(async function main() {
  await waitFor(() => window.supabase && window.supabase.auth).catch(() => {});

  // Auto-redirect logged-in users to the Hub (unless ?landing=1)
  try {
    const { data } = await window.supabase.auth.getUser();
    if (data?.user) {
      const url = new URL(window.location.href);
      if (!url.searchParams.get("landing")) {
        window.location.replace("/communityhub/hub.html");
        return;
      }
    }
  } catch (e) {
    console.warn("⚠️ redirect check failed:", e);
  }

  // Not logged in → show stats + market preview
  try { await hydrateStats(); } catch (e) { console.warn("stats error:", e); }
  try { if (typeof hydrateMarketListings === "function") { await hydrateMarketListings(); } } catch (e) { console.warn("market preview error:", e); }
})();

/* ------------------------------- helpers -------------------------------- */
function waitFor(cond, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (cond()) { clearInterval(iv); resolve(true); }
      else if (Date.now() - t0 > timeout) { clearInterval(iv); reject(new Error("timeout")); }
    }, 50);
  });
}
function el(id) { return document.getElementById(id); }
function setNum(id, n) { const node = el(id); if (node) node.textContent = (n ?? 0).toLocaleString(); }
function escapeHTML(s) {
  return String(s || "").replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39'}[c]));
}



/* -------------------------------- stats --------------------------------- */
async function hydrateStats() {
  const sb = window.supabase;
  try {
    // Fetch last 15 days (running totals)
    const { data: rows, error } = await sb
      .from("daily_counts_running")
      .select("day_date, users_total, species_tracked_total, images_uploaded_total, stores_total, listings_total, listings_active_snapshot, expos_approved_total, auctions_total, trades_total")
      .order("day_date", { ascending: false })
      .limit(15);

    if (error) throw error;
    const series = (rows || []).slice().reverse(); // oldest -> newest
    const latest = series[series.length - 1] || {};

    // Badges count (single head query)
    const { count: badges } = await sb.from("user_badges").select("id", { count: "exact", head: true });

    // Numbers
    setNum("stat-species", latest?.species_tracked_total || 0);
    setNum("stat-photos", latest?.images_uploaded_total || 0);
    setNum("stat-users", latest?.users_total || 0);
    setNum("stat-stores", latest?.stores_total || 0);
    setNum("stat-listings", latest?.listings_active_snapshot ?? latest?.listings_total ?? 0);
    setNum("stat-expos", latest?.expos_approved_total || 0);
    setNum("stat-auctrade", (latest?.auctions_total || 0) + (latest?.trades_total || 0));
    setNum("stat-badges", badges || 0);

    // Sparklines (15-day series)
    setSparkImg("stat-species", series.map(r => r.species_tracked_total ?? 0));
    setSparkImg("stat-photos", series.map(r => r.images_uploaded_total ?? 0));
    setSparkImg("stat-users", series.map(r => r.users_total ?? 0));
    setSparkImg("stat-stores", series.map(r => r.stores_total ?? 0));
    setSparkImg("stat-listings", series.map(r => (r.listings_active_snapshot ?? r.listings_total ?? 0)));
    setSparkImg("stat-expos", series.map(r => r.expos_approved_total ?? 0));
    setSparkImg("stat-auctrade", series.map(r => (r.auctions_total ?? 0) + (r.trades_total ?? 0)));
    // (We can add a badges sparkline later if desired.)
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}






/* --------------------------- sparkline helpers --------------------------- */
function makeSparkline(values, { width=300, height=120, strokeWidth=4 } = {}) {
  if (!values || values.length === 0) return "";
  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 6;
  const w = width, h = height;
  const x = (i) => (i * (w - pad*2)) / Math.max(1, n - 1) + pad;
  const y = (v) => {
    if (max === min) return h/2;
    const t = (v - min) / (max - min);
    return h - pad - t * (h - pad*2);
  };

  let d = "";
  for (let i = 0; i < n; i++) {
    const xi = x(i), yi = y(values[i]);
    d += (i === 0 ? `M${xi} ${yi}` : ` L${xi} ${yi}`);
  }

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>
    <path d='${d}' fill='none' stroke='%230d6efd' stroke-width='${strokeWidth}' stroke-linecap='round' stroke-linejoin='round' />
  </svg>`;
  // Encode as data URI
  const uri = "data:image/svg+xml," + encodeURIComponent(svg);
  return `url("${uri}")`;
}

function setSparkImg(elOrId, values) {
  const el = typeof elOrId === "string" ? document.getElementById(elOrId) : elOrId;
  if (!el) return;
  const host = el.closest(".stat-card") || el.closest(".card") || el;
  if (!host) return;
  host.classList.add("sparkline-card");
  const url = makeSparkline(values);
  if (url) host.style.setProperty("--spark-image", url);
}

/* --------------------------- sparkline <img> helpers --------------------------- */
function sparkDataURI(values, { width=300, height=120, strokeWidth=4 } = {}) {
  if (!values || values.length === 0) return "";
  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 6;
  const w = width, h = height;
  const x = (i) => (i * (w - pad*2)) / Math.max(1, n - 1) + pad;
  const y = (v) => {
    if (max === min) return h/2;
    const t = (v - min) / (max - min);
    return h - pad - t * (h - pad*2);
  };

  let d = "";
  for (let i = 0; i < n; i++) {
    const xi = x(i), yi = y(values[i] ?? 0);
    d += (i === 0 ? `M${xi} ${yi}` : ` L${xi} ${yi}`);
  }

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>
    <path d='${d}' fill='none' stroke='#0d6efd' stroke-width='${strokeWidth}' stroke-linecap='round' stroke-linejoin='round' />
  </svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

function setSparkImg(elOrId, values) {
  const el = typeof elOrId === "string" ? document.getElementById(elOrId) : elOrId;
  if (!el) return;
  // Choose host card
  let host = el.closest(".spark-host") || el.closest(".stat-card") || el.closest(".card") || el;
  host.classList.add("spark-host");
  if (getComputedStyle(host).position === "static") {
    host.style.position = "relative";
  }
  // Create or reuse <img.spark-bg>
  let img = host.querySelector(":scope > img.spark-bg");
  if (!img) {
    img = document.createElement("img");
    img.className = "spark-bg";
    img.alt = "";
    host.prepend(img);
  }
  const uri = sparkDataURI(values);
  if (uri) img.src = uri;
}
