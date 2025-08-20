// /assets/js/rest-profiler.js
// Lightweight REST request profiler for PostgREST (Supabase) endpoints.
// Add this near the TOP of hub.html (TEMP while debugging).
// It wraps fetch(), counts calls to /rest/v1/*, and prints periodic summaries.
// Usage in console:
//   RestProfiler.report(30)   // show top 30
//   RestProfiler.reset()      // clear counters
// Remove once you've identified noisy endpoints.

(function () {
  if (window.__RestProfilerInstalled) return;
  window.__RestProfilerInstalled = true;

  const ORIG_FETCH = window.fetch.bind(window);
  const COUNTS = new Map(); // key => { n, lastTs, lastStatus }

  function keyOf(method, path) {
    return `${method.toUpperCase()} ${path}`;
  }

  function isPostgrest(url) {
    try {
      const u = new URL(url, location.origin);
      return /\/rest\/v1\//.test(u.pathname);
    } catch { return false; }
  }

  function record(url, method, status) {
    if (!isPostgrest(url)) return;
    const u = new URL(url, location.origin);
    const path = u.pathname + (u.search || "");
    const k = keyOf(method, path);
    const row = COUNTS.get(k) || { n: 0, lastTs: Date.now(), lastStatus: status };
    row.n += 1;
    row.lastTs = Date.now();
    row.lastStatus = status;
    COUNTS.set(k, row);
    // Persist occasionally for reloads
    if (row.n % 20 === 0) {
      try {
        const obj = Object.fromEntries(COUNTS.entries());
        localStorage.setItem("__rest_profiler_counts__", JSON.stringify(obj));
      } catch {}
    }
  }

  // Restore previous counts if present
  try {
    const raw = localStorage.getItem("__rest_profiler_counts__");
    if (raw) {
      const obj = JSON.parse(raw);
      Object.entries(obj).forEach(([k, v]) => COUNTS.set(k, v));
    }
  } catch {}

  window.fetch = async function (input, init) {
    const url = (typeof input === "string") ? input : input.url;
    const method = (init?.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();
    const res = await ORIG_FETCH(input, init);
    try { record(url, method, res.status); } catch {}
    return res;
  };

  function report(limit = 20) {
    const rows = [...COUNTS.entries()].map(([key, v]) => ({ key, ...v }));
    rows.sort((a, b) => b.n - a.n);
    const top = rows.slice(0, limit);
    console.groupCollapsed(`📊 REST Top ${top.length} endpoints (since load)`);
    top.forEach(r => console.log(`${r.n}×  ${r.key}  (last ${r.lastStatus})`));
    console.groupEnd();
  }

  function reset() {
    COUNTS.clear();
    try { localStorage.removeItem("__rest_profiler_counts__"); } catch {}
    console.log("🔄 RestProfiler: counters reset");
  }

  // Periodic report
  const interval = setInterval(() => report(20), 15000);

  window.RestProfiler = { report, reset, _counts: COUNTS, _interval: interval };
  console.log("✅ rest-profiler installed — check console for periodic summaries");
})();
