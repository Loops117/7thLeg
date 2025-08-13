
console.log("✅ inventory.js loaded");
console.log("🚨 inventory.js script executed", Date.now());

let inventoryData = [];

export async function init() {
  console.log("📌 initUserspecies called");
  await loadInventory();
}

async function loadInventory(highlightIds = []) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    document.getElementById('inventory-table-container').innerHTML =
      "<p class='text-danger'>Not logged in.</p>";
    return;
  }

  const { data: inventories, error } = await supabase
    .from("user_inventories")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const container = document.getElementById('inventory-table-container');
  if (error) {
    container.innerHTML = "<p class='text-danger'>Failed to load inventory.</p>";
    return;
  }

  if (!inventories || inventories.length === 0) {
    container.innerHTML = "<p>No species in your inventory yet.</p>";
    return;
  }

  inventoryData = inventories;

  // Sort alphabetically by species, then common name
  inventoryData.sort((a, b) => {
    const speciesA = (a.species || "").toLowerCase();
    const speciesB = (b.species || "").toLowerCase();
    if (speciesA < speciesB) return -1;
    if (speciesA > speciesB) return 1;

    const commonA = (a.morph_name || "").toLowerCase();
    const commonB = (b.morph_name || "").toLowerCase();
    return commonA.localeCompare(commonB);
  });


  let html = `
    <div class="mb-3">
      <input type="text" id="inventory-search" class="form-control" placeholder="🔍 Search inventory...">
    </div>
    <div class="table-responsive" style="max-height: 70vh; overflow-y: auto;">
      <table id="inventory-table" class="table table-bordered table-hover align-middle text-nowrap">
        <thead class="table-light sticky-top">
          <tr>
            <th style="width:20px;">Actions</th>
            <th>Species</th>
            <th>Morph</th>
            <th>Type</th>
            <th style="width:50px;">Image</th>
          </tr>
        </thead>
        <tbody>
  `;

  for (let i of inventories) {
    const imgTag = i.cover_image
      ? `<img src="${i.cover_image}" alt="${i.species}" style="height:30px; width:auto;">`
      : `<img src="assets/images/logo.png" alt="Logo" style="height:30px; width:auto;">`;

    html += `
      <tr class="inventory-row ${highlightIds.includes(i.id) ? "highlight-row" : ""}" id="row-${i.id}" data-inventory-id="${i.id}">
        <td>
          <button class="btn btn-sm btn-info me-1" onclick="openViewSpecies('${i.id}')">View</button>
          <button class="btn btn-sm btn-primary me-1" onclick="openEditSpecies('${i.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteSpecies('${i.id}', '${i.species}')">Delete</button>
        </td>
        <td><i>${i.species}</i></td>
        <td><i>${i.morph_name}</i></td>
        <td>${i.insect_type || ""}</td>
        <td>${imgTag}</td>
      </tr>
    `;
  }

  html += "</tbody></table></div>";
  container.innerHTML = html;

  document.querySelectorAll("#inventory-table .inventory-row").forEach(row => {
    row.addEventListener("click", () => {
      document.querySelectorAll("#inventory-table .inventory-row").forEach(r => r.classList.remove("selected"));
      row.classList.add("selected");
    });
  });

  document.getElementById("inventory-search").addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase();
    document.querySelectorAll("#inventory-table tbody tr").forEach(row => {
      const text = row.innerText.toLowerCase();
      row.style.display = text.includes(query) ? "" : "none";
    });
  });
}

window.openViewSpecies = function (id) {
  loadModule('species_modules/view.hubspecies', null, { id });
};

window.openEditSpecies = function (id) {
  loadModule('species_modules/edit.hubspecies', null, { id });
};

window.openAddSpecies = function () {
  openEditSpecies(null);
};
