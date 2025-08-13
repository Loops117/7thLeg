const supabase = window.supabase;

(async () => {
  console.log("✅ hub profile.js running with window.supabase");

  const params = new URLSearchParams(window.location.search);
  let userId = params.get("id");

  const profileNameEl = document.getElementById("profile-name");
  const profileRoleEl = document.getElementById("profile-role");
  const profileAboutEl = document.getElementById("profile-about");
  const profileBadgesEl = document.getElementById("profile-badges");
  const profileRatingEl = document.getElementById("profile-rating");
  const profileReviewsEl = document.getElementById("profile-reviews");
  const profileBulletinsEl = document.getElementById("profile-bulletins");
  const profileInventoryEl = document.getElementById("profile-inventory");
  const profileWishlistEl = document.getElementById("profile-wishlist");
  const searchInput = document.getElementById("profile-search");

  async function fetchAndRenderProfile(uid) {
    if (!uid) {
      document.getElementById("hub-content").innerHTML = "<p class='text-danger'>You must be logged in to view your profile.</p>";
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role, about_me")
      .eq("id", uid)
      .single();

    if (!profile) {
      profileNameEl.textContent = "User not found";
      profileRoleEl.textContent = "";
      profileAboutEl.textContent = "";
      profileBadgesEl.innerHTML = "";
      profileRatingEl.textContent = "";
      profileReviewsEl.innerHTML = "";
      profileBulletinsEl.innerHTML = "";
      profileInventoryEl.innerHTML = "";
      profileWishlistEl.innerHTML = "";
      return;
    }

    profileNameEl.textContent = profile?.full_name || "Unnamed User";
    profileRoleEl.textContent = profile?.role || "Member";
    profileAboutEl.textContent = profile?.about_me || "No about me yet.";

    // Badges
    const { data: badges } = await supabase
      .from("user_badges")
      .select("badges(name, description, icon_url)")
      .eq("user_id", uid);

    profileBadgesEl.innerHTML = badges?.length
      ? badges.map(b => `
        <span class="badge bg-success d-flex align-items-center p-2 shadow-sm"
          title="${b.badges.description || ''}">
          ${b.badges.icon_url ? `<img src="${b.badges.icon_url}" alt="${b.badges.name}" style="height:20px; margin-right:6px;">` : ""}
          ${b.badges.name}
        </span>`).join("")
      : "<p>No badges</p>";

    // Reviews
    const { data: reviews } = await supabase
      .from("reviews")
      .select("rating, comment, reviewer_id, profiles!reviews_reviewer_id_fkey(full_name)")
      .eq("reviewed_id", uid);

    if (!reviews?.length) {
      profileReviewsEl.innerHTML = "<p>No reviews yet.</p>";
      profileRatingEl.textContent = "⭐ No reviews yet";
    } else {
      const avg = reviews.reduce((a, r) => a + r.rating, 0) / reviews.length;
      profileRatingEl.textContent = "⭐".repeat(Math.round(avg));
      profileReviewsEl.innerHTML = reviews.map(r =>
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
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(5);

    profileBulletinsEl.innerHTML = bulletins?.length
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
      .select("id, species, common_name, morph_name, cover_image, insect_type")
      .eq("user_id", uid);

    if (inventory?.length) {
      inventory.sort((a, b) => a.species.localeCompare(b.species));
      profileInventoryEl.innerHTML = inventory.map(i => `
        <div class="d-flex align-items-center mb-2">
          <img src="${i.cover_image || '/assets/images/default-species.jpg'}"
              alt="${i.species}" class="me-2 rounded" style="width:50px;height:50px;object-fit:cover;">
          <div>
            <a href="#" onclick="loadModule('species_modules/view.hubspecies', null, { id: '${i.id}' })">
              <i>${i.species}</i>
            ${i.common_name ? ` – ${i.common_name}` : ""}
            </a>${i.morph_name ? ` – ${i.morph_name}` : ""}
            <div class="text-muted small">${i.insect_type || ""}</div>
          </div>
        </div>`).join("");
    } else {
      profileInventoryEl.innerHTML = "<p>No inventory yet.</p>";
    }

    // Wishlist
    const { data: wishlist } = await supabase
      .from("user_wishlist")
      .select("species, common_name, insect_type, date_added")
      .eq("user_id", uid);

    if (wishlist?.length) {
      wishlist.sort((a, b) => a.species.localeCompare(b.species));
      profileWishlistEl.innerHTML = wishlist.map(w => `
        <div class="mb-2">
          <i>${w.species}</i>${w.common_name ? ` – ${w.common_name}` : ""}
          <div class="text-muted small">${w.insect_type || ""} – Added ${new Date(w.date_added).toLocaleDateString()}</div>
        </div>`).join("");
    } else {
      profileWishlistEl.innerHTML = "<p>No wishlist yet.</p>";
    }
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!userId && user?.id) {
    userId = user.id;
  }

  await fetchAndRenderProfile(userId);

  // Add My Profile button
  const form = document.getElementById("profile-search-form");
  const myBtn = document.createElement("button");
  myBtn.className = "btn btn-outline-secondary btn-sm ms-2";
  myBtn.textContent = "My Profile";
  myBtn.onclick = async (e) => {
    e.preventDefault();
    if (user?.id) {
      await fetchAndRenderProfile(user.id);
    }
  };
  form.appendChild(myBtn);

  // Search
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (!query) return;

    const { data: matches } = await supabase
      .from("profiles")
      .select("id, full_name")
      .ilike("full_name", `%${query}%`)
      .limit(10);

    if (!matches?.length) {
      const box = document.createElement("div");
      box.className = "dropdown-menu show";
      box.style.position = "absolute";
      box.style.top = `${form.offsetTop + form.offsetHeight}px`;
      box.style.left = `${form.offsetLeft}px`;
      box.style.zIndex = 9999;
      box.innerHTML = `<span class="dropdown-item text-muted">User not found</span>`;
      document.body.appendChild(box);
      setTimeout(() => box.remove(), 3000);
      return;
    }

    // Autoselect first match for now
    await fetchAndRenderProfile(matches[0].id);
  });

})();
