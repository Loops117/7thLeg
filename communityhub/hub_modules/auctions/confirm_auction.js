console.log("✅ confirm_auction.js loaded (morph-aware)");

export async function init() {
  const supabase = window.supabase;
  const summaryBox = document.getElementById("auction-summary");
  const confirmBtn = document.getElementById("confirm-button");
  const backBtn = document.getElementById("back-button");
  const tosCheckbox = document.getElementById("tos-agree");

  const saved = localStorage.getItem("pendingAuction");
  if (!saved) {
    summaryBox.innerHTML = "<p class='text-danger'>No auction data found. Please return and refill the form.</p>";
    confirmBtn.disabled = true;
    return;
  }

  const auction = JSON.parse(saved);
  const speciesArray = JSON.parse(auction.species_data || "[]");

  // Build a map of inventory details so we can include morph_name when available
  const ids = speciesArray.map(s => s.id).filter(Boolean);
  let invMap = {};
  if (ids.length) {
    const { data: inv } = await supabase
      .from("user_inventories")
      .select("id, species, morph_name")
      .in("id", ids);
    (inv || []).forEach(i => invMap[i.id] = i);
  }

  let html = "<ul class='list-group mb-3'>";
  html += `<li class='list-group-item'><strong>Starting Bid:</strong> $${auction.starting_bid}</li>`;
  html += `<li class='list-group-item'><strong>Reserve Price:</strong> $${auction.reserve_price}</li>`;
  html += `<li class='list-group-item'><strong>Bid Increments:</strong> $${auction.increments}</li>`;
  html += `<li class='list-group-item'><strong>End Date:</strong> ${auction.end_date}</li>`;
  html += `<li class='list-group-item'><strong>Enhancements:</strong> ${auction.enhancements.join(", ") || "None"}</li>`;
  html += `<li class='list-group-item'><strong>Quantity:</strong> ${auction.quantity}</li>`;
  html += `<li class='list-group-item'><strong>Species:</strong><ul>`;
  speciesArray.forEach(s => {
    const inv = invMap[s.id] || {};
    const base = s.species || inv.species || "Unknown";
    const morph = (s.morph_name || inv.morph_name || "").trim();
    const label = morph ? `${base} - ${morph}` : base;
    html += `<li>${s.qty}x ${label}</li>`;
  });
  html += `</ul></li>`;
  html += `<li class='list-group-item'><strong>Payment Methods:</strong> ${auction.payment_methods.join(", ") || "None"}</li>`;
  html += `<li class='list-group-item'><strong>Description:</strong><br>${auction.description || "None"}</li>`;
  html += `<li class='list-group-item'><strong>Credits Required:</strong> ${auction.credit_cost}</li>`;
  html += "</ul>";
  summaryBox.innerHTML = html;

  // Enable confirm only when TOS is checked
  tosCheckbox.addEventListener("change", () => {
    confirmBtn.disabled = !tosCheckbox.checked;
  });

  // Back button restores form and goes back
  backBtn.addEventListener("click", () => {
    window.loadModule("auctions/create_auction");
  });

  // Confirm button submits data
  confirmBtn.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return alert("Not signed in");

    const { data: profile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();

    if (!profile || profile.credits < auction.credit_cost) {
      return alert("Not enough credits.");
    }

    const fullAuction = {
      ...auction,
      user_id: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: "open"
    };

    const { error } = await supabase.from("user_auctions").insert([fullAuction]);
    if (error) {
      alert("❌ Failed to post auction: " + error.message);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ credits: profile.credits - auction.credit_cost })
      .eq("id", user.id);

    if (updateError) console.error("⚠️ Failed to deduct credits", updateError);

    localStorage.removeItem("pendingAuction");
    window.loadModule("auctions_trades");
  });
}
