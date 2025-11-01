// ✅ userprofile.js (public profile view) — inventory table w/ sorting, filters, and column resize
console.log("✅ userprofile.js loaded (enhanced w/ insect_types select)");
(function () {
  const qs = (sel, el = document) => el.querySelector(sel);
  const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  // --- State
  let INVENTORY = [];
  let INVENTORY_TYPES = []; // [{name, sort_order}]
  let FILTERS = {
    species: "",
    morph_name: "",
    common_name: "",
    insect_type: "", // '' means any
    availability: "any", // any | true | false
  };
  let SORT = { key: "species", dir: "asc" }; // default sort
  let userId = null;

  // --- Utilities
  function debounce(fn, wait = 200) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  function stripHtmlToText(html) {
    if (!html) return "";
    const div = document.createElement("div");
    div.innerHTML = html;
    return (div.textContent || div.innerText || "").trim();
  }

  function badgeYesNo(val) {
    const yes = `<span class="badge bg-success">Yes</span>`;
    const no = `<span class="badge bg-secondary">No</span>`;
    if (val === true || val === "true" || val === 1) return yes;
    if (val === false || val === "false" || val === 0 || val == null) return no;
    // If it's anything else, default to No (treat undefined as false for safety)
    return no;
  }

  function compare(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    const sa = String(a).toLowerCase();
    const sb = String(b).toLowerCase();
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    return 0;
  }

  function applyFilters(data) {
    const wantType = (FILTERS.insect_type || "").toLowerCase();
    return data.filter((row) => {
      if (FILTERS.species && !String(row.species||'').toLowerCase().includes(FILTERS.species)) return false;
      if (FILTERS.morph_name && !String(row.morph_name||'').toLowerCase().includes(FILTERS.morph_name)) return false;
      if (FILTERS.common_name && !String(row.common_name||'').toLowerCase().includes(FILTERS.common_name)) return false;
      if (wantType && String(row.insect_type||'').toLowerCase() !== wantType) return false;
      if (FILTERS.availability !== "any") {
        const want = FILTERS.availability === "true";
        const has = row.availability === true || row.availability === "true" || row.availability === 1;
        if (want !== has) return false;
      }
      return true;
    });
  }

  function applySort(data) {
    const { key, dir } = SORT;
    const sorted = [...data].sort((a, b) => {
      const c = compare(a[key], b[key]);
      return dir === "asc" ? c : -c;
    });
    return sorted;
  }

  // --- Build table UI
  function buildToolbar(container) {
    const toolbar = document.createElement("div");
    toolbar.className = "d-flex flex-wrap gap-2 mb-3";

    const mkInput = (label, key, placeholder) => {
      const wrap = document.createElement("div");
      wrap.className = "form-floating";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "form-control";
      input.id = `flt-${key}`;
      input.placeholder = placeholder;
      input.value = FILTERS[key] ? FILTERS[key] : "";
      input.addEventListener("input", debounce((e) => {
        FILTERS[key] = e.target.value.trim().toLowerCase();
        renderTable();
      }, 200));
      const lab = document.createElement("label");
      lab.setAttribute("for", input.id);
      lab.textContent = label;
      wrap.appendChild(input);
      wrap.appendChild(lab);
      return wrap;
    };

    const mkSelectAvailability = () => {
      const wrap = document.createElement("div");
      wrap.className = "form-floating";
      const sel = document.createElement("select");
      sel.className = "form-select";
      sel.id = "flt-availability";
      sel.innerHTML = `
        <option value="any">Any availability</option>
        <option value="true">Available</option>
        <option value="false">Unavailable</option>
      `;
      sel.value = FILTERS.availability;
      sel.addEventListener("change", (e) => {
        FILTERS.availability = e.target.value;
        renderTable();
      });
      const lab = document.createElement("label");
      lab.setAttribute("for", "flt-availability");
      lab.textContent = "Availability";
      wrap.appendChild(sel);
      wrap.appendChild(lab);
      return wrap;
    };

    const mkSelectType = () => {
      const wrap = document.createElement("div");
      wrap.className = "form-floating";
      const sel = document.createElement("select");
      sel.className = "form-select";
      sel.id = "flt-insect-type";
      let options = `<option value="">All types</option>`;
      INVENTORY_TYPES.forEach(t => {
        const v = (t.name || "").toLowerCase();
        const selected = (FILTERS.insect_type === v) ? "selected" : "";
        options += `<option value="${escapeAttr(v)}" ${selected}>${escapeHtml(t.name || "")}</option>`;
      });
      sel.innerHTML = options;
      sel.addEventListener("change", (e) => {
        FILTERS.insect_type = e.target.value;
        renderTable();
      });
      const lab = document.createElement("label");
      lab.setAttribute("for", "flt-insect-type");
      lab.textContent = "Type";
      wrap.appendChild(sel);
      wrap.appendChild(lab);
      return wrap;
    };

    toolbar.appendChild(mkInput("Species", "species", "e.g., Armadillidium nasatum"));
    toolbar.appendChild(mkInput("Morph", "morph_name", "e.g., Lemon Blue"));
    toolbar.appendChild(mkInput("Common Name", "common_name", "e.g., Rubber Ducky"));
    toolbar.appendChild(mkSelectType());
    toolbar.appendChild(mkSelectAvailability());

    container.appendChild(toolbar);
  }

  function buildTableSkeleton(container) {
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-responsive";
    tableWrap.innerHTML = `
      <table id="inv-table" class="table table-bordered table-hover align-middle text-nowrap">
        <thead class="table-light">
          <tr>
            ${mkTh("species", "Species")}
            ${mkTh("morph_name", "Morph")}
            ${mkTh("common_name", "Common Name")}
            ${mkTh("insect_type", "Type")}
            ${mkTh("availability", "Available")}
            ${mkTh("avail_notes", "Availability Notes")}
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;
    container.appendChild(tableWrap);

    // Attach sort handlers and resizers
    qsa("th[data-key]", tableWrap).forEach((th) => {
      th.addEventListener("click", (e) => {
        if (e.target.classList.contains("col-resizer")) return; // ignore drag handle
        const key = th.getAttribute("data-key");
        if (SORT.key === key) {
          SORT.dir = SORT.dir === "asc" ? "desc" : "asc";
        } else {
          SORT.key = key;
          SORT.dir = "asc";
        }
        renderTable();
      });
      attachResizer(th);
    });
    updateSortIndicators();
  }

  function mkTh(key, label) {
    return `
      <th data-key="${key}" style="position: relative; user-select: none; white-space: nowrap;">
        <span class="th-label">${label}</span>
        <span class="sort-ind ms-1 opacity-50"></span>
        <span class="col-resizer" style="position:absolute; top:0; right:0; width:6px; cursor:col-resize; user-select:none; height:100%;"></span>
      </th>
    `;
  }

  function attachResizer(th) {
    const resizer = th.querySelector(".col-resizer");
    let startX = 0;
    let startWidth = 0;

    const onMouseMove = (e) => {
      const dx = e.clientX - startX;
      const newWidth = Math.max(60, startWidth + dx);
      th.style.width = newWidth + "px";
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
    };
    resizer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = th.getBoundingClientRect().width;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
    });
  }

  function updateSortIndicators() {
    qsa("th[data-key]").forEach((th) => {
      const key = th.getAttribute("data-key");
      const ind = th.querySelector(".sort-ind");
      ind.textContent = "";
      if (key === SORT.key) {
        ind.textContent = SORT.dir === "asc" ? "▲" : "▼";
      }
    });
  }

  function renderTable() {
    const tbody = qs("#inv-table tbody");
    if (!tbody) return;
    const filtered = applyFilters(INVENTORY);
    const sorted = applySort(filtered);
    tbody.innerHTML = sorted.map((i) => {
      const notesText = stripHtmlToText(i.avail_notes || "");
      const preview = notesText.length > 120 ? notesText.slice(0, 117) + "…" : notesText;
      return `
        <tr>
          <td>${escapeHtml(i.species || "")}</td>
          <td>${escapeHtml(i.morph_name || "")}</td>
          <td>${escapeHtml(i.common_name || "")}</td>
          <td>${escapeHtml(i.insect_type || "")}</td>
          <td>${badgeYesNo(i.availability)}</td>
          <td title="${escapeAttr(notesText)}">${escapeHtml(preview)}</td>
        </tr>
      `;
    }).join("");
    updateSortIndicators();
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function escapeAttr(s){
    return String(s).replaceAll('"', "&quot;");
  }

  // --- Data helpers
  async function loadInventoryTypesForUser(distinctTypeNames) {
    if (!Array.isArray(distinctTypeNames) || distinctTypeNames.length === 0) {
      INVENTORY_TYPES = [];
      return;
    }
    // Query insect_types limited to names found in user's inventory
    const { data, error } = await supabase
      .from("insect_types")
      .select("name, sort_order")
      .in("name", distinctTypeNames)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) {
      console.warn("[userprofile] insect_types load error:", error);
      INVENTORY_TYPES = distinctTypeNames.map(n => ({ name: n, sort_order: 0 })); // fallback
    } else {
      INVENTORY_TYPES = data || [];
    }
  }

  // --- Initial load
  async function init() {
    try {
      const params = new URLSearchParams(window.location.search);
      userId = params.get("id");
      if (!userId) {
        document.body.innerHTML = "<div class='container py-5'><p class='text-danger'>❌ No user specified.</p></div>";
        return;
      }

      // Load profile header
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", userId)
        .single();

      if (profileError || !profile) {
        const ph = qs("#profile-header");
        if (ph) ph.innerHTML = "<p class='text-danger'>❌ Failed to load profile.</p>";
      } else {
        const nameEl = qs("#user-name");
        const roleEl = qs("#user-role");
        if (nameEl) nameEl.textContent = profile.full_name || "Unnamed User";
        if (roleEl) roleEl.textContent = profile.role || "Member";
      }

      // Load inventory (include new columns)
      const { data: inventories, error: invErr } = await supabase
        .from("user_inventories")
        .select("id, species, morph_name, common_name, insect_type, availability, avail_notes")
        .eq("user_id", userId);

      const invContainer = qs("#public-inventory");
      if (invErr) {
        if (invContainer) invContainer.innerHTML = "<p class='text-danger'>❌ Failed to load inventory.</p>";
        return;
      }

      INVENTORY = Array.isArray(inventories) ? inventories : [];

      // Build list of distinct type names from the inventory
      const typeSet = new Set(
        INVENTORY
          .map(r => (r.insect_type || "").trim())
          .filter(Boolean)
      );
      const distinctTypes = Array.from(typeSet);

      // Load insect_types limited to user's inventory types
      await loadInventoryTypesForUser(distinctTypes);

      // Default client-side sort by species asc
      SORT = { key: "species", dir: "asc" };

      if (!invContainer) return;
      invContainer.innerHTML = ""; // clear existing
      buildToolbar(invContainer);  // includes the Type select built from INVENTORY_TYPES
      buildTableSkeleton(invContainer);
      renderTable();

      // Load wishlist (unchanged rendering)
      const wlContainer = qs("#public-wishlist");
      if (wlContainer) {
        const { data: wishlist } = await supabase
          .from("user_wishlist")
          .select("species, common_name, insect_type, date_added")
          .eq("user_id", userId)
          .order("date_added", { ascending: false });

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
                <td>${escapeHtml(w.species || "")}</td>
                <td>${escapeHtml(w.common_name || "")}</td>
                <td>${escapeHtml(w.insect_type || "")}</td>
                <td>${w.date_added ? new Date(w.date_added).toLocaleDateString() : ""}</td>
              </tr>
            `;
          }
          html += "</tbody></table>";
          wlContainer.innerHTML = html;
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Kickoff
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
