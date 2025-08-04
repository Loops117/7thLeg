console.log("✅ inventory.js loaded");

let inventoryData = [];

async function loadInventory() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    document.getElementById('inventory-table-container').innerHTML =
      "<p class='text-danger'>Not logged in.</p>";
    return;
  }

  const { data: inventories, error } = await supabase
    .from("user_inventories")
    .select("id, species, common_name, insect_type, cover_image")
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

  let html = `
    <div class="mb-3">
      <input type="text" id="inventory-search" class="form-control" placeholder="🔍 Search inventory...">
    </div>
    <div class="table-responsive" style="max-height: 70vh; overflow-y: auto;">
      <table id="inventory-table" class="table table-bordered table-hover align-middle text-nowrap">
        <thead class="table-light sticky-top">
          <tr>
            <th style="width:50px;">Image</th>
            <th>Species</th>
            <th>Common Name</th>
            <th>Type</th>
            <th style="width:260px;">Actions</th>
          </tr>
        </thead>
        <tbody>
  `;

  for (let i of inventories) {
    const imgTag = i.cover_image
      ? `<img src="${i.cover_image}" alt="${i.species}" style="height:30px; width:auto;">`
      : `<img src="assets/images/logo.png" alt="Logo" style="height:30px; width:auto;">`;

    html += `
      <tr class="inventory-row" data-inventory-id="${i.id}">
        <td>${imgTag}</td>
        <td>${i.species}</td>
        <td>${i.common_name || ""}</td>
        <td>${i.insect_type || ""}</td>
        <td>
          <button class="btn btn-sm btn-info me-1" onclick="openViewSpecies('${i.id}')">View</button>
          <button class="btn btn-sm btn-primary me-1" onclick="openEditSpecies('${i.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteSpecies('${i.id}', '${i.species}')">Delete</button>
        </td>
      </tr>
    `;
  }

  html += "</tbody></table></div>";
  container.innerHTML = html;

  // Row selection styling
  document.querySelectorAll("#inventory-table .inventory-row").forEach(row => {
    row.addEventListener("click", () => {
      document.querySelectorAll("#inventory-table .inventory-row").forEach(r => r.classList.remove("selected"));
      row.classList.add("selected");
    });
  });

  // Search filter
  document.getElementById("inventory-search").addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase();
    document.querySelectorAll("#inventory-table tbody tr").forEach(row => {
      const text = row.innerText.toLowerCase();
      row.style.display = text.includes(query) ? "" : "none";
    });
  });
}

// View opens a standalone page
function openViewSpecies(id) {
  window.location.href = `tabs/Inventory/view.species.html?id=${id}`;
}

// ✅ Edit opens directly in its own dashboard tab (#edit-species)
async function openEditSpecies(id) {
  console.log("📌 Opening Edit Species for ID:", id);

  // Deactivate all other tab panes
  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('show', 'active'));

  // Activate edit-species tab pane
  const editPane = document.getElementById("edit-species");
  if (editPane) {
    editPane.classList.add('show', 'active');
    editPane.innerHTML = "<p class='text-center text-muted py-5'>Loading edit form...</p>";
  }

  // Load edit tab content
  if (typeof window.loadTabContent === "function") {
    await window.loadTabContent("edit-species", "tabs/Inventory/edit.species.html");

    // Call the form loader after script loads
    if (typeof window.loadEditSpecies === "function") {
      window.loadEditSpecies(id);
    } else {
      await new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = "tabs/Inventory/edit.species.js?v=" + Date.now();
        script.onload = () => {
          if (typeof window.loadEditSpecies === "function") {
            window.loadEditSpecies(id);
          }
          resolve();
        };
        document.body.appendChild(script);
      });
    }
  }
}

// Add button uses edit form without ID
function openAddSpecies() {
  openEditSpecies(null);
}

// ✅ Delete a species entry
async function deleteSpecies(id, speciesName) {
  if (!confirm(`Are you sure you want to delete "${speciesName}" from your inventory?`)) return;

  const { error } = await supabase.from("user_inventories").delete().eq("id", id);

  if (error) {
    alert("❌ Failed to delete: " + error.message);
  } else {
    alert(`✅ "${speciesName}" deleted successfully`);
    loadInventory(); // reload the table
  }
}

// Toolbar buttons
function copyInventory() {
  if (!inventoryData.length) return alert("No inventory to copy.");
  navigator.clipboard.writeText(JSON.stringify(inventoryData, null, 2));
  alert("✅ Inventory copied to clipboard!");
}

function exportInventory() {
  if (!inventoryData.length) return alert("No inventory to export.");
  const headers = ["Species", "Common Name", "Type"];
  const rows = inventoryData.map(i => [i.species, i.common_name || "", i.insect_type || ""]);
  const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "inventory_export.csv";
  link.click();
}

function shareInventory() {
  alert("TODO: Share inventory via link");
}

// Initial load
loadInventory();
