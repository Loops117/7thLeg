/**
 * species.mobile.js (updated)
 * - Forces Actions column to be first (header + body)
 * - Converts per-row "View / Edit / Delete" buttons into a 3‑dot menu on phones
 * - Desktop behavior unchanged
 *
 * Targets:
 *   Table: #species-table or .species-table
 *   Actions cell: <td class="actions"> (recommended) or last <td> fallback
 *   Buttons: <a class="btn ..."> or <button class="btn ..."> inside actions cell
 */
(function () {
  const mq = window.matchMedia('(max-width: 576px)');
  let enhanced = false;

  function q(sel, root = document) { return root.querySelector(sel); }
  function qa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function getTable() {
    return q('#species-table') || q('table.species-table');
  }

  function ensureActionsFirst() {
    const table = getTable();
    if (!table) return;
    // Move header "Actions" to first
    const thead = table.tHead;
    if (thead && thead.rows[0]) {
      const hr = thead.rows[0];
      let th = hr.querySelector('th.actions');
      if (!th) {
        th = qa('th', hr).find(th => /actions/i.test((th.textContent||'').trim()));
      }
      if (th && hr.cells[0] !== th) {
        hr.insertBefore(th, hr.cells[0]);
      }
    }
    // Move each row's actions cell to first
    qa('tbody tr', table).forEach(tr => {
      let td = tr.querySelector('td.actions');
      if (!td) {
        const cells = tr.cells;
        if (!cells || cells.length === 0) return;
        td = cells[cells.length - 1];
      }
      if (td && tr.cells[0] !== td) {
        tr.insertBefore(td, tr.cells[0]);
      }
    });
  }

  function findActionsCell(tr) {
    let cell = tr.querySelector('td.actions');
    if (!cell) {
      const tds = tr.querySelectorAll('td');
      cell = tds[tds.length - 1] || null;
    }
    return cell;
  }

  function extractButtons(cell) {
    const btns = qa('a.btn, button.btn', cell);
    return btns.filter(b => b.offsetParent !== null);
  }

  function makeMenuForCell(cell, buttons) {
    let toggle = cell.querySelector('.spm-toggle');
    let menu = cell.querySelector('.spm-menu');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'spm-toggle';
      toggle.setAttribute('aria-haspopup', 'true');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = '\u22EE'; // vertical ellipsis
      cell.prepend(toggle);
    }
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'spm-menu';
      cell.appendChild(menu);
    }
    menu.innerHTML = '';

    buttons.forEach((btn) => {
      const label = (btn.textContent || btn.getAttribute('aria-label') || 'Action').trim();
      const href = btn.tagName === 'A' ? btn.getAttribute('href') : null;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'spm-item';
      item.textContent = label;

      if (href) {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = href;
        });
      } else {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          btn.click();
        });
      }
      menu.appendChild(item);
    });

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle('spm-open');
      toggle.setAttribute('aria-expanded', String(open));
      qa('.spm-menu.spm-open', getTable()).forEach(m => { if (m !== menu) m.classList.remove('spm-open'); });
    });

    document.addEventListener('click', (e) => {
      if (!menu.classList.contains('spm-open')) return;
      if (e.target === menu || e.target === toggle || menu.contains(e.target)) return;
      menu.classList.remove('spm-open');
      toggle.setAttribute('aria-expanded', 'false');
    }, { passive: true });
  }

  function enhanceTable() {
    const table = getTable();
    if (!table) return;
    ensureActionsFirst();
    qa('tbody tr', table).forEach(tr => {
      const cell = findActionsCell(tr);
      if (!cell) return;
      const btns = extractButtons(cell);
      if (!btns.length) return;
      makeMenuForCell(cell, btns);
    });
    enhanced = true;
  }

  function resetTable() {
    const table = getTable();
    if (!table) return;
    qa('.spm-menu', table).forEach(m => m.remove());
    qa('.spm-toggle', table).forEach(t => t.remove());
    enhanced = false;
  }

  function onChange() {
    if (mq.matches) {
      if (!enhanced) enhanceTable();
    } else {
      if (enhanced) resetTable();
      ensureActionsFirst(); // keep Actions first even on desktop
    }
  }

  const observer = new MutationObserver(() => {
    const table = getTable();
    if (!table) return;
    ensureActionsFirst();
    if (mq.matches) enhanceTable();
  });

  document.addEventListener('DOMContentLoaded', () => {
    const table = getTable();
    if (table) {
      const tb = table.tBodies[0] || table;
      observer.observe(tb, { childList: true, subtree: true });
    }
    onChange();
  });

  mq.addEventListener('change', onChange);
})();