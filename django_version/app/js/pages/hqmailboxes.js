/* ---------------------------------------------------------------------------
 * Phase 210: HQ: Position Mailboxes (#/hq/mailboxes).
 * One WODDI mailbox per leadership post (national, state, LGA, ward; coordinator
 * and assistant), matched to WDOS org units in the database. HQ sees who holds
 * each matched post and whether her mailbox is open or still locked behind her
 * activation or Leadership Pack onboarding. Passwords are never shown here:
 * only the seated leader can reveal her own, from her dashboard, and every
 * reveal is recorded.
 * ------------------------------------------------------------------------- */
import { el, clear, debounce } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { hqPositionMailboxes, hqSetMailboxGate } from '../core/db.js';
import { toast, toastError } from '../components/toast.js';
import { renderShell } from '../components/layout.js';
import { roleTitle } from '../core/titles.js';

export async function render(root, _params, ctx) {
  const shell = renderShell(root, { profile: ctx?.profile, modules: ctx?.modules, titleKey: 'mb.hqTitle' });
  await draw(shell.outlet);
  return shell.teardown;
}

const PAGE = 100;
const LEVELS = { 0: 'mb.lvl0', 1: 'mb.lvl1', 2: 'mb.lvl2', 3: 'mb.lvl3' };
const n0 = (v) => Number(v || 0);
const tile = (n, label, tone, sub) => el('div', { class: 'vs-mini__t' + (tone ? ' vs-mini__t--' + tone : '') }, [el('b', { text: String(n ?? 0) }), el('small', { text: label }), sub ? el('small', { class: 'muted', text: sub }) : null]);
const table = (head, rows) => el('div', { class: 'table-wrap' }, [el('table', { class: 'vs-table ca-table hf-table' }, [el('thead', {}, [el('tr', {}, head.map((h) => el('th', { text: h })))]), el('tbody', {}, rows)])]);
const section = (title, body, extra) => el('section', { class: 'vs-card' }, [el('div', { class: 'card__head' }, [el('h3', { text: title }), extra || null]), ...(Array.isArray(body) ? body : [body])]);

async function draw(out) {
  clear(out);
  let M;
  try { M = await hqPositionMailboxes({ limit: PAGE, offset: 0 }); } catch (err) { out.append(el('div', { class: 'vs-card' }, [el('p', { text: err?.message || t('errors.load') })])); return; }
  const T = M.totals || {};

  /* ---- 1. totals + gate rule --------------------------------------------- */
  out.append(section(t('mb.hqTitle'), [
    el('p', { class: 'muted', text: t('mb.hqIntro') }),
    el('div', { class: 'vs-mini' }, [
      tile(T.mailboxes, t('mb.tMailboxes')), tile(T.matched, t('mb.tMatched'), 'green', t('mb.tMatchedSub')), tile(T.unmatched, t('mb.tUnmatched'), T.unmatched ? 'amber' : null),
      tile(T.held, t('mb.tHeld'), 'magenta', t('mb.tHeldSub')), tile(T.open, t('mb.tOpen'), 'green'), tile(T.locked, t('mb.tLocked'), 'amber'),
      tile(T.vacant, t('mb.tVacant'), 'grey'), tile(T.contested, t('mb.tContested'), T.contested ? 'red' : null), tile(T.parked_at_hq, t('mb.tParked'), T.parked_at_hq ? 'red' : null), tile(T.reveals, t('mb.tReveals'))]),
  ]));

  const gateSel = el('select', { class: 'input', style: 'width:auto;' }, [
    el('option', { value: 'activation_or_onboarding', text: t('mb.gate_activation_or_onboarding') }),
    el('option', { value: 'activation_only', text: t('mb.gate_activation_only') })]);
  gateSel.value = T.gate_mode || 'activation_or_onboarding';
  gateSel.addEventListener('change', async () => {
    if (!window.confirm(t('mb.gateConfirm', { mode: gateSel.options[gateSel.selectedIndex].text }))) { gateSel.value = T.gate_mode; return; }
    try { await hqSetMailboxGate(gateSel.value); toast(t('v.saved')); await draw(out); } catch (e) { toastError(e?.message || t('errors.save')); gateSel.value = T.gate_mode; }
  });
  out.append(section(t('mb.gateTitle'), [
    el('p', { class: 'muted', text: t('mb.gateIntro') }),
    el('ul', { class: 'vs-list' }, [el('li', { text: t('mb.gateRule1') }), el('li', { text: t('mb.gateRule2') }), el('li', { text: t('mb.gateRule3') })]),
    el('div', { class: 'row', style: 'gap:10px;align-items:center;flex-wrap:wrap;' }, [el('label', { text: t('mb.gateMode') }), gateSel]),
    el('p', { class: 'muted', style: 'font-size:12px;', text: t('mb.webmailIs', { url: T.webmail_url || '' }) }),
  ]));

  /* ---- 2. parked at HQ: seats that cannot get a mailbox ------------------ */
  const parked = M.parked || [];
  if (parked.length) out.append(section(t('mb.parkedTitle'), [
    el('p', { class: 'vs-warn', text: t('mb.parkedIntro', { n: parked.length }) }),
    table([t('v.name'), t('v.email'), t('hqa.position'), t('v.country')], parked.map((p) => el('tr', {}, [el('td', { text: p.name }), el('td', { text: p.email || '' }), el('td', { text: roleTitle(p.role) || p.role }), el('td', { text: p.country || '—' })]))),
  ], el('span', { class: 'hf-count', text: String(parked.length) })));

  /* ---- 3. by level and by country --------------------------------------- */
  out.append(el('div', { class: 'ca-grid ca-grid--eq' }, [
    section(t('mb.byLevel'), table([t('mb.level'), t('mb.tMailboxes'), t('mb.tMatched'), t('mb.tHeld'), t('mb.tOpen')], (M.by_level || []).map((x) => el('tr', {}, [el('td', { text: t(LEVELS[x.level] || 'mb.lvl0') }), el('td', { text: String(x.mailboxes) }), el('td', { text: String(x.matched) }), el('td', { text: String(x.held) }), el('td', { text: String(x.open) })])))),
    section(t('mb.byCountry'), [el('p', { class: 'muted', text: t('mb.byCountryIntro') }), table([t('v.country'), t('mb.tMailboxes'), t('mb.tMatched'), t('mb.tHeld'), t('mb.tOpen')], (M.by_country || []).map((x) => el('tr', {}, [
      el('td', {}, [el('a', { href: '#', text: x.country, onclick: (e) => { e.preventDefault(); F.country = x.iso; countrySel.value = x.iso; F.offset = 0; drawRows(); rowsCard.scrollIntoView({ behavior: 'smooth' }); } })]),
      el('td', { text: String(x.mailboxes) }), el('td', { text: String(x.matched) }), el('td', { text: String(x.held) }), el('td', { text: String(x.open) })])))]),
  ]));

  /* ---- 4. the register ---------------------------------------------------- */
  const F = { country: '', q: '', level: '', only: '', offset: 0 };
  const search = el('input', { class: 'input', style: 'width:240px;', placeholder: t('mb.search') });
  search.addEventListener('input', debounce(() => { F.q = search.value.trim(); F.offset = 0; drawRows(); }, 300));
  const countrySel = el('select', { class: 'input', style: 'width:auto;' }, [el('option', { value: '', text: t('v.country') }), ...(M.by_country || []).map((c) => el('option', { value: c.iso, text: c.country }))]);
  countrySel.addEventListener('change', () => { F.country = countrySel.value; F.offset = 0; drawRows(); });
  const levelSel = el('select', { class: 'input', style: 'width:auto;' }, [el('option', { value: '', text: t('mb.level') }), ...[0, 1, 2, 3].map((l) => el('option', { value: String(l), text: t(LEVELS[l]) }))]);
  levelSel.addEventListener('change', () => { F.level = levelSel.value; F.offset = 0; drawRows(); });
  const onlySel = el('select', { class: 'input', style: 'width:auto;' }, [el('option', { value: '', text: t('mb.onlyAll') }), ...['held', 'open', 'locked', 'vacant', 'unmatched', 'contested'].map((k) => el('option', { value: k, text: t('mb.only_' + k) }))]);
  onlySel.addEventListener('change', () => { F.only = onlySel.value; F.offset = 0; drawRows(); });
  const body = el('div'); const count = el('span', { class: 'hf-count', text: String(M.total ?? 0) }); const pager = el('div', { class: 'hqa-pager' });
  const rowsCard = section(t('mb.register'), [
    el('p', { class: 'muted', text: t('mb.registerIntro') }),
    el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;margin-bottom:8px;' }, [search, countrySel, levelSel, onlySel, el('button', { class: 'btn btn--quiet', text: t('hqa.exportCsv'), onclick: exportCsv })]),
    body, pager], count);
  out.append(rowsCard);
  renderRows(M);

  /* ---- 5. loading the LGA and ward rows (browser only) -------------------- */
  out.append(section(t('mb.importTitle'), [
    el('p', { class: 'muted', text: t('mb.importIntro') }),
    el('ol', { class: 'vs-list' }, [el('li', { text: t('mb.importStep1') }), el('li', { text: t('mb.importStep2') }), el('li', { text: t('mb.importStep3') }), el('li', { text: t('mb.importStep4') })]),
    el('p', { class: 'muted', style: 'font-size:12px;', text: t('mb.importNote') }),
  ]));

  async function drawRows() {
    clear(body); clear(pager); body.append(el('div', { class: 'state' }, [el('div', { class: 'spinner' })]));
    let R;
    try { R = await hqPositionMailboxes({ country: F.country || null, q: F.q || null, level: F.level === '' ? null : Number(F.level), only: F.only || null, limit: PAGE, offset: F.offset }); }
    catch (e) { clear(body); body.append(el('p', { class: 'muted', text: e?.message || t('errors.load') })); return; }
    renderRows(R);
  }

  function renderRows(R) {
    clear(body); clear(pager);
    count.textContent = String(R.total ?? 0);
    const rows = R.rows || [];
    if (!rows.length) { body.append(el('p', { class: 'muted', text: t('mb.noRows') })); return; }
    body.append(table([t('mb.post'), t('v.email'), t('mb.level'), t('mb.side'), t('mb.place'), t('mb.matchedCol'), t('mb.holder'), t('mb.access')], rows.map((r) => {
      const place = [r.ward, r.lga, r.state, r.country].filter(Boolean).join(', ');
      const holders = r.holders || [];
      const access = !r.matched ? el('span', { class: 'vs-badge vs-badge--grey', text: t('mb.only_unmatched') })
        : !r.holder && !holders.length ? el('span', { class: 'vs-badge vs-badge--grey', text: t('mb.only_vacant') })
          : r.gate_ok ? el('span', { class: 'vs-badge vs-badge--green', text: t('mb.only_open') })
            : el('span', { class: 'vs-badge vs-badge--amber', text: t('mb.only_locked') + (r.gate_reason ? ' · ' + t('mb.r_' + r.gate_reason) : '') });
      return el('tr', { class: r.contested ? 'mb-contested' : null }, [
        el('td', {}, [el('code', { text: r.post_id })]), el('td', { text: r.email }), el('td', { text: t(LEVELS[r.level] || 'mb.lvl0') }),
        el('td', { text: r.side === 'A' ? t('mb.sideA') : t('mb.sideC') }), el('td', { class: 'hf-td-wrap', text: place }),
        el('td', { text: r.matched ? '✓' : '✗' }),
        el('td', { class: 'hf-td-wrap' }, holders.length > 1
          ? [el('span', { class: 'vs-badge vs-badge--red', text: t('mb.contested', { n: holders.length }) }), ...holders.map((h) => el('div', { text: `${h.name || ''} (${h.email || ''})` }))]
          : [el('span', { text: r.holder || '—' }), r.holder_email ? el('div', { class: 'muted', style: 'font-size:12px;', text: r.holder_email }) : null, r.role ? el('div', { class: 'muted', style: 'font-size:12px;', text: roleTitle(r.role) || r.role }) : null]),
        el('td', {}, [access])]);
    })));
    const total = n0(R.total), from = F.offset + 1, to = Math.min(total, F.offset + rows.length);
    pager.append(el('span', { class: 'muted', text: t('hqa.pageOf', { from, to, total }) }),
      el('button', { class: 'btn btn--quiet', text: t('hqa.prev'), disabled: F.offset === 0 || null, onclick: () => { F.offset = Math.max(0, F.offset - PAGE); drawRows(); } }),
      el('button', { class: 'btn btn--quiet', text: t('hqa.next'), disabled: to >= total || null, onclick: () => { F.offset += PAGE; drawRows(); } }));
  }

  async function exportCsv() {
    const H = ['Post', 'Email', 'Level', 'Side', 'Country', 'State/Region', 'LGA/District', 'Ward/Cluster', 'Matched to WDOS unit', 'Holder', 'Holder email', 'Role', 'Access', 'Reason'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const all = []; let off = 0;
    try {
      for (;;) { const R = await hqPositionMailboxes({ country: F.country || null, q: F.q || null, level: F.level === '' ? null : Number(F.level), only: F.only || null, limit: 500, offset: off }); all.push(...(R.rows || [])); off += 500; if (!(R.rows || []).length || off >= n0(R.total)) break; }
    } catch (e) { return toastError(e?.message || t('errors.load')); }
    const lines = [H.join(',')].concat(all.map((r) => [r.post_id, r.email, t(LEVELS[r.level] || 'mb.lvl0'), r.side, r.country, r.state, r.lga, r.ward, r.matched ? 'yes' : 'no', (r.holders || []).length > 1 ? (r.holders || []).map((h) => h.name).join(' / ') : r.holder, r.holder_email, roleTitle(r.role) || r.role || '', !r.matched ? 'unmatched' : !r.holder ? 'vacant' : r.gate_ok ? 'open' : 'locked', r.gate_reason || ''].map(esc).join(',')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = `wdos-position-mailboxes-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }
}
