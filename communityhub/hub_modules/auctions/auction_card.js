// 🌐 Ensure globally accessible before usage
window.openViewSpecies = function (id) {
  loadModule("species_modules/view.hubspecies", null, { id });
};

console.log("✅ auction_card.js loaded");

export async function init(options = {}) {
  const id = options.id || new URLSearchParams(window.location.search).get("id");
  if (!id) return alert("Missing auction ID");

  const { data: auction, error } = await window.supabase
    .from("user_auctions")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !auction) return alert("Auction not found.");

  const speciesList = JSON.parse(auction.species_data || "[]");
  const ids = speciesList.map(s => s.id).filter(Boolean);

  const { data: inventory } = await window.supabase
    .from("user_inventories")
    .select("id, species, morph_name, cover_image, insect_type, user_id")
    .in("id", ids);

  const inventoryMap = {};
  (inventory || []).forEach(i => {
    inventoryMap[i.id] = i;
  });

  const first = (inventory || []).find(s => s.cover_image) || {};
  document.getElementById("auction-image").src = first.cover_image || "/assets/images/logo.png";

  document.getElementById("auction-bid").textContent = auction.current_bid ? `$${auction.current_bid}` : "No bids yet";
  document.getElementById("auction-reserve").textContent = auction.reserve_price ? `$${auction.reserve_price}` : "None";
  document.getElementById("auction-ends").textContent = auction.end_date;
  document.getElementById("auction-desc").textContent = auction.description || "No description";


  // Populate gallery
  const gallery = document.getElementById("species-gallery");
  gallery.innerHTML = "";
  (inventory || []).forEach(s => {
    if (s.cover_image) {
      const img = document.createElement("img");
      img.src = s.cover_image;
      img.className = "gallery-thumb";
      const label = s.morph_name && s.morph_name.trim()
        ? `${s.species} - ${s.morph_name}`
        : s.species;
      img.alt = label;
      img.onclick = () => document.getElementById("auction-image").src = img.src;
      gallery.appendChild(img);
    }
  });

  const supabase = window.supabase;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const currentUserId = user.id;

  // Owner Display
  const ownerEl = document.getElementById("auction-owner");
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", auction.user_id).single();
  const ownerName = profile?.full_name || "Unknown";
  ownerEl.innerHTML = `<strong>By:</strong> <a href="#" onclick="loadModule('profile', null, { id: '${auction.user_id}' })">${ownerName}</a>`;

  // Cancel auction if owner
  if (currentUserId === auction.user_id) {
    const cancelBtn = document.getElementById("cancel-auction");
    if (cancelBtn) {
      cancelBtn.style.display = "block";
      cancelBtn.onclick = async () => {
        if (!confirm("Are you sure you want to cancel this auction?")) return;
        await supabase.from("user_auctions").update({ status: "cancelled" }).eq("id", id);
        alert("Auction cancelled.");
        window.loadModule("auctions_trades");
      };
    }
  }

  // Load bids
  const { data: bids } = await supabase
    .from("user_bids")
    .select("user_id, bid_amount")
    .eq("auction_id", id)
    .order("bid_amount", { ascending: false });


  const speciesUserIds = [...new Set((inventory || []).map(i => i.user_id).filter(Boolean))];
  const bidUserIds = (bids || []).map(b => b.user_id);
  const allUserIds = [...new Set([...speciesUserIds, ...bidUserIds])];
  const { data: userProfiles } = allUserIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", allUserIds)
    : { data: [] };

  const userMap = {};
  (userProfiles || []).forEach(p => { userMap[p.id] = p.full_name; });

  const speciesListEl = document.getElementById("auction-species-list");
  speciesListEl.innerHTML = "";
  speciesList.forEach(s => {
    const inv = inventoryMap[s.id];
    const row = document.createElement("tr");

    const qtyTd = document.createElement("td");
    qtyTd.textContent = `${s.qty}x`;

    const nameTd = document.createElement("td");
    if (inv) {
      const link = document.createElement("a");
      link.href = "#";
      const label = inv.morph_name && inv.morph_name.trim()
        ? `${inv.species} - ${inv.morph_name}`
        : inv.species;
      link.textContent = label;
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const fn = globalThis.openViewSpecies || window.openViewSpecies;
        if (typeof fn === "function") fn(inv.id);
      });

      nameTd.appendChild(link);
      if (inv.user_id) nameTd.innerHTML += ` <small class="text-muted">by ${userMap[inv.user_id] || inv.user_id.slice(0, 6)}</small>`;
    } else {
      nameTd.textContent = "Unknown";
    }

    row.appendChild(qtyTd);
    row.appendChild(nameTd);
    const typeTd = document.createElement("td");
    typeTd.textContent = inv?.insect_type || "Unknown";
    row.appendChild(typeTd);
    speciesListEl.appendChild(row);
  });


  const bidBox = document.getElementById("auction-bids");
  if (!bids || bids.length === 0) {
    bidBox.innerHTML = "<p>No bids yet.</p>";
  } else {
    const list = document.createElement("ul");
    list.className = "list-group mt-2";
    bids.forEach(b => {
      const li = document.createElement("li");
      li.className = "list-group-item";
      li.textContent = `${userMap[b.user_id] || b.user_id.slice(0, 6)}: $${b.bid_amount}`;
      list.appendChild(li);
    });
    bidBox.innerHTML = "<strong>Bid History:</strong>";
    bidBox.appendChild(list);
  }

  const latestBid = (bids && bids.length > 0) ? bids[0].bid_amount : auction.starting_bid;
  document.getElementById("auction-bid").textContent = `${latestBid}`;
  document.getElementById("auction-increments").textContent = `$${auction.increments}`;
  const quickBtn = document.getElementById("place-quick-bid");
  if (quickBtn) quickBtn.textContent = `Quick Bid (+$${auction.increments})`;

  // Wire Bid Buttons
  const manualBtn = document.getElementById("place-manual-bid");
  if (manualBtn) {
    manualBtn.onclick = async () => {
      const amount = parseFloat(document.getElementById("manual-bid").value);
      if (isNaN(amount) || amount <= latestBid) {
        alert("Bid must be higher than current.");
        return;
      }
      await supabase.from("user_bids").insert([{ user_id: currentUserId, auction_id: id, bid_amount: amount }]);
      location.reload();
    };
  }

  if (quickBtn) {
    quickBtn.onclick = async () => {
      const next = Number(latestBid) + Number(auction.increments);
      await supabase.from("user_bids").insert([{ user_id: currentUserId, auction_id: id, bid_amount: next }]);
      location.reload();
    };
  }

  const myBid = (bids || []).find(b => b.user_id === currentUserId);
  const cancelMyBid = document.getElementById("cancel-my-bid");
  if (myBid && cancelMyBid) {
    cancelMyBid.style.display = "block";
    cancelMyBid.onclick = async () => {
      await supabase.from("user_bids").delete().eq("auction_id", id).eq("user_id", currentUserId);
      location.reload();
    };
  }

  const remainingEl = document.getElementById("auction-remaining");
  if (remainingEl) {
    function updateTimeRemaining() {
      const end = new Date(auction.end_date);
      const now = new Date();
      const diff = Math.max(0, end - now);
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      remainingEl.textContent = `${hours}h ${minutes}m ${seconds}s`;
    }
    updateTimeRemaining();
    setInterval(updateTimeRemaining, 1000);
  }
}
