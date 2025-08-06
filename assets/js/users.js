console.log("✅ users.js loaded");

async function loadUsers() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    document.querySelector(".container").innerHTML =
      "<div class='alert alert-danger'>You must be logged in to view the user directory.</div>";
    return;
  }

  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .order("full_name", { ascending: true });

  const container = document.getElementById("user-table-container");
  if (error || !users) {
    container.innerHTML = "<p class='text-danger'>❌ Failed to load users.</p>";
    return;
  }

  let html = `
    <table class="table table-bordered table-hover align-middle text-nowrap">
      <thead class="table-light">
        <tr>
          <th>Name</th>
          <th>Role</th>
        </tr>
      </thead>
      <tbody>
  `;
  for (let u of users) {
    const slug = u.full_name?.trim().toLowerCase().replace(/\s+/g, "_") || "";
    html += `
      <tr>
        <td>
          <a href="/profiles/index.html?id=${u.id}" class="text-decoration-none">
            ${u.full_name || "Unnamed User"}
          </a>
        </td>
        <td>${u.role || "Member"}</td>
      </tr>
    `;
  }
  html += "</tbody></table>";
  container.innerHTML = html;

  // ✅ Live search
  document.getElementById("user-search").addEventListener("input", function() {
    const query = this.value.toLowerCase();
    const rows = container.querySelectorAll("tbody tr");
    rows.forEach(row => {
      const name = row.cells[0].innerText.toLowerCase();
      const role = row.cells[1].innerText.toLowerCase();
      row.style.display = (name.includes(query) || role.includes(query)) ? "" : "none";
    });
  });
}

loadUsers();