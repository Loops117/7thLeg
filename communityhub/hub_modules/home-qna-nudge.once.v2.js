
// home-qna-nudge.once.v2.js (desktop width fix: mount inside module area)
(function () {
  const supabase = window.supabase;
  console.info('[QNA] nudge: boot', { hasSupabase: !!supabase });

  if (!supabase) return;

  const KEY_SNOOZE = 'qna_decline_until';
  const NUDGE_ID = 'qna-nudge-banner';

  function getTarget() {
    // Prefer module container so width matches content column on desktop
    const el =
      document.querySelector('#home-root') ||
      document.querySelector('#home-feed') ||
      document.querySelector('[data-role="home-feed"]') ||
      document.querySelector('main .container, .hub-content, .module-content') ||
      document.body;
    console.info('[QNA] nudge: target', el && el.id ? '#' + el.id : el);
    return el;
  }

  function createBanner() {
    const bar = document.createElement('div');
    bar.id = NUDGE_ID;
    // Stacked layout: text above buttons (mobile-first)
    bar.style.cssText = [
      'position:sticky',
      'top:0',
      'z-index:100',
      'background:#fff',
      'border:1px solid #e2e8f0',
      'border-radius:12px',
      'padding:.9rem 1rem',
      'display:flex',
      'flex-direction:column',
      'align-items:stretch',
      'gap:.75rem',
      'box-shadow:0 1px 6px rgba(0,0,0,.04)',
      'margin-bottom:.5rem'
    ].join(';');

    bar.innerHTML = `
    <!-- absolute close button (no layout shift) -->
    <button type="button" id="qna-close" aria-label="Close"
      style="
        position:absolute; top:8px; right:10px;
        width:36px; height:36px; display:inline-flex; align-items:center; justify-content:center;
        border:none; background:transparent; font-size:18px; line-height:1; cursor:pointer;
      ">✕</button>

    <div style="flex:1 1 auto; padding-right:2.25rem">
      <strong>Quick help?</strong>
      <div style="font-size:.9rem;color:#475569">
        We’re asking members to tell us about species they keep.
        Do you mind answering a few questions for contribution points?
      </div>
    </div>

    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.25rem">
      <button type="button" id="qna-accept" class="btn btn-sm btn-primary">Accept</button>
      <button type="button" id="qna-decline" class="btn btn-sm btn-outline-secondary">Decline</button>
    </div>
  `;
    return bar;
  }



  function snoozed() {
    try {
      const ts = localStorage.getItem(KEY_SNOOZE);
      return !!ts && Date.now() < parseInt(ts, 10);
    } catch { return false; }
  }

  async function hasInventory(userId) {
    const { error, count } = await supabase
      .from('user_inventories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) { console.warn('[QNA] nudge: inventory count error', error); return false; }
    return (count || 0) > 0;
  }

  async function canShow() {
    const snooze = snoozed();
    if (snooze) { console.info('[QNA] nudge: blocked (snoozed)'); return false; }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { console.info('[QNA] nudge: blocked (no user)'); return false; }
      const ageDays = (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24);
      const inv = await hasInventory(user.id);
      console.info('[QNA] nudge: checks', { ageDays: +ageDays.toFixed(2), hasInventory: inv });
      if (ageDays < 7) return false;
      if (!inv) return false;
      return true;
    } catch (e) {
      console.warn('[QNA] nudge: canShow error', e);
      return false;
    }
  }

  function mount() {
    if (document.getElementById(NUDGE_ID)) return;
    const target = getTarget();
    const banner = createBanner();
    // Place at top of module column
    target.prepend(banner);
    console.info('[QNA] nudge: mounted into', target && target.id ? '#' + target.id : target);

    const accept = banner.querySelector('#qna-accept');
    const decline = banner.querySelector('#qna-decline');
    const close = banner.querySelector('#qna-close');

    function hide() {
      banner.remove();
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) supabase.from('points_nudges').insert({ user_id: user.id, nudge_type: 'species_qna', action: 'dismiss' });
      });
      console.info('[QNA] nudge: dismissed');
    }

    accept.addEventListener('click', async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) supabase.from('points_nudges').insert({ user_id: user.id, nudge_type: 'species_qna', action: 'accept' });
      } catch { }
      window.location.href = '/communityhub/hub.html?module=questionnaire';
    });

    decline.addEventListener('click', async () => {
      const until = Date.now() + 24 * 60 * 60 * 1000;
      localStorage.setItem(KEY_SNOOZE, String(until));
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) supabase.from('points_nudges').insert({ user_id: user.id, nudge_type: 'species_qna', action: 'decline' });
      } catch { }
      hide();
    });

    close.addEventListener('click', hide);

    let hiddenForScroll = false;
    window.addEventListener('scroll', () => {
      const atTop = window.scrollY < 40;
      if (!atTop && !hiddenForScroll) { banner.style.display = 'none'; hiddenForScroll = true; }
      else if (atTop && hiddenForScroll) { banner.style.display = 'flex'; hiddenForScroll = false; }
    });
  }

  async function init() {
    console.info('[QNA] nudge: init');
    if (await canShow()) {
      mount();
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) supabase.from('points_nudges').insert({ user_id: user.id, nudge_type: 'species_qna', action: 'shown' });
      } catch { }
    } else {
      console.info('[QNA] nudge: not shown (guardrail or no inventory)');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
