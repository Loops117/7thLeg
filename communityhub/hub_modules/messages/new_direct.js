// communityhub/hub_modules/messages/new_direct.js
// Smart participants insert: try last_read_at, fallback to minimal if the column doesn't exist.

console.log("✅ new_direct.js loaded (smart participants insert)");

export async function init(options) {
  const supabase = window.supabase;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  options = options || {};

  const state = {
    selected: new Set(),
    searchTimer: null,
    entity: options.entity || null,
  };

  const els = {
    results: document.getElementById("results-body"),
    search: document.getElementById("user-search"),
    selCount: document.getElementById("sel-count"),
    clearSel: document.getElementById("clear-selection"),
    groupOpts: document.getElementById("group-options"),
    groupTitle: document.getElementById("group-title"),
    firstMsg: document.getElementById("first-message"),
    startBtn: document.getElementById("start-conversation"),
    feedback: document.getElementById("nd-feedback"),
  };

  function setFeedback(msg, isErr=false) {
    els.feedback.textContent = msg || "";
    els.feedback.className = "mt-2 small " + (isErr ? "text-danger" : "text-muted");
  }
  function updateSelUI() {
    els.selCount.textContent = state.selected.size;
    els.groupOpts.style.display = state.selected.size > 1 ? "" : "none";
  }
  els.clearSel.addEventListener("click", (e) => {
    e.preventDefault();
    state.selected.clear();
    updateSelUI();
    els.results.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  });

  els.search.addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(runSearch, 220);
  });

  async function runSearch() {
    const q = (els.search.value || "").trim();
    if (q.length < 2) {
      els.results.innerHTML = `<tr><td colspan="3" class="text-muted p-3">Type at least 2 letters…</td></tr>`;
      return;
    }
    setFeedback("Searching…");

    const pattern = `%${q}%`;
    let rows1 = [], rows2 = [], err1 = null, err2 = null;

    try {
      const res = await supabase
        .from("profiles")
        .select("id, full_name, location")
        .neq("id", user.id)
        .ilike("full_name", pattern)
        .order("full_name", { ascending: true })
        .limit(25);
      if (res.error) err1 = res.error; else rows1 = res.data || [];
    } catch (e) { err1 = e; }

    if ((rows1?.length || 0) < 25) {
      try {
        const res = await supabase
          .from("profiles")
          .select("id, full_name, location")
          .neq("id", user.id)
          .ilike("location", pattern)
          .order("full_name", { ascending: true })
          .limit(25);
        if (res.error) err2 = res.error; else rows2 = res.data || [];
      } catch (e) { err2 = e; }
    }

    if (err1 && err2) {
      console.error("Profile search failed:", err1 || err2);
      setFeedback("Search failed. If RLS is enabled on profiles, allow SELECT on id, full_name, location.", true);
      return;
    }

    const map = new Map();
    [...rows1, ...rows2].forEach(p => { if (p && p.id) map.set(p.id, p); });
    const rows = Array.from(map.values()).slice(0, 25);

    setFeedback("");
    els.results.innerHTML = rows.map(p => {
      const checked = state.selected.has(p.id) ? "checked" : "";
      const name = p.full_name || "Unknown";
      const loc = p.location || "";
      return `
        <tr>
          <td><input type="checkbox" class="form-check-input" data-id="${p.id}" ${checked}></td>
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(loc)}</td>
        </tr>`;
    }).join("") || `<tr><td colspan="3" class="text-muted p-3">No results</td></tr>`;

    els.results.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener("change", () => {
        const id = cb.getAttribute("data-id");
        if (cb.checked) state.selected.add(id);
        else state.selected.delete(id);
        updateSelUI();
      });
    });
  }

  updateSelUI();

  els.startBtn.addEventListener("click", async () => {
    setFeedback("");
    if (!state.selected.size) return setFeedback("Select at least one user.", true);

    const { data: { user } } = await supabase.auth.getUser();
    const others = Array.from(state.selected);
    const type = (others.length === 1) ? "direct" : "group";
    const title = (type === "group") ? (els.groupTitle.value || "").trim() : "";

    if (type === "direct") {
      const convId = await ensureDirectConversation(user.id, others[0]);
      if (!convId) return setFeedback("Failed to start conversation.", true);
      const msgId = await sendFirstMessage(convId, els.firstMsg.value.trim());
      if (msgId && state.entity) await attachEntity(msgId, state.entity);
      return openConv(convId);
    } else {
      const convId = await createGroupConversation(user.id, others, title);
      if (!convId) return setFeedback("Failed to start group.", true);
      const msgId = await sendFirstMessage(convId, els.firstMsg.value.trim());
      if (msgId && state.entity) await attachEntity(msgId, state.entity);
      return openConv(convId);
    }
  });

  function openConv(id) {
    try {
      if (typeof window.loadModule === "function") {
        loadModule("messages/conversation", { id });
        return;
      }
    } catch(e){}
    window.location.href = `/communityhub/hub.html?module=messages/conversation&id=${id}`;
  }

  async function ensureDirectConversation(me, other) {
    const { data: partRows } = await supabase
      .from("user_conversation_participants")
      .select("conversation_id, user_id")
      .in("user_id", [me, other]);

    if (partRows?.length) {
      const byConv = {};
      partRows.forEach(r => {
        byConv[r.conversation_id] = byConv[r.conversation_id] || new Set();
        byConv[r.conversation_id].add(r.user_id);
      });
      const existingConvId = Object.keys(byConv).find(cid => byConv[cid].has(me) && byConv[cid].has(other));
      if (existingConvId) {
        const { data: conv } = await supabase.from("user_conversations").select("id, type").eq("id", existingConvId).single();
        if (conv && conv.type === "direct") return conv.id;
      }
    }

    const { data: otherProfile } = await supabase.from("profiles").select("full_name").eq("id", other).single();
    const title = otherProfile?.full_name || "Direct Message";

    const { data: conv, error: err1 } = await supabase
      .from("user_conversations")
      .insert([{ type: "direct", title, created_by: me }])
      .select("id")
      .single();
    if (err1 || !conv) { console.error("create conversation failed", err1); return null; }

    const ok = await insertParticipants(conv.id, [me, other]);
    if (!ok) return null;
    return conv.id;
  }

  async function createGroupConversation(me, others, title) {
    let finalTitle = title;
    if (!finalTitle) {
      const { data: pros } = await supabase.from("profiles").select("id, full_name").in("id", others).limit(3);
      const names = (pros || []).map(p => p.full_name || p.id.slice(0,6));
      finalTitle = names.slice(0,2).join(", ") + (names.length > 2 ? " +" + (names.length - 2) : "");
    }

    const { data: conv, error: err1 } = await supabase
      .from("user_conversations")
      .insert([{ type: "group", title: finalTitle, created_by: me }])
      .select("id")
      .single();
    if (err1 || !conv) { console.error("create group failed", err1); return null; }

    const ok = await insertParticipants(conv.id, [me, ...others]);
    if (!ok) return null;
    return conv.id;
  }

  async function insertParticipants(conversationId, userIds) {
    const nowIso = new Date().toISOString();
    // Try with last_read_at first
    let rows = userIds.map((uid, idx) => ({
      conversation_id: conversationId,
      user_id: uid,
      ...(idx === 0 ? { last_read_at: nowIso } : {})
    }));
    let res = await supabase.from("user_conversation_participants").insert(rows);
    if (res.error && (res.error.code === "PGRST204" || String(res.error.message || "").toLowerCase().includes("last_read_at"))) {
      // Retry minimal
      rows = userIds.map(uid => ({ conversation_id: conversationId, user_id: uid }));
      res = await supabase.from("user_conversation_participants").insert(rows);
    }
    if (res.error) { console.error("add participants failed", res.error); return false; }
    return true;
  }

  async function sendFirstMessage(conversationId, text) {
    const body = (text || "").trim();
    if (!body) return null;
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("user_messages")
      .insert([{ conversation_id: conversationId, sender_id: user.id, body, kind: "text", metadata: {} }])
      .select("id")
      .single();
    if (error) { console.error("sendFirstMessage failed", error); return null; }
    return data.id;
  }

  async function attachEntity(messageId, entity) {
    if (!messageId || !entity?.type || !entity?.id) return;
    await supabase.from("user_message_entities").insert([{
      message_id: messageId,
      entity_type: entity.type,
      entity_id: entity.id,
      entity_label: entity.label || null,
      entity_url: entity.url || null
    }]);
  }
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
