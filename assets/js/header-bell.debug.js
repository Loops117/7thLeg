// assets/js/header-bell.debug.js
// DIAGNOSTIC VERSION - visually distinct and verbose logs
import { 
  getCurrentUserId,
  fetchUnreadNotifications, 
  markOneRead, 
  markAllRead, 
  labelForNotification,
  destinationForNotification
} from '/communityhub/hub_modules/notifications.api.js';

if (window.__NOTIF_BELL_MOUNTED__) {
  console.debug('🔔 [diag] already mounted — skipping.');
} else {
  window.__NOTIF_BELL_MOUNTED__ = false;
}

const CSS = `
  .notif-bell { position: relative; cursor: pointer; display: inline-flex; align-items: center; gap: .45rem; }
  .notif-bell .label { background: #0ea5e9; color: #0b1220; font-weight: 800; border-radius: 8px; padding: 2px 6px; font-size: 11px; }
  .notif-bell .count { background: #f59e0b; color: #111827; font-weight: 900; border-radius: 9999px; padding: 1px 8px; font-size: 13px; line-height: 18px; border: 2px solid #111827; }
  .notif-menu { position: absolute; right: 0; top: 100%; margin-top: 8px; width: 420px; max-height: 520px; overflow: auto; background: #0b1220; color: #e5e7eb; border: 2px solid #0ea5e9; border-radius: 12px; box-shadow: 0 10px 30px rgba(14,165,233,.35); display: none; z-index: 99999; }
  .notif-item { display: grid; grid-template-columns: 44px 1fr; gap: 12px; padding: 12px 14px; border-bottom: 1px dashed #1f2937; }
  .notif-item:hover { background: #0a1a2e; }
  .notif-avatar { width: 44px; height: 44px; border-radius: 9999px; object-fit: cover; background: #111; border: 2px solid #0ea5e9; }
  .notif-title { font-size: 14px; font-weight: 800; color: #e5e7eb; }
  .notif-snippet { font-size: 13px; color: #cbd5e1; }
  .notif-meta { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #93c5fd; }
  .notif-actions { display: flex; justify-content: space-between; padding: 10px 12px; background:#0a1a2e; position: sticky; bottom: 0; }
  .notif-actions button { background: #0ea5e9; color: #0b1220; border: 0; border-radius: 8px; padding: 8px 12px; font-weight: 800; cursor: pointer; }
  .notif-actions button:hover { background: #22d3ee; }
`;

function injectCSS() {
  if (document.getElementById('notif-bell-css-diag')) return;
  const style = document.createElement('style');
  style.id = 'notif-bell-css-diag';
  style.textContent = CSS;
  document.head.appendChild(style);
}

function bellSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="#0ea5e9" viewBox="0 0 24 24">
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
  const title = el('div', 'notif-title', `${labelForNotification(n)} · <strong>${n.actor_name || 'Someone'}</strong>`);
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
  console.log('🔔 openNotification', n);
  try { await markOneRead(supabase, n.id, userId); } catch (e) { console.error('markOneRead failed', e); }
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
  if (window.__NOTIF_BELL_MOUNTED__) { console.debug('🔔 [diag] already mounted — abort'); return; }
  window.__NOTIF_BELL_MOUNTED__ = true;
  console.log('🔔 [diag] mountHeaderBell start');

  injectCSS();
  if (!supabase) { console.warn('[header-bell] Supabase client is required.'); return; }

  // Remove any older instances
  document.querySelectorAll('.notif-bell').forEach(n => n.remove());

  const container = document.querySelector(containerSelector) || document.body;
  const bell = el('div', 'notif-bell');
  const lbl = el('span', 'label', 'BELL (DIAG)');
  const icon = el('span', 'icon', bellSVG());
  const count = el('span', 'count', '0');
  const menu = el('div', 'notif-menu');
  const footer = el('div', 'notif-actions');
  const clearBtn = el('button', '', 'Mark all read');
  footer.appendChild(clearBtn);

  bell.appendChild(lbl);
  bell.appendChild(icon);
  bell.appendChild(count);
  bell.appendChild(menu);

  if (position === 'prepend') container.prepend(bell);
  else container.appendChild(bell);

  const userId = await getCurrentUserId(supabase);
  console.log('🔔 [diag] userId', userId);
  if (!userId) return;

  async function refresh() {
    let list = [];
    try { list = await fetchUnreadNotifications(supabase, userId, 50); }
    catch (e) { console.error('[header-bell] fetch failed', e); }
    count.textContent = String(list.length);
    console.log('🔔 [diag] render list', list);
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
    try { await markAllRead(supabase, userId); await refresh(); menu.style.display = 'none'; count.textContent = '0'; }
    catch (err) { console.error('markAllRead failed', err); }
  });

  await refresh();
  console.log('🔔 [diag] mounted');
}

window.mountHeaderBell = mountHeaderBell; // allow manual re-mount in console
