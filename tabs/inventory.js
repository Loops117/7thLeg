(function () {
  console.log("✅ inventory.js loaded");
  console.log("🚨 inventory.js script executed", Date.now());

  let inventoryData = [];

  // Expose init function for dashboard.html
  window.initInventory = async function () {
    console.log("📌 initInventory called");
    await loadInventory();
  };

  async function loadInventory(highlightIds = []) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      document.getElementById('inventory-table-container').innerHTML =
        "<p class='text-danger'>Not logged in.</p>";
      return;
    }

    const { data: inventories, error } = await supabase
      .from("user_inventories")
      .select("*")  // 👈 fetch every column
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
        <tr class="inventory-row ${highlightIds.includes(i.id) ? "highlight-row" : ""}" id="row-${i.id}" data-inventory-id="${i.id}">
          <td>${imgTag}</td>
          <td><i>${i.species}</i></td>
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

  // Expose functions globally
  window.openViewSpecies = function (id) {
    window.location.href = `tabs/Inventory/view.species.html?id=${id}`;
  };

  window.openEditSpecies = async function (id) {
    console.log("📌 Opening Edit Species for ID:", id);

    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('show', 'active'));

    const editPane = document.getElementById("edit-species");
    if (editPane) {
      editPane.classList.add('show', 'active');
      editPane.innerHTML = "<p class='text-center text-muted py-5'>Loading edit form...</p>";
    }

    if (typeof window.loadTabContent === "function") {
      await window.loadTabContent("edit-species", "tabs/Inventory/edit.species.html");

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
  };

  window.openAddSpecies = function () {
    window.openEditSpecies(null);
  };

  window.deleteSpecies = async function (id, speciesName) {
    if (!confirm(`Are you sure you want to delete "${speciesName}" from your inventory?`)) return;

    const { error } = await supabase.from("user_inventories").delete().eq("id", id);

    if (error) {
      alert("❌ Failed to delete: " + error.message);
    } else {
      alert(`✅ "${speciesName}" deleted successfully`);
      loadInventory(); // reload the table
    }
  };

  window.copyInventory = function () {
    if (!inventoryData.length) return alert("No inventory to copy.");
    navigator.clipboard.writeText(JSON.stringify(inventoryData, null, 2));
    alert("✅ Inventory copied to clipboard!");
  };

  window.exportInventory = async function () {
    if (!inventoryData.length) {
      return alert("No inventory to export.");
    }

    const csv = Papa.unparse(inventoryData, {
      quotes: true,
      quoteChar: '"',
      escapeChar: '"',
      delimiter: ",",
      header: true,
      newline: "\r\n"
    });

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "inventory_export.csv";
    link.click();
  };



  window.shareInventory = function () {
    alert("TODO: Share inventory via link");
  };

  // ✅ Bulk Import Support
  window.downloadInventoryTemplate = function () {
    const headers = [
      "id", "species", "common_name", "insect_type", "date_obtained", "origin",
      "climate", "humidity", "hydration", "adult_size", "breeding_season", "birth_type",
      "brood_amount", "container_type", "substrate", "care_sheet", "notes",
      "status", "diet", "cover_image", "source"
    ];
    const csvContent = headers.join(",") + "\\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "inventory_template.csv";
    link.click();
  };

  window.importInventory = function () {
    const fileInput = document.getElementById("csvUpload");
    const errorDiv = document.getElementById("import-errors");
    errorDiv.innerHTML = "";

    if (!fileInput.files.length) {
      errorDiv.innerHTML = "<div class='alert alert-danger'>Please select a CSV file.</div>";
      return;
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        errorDiv.innerHTML = "<div class='alert alert-danger'>You must be logged in to import.</div>";
        return;
      }

      Papa.parse(fileInput.files[0], {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          let errors = [];
          let updatedIds = [];

          for (let [index, row] of results.data.entries()) {
            const cleanedRow = Object.fromEntries(
              Object.entries(row).map(([k, v]) => [k, v?.trim() || null])
            );

            if (!cleanedRow.species) {
              errors.push(`Row ${index + 2} skipped: Missing species name.`);
              continue;
            }

            try {
              if (cleanedRow.id) {
                const { error: updateError, count } = await supabase
                  .from("user_inventories")
                  .update(cleanedRow)
                  .eq("id", cleanedRow.id)
                  .eq("user_id", user.id);

                if (!updateError && count > 0) {
                  updatedIds.push(cleanedRow.id);
                  continue;
                }
              }
              cleanedRow.user_id = user.id;
              const { data: inserted, error: insertError } = await supabase
                .from("user_inventories")
                .insert(cleanedRow)
                .select();

              if (!insertError && inserted?.length) {
                updatedIds.push(inserted[0].id);
              } else if (insertError) {
                errors.push(`Row ${index + 2} insert failed: ${insertError.message}`);
              }
            } catch (err) {
              errors.push(`Row ${index + 2} failed: ${err.message}`);
            }
          }

          await loadInventory(updatedIds);

          if (errors.length) {
            errorDiv.innerHTML = `
              <div class="alert alert-warning">
                <strong>Import completed with ${errors.length} issue(s):</strong>
                <ul>${errors.map(e => `<li>${e}</li>`).join("")}</ul>
              </div>`;
          } else {
            errorDiv.innerHTML = "<div class='alert alert-success'>✅ Import completed successfully!</div>";
          }
        }
      });
    });
  };

})(); // end IIFE
