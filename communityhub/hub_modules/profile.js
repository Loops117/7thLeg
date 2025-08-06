const supabase = window.supabase;

(async () => {
    console.log("✅ hub profile.js running with window.supabase");

    const params = new URLSearchParams(window.location.search);
    let userId = params.get("id");

    if (!userId) {
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id;
    }

    if (!userId) {
        document.getElementById("hub-content").innerHTML = "<p class='text-danger'>You must be logged in to view your profile.</p>";
        return;
    }

    // Fetch and render profile
    const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role, about_me")
        .eq("id", userId)
        .single();

    document.getElementById("profile-name").textContent = profile?.full_name || "Unnamed User";
    document.getElementById("profile-role").textContent = profile?.role || "Member";
    document.getElementById("profile-about").textContent = profile?.about_me || "No about me yet.";

    // Badges
    const { data: badges } = await supabase
        .from("user_badges")
        .select("badges(name, description, icon_url)")
        .eq("user_id", userId);

    document.getElementById("profile-badges").innerHTML = badges?.length
        ? badges.map(b => `
        <span class="badge bg-success d-flex align-items-center p-2 shadow-sm"
          title="${b.badges.description || ''}">
          ${b.badges.icon_url
                ? `<img src="${b.badges.icon_url}" alt="${b.badges.name}" style="height:20px; margin-right:6px;">`
                : ""}
          ${b.badges.name}
        </span>`).join("")
        : "<p>No badges</p>";

    // Reviews
    const { data: reviews } = await supabase
        .from("reviews")
        .select("rating, comment, reviewer_id, profiles!reviews_reviewer_id_fkey(full_name)")
        .eq("reviewed_id", userId);

    if (!reviews?.length) {
        document.getElementById("profile-reviews").innerHTML = "<p>No reviews yet.</p>";
        document.getElementById("profile-rating").textContent = "⭐ No reviews yet";
    } else {
        const avg = reviews.reduce((a, r) => a + r.rating, 0) / reviews.length;
        document.getElementById("profile-rating").textContent = "⭐".repeat(Math.round(avg));
        document.getElementById("profile-reviews").innerHTML = reviews.map(r =>
            `<div class="mb-2">
         <strong>${r.profiles?.full_name || "Anonymous"}:</strong>
         ${"⭐".repeat(r.rating)}<br>
         <small class="text-muted">${r.comment}</small>
       </div>`
        ).join("");
    }

    // Bulletins
    const { data: bulletins } = await supabase
        .from("bulletins")
        .select("message, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);

    document.getElementById("profile-bulletins").innerHTML = bulletins?.length
        ? bulletins.map(b =>
            `<div class="mb-2">
          ${b.message}
          <small class="text-muted d-block">${new Date(b.created_at).toLocaleDateString()}</small>
        </div>`
        ).join("")
        : "<p>No recent bulletins.</p>";

    // Inventory
    const { data: inventory } = await supabase
        .from("user_inventories")
        .select("id, species, common_name, cover_image, insect_type")
        .eq("user_id", userId);

    if (inventory?.length) {
        inventory.sort((a, b) => a.species.localeCompare(b.species));
        document.getElementById("profile-inventory").innerHTML = inventory.map(i => `
    <div class="d-flex align-items-center mb-2">
      <img src="${i.cover_image || '/assets/images/default-species.jpg'}"
           alt="${i.species}" class="me-2 rounded" style="width:50px;height:50px;object-fit:cover;">
      <div>
        <a href="/tabs/inventory/view.species.html?id=${i.id}">
          <i>${i.species}</i>
        </a>${i.common_name ? ` – ${i.common_name}` : ""}
        <div class="text-muted small">${i.insect_type || ""}</div>
      </div>
    </div>`).join("");
    } else {
        document.getElementById("profile-inventory").innerHTML = "<p>No inventory yet.</p>";
    }


    // Wishlist
    const { data: wishlist } = await supabase
        .from("user_wishlist")
        .select("species, common_name, insect_type, date_added")
        .eq("user_id", userId);

    if (wishlist?.length) {
        wishlist.sort((a, b) => a.species.localeCompare(b.species));
        document.getElementById("profile-wishlist").innerHTML = wishlist.map(w => `
    <div class="mb-2">
      <i>${w.species}</i>${w.common_name ? ` – ${w.common_name}` : ""}
      <div class="text-muted small">${w.insect_type || ""} – Added ${new Date(w.date_added).toLocaleDateString()}</div>
    </div>`).join("");
    } else {
        document.getElementById("profile-wishlist").innerHTML = "<p>No wishlist yet.</p>";
    }

})();
