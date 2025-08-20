// /assets/js/swr-cache.js
// Lightweight SWR (stale‑while‑revalidate) cache using localStorage.
// Use: swrGet(key, fetcher, {ttlMs: 60000, staleMs: 0}).
// - Returns fresh or stale data immediately (if present), then revalidates if stale.
// - Call swrInvalidate(key) after mutations.

(function(global){
  const LS_KEY = "__swr_cache_v1__";

  function now(){ return Date.now(); }

  function readAll(){
    try{ return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }catch{ return {}; }
  }
  function writeAll(obj){
    try{ localStorage.setItem(LS_KEY, JSON.stringify(obj)); }catch(e){ /* ignore quota */ }
  }
  function read(key){
    const all = readAll();
    return all[key];
  }
  function write(key, value){
    const all = readAll();
    all[key] = value;
    writeAll(all);
  }
  function remove(key){
    const all = readAll();
    delete all[key];
    writeAll(all);
  }

  async function swrGet(key, fetcher, opts){
    const { ttlMs=120000, staleMs=0, onUpdate } = (opts||{});
    const entry = read(key);
    const t = now();
    if (entry && entry.data !== undefined){
      const age = t - (entry.ts||0);
      const fresh = age <= ttlMs;
      // Return cached immediately
      setTimeout(()=>{ if (onUpdate) onUpdate(entry.data, { fromCache:true, fresh }); }, 0);
      // Revalidate if stale
      if (!fresh){
        try{
          const data = await fetcher();
          write(key, { data, ts: now() });
          if (onUpdate) onUpdate(data, { fromCache:false, fresh:true });
        }catch{ /* keep stale */ }
      }
      return entry.data;
    } else {
      // Cold fetch
      const data = await fetcher();
      write(key, { data, ts: now() });
      if (onUpdate) onUpdate?.(data, { fromCache:false, fresh:true });
      return data;
    }
  }

  function swrInvalidate(key){ remove(key); }

  // Key helpers
  function k(parts){
    return parts.map(p => (typeof p === "string" ? p : JSON.stringify(p))).join("|");
  }

  global.SWRCache = { swrGet, swrInvalidate, key: k };
})(window);
