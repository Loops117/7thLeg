
console.log("✅ create_auction.js loaded");

export async function init() {
  console.log("📌 Initializing create auction module");

  const { data: { user } } = await window.supabase.auth.getUser();
  if (!user) return;

  // Load profile and credits
  const { data: profile } = await window.supabase
    .from("profiles")
    .select("full_name, credits")
    .eq("id", user.id)
    .single();

  const fullName = profile?.full_name || "Unknown";
  const creditsAvailable = profile?.credits ?? 0;
  document.getElementById("user-name").textContent = fullName;
  document.getElementById("credits-available").textContent = creditsAvailable;
  document.getElementById("credits-remaining").textContent = creditsAvailable - 1;

  // Feature auction logic
  const creditUsedEl = document.getElementById("credits-used");
  const creditRemainEl = document.getElementById("credits-remaining");
  const featureBox = document.getElementById("feature-auction");
  featureBox.addEventListener("change", (e) => {
    const used = e.target.checked ? 2 : 1;
    creditUsedEl.textContent = used;
    creditRemainEl.textContent = creditsAvailable - used;
  });



  // Load species table
  const { data: speciesList } = await window.supabase
    .from("user_inventories")
    .select("id, species, morph_name")
    .eq("user_id", user.id)
    .order("species", { ascending: true });

  const speciesTable = document.createElement("table");
  speciesTable.className = "table table-sm";
  speciesTable.innerHTML = "<thead><tr><th>Species</th><th>Morph Name</th><th>Qty</th></tr></thead><tbody></tbody>";
  const tbody = speciesTable.querySelector("tbody");
  const selectedSpecies = [];
  const selectedSpeciesList = document.getElementById("selected-species-list");

  speciesList.forEach(item => {
    const row = document.createElement("tr");

    const speciesCell = document.createElement("td");
    speciesCell.innerHTML = `<em>${item.species}</em>`;

    const morphNameCell = document.createElement("td");
    morphNameCell.textContent = item.morph_name || "";

    const qtyCell = document.createElement("td");
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.className = "form-control form-control-sm";
    input.addEventListener("input", () => {
      const existingIndex = selectedSpecies.findIndex(s => s.id === item.id);
      const qty = parseInt(input.value);

      if (qty > 0) {
        if (existingIndex >= 0) {
          selectedSpecies[existingIndex].qty = qty;
        } else {
          selectedSpecies.push({ id: item.id, species: item.species, morph_name: item.morph_name || "", qty });
        }
      } else {
        if (existingIndex >= 0) selectedSpecies.splice(existingIndex, 1);
      }

      selectedSpeciesList.innerHTML = "";
      selectedSpecies.forEach(s => {
        const li = document.createElement("li");
        li.textContent = `${s.qty}x ${s.species} - ${s.morph_name} `;
        selectedSpeciesList.appendChild(li);
      });
    });

    qtyCell.appendChild(input);
    row.appendChild(speciesCell);
    row.appendChild(morphNameCell);
    row.appendChild(qtyCell);
    tbody.appendChild(row);
  });

  document.getElementById("species-selection-table").appendChild(speciesTable);

  // Save form data and redirect
  document.getElementById("open-tos").addEventListener("click", () => {
    const usedCredits = featureBox.checked ? 2 : 1;
    if (creditsAvailable < usedCredits) {
      alert("You do not have enough credits to create this auction.");
      return;
    }

    const speciesData = selectedSpecies;
    const formData = {
      quantity: speciesData.reduce((acc, s) => acc + s.qty, 0),
      reserve_price: parseFloat(document.getElementById("reserve-price").value || 0),
      starting_bid: parseFloat(document.getElementById("starting-bid").value),
      increments: parseFloat(document.getElementById("bid-increments").value || 1),
      end_date: document.getElementById("end-date").value,
      enhancements: featureBox.checked ? ["feature"] : [],
      tos_agreement: false,
      payment_methods: Array.from(document.querySelectorAll("input[type='checkbox']:checked")).map(cb => cb.value),
      shipping_notes: document.getElementById("shipping-notes").value || null,
      description: document.getElementById("description").value || null,
      species_data: JSON.stringify(speciesData),
      credit_cost: usedCredits
    };

    localStorage.setItem("pendingAuction", JSON.stringify(formData));
    window.loadModule("auctions/confirm_auction");

  });
}

window.addEventListener("load", init);
