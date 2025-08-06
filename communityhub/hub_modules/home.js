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
        <span class="badge bg-success d-flex align-items-center p-2 shadow-sm" title="${b.badges.description || ""}">
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
    const { data: bulletins, error: bulletinError } = await supabase
      .from("bulletins")
      .select("message, created_at, profiles(full_name)")
      .eq("type", "general")
      .order("created_at", { ascending: false })
      .limit(10);

    const bulletinTable = document.querySelector("#bulletin-table");
    if (bulletinError || !bulletins?.length) {
      bulletinTable.innerHTML = "<tr><td colspan='3'>No recent bulletins.</td></tr>";
    } else {
      bulletinTable.innerHTML = bulletins.map(b => `
        <tr>
          <td><strong>${b.profiles?.full_name || "Unknown"}</strong></td>
          <td>${b.message}</td>
          <td><small>${new Date(b.created_at).toLocaleString()}</small></td>
        </tr>`).join("");
    }

    // ✅ Dynamically wait for bulletin form and bind listener
    const waitForElement = (selector, timeout = 2000) =>
      new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        const observer = new MutationObserver(() => {
          const el = document.querySelector(selector);
          if (el) {
            observer.disconnect();
            resolve(el);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
          observer.disconnect();
          reject(new Error(`Element ${selector} not found`));
        }, timeout);
      });

    const form = await waitForElement("#bulletin-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("bulletin-input");
      const message = input.value.trim();
      if (!message) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("You must be logged in to post a bulletin.");
        return;
      }

      const { data, error } = await supabase.from("bulletins").insert({
        user_id: user.id,
        message: message,
        type: "general"
      }).select("id, message, created_at").single();

      if (error) {
        console.error("❌ Failed to post bulletin:", error);
        alert("Failed to post bulletin.");
        return;
      }

      input.value = "";

      const name = document.getElementById("nav-user")?.textContent || "You";
      const date = new Date(data.created_at).toLocaleString();
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><strong>${name}</strong></td>
        <td>${data.message}</td>
        <td><small>${date}</small></td>`;
      document.querySelector("#bulletin-table").prepend(row);
    });

    // Load Species
    const { data: species } = await supabase
      .from("user_inventories")
      .select("id, species, common_name, cover_image")
      .eq("user_id", userId)
      .order("species", { ascending: true })
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
