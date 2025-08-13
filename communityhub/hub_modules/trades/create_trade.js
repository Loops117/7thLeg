// create_trade.js — normalize `trade_type` and `shipping_option` BEFORE insert to avoid a 400 first try.
// Keeps species column detection, morph display in picker, and detailed error logs.
export async function init() {
  const supabase = window.supabase;

  const ui = {
    speciesList: document.getElementById("species-list"),
    form: document.getElementById("trade-form"),
    msg: document.getElementById("form-message"),
  };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { alert("You must be logged in."); return; }

  // Load user's inventory
  const { data: inventory, error: invErr } = await supabase
    .from("user_inventories")
    .select("id, species, morph_name, common_name, insect_type")
    .eq("user_id", user.id);

  if (invErr) {
    console.error("Failed to load inventory:", invErr);
    ui.msg.textContent = "Failed to load your inventory.";
    return;
  }

  // Render species list
  (inventory || []).forEach(item => {
    const row = document.createElement("tr");
    const label = item.morph_name && item.morph_name.trim()
      ? `${item.species} - ${item.morph_name}`
      : item.species;
    row.innerHTML = `
      <td><input class="form-check-input" type="checkbox" value="${item.id}" id="species-${item.id}"></td>
      <td><label for="species-${item.id}" class="mb-0"><em>${label}</em></label></td>
      <td>${item.common_name || ""}</td>
      <td>${item.insect_type || "Unknown"}</td>
    `;
    ui.speciesList.appendChild(row);
  });

  ui.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    ui.msg.textContent = "";

    const title = document.getElementById("title").value.trim();
    const tradeTypeUI = (document.getElementById("trade_type").value || "").toLowerCase().trim();
    const distanceRaw = document.getElementById("distance").value;
    const distance = Number.isFinite(parseInt(distanceRaw)) ? parseInt(distanceRaw) : 0;
    let shippingUI = (document.getElementById("shipping_option").value || "").toLowerCase().trim();
    const description = document.getElementById("description").value.trim();
    const tos_agreement = document.getElementById("tos_agreement").checked;

    const selectedSpecies = Array.from(document.querySelectorAll("#species-list input:checked"))
      .map(el => el.value);

    if (!title) return (ui.msg.textContent = "Please enter a title.");
    if (!selectedSpecies.length) return (ui.msg.textContent = "Please select at least one species.");
    if (!tos_agreement) return (ui.msg.textContent = "You must agree to the Terms of Service.");

    // Map UI -> DB trade_type ('offering' | 'seeking')
    function mapTradeType(v) {
      const OFFERING = new Set(["have","offer","offering","have_to_trade","have_to_sell","give","giving"]);
      const SEEKING  = new Set(["want","request","seeking","want_to_trade","want_to_buy","looking_for","lf"]);
      if (OFFERING.has(v)) return "offering";
      if (SEEKING.has(v))  return "seeking";
      return "offering";
    }
    const trade_type = mapTradeType(tradeTypeUI);

    // Normalize shipping option BEFORE insert to avoid a first 400
    function mapShipping(v) {
      const m = { local: "local_only", ship: "ship_only", shipping: "ship_only", pickup: "local_only", both: "both" };
      return m[v] || v;
    }
    const shipping_option = mapShipping(shippingUI);

    // Discover which species column exists in user_trades
    async function pickSpeciesColumn() {
      const candidates = ["species_ids", "species", "species_list", "species_json", "species_data"];
      for (const col of candidates) {
        const { error } = await supabase.from("user_trades").select(col).limit(1);
        if (!error) return col;
      }
      return null;
    }
    const speciesCol = await pickSpeciesColumn();
    if (!speciesCol) {
      ui.msg.textContent = "Trades table is missing a species column. Expected one of: species_ids, species, species_list, species_json, species_data.";
      console.error("No compatible species column found on user_trades.");
      return;
    }

    const payload = {
      user_id: user.id,
      title,
      trade_type,
      distance,
      shipping_option,
      description,
      tos_agreement,
    };
    if (/json|data|list/i.test(speciesCol) && speciesCol !== "species_ids") {
      payload[speciesCol] = selectedSpecies.map(id => ({ id }));
    } else {
      payload[speciesCol] = selectedSpecies;
    }

    // Single attempt (no need to retry if we map first)
    const { error } = await supabase.from("user_trades").insert([payload]);

    if (error) {
      console.error("❌ Trade insert failed:", error, "Payload:", payload);
      ui.msg.textContent = (error.details || error.message || "Failed to post trade.") + " (see console)";
      return;
    }

    alert("Trade posted!");
    if (typeof window.loadModule === "function") {
      loadModule("auctions_trades");
    } else {
      window.location.href = "?module=trades";
    }
  });
}
