
// communityhub/hub_modules/auctions_trades.js
// Adds "Mine / All" toggles next to the header action buttons (defaults to All).
// Keeps existing card rendering, includes morph in species list, countdowns, and open-card behavior.

console.log("✅ auctions_trades.js loaded (Mine/All toggles in header, default=All)");

const state = {
  auctionsFilter: 'all', // 'all' | 'mine'
  tradesFilter: 'all',   // 'all' | 'mine'
};

export async function init() {
  const supabase = window.supabase;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Wire primary actions
  document.getElementById("create-auction-btn")?.addEventListener("click", () => {
    loadModule("auctions/create_auction");
  });
  document.getElementById("post-trade-btn")?.addEventListener("click", () => {
    loadModule("trades/create_trade");
  });

  // Place toggles next to header buttons (preferred)
  const aBtn = document.getElementById("create-auction-btn");
  const tBtn = document.getElementById("post-trade-btn");

  const aToggle = buildToggleUI('auctions', (val) => {
    state.auctionsFilter = val;
    loadAuctions();
  });
  const tToggle = buildToggleUI('trades', (val) => {
    state.tradesFilter = val;
    loadTrades();
  });

  if (aBtn?.parentElement) {
    aBtn.parentElement.insertBefore(aToggle, aBtn.nextSibling);
  } else {
    // Fallback: inject above list section
    injectToggleAboveSection('auctions-section', aToggle);
  }

  if (tBtn?.parentElement) {
    tBtn.parentElement.insertBefore(tToggle, tBtn.nextSibling);
  } else {
    // Fallback: inject above list section
    injectToggleAboveSection('trades-section', tToggle);
  }

  await loadAuctions();
  await loadTrades();
}

function buildToggleUI(kind, onChange) {
  // Use Bootstrap .btn-check radios for a compact, accessible toggle
  const groupId = `${kind}-filter`;
  const wrap = document.createElement('div');
  wrap.className = 'd-inline-flex align-items-center ms-2';
  wrap.innerHTML = `
    <div class="btn-group btn-group-sm" role="group" aria-label="${kind} filter">
      <input type="radio" class="btn-check" name="${groupId}" id="${groupId}-all" autocomplete="off" value="all" checked>
      <label class="btn btn-outline-secondary" for="${groupId}-all">All</label>
      <input type="radio" class="btn-check" name="${groupId}" id="${groupId}-mine" autocomplete="off" value="mine">
      <label class="btn btn-outline-secondary" for="${groupId}-mine">Mine</label>
    </div>
  `;
  wrap.querySelectorAll(`input[name="${groupId}"]`).forEach(inp => {
    inp.addEventListener('change', (e) => onChange(e.target.value));
  });
  return wrap;
}

function injectToggleAboveSection(sectionId, node) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  const bar = document.createElement('div');
  bar.className = 'd-flex align-items-center justify-content-end gap-2 mb-2';
  bar.appendChild(node);
  section.parentElement?.insertBefore(bar, section);
}

async function loadAuctions() {
  const supabase = window.supabase;
  const { data: { user } } = await supabase.auth.getUser();
  const filter = state.auctionsFilter;

  let query = supabase
    .from("user_auctions")
    .select("id, user_id, species_data, description, reserve_price, current_bid, end_date, created_at, profiles:user_auctions_user_id_fkey(full_name)")
    .order("created_at", { ascending: false });

  if (filter === 'mine') query = query.eq("user_id", user.id);

  const { data: auctions, error } = await query;
  if (error) {
    console.error("❌ Error loading auctions:", error);
    renderAuctions([]);
    return;
  }

  // Collect all species ids referenced
  const allIds = new Set();
  (auctions || []).forEach(a => {
    try {
      JSON.parse(a.species_data || "[]").forEach(s => s?.id && allIds.add(s.id));
    } catch {}
  });
  let inventoryMap = {};
  if (allIds.size) {
    const { data: inv, error: invErr } = await supabase
      .from("user_inventories")
      .select("id, species, morph_name, cover_image")
      .in("id", Array.from(allIds));
    if (invErr) console.warn("Inventory fetch failed", invErr);
    inventoryMap = Object.fromEntries((inv || []).map(i => [i.id, i]));
  }

  renderAuctions(auctions || [], inventoryMap);
  startCountdowns();
}

function renderAuctions(auctions, inventoryMap = {}) {
  const container = document.getElementById("auctions-section");
  if (!container) return;

  if (!auctions.length) {
    container.innerHTML = `<p class='text-muted mb-0'>No auctions found.</p>`;
    return;
  }

  const cards = auctions.map(a => {
    let items = [];
    try { items = JSON.parse(a.species_data || "[]"); } catch {}

    // Pick an image from the first species that has cover
    let image = "/assets/images/logo.png";
    for (const it of items) {
      const inv = inventoryMap[it.id];
      if (inv?.cover_image) { image = inv.cover_image; break; }
    }

    // Species list with Morph name if available: "Qty × Species - Morph"
    const speciesListHtml = items.length
      ? `<ul class="mb-2 ps-3">${items.map(s => {
          const inv = inventoryMap[s.id] || {};
          const base = inv.species || "Unknown";
          const morph = (inv.morph_name || "").trim();
          const name = morph ? `${base} - ${morph}` : base;
          const qty = s?.qty ?? "—";
          return `<li>${qty}× <em>${escapeHtml(name)}</em></li>`;
        }).join("")}</ul>`
      : "<p class='mb-2 text-muted'>No species listed</p>";

    const owner = a.profiles?.full_name || "Unknown";
    const reserve = a.reserve_price != null ? `$${Number(a.reserve_price).toLocaleString()}` : "None";
    const current = a.current_bid != null ? `$${Number(a.current_bid).toLocaleString()}` : "None";
    const desc = a.description ? `<p class="card-text mb-2">${escapeHtml(a.description)}</p>` : "";

    return `
    <div class="auction-card-wrapper text-decoration-none text-dark" data-id="${a.id}" style="cursor:pointer;">
      <div class="card mb-3 shadow-sm">
        <div class="row g-0">
          <div class="col-md-4">
            <div style="width:100%; aspect-ratio:1; overflow:hidden;">
              <img src="${image}" class="img-fluid" style="width:100%; height:100%; object-fit:cover;" alt="Auction image">
            </div>
          </div>
          <div class="col-md-8">
            <div class="card-body">
              ${desc}
              <div class="small text-muted mb-1"><strong>By:</strong> ${escapeHtml(owner)}</div>
              <div class="small text-muted mb-1"><strong>Current Bid:</strong> ${current}</div>
              <div class="small text-muted mb-2"><strong>Reserve Price:</strong> ${reserve}</div>
              <div class="small text-muted mb-3">Time Left: <span class="countdown" data-end="${a.end_date || ''}"></span></div>
              <div><strong>Species Included:</strong>${speciesListHtml}</div>
              <button class="btn btn-primary btn-sm open-auction mt-1" data-id="${a.id}">Open</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");

  container.innerHTML = cards;

  // Click handlers (card + button)
  container.querySelectorAll(".auction-card-wrapper, .open-auction").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      loadModule("auctions/auction_card", { id });
    });
  });
}

function startCountdowns() {
  const spans = document.querySelectorAll(".countdown");
  const tick = () => {
    const now = Date.now();
    spans.forEach(span => {
      const end = new Date(span.dataset.end).getTime();
      const diff = end - now;
      if (!span.dataset.end || isNaN(end)) {
        span.textContent = "—";
      } else if (diff <= 0) {
        span.textContent = "Ended";
      } else {
        const hrs = Math.floor(diff / 3_600_000);
        const mins = Math.floor((diff % 3_600_000) / 60_000);
        const secs = Math.floor((diff % 60_000) / 1000);
        span.textContent = `${hrs}h ${mins}m ${secs}s`;
      }
    });
  };
  tick();
  setInterval(tick, 1000);
}

async function loadTrades() {
  const supabase = window.supabase;
  const { data: { user } } = await supabase.auth.getUser();
  const filter = state.tradesFilter;

  let query = supabase
    .from("user_trades")
    .select("id, user_id, title, created_at, profiles:user_trades_user_id_fkey(full_name, location)")
    .order("created_at", { ascending: false });

  if (filter === 'mine') query = query.eq("user_id", user.id);

  const { data, error } = await query;
  if (error) {
    console.error("❌ Error loading trades:", error);
    renderTrades([]);
    return;
  }
  renderTrades(data || []);
}

function renderTrades(rows) {
  const container = document.getElementById("trades-section");
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = `<p class='text-muted mb-0'>No trades found.</p>`;
    return;
  }

  container.innerHTML = rows.map(t => `
    <div class="card mb-3 shadow-sm">
      <div class="card-body">
        <h5 class="card-title">${escapeHtml(t.title || "Untitled Trade")}</h5>
        <p class="card-text mb-1">Date: ${new Date(t.created_at).toLocaleDateString()}</p>
        <p class="card-text mb-1">By: ${escapeHtml(t.profiles?.full_name || "Unknown")}</p>
        <p class="card-text mb-2">Location: ${escapeHtml(t.profiles?.location || "N/A")}</p>
        <button class="btn btn-outline-primary btn-sm open-trade" data-id="${t.id}">Open</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".open-trade").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      loadModule("trades/view_trade", { id });
    });
  });
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&quot;',"'":'&#39;'}[m]));
}
