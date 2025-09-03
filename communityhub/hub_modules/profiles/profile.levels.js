/**
 * profile.levels.js — Levels header + lazy metrics for profile page (read-only)
 * Place at: /communityhub/hub_modules/profiles/profile.levels.js
 *
 * Usage:
 *   import { initLevelsProfile } from './profiles/profile.levels.js';
 *   initLevelsProfile({ userId, el: '#profile-levels', supabase, preferView: false, metrics: {} });
 *
 * Notes:
 * - Upvotes are counted as RECEIVED by the profile user (recipient_user_id = userId).
 * - Totals default to contributions tables to avoid 404s on missing views/tables.
 */

export async function initLevelsProfile(opts) {
  const sb = (opts && opts.supabase) || (typeof window !== 'undefined' ? window.supabase : null);
  if (!sb) { console.warn('[levels] supabase client not provided'); return; }

  const userId = opts && opts.userId;
  if (!userId) { console.warn('[levels] userId missing'); return; }

  const el = typeof opts?.el === 'string' ? document.querySelector(opts.el) : (opts && opts.el ? opts.el : null);
  if (!el) { console.warn('[levels] container element not found'); return; }

  ensureStyles();

  // Shell
  el.classList.add('lvl-wrap');
  el.innerHTML = `
    <div class="lvl-header" aria-expanded="false">
      <div class="lvl-left">
        <div class="lvl-badge" title="User Level"><span class="lvl-badge-text">—</span></div>
      </div>
      <div class="lvl-body">
        <div class="lvl-bar"><div class="lvl-bar-fill" style="width:0%"></div></div>
        <div class="lvl-bar-text"><span class="lvl-points">—</span></div>
      </div>
      <button class="lvl-caret" aria-label="Toggle details" aria-expanded="false">▾</button>
    </div>
    <div class="lvl-accordion" hidden>
      <div class="lvl-cards"></div>
      <p class="lvl-note">Stats load on demand. Upvotes shown are <strong>received</strong>.</p>
    </div>
  `;

  const state = {
    loadedDetails: false,
    metricsOverride: (opts && opts.metrics) || {},
    preferView: !!(opts && opts.preferView),
    levelsRef: [],
    totalPoints: 0,
    levelNow: 1,
    levelNext: null,
    progressPct: 0
  };

  await loadHeaderData(sb, userId, state);
  renderHeader(el, state);

  const caretBtn = el.querySelector('.lvl-caret');
  const header   = el.querySelector('.lvl-header');
  const acc      = el.querySelector('.lvl-accordion');

  const toggle = async () => {
    const willOpen = acc.hasAttribute('hidden');
    if (willOpen) {
      acc.removeAttribute('hidden');
      header.setAttribute('aria-expanded', 'true');
      caretBtn.setAttribute('aria-expanded', 'true');
      caretBtn.classList.add('open');
      if (!state.loadedDetails) {
        const metrics = await loadDetailMetrics(sb, userId, state.metricsOverride);
        renderCards(el, metrics);
        state.loadedDetails = true;
      }
    } else {
      acc.setAttribute('hidden', '');
      header.setAttribute('aria-expanded', 'false');
      caretBtn.setAttribute('aria-expanded', 'false');
      caretBtn.classList.remove('open');
    }
  };

  caretBtn.addEventListener('click', toggle);
  header.addEventListener('click', (e) => {
    if (e.target.closest('.lvl-caret')) return;
    toggle();
  });
}

/* ----------------------- Header Data ----------------------- */

async function loadHeaderData(sb, userId, state) {
  // Levels reference
  try {
    const { data: refLevels } = await sb
      .from('ref_levels')
      .select('level, level_xp_total')
      .order('level_xp_total', { ascending: true });
    state.levelsRef = Array.isArray(refLevels) ? refLevels : [];
  } catch (e) {
    console.warn('[levels] ref_levels error', e);
    state.levelsRef = [];
  }

  // Total points: prefer view if explicitly enabled; else sum contributions (recipient = this user)
  let totalPoints = 0;

  if (state.preferView) {
    try {
      const vt = await sb.from('user_total_points')
        .select('total_points')
        .eq('user_id', userId)
        .maybeSingle();
      if (!vt.error && vt.data) totalPoints = vt.data.total_points || 0;
    } catch (e) {
      // ignore
    }
  }

  if (!totalPoints) {
    try {
      const { data, error } = await sb
        .from('points_user_contributions')
        .select('base_points')
        .eq('recipient_user_id', userId)
        .eq('approved', true);
      if (!error && Array.isArray(data)) {
        totalPoints = data.reduce((s, r) => s + (r?.base_points || 0), 0);
      }
    } catch (e) {
      // ignore
    }
  }

  state.totalPoints = totalPoints;

  const comp = computeLevel(totalPoints, state.levelsRef);
  state.levelNow = comp.level;
  state.levelNext = comp.next;
  state.progressPct = comp.progressPct;
}

function computeLevel(totalPoints, levelsRef) {
  if (!levelsRef || !levelsRef.length) return { level: 1, next: null, progressPct: 0 };
  let current = levelsRef[0];
  for (const row of levelsRef) {
    if (row.level_xp_total <= totalPoints) current = row; else break;
  }
  const idx = levelsRef.findIndex(r => r.level === current.level);
  const next = (idx >= 0 && idx + 1 < levelsRef.length) ? levelsRef[idx + 1] : null;

  let progressPct = 1;
  if (next) {
    const span = Math.max(1, (next.level_xp_total - current.level_xp_total));
    const earned = Math.max(0, (totalPoints - current.level_xp_total));
    progressPct = Math.max(0, Math.min(1, earned / span));
  }
  return { level: current.level, next, progressPct };
}

/* ----------------------- Lazy Metrics ----------------------- */

async function loadDetailMetrics(sb, userId, overrides) {
  const prov = {
    totalSpecies: async () => {
      try {
        const r = await sb.from('user_inventories').select('id').eq('user_id', userId);
        return Array.isArray(r.data) ? r.data.length : 0;
      } catch (e) { return 0; }
    },
    uniqueSpecies: async () => {
      try {
        let r = await sb.from('user_inventories').select('species_registry_id').eq('user_id', userId);
        if (Array.isArray(r.data) && r.data.length) {
          const set = new Set(r.data.map(x => x.species_registry_id || null).filter(v => v !== null));
          if (set.size > 0) return set.size;
        }
        const alt = await sb.from('user_inventories').select('species, common_name').eq('user_id', userId);
        if (Array.isArray(alt.data)) {
          const set2 = new Set(alt.data.map(x => (x.species || x.common_name || '').trim()).filter(Boolean));
          return set2.size;
        }
      } catch (e) {}
      return 0;
    },
    userRating: async () => null,
    questionsAnswered: async () => {
      try {
        const r = await sb.from('points_user_answers').select('id').eq('user_id', userId);
        return Array.isArray(r.data) ? r.data.length : 0;
      } catch (e) { return 0; }
    },
    totalAuctions: async () => {
      try {
        const r = await sb.from('points_user_contributions')
          .select('id, response_type, action_type, actor_user_id')
          .eq('actor_user_id', userId)
          .eq('approved', true);
        if (Array.isArray(r.data)) {
          return r.data.filter(x => {
            const a = String(x.action_type || '').toLowerCase();
            const rt = String(x.response_type || '').toLowerCase();
            return rt.includes('auction') || a.includes('auction');
          }).length;
        }
      } catch (e) {}
      return 0;
    },
    totalTrades: async () => {
      try {
        const r = await sb.from('points_user_contributions')
          .select('id, response_type, action_type, actor_user_id')
          .eq('actor_user_id', userId)
          .eq('approved', true);
        if (Array.isArray(r.data)) {
          return r.data.filter(x => {
            const a = String(x.action_type || '').toLowerCase();
            const rt = String(x.response_type || '').toLowerCase();
            return rt.includes('trade') || a.includes('trade');
          }).length;
        }
      } catch (e) {}
      return 0;
    },
    upvotedBulletins: async () => {
      const list = await fetchRecipientContribs(sb, userId);
      return list.filter(x => {
        const a = String(x.action_type || '').toLowerCase();
        const rt = String(x.response_type || '').toLowerCase();
        return (a.includes('upvote') || a.includes('upvoted')) && (rt.includes('bulletin') || a.includes('bulletin'));
      }).length;
    },
    upvotedIdRequests: async () => {
      const list = await fetchRecipientContribs(sb, userId);
      return list.filter(x => {
        const a = String(x.action_type || '').toLowerCase();
        const rt = String(x.response_type || '').toLowerCase();
        return (a.includes('upvote') || a.includes('upvoted')) && (
          rt.includes('id_request') || a.includes('id_request') || a.includes('id-req') || a.includes('idreq')
        );
      }).length;
    },
    upvotedHelpRequests: async () => {
      const list = await fetchRecipientContribs(sb, userId);
      return list.filter(x => {
        const a = String(x.action_type || '').toLowerCase();
        const rt = String(x.response_type || '').toLowerCase();
        return (a.includes('upvote') || a.includes('upvoted')) && (
          rt.includes('help_request') || a.includes('help_request') || a.includes('help-req') || a.includes('helpreq')
        );
      }).length;
    },
    userReviewsGiven: async () => 0,
    storeReviewsGiven: async () => 0,
    userReviewsReceived: async () => 0
  };

  const providers = { ...prov, ...(overrides || {}) };

  const keys = Object.keys(providers);
  const results = await Promise.all(keys.map(async (k) => {
    try { return [k, await providers[k](sb, userId)]; }
    catch (e) { console.warn('[levels] metric failed', k, e); return [k, null]; }
  }));

  return Object.fromEntries(results);
}

let _contribCache = new Map();
async function fetchRecipientContribs(sb, userId) {
  const key = `recip:${userId}`;
  if (_contribCache.has(key)) return _contribCache.get(key);
  try {
    const r = await sb.from('points_user_contributions')
      .select('id, action_type, response_type, recipient_user_id, approved')
      .eq('recipient_user_id', userId)
      .eq('approved', true);
    const list = Array.isArray(r.data) ? r.data : [];
    _contribCache.set(key, list);
    return list;
  } catch (e) {
    console.warn('[levels] contributions fetch failed', e);
    _contribCache.set(key, []);
    return [];
  }
}

/* ----------------------- Render ----------------------- */

function renderHeader(root, state) {
  const lvlText = root.querySelector('.lvl-badge-text');
  const fill    = root.querySelector('.lvl-bar-fill');
  const txt     = root.querySelector('.lvl-points');

  lvlText.textContent = `L${state.levelNow}`;
  const pct = Math.round(state.progressPct * 100);
  fill.style.width = `${pct}%`;

  if (state.levelNext) {
    txt.textContent = `${formatNumber(state.totalPoints)} / ${formatNumber(state.levelNext.level_xp_total)} to L${state.levelNext.level}`;
  } else {
    txt.textContent = `${formatNumber(state.totalPoints)} • MAX LEVEL`;
    fill.style.width = '100%';
  }
}

function renderCards(root, metrics) {
  const host = root.querySelector('.lvl-cards');
  const grid = document.createElement('div');
  grid.className = 'lvl-grid';

  const defs = [
    ['Total Species by User', metrics.totalSpecies],
    ['Unique Species', metrics.uniqueSpecies],
    ['User Rating', metrics.userRating],
    ['Questions Answered', metrics.questionsAnswered],
    ['Total Auctions', metrics.totalAuctions],
    ['Total Trades', metrics.totalTrades],
    ['Upvoted ID Requests (received)', metrics.upvotedIdRequests],
    ['Upvoted Help Requests (received)', metrics.upvotedHelpRequests],
    ['Upvoted Bulletins (received)', metrics.upvotedBulletins],
    ['User Reviews Given', metrics.userReviewsGiven],
    ['Store Reviews Given', metrics.storeReviewsGiven],
    ['User Reviews Received', metrics.userReviewsReceived]
  ];

  defs.forEach(([label, value]) => {
    const card = document.createElement('div');
    card.className = 'lvl-card';
    card.innerHTML = `
      <div class="lvl-card-label">${escapeHtml(label)}</div>
      <div class="lvl-card-value">${value == null ? '—' : escapeHtml(String(value))}</div>
    `;
    grid.appendChild(card);
  });

  host.innerHTML = '';
  host.appendChild(grid);
}

/* ----------------------- Styles ----------------------- */

function ensureStyles() {
  if (document.getElementById('lvl-style')) return;
  const css = `
    .lvl-wrap{border:1px solid #e5e7eb;border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.05);overflow:hidden}
    .lvl-header{display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;cursor:pointer}
    .lvl-left{display:flex;align-items:center}
    .lvl-badge{width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#a78bfa,#60a5fa);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;box-shadow:inset 0 0 0 2px rgba(255,255,255,.35)}
    .lvl-badge-text{font-size:14px}
    .lvl-body{flex:1;min-width:0}
    .lvl-bar{height:10px;border-radius:999px;background:#f3f4f6;overflow:hidden;position:relative}
    .lvl-bar-fill{height:100%;background:linear-gradient(90deg,#60a5fa,#34d399);transition:width .35s ease}
    .lvl-bar-text{margin-top:.4rem;font-size:.9rem;color:#374151}
    .lvl-caret{border:1px solid #e5e7eb;background:#f9fafb;border-radius:8px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .2s}
    .lvl-caret.open{transform:rotate(180deg)}
    .lvl-accordion{padding:.5rem 1rem 1rem}
    .lvl-note{margin:.5rem 0 0;color:#6b7280;font-size:.85rem}
    .lvl-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem}
    .lvl-card{border:1px solid #e5e7eb;border-radius:10px;padding:.6rem .75rem;background:#fff}
    .lvl-card-label{font-size:.85rem;color:#6b7280}
    .lvl-card-value{font-size:1.1rem;font-weight:700;color:#111827;margin-top:.15rem}
    @media (max-width: 900px){ .lvl-grid{grid-template-columns:repeat(2,minmax(0,1fr))} }
    @media (max-width: 600px){ .lvl-grid{grid-template-columns:1fr} .lvl-header{align-items:flex-start} }
  `;
  const tag = document.createElement('style');
  tag.id = 'lvl-style';
  tag.textContent = css;
  document.head.appendChild(tag);
}

/* ----------------------- Utils ----------------------- */

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, s => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[s]));
}

function formatNumber(n) {
  try { return new Intl.NumberFormat().format(n); } catch { return String(n); }
}
