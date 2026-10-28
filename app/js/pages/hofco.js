/**
 * Phase 165 — REFERENCE SCREEN 1: HEAD OF FIELD & COUNTRY OPERATIONS DASHBOARD
 * Built to the founder's "HOFCO Dashboard — Final UI/UX & Screen Behaviour
 * Specification": first screen = understand the situation, second click =
 * understand the problem, third click = take action. Rows 1 to 9 in her
 * order. All figures from hofco_dashboard(), which extends central_admin().
 */
import { el, clear } from '../core/dom.js';
import { t, fmtNumber, fmtDate, fmtDateTime } from '../core/i18n.js';
import { db } from '../core/db.js';
import { renderShell } from '../components/layout.js';
import { icon } from '../components/icons.js';
import { AF_REGIONS, regionOf } from '../core/geo.js';
import { withDriveFallback, driveAvatarByName } from '../core/photos.js';
const PERSON_ISSUES = ['cr_inactive', 'task_overdue', 'activation_stalled', 'appointment_pending', 'engagement_declining', 'support_unresolved'];
import { avatarUrl } from '../core/db.js';

const PERIODS = ['today', 'week', 'month', 'quarter', 'ytd'];

// Phase 222: an activity's "what" is a role for appointments but a report
// template for reports ("role.monthly_leadership" showed raw on the dashboard).
function whatLabel(w) {
  for (const k of ['role.' + w, 'rp.tpl_' + w]) { const s = t(k); if (s && s !== k) return s; }
  return String(w).replace(/_/g, ' ');
}

export async function render(root, params, ctx) {
  const shell = renderShell(root, { profile: ctx.profile, modules: ctx.modules, titleKey: 'hf.title' });
  const out = shell.outlet;
  clear(out);
  const net = params?.net || sessionStorage.getItem('wdos.hofco.net') || 'all';
  const period = params?.period || sessionStorage.getItem('wdos.hofco.period') || 'month';
  const again = (o) => { sessionStorage.setItem('wdos.hofco.net', o.net ?? net); sessionStorage.setItem('wdos.hofco.period', o.period ?? period); render(root, { ...params, net: o.net ?? net, period: o.period ?? period }, ctx); };

  // ---- page header: photo · identity · role · period · network
  const hfAv = el('img', { class: 'hf-ava', alt: '', src: avatarUrl(ctx.profile.id, Math.floor(Date.now() / 3600000)) });
  withDriveFallback(hfAv, ctx.profile, () => el('div', { class: 'hf-ava', text: ((ctx.profile.first_name || '?')[0] + (ctx.profile.last_name || '')[0]).toUpperCase() }));
  out.append(el('div', { class: 'hf-head' }, [
    el('div', { class: 'hf-head__id' }, [hfAv, el('div', {}, [
      el('h2', { text: t('hf.welcome', { name: ctx.profile.first_name }) }),
      el('div', { class: 'muted', text: t('hf.role') }),
      el('div', { class: 'hf-motto', text: t('hf.motto') })])]),
    el('div', { class: 'hf-controls' }, [
      el('select', { class: 'select', onchange: (e) => again({ period: e.target.value }) }, PERIODS.map((k) => el('option', { value: k, text: t('hf.p_' + k), selected: k === period || null }))),
      el('div', { class: 'ca-nets' }, ['all', 'WGMN', 'WNNN'].map((n) => el('button', { class: `reg-lang ${net === n ? 'is-active' : ''}`, text: n === 'all' ? t('ca.allNetworks') : n, onclick: () => again({ net: n }) })))]),
  ]));
  const body = el('div', { class: 'state' }, [el('div', { class: 'spinner' })]);
  out.append(body);
  let d, netData = {};
  try {
    // Phase 176: one round trip, not three. hofco_dashboard already computes
    // everything for the chosen network filter; the two hero panels only
    // need a light per-network snapshot, not the full 54-country breakdown
    // — and all three run in parallel, cached briefly so flipping between
    // tabs and back to the dashboard doesn't re-trigger them.
    const { cachedRpc, networkSnapshot } = await import('../core/db.js');
    const [hf, w, n] = await Promise.all([
      cachedRpc(`hofco:${net}:${period}`, async () => { const { data, error } = await db().rpc('hofco_dashboard_cached', { p_net: net, p_period: period }); if (error) throw error; return data; }),
      cachedRpc('netsnap:WGMN', () => networkSnapshot('WGMN')),
      cachedRpc('netsnap:WNNN', () => networkSnapshot('WNNN')),
    ]);
    d = hf; netData = { WGMN: w || {}, WNNN: n || {} };
  }
  catch (err) { clear(body); body.className = 'card'; body.append(el('h3', { text: t('errors.loadTitle') }), el('p', { class: 'muted', text: String(err?.message || err).slice(0, 200) })); return shell.teardown; }
  clear(body); body.className = '';
  const T2 = d.tiles2 || {}, Q = d.queue || {}, E = d.engagement || {}, R = d.reporting || {}, AC = d.activities || {}, N = d.networks || {};

  // ---- ROW 1 · network & operational overview (every card clickable)
  const tile = (label, value, href, tone, sub) => el('a', { class: `ca-tile ca-tile--${tone}`, href }, [el('b', { text: typeof value === 'string' ? value : fmtNumber(Number(value || 0)) }), el('span', { text: label }), sub ? el('small', { class: 'muted', text: sub }) : null]);
  body.append(el('div', { class: 'ca-tiles ca-tiles--6' }, [
    tile(t('hf.tOperational'), `${T2.countries_operational || 0} / ${d.tiles?.countries_total || 54}`, '#/organisation', 'magenta', t('hf.tOperationalSub')),
    tile(t('hf.tCoverage'), `${T2.coverage_pct || 0}%`, '#/structure', 'green', t('hf.tCoverageSub')),
    tile(t('hf.tActive'), T2.active_leaders, '#/accounts', 'green', t('hf.tActiveSub')),
    tile(t('hf.tVacancies'), T2.priority_vacancies, '#/structure?status=vacant', 'red', t('hf.tVacanciesSub')),
    tile(t('hf.tReports'), T2.reports_outstanding, '#/reporting/compliance', 'amber', t('hf.tReportsSub')),
    tile(t('hf.tActivities'), T2.activities_period, '#/reporting/records', 'magenta', t('hf.p_' + period)),
  ]));

  // ---- Phase 211 · Operations Centre strip: every volunteer leader in one line, two clicks to act
  try {
    const { opsLeaders } = await import('../core/db.js');
    const O = await opsLeaders({ net: net === 'all' ? null : net, limit: 1 }); const OT = O.totals || {};
    const ot = (ic, v, label, href, tone) => el('a', { class: `ops-strip__k ops-strip__k--${tone || 'plain'}`, href }, [icon(ic, 15), el('b', { text: String(v ?? 0) }), el('span', { text: label })]);
    body.append(el('section', { class: 'ops-strip' }, [
      el('div', { class: 'ops-strip__head' }, [el('h3', {}, [icon('tower-broadcast', 18), ' ', t('ops.title')]), el('p', { class: 'muted', text: t('ops.stripSub') })]),
      el('div', { class: 'ops-strip__ks' }, [ot('people-group', OT.leaders, t('ops.k_leaders'), '#/ops/leaders', 'magenta'), ot('bolt', OT.active7, t('ops.k_active7'), '#/ops/leaders?status=active7', 'green'),
        ot('user-slash', OT.never, t('ops.k_never'), '#/ops/leaders?status=never', 'red'), ot('graduation-cap', OT.onboarding_pending, t('ops.k_onboarding'), '#/ops/leaders?status=onboarding_pending', 'amber'),
        ot('gauge-high', `${OT.avg_score ?? 0}/100`, t('ops.k_score'), '#/ops/leaders?status=low_score')]),
      el('div', { class: 'ops-strip__btns' }, [el('a', { class: 'btn btn--primary', href: '#/ops/messages' }, [icon('paper-plane', 14), ' ', t('ops.qa_message')]), el('a', { class: 'btn btn--secondary', href: '#/ops/tasks' }, [icon('list-check', 14), ' ', t('ops.qa_task')]),
        el('a', { class: 'btn btn--quiet', href: '#/ops/reports' }, [icon('file-pdf', 14), ' ', t('ops.qa_report')]), el('a', { class: 'btn btn--quiet', href: '#/ops' }, [icon('arrow-right', 14), ' ', t('ops.open')])])]));
  } catch { /* the strip is optional on this screen */ }

  // ---- ROW 1b · the two networks side by side (her picture): four figures, a mini map, "View details"
  const heroes = el('div', { class: 'ca-grid ca-grid--eq' });
  for (const [code, full, tone, motto] of [['WGMN', t('vol.wgmnFull'), 'magenta', t('v.quoteWgmn')], ['WNNN', t('vol.wnnnFull'), 'lemon', t('v.quoteWnnn')]]) {
    const nd = netData[code] || {}; const nt = nd.tiles || {}; const nr = nd.reporting || {};
    const panel = el('div', { class: `hf-hero hf-hero--${tone}` }, [
      el('div', { class: 'hf-hero__head' }, [el('div', { class: 'hf-hero__logo' }, [el('img', { src: `/assets/logos/${code.toLowerCase()}.png`, alt: '', width: 64, height: 64 })]), el('div', { class: 'hf-hero__id' }, [el('b', { text: code }), el('div', { class: 'hf-hero__full', text: `WODDI ${full}` }), el('div', { class: 'hf-hero__motto', text: motto })]), el('div', { class: `hf-hero__map hf-hero__map--${tone}` })]),
      el('div', { class: 'hf-hero__grid' }, [
        heroStat(t('hf.tOperational'), `${(Number(nt.countries_represented || 0) + Number(nt.countries_strengthen || 0))}`, `#/structure?net=${code}`),
        heroStat(t('hf.tActive'), String(nt.leaders_active30 ?? 0), `#/accounts?net=${code}`),
        heroStat(t('hf.tReports'), String(nr.overdue ?? 0), '#/reporting/compliance'),
        heroStat(t('hf.tActivities'), String(N[code]?.activities ?? 0), '#/reporting/records')]),
      el('a', { href: `#/network/${code}`, class: `btn btn--primary hf-hero__btn hf-hero__btn--${tone}`, text: t('hf.viewNet', { net: code }) })]);
    heroes.append(panel);
    drawMini(panel.querySelector('.hf-hero__map'), nd.countries || []);
  }
  body.append(heroes);

  // ---- ROW 2 · Attention Required (Issue · Network · Country · Level · Owner · Priority · Deadline · Action)
  const items = d.attention_items || [];
  const PRI = { critical: 'red', high: 'red', medium: 'amber', normal: 'grey' };
  // Phase 177: full-width row, 6 rows only (the count stays in the heading, the rest lives behind View all)
  const ATTN_MAX = 6;
  const attn = el('div', { class: 'card ca-card' }, [
    el('div', { class: 'card__head' }, [el('h3', {}, [icon('shield', 16), el('span', { text: ' ' + t('hf.attentionShort') }), items.length ? el('span', { class: 'hf-count', text: String(items.length) }) : null]), el('a', { href: '#/reporting/dashboard', class: 'btn btn--quiet', text: items.length > ATTN_MAX ? t('hf.viewAllN', { n: items.length }) : t('v.viewAll') })]),
    items.length ? el('div', { class: 'table-wrap' }, [el('table', { class: 'vs-table ca-table hf-table' }, [
      el('thead', {}, [el('tr', {}, ['hf.cIssue', 'hf.cNetwork', 'v.country', 'hf.cLevel', 'hf.cOwner', 'hf.cPriority', 'hf.cDeadline', 'hf.cAction'].map((k) => el('th', { text: t(k) })))]),
      el('tbody', {}, items.slice(0, ATTN_MAX).map((it) => el('tr', {}, [
        el('td', { class: 'hf-td-wrap', text: t('hf.i_' + it.issue) }), el('td', { text: it.network || '' }), el('td', { text: it.country || '' }), el('td', { text: it.level ? t('hf.lvl', { l: it.level }) : '' }),
        el('td', { class: 'hf-td-wrap' }, [PERSON_ISSUES.includes(it.issue) && it.owner ? el('span', { class: 'hf-owner' }, [driveAvatarByName(it.owner, 'ava-name ava-name--sm'), el('span', { text: it.owner })]) : el('span', { text: it.owner || '' })]),
        el('td', {}, [el('span', { class: `vs-badge vs-badge--${PRI[it.priority] || 'grey'}`, text: t('hf.pr_' + it.priority) })]),
        el('td', { text: it.deadline ? fmtDate(it.deadline) : '\u2014' }),
        el('td', {}, [el('a', { href: it.href, class: 'btn btn--secondary', text: t('hf.a_' + it.issue) })]),
      ])))])]) : el('p', { class: 'muted', text: t('hf.attentionNone') }),
    items.length > ATTN_MAX ? el('p', { class: 'muted hf-more' }, [el('a', { href: '#/reporting/dashboard', text: t('hf.attentionMore', { n: items.length - ATTN_MAX }) })]) : null,
  ]);
  body.append(el('div', { class: 'ca-grid' }, [attn]));

  // ---- ROW 3 · My Work Queue (each number clickable)
  const queue = [['approvals', Q.approvals, '#/recruitment'], ['requests', Q.requests, '#/helpdesk'], ['reports_review', Q.reports_review, '#/reporting/review'], ['followups', Q.followups, '#/tasks?view=assigned'],
    ['decisions', Q.decisions, '#/reporting/issues'], ['escalated', Q.escalated, '#/reporting/review'], ['due_today', Q.due_today, '#/tasks'], ['due_week', Q.due_week, '#/tasks'], ['overdue', Q.overdue, '#/tasks?view=overdue'],
    ['returned', Q.returned, '#/reporting/mine'], ['verification', Q.verification, '#/tasks?view=assigned']];
  const queueCard = el('div', { class: 'card ca-card' }, [
    el('div', { class: 'card__head' }, [el('h3', {}, [icon('tasks', 16), el('span', { text: ' ' + t('hf.queue') })]), el('a', { href: '#/tasks', class: 'btn btn--quiet', text: t('v.viewAll') })]),
    el('div', { class: 'hf-queue' }, queue.map(([k, v, href]) => el('a', { href, class: 'ca-attn' }, [el('b', { class: `ca-attn__n ca-attn__n--${Number(v) ? (k === 'overdue' || k === 'escalated' ? 'red' : 'amber') : 'green'}`, text: String(v ?? 0) }), el('span', { class: 'grow', text: t('hf.q_' + k) }), el('span', { class: 'muted', text: '\u203A' })]))),
  ]);
  // Quick actions sit beside Attention Required and My Work Queue (per the founder's reference), coloured, not buried at the foot of the page
  const QA = [['#/hq/activation', 'hqa.threeDayBtn', 'userplus', 'magenta'], ['#/organisation', 'hf.qaCountry', 'sitemap', 'magenta'], ['#/recruitment', 'hf.qaApprove', 'check', 'lemon'], ['#/ops/tasks', 'hf.qaAssign', 'tasks', 'magenta'], ['#/ops/messages', 'ops.qa_message', 'paper-plane', 'lemon'], ['#/announcements', 'hf.qaDirective', 'megaphone', 'lemon'], ['#/reporting/issues', 'hf.qaIssues', 'shield', 'red'], ['#/structure?status=vacant', 'hf.qaVacancies', 'briefcase', 'magenta'], ['#/reporting/review', 'hf.qaReports', 'chart', 'lemon']];
  const quick = el('div', { class: 'card ca-card' }, [
    el('div', { class: 'card__head' }, [el('h3', {}, [icon('check', 16), el('span', { text: ' ' + t('hf.quick') })])]),
    el('div', { class: 'hf-quick hf-quick--grid' }, QA.map(([href, k, ic, tone]) => el('a', { href, class: `hf-quick__a hf-quick__a--${tone}` }, [icon(ic, 16), el('span', { text: t(k) })]))),
  ]);
  body.append(el('div', { class: 'ca-grid ca-grid--eq' }, [queueCard, quick]));
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


  // ---- ROW 4 · WGMN & WNNN performance
  const KEYS = [['countries', 'hf.nCountries'], ['leaders', 'hf.nLeaders'], ['active', 'hf.nActive'], ['members', 'hf.nMembers'], ['applications', 'hf.nApplications'], ['reports_compliance', 'hf.nCompliance'], ['activities', 'hf.nActivities'], ['at_risk', 'hf.nAtRisk']];
  const netCard = el('div', { class: 'card ca-card' }, [
    el('div', { class: 'card__head' }, [el('h3', {}, [icon('chart', 16), el('span', { text: ' ' + t('hf.networks') })]), el('a', { href: '#/structure', class: 'btn btn--quiet', text: t('v.viewAll') })]),
    el('div', { class: 'table-wrap' }, [el('table', { class: 'vs-table ca-table' }, [
      el('thead', {}, [el('tr', {}, [el('th', { text: t('hf.indicator') }), el('th', { text: 'WGMN' }), el('th', { text: 'WNNN' })])]),
      el('tbody', {}, KEYS.map(([k, lk]) => el('tr', {}, [el('td', { text: t(lk) }),
        el('td', {}, [bar(N.WGMN?.[k], k, 'magenta')]), el('td', {}, [bar(N.WNNN?.[k], k, 'green')])])))])]),
  ]);
  // ---- ROW 5 · country performance table (clickable rows → Country 360)
  const rows = (d.countries || []).filter((c) => c.unit_id).slice(0, 12);
  const cty = el('div', { class: 'card ca-card' }, [
    el('div', { class: 'card__head' }, [el('h3', {}, [icon('sitemap', 16), el('span', { text: ' ' + t('hf.countries') })]), el('a', { href: '#/organisation', class: 'btn btn--quiet', text: t('v.viewAll') })]),
    el('div', { class: 'table-wrap' }, [el('table', { class: 'vs-table ca-table hf-table' }, [
      el('thead', {}, [el('tr', {}, ['v.country', 'ca.thCoverage', 'hf.cVacancies', 'hf.cRecruitment', 'ca.thReports', 'hf.cActivities', 'hf.cEngagement', 'v.thStatus'].map((k) => el('th', { text: t(k) })))]),
      el('tbody', {}, rows.map((c) => {
        const eng = c.leaders ? Math.round(100 * (c.active_leaders || 0) / c.leaders) : 0;
        const status = c.coverage === 'not_represented' ? 'intervention' : (c.report_status == null && c.leaders > 0) ? 'attention' : eng < 34 ? 'at_risk' : 'on_track';
        return el('tr', { class: 'is-link', onclick: () => { location.hash = `#/country/${c.unit_id}`; } }, [
          el('td', {}, [el('a', { href: `#/country/${c.unit_id}`, text: c.name })]),
          el('td', { text: c.coverage_pct == null ? '\u2014' : `${c.coverage_pct}%` }), el('td', { text: String(Math.max(0, (c.seats || 0) - (c.filled || 0))) }),
          el('td', { text: String(c.states_led || 0) + '/' + String(c.states || 0) }), el('td', { text: c.report_status ? t('rp.st_' + c.report_status) : t('rp.st_not_started') }),
          el('td', { text: String(c.programmes || 0) }), el('td', { text: `${eng}%` }),
          el('td', {}, [el('span', { class: `vs-badge vs-badge--${status === 'on_track' ? 'green' : status === 'attention' ? 'amber' : 'red'}`, text: t('hf.st_' + status) })])]);
      }))])]),
  ]);
  // Phase 177: the country table needs the full width (8 columns); the network comparison pairs with the region chart below

  // ---- ROW 5b · leadership coverage by region (WGMN vs WNNN) · country status map
  const regionCov = (list) => {
    const out = {}; const mk = (cs) => { const seats = cs.reduce((a, c) => a + Number(c.seats || 0), 0); const filled = cs.reduce((a, c) => a + Number(c.filled || 0), 0); const rep = cs.filter((c) => c.coverage !== 'not_represented').length; return { pct: seats ? Math.round(100 * filled / seats) : 0, rep, n: cs.length }; };
    out['Africa'] = mk(list || []);
    for (const r of Object.keys(AF_REGIONS)) out[r] = mk((list || []).filter((c) => regionOf(c.iso) === r));
    return out;
  };
  const covW = regionCov(netData.WGMN?.countries), covN = regionCov(netData.WNNN?.countries);
  const covCard = el('div', { class: 'card ca-card' }, [el('div', { class: 'card__head' }, [el('h3', {}, [icon('chart', 16), el('span', { text: ' ' + t('hf.covByRegion') })]), el('a', { href: '#/structure', class: 'btn btn--quiet', text: t('v.viewAll') })]),
    el('div', { class: 'hf-region-legend' }, [el('span', { class: 'hf-region-legend__i hf-region-legend__i--magenta', text: 'WGMN' }), el('span', { class: 'hf-region-legend__i hf-region-legend__i--lemon', text: 'WNNN' })]),
    el('div', { class: 'hf-regions' }, ['Africa', ...Object.keys(AF_REGIONS)].map((r) => el('div', { class: 'hf-region' }, [
      el('div', { class: 'hf-region__bars' }, [
        el('div', { class: 'hf-region__col' }, [el('small', { class: 'hf-region__pct', text: `${covW[r].pct}%` }), el('div', { class: 'hf-region__bar hf-region__bar--magenta', style: `height:${Math.max(4, covW[r].pct)}%`, title: `WGMN ${covW[r].pct}%` })]),
        el('div', { class: 'hf-region__col' }, [el('small', { class: 'hf-region__pct', text: `${covN[r].pct}%` }), el('div', { class: 'hf-region__bar hf-region__bar--lemon', style: `height:${Math.max(4, covN[r].pct)}%`, title: `WNNN ${covN[r].pct}%` })])]),
      el('small', { text: r === 'Africa' ? t('hf.regionAfrica') : r })])))]);
  const mapCard2 = el('div', { class: 'card ca-card' }, [el('div', { class: 'card__head' }, [el('h3', {}, [icon('sitemap', 16), el('span', { text: ' ' + t('hf.statusMap') })]), el('a', { href: '#/organisation', class: 'btn btn--quiet', text: t('v.viewAll') })]),
    el('div', { class: 'ca-map hf-statusmap' }),
    el('div', { class: 'ca-legend' }, [['on_track', 'green'], ['attention', 'amber'], ['at_risk', 'red'], ['intervention', 'grey']].map(([k, c]) => el('span', { class: `ca-legend__i ca-legend__i--st-${c}`, text: t('hf.st_' + k) })))]);
  body.append(el('div', { class: 'ca-grid ca-grid--eq' }, [netCard, covCard]));
  body.append(el('div', { class: 'ca-grid' }, [cty]));
  drawStatusMap(mapCard2.querySelector('.hf-statusmap'), d.countries || []);

  // ---- ROW 6 · engagement · ROW 7 · reporting · ROW 8 · activities
  const eng = el('div', { class: 'card ca-card' }, [
    el('div', { class: 'card__head' }, [el('h3', {}, [icon('users', 16), el('span', { text: ' ' + t('hf.engagement') })]), el('a', { href: '#/engagement', class: 'btn btn--quiet', text: t('v.viewAll') })]),
    el('div', { class: 'vs-mini' }, [mini(t('hf.eActive'), E.active, 'green'), mini(t('hf.eConsistent'), E.consistent), mini(t('hf.eDeclining'), E.declining, 'amber'), mini(t('hf.eAtRisk'), E.at_risk, 'red'), mini(t('hf.eInactive'), E.inactive, 'red'), mini(t('hf.eSupport'), E.support_open, E.support_open ? 'amber' : ''), mini(t('hf.eMilestones'), E.milestones_30d)]),
    el('p', { class: 'muted', text: t('hf.engagementNote') }),
  ]);
  const exp = Number(R.expected || 0), pct = exp ? Math.round(100 * Number(R.submitted || 0) / exp) : 0;
  const rep = el('div', { class: 'card ca-card' }, [
    el('div', { class: 'card__head' }, [el('h3', {}, [icon('chart', 16), el('span', { text: ' ' + t('hf.reporting') })]), el('a', { href: '#/reporting/compliance', class: 'btn btn--quiet', text: t('v.viewAll') })]),
    el('div', { class: 'vs-mini' }, [mini(t('hf.rExpected'), R.expected), mini(t('hf.rSubmitted'), R.submitted, 'green'), mini(t('ca.onTime'), R.on_time, 'green'), mini(t('ca.late'), R.late, 'amber'), mini(t('hf.rOutstanding'), R.overdue, R.overdue ? 'red' : ''), mini(t('hf.rEvidenceMissing'), AC.evidence_pending, AC.evidence_pending ? 'amber' : ''), mini(t('hf.rCompliance'), `${pct}%`, pct >= 80 ? 'green' : pct >= 50 ? 'amber' : 'red')]),
  ]);
  const act = el('div', { class: 'card ca-card' }, [
    el('div', { class: 'card__head' }, [icon('calendar', 16), el('h3', { text: ' ' + t('hf.activities') }), el('a', { href: '#/programmes', class: 'btn btn--quiet', text: t('v.viewAll') })]),
    el('div', { class: 'vs-mini' }, [mini(t('hf.aUpcoming'), AC.upcoming), mini(t('hf.aOngoing'), AC.ongoing), mini(t('hf.aCompleted'), AC.completed, 'green'), mini(t('hf.aDelayed'), AC.delayed, AC.delayed ? 'red' : ''), mini(t('hf.aEvidence'), AC.evidence_pending, AC.evidence_pending ? 'amber' : ''), mini(t('hf.aParticipants'), AC.participants), mini(t('hf.aWomen'), AC.women_reached, 'magenta')]),
  ]);
  body.append(el('div', { class: 'ca-grid ca-grid--3' }, [eng, rep, act]));

  // ---- ROW 9 · country status map · recent network activity
  const recent = el('div', { class: 'card ca-card' }, [
    el('div', { class: 'card__head' }, [el('h3', {}, [icon('clip', 16), el('span', { text: ' ' + t('hf.recent') })])]),
    ...((d.recent || []).slice(0, 10).map((e) => el('div', { class: 'hf-recent' }, [
      el('small', { class: 'muted', text: e.at ? fmtDateTime(e.at) : '' }),
      el('div', {}, [el('b', { text: t('hf.k_' + e.kind) }), el('span', { class: 'muted', text: ` · ${e.who || ''}${e.what ? ' · ' + whatLabel(e.what) : ''}${e.where ? ' · ' + e.where : ''}${e.network ? ' (' + e.network + ')' : ''}` })])]))),
    !(d.recent || []).length ? el('p', { class: 'muted', text: t('hf.recentNone') }) : null,
  ]);
  body.append(el('div', { class: 'ca-grid ca-grid--eq' }, [mapCard2, recent]));
  return shell.teardown;

  function heroStat(label, value, href) { return el('a', { href, class: 'hf-hero__stat' }, [el('b', { text: value }), el('span', { text: label })]); }
  // Phase 173: a fetch that returns something other than SVG (an old cached
  // response, a 404 rewritten to index.html by the host's SPA fallback) must
  // never be injected — that is what produced a solid black panel before.
  async function svgInto(holder) {
    try {
      const res = await fetch('/assets/africa-map.svg');
      const txt = await res.text();
      if (!res.ok || !txt.trim().startsWith('<svg')) { holder.remove(); return null; }
      holder.innerHTML = txt;
      return holder.querySelector('svg');
    } catch { holder.remove(); return null; }
  }
  async function drawMini(holder, countries) {
    try { const svg = await svgInto(holder); if (!svg) return; const by = Object.fromEntries(countries.map((c) => [c.iso, c.coverage])); for (const p of svg.querySelectorAll('path[data-iso]')) p.classList.add('af-' + (by[p.dataset.iso] || 'not_represented')); } catch { /* no map */ }
  }
  async function drawStatusMap(holder, countries) {
    try {
      const svg = await svgInto(holder); if (!svg) return;
      const by = Object.fromEntries(countries.map((c) => { const eng = c.leaders ? Math.round(100 * (c.active_leaders || 0) / c.leaders) : 0; const st = !c.unit_id || c.coverage === 'not_represented' ? 'intervention' : (c.report_status == null && c.leaders > 0) ? 'attention' : eng < 34 ? 'at_risk' : 'on_track'; return [c.iso, st]; }));
      for (const p of svg.querySelectorAll('path[data-iso]')) { p.classList.add('st-' + (by[p.dataset.iso] || 'intervention')); const c = countries.find((x) => x.iso === p.dataset.iso); if (c?.unit_id) { p.style.cursor = 'pointer'; p.addEventListener('click', () => { location.hash = `#/country/${c.unit_id}`; }); const tt = p.querySelector('title'); if (tt) tt.textContent = `${c.name}: ${t('hf.st_' + by[c.iso])}`; } }
    } catch { /* no map */ }
  }
  function mini(label, value, tone = '') {
    return el('div', { class: `vs-mini__t ${tone ? 'vs-mini__t--' + tone : ''}` }, [el('b', { text: typeof value === 'string' ? value : String(value ?? 0) }), el('small', { text: label })]);
  }
  function bar(v, k, tone) {
    const n = Number(v || 0); const pctv = k === 'reports_compliance' ? n : null;
    const max = k === 'reports_compliance' ? 100 : Math.max(1, Number(N.WGMN?.[k] || 0), Number(N.WNNN?.[k] || 0));
    return el('div', { class: 'hf-bar' }, [el('div', { class: `hf-bar__f hf-bar__f--${tone}`, style: `width:${Math.round(100 * n / max)}%` }), el('b', { text: pctv == null ? fmtNumber(n) : `${n}%` })]);
  }
}
