console.log("✅ auctions_trades.js loaded (species list per auction + morph name + trade links)");

export async function init() {
  document.getElementById("create-auction-btn")?.addEventListener("click", () => {
    loadModule("auctions/create_auction");
  });

  document.getElementById("post-trade-btn")?.addEventListener("click", () => {
    loadModule("trades/create_trade");
  });

  await loadAuctions();
  await loadTrades();
}

async function loadAuctions() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Pull description so we can show it on the card
  const { data: auctions, error } = await supabase
    .from("user_auctions")
    .select("id, user_id, species_data, description, quantity, reserve_price, current_bid, end_date, profiles:user_auctions_user_id_fkey(full_name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ Error loading auctions:", error);
    return;
  }

  // Gather all species IDs referenced by all auctions
  const allSpeciesIds = [];
  for (const a of auctions) {
    try {
      const items = JSON.parse(a.species_data || "[]");
      items.forEach(s => { if (s?.id) allSpeciesIds.push(s.id); });
    } catch {}
  }
  const uniqueIds = [...new Set(allSpeciesIds)];
  const container = document.getElementById("auctions-section");
  if (!container) return;

  if (uniqueIds.length === 0) {
    container.innerHTML = "<p class='text-muted mb-0'>No auctions yet.</p>";
    return;
  }

  // Fetch inventory info for those ids (species, morph_name, image)
  const { data: inventory, error: invErr } = await supabase
    .from("user_inventories")
    .select("id, species, morph_name, cover_image")
    .in("id", uniqueIds);

  if (invErr) console.warn("Inventory fetch failed", invErr);

  const inventoryMap = {};
  (inventory || []).forEach(i => inventoryMap[i.id] = i);

  // Build cards
  const cards = auctions.map(a => {
    let speciesItems = [];
    try { speciesItems = JSON.parse(a.species_data || "[]"); } catch {}

    // Choose an image from the first species that has a cover
    let image = "/assets/images/logo.png";
    for (const item of speciesItems) {
      const inv = inventoryMap[item.id];
      if (inv?.cover_image) { image = inv.cover_image; break; }
    }

    // Build species list (Qty × Species [ - Morph ])
    const speciesListHtml = speciesItems.length
      ? `<ul class="mb-2 ps-3">${speciesItems.map(s => {
          const inv = inventoryMap[s.id];
          const base = inv?.species || "Unknown";
          const morph = (inv?.morph_name || "").trim();
          const name = morph ? `${base} - ${morph}` : base;
          const qty = s?.qty ?? "—";
          return `<li>${qty}× <em>${name}</em></li>`;
        }).join("")}</ul>`
      : "<p class='mb-2 text-muted'>No species listed</p>";

    const owner = a.profiles?.full_name || "Unknown";
    const reserve = a.reserve_price ? `$${a.reserve_price}` : "None";
    const current = a.current_bid ? `$${a.current_bid}` : "None";
    const desc = a.description ? a.description : "";

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
              <h5 class="card-title">Auction</h5>
              ${desc ? `<p class="card-text mb-2">${desc}</p>` : ""}
              <div class="small text-muted mb-1"><strong>By:</strong> ${owner}</div>
              <div class="small text-muted mb-1"><strong>Current Bid:</strong> ${current}</div>
              <div class="small text-muted mb-2"><strong>Reserve Price:</strong> ${reserve}</div>
              <div class="small text-muted mb-3">Time Left: <span class="countdown" data-end="${a.end_date}"></span></div>
              <div><strong>Species Included:</strong>${speciesListHtml}</div>
              <button class="btn btn-primary btn-sm open-auction mt-1" data-id="${a.id}">Open</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");

  container.innerHTML = cards || "<p class='text-muted mb-0'>No auctions yet.</p>";

  // Click handlers (card + button) -> open auction card module
  container.querySelectorAll(".auction-card-wrapper, .open-auction").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      if (typeof window.loadModule === "function") {
        loadModule("auctions/auction_card", { id });
      } else {
        window.location.href = `/communityhub/hub.html?module=auctions/auction_card&id=${encodeURIComponent(id)}`;
      }
    });
  });

  startCountdowns();
}

function startCountdowns() {
  const spans = document.querySelectorAll(".countdown");
  const tick = () => {
    const now = Date.now();
    spans.forEach(span => {
      const end = new Date(span.dataset.end).getTime();
      const diff = end - now;
      if (isNaN(end)) {
        span.textContent = "—";
      } else if (diff <= 0) {
        span.textContent = "Ended";
      } else {
        const hrs = Math.floor(diff / 1000 / 60 / 60);
        const mins = Math.floor((diff / 1000 / 60) % 60);
        const secs = Math.floor((diff / 1000) % 60);
        span.textContent = `${hrs}h ${mins}m ${secs}s`;
      }
    });
  };
  tick();
  setInterval(tick, 1000);
}

async function loadTrades() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from("user_trades")
    .select("id, title, trade_type, created_at, profiles:user_trades_user_id_fkey(full_name, location)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ Error loading trades:", error);
    return;
  }

  const container = document.getElementById("trades-section");
  if (!container) return;

  container.innerHTML = (data || []).map(t => {
    const owner = t.profiles?.full_name || "Unknown";
    const loc = t.profiles?.location || "N/A";
    const date = new Date(t.created_at).toLocaleString();
    const type = (t.trade_type || "").toString();
    const href = `/communityhub/hub.html?module=trades/view_trade&id=${t.id}`;
    return `
      <a href="${href}" class="text-decoration-none" onclick="return openViewTrade('${t.id}')">
        <div class="card mb-3 shadow-sm">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center">
              <h5 class="card-title mb-0">${t.title}</h5>
              ${type ? `<span class="badge bg-secondary text-uppercase">${type}</span>` : ""}
            </div>
            <div class="small text-muted mt-1">
              <span class="me-2">${owner}</span> • <span class="mx-2">${loc}</span> • <span class="ms-2">${date}</span>
            </div>
          </div>
        </div>
      </a>`;
  }).join("") || "<p class='text-muted mb-0'>No trades found</p>";

  // In-hub loader helper (keeps navigation inside Hub when possible)
  if (!window.openViewTrade) {
    window.openViewTrade = function(id) {
      try {
        if (typeof window.loadModule === "function") {
          loadModule("trades/view_trade", { id });
          return false; // prevent navigation
        }
      } catch (e) {
        console.warn("openViewTrade fell back to href", e);
      }
      return true; // let the anchor navigate
    };
  }
}
