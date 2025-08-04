console.log("✅ categories.js loaded");

async function loadCategories() {
  const container = document.getElementById("categories-container");

  if (!container) {
    console.warn("⚠️ categories-container not found yet, skipping load.");
    return;
  }

  const { data, error } = await window.supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Supabase error loading categories:", error);
    container.innerHTML = `<p class='text-danger'>Failed to load categories: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = "<p>No categories yet.</p>";
    return;
  }

  let html = `
    <table class="table table-striped">
      <thead>
        <tr>
          <th>Drag</th>
          <th>Name</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="sortable-categories">
  `;

  for (let c of data) {
    html += `
      <tr data-id="${c.id}">
        <td style="cursor:grab;">☰</td>
        <td><input type="text" class="form-control" id="cat-name-${c.id}" value="${c.name}"></td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="updateCategory('${c.id}')">Update</button>
          <button class="btn btn-sm btn-danger" onclick="deleteCategory('${c.id}')">Delete</button>
        </td>
      </tr>
    `;
  }

  html += "</tbody></table>";
  container.innerHTML = html;
  initSortableCategories();
}

async function addCategory(e) {
  e.preventDefault();
  const name = document.getElementById("new-category-name").value.trim();
  if (!name) return;

  const { error } = await window.supabase.from("categories").insert({ name, sort_order: 999 });
  if (error) {
    alert("❌ Failed to add category: " + error.message);
  } else {
    document.getElementById("new-category-name").value = "";
    loadCategories();
  }
}

async function updateCategory(id) {
  const name = document.getElementById(`cat-name-${id}`).value.trim();
  const { error } = await window.supabase.from("categories").update({ name }).eq("id", id);
  if (error) {
    alert("❌ Failed to update category: " + error.message);
  } else {
    alert("✅ Category updated!");
  }
}

async function deleteCategory(id) {
  if (!confirm("Are you sure you want to delete this category?")) return;

  const { error } = await window.supabase.from("categories").delete().eq("id", id);
  if (error) {
    alert("❌ Failed to delete category: " + error.message);
  } else {
    loadCategories();
  }
}

function initSortableCategories() {
  const el = document.getElementById("sortable-categories");
  if (!el) return;

  Sortable.create(el, {
    handle: "td:first-child",
    animation: 150,
    onEnd: async function () {
      const rows = [...el.children];
      for (let i = 0; i < rows.length; i++) {
        const id = rows[i].dataset.id;
        await window.supabase.from("categories")
          .update({ sort_order: i })
          .eq("id", id);
      }
      console.log("✅ Category sort order updated");
    }
  });
}

// Load once DOM + tab content is ready
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    if (document.getElementById("categories-container")) {
      console.log("📌 categories.js starting loadCategories()");
      loadCategories();
    }
  }, 200);
});
