/**
 * Hub Module: Market Product Page
 * URL: /communityhub/hub.html?module=market/product&listing=<uuid>&store=<slug?>
 */
console.log("✅ market/product.js loaded");

(function () {
  const supabase = window.supabase;

  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }
  function money(n) {
    if (n === null || n === undefined || n === "") return "";
    const num = Number(n);
    if (Number.isNaN(num)) return String(n);
    return "$" + num.toFixed(2);
  }
  function safeText(v) {
    return (v === null || v === undefined) ? "" : String(v);
  }
  function normalizeName(s) {
    return safeText(s)
      .toLowerCase()
      .replace(/[^a-z0-9\s\.]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function nameTokens(s) {
    const n = normalizeName(s);
    if (!n) return [];
    return n.split(" ").filter(Boolean);
  }
  function tokenOverlap(a, b) {
    const A = new Set(nameTokens(a));
    const B = new Set(nameTokens(b));
    if (!A.size || !B.size) return 0;
    let hit = 0;
    for (const t of A) if (B.has(t)) hit++;
    return hit / Math.max(A.size, B.size);
  }
  function sanitizeHtml(inputHtml) {
    const html = String(inputHtml || "");
    if (!html) return "";
    const allowedTags = new Set(["B","STRONG","I","EM","U","BR","P","DIV","SPAN","UL","OL","LI","A","SMALL","H6","H5","H4","H3","H2","H1","CODE","PRE"]);
    const allowedAttrs = {
      "A": new Set(["href","target","rel"]),
      "SPAN": new Set(["class"]),
      "DIV": new Set(["class"]),
      "P": new Set(["class"]),
      "UL": new Set(["class"]),
      "OL": new Set(["class"]),
      "LI": new Set(["class"]),
      "SMALL": new Set(["class"])
    };

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
    const root = doc.body.firstElementChild;

    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
    const toRemove = [];

    while (walker.nextNode()) {
      const el = walker.currentNode;
      const tag = el.tagName;

      if (!allowedTags.has(tag)) {
        // replace disallowed element with its text content
        const text = doc.createTextNode(el.textContent || "");
        el.replaceWith(text);
        continue;
      }

      // strip dangerous attrs + restrict allowed
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const isEvent = name.startsWith("on");
        if (isEvent || name === "style") {
          el.removeAttribute(attr.name);
          continue;
        }
        const allowedForTag = allowedAttrs[tag] || new Set();
        if (!allowedForTag.has(attr.name)) {
          el.removeAttribute(attr.name);
        }
      }

      // special-case links
      if (tag === "A") {
        const href = el.getAttribute("href") || "";
        // block javascript: and data:
        if (/^\s*(javascript:|data:)/i.test(href)) {
          el.removeAttribute("href");
        } else {
          el.setAttribute("rel", "noopener noreferrer");
          if (!el.getAttribute("target")) el.setAttribute("target", "_blank");
        }
      }
    }

    return root.innerHTML;
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  const els = {
    title: document.getElementById("product-title"),
    sellerLine: document.getElementById("product-seller-line"),
    image: document.getElementById("product-image"),
    imageNote: document.getElementById("product-image-note"),
    price: document.getElementById("product-price"),
    qty: document.getElementById("product-qty"),
    meta: document.getElementById("product-meta"),
    desc: document.getElementById("product-description"),
    buyBtn: document.getElementById("buy-button"),
    qtyInput: document.getElementById("qty-input"),
    qtyMinus: document.getElementById("qty-minus"),
    qtyPlus: document.getElementById("qty-plus"),
    buyNote: document.getElementById("buy-note"),
    toggleSimilar: document.getElementById("toggle-similar"),
    similarCollapse: document.getElementById("similar-collapse"),
    similarList: document.getElementById("similar-list"),
    thumbsWrap: document.getElementById("product-thumbs"),
    thumbsInner: document.getElementById("product-thumbs-inner"),
    similarCard: document.getElementById("similar-card"),
  };

  if (!supabase) {
    console.error("❌ Supabase not found on window");
    if (els.title) els.title.textContent = "Error loading product";
    if (els.buyNote) els.buyNote.textContent = "Supabase client is not available in this view.";
    return;
  }

  // Bootstrap collapse control (works if hub includes Bootstrap JS)
  let bsCollapse = null;
  if (window.bootstrap && els.similarCollapse) {
    try { bsCollapse = new bootstrap.Collapse(els.similarCollapse, { toggle: false }); } catch { bsCollapse = null; }
  }
  if (els.toggleSimilar) {
    els.toggleSimilar.addEventListener("click", () => {
      if (!bsCollapse) {
        // fallback: toggle manually
        els.similarCollapse.classList.toggle("show");
      } else {
        bsCollapse.toggle();
      }
      const isShown = els.similarCollapse.classList.contains("show");
      els.toggleSimilar.textContent = isShown ? "Hide" : "Show";
    });
  }

  const listingId = qs("listing");
  if (!listingId) {
    els.title.textContent = "Product not found";
    return;
  }

  function clampInt(v, min, max) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function toast(title, msg) {
    if (window.showToast) return window.showToast(title, msg);
    alert(`${title}\n\n${msg}`);
  }

  function getSelectedQty(maxQty) {
    const raw = els.qtyInput?.value ?? "1";
    const q = clampInt(raw, 1, maxQty);
    if (els.qtyInput) els.qtyInput.value = String(q);
    return q;
  }

  function setQtyControls(maxQty) {
    if (els.qtyInput) {
      els.qtyInput.min = "1";
      els.qtyInput.max = String(maxQty);
      els.qtyInput.value = "1";
      els.qtyInput.addEventListener("change", () => getSelectedQty(maxQty));
      els.qtyInput.addEventListener("input", () => {
        // keep it numeric-ish; final clamp on change/click
        if (els.qtyInput.value === "") return;
        els.qtyInput.value = String(els.qtyInput.value).replace(/[^\d]/g, "");
      });
    }
    els.qtyMinus?.addEventListener("click", () => {
      const cur = getSelectedQty(maxQty);
      const next = clampInt(cur - 1, 1, maxQty);
      if (els.qtyInput) els.qtyInput.value = String(next);
    });
    els.qtyPlus?.addEventListener("click", () => {
      const cur = getSelectedQty(maxQty);
      const next = clampInt(cur + 1, 1, maxQty);
      if (els.qtyInput) els.qtyInput.value = String(next);
    });
  }

  async function getAuthedUserId() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data?.user?.id || null;
  }

  async function getOrCreateDraftCart(buyerId, storeId) {
    // If buyer already has an "active" cart for this vendor, we can only add to it if it's still draft.
    const { data: carts, error } = await supabase
      .from("store_carts")
      .select("id, status")
      .eq("buyer_id", buyerId)
      .eq("store_id", storeId)
      .in("status", ["draft", "submitted", "approved", "ready_for_payment"])
      .order("updated_at", { ascending: false })
      .limit(1);

    if (error) throw error;

    if (carts && carts.length) {
      const c = carts[0];
      if (c.status !== "draft") {
        return { blocked: true, status: c.status, cartId: c.id };
      }
      return { blocked: false, cartId: c.id };
    }

    const { data: newCart, error: insErr } = await supabase
      .from("store_carts")
      .insert({ buyer_id: buyerId, store_id: storeId, status: "draft" })
      .select("id, status")
      .single();

    if (insErr) throw insErr;
    return { blocked: false, cartId: newCart.id };
  }

  async function addListingToCart({ listingId, storeId, addQty }) {
    const buyerId = await getAuthedUserId();
    if (!buyerId) {
      toast("Login required", "Please sign in to add items to your cart.");
      return { ok: false, reason: "no_user" };
    }

    const cart = await getOrCreateDraftCart(buyerId, storeId);
    if (cart.blocked) {
      toast("Cart locked", "You already submitted this vendor cart for approval. Finish that cart before adding more items.");
      return { ok: false, reason: "cart_locked" };
    }

    // Upsert item qty (increment if exists)
    const { data: existingItem, error: itemErr } = await supabase
      .from("store_cart_items")
      .select("id, qty")
      .eq("cart_id", cart.cartId)
      .eq("listing_id", listingId)
      .maybeSingle();

    if (itemErr) throw itemErr;

    if (existingItem?.id) {
      const { error: updErr } = await supabase
        .from("store_cart_items")
        .update({ qty: Number(existingItem.qty || 0) + Number(addQty || 0) })
        .eq("id", existingItem.id);

      if (updErr) throw updErr;
    } else {
      const { error: insItemErr } = await supabase
        .from("store_cart_items")
        .insert({ cart_id: cart.cartId, listing_id: listingId, qty: addQty });

      if (insItemErr) throw insItemErr;
    }

    return { ok: true, cartId: cart.cartId };
  }


  (async () => {
    // Listing
    const { data: listing, error } = await supabase
      .from("store_listings")
      .select("id, store_id, product_type, dry_name, species, morph_name, description, dry_description, cover_image, batch_size, qty_available, price_per_batch, currency, active, created_at")
      .eq("id", listingId)
      .maybeSingle();

    if (error || !listing) {
      console.error("❌ listing fetch failed", error);
      els.title.textContent = "Product not found";
      return;
    }

    // Store
    const { data: store } = await supabase
      .from("store_profiles")
      .select("id, name, slug, logo_url, location")
      .eq("id", listing.store_id)
      .maybeSingle();

    // Images (cover + gallery)
    const gallery = [];
    const seen = new Set();

    if (listing.cover_image) {
      gallery.push({ url: listing.cover_image, alt: "Cover image" });
      seen.add(listing.cover_image);
    }

    const { data: imgs } = await supabase
      .from("store_listing_images")
      .select("url, alt, sort_order")
      .eq("listing_id", listing.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    (imgs || []).forEach(im => {
      if (im?.url && !seen.has(im.url)) {
        gallery.push({ url: im.url, alt: im.alt || "Listing image" });
        seen.add(im.url);
      }
    });

    const imageUrl = gallery.length ? gallery[0].url : null;
const isDry = listing.product_type === "drygood";
    const title = isDry
      ? (listing.dry_name || "Untitled Item")
      : ([listing.species, listing.morph_name].filter(Boolean).join(" ") || "Untitled Listing");

    const desc = isDry
      ? (listing.dry_description || listing.description || "")
      : (listing.description || "");

    // Render
    els.title.textContent = title;
    els.sellerLine.innerHTML = store?.slug
      ? `Sold by: <a href="/communityhub/hub.html?module=store/view_store&slug=${encodeURIComponent(store.slug)}">${esc(store.name || "Store")}</a>`
      : `Sold by: ${esc(store?.name || "Store")}`;

    els.price.textContent = `${(listing.currency || "USD").toUpperCase()} ${money(listing.price_per_batch)}`;
    els.qty.textContent = `Available: ${safeText(listing.qty_available)} batch(es)`;

    const available = Number(listing.qty_available);
    const maxQty = Number.isFinite(available) && available > 0 ? Math.floor(available) : 1;

    // Quantity picker setup
    setQtyControls(maxQty);

    // Disable buying when unavailable/inactive
    const canBuy = Boolean(listing.active) && (Number.isFinite(available) ? available > 0 : true);
    if (!canBuy) {
      if (els.buyBtn) els.buyBtn.disabled = true;
      if (els.qtyInput) els.qtyInput.disabled = true;
      if (els.qtyMinus) els.qtyMinus.disabled = true;
      if (els.qtyPlus) els.qtyPlus.disabled = true;
      if (els.buyNote) els.buyNote.textContent = "This item is not available right now.";
    } else if (els.buyNote) {
      els.buyNote.textContent = "Adds to your cart. You'll submit for vendor approval later.";
    }

    // Buy/Add-to-cart
    if (els.buyBtn) {
      els.buyBtn.onclick = async () => {
        if (!canBuy) return;

        const chosen = getSelectedQty(maxQty);
        if (Number.isFinite(available) && chosen > available) {
          toast("Quantity updated", "Requested quantity exceeds current stock. Adjusted to what's available.");
        }
        const qtyToAdd = Number.isFinite(available) ? Math.min(chosen, available) : chosen;

        try {
          els.buyBtn.disabled = true;
          const prevText = els.buyBtn.textContent;
          els.buyBtn.textContent = "Adding…";

          const res = await addListingToCart({
            listingId: listing.id,
            storeId: listing.store_id,
            addQty: qtyToAdd
          });

          if (res?.ok) {
            toast("Added to cart", `Added ${qtyToAdd} to your cart.`);
            if (els.qtyInput) els.qtyInput.value = "1"; // reset picker after click
          }
          els.buyBtn.textContent = prevText;
          els.buyBtn.disabled = false;
        } catch (e) {
          console.error("❌ add to cart failed", e);
          toast("Error", "Couldn't add this item to your cart. Please try again.");
          els.buyBtn.textContent = "Buy";
          els.buyBtn.disabled = false;
        }
      };
    }

    if (els.image) {
      els.image.src = imageUrl || "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
    }
    if (els.imageNote) {
      els.imageNote.textContent = imageUrl ? "" : "No image uploaded yet.";
    }

    // Thumbnails
    if (els.thumbsWrap && els.thumbsInner) {
      els.thumbsInner.innerHTML = "";
      if (gallery.length > 1) {
        els.thumbsWrap.style.display = "";
        gallery.forEach((im, idx) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn btn-light p-0 border";
          btn.style.width = "56px";
          btn.style.height = "56px";
          btn.style.overflow = "hidden";
          btn.setAttribute("aria-label", `View image ${idx + 1}`);
          btn.innerHTML = `<img src="${esc(im.url)}" alt="${esc(im.alt || "Listing image")}" style="width:100%;height:100%;object-fit:cover;display:block;">`;
          btn.addEventListener("click", () => {
            if (els.image) els.image.src = im.url;
          });
          els.thumbsInner.appendChild(btn);
        });
      } else {
        els.thumbsWrap.style.display = "none";
      }
    }
els.meta.innerHTML = `
      <div class="small text-muted">
        <div><span class="fw-semibold">Batch Size:</span> ${esc(listing.batch_size || 1)}</div>
        <div><span class="fw-semibold">Type:</span> ${esc(listing.product_type || "")}</div>
      </div>
    `;
    els.desc.innerHTML = desc ? sanitizeHtml(desc) : "<span class=\"text-muted\">No description yet.</span>";

    // Similar listings (inventory listings only)
    if (listing.product_type !== "inventory") {
      if (els.similarCard) els.similarCard.style.display = "none";
      return;
    }
els.similarList.innerHTML = `<div class="text-muted small">Loading…</div>`;

    const { data: otherListings, error: otherErr } = await supabase
      .from("store_listings")
      .select("id, store_id, product_type, species, morph_name, qty_available, price_per_batch, batch_size, active")
      .eq("active", true)
      .neq("id", listing.id)
      .limit(80);

    if (otherErr || !otherListings?.length) {
      els.similarList.innerHTML = `<div class="text-muted small">No similar listings found.</div>`;
      return;
    }

    const baseName = title;
    const scored = otherListings
      .filter(l => l.product_type !== "drygood")
      .map(l => {
        const t = [l.species, l.morph_name].filter(Boolean).join(" ");
        return { listing: l, title: t, score: tokenOverlap(baseName, t) };
      })
      .filter(x => x.score >= 0.35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (!scored.length) {
      els.similarList.innerHTML = `<div class="text-muted small">No similar listings found.</div>`;
      return;
    }

    // fetch store names in one go
    const storeIds = Array.from(new Set(scored.map(s => s.listing.store_id)));
    const { data: stores } = await supabase
      .from("store_profiles")
      .select("id, name, slug")
      .in("id", storeIds);

    const storeMap = new Map((stores || []).map(s => [s.id, s]));

    els.similarList.innerHTML = "";
    for (const s of scored) {
      const sp = storeMap.get(s.listing.store_id);
      const storeName = sp?.name || "Store";
      const row = document.createElement("div");
      row.className = "d-flex align-items-center justify-content-between border-bottom py-2 gap-2";
      row.innerHTML = `
        <div class="flex-grow-1">
          <div class="fw-semibold">${esc(s.title)}</div>
          <div class="small text-muted">${esc(storeName)} • ${esc(s.listing.qty_available)} avail • ${esc(money(s.listing.price_per_batch))}</div>
        </div>
        <button class="btn btn-sm btn-outline-primary">View</button>
      `;
      row.querySelector("button").addEventListener("click", () => {
        window.location.href = `/communityhub/hub.html?module=market/product&listing=${encodeURIComponent(s.listing.id)}`;
      });
      els.similarList.appendChild(row);
    }
  })().catch(err => {
    console.error(err);
    els.title.textContent = "Error loading product";
  });
})();