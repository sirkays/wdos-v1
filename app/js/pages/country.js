/**
 * Phase 174 — MY COUNTRY / structure panel, rebuilt to match the approved
 * reference screen exactly: mini stats, Attention Required beside it (built
 * by the caller), then one compact table — State/Unit · primary leader ·
 * assistant leader · Report · Tasks · Actions — with a responsiveness dot on
 * every leader and drill-down into the level below. The three small bar
 * charts and the long per-row description line from the previous version
 * are gone: the founder read them as empty, unproductive space, and every
 * figure they showed is already on this table or in Attention Required.
 */
import { el, clear } from '../core/dom.js';
import { t, fmtDate } from '../core/i18n.js';
import { countryDashboard } from '../core/db.js';
import { statusBadge } from './reporting.js';
import { drivePhotoFor } from '../core/photos.js';
import { avatarUrl } from '../core/db.js';

export async function renderCountryPanel(out, { profile, ro, unitId = null, hq = false }) {
  const box = el('div');
  out.append(box);
  const crumbs = [];
  await draw(unitId);

  async function draw(unitId) {
    clear(box);
    box.append(el('div', { class: 'state' }, [el('div', { class: 'spinner' })]));
    let d;
    try { d = await countryDashboard(unitId, profile.network); }
    catch (err) { clear(box); box.append(el('div', { class: 'vs-card' }, [el('p', { class: 'muted', text: err?.message || t('errors.load') })])); return; }
    clear(box);
    const u = d.unit || {}; const tot = d.totals || {};

    const bc = el('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;margin-bottom:6px;' });
    for (const [i, c] of crumbs.entries()) bc.append(el('a', { href: '#', text: c.name, onclick: (e) => { e.preventDefault(); crumbs.splice(i); draw(c.id); } }), el('span', { class: 'muted', text: '\u203A' }));
    bc.append(el('b', { text: u.name || '' }));

    const card = el('div', { class: 'vs-card cty-card' }, [
      el('div', { class: 'card__head' }, [el('h3', { text: t('cty.structure2', { unit: u.name || '', n: (d.children || []).length }) }), crumbs.length ? el('a', { href: '#', text: t('cty.openFullStructure'), onclick: (e) => { e.preventDefault(); crumbs.splice(0); draw(null); } }) : null]),
      bc,
      el('div', { class: 'vs-mini vs-mini--tight' }, [
        mini(t('cty.leaders'), tot.leaders), mini(t('cty.active7'), tot.active7, 'green'), mini(t('cty.members'), tot.members),
        mini(t('cty.tasksOpen'), tot.tasks_open), mini(t('cty.tasksOverdue'), tot.tasks_overdue, tot.tasks_overdue ? 'red' : ''), mini(t('cty.issuesOpen'), tot.issues_open, tot.issues_open ? 'amber' : '')]),
    ]);

    const rows = d.children || [];
    const lv = d.by_level || [];
    const primaryRole = lv[0]?.role, assistantRole = lv.find((x) => x.role !== primaryRole && String(x.role).startsWith('assistant_'))?.role;

    if (!rows.length) {
      card.append(el('p', { class: 'muted', text: t('cty.noChildren') }));
    } else {
      const tbl = el('table', { class: 'vs-table cty-table hf-table' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: t('cty.colUnit') }),
          el('th', { text: primaryRole ? t('role.' + primaryRole) : t('cty.colPrimary') }),
          assistantRole ? el('th', { text: t('role.' + assistantRole) }) : null,
          el('th', { text: t('cty.colReport') }), el('th', { text: t('cty.colTasks') }), el('th', { text: t('cty.colActions') })].filter(Boolean))]),
        el('tbody', {}, rows.map((c) => row(c, primaryRole, assistantRole))),
      ]);
      card.append(el('div', { class: 'table-wrap' }, [tbl]));
    }
    card.append(el('p', { class: 'cty-legend' }, [
      el('span', { class: 'cty-legend__i cty-legend__i--active', text: t('cty.resp_active') }),
      el('span', { class: 'cty-legend__i cty-legend__i--quiet', text: t('cty.resp_quiet') }),
      el('span', { class: 'cty-legend__i cty-legend__i--inactive', text: t('cty.resp_inactive') }),
      el('span', { class: 'cty-legend__i cty-legend__i--never', text: t('cty.resp_never') }),
      el('span', { text: t('cty.rowsOpenNote') }),
    ]));
    box.append(card);

    function row(c, pRole, aRole) {
      const leaders = c.leaders || [];
      const primary = pRole ? leaders.find((l) => l.role === pRole) : leaders[0];
      const assistant = aRole ? leaders.find((l) => l.role === aRole) : leaders[1];
      const cell = (l) => l
        ? el('div', { class: 'cty-cell' }, [el('span', { class: `cty-dot cty-dot--${l.resp}`, title: t('cty.resp_' + l.resp) }), el('span', { text: l.name })])
        : el('span', { class: 'cty-vacant', text: t('v.seatVacant') });
      return el('tr', {}, [
        el('td', {}, [c.sub_units > 0 ? el('a', { href: '#', text: c.name, onclick: (e) => { e.preventDefault(); crumbs.push({ id: u.id, name: u.name }); draw(c.unit_id); } }) : el('b', { text: c.name })]),
        el('td', {}, [cell(primary)]),
        aRole ? el('td', {}, [cell(assistant)]) : null,
        el('td', {}, [statusBadge(c.report_status || 'not_started')]),
        el('td', { text: String(c.tasks_open || 0) + (c.tasks_overdue ? ` (${c.tasks_overdue} ${t('cty.overdueShort')})` : '') }),
        el('td', {}, [el('div', { class: 'row', style: 'gap:4px;flex-wrap:wrap;' }, [
          primary || assistant ? el('a', { href: hq ? `#/view-as/${(primary || assistant).id}` : `#/messages?u=${(primary || assistant).id}`, class: 'btn btn--secondary', text: hq ? t('cty.viewKpis') : t('cty.message') }) : null,
          c.sub_units > 0 ? el('button', { class: 'btn btn--quiet', text: t('cty.drill', { n: c.sub_units }), onclick: () => { crumbs.push({ id: u.id, name: u.name }); draw(c.unit_id); } }) : null,
        ])]),
      ].filter(Boolean));
    }
  }

  function mini(label, value, tone = '') {
    return el('div', { class: `vs-mini__t ${tone ? 'vs-mini__t--' + tone : ''}` }, [el('b', { text: String(value ?? 0) }), el('small', { text: label })]);
  }
}
