// communityhub/hub_modules/messages/messages_fab.js
// Adds a floating Messages button with an offcanvas showing recent conversations.
(function () {
  if (document.getElementById("messages-fab")) return;
  const btn = document.createElement("button");
  btn.id = "messages-fab";
  btn.className = "btn btn-primary rounded-circle shadow";
  btn.style.position = "fixed";
  btn.style.right = "18px";
  btn.style.bottom = "18px";
  btn.style.width = "56px";
  btn.style.height = "56px";
  btn.style.zIndex = "1050";
  btn.title = "Messages";
  btn.innerHTML = "💬";
  btn.addEventListener("click", openCanvas);
  document.body.appendChild(btn);

  const canvas = document.createElement("div");
  canvas.id = "messages-offcanvas";
  canvas.className = "offcanvas offcanvas-end";
  canvas.tabIndex = -1;
  canvas.style.width = "360px";
  canvas.innerHTML = `
    <div class="offcanvas-header">
      <h5 class="offcanvas-title">Messages</h5>
      <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
    </div>
    <div class="offcanvas-body p-0">
      <div id="fab-conv-list" class="list-group list-group-flush"></div>
      <div class="p-2 border-top">
        <a href="/communityhub/hub.html?module=messages/messages_inbox" class="btn btn-sm btn-outline-secondary w-100" onclick="return openInbox()">Open Inbox</a>
      </div>
    </div>`;
  document.body.appendChild(canvas);

  if (!window.openInbox) {
    window.openInbox = function() {
      try {
        if (typeof window.loadModule === "function") { loadModule("messages/messages_inbox"); return false; }
      } catch (e) {}
      return true;
    };
  }

  async function openCanvas() {
    await refreshRecent();
    const oc = bootstrap.Offcanvas.getOrCreateInstance(canvas);
    oc.show();
  }

  async function refreshRecent() {
    if (!window.supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: parts } = await supabase
      .from("user_conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    const convIds = (parts || []).map(p => p.conversation_id);
    if (!convIds.length) {
      document.getElementById("fab-conv-list").innerHTML = `<div class="list-group-item text-muted">No conversations yet</div>`;
      return;
    }

    const { data: convs } = await supabase
      .from("user_conversations")
      .select("id, title, updated_at")
      .in("id", convIds)
      .order("updated_at", { ascending: false })
      .limit(15);

    const list = document.getElementById("fab-conv-list");
    list.innerHTML = (convs || []).map(c => {
      const href = `/communityhub/hub.html?module=messages/conversation&id=${c.id}`;
      return `<a href="${href}" class="list-group-item list-group-item-action" onclick="return openConversation('${c.id}')">
        <div class="fw-semibold">${c.title || "Conversation"}</div>
        <div class="small text-muted">${new Date(c.updated_at).toLocaleString()}</div>
      </a>`;
    }).join("") || `<div class="list-group-item text-muted">No conversations yet</div>`;
  }
})();