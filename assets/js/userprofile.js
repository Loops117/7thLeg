console.log("✅ userprofile.js loaded");

(async function () {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("id");

  if (!userId) {
    document.body.innerHTML = "<div class='container py-5'><p class='text-danger'>❌ No user specified.</p></div>";
    return;
  }

  // Load profile info
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    document.getElementById("profile-header").innerHTML =
      "<p class='text-danger'>❌ Failed to load profile.</p>";
  } else {
    document.getElementById("user-name").textContent = profile.full_name || "Unnamed User";
    document.getElementById("user-role").textContent = profile.role || "Member";
  }

  // Load inventory
  const { data: inventories } = await supabase
    .from("user_inventories")
    .select("id, species, morph_name, common_name, insect_type")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const invContainer = document.getElementById("public-inventory");
  if (!inventories || inventories.length === 0) {
    invContainer.innerHTML = "<p>No species in this inventory yet.</p>";
  } else {
    let html = `
      <table class="table table-bordered table-hover align-middle text-nowrap">
        <thead class="table-light">
          <tr>
            <th>Species</th>
            <th>Morph</th>
            <th>Common Name</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
    `;
    for (let i of inventories) {
      html += `
    <tr>
      <td>${i.species || ""}</td>
      <td>${i.morph_name || ""}</td>
      <td>${i.common_name || ""}</td>
      <td>${i.insect_type || ""}</td>
    </tr>
  `;
    }

    html += "</tbody></table>";
    invContainer.innerHTML = html;
  }

  // Load wishlist
  const { data: wishlist } = await supabase
    .from("user_wishlist")
    .select("species, common_name, insect_type, date_added")
    .eq("user_id", userId)
    .order("date_added", { ascending: false });

  const wlContainer = document.getElementById("public-wishlist");
  if (!wishlist || wishlist.length === 0) {
    wlContainer.innerHTML = "<p>No species in this wishlist yet.</p>";
  } else {
    let html = `
      <table class="table table-bordered table-hover align-middle text-nowrap">
        <thead class="table-light">
          <tr>
            <th>Species</th>
            <th>Morph</th>
            <th>Type</th>
            <th>Date Added</th>
          </tr>
        </thead>
        <tbody>
    `;
    for (let w of wishlist) {
      html += `
        <tr>
          <td>${w.species}</td>
          <td>${w.common_name || ""}</td>
          <td>${w.insect_type || ""}</td>
          <td>${new Date(w.date_added).toLocaleDateString()}</td>
        </tr>
      `;
    }
    html += "</tbody></table>";
    wlContainer.innerHTML = html;
  }
})();
