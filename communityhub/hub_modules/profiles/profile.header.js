/**
 * profile.header.js
 * Standalone, compact profile header card (avatar + name + joined + role + badges).
 * Place at: /communityhub/hub_modules/profiles/profile.header.js
 *
 * Usage (in profile.js):
 *   import { initProfileHeader } from './profiles/profile.header.js';
 *   await initProfileHeader({ userId, el: '#profile-header', supabase: window.supabase });
 *
 * Notes:
 * - Single compact card. No overlapping; avatar is large and left-aligned.
 * - Minimal CSS injected with 'ph-' prefix to avoid collisions.
 * - Tries `users` table first, then `profiles` as fallback.
 * - Badges are optional: tries `user_badges` (user_id,label,icon,color). If not found -> "No badges yet".
 */

export async function initProfileHeader(opts) {
  const sb = opts?.supabase || (typeof window !== 'undefined' ? window.supabase : null);
  if (!sb) { console.warn('[profile.header] supabase client not provided'); return; }

  const userId = opts?.userId;
  if (!userId) { console.warn('[profile.header] userId missing'); return; }

  const root = typeof opts?.el === 'string' ? document.querySelector(opts.el) : (opts?.el || null);
  if (!root) { console.warn('[profile.header] container element not found'); return; }

  const size = Number(opts?.avatarSize) || 120;

  ensureHeaderStyles();

  root.innerHTML = `
    <div class="card shadow-sm border-0 ph-card">
      <div class="card-body p-2 p-md-3">
        <div class="d-flex align-items-start gap-3 ph-row">
          <div class="ph-avatar d-none" style="width:${size}px;height:${size}px;"></div>
          <div class="flex-grow-1 min-w-0">
            <h3 class="fw-bold mb-1 ph-name">Loading…</h3>
            <div class="small text-muted ph-meta">
              Joined: <span class="ph-joined">—</span>
              <span class="mx-1">•</span>
              Role: <span class="ph-role">—</span>
            </div>
            <div class="ph-badgesbox border rounded small bg-light-subtle mt-2 p-2">
              <div class="d-flex flex-wrap gap-2 ph-badges"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const dom = {
    avatar: root.querySelector('.ph-avatar'),
    name: root.querySelector('.ph-name'),
    joined: root.querySelector('.ph-joined'),
    role: root.querySelector('.ph-role'),
    badgesWrap: root.querySelector('.ph-badges'),
    badgesBox: root.querySelector('.ph-badgesbox'),
  };

  // Load user
  const user = await fetchUserRecord(sb, userId);
  renderUser(dom, user, size);

  // Load badges (optional)
  const badges = await fetchUserBadges(sb, userId);
  renderBadges(dom, badges);
}

/* -------------------- Data -------------------- */

async function fetchUserRecord(sb, userId) {
  // Try 'users' table
  try {
    const r = await sb.from('users')
      .select('id, full_name, role, avatar_url, created_at, inserted_at')
      .eq('id', userId)
      .maybeSingle();
    if (!r.error && r.data) return normalizeUser(r.data);
  } catch (_) {}

  // Fallback to 'profiles'
  try {
    const r = await sb.from('profiles')
      .select('id, full_name, role, avatar_url, created_at, inserted_at')
      .eq('id', userId)
      .maybeSingle();
    if (!r.error && r.data) return normalizeUser(r.data);
  } catch (_) {}

  return normalizeUser({});
}

function normalizeUser(row) {
  return {
    name: row?.full_name || row?.display_name || 'Unknown User',
    role: row?.role || 'Member',
    joined: row?.created_at || row?.inserted_at || null,
    avatar_url: row?.avatar_url || null
  };
}

async function fetchUserBadges(sb, userId) {
  // Preferred: user_badges table with (user_id, label, icon, color)
  try {
    const r = await sb.from('user_badges')
      .select('label, icon, color')
      .eq('user_id', userId);
    if (!r.error && Array.isArray(r.data)) return r.data.map(n => ({
      label: n.label || 'Badge',
      icon: n.icon || null,
      color: n.color || null
    }));
  } catch (_) {}
  return []; // no badges found
}

/* -------------------- Render -------------------- */

function renderUser(dom, user, size) {
  // Avatar
  const a = dom.avatar;
  a.innerHTML = avatarHtml(user.avatar_url, user.name, size);
  a.classList.remove('d-none');

  // Name / meta
  dom.name.textContent = user.name || 'Unknown User';
  dom.role.textContent = user.role || 'Member';
  dom.joined.textContent = user.joined ? formatDate(user.joined) : '—';
}

function renderBadges(dom, list) {
  const host = dom.badgesWrap;
  host.innerHTML = '';

  if (!list || !list.length) {
    dom.badgesBox.classList.add('bg-light-subtle');
    host.innerHTML = `<span class="text-muted">No badges yet</span>`;
    return;
  }

  dom.badgesBox.classList.remove('bg-light-subtle');
  list.forEach(b => {
    const badge = document.createElement('span');
    badge.className = 'badge rounded-pill d-inline-flex align-items-center ph-badge';
    if (b.color) badge.style.background = b.color;
    badge.title = b.label;
    badge.innerHTML = `${b.icon ? `<span class="me-1">${escapeHtml(b.icon)}</span>` : ''}${escapeHtml(b.label)}`;
    host.appendChild(badge);
  });
}

/* -------------------- Utils -------------------- */

function avatarHtml(url, name, size){
  const safeName = escapeHtml(name || '');
  const initials = (safeName.trim().match(/(\p{L})/gu) || []).slice(0,2).join('').toUpperCase() || 'U';
  const dim = Number(size) || 120;
  if (url) {
    return `<img src="${escapeAttr(url)}" alt="${safeName}" width="${dim}" height="${dim}" class="ph-avatar-img" />`;
  }
  return `<div class="ph-avatar-fallback" style="width:${dim}px;height:${dim}px;"><span>${initials}</span></div>`;
}

function ensureHeaderStyles(){
  if (document.getElementById('ph-style')) return;
  const css = `
    .ph-card .card-body{padding:.5rem .75rem}
    .ph-row{align-items:flex-start}
    .ph-avatar{flex:0 0 auto;border-radius:9999px;overflow:hidden}
    .ph-avatar-img{display:block;width:100%;height:100%;object-fit:cover;border-radius:9999px}
    .ph-avatar-fallback{display:flex;align-items:center;justify-content:center;border-radius:9999px;
      background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;font-weight:700;font-size:28px}
    .ph-name{line-height:1.15;margin:0}
    .ph-meta{line-height:1.2}
    .ph-badgesbox{margin-top:.5rem}
    .ph-badge{background:#e5e7eb;color:#111827;padding:.25rem .5rem;font-weight:600}
    @media (max-width:600px){
      .ph-card .card-body{padding:.5rem}
    }
  `;
  const tag = document.createElement('style');
  tag.id = 'ph-style';
  tag.textContent = css;
  document.head.appendChild(tag);
}

function formatDate(input){
  try { return new Date(input).toLocaleDateString(); } catch { return '—'; }
}

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function escapeAttr(str){ return escapeHtml(str).replace(/"/g, '&quot;'); }
