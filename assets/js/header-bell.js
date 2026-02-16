// assets/js/header-bell.js (singleton-guarded)
import { 
  getCurrentUserId,
  fetchUnreadNotifications, 
  markOneRead, 
  markAllRead, 
  labelForNotification,
  destinationForNotification
} from '/communityhub/hub_modules/notifications.api.js';

if (window.__NOTIF_BELL_MOUNTED__) {
  console.debug('[header-bell] already mounted — skipping.');
} else {
  window.__NOTIF_BELL_MOUNTED__ = false;
}

const CSS = `
  .notif-bell { position: relative; cursor: pointer; display: inline-flex; align-items: center; gap: .35rem; }
  .notif-bell .count { background: #e11d48; color: #fff; font-weight: 700; border-radius: 9999px; padding: 1px 6px; font-size: 12px; line-height: 18px; }
  .notif-menu { position: absolute; right: 0; top: 100%; margin-top: 8px; width: 360px; max-height: 480px; overflow: auto; background: #111827; color: #e5e7eb; border: 1px solid #374151; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.35); display: none; z-index: 9999; }
  .notif-item { display: grid; grid-template-columns: 40px 1fr; gap: 10px; padding: 10px 12px; border-bottom: 1px solid #1f2937; }
  .notif-item:hover { background: #0b1220; }
  .notif-avatar { width: 40px; height: 40px; border-radius: 9999px; object-fit: cover; background: #111; border: 1px solid #374151; }
  .notif-meta { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #9ca3af; }
  .notif-title { font-size: 14px; font-weight: 600; color: #e5e7eb; }
  .notif-snippet { font-size: 13px; color: #cbd5e1; }
  .notif-actions { display: flex; justify-content: space-between; padding: 8px 10px; }
  .notif-actions button { background: #1f2937; color: #e5e7eb; border: 1px solid #374151; border-radius: 8px; padding: 6px 10px; cursor: pointer; }
  .notif-actions button:hover { background: #111827; }
`;

function injectCSS() {
  if (document.getElementById('notif-bell-css')) return;
  const style = document.createElement('style');
  style.id = 'notif-bell-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

function bellSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" viewBox="0 0 24 24">
    <path d="M14.5 18h-9a1.5 1.5 0 01-1.2-2.4L6 12.5V9a6 6 0 1112 0v3.5l1.7 3.1A1.5 1.5 0 0118.5 18h-4zM12 24a3 3 0 01-3-3h6a3 3 0 01-3 3z"/>
  </svg>`;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function avatar(url, name = '') {
  const img = document.createElement('img');
  img.className = 'notif-avatar';
  img.src = url || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(name || '?');
  img.alt = name || 'User';
  return img;
}

function renderItem(n, onOpen) {
  const wrap = el('div', 'notif-item');
  wrap.dataset.id = n.id;
  const a = avatar(n.actor_avatar_url, n.actor_name);
  const content = el('div');
  const title = el('div', 'notif-title', `${labelForNotification(n)}${n.actor_name ? ' · ' + n.actor_name : ''}`);
  const snippet = el('div', 'notif-snippet', n.snippet || '');
  const meta = el('div', 'notif-meta', new Date(n.created_at).toLocaleString());

  content.appendChild(title);
  content.appendChild(snippet);
  content.appendChild(meta);
  wrap.appendChild(a);
  wrap.appendChild(content);

  wrap.addEventListener('click', onOpen);
  return wrap;
}

async function openNotification(n, supabase, userId, menu, countEl) {
  try {
    await markOneRead(supabase, n.id, userId);
  } catch (e) {
    console.error('[header-bell] markOneRead failed', e);
  }
  const url = destinationForNotification(n);
  if (url && url !== '#') window.location.href = url;
  // Optimistic UI update
  const item = [...menu.querySelectorAll('.notif-item')].find(d => d.dataset?.id === n.id);
  if (item) item.remove();
  const newCount = Math.max(0, (parseInt(countEl.textContent || '0', 10) || 0) - 1);
  countEl.textContent = String(newCount);
  if (newCount === 0) menu.style.display = 'none';
}

export async function mountHeaderBell({ supabase, containerSelector = '#notif-bell-mount', position = 'append' } = {}) {
  if (window.__NOTIF_BELL_MOUNTED__) {
    console.debug('[header-bell] already mounted — aborting second mount.');
    return;
  }
  window.__NOTIF_BELL_MOUNTED__ = true;

  injectCSS();
  if (!supabase) {
    console.warn('[header-bell] Supabase client is required.');
    return;
  }

  // Remove any older bell instances accidentally present
  document.querySelectorAll('.notif-bell').forEach(n => n.remove());

  const container = document.querySelector(containerSelector) || document.body;
  const bell = el('div', 'notif-bell');
  const icon = el('span', 'icon', bellSVG());
  const count = el('span', 'count', '0');
  const menu = el('div', 'notif-menu');
  const footer = el('div', 'notif-actions');
  const clearBtn = el('button', '', 'Mark all read');
  footer.appendChild(clearBtn);

  bell.appendChild(icon);
  bell.appendChild(count);
  bell.appendChild(menu);

  if (position === 'prepend') container.prepend(bell);
  else container.appendChild(bell);

  const userId = await getCurrentUserId(supabase);
  if (!userId) return;

  async function refresh() {
    let list = [];
    try {
      list = await fetchUnreadNotifications(supabase, userId, 50);
    } catch (e) {
      console.error('[header-bell] fetch failed', e);
    }
    count.textContent = String(list.length);
    menu.innerHTML = '';
    for (const n of list) {
      const item = renderItem(n, () => openNotification(n, supabase, userId, menu, count));
      menu.appendChild(item);
    }
    menu.appendChild(footer);
  }

  bell.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (menu.style.display === 'block') {
      menu.style.display = 'none';
    } else {
      await refresh();
      menu.style.display = 'block';
    }
  });
  document.addEventListener('click', () => { menu.style.display = 'none'; });

  clearBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await markAllRead(supabase, userId);
      await refresh();
      menu.style.display = 'none';
      count.textContent = '0';
    } catch (err) {
      console.error('[header-bell] markAllRead failed', err);
    }
  });

  // Initial fetch to show count
  await refresh();
}
