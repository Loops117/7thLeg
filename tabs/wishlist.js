(function () {
  console.log("✅ wishlist.js loaded");

  let insectTypes = [];
  let wishlistData = [];

  window.initWishlist = async function () {
    console.log("📌 initWishlist called");
    await loadInsectTypes();
    await loadWishlist();
  };

  async function loadInsectTypes() {
    const { data, error } = await supabase
      .from("insect_types")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("❌ Failed to load insect types:", error.message);
      return;
    }
    insectTypes = data || [];
    const select = document.getElementById("wishlist-insect-type");
    if (select) {
      select.innerHTML = `<option value="">-- Select Type --</option>`;
      insectTypes.forEach(t => {
        select.innerHTML += `<option value="${t.name}">${t.name}</option>`;
      });
    }
  }

  async function loadWishlist() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      document.getElementById("wishlist-table-container").innerHTML =
        "<p class='text-danger'>Not logged in.</p>";
      return;
    }

    const { data: wishlist, error } = await supabase
      .from("user_wishlist")
      .select("*")
      .eq("user_id", user.id)
      .order("date_added", { ascending: false });

    const container = document.getElementById("wishlist-table-container");
    if (error) {
      container.innerHTML = "<p class='text-danger'>Failed to load wishlist.</p>";
      return;
    }

    if (!wishlist || wishlist.length === 0) {
      container.innerHTML = "<p>No species in your wishlist yet.</p>";
      return;
    }

    wishlistData = wishlist;

    let html = `
      <div class="table-responsive" style="max-height: 70vh; overflow-y: auto;">
        <table id="wishlist-table" class="table table-bordered table-hover align-middle text-nowrap">
          <thead class="table-light sticky-top">
            <tr>
              <th>Species</th>
              <th>Common Name</th>
              <th>Type</th>
              <th>Date Added</th>
              <th style="width:180px;">Actions</th>
            </tr>
          </thead>
          <tbody>
    `;

    for (let w of wishlist) {
      html += `
        <tr class="wishlist-row" data-id="${w.id}">
          <td><input type="text" class="form-control form-control-sm" id="species-${w.id}" value="${w.species || ""}"></td>
          <td><input type="text" class="form-control form-control-sm" id="common-${w.id}" value="${w.common_name || ""}"></td>
          <td>
            <select class="form-select form-select-sm" id="type-${w.id}">
              <option value="">-- Select Type --</option>
              ${insectTypes.map(t => 
                `<option value="${t.name}" ${t.name === w.insect_type ? "selected" : ""}>${t.name}</option>`
              ).join("")}
            </select>
          </td>
          <td>${new Date(w.date_added).toLocaleDateString()}</td>
          <td>
            <button class="btn btn-sm btn-primary me-1" onclick="updateWishlist('${w.id}')">Update</button>
            <button class="btn btn-sm btn-danger" onclick="deleteWishlist('${w.id}')">Delete</button>
          </td>
        </tr>
      `;
    }

    html += "</tbody></table></div>";
    container.innerHTML = html;

    // ✅ Row selection styling
    document.querySelectorAll("#wishlist-table .wishlist-row").forEach(row => {
      row.addEventListener("click", () => {
        document.querySelectorAll("#wishlist-table .wishlist-row").forEach(r => r.classList.remove("selected"));
        row.classList.add("selected");
      });
    });

    // ✅ Search filter
    const searchInput = document.getElementById("wishlist-search");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll("#wishlist-table tbody tr").forEach(row => {
          const text = row.innerText.toLowerCase();
          row.style.display = text.includes(query) ? "" : "none";
        });
      });
    }
  }

  // Add new wishlist entry
  window.addWishlist = async function (e) {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return alert("❌ Not logged in.");

    const entry = {
      user_id: user.id,
      species: document.getElementById("wishlist-species").value.trim(),
      common_name: document.getElementById("wishlist-common").value.trim(),
      insect_type: document.getElementById("wishlist-insect-type").value,
      date_added: new Date().toISOString(),
    };

    const { error } = await supabase.from("user_wishlist").insert(entry);
    if (error) {
      alert("❌ Failed to add: " + error.message);
    } else {
      document.getElementById("wishlist-add-form").reset();
      await loadWishlist();
    }
  };

  // Update wishlist entry
  window.updateWishlist = async function (id) {
    const { error } = await supabase.from("user_wishlist").update({
      species: document.getElementById(`species-${id}`).value.trim(),
      common_name: document.getElementById(`common-${id}`).value.trim(),
      insect_type: document.getElementById(`type-${id}`).value,
    }).eq("id", id);

    if (error) alert("❌ Update failed: " + error.message);
    else alert("✅ Wishlist updated!");
  };

  // Delete wishlist entry
  window.deleteWishlist = async function (id) {
    if (!confirm("Are you sure you want to delete this wishlist item?")) return;
    const { error } = await supabase.from("user_wishlist").delete().eq("id", id);
    if (error) alert("❌ Failed to delete: " + error.message);
    else await loadWishlist();
  };

  // Export wishlist as CSV
  window.exportWishlist = function () {
    if (!wishlistData.length) return alert("No wishlist to export.");
    const headers = ["Species", "Common Name", "Insect Type", "Date Added"];
    const rows = wishlistData.map(w => [
      w.species || "",
      w.common_name || "",
      w.insect_type || "",
      new Date(w.date_added).toLocaleDateString()
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "wishlist_export.csv";
    link.click();
  };

  // Copy wishlist as JSON to clipboard
  window.copyWishlist = function () {
    if (!wishlistData.length) return alert("No wishlist to copy.");
    navigator.clipboard.writeText(JSON.stringify(wishlistData, null, 2));
    alert("✅ Wishlist copied to clipboard!");
  };

})();
