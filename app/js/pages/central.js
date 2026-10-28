/**
 * Phase 155 — WDOS CENTRAL ADMIN · WODDI HQ COMMAND CENTRE (#/ for HQ)
 *
 * The founder's specification: the first screen answers "what is happening,
 * what is wrong, what requires my decision, what must happen next". Every
 * figure comes from central_admin(), the same rules as the module pages.
 * Panels: overview tiles · immediate attention · recruitment funnel · Africa
 * coverage map · leadership ladder · country performance · approvals centre ·
 * reporting & accountability · role-based access. Brand colours only.
 */
import { el, clear } from '../core/dom.js';
import { t, fmtNumber } from '../core/i18n.js';
import { db } from '../core/db.js';
import { renderShell } from '../components/layout.js';
import { icon } from '../components/icons.js';

const centralAdmin = async (net) => {
  const { cachedRpc } = await import('../core/db.js');
  return cachedRpc(`central:${net || 'all'}`, async () => {
    const { data, error } = await db().rpc('central_admin_cached', { p_net: net || 'all' });
    if (error) throw error;
    return data;
  });
};

export async function render(root, params, ctx) {
  const shell = renderShell(root, { profile: ctx.profile, modules: ctx.modules, titleKey: 'nav.commandCentre' });
  const out = shell.outlet;
  clear(out);
  const net = params?.net || sessionStorage.getItem('wdos.central.net') || 'all';
  const head = el('div', { class: 'ca-head' }, [
    el('div', {}, [el('h2', { text: t('ca.title') }), el('div', { class: 'muted', text: t('ca.subtitle') })]),
    el('div', { class: 'ca-nets' }, ['all', 'WGMN', 'WNNN'].map((n) => el('button', {
      class: `reg-lang ${net === n ? 'is-active' : ''}`, text: n === 'all' ? t('ca.allNetworks') : n,
      onclick: () => { sessionStorage.setItem('wdos.central.net', n); render(root, { ...params, net: n }, ctx); } }))),
  ]);
  const body = el('div', { class: 'state' }, [el('div', { class: 'spinner' })]);
  out.append(head, body);
  let d;
  try { d = await centralAdmin(net); }
  catch (err) {
    clear(body); body.className = 'card';
    body.append(el('h3', { text: t('errors.loadTitle') }), el('p', { class: 'muted', text: String(err?.message || err).slice(0, 200) }));
    return shell.teardown;
  }
  clear(body); body.className = '';
  const T = d.tiles || {}, A = d.attention || {}, F = d.funnel || {}, R = d.reporting || {}, P = d.approvals || {};

  // ---- overview tiles
  const tile = (label, value, href, tone = '', sub = '') => el('a', { class: `ca-tile ${tone ? 'ca-tile--' + tone : ''}`, href }, [
    el('b', { text: fmtNumber(Number(value || 0)) }), el('span', { text: label }), sub ? el('small', { class: 'muted', text: sub }) : null]);
  // Phase 222: nine tiles share one row on wide screens (the ninth used to wrap alone)
  body.append(el('div', { class: 'ca-tiles ca-tiles--9' }, [
    tile(t('ca.tCountries'), T.countries_represented, '#/structure', 'magenta'),
    tile(t('ca.tStrengthen'), T.countries_strengthen, '#/command', 'amber'),
    tile(t('ca.tNotRep'), T.countries_not, '#/command', 'grey'),
    // Phase 222: this counts every leader in a seat; "active" (signed in within
    // 30 days) is the smaller figure HOFCO uses, shown underneath.
    tile(t('ca.tLeadersSeated'), T.active_leaders, '#/accounts', 'green', t('ca.tLeadersActive30', { n: fmtNumber(T.leaders_active30 || 0) })),
    tile(t('ca.tVacantCountry'), T.vacant_country, '#/structure?status=vacant&level=country', 'red'),
    tile(t('ca.tVacantState'), T.vacant_state, '#/structure?status=vacant&level=state_region', 'amber'),
    tile(t('ca.tReportsDue'), T.reports_due, '#/reporting/compliance', 'magenta'),
    tile(t('ca.tApprovals'), T.approval_requests, '#/recruitment', 'amber'),
    tile(t('ca.tProgrammes'), T.programmes_running, '#/programmes', 'green'),
  ]));
  const loginsBtn = el('button', { class: 'btn btn--primary', style: 'font-size:12px;', text: t('ca.bulkLogins'), onclick: async () => {
    if (!confirm(t('ca.bulkLoginsConfirm'))) return;
    loginsBtn.disabled = true; loginsBtn.textContent = t('ca.bulkLoginsWorking');
    try {
      const { adminUsers } = await import('../core/db.js');
      const res = await adminUsers('bulk_create_directory', {});
      const done = res?.done || [], failed = res?.failed || [];
      openSheet(done, failed);
      alert(t('ca.bulkLoginsDone', { n: done.length, f: failed.length, tot: res?.total ?? 0 }));
      render(root, params, ctx);
    } catch (e) { alert(e?.message || 'failed'); loginsBtn.disabled = false; loginsBtn.textContent = t('ca.bulkLogins'); }
  } });
  // Phase 180: the one-step button only reaches leaders WITHOUT a login. Seated
  // leaders already have one, so this issues them a fresh temporary password.
  // Phase 181: strictly the HQ master lists (assets/reset-list.json, red rows excluded) — nobody else.
  const resetBtn = el('button', { class: 'btn btn--quiet', style: 'font-size:12px;', text: t('ca.bulkReset'), onclick: async () => {
    let list = null;
    try { list = await (await fetch('/assets/reset-list.json', { cache: 'no-store' })).json(); } catch { list = null; }
    const people = list?.people || [];
    if (!people.length) { alert('reset-list.json missing'); return; }
    if (!confirm(t('ca.bulkResetPrompt', { n: people.length }))) return;
    resetBtn.disabled = true; resetBtn.textContent = t('ca.bulkLoginsWorking');
    try {
      const { adminUsers } = await import('../core/db.js');
      const res = await adminUsers('bulk_reset_list', { people });
      const done = res?.done || [], failed = res?.failed || [];
      openSheet(done, failed);
      alert(t('ca.bulkResetDone', { n: done.length, f: failed.length, tot: res?.total ?? 0 }));
    } catch (e) { alert(e?.message || 'failed'); }
    resetBtn.disabled = false; resetBtn.textContent = t('ca.bulkReset');
  } });
  function openSheet(done, failed) {
    const win = window.open('', '_blank');
    const esc = (x) => String(x ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const rank = (r) => /assistant|deputy/i.test(String(r || '')) ? 1 : 0;
    const ng = done.filter((d) => /nigeria/i.test(d.country || '') && /state/i.test(d.role || '')).sort((a, b) => (a.state || '').localeCompare(b.state || '') || rank(a.role) - rank(b.role));
    const af = done.filter((d) => !(/nigeria/i.test(d.country || '') && /state/i.test(d.role || ''))).sort((a, b) => (a.country || '').localeCompare(b.country || '') || rank(a.role) - rank(b.role));
    const table = (rows, key, label) => `<table><thead><tr><th>${esc(label)}</th><th>Name</th><th>Position</th><th>Seat in WDOS</th><th>Email</th><th>Temporary password</th></tr></thead><tbody>` +
      rows.map((d, i) => `<tr${i === 0 || rows[i - 1][key] !== d[key] ? ' class="grp"' : ''}><td>${i === 0 || rows[i - 1][key] !== d[key] ? '<b>' + esc(d[key]) + '</b>' : ''}</td><td>${esc(d.name)}</td><td>${esc(d.role)}</td><td>${esc(d.seat)}</td><td>${esc(d.email)}</td><td class="pw">${esc(d.password)}</td></tr>`).join('') + '</tbody></table>';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>WDOS temporary passwords</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#1b1b1f}h1{color:#D4006A;margin:0 0 4px}h2{font-size:14px;color:#5b5b63;font-weight:normal;margin:0 0 16px}h3{color:#D4006A;margin:22px 0 8px;font-size:16px}table{border-collapse:collapse;width:100%;font-size:12px}th{background:#FBE7F0;color:#D4006A;text-align:left}th,td{border:1px solid #d9d9de;padding:6px 8px;vertical-align:top}tr.grp td{border-top:2px solid #D4006A}.pw{font-family:Consolas,monospace;font-weight:bold}.note{margin-top:16px;font-size:12px;color:#5b5b63}@media print{button{display:none}}</style></head><body>
      <h1>WODDI Digital Operating System</h1><h2>${esc(t('acc.sheetTitle', { n: done.length, d: new Date().toLocaleString() }))}</h2><button onclick="window.print()">${esc(t('acc.sheetPrint'))}</button>
      ${ng.length ? `<h3>${esc(t('acc.sheetNg', { n: ng.length }))}</h3>` + table(ng, 'state', t('vol.state')) : ''}
      ${af.length ? `<h3>${esc(t('acc.sheetAf', { n: af.length }))}</h3>` + table(af, 'country', t('v.country')) : ''}
      ${failed.length ? `<h3>${esc(t('acc.bulkFailed'))}</h3><ul>${failed.map((f) => `<li>${esc(f.name)} (${esc(f.email)}): ${esc(f.why)}</li>`).join('')}</ul>` : ''}
      <p class="note">${esc(t('acc.sheetNote'))}</p></body></html>`;
    if (win) { win.document.write(html); win.document.close(); } else alert(t('acc.sheetBlocked'));
  }
  const seatBtn = el('button', { class: 'btn btn--quiet', style: 'font-size:12px;', text: t('ca.seatLists'), onclick: async () => {
    if (!confirm(t('ca.seatListsConfirm'))) return;
    seatBtn.disabled = true;
    try {
      const { data, error } = await db().rpc('seat_from_lists', {});
      if (error) throw error;
      const miss = (data?.not_seated || []).map((m) => `${m.name} (${m.role}${m.country ? ', ' + m.country : ''})`).join('; ');
      alert(t('ca.seatListsDone', { s: data?.seated ?? 0, a: data?.already_seated ?? 0, h: data?.on_hold_skipped ?? 0, n: data?.not_seated_count ?? 0 }) + (miss ? `\n\n${miss}` : ''));
      render(root, params, ctx);
    } catch (e) { alert(e?.message || 'failed'); seatBtn.disabled = false; }
  } });
  body.append(el('div', { class: 'ca-strip' }, [
    el('b', { text: t('ca.execTitle') }),
    el('span', { class: 'muted', text: t(Number(T.members_other) > 0 && net === 'all' ? 'ca.execSub3' : 'ca.execSub2', { members: fmtNumber(T.members || 0), wgmn: fmtNumber(T.members_wgmn || 0), wnnn: fmtNumber(T.members_wnnn || 0),
      other: fmtNumber(T.members_other || 0), filled: fmtNumber(T.positions_filled || 0), total: fmtNumber(T.positions_total || 0), lower: fmtNumber(T.vacant_lower || 0) }) }),
    loginsBtn, resetBtn, seatBtn,
    el('a', { href: '#/hq/activation', class: 'btn btn--primary', style: 'font-size:12px;', text: t('hqa.threeDayBtn') })]));

  // ---- row 1: attention · funnel · map
  const attn = [
    ['overdueTasks', A.overdue_tasks, '#/tasks', 'red'], ['missingReports', A.missing_reports, '#/reporting/compliance', 'red'],
    ['vacantRoles', A.vacant_roles, '#/structure?status=vacant', 'amber'], ['activationPending', A.activation_pending, '#/hq/activation', 'amber'],
    ['safeguarding', A.safeguarding, '#/cases', 'red'], ['systemAlerts', A.system_alerts, '#/helpdesk', 'grey'],
    ['countriesAttention', A.countries_attention, '#/command', 'amber'], ['escalations', A.escalations, '#/reporting/issues', 'red']];
  const attnCard = el('div', { class: 'card ca-card' }, [
    el('div', { class: 'card__head' }, [el('h3', {}, [icon('shield', 16), el('span', { text: ' ' + t('ca.attention') })]), el('a', { href: '#/reporting/dashboard', class: 'btn btn--quiet', text: t('v.viewAll') })]),
    ...attn.map(([k, v, href, tone]) => el('a', { href, class: 'ca-attn' }, [
      el('b', { class: `ca-attn__n ca-attn__n--${Number(v) ? tone : 'green'}`, text: String(v ?? 0) }), el('span', { class: 'grow', text: t('ca.a_' + k) }), el('span', { class: 'muted', text: '\u203A' })])),
  ]);
  // Recruitment funnel (online applicants) with the Referral funnel beneath it, both live
  const FO = d.funnel_online || {}, FR = d.funnel_referral || {};
  const funnelRows = (stages, keyPrefix) => {
    const maxF = Math.max(1, ...stages.map(([, v]) => Number(v || 0)));
    // Phase 222: the rows used to be separate grids, so each number sat at a
    // different place, and a stage with 0 still drew a 14% bar.
    return el('div', { class: 'ca-funnel' }, stages.flatMap(([k, v], i) => {
      const n = Number(v || 0);
      return [
        el('div', { class: 'ca-funnel__track' }, [el('div', { class: 'ca-funnel__bar', style: `width:${n ? Math.max(3, Math.round((n / maxF) * 100)) : 0}%;opacity:${1 - i * 0.09};` })]),
        el('b', { class: 'ca-funnel__n', text: fmtNumber(n) }), el('span', { class: 'ca-funnel__label', text: t(keyPrefix + k) })];
    }));
  };
  const asOf = d.generated_at ? new Date(d.generated_at) : null;
  const refreshedAt = el('small', { class: 'muted', text: t('ca.refreshed', { at: asOf && !Number.isNaN(asOf.getTime()) ? asOf.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '\u2014' }) });
  const funnelCard = el('div', { class: 'card ca-card' }, [
    el('div', { class: 'card__head' }, [el('h3', {}, [icon('userplus', 16), el('span', { text: ' ' + t('ca.funnel') })]), el('a', { href: '#/recruitment', class: 'btn btn--quiet', text: t('v.viewAll') })]),
    el('p', { class: 'muted', style: 'margin:0 0 4px;', text: t('ca.funnelOnlineHint') }),
    funnelRows([['received', FO.received], ['activation7', FO.activation], ['review', FO.review], ['appointmentPending', FO.appointment_pending], ['appointed', FO.appointed]], 'ca.fo_'),
    el('div', { class: 'card__head', style: 'margin-top:12px;' }, [el('h3', {}, [icon('userplus', 16), el('span', { text: ' ' + t('ca.funnelReferral') })]), el('a', { href: '#/reflinks', class: 'btn btn--quiet', text: t('v.viewAll') })]),
    el('p', { class: 'muted', style: 'margin:0 0 4px;', text: t('ca.funnelReferralHint') }),
    funnelRows([['referral', FR.referral], ['contacted', FR.contacted], ['activation3', FR.activation], ['review', FR.review], ['appointmentPending', FR.appointment_pending], ['appointed', FR.appointed]], 'ca.fr_'),
    refreshedAt,
  ]);
  const mapCard = el('div', { class: 'card ca-card' }, [
    el('div', { class: 'card__head' }, [el('h3', {}, [icon('sitemap', 16), el('span', { text: ' ' + t('ca.map') })]), el('a', { href: '#/command', class: 'btn btn--quiet', text: t('v.viewAll') })]),
    el('div', { class: 'ca-map' }),
    el('div', { class: 'ca-legend' }, [
      el('span', { class: 'ca-legend__i ca-legend__i--represented', text: t('ca.represented', { n: T.countries_represented || 0 }) }),
      el('span', { class: 'ca-legend__i ca-legend__i--needs_strengthening', text: t('ca.strengthen', { n: T.countries_strengthen || 0 }) }),
      el('span', { class: 'ca-legend__i ca-legend__i--not_represented', text: t('ca.notRep', { n: T.countries_not || 0 }) })]),
    el('p', { class: 'muted', text: t('ca.mapLine', { n: T.countries_represented || 0, tot: T.countries_total || 54, pct: T.countries_total ? Math.round(100 * (T.countries_represented || 0) / T.countries_total) : 0 }) }),
  ]);
  body.append(el('div', { class: 'ca-grid ca-grid--3' }, [attnCard, funnelCard, mapCard]));
  drawMap(mapCard.querySelector('.ca-map'), d.countries || []);

  // ---- row 2: ladder · country performance · approvals
  const ladder = el('div', { class: 'card ca-card' }, [
    el('div', { class: 'card__head' }, [el('h3', {}, [icon('sitemap', 16), el('span', { text: ' ' + t('ca.ladder') })]), el('a', { href: '#/structure', class: 'btn btn--quiet', text: t('st.title') })]),
    el('div', { class: 'ca-ladder__step ca-ladder__step--hq' }, [el('b', { text: 'WODDI HQ' }), el('small', { text: t('ca.ladderHq') })]),
    ...(d.ladder || []).map((x, i) => el('a', { href: `#/structure?level=${x.level}`, class: 'ca-ladder__step', style: `margin-left:${Math.min(i, 9) * 6}px;` }, [
      el('b', { text: t('role.' + x.role) }), el('small', { text: `${fmtNumber(x.filled)} / ${fmtNumber(x.seats)} ${t('ca.filled')}` })])),
  ]);
  const rows = (d.countries || []).filter((c) => c.unit_id).slice(0, 12);
  const perf = el('div', { class: 'card ca-card' }, [
    el('div', { class: 'card__head' }, [el('h3', {}, [icon('chart', 16), el('span', { text: ' ' + t('ca.perf') })]), el('a', { href: '#/command', class: 'btn btn--quiet', text: t('v.viewAll') })]),
    el('div', { class: 'table-wrap' }, [el('table', { class: 'vs-table ca-table hf-table' }, [
      el('thead', {}, [el('tr', {}, [el('th', { text: t('v.country') }), el('th', { text: 'CR' }), el('th', { text: t('ca.thCoverage') }), el('th', { text: t('ca.thReports') }),
        el('th', { text: t('ca.thProgrammes') }), el('th', { text: t('ca.thGaps') }), el('th', { text: t('v.thStatus') })])]),
      el('tbody', {}, rows.map((c) => el('tr', {}, [
        el('td', {}, [el('a', { href: `#/structure?country=${encodeURIComponent(c.name)}`, text: c.name })]),
        el('td', { text: c.cr ? '\u2713' : '\u2014', style: c.cr ? '' : 'color:var(--danger);font-weight:700;' }),
        el('td', { text: c.coverage_pct == null ? '\u2014' : `${c.coverage_pct}%` }),
        el('td', { text: c.report_status ? t('rp.st_' + c.report_status) : t('rp.st_not_started') }),
        el('td', { text: String(c.programmes || 0) }),
        el('td', { text: String(Math.max(0, (c.seats || 0) - (c.filled || 0))) }),
        el('td', {}, [el('span', { class: `vs-badge vs-badge--${c.coverage === 'represented' ? 'green' : c.coverage === 'needs_strengthening' ? 'amber' : 'red'}`, text: t('ca.cov_' + c.coverage) })]),
      ])))])]),
  ]);
  const appr = [['appointments', P.appointments, '#/accounts'], ['applications', P.applications, '#/recruitment'], ['reports', P.reports, '#/reporting/review'], ['replacements', P.replacements, '#/structure?status=vacant'], ['escalations', P.escalations, '#/reporting/issues']];
  const apprCard = el('div', { class: 'card ca-card' }, [
    el('div', { class: 'card__head' }, [el('h3', {}, [icon('check', 16), el('span', { text: ' ' + t('ca.approvals') })]), el('a', { href: '#/recruitment', class: 'btn btn--quiet', text: t('v.viewAll') })]),
    ...appr.map(([k, v, href]) => el('a', { href, class: 'ca-attn' }, [el('b', { class: `ca-attn__n ca-attn__n--${Number(v) ? 'amber' : 'green'}`, text: String(v ?? 0) }), el('span', { class: 'grow', text: t('ca.p_' + k) }), el('span', { class: 'muted', text: '\u203A' })])),
    el('p', { class: 'muted', text: t('ca.approvalsHint') }),
  ]);
  // Phase 177: the 7-column performance table needs the full width; ladder and approvals pair as equal halves
  body.append(el('div', { class: 'ca-grid ca-grid--eq' }, [ladder, apprCard]));
  body.append(el('div', { class: 'ca-grid' }, [perf]));

  // ---- row 3: reporting & accountability · role-based access
  const exp = Number(R.expected || 0), sub = Number(R.submitted || 0);
  const pct = exp ? Math.round(100 * sub / exp) : 0;
  const bar = (label, v, tone) => el('div', { class: 'ca-bar' }, [el('span', { text: label }), el('div', { class: 'ca-bar__t' }, [el('div', { class: `ca-bar__f ca-bar__f--${tone}`, style: `width:${exp ? Math.round(100 * Number(v || 0) / exp) : 0}%` })]), el('b', { text: exp ? `${Math.round(100 * Number(v || 0) / exp)}%` : '0%' })]);
  const repCard = el('div', { class: 'card ca-card' }, [
    el('div', { class: 'card__head' }, [el('h3', {}, [icon('chart', 16), el('span', { text: ' ' + t('ca.reporting') })]), el('a', { href: '#/reporting/compliance', class: 'btn btn--quiet', text: t('v.viewAll') })]),
    el('div', { class: 'row', style: 'gap:16px;align-items:center;flex-wrap:wrap;' }, [
      el('div', { class: 'ca-donut', style: `--pct:${pct};` }, [el('b', { text: `${pct}%` }), el('small', { text: t('ca.submitted') })]),
      el('div', { class: 'grow' }, [bar(t('ca.onTime'), R.on_time, 'green'), bar(t('ca.late'), R.late, 'amber'), bar(t('ca.overdue'), R.overdue, 'red')]),
      el('div', { class: 'ca-evidence' }, [el('b', { text: fmtNumber(R.evidence_files || 0) }), el('small', { text: t('ca.evidenceFiles') })]),
    ]),
  ]);
  const ROLE_ACCESS = [['super_admin', 'full'], ['executive_director', 'executive'], ['hq_team', 'operational'], ['country_rep', 'country'], ['state_coordinator', 'state']];
  const accessCard = el('div', { class: 'card ca-card' }, [
    el('div', { class: 'card__head' }, [el('h3', {}, [icon('lock', 16), el('span', { text: ' ' + t('ca.access') })]), el('a', { href: '#/accounts', class: 'btn btn--quiet', text: t('ca.manageAccess') })]),
    el('div', { class: 'ca-access' }, ROLE_ACCESS.map(([role, lvl]) => el('div', { class: 'ca-access__i' }, [
      el('b', { text: t('role.' + role) }), el('small', { text: t('ca.access_' + lvl) }),
      el('span', { class: 'muted', text: String((d.access || []).find((x) => x.role === role)?.n ?? '') })]))),
  ]);
  body.append(el('div', { class: 'ca-grid ca-grid--eq' }, [repCard, accessCard]));
  // Phase 192: Activation & Readiness on the HQ master dashboard
  try {
    const { hqActivationAnalytics } = await import('../core/db.js');
    const A = await hqActivationAnalytics(90);
    const r3 = (A.by_route || []).find((x) => x.route === 'ref3') || {}; const r7 = (A.by_route || []).find((x) => x.route === 'open7') || {};
    const L = A.links || {};
    const mini = (n, k, tone) => el('div', { class: `vs-mini__t vs-mini__t--${tone || 'grey'}` }, [el('b', { text: String(n ?? 0) }), el('small', { text: t(k) })]);
    body.append(el('div', { class: 'card ca-card' }, [
      el('div', { class: 'card__head' }, [el('h3', {}, [icon('chart', 16), el('span', { text: ' ' + t('hqa.title') })]), el('a', { href: '#/hq/activation', class: 'btn btn--quiet', text: t('v.viewAll') })]),
      el('div', { class: 'vs-mini' }, [
        mini(L.ref3_visits, 'hqa.visits', 'magenta'), mini(L.ref3_registrations, 'hqa.registrations90', 'amber'),
        mini((r3.in_progress || 0) + (r7.in_progress || 0), 'hqa.inProgress', 'amber'), mini((r3.completed || 0) + (r7.completed || 0), 'hqa.completed', 'green'),
        mini((r3.assess_submitted || 0) + (r7.assess_submitted || 0), 'hqa.submitted', 'magenta'), mini((r3.assess_returned || 0) + (r7.assess_returned || 0), 'hqa.returned', 'red'),
        mini((r3.selected || 0) + (r7.selected || 0), 'hqa.selected', 'green'), mini((r3.extension_requested || 0) + (r7.extension_requested || 0), 'hqa.extReq', 'red'),
      ]),
    ]));
  } catch { /* the card is optional on this screen */ }

  return shell.teardown;

  // Phase 173: a response that isn't SVG (a stale cache entry, a 404
  // rewritten to index.html) must never be injected — that produced a solid
  // black panel before. No full-page auto-refresh either: the earlier
  // periodic re-render was the "page keeps reloading" HQ reported.
  async function drawMap(holder, countries) {
    try {
      const res = await fetch('/assets/africa-map.svg');
      const svgText = await res.text();
      if (!res.ok || !svgText.trim().startsWith('<svg')) { holder.remove(); return; }
      holder.innerHTML = svgText;
      const svg = holder.querySelector('svg');
      if (!svg) return;
      const byIso = Object.fromEntries(countries.map((c) => [c.iso, c]));
      for (const p of svg.querySelectorAll('path[data-iso]')) {
        const c = byIso[p.dataset.iso];
        p.classList.add(`af-${(c && c.coverage) || 'not_represented'}`);
        if (c) {
          const title = p.querySelector('title');
          if (title) title.textContent = `${c.name}: ${t('ca.cov_' + c.coverage)} \u00B7 ${t('ca.mapTip', { l: c.leaders, m: c.members })}`;
          p.style.cursor = 'pointer';
          p.addEventListener('click', () => { location.hash = `#/structure?country=${encodeURIComponent(c.name)}`; });
        }
      }
    } catch { holder.append(el('p', { class: 'muted', text: t('ca.mapUnavailable') })); }
  }
}
