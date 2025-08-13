
const supabase = window.supabase;

// Helper: open auction card via module loader (preferred)
(function ensureOpenHelper(){
  if (!window.openAuctionCardModule) {
    window.openAuctionCardModule = function(id) {
      try {
        if (typeof window.loadModule === "function") {
          loadModule("auctions/auction_card", { id });
          return false;
        }
      } catch(e){ console.warn("loadModule failed; falling back to URL", e); }
      // Fallback: navigate (works if auction_card.js can self-init)
      window.location.href = `/communityhub/hub.html?module=auctions/auction_card&id=${encodeURIComponent(id)}`;
      return false;
    };
  }
})();

(async () => {
  try {
    console.log("✅ hub home.js (bulletins restored + auction card opener)");

    // --- Auth ---
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const root = document.getElementById("hub-content");
      if (root) root.innerHTML = "<p class='text-danger'>You must be logged in to view the hub.</p>";
      return;
    }
    const userId = user.id;

    // --- Badges ---
    try {
      const { data: badges } = await supabase
        .from("user_badges")
        .select("badges(name, description, icon_url)")
        .eq("user_id", userId);

      const badgeContainer = document.getElementById("user-badges");
      if (badgeContainer) {
        badgeContainer.innerHTML = badges?.length
          ? badges.map(b => `
            <span class="badge bg-success d-inline-flex align-items-center p-2 shadow-sm me-1 mb-1" title="${b.badges?.description || ""}">
              ${b.badges?.icon_url ? `<img src="${b.badges.icon_url}" alt="${b.badges?.name || ""}" style="height:20px; margin-right:6px;">` : ""}
              ${b.badges?.name || "Badge"}
            </span>`).join("")
          : "<p class='text-muted mb-0'>No badges yet.</p>";
      }
    } catch(e){ console.warn("Badges load failed", e); }

    // --- Reviews (rating) ---
    try {
      const { data: reviews } = await supabase
        .from("reviews")
        .select("rating")
        .eq("reviewed_id", userId);

      const ratingEl = document.getElementById("user-rating");
      if (ratingEl && reviews?.length) {
        const avg = reviews.reduce((a, r) => a + (r?.rating || 0), 0) / reviews.length;
        ratingEl.textContent = "⭐".repeat(Math.round(avg)) + ` (${reviews.length} reviews)`;
      }
    } catch(e){ console.warn("Reviews load failed", e); }

    // --- Bulletins (RESTORED) ---
    try {
      const { data: bulletins, error: bulletinError } = await supabase
        .from("bulletins")
        .select("user_id, message, created_at, profiles(full_name)")
        .eq("type", "general")
        .order("created_at", { ascending: false })
        .limit(10);

      const bulletinTable = document.querySelector("#bulletin-table");
      if (bulletinTable) {
        if (bulletinError || !bulletins?.length) {
          bulletinTable.innerHTML = "<tr><td colspan='3'>No recent bulletins.</td></tr>";
        } else {
          bulletinTable.innerHTML = bulletins.map(b => {
            const isCurrentUser = b.user_id === userId;
            const nameCell = isCurrentUser
              ? `<strong>You</strong>`
              : `<strong><a href="/communityhub/hub.html?module=profile&id=${b.user_id}">${b.profiles?.full_name || "Unknown"}</a></strong>`;
            const date = new Date(b.created_at).toLocaleString();
            return `
              <tr>
                <td>${nameCell}</td>
                <td>${b.message}</td>
                <td><small>${date}</small></td>
              </tr>`;
          }).join("");
        }
      }

      // Bind bulletin post
      const form = document.querySelector("#bulletin-form");
      if (form) {
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const input = document.getElementById("bulletin-input");
          const message = (input?.value || "").trim();
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

          if (input) input.value = "";

          const name = "You";
          const date = new Date(data.created_at).toLocaleString();
          const row = document.createElement("tr");
          row.innerHTML = `
            <td><strong>${name}</strong></td>
            <td>${data.message}</td>
            <td><small>${date}</small></td>`;
          document.querySelector("#bulletin-table")?.prepend(row);
        });
      }
    } catch(e){ console.warn("Bulletins load failed", e); }

    // --- Species (thumbnails) ---
    try {
      const { data: species } = await supabase
        .from("user_inventories")
        .select("id, species, common_name, cover_image")
        .eq("user_id", userId)
        .order("species", { ascending: true })
        .limit(5);

      const speciesThumbs = document.getElementById("species-thumbs");
      if (speciesThumbs) {
        speciesThumbs.innerHTML = species?.length
          ? species.map(s => `
            <a href="/tabs/inventory/view.species.html?id=${s.id}" title="${s.common_name || s.species}">
              <img src="${s.cover_image || '/assets/images/default-species.jpg'}"
                   alt="${s.species}" class="img-thumbnail"
                   style="width:75px;height:75px;object-fit:cover;">
            </a>`).join("")
          : "<p class='text-muted mb-0'>No species yet.</p>";
      }
    } catch(e){ console.warn("Species load failed", e); }

    // --- Auctions (user_auctions) -> open auction_card via module ---
    try {
      const { data: auctions, error: auctionsErr } = await supabase
        .from("user_auctions")
        .select("id, description, common_name, current_bid, starting_bid, end_date")
        .order("created_at", { ascending: false })
        .limit(5);

      const auctionsList = document.getElementById("recent-auctions");
      if (auctionsList) {
        if (auctionsErr || !auctions?.length) {
          auctionsList.innerHTML = "<li class='list-group-item'>No auctions found</li>";
        } else {
          auctionsList.innerHTML = auctions.map(a => {
            const title = (a.description && a.description.trim())
              ? a.description.trim()
              : (a.common_name && a.common_name.trim())
                ? a.common_name.trim()
                : "Auction";
            const bid = (a.current_bid ?? a.starting_bid ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return `
              <li class="list-group-item">
                <a href="#" class="open-auction-card" data-id="${a.id}">${title} — $${bid}</a>
              </li>`;
          }).join("");

          auctionsList.querySelectorAll("a.open-auction-card").forEach(el => {
            el.addEventListener("click", (e) => {
              e.preventDefault();
              const id = el.getAttribute("data-id");
              openAuctionCardModule(id);
            });
          });
        }
      }
    } catch(e){ console.warn("Auctions load failed", e); }

    // --- Trades (unchanged) ---
    try {
      const { data: trades } = await supabase
        .from("trades")
        .select("id, status, offered:products!trades_offered_product_id_fkey(name), requested:products!trades_requested_product_id_fkey(name)")
        .order("created_at", { ascending: false })
        .limit(5);

      const tradesList = document.getElementById("recent-trades");
      if (tradesList) {
        tradesList.innerHTML = trades?.length
          ? trades.map(t => `
            <li class="list-group-item">
              <a href="/communityhub/hub.html?module=auctions_trades#trade-${t.id}">
                ${t.offered?.name || "Unknown"} ⇄ ${t.requested?.name || "Unknown"}
                <span class="text-muted">— ${t.status}</span>
              </a>
            </li>`).join("")
          : "<li class='list-group-item'>No trades found</li>";
      }
    } catch(e){ console.warn("Trades load failed", e); }

  } catch (err) {
    console.error("❌ Error building home module:", err);
    const root = document.getElementById("hub-content");
    if (root) root.innerHTML = "<p class='text-danger'>Failed to load home module.</p>";
  }
})();
