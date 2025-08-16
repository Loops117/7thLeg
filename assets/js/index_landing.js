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
  try { await hydrateMarketListings(); } catch (e) { console.warn("market preview error:", e); }
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
    // Species tracked (row count)
    const { count: speciesCount } = await sb
      .from("user_inventories").select("id", { count: "exact", head: true });

    // Photos (non-null cover_image)
    const { count: photos } = await sb
      .from("user_inventories").select("id", { count: "exact", head: true })
      .not("cover_image", "is", null);

    // Users
    const { count: users } = await sb
      .from("profiles").select("id", { count: "exact", head: true });

    // Badges
    const { count: badges } = await sb
      .from("user_badges").select("id", { count: "exact", head: true });

    // Stores
    const { count: stores } = await sb
      .from("store_profiles").select("id", { count: "exact", head: true });

    // Active listings
    const { count: listings } = await sb
      .from("store_listings").select("id", { count: "exact", head: true })
      .eq("active", true);

    // Approved expos
    const { count: expos } = await sb
      .from("expos").select("id", { count: "exact", head: true })
      .eq("approved", true);

    // Auctions + Trades (from your schema list)
    const { count: auctionsCount } = await sb
      .from("auctions").select("id", { count: "exact", head: true });
    const { count: tradesCount } = await sb
      .from("trades").select("id", { count: "exact", head: true });

    setNum("stat-species", speciesCount || 0);
    setNum("stat-photos", photos || 0);
    setNum("stat-users", users || 0);
    setNum("stat-badges", badges || 0);
    setNum("stat-stores", stores || 0);
    setNum("stat-listings", listings || 0);
    setNum("stat-expos", expos || 0);
    setNum("stat-auctrade", ((auctionsCount || 0) + (tradesCount || 0)));
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}
