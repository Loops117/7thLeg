let categories = [];

async function loadProducts() {
  // Fetch categories first
  const { data: catData, error: catError } = await window.supabase
    .from("categories")
    .select("*")
    .order("name", { ascending: true });

  if (catError) {
    console.error("Failed to load categories:", catError.message);
    document.getElementById("product-table-container").innerHTML = 
      '<p class="text-danger">Failed to load categories.</p>';
    return;
  }
  categories = catData;

  // Fetch products
  const { data: products, error } = await window.supabase
    .from("products")
    .select("*")
    .order("category_id", { ascending: true })
    .order("sort_order", { ascending: true });

  const container = document.getElementById("product-table-container");

  if (error) {
    container.innerHTML = '<p class="text-danger">Failed to load products.</p>';
    return;
  }

  if (!products || products.length === 0) {
    container.innerHTML = '<p class="text-center">No products found.</p>';
    return;
  }

  let html = `
    <table class="table table-striped">
      <thead>
        <tr>
          <th>Drag</th>
          <th>Image</th>
          <th>Name</th>
          <th>Category</th>
          <th>Price</th>
          <th>Qty</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="sortable-products">
  `;

  for (let p of products) {
    let { data: images } = await window.supabase
      .from("product_images")
      .select("image_url, is_main")
      .eq("product_id", p.id)
      .eq("status", true)
      .order("is_main", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(1);

    let imageUrl = images && images.length > 0
      ? images[0].image_url
      : "assets/images/placeholder.png";

    let categoryOptions = categories.map(c =>
      `<option value="${c.id}" ${c.id === p.category_id ? "selected" : ""}>${c.name}</option>`
    ).join("");

    html += `
      <tr data-id="${p.id}">
        <td style="cursor:grab;">☰</td>
        <td><img src="${imageUrl}" alt="${p.name}" style="max-height:50px;"></td>
        <td>${p.name}</td>
        <td>
          <select id="cat-${p.id}" class="form-select form-select-sm">
            <option value="">Uncategorized</option>
            ${categoryOptions}
          </select>
        </td>
        <td><input type="number" value="${p.price}" step="0.01" id="price-${p.id}" class="form-control form-control-sm"></td>
        <td><input type="number" value="${p.qty || 0}" id="qty-${p.id}" class="form-control form-control-sm"></td>
        <td>${p.status ? "Enabled" : "Disabled"}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="updateProduct(${p.id})">Update</button>
          <button class="btn btn-sm ${p.status ? 'btn-warning' : 'btn-success'}" onclick="toggleProduct(${p.id}, ${p.status})">
            ${p.status ? 'Disable' : 'Enable'}
          </button>
          <a class="btn btn-sm btn-info" href="product-dashboard.html?id=${p.id}">Edit</a>
        </td>
      </tr>
    `;
  }

  html += "</tbody></table>";
  container.innerHTML = html;
  initSortable();
}

async function updateProduct(id) {
  const price = document.getElementById(`price-${id}`).value;
  const qty = document.getElementById(`qty-${id}`).value;
  const category_id = document.getElementById(`cat-${id}`).value || null;

  const { error } = await window.supabase.from("products")
    .update({ price, qty, category_id })
    .eq("id", id);

  if (error) alert("Update failed: " + error.message);
  else alert("✅ Product updated!");
}

async function toggleProduct(id, status) {
  const { error } = await window.supabase.from("products")
    .update({ status: !status })
    .eq("id", id);

  if (error) alert("Failed to update status: " + error.message);
  else loadProducts();
}

function initSortable() {
  const el = document.getElementById("sortable-products");
  if (!el) return;

  Sortable.create(el, {
    handle: "td:first-child",
    animation: 150,
    onEnd: async function () {
      const rows = [...el.children];
      for (let i = 0; i < rows.length; i++) {
        const id = rows[i].dataset.id;
        await window.supabase.from("products")
          .update({ sort_order: i })
          .eq("id", id);
      }
      console.log("✅ Sort order updated");
    }
  });
}

// Load products when tab is loaded
loadProducts();
