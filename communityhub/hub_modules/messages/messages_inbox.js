// communityhub/hub_modules/messages/messages_inbox.js (RPC fallbacks + error clarity)
console.log("✅ messages_inbox.js loaded (RPC fallbacks)");

export async function init() {
  const supabase = window.supabase;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const convs = await fetchConversationsCategorized(user.id);

  renderList("auctions", convs.auctions);
  renderList("trades", convs.trades);
  renderList("direct", convs.direct_or_group);

  document.getElementById("count-auctions").textContent = convs.auctions.length;
  document.getElementById("count-trades").textContent = convs.trades.length;
  document.getElementById("count-direct").textContent = convs.direct_or_group.length;

  document.getElementById("new-direct-btn")?.addEventListener("click", () => {
    if (typeof window.loadModule === "function") loadModule("messages/new_direct");
    else window.location.href = "/communityhub/hub.html?module=messages/new_direct";
  });
}

async function fetchConversationsCategorized(userId) {
  const supabase = window.supabase;

  // Try RPC first (handles RLS): get_my_conversations
  let convs = null;
  try {
    const { data, error } = await supabase.rpc("get_my_conversations", {});
    if (!error) convs = data;
  } catch (e) {}

  // Fallback to participants table
  if (!convs) {
    const { data: parts, error } = await supabase
      .from("user_conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", userId);

    if (error) {
      console.error("❌ participants fetch failed:", error);
      return { auctions: [], trades: [], direct_or_group: [] };
    }

    const convIds = (parts || []).map(p => p.conversation_id);
    if (!convIds.length) return { auctions: [], trades: [], direct_or_group: [] };

    const { data } = await supabase
      .from("user_conversations")
      .select("id, type, title, updated_at")
      .in("id", convIds)
      .order("updated_at", { ascending: false });
    convs = data || [];
  }

  // Categories via view or RPC
  const convIds = (convs || []).map(c => c.id);
  let catMap = {};
  let cats = null;
  try {
    const res = await supabase.from("v_user_conversation_category").select("conversation_id, category").in("conversation_id", convIds);
    cats = res.data;
  } catch (e) {}
  if (!cats) {
    // Try RPC get_conversation_entities
    const { data } = await supabase.rpc("get_conversation_entities", { conv_ids: convIds });
    const entMap = {};
    (data || []).forEach(r => entMap[r.conversation_id] = (r.types || []));
    convs.forEach(c => {
      const types = entMap[c.id] || [];
      catMap[c.id] = types.includes("auction") ? "auction" : types.includes("trade") ? "trade" : "direct_or_group";
    });
  } else {
    cats.forEach(c => { catMap[c.conversation_id] = c.category; });
  }

  // Unreads via view or RPC
  const counts = {};
  try {
    const { data } = await supabase.from("v_user_conversation_unreads").select("conversation_id, unread_count").in("conversation_id", convIds);
    (data || []).forEach(r => counts[r.conversation_id] = Number(r.unread_count) || 0);
  } catch (e) {
    // RPC fallback
    const { data } = await supabase.rpc("get_unread_counts", {});
    (data || []).forEach(r => counts[r.conversation_id] = Number(r.unread_count) || 0);
  }

  const enrich = (convs || []).map(c => ({
    ...c,
    category: catMap[c.id] || "direct_or_group",
    unread: counts[c.id] || 0,
  }));

  return {
    auctions: enrich.filter(c => c.category === "auction"),
    trades: enrich.filter(c => c.category === "trade"),
    direct_or_group: enrich.filter(c => c.category === "direct_or_group"),
  };
}

function renderList(kind, convs) {
  const el = document.getElementById(`list-${kind}`);
  el.innerHTML = (convs || []).map(c => {
    const href = `/communityhub/hub.html?module=messages/conversation&id=${c.id}`;
    const badge = c.unread ? `<span class="badge bg-danger ms-2">${c.unread}</span>` : "";
    const title = c.title || (c.type === "direct" ? "Conversation" : "Group");
    const when = new Date(c.updated_at).toLocaleString();
    return `
      <a href="${href}" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" onclick="return openConversation('${c.id}')">
        <div>
          <div class="fw-semibold">${title}${badge}</div>
          <div class="small text-muted">${when}</div>
        </div>
        <div class="text-muted">Open ›</div>
      </a>`;
  }).join("") || `<div class="list-group-item text-muted">No ${kind} conversations</div>`;

  if (!window.openConversation) {
    window.openConversation = function(id) {
      try { if (typeof window.loadModule === "function") { loadModule("messages/conversation", { id }); return false; } }
      catch (e) {}
      return true;
    };
  }
}
