// /communityhub/hub_modules/store/store_sales.js
console.log("✅ store/store_sales.js loaded");

export async function init({ store_id }) {
  const supabase = window.supabase;

  const { data: orders, error } = await supabase
    .from("store_orders")
    .select("id, buyer_id, status, subtotal, shipping, tax, total, currency, created_at, profiles:profiles!store_orders_buyer_id_fkey(full_name)")
    .eq("store_id", store_id)
    .order("created_at", { ascending: false });

  if (error) {
    document.getElementById("sales-msg").innerHTML = `<div class='alert alert-danger py-2'>${esc(error.message)}</div>`;
    return;
  }

  const acc = document.getElementById("sales-accordion");
  if (!orders?.length) {
    acc.innerHTML = "<div class='text-muted'>No sales yet.</div>";
    return;
  }

  const ids = orders.map(o => o.id);
  const { data: items } = await supabase
    .from("store_order_items")
    .select("order_id, title, product_type, batch_size, qty_batches, unit_price, line_total, listing_id")
    .in("order_id", ids);

  const map = new Map();
  (items||[]).forEach(it => {
    if (!map.has(it.order_id)) map.set(it.order_id, []);
    map.get(it.order_id).push(it);
  });

  acc.innerHTML = orders.map((o, idx) => {
    const its = map.get(o.id) || [];
    const rows = its.map(it => `
      <tr>
        <td>${esc(it.title)}</td>
        <td>${esc(it.product_type)}</td>
        <td>${esc(it.batch_size)}</td>
        <td>${esc(it.qty_batches)}</td>
        <td>$${Number(it.unit_price).toFixed(2)}</td>
        <td>$${Number(it.line_total).toFixed(2)}</td>
      </tr>
    `).join("");

    const buyer = o.profiles?.full_name || o.buyer_id.slice(0,6);
    const dt = new Date(o.created_at).toLocaleString();
    const hdr = `${dt} — ${esc(buyer)} — $${Number(o.total).toFixed(2)}`;

    return `
<div class="accordion-item">
  <h2 class="accordion-header" id="h-${idx}">
    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#c-${idx}" aria-expanded="false">
      ${hdr}
    </button>
  </h2>
  <div id="c-${idx}" class="accordion-collapse collapse" data-bs-parent="#sales-accordion">
    <div class="accordion-body">
      <div class="mb-2"><strong>Status:</strong> ${esc(o.status)}</div>
      <div class="table-responsive">
        <table class="table table-sm">
          <thead><tr><th>Item</th><th>Type</th><th>Batch</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
          <tbody>${rows || "<tr><td colspan='6' class='text-muted'>No items.</td></tr>"}</tbody>
        </table>
      </div>
      <div class="d-flex justify-content-end">
        <div class="text-end">
          <div>Subtotal: <strong>$${Number(o.subtotal).toFixed(2)}</strong></div>
          <div>Shipping: <strong>$${Number(o.shipping).toFixed(2)}</strong></div>
          <div>Tax: <strong>$${Number(o.tax).toFixed(2)}</strong></div>
          <div>Total: <strong>$${Number(o.total).toFixed(2)}</strong></div>
        </div>
      </div>
    </div>
  </div>
</div>`;
  }).join("");
}

function esc(s){return (s||"").replace(/[&<>"]/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m]));}
