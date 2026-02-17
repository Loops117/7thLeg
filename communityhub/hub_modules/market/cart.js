// /communityhub/hub_modules/market/cart.js
console.log("✅ market/cart.js loaded");

(function () {
  const supabase = window.supabase;

  const ACTIVE_STATUSES = [
    'draft',
    'submitted',
    'approved',
    'ready_for_payment'
  ];

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function money(n) {
    if (n === null || n === undefined || n === "") return "";
    const num = Number(n);
    if (Number.isNaN(num)) return String(n);
    return "$" + num.toFixed(2);
  }
  async function getUserId() {
    try {
      const { data, error } = await supabase?.auth?.getUser?.();
      if (error) return null;
      return data?.user?.id || null;
    } catch {
      return null;
    }
  }

  async function fetchCartState() {
    const userId = await getUserId();
    if (!userId) {
      return { userId: null, carts: [], items: [], stores: new Map(), listings: new Map() };
    }

    const { data: carts, error: cartsErr } = await supabase
      .from('store_carts')
      .select('id, store_id, status, updated_at, created_at')
      .eq('buyer_id', userId)
      .in('status', ACTIVE_STATUSES)
      .order('updated_at', { ascending: false });

    if (cartsErr) {
      console.error('❌ Failed to load carts:', cartsErr);
      return { userId, carts: [], items: [], stores: new Map(), listings: new Map(), error: cartsErr };
    }

    const cartIds = (carts || []).map(c => c.id);
    if (!cartIds.length) {
      return { userId, carts: [], items: [], stores: new Map(), listings: new Map() };
    }

    const { data: items, error: itemsErr } = await supabase
      .from('store_cart_items')
      .select('id, cart_id, listing_id, qty, updated_at')
      .in('cart_id', cartIds)
      .order('updated_at', { ascending: false });

    if (itemsErr) {
      console.error('❌ Failed to load cart items:', itemsErr);
    }

    const storeIds = Array.from(new Set((carts || []).map(c => c.store_id).filter(Boolean)));
    const listingIds = Array.from(new Set((items || []).map(i => i.listing_id).filter(Boolean)));

    // Live listing info (draft cart refresh rules)
    const listingsMap = new Map();
    if (listingIds.length) {
      const { data: listings, error: listErr } = await supabase
        .from('store_listings')
        .select('id, store_id, product_type, dry_name, species, morph_name, cover_image, qty_available, batch_size, price_per_batch, currency, active')
        .in('id', listingIds);
      if (listErr) console.error('❌ Failed to load listings:', listErr);
      (listings || []).forEach(l => listingsMap.set(l.id, l));
    }

    const storesMap = new Map();
    if (storeIds.length) {
      const { data: stores, error: storesErr } = await supabase
        .from('store_profiles')
        .select('id, name, slug')
        .in('id', storeIds);
      if (storesErr) console.error('❌ Failed to load stores:', storesErr);
      (stores || []).forEach(s => storesMap.set(s.id, s));
    }

    return { userId, carts: carts || [], items: items || [], stores: storesMap, listings: listingsMap };
  }

  async function removeItem(cartId, listingId) {
    if (!supabase) return;
    try {
      await supabase
        .from('store_cart_items')
        .delete()
        .eq('cart_id', cartId)
        .eq('listing_id', listingId);

      // If cart becomes empty, remove the cart row to keep things tidy
      const { data: remaining } = await supabase
        .from('store_cart_items')
        .select('id')
        .eq('cart_id', cartId)
        .limit(1);

      if (!remaining || remaining.length === 0) {
        await supabase
          .from('store_carts')
          .delete()
          .eq('id', cartId);
      }
    } catch (e) {
      console.error('❌ removeItem failed:', e);
    }
    await render();
  }

  async function setQty(cartId, listingId, qty) {
    if (!supabase) return;
    const q = Math.max(1, Math.floor(Number(qty) || 1));
    try {
      await supabase
        .from('store_cart_items')
        .update({ qty: q })
        .eq('cart_id', cartId)
        .eq('listing_id', listingId);
    } catch (e) {
      console.error('❌ setQty failed:', e);
    }
    await render();
  }

  async function render() {
    const root = document.getElementById("cart-root");
    if (!root) return;

    if (!supabase) {
      root.innerHTML = `
        <div class="card shadow-sm">
          <div class="card-body">
            <div class="text-danger">Cart can’t load because Supabase isn’t available on this page.</div>
          </div>
        </div>
      `;
      return;
    }

    const state = await fetchCartState();

    if (!state.userId) {
      root.innerHTML = `
        <div class="card shadow-sm">
          <div class="card-body">
            <div class="text-muted">Please sign in to view your cart.</div>
          </div>
        </div>
      `;
      return;
    }

    if (!state.carts.length) {
      root.innerHTML = `
        <div class="card shadow-sm">
          <div class="card-body">
            <div class="text-muted">Your cart is empty.</div>
          </div>
        </div>
      `;
      return;
    }

    // Group items by cart
    const itemsByCart = new Map();
    for (const it of state.items) {
      if (!itemsByCart.has(it.cart_id)) itemsByCart.set(it.cart_id, []);
      itemsByCart.get(it.cart_id).push(it);
    }

    // Build UI
    let html = "";

    for (const cartRow of state.carts) {
      const cartId = cartRow.id;
      const storeId = cartRow.store_id;

      const store = state.stores.get(storeId);
      const storeName = store?.name || "Vendor";
      const storeSlug = store?.slug;

      const cartItems = itemsByCart.get(cartId) || [];

      // Skip empty carts (just in case)
      if (!cartItems.length) continue;

      let vendorSubtotal = 0;
      let rowsHtml = "";

      for (const row of cartItems) {
        const lid = row.listing_id;
        const qty = Math.max(1, Number(row.qty || 1));
        const live = state.listings.get(lid);

        const isMissing = !live;
        const isInactive = live && live.active === false;

        const title = live
          ? (live.product_type === "drygood"
              ? (live.dry_name || "Untitled Item")
              : ([live.species, live.morph_name].filter(Boolean).join(" ") || "Untitled Listing"))
          : "Listing not found";

        const unit = live ? Number(live.price_per_batch || 0) : 0;
        const line = unit * qty;
        vendorSubtotal += line;

        const stock = live ? Number(live.qty_available || 0) : 0;
        const stockNote = isMissing ? "Unavailable" : (stock === 0 ? "Out of stock" : `In stock: ${stock}`);

        rowsHtml += `
          <div class="d-flex align-items-start justify-content-between border rounded p-2">
            <div class="flex-grow-1 pe-2">
              <div class="fw-semibold">${esc(title)}</div>
              <div class="small text-muted">${esc(stockNote)}${isInactive ? " • Inactive" : ""}</div>
              <div class="small text-muted">Unit: ${(live?.currency || "USD").toUpperCase()} ${esc(money(unit))}</div>
            </div>
            <div class="text-end" style="min-width: 170px;">
              <div class="d-flex justify-content-end align-items-center gap-2">
                <input class="form-control form-control-sm" type="number" min="1" value="${esc(qty)}" style="width:80px;" data-qty-cart="${esc(cartId)}" data-qty-listing="${esc(lid)}" />
                <button class="btn btn-outline-danger btn-sm" data-remove-cart="${esc(cartId)}" data-remove-listing="${esc(lid)}">Remove</button>
              </div>
              <div class="small text-muted mt-1">Line: ${esc(money(line))}</div>
            </div>
          </div>
        `;
      }

      const storeLink = storeSlug
        ? `<a href="/communityhub/hub.html?module=store/view_store&slug=${encodeURIComponent(storeSlug)}">${esc(storeName)}</a>`
        : esc(storeName);

      html += `
        <div class="card shadow-sm mb-3">
          <div class="card-header d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div>
              <div class="fw-semibold">Vendor Basket: ${storeLink}</div>
              <div class="small text-muted">Status: ${esc(cartRow.status || 'draft')}</div>
            </div>
            <button class="btn btn-primary btn-sm" disabled title="Next step: pre-receipt confirmation">Submit for Approval (Coming Soon)</button>
          </div>
          <div class="card-body d-flex flex-column gap-2">
            ${rowsHtml}
            <div class="d-flex justify-content-end pt-2">
              <div class="fw-semibold">Subtotal: ${esc(money(vendorSubtotal))}</div>
            </div>
          </div>
        </div>
      `;
    }

    root.innerHTML = html;

    // Wire events
    root.querySelectorAll("[data-remove-cart]").forEach(btn => {
      btn.addEventListener("click", () => {
        removeItem(btn.getAttribute("data-remove-cart"), btn.getAttribute("data-remove-listing"));
      });
    });
    root.querySelectorAll("input[data-qty-cart]").forEach(inp => {
      inp.addEventListener("change", () => {
        setQty(inp.getAttribute("data-qty-cart"), inp.getAttribute("data-qty-listing"), inp.value);
      });
    });
  }

  async function init() {
    await render();
  }

  // Support hub loader calling init()
  if (typeof window !== "undefined") {
    window.__marketCartInit = init;
  }

  // Also export init for hub.js module import pattern
  try {
    // no-op
  } catch {}
  
  // auto-init if loaded directly
  init();

  // export
  window.marketCart = { init };
})();

export function init() {
  // if hub imports and calls init(), delegate
  return window.marketCart?.init?.();
}
