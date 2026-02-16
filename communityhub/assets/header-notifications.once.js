// assets/js/header-notifications.once.js  — HOTFIX STUB (disables old bell)
// This replaces the noisy/polling version to stop DB spam immediately.
console.warn('[notif] HOTFIX: old header-notifications.once.js disabled');

// Remove any existing bell UI injected by the old script
try {
  document.querySelectorAll('.notif-bell, [data-notif-bell]').forEach(n => n.remove());
} catch (e) {
  console.error('[notif] hotfix remove bell failed', e);
}

// Brutal but effective: clear all active intervals/timeouts created so far (dev only)
// This stops any runaway polling loops started by the old script.
try {
  const _setInterval = window.setInterval;
  const _setTimeout = window.setTimeout;

  // Grab current max interval id by creating a dummy interval/timeout
  const maxIvl = _setInterval(()=>{}, 9999);
  const maxTo  = _setTimeout(()=>{}, 9999);
  for (let i = 0; i <= maxIvl; i++) clearInterval(i);
  for (let i = 0; i <= maxTo;  i++) clearTimeout(i);
  clearInterval(maxIvl);
  clearTimeout(maxTo);
  console.warn('[notif] HOTFIX: cleared intervals/timeouts up to', maxIvl, maxTo);
} catch (e) {
  console.error('[notif] hotfix clear intervals failed', e);
}

// Provide a no-op mount for any callers expecting it
export function mountOldHeaderNotifications() {
  console.warn('[notif] HOTFIX: mountOldHeaderNotifications noop');
  return Promise.resolve();
}

// Avoid double-mounts from any other bells
window.__NOTIF_BELL_MOUNTED__ = true;
