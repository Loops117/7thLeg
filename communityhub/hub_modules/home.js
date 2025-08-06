const supabase = window.supabase;

(async () => {
  try {
    console.log("✅ hub home.js running with window.supabase");

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      document.getElementById("hub-content").innerHTML =
        "<p class='text-danger'>You must be logged in to view the hub.</p>";
      return;
    }
    const userId = user.id;

    // Load Badges
    const { data: badges } = await supabase
      .from("user_badges")
      .select("badges(name, description, icon_url)")
      .eq("user_id", userId);

    const badgeContainer = document.getElementById("user-badges");
    badgeContainer.innerHTML = badges?.length
      ? badges.map(b => `
          <span class="badge bg-success d-flex align-items-center p-2 shadow-sm"
            title="${b.badges.description || ""}">
            ${b.badges.icon_url
              ? `<img src="${b.badges.icon_url}" alt="${b.badges.name}" style="height:20px; margin-right:6px;">`
              : ""}
            ${b.badges.name}
          </span>`).join("")
      : "<p>No badges yet.</p>";

    // Load Reviews for Rating
    const { data: reviews } = await supabase
      .from("reviews")
      .select("rating")
      .eq("reviewed_id", userId);

    const ratingEl = document.getElementById("user-rating");
    if (reviews?.length) {
      const avg = reviews.reduce((a, r) => a + r.rating, 0) / reviews.length;
      ratingEl.textContent = "⭐".repeat(Math.round(avg)) + ` (${reviews.length} reviews)`;
    }

    // Load Bulletins
    const { data: bulletins } = await supabase
      .from("bulletins")
      .select("message, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    const bulletinTable = document.getElementById("bulletin-table");
    bulletinTable.innerHTML = bulletins?.length
      ? bulletins.map(b => `
          <tr>
            <td>${b.message}
              <br><small class="text-muted">${new Date(b.created_at).toLocaleDateString()}</small>
            </td>
          </tr>`).join("")
      : "<tr><td>No bulletins yet.</td></tr>";

    // Load Species
    const { data: species } = await supabase
      .from("user_inventories")
      .select("id, species, common_name, cover_image")
      .eq("user_id", userId)
      .order("species", { ascending: true }) // ✅ alphabetical
      .limit(5);

    const speciesThumbs = document.getElementById("species-thumbs");
    speciesThumbs.innerHTML = species?.length
      ? species.map(s => `
          <a href="/tabs/inventory/view.species.html?id=${s.id}" title="${s.common_name || s.species}">
            <img src="${s.cover_image || '/assets/images/default-species.jpg'}"
                 alt="${s.species}" class="img-thumbnail"
                 style="width:75px;height:75px;object-fit:cover;">
          </a>`).join("")
      : "<p>No species yet.</p>";

    // Load Auctions
    const { data: auctions } = await supabase
      .from("auctions")
      .select("id, current_bid, products(name)")
      .order("created_at", { ascending: false })
      .limit(5);

    const auctionsList = document.getElementById("recent-auctions");
    auctionsList.innerHTML = auctions?.length
      ? auctions.map(a => `
          <li class="list-group-item">
            <a href="/communityhub/hub.html?module=auctions_trades#auction-${a.id}">
              ${a.products?.name || "Unnamed Product"} — $${a.current_bid}
            </a>
          </li>`).join("")
      : "<li class='list-group-item'>No auctions found</li>";

    // Load Trades
    const { data: trades } = await supabase
      .from("trades")
      .select("id, status, offered:products!trades_offered_product_id_fkey(name), requested:products!trades_requested_product_id_fkey(name)")
      .order("created_at", { ascending: false })
      .limit(5);

    const tradesList = document.getElementById("recent-trades");
    tradesList.innerHTML = trades?.length
      ? trades.map(t => `
          <li class="list-group-item">
            <a href="/communityhub/hub.html?module=auctions_trades#trade-${t.id}">
              ${t.offered?.name || "Unknown"} ⇄ ${t.requested?.name || "Unknown"}
              <span class="text-muted">— ${t.status}</span>
            </a>
          </li>`).join("")
      : "<li class='list-group-item'>No trades found</li>";

  } catch (err) {
    console.error("❌ Error building home module:", err);
    document.getElementById("hub-content").innerHTML =
      "<p class='text-danger'>Failed to load home module.</p>";
  }
})();
