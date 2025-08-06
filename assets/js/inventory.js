console.log("✅ inventory.js loaded");

async function initInventory() {
  console.log("📌 initInventory called");
  loadInventory();
}

async function loadInventory() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: inventories, error } = await supabase
    .from("user_inventories")
    .select("id, species, common_name, insect_type")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const container = document.getElementById("inventory-table-container");
  if (error || !inventories) {
    container.innerHTML = "<p class='text-danger'>❌ Failed to load inventory.</p>";
    return;
  }

  if (inventories.length === 0) {
    container.innerHTML = "<p>No species in your inventory yet.</p>";
    return;
  }

  let html = `
    <table class="table table-bordered table-hover align-middle text-nowrap">
      <thead class="table-light">
        <tr>
          <th>Species</th>
          <th>Common Name</th>
          <th>Type</th>
        </tr>
      </thead>
      <tbody>
  `;
  for (let i of inventories) {
    html += `
      <tr id="row-${i.id}">
        <td><i>${i.species}</i></td>
        <td>${i.common_name || ""}</td>
        <td>${i.insect_type || ""}</td>
      </tr>`;
  }
  html += "</tbody></table>";
  container.innerHTML = html;
}

// Download CSV Template
function downloadInventoryTemplate() {
  const headers = [
    "id","species","common_name","insect_type","date_obtained","origin",
    "climate","humidity","hydration","adult_size","breeding_season","birth_type",
    "brood_amount","container_type","substrate","care_sheet","notes",
    "status","diet","cover_image","source"
  ];
  const csvContent = headers.join(",") + "\n";
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "inventory_template.csv";
  link.click();
}

// Import CSV
async function importInventory() {
  const fileInput = document.getElementById("csvUpload");
  const errorDiv = document.getElementById("import-errors");
  errorDiv.innerHTML = "";
  if (!fileInput.files.length) {
    errorDiv.innerHTML = "<div class='alert alert-danger'>Please select a CSV file.</div>";
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
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

      // Reload inventory and highlight updated rows
      await loadInventory();
      updatedIds.forEach(id => {
        const row = document.getElementById(`row-${id}`);
        if (row) row.classList.add("highlight-row");
      });

      // Show errors if any
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
}
