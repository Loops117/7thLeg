
// communityhub/hub_modules/messages/conversation.js
// Table-only, usernames (clickable), mine LEFT / others RIGHT,
// realtime + polling fallback, subtle timestamps (hover/click), and 12h break headers.
console.log("✅ conversation.js loaded (hover/click timestamps + 12h breaks + realtime+poll)");

// Switch where the timestamp appears relative to the bubble.
// 'between'  → Name, then timestamp, then bubble
// 'below'    → Name, then bubble, then timestamp
const TIMESTAMP_PLACEMENT = 'between'; // 'between' | 'below'

export async function init(options) {
  const supabase = window.supabase;
  const convId = (options && options.id) || new URLSearchParams(location.search).get("id");
  const { data: { user } } = await supabase.auth.getUser();
  if (!convId || !user) return;

  ensureStyles();

  // --- Conversation header ---
  const { data: conv } = await supabase
    .from("user_conversations")
    .select("*")
    .eq("id", convId)
    .single();
  if (!conv) {
    document.getElementById("conversation-view").innerHTML = "<p class='text-danger'>Conversation not found.</p>";
    return;
  }
  const titleEl = document.getElementById("conv-title");
  const metaEl = document.getElementById("conv-meta");
  titleEl.textContent = conv.title || (conv.type === "direct" ? "Direct Message" : "Group Chat");
  metaEl.textContent = `Type: ${conv.type} • Updated: ${new Date(conv.updated_at).toLocaleString()}`;

  // --- Participants & name map ---
  const { data: parts } = await supabase
    .from("user_conversation_participants")
    .select("user_id, last_read_at, profiles:profiles!user_conversation_participants_user_id_fkey(full_name)")
    .eq("conversation_id", convId);

  const nameMap = {};
  (parts || []).forEach(p => {
    nameMap[p.user_id] = p.profiles?.full_name || (p.user_id ? p.user_id.slice(0, 6) : "User");
  });
  const memberNames = (parts || []).map(p => nameMap[p.user_id]).join(", ");
  if (memberNames) metaEl.textContent += ` • Members: ${memberNames}`;

  // --- Messages (initial load) ---
  let currentMessages = [];
  let latestTs = null; // ISO string
  const box = document.getElementById("messages-box");

  // Tap-to-toggle on hoverless devices (mobile/tablets)
  const hoverless = window.matchMedia && window.matchMedia("(hover: none)").matches;
  box.addEventListener("click", (e) => {
    if (!hoverless) return; // desktop uses :hover
    if (e.target.closest("a")) return; // don't toggle when clicking profile links
    const msgEl = e.target.closest(".msg");
    if (msgEl) msgEl.classList.toggle("show-time");
  });

  async function loadAll(scrollToEnd=false) {
    const res = await supabase
      .from("user_messages")
      .select("id, sender_id, body, created_at, is_deleted, kind")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    currentMessages = res.data || [];
    if (currentMessages.length) {
      latestTs = currentMessages[currentMessages.length - 1].created_at;
    }
    renderAll();
    if (scrollToEnd) box.scrollTop = box.scrollHeight;
    else setTimeout(() => box.scrollTop = box.scrollHeight, 0);
  }

  function renderAll() {
    if (!currentMessages.length) {
      box.innerHTML = "<div class='text-muted'>No messages yet.</div>";
      return;
    }
    let html = "";
    let prevTs = null;
    for (const m of currentMessages) {
      // Insert a subtle break header if >= 12h since last message
      if (needsBreak(prevTs, m.created_at)) {
        html += renderBreakHeader(m.created_at);
      }
      html += renderMessageHtml(m);
      prevTs = m.created_at;
    }
    box.innerHTML = html;
  }

  function profileHref(userId) {
    return `/communityhub/hub.html?module=profile&id=${userId}`;
  }
  function openProfile(userId) {
    try {
      if (typeof window.loadModule === "function") {
        loadModule("profile", { id: userId });
        return false;
      }
    } catch(e){}
    return true;
  }
  window.openProfile = window.openProfile || openProfile;

  function fmtTime(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return ""; }
  }
  function fmtBreak(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch { return ""; }
  }
  function needsBreak(prevIso, nextIso) {
    if (!prevIso) return false;
    try {
      const prev = new Date(prevIso).getTime();
      const next = new Date(nextIso).getTime();
      return (next - prev) >= (12 * 60 * 60 * 1000); // 12 hours
    } catch { return false; }
  }

  function subtleMeta(html) {
    return `<div class="msg-time small">${html}</div>`;
  }
  function renderBreakHeader(tsIso) {
    const label = fmtBreak(tsIso);
    return `<div class="msg-break text-center"><span>— ${escapeHtml(label)} —</span></div>`;
  }

  function renderMessageHtml(m) {
    const mine = m.sender_id === user.id;
    const whoName = mine ? "You" : (nameMap[m.sender_id] || (m.sender_id ? m.sender_id.slice(0,6) : "User"));
    const align = mine ? "start" : "end"; // mine LEFT, others RIGHT
    const bubbleCls = mine ? "bg-primary text-white" : "bg-white border";
    const text = m.is_deleted ? "<em>deleted</em>" : escapeHtml(m.body || "");
    const time = fmtTime(m.created_at);
    const nameLink = `<a href="${profileHref(m.sender_id)}" class="text-decoration-none" onclick="return openProfile('${m.sender_id}')">${escapeHtml(whoName)}</a>`;

    let timeRow = `<div class="d-flex justify-content-${align}">${subtleMeta(escapeHtml(time))}</div>`;

    if (TIMESTAMP_PLACEMENT === 'between') {
      return `
        <div class="msg" data-id="${m.id}">
          <div class="d-flex justify-content-${align}">
            <div class="msg-name">${nameLink}</div>
          </div>
          ${timeRow}
          <div class="d-flex justify-content-${align}">
            <div class="bubble ${bubbleCls}"><div class="small" style="line-height:1.2">${text}</div></div>
          </div>
        </div>`;
    } else {
      return `
        <div class="msg" data-id="${m.id}">
          <div class="d-flex justify-content-${align}">
            <div class="msg-name">${nameLink}</div>
          </div>
          <div class="d-flex justify-content-${align}">
            <div class="bubble ${bubbleCls}"><div class="small" style="line-height:1.2">${text}</div></div>
          </div>
          ${timeRow}
        </div>`;
    }
  }

  function appendMessage(m) {
    const box = document.getElementById("messages-box");
    // Avoid dupes
    if (currentMessages.find(x => x.id === m.id)) return;
    // Break header if needed
    const last = currentMessages.length ? currentMessages[currentMessages.length - 1] : null;
    if (last && needsBreak(last.created_at, m.created_at)) {
      box.insertAdjacentHTML("beforeend", renderBreakHeader(m.created_at));
    }
    currentMessages.push(m);
    latestTs = m.created_at;
    box.insertAdjacentHTML("beforeend", renderMessageHtml(m));
    box.scrollTop = box.scrollHeight;
  }

  // Initial
  await loadAll(true);
  await markReadSafe(convId, user.id);

  // --- Composer ---
  const form = document.getElementById("composer");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("composer-input");
    const body = (input.value || "").trim();
    if (!body) return;

    const ins = await supabase.from("user_messages").insert([{
      conversation_id: convId,
      sender_id: user.id,
      body,
      kind: "text",
      metadata: {}
    }]).select("id, sender_id, body, created_at, is_deleted, kind").single();

    if (ins.error) {
      alert("Failed to send.");
      console.error("Send failed", ins.error);
      return;
    }
    input.value = "";
    // Optimistic append; realtime/poll will reconcile if needed
    appendMessage(ins.data);
    await supabase.from("user_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
    await markReadSafe(convId, user.id);
  });

  // --- Realtime subscription (INSERT/UPDATE) ---
  let gotRealtime = false;
  const channel = supabase.channel(`conv-${convId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_messages', filter: `conversation_id=eq.${convId}` },
      (payload) => {
        gotRealtime = true;
        appendMessage(payload.new);
        if (payload.new.sender_id !== user.id) markReadSafe(convId, user.id);
      })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_messages', filter: `conversation_id=eq.${convId}` },
      (payload) => {
        gotRealtime = true;
        const idx = currentMessages.findIndex(x => x.id === payload.new.id);
        if (idx !== -1) {
          currentMessages[idx] = payload.new;
          // re-render last two around the updated one to keep DOM simple
          renderAll();
          const box = document.getElementById("messages-box");
          box.scrollTop = box.scrollHeight;
        }
      })
    .subscribe((status) => console.log("🔌 realtime:", status));

  // --- Polling fallback ---
  let pollTimer = null;
  setTimeout(() => {
    if (!gotRealtime) {
      console.log("ℹ️ Enabling polling fallback for messages…");
      pollTimer = setInterval(fetchSinceLatest, 4000);
    }
  }, 10000);

  async function fetchSinceLatest() {
    let q = supabase
      .from("user_messages")
      .select("id, sender_id, body, created_at, is_deleted, kind")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });

    if (latestTs) q = q.gt("created_at", latestTs);

    const res = await q;
    const rows = res.data || [];
    rows.forEach(appendMessage);
  }

  // Clean up
  window.addEventListener("beforeunload", () => {
    try { if (channel) supabase.removeChannel(channel); } catch(e){}
    if (pollTimer) clearInterval(pollTimer);
  });
}

async function markReadSafe(conversationId, userId) {
  const supabase = window.supabase;
  try {
    const res = await supabase
      .from("user_conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
    if (res.error) {
      const msg = String(res.error.message || "").toLowerCase();
      if (res.error.code === "PGRST204" || msg.includes("last_read_at")) {
        console.warn("ℹ️ last_read_at not present; skipping watermark update.");
        return;
      }
      console.warn("ℹ️ last_read_at update returned error:", res.error);
    }
  } catch (e) {
    console.warn("ℹ️ last_read_at update threw, ignoring:", e);
  }
}

function ensureStyles() {
  if (document.getElementById("conv-msg-style")) return;
  const css = `
    .msg { margin-bottom: .35rem; }
    .msg-name { font-size: .8rem; color: #6c757d; line-height: 1; margin: 2px 0; opacity: .9; max-width: 75%; }
    .bubble { border-radius: .5rem; padding: .5rem .6rem; max-width: 75%; }
    .msg-time { font-size: .72rem; color: #6c757d; line-height: 1; margin: 2px 0; opacity: 0; max-height: 0; overflow: hidden; transition: opacity .15s ease, max-height .15s ease; }
    .msg:hover .msg-time, .msg.show-time .msg-time { opacity: .8; max-height: 1.2rem; }
    .msg-break { font-size: .72rem; color: #6c757d; margin: .4rem 0; }
    .msg-break span { background: rgba(0,0,0,.03); padding: .1rem .5rem; border-radius: .75rem; border: 1px solid rgba(0,0,0,.05); }
  `;
  const style = document.createElement("style");
  style.id = "conv-msg-style";
  style.textContent = css;
  document.head.appendChild(style);
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
