// view_trade.js (patched: adds wishlist & inventory, robust species column detection, links)
export async function init(options = {}) {
  const supabase = window.supabase;
  const id = options.id || new URLSearchParams(location.search).get("id");
  const root = document.getElementById("trade-view");

  if (!id) {
    root.innerHTML = "<p>Missing trade id.</p>";
    return;
  }

  const { data: trade, error } = await supabase.from("user_trades").select("*").eq("id", id).single();
  if (error || !trade) {
    root.innerHTML = "<p>Trade not found.</p>";
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, location")
    .eq("id", trade.user_id)
    .single();

  // Header fields
  document.getElementById("trade-title").textContent = trade.title || "Trade";
  document.getElementById("trade-owner").textContent = profile?.full_name || "Unknown";
  document.getElementById("trade-location").textContent = profile?.location || "Unknown";
  document.getElementById("trade-type").textContent = trade.trade_type || "—";
  document.getElementById("trade-distance").textContent = trade.distance ? `${trade.distance} miles` : "Not specified";
  document.getElementById("trade-shipping").textContent = trade.shipping_option || "—";
  document.getElementById("trade-description").textContent = trade.description || "None";

  // Species involved column could be any of these; normalize to array of IDs
  let speciesIds = Array.isArray(trade.species_ids) ? trade.species_ids : null;
  if (!speciesIds) {
    const raw = trade.species_data || trade.species_json || trade.species_list || trade.species;
    try {
      const arr = typeof raw === "string" ? JSON.parse(raw || "[]") : (raw || []);
      // pick id from objects
      speciesIds = (arr || []).map(x => (typeof x === "string" ? x : x?.id)).filter(Boolean);
    } catch {
      speciesIds = [];
    }
  }

  // Fetch species details
  let speciesDetails = [];
  if (speciesIds.length) {
    const { data: inv } = await supabase
      .from("user_inventories")
      .select("id, species, common_name")
      .in("id", speciesIds);
    speciesDetails = inv || [];
  }
  const list = document.getElementById("trade-species-list");
  list.innerHTML = "";
  (speciesDetails || []).forEach(sp => {
    const li = document.createElement("li");
    const label = sp.common_name ? `${sp.species} (${sp.common_name})` : sp.species;
    li.textContent = label;
    list.appendChild(li);
  });
  if (!speciesDetails.length) {
    list.innerHTML = "<li class='text-muted'>None listed</li>";
  }

  // --- Wishlist: species, common_name, insect_type ---
  const wBody = document.getElementById("wishlist-body");
  wBody.innerHTML = "<tr><td colspan='3' class='text-muted'>Loading...</td></tr>";
  const { data: wishlist, error: wErr } = await supabase
    .from("user_wishlist")
    .select("species, common_name, insect_type")
    .eq("user_id", trade.user_id)
    .order("species", { ascending: true });

  if (wErr) {
    wBody.innerHTML = `<tr><td colspan="3" class="text-danger">Failed to load wishlist</td></tr>`;
  } else if (!wishlist || !wishlist.length) {
    wBody.innerHTML = `<tr><td colspan="3" class="text-muted">No wishlist items</td></tr>`;
  } else {
    wBody.innerHTML = wishlist.map(w => `
      <tr>
        <td>${w.species || ""}</td>
        <td>${w.common_name || ""}</td>
        <td>${w.insect_type || ""}</td>
      </tr>
    `).join("");
  }

  // --- Inventory: species, morph_name, insect_type (owner's inventory) ---
  const iBody = document.getElementById("inventory-body");
  iBody.innerHTML = "<tr><td colspan='3' class='text-muted'>Loading...</td></tr>";
  const { data: invAll, error: iErr } = await supabase
    .from("user_inventories")
    .select("species, morph_name, insect_type")
    .eq("user_id", trade.user_id)
    .order("species", { ascending: true });

  if (iErr) {
    iBody.innerHTML = `<tr><td colspan="3" class="text-danger">Failed to load inventory</td></tr>`;
  } else if (!invAll || !invAll.length) {
    iBody.innerHTML = `<tr><td colspan="3" class="text-muted">No inventory</td></tr>`;
  } else {
    iBody.innerHTML = invAll.map(s => {
      const label = s.morph_name && s.morph_name.trim()
        ? `${s.species} - ${s.morph_name}`
        : s.species || "";
      return `
        <tr>
          <td>${label}</td>
          <td>${s.morph_name || ""}</td>
          <td>${s.insect_type || ""}</td>
        </tr>`;
    }).join("");
  }
}
