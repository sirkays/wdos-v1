/**
 * Phase 167 — HQ role homepages beyond HOFCO. Every Headquarters officer sees
 * the five areas of the founder's Common HQ Dashboard (my overview, attention
 * required, my work queue, performance, recent activity) plus quick actions,
 * with content scoped to her function (Part A, C to I of the architecture).
 * All figures come from hofco_dashboard() (which extends central_admin()),
 * so a number reads the same on every role's screen.
 */
import { el, clear } from '../core/dom.js';
import { t, fmtNumber, fmtDate, fmtDateTime } from '../core/i18n.js';
import { db } from '../core/db.js';
import { renderShell } from '../components/layout.js';
import { icon } from '../components/icons.js';
import { driveAvatarByName } from '../core/photos.js';
const PERSON_ISSUES = ['cr_inactive', 'task_overdue', 'activation_stalled', 'appointment_pending', 'engagement_declining', 'support_unresolved'];

const SPEC = {
  founder: { tiles: ['countries_operational', 'coverage_pct', 'active_leaders', 'members', 'reporting_compliance', 'programmes'], attention: ['vacant_cr', 'issue_red', 'cr_inactive'], queue: ['approvals', 'decisions', 'escalated'], quick: [['#/command', 'rh.qAnalytics'], ['#/reporting/issues', 'rh.qEscalations'], ['#/recruitment', 'rh.qApprovals'], ['#/reporting/archive', 'rh.qExecReports']], strategic: true },
  secretary: { tiles: ['reports_outstanding', 'appointment_pending', 'meetings_upcoming', 'due_today', 'overdue', 'activities_period'], attention: ['report_overdue', 'appointment_pending', 'task_overdue', 'activation_stalled'], queue: ['reports_review', 'followups', 'due_today', 'due_week', 'overdue', 'verification'], quick: [['#/reporting/compliance', 'rh.qReportsFollow'], ['#/accounts?f=pending', 'rh.qAppointments'], ['#/meetings', 'rh.qCalendar'], ['#/tasks?view=hq', 'rh.qTracker']] },
  admin: { tiles: ['members', 'members_wgmn', 'members_wnnn', 'due_today', 'overdue', 'appointment_pending'], attention: ['appointment_pending', 'task_overdue', 'support_unresolved'], queue: ['followups', 'due_today', 'due_week', 'overdue', 'verification'], quick: [['#/tasks?view=hq', 'rh.qActionRegister'], ['#/members', 'rh.qCommunity'], ['#/library', 'rh.qRecords'], ['#/accounts', 'rh.qPersonRecords']] },
  programmes: { tiles: ['programmes', 'activities_period', 'women_reached', 'delayed', 'evidence_pending', 'reports_outstanding'], attention: ['report_overdue', 'issue_red'], queue: ['reports_review', 'followups', 'due_week'], quick: [['#/programmes', 'rh.qPortfolio'], ['#/reporting/records', 'rh.qNetworkView'], ['#/reporting/review', 'rh.qQuality'], ['#/reporting/issues', 'rh.qRedFlags']] },
  comms: { tiles: ['activities_period', 'women_reached', 'programmes', 'members', 'countries_operational', 'active_leaders'], attention: ['issue_red'], queue: ['requests', 'due_week'], quick: [['#/reporting/records', 'rh.qNewForComms'], ['#/announcements', 'rh.qAnnounce'], ['#/spotlight-review', 'rh.qRecognition'], ['#/content', 'rh.qContent']] },
  finance: { tiles: ['countries_operational', 'programmes', 'activities_period', 'members', 'active_leaders', 'reports_outstanding'], attention: [], queue: ['requests', 'due_week'], quick: [['#/planned/finance', 'rh.qBudget'], ['#/planned/finance', 'rh.qExpenditure'], ['#/planned/finance', 'rh.qPayments'], ['#/library', 'rh.qFinanceDocs']], planned: true },
  it: { tiles: ['members', 'active_leaders', 'leaders_unverified', 'system_alerts', 'reports_submitted', 'activities_period'], attention: ['support_unresolved'], queue: ['requests'], quick: [['#/doctor', 'rh.qHealth'], ['#/accounts', 'rh.qUsers'], ['#/helpdesk', 'rh.qTickets'], ['#/settings', 'rh.qSettings']] },
  qa: { tiles: ['reports_submitted', 'reports_outstanding', 'system_alerts', 'leaders_unverified', 'evidence_pending', 'delayed'], attention: ['report_overdue', 'support_unresolved'], queue: ['verification', 'reports_review'], quick: [['#/planned/readiness', 'rh.qReadiness'], ['#/tasks?view=hq', 'rh.qVerify'], ['#/doctor', 'rh.qDataQuality'], ['#/reporting/archive', 'rh.qQaReports']] },
};
const TILE = {
  countries_operational: (d) => [`${d.tiles2?.countries_operational ?? 0} / ${d.tiles?.countries_total ?? 54}`, 'hf.tOperational', '#/organisation', 'magenta'],
  coverage_pct: (d) => [`${d.tiles2?.coverage_pct ?? 0}%`, 'hf.tCoverage', '#/structure', 'green'],
  active_leaders: (d) => [d.tiles2?.active_leaders, 'hf.tActive', '#/accounts', 'green'],
  members: (d) => [d.tiles?.members, 'rh.tMembers', '#/members', 'magenta'],
  members_wgmn: (d) => [d.tiles?.members_wgmn, 'rh.tMembersWgmn', '#/members?net=WGMN', 'magenta'],
  members_wnnn: (d) => [d.tiles?.members_wnnn, 'rh.tMembersWnnn', '#/members?net=WNNN', 'green'],
  reporting_compliance: (d) => { const e = Number(d.reporting?.expected || 0); return [`${e ? Math.round(100 * Number(d.reporting?.submitted || 0) / e) : 0}%`, 'hf.rCompliance', '#/reporting/compliance', 'amber']; },
  programmes: (d) => [d.tiles?.programmes_running, 'ca.tProgrammes', '#/programmes', 'green'],
  reports_outstanding: (d) => [d.tiles2?.reports_outstanding, 'hf.tReports', '#/reporting/compliance', 'amber'],
  reports_submitted: (d) => [d.reporting?.submitted, 'hf.rSubmitted', '#/reporting/review', 'green'],
  appointment_pending: (d) => [d.approvals?.appointments, 'ca.p_appointments', '#/accounts?f=pending', 'amber'],
  meetings_upcoming: (d) => [d.activities?.upcoming, 'hf.aUpcoming', '#/meetings', 'magenta'],
  due_today: (d) => [d.queue?.due_today, 'hf.q_due_today', '#/tasks', 'amber'],
  overdue: (d) => [d.queue?.overdue, 'hf.q_overdue', '#/tasks?view=overdue', 'red'],
  activities_period: (d) => [d.tiles2?.activities_period, 'hf.tActivities', '#/reporting/records', 'magenta'],
  women_reached: (d) => [d.activities?.women_reached, 'hf.aWomen', '#/reporting/records', 'magenta'],
  delayed: (d) => [d.activities?.delayed, 'hf.aDelayed', '#/programmes', 'red'],
  evidence_pending: (d) => [d.activities?.evidence_pending, 'hf.aEvidence', '#/reporting/review', 'amber'],
  leaders_unverified: (d) => [d.tiles?.leaders_unverified, 'rh.tUnverified', '#/accounts?f=pending', 'amber'],
  system_alerts: (d) => [d.attention?.system_alerts, 'ca.a_systemAlerts', '#/helpdesk', 'grey'],
};
const PRI = { critical: 'red', high: 'red', medium: 'amber', normal: 'grey' };

export async function render(root, params, ctx) {
  const fn = ctx.profile?.hq_function || window.__wdosHqFn || 'founder';
  const spec = SPEC[fn] || SPEC.founder;
  const shell = renderShell(root, { profile: ctx.profile, modules: ctx.modules, titleKey: 'hqfn.' + fn });
  const out = shell.outlet; clear(out);
  const net = params?.net || 'all', period = params?.period || 'month';
  out.append(el('div', { class: 'hf-head' }, [
    el('div', {}, [el('h2', { text: t('hf.welcome', { name: ctx.profile.first_name }) }), el('div', { class: 'muted', text: t('hqfn.' + fn) }), el('div', { class: 'hf-motto', text: t('rh.duty_' + fn) })]),
    el('div', { class: 'hf-controls' }, [el('select', { class: 'select', onchange: (e) => render(root, { ...params, period: e.target.value }, ctx) }, ['today', 'week', 'month', 'quarter', 'ytd'].map((k) => el('option', { value: k, text: t('hf.p_' + k), selected: k === period || null }))),
      el('div', { class: 'ca-nets' }, ['all', 'WGMN', 'WNNN'].map((n) => el('button', { class: `reg-lang ${net === n ? 'is-active' : ''}`, text: n === 'all' ? t('ca.allNetworks') : n, onclick: () => render(root, { ...params, net: n }, ctx) })))])]));
  const body = el('div', { class: 'state' }, [el('div', { class: 'spinner' })]); out.append(body);
  let d;
  try { const { cachedRpc } = await import('../core/db.js'); const data = await cachedRpc(`hofco:${net}:${period}`, async () => { const r = await db().rpc('hofco_dashboard_cached', { p_net: net, p_period: period }); if (r.error) throw r.error; return r.data; }); d = data; }
  catch (err) { clear(body); body.className = 'card'; body.append(el('h3', { text: t('errors.loadTitle') }), el('p', { class: 'muted', text: String(err?.message || err).slice(0, 200) })); return shell.teardown; }
  clear(body); body.className = '';
  if (spec.planned) body.append(el('div', { class: 'vs-card vs-card--danger' }, [el('b', { text: t('rh.financePlanned') }), el('p', { class: 'muted', text: t('rh.financePlannedBody') })]));
  // MY OVERVIEW
  body.append(el('div', { class: 'ca-tiles ca-tiles--6' }, spec.tiles.map((k) => { const [v, lk, href, tone] = TILE[k](d); return el('a', { class: `ca-tile ca-tile--${tone}`, href }, [el('b', { text: typeof v === 'string' ? v : fmtNumber(Number(v || 0)) }), el('span', { text: t(lk) })]); })));
  // ATTENTION REQUIRED (role-filtered) + MY WORK QUEUE
  const allItems = (d.attention_items || []).filter((it) => spec.attention.includes(it.issue)); const items = allItems.slice(0, 6);
  const attn = el('div', { class: 'card ca-card' }, [el('div', { class: 'card__head' }, [el('h3', {}, [icon('shield', 16), el('span', { text: ' ' + t('hf.attentionShort') }), allItems.length ? el('span', { class: 'hf-count', text: String(allItems.length) }) : null]), el('a', { href: '#/reporting/dashboard', class: 'btn btn--quiet', text: allItems.length > 6 ? t('hf.viewAllN', { n: allItems.length }) : t('v.viewAll') })]),
    ...(items.length ? items.map((it) => el('a', { href: it.href, class: 'ca-attn' }, [el('span', { class: `vs-badge vs-badge--${PRI[it.priority] || 'grey'}`, text: t('hf.pr_' + it.priority) }), PERSON_ISSUES.includes(it.issue) && it.owner ? driveAvatarByName(it.owner) : null, el('div', { class: 'grow' }, [el('b', { text: t('hf.i_' + it.issue) }), el('div', { class: 'muted', text: [it.network, it.country, it.owner].filter(Boolean).join(' · ') + (it.deadline ? ' · ' + fmtDate(it.deadline) : '') })]), el('span', { class: 'btn btn--secondary', text: t('hf.a_' + it.issue) })])) : [el('p', { class: 'muted', text: spec.strategic ? t('rh.noCritical') : t('hf.attentionNone') })])]);
  const QH = { approvals: '#/recruitment', requests: '#/helpdesk', reports_review: '#/reporting/review', followups: '#/tasks?view=assigned', decisions: '#/reporting/issues', escalated: '#/reporting/review', due_today: '#/tasks', due_week: '#/tasks', overdue: '#/tasks?view=overdue', returned: '#/reporting/mine', verification: '#/tasks?view=assigned' };
  const queue = el('div', { class: 'card ca-card' }, [el('div', { class: 'card__head' }, [el('h3', {}, [icon('tasks', 16), el('span', { text: ' ' + t('hf.queue') })]), el('a', { href: '#/tasks', class: 'btn btn--quiet', text: t('v.viewAll') })]),
    ...spec.queue.map((k) => { const v = Number(d.queue?.[k] || 0); return el('a', { href: QH[k], class: 'ca-attn' }, [el('b', { class: `ca-attn__n ca-attn__n--${v ? (k === 'overdue' || k === 'escalated' ? 'red' : 'amber') : 'green'}`, text: String(v) }), el('span', { class: 'grow', text: t('hf.q_' + k) }), el('span', { class: 'muted', text: '\u203A' })]); })]);
  body.append(el('div', { class: 'ca-grid ca-grid--eq' }, [attn, queue]));
  // PERFORMANCE (networks compared) + RECENT ACTIVITY
  const N = d.networks || {}; const KEYS = [['countries', 'hf.nCountries'], ['leaders', 'hf.nLeaders'], ['active', 'hf.nActive'], ['members', 'hf.nMembers'], ['reports_compliance', 'hf.nCompliance'], ['activities', 'hf.nActivities']];
  const perf = el('div', { class: 'card ca-card' }, [el('div', { class: 'card__head' }, [el('h3', {}, [icon('chart', 16), el('span', { text: ' ' + t('rh.performance') })]), el('a', { href: '#/command', class: 'btn btn--quiet', text: t('v.viewAll') })]),
    el('div', { class: 'table-wrap' }, [el('table', { class: 'vs-table ca-table' }, [el('thead', {}, [el('tr', {}, [el('th', { text: t('hf.indicator') }), el('th', { text: 'WGMN' }), el('th', { text: 'WNNN' })])]),
      el('tbody', {}, KEYS.map(([k, lk]) => el('tr', {}, [el('td', { text: t(lk) }), el('td', { text: k === 'reports_compliance' ? `${N.WGMN?.[k] ?? 0}%` : fmtNumber(Number(N.WGMN?.[k] || 0)) }), el('td', { text: k === 'reports_compliance' ? `${N.WNNN?.[k] ?? 0}%` : fmtNumber(Number(N.WNNN?.[k] || 0)) })])))])])]);
  const recent = el('div', { class: 'card ca-card' }, [el('div', { class: 'card__head' }, [el('h3', {}, [icon('clip', 16), el('span', { text: ' ' + t('hf.recent') })])]),
    ...((d.recent || []).slice(0, 8).map((e) => el('div', { class: 'hf-recent' }, [el('small', { class: 'muted', text: e.at ? fmtDateTime(e.at) : '' }), el('div', {}, [el('b', { text: t('hf.k_' + e.kind) }), el('span', { class: 'muted', text: ` · ${e.who || ''}${e.where ? ' · ' + e.where : ''}${e.network ? ' (' + e.network + ')' : ''}` })])]))),
    !(d.recent || []).length ? el('p', { class: 'muted', text: t('hf.recentNone') }) : null]);
  body.append(el('div', { class: 'ca-grid ca-grid--eq' }, [perf, recent]));
  // QUICK ACTIONS
  body.append(el('div', { class: 'card ca-card' }, [el('div', { class: 'card__head' }, [el('h3', {}, [icon('check', 16), el('span', { text: ' ' + t('hf.quick') })])]),
    el('div', { class: 'hf-quick hf-quick--grid' }, spec.quick.map(([href, k]) => el('a', { href, class: 'btn btn--primary hf-quick__a' }, [icon('check', 16), el('span', { text: t(k) })])))]));
  return shell.teardown;
}
