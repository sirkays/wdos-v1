/* ---------------------------------------------------------------------------
 * Phase 211: structured reports with charts and plain-language explanations,
 * downloadable as PDF.
 *   kind 'wdos'  : WDOS operations report (volunteer leaders), ops_wdos_report()
 *   kind 'ref3'  : 3-Day Referral Activation report, hq_activation_stats('ref3')
 *   kind 'open7' : 7-Day Activation report, hq_activation_stats('open7')
 * Every figure comes from the database; the text under each chart is written
 * from the same numbers, so the explanation always matches the chart.
 * PDF: html2pdf (vendored in /vendor/html2pdf, no CDN), A4 portrait.
 * ------------------------------------------------------------------------- */
import { el, clear } from '../core/dom.js';
import { t, getLocale, fmtDate, fmtDateTime } from '../core/i18n.js';
import { opsWdosReport, hqActivationStats, hqActivationRegister, hqReferralForms } from '../core/db.js';
import { hbars, columns, stack, meter, COLORS, STATUS } from '../components/opscharts.js';
import { icon } from '../components/icons.js';

const L = () => (getLocale() === 'fr' ? 'fr' : 'en');
const n0 = (v) => Number(v || 0);
const pct = (a, b) => (n0(b) ? Math.round((100 * n0(a)) / n0(b)) : 0);
const num = (v) => n0(v).toLocaleString(getLocale());

/* The report's own wording (English / French), kept here so every sentence sits next to the numbers it uses. */
const TX = {
  en: {
    wdosTitle: 'WDOS Operations Report', wdosSub: 'Volunteer leaders: activity, engagement, tasks, reporting and communication',
    ref3Title: '3-Day Referral Activation Report', open7Title: '7-Day Activation Report',
    actSub: 'Every candidate from registration to appointment, day by day',
    period: 'Period', network: 'Network', allNetworks: 'WGMN and WNNN', generated: 'Generated', by: 'Prepared for', last: 'Last {n} days',
    contents: 'Contents', inPlainWords: 'In plain words', whatItMeans: 'What this means', definitions: 'How to read this report', page: 'Page',
    s_summary: 'Summary at a glance', s_leaders: 'Who our volunteer leaders are', s_engagement: 'How engaged leaders are', s_score: 'Activity score',
    s_activity: 'What leaders did in the period', s_onboarding: 'Leadership Pack onboarding', s_tasks: 'Tasks', s_reports: 'Monthly reporting',
    s_comms: 'Communication from HQ', s_meetings: 'Meetings and learning', s_countries: 'By country', s_top: 'Recognition: most active leaders',
    s_support: 'Leaders who need support', s_autopilot: 'Automatic actions (autopilot)',
    k_leaders: 'Volunteer leaders', k_active7: 'Active in the last 7 days', k_active30: 'Active in the last 30 days', k_never: 'Never signed in',
    k_score: 'Average activity score', k_onb: 'Onboarding complete', k_tasksOver: 'Tasks overdue', k_repOver: 'Reports overdue', k_new: 'Seated in the period',
    k_notAcc: 'Appointment not yet accepted',
    lv_headquarters: 'Seated on the HQ unit', lv_country: 'Country level', lv_state_region: 'State / Region', lv_district_lga: 'LGA / District', lv_community_cluster: 'Cluster / Ward', lv_chapter: 'Chapter',
    en_consistent: 'Consistent', en_active: 'Active', en_declining: 'Declining', en_at_risk: 'At risk', en_inactive: 'Inactive', en_under_reengagement: 'Being re-engaged', en_re_engaged: 'Re-engaged',
    b75: 'Strong (75 to 100)', b50: 'Fair (50 to 74)', b25: 'Weak (25 to 49)', b0: 'Very weak (below 25)',
    ev_signin: 'Signed in', ev_onboarding_step: 'Onboarding steps completed', ev_task_assigned: 'Tasks received', ev_task_completed: 'Tasks completed', ev_report_submitted: 'Reports submitted',
    ev_msg_from_hq: 'Messages received from HQ', ev_msg_read: 'HQ messages read', ev_msg_to_hq: 'Messages sent to HQ', ev_msg_to_leader: 'Messages to other leaders',
    ev_meeting_attended: 'Meetings attended', ev_hq_message_read: 'Weekly HQ messages read', ev_course_completed: 'Courses completed', ev_seated: 'Newly seated', ev_accepted: 'Appointments accepted',
    ap_inactive_checkin: 'Check-in to inactive leaders', ap_onboarding_nudge: 'Onboarding reminders', ap_overdue_task_reminder: 'Overdue task reminders', ap_overdue_escalation: 'Overdue tasks escalated to HQ', ap_weekly_digest: 'Weekly digest',
    c_country: 'Country', c_leaders: 'Leaders', c_active: 'Active 30 days', c_score: 'Avg score', c_tover: 'Tasks overdue', c_rover: 'Reports overdue', c_onb: 'Onboarding pending',
    c_name: 'Name', c_role: 'Role', c_lastSeen: 'Last seen', c_onbShort: 'Onboarding', never: 'never',
    p_summary: (d) => `There are ${num(d.l.total)} volunteer leaders in seats (${num(d.l.wgmn)} WGMN, ${num(d.l.wnnn)} WNNN). ${num(d.l.active7)} (${pct(d.l.active7, d.l.total)}%) used WDOS in the last 7 days and ${num(d.l.active30)} (${pct(d.l.active30, d.l.total)}%) in the last 30 days. ${num(d.l.never)} have never signed in at all, which is the single biggest gap. Only ${num(d.l.onboarding_complete)} have completed the Leadership Pack onboarding. The average activity score is ${num(d.l.avg_score)} out of 100.`,
    p_leaders: (d) => `Most leaders sit at ${d.topLevel}. ${num(d.l.new_in_period)} were seated during this period. ${num(d.l.not_accepted)} have not yet accepted their appointment in WDOS, so they may not know they are expected to act.`,
    p_engagement: (d) => `"Active" means the leader used WDOS in the last 7 days or took part in an engagement activity in the last 30. "Declining" means last seen 8 to 30 days ago, "at risk" 31 to 90 days, "inactive" more than 90 days or never. ${num(d.inactive)} leaders (${pct(d.inactive, d.l.total)}%) are inactive. The weekly chart shows how many different leaders did anything in WDOS each week.`,
    p_score: (d) => `Each leader gets a score out of 100: 25 points for being seen in the last 7 days (12 for the last 30), 20 for onboarding, 20 for keeping tasks on time, 20 for submitting due reports and 15 for reading HQ's messages. The last three only count once the leader has signed in at least once, so someone who has never used WDOS scores close to zero. ${num(d.weak)} leaders score below 50; they are listed at the end of this report.`,
    p_activity: (d) => d.totalEv ? `${num(d.totalEv)} recorded actions by ${num(d.activePeople)} different leaders. The most common was "${d.topKind}". Field activities (outreach, events) are not yet logged in WDOS, so they do not appear here.` : 'No leader activity was recorded in this period.',
    p_onboarding: (d) => `The Leadership Pack has ${num(d.steps)} required steps. The bars show how many leaders completed each one. The drop from the first step to the last shows where leaders stop.`,
    p_tasks: (d) => d.t.assigned || d.t.open ? `${num(d.t.assigned)} tasks were assigned to leaders in the period and ${num(d.t.completed)} completed (${pct(d.t.completed_on_time, d.t.completed)}% of those on time). ${num(d.t.open)} are open now, ${num(d.t.overdue)} of them overdue.` : 'No tasks have been assigned to volunteer leaders yet. Tasks can now be assigned from the Operations Centre to one leader, a group, or everyone.',
    p_reports: (d) => `${num(d.r.due)} monthly reports fell due in the period and ${num(d.r.submitted)} were submitted (${num(d.r.on_time)} on time, ${num(d.r.late)} late). ${num(d.r.overdue)} are overdue now. Reporting is the weakest part of the operation today.`,
    p_comms: (d) => d.c.hq_messages ? `HQ sent ${num(d.c.hq_messages)} direct messages to ${num(d.c.people)} leaders and ${pct(d.c.read, d.c.hq_messages)}% were read. Leaders replied ${num(d.c.replies)} times.` : 'HQ sent no direct messages to volunteer leaders in this period. The Operations Centre can now message one leader, a group, or all of them, with an email copy.',
    p_meetings: (d) => `${num(d.m.held)} meetings were held; leaders were recorded present ${num(d.m.attendances)} times. ${num(d.g.completed)} Institute courses were completed by ${num(d.g.people)} leaders.`,
    p_autopilot: (d) => d.ap.length ? 'Actions WDOS took on its own under the rules HQ switched on.' : 'No automatic rule was switched on in this period. Rules are listed in the Operations Centre under Autopilot.',
    defs: ['Figures come directly from the WDOS database at the moment the report was generated.', 'A volunteer leader is anyone holding an active leadership seat (Country Representative to Chapter Lead). Test and demo accounts are excluded.', '"Seen" is the last time the leader opened WDOS. "Signed in" counts new sign-in sessions.', 'Messages between two leaders are counted but never read by HQ; only messages between a leader and HQ are shown.'],
    // activation
    a_summary: 'Summary at a glance', a_forms: 'The referral forms', a_funnel: 'From registration to appointment', a_status: 'Where every candidate is now',
    a_days: 'Day by day', a_timing: 'How long things take', a_signups: 'Sign-ups, last 30 days', a_position: 'By position', a_country: 'By country', a_source: 'By referral source',
    a_comms: 'Messages to candidates', a_quality: 'Data quality', a_attention: 'Needs attention now', a_register: 'Candidate register',
    ak_reg: 'Registrations', ak_people: 'People', ak_started: 'Started', ak_inprog: 'In progress', ak_awaiting: 'Awaiting HQ review', ak_decided: 'Decided', ak_incomplete: 'Incomplete',
    ak_selected: 'Selected', ak_appointed: 'Appointed', ak_startRate: 'Started rate', ak_compRate: 'Completion rate',
    st_not_started: 'Not started', st_in_progress: 'In progress', st_awaiting_review: 'Awaiting review', st_decided: 'Decided', st_incomplete: 'Incomplete',
    f_registered: 'Registered', f_started: 'Started', f_day: 'Completed day {n}', f_assessment: 'Assessment submitted', f_reviewed: 'Reviewed by HQ', f_selected: 'Selected', f_appointed: 'Appointed',
    ap_summary: (d) => d.T.registrations ? `${num(d.T.registrations)} registrations from ${num(d.T.people)} different people. ${num(d.started)} started the journey (${num(d.T.started_rate)}%) and ${num(d.T.completed)} submitted the final assessment (${num(d.T.completion_rate)}%). ${num(d.T.incomplete)} ran out of time${d.T.incomplete_never_started ? `, ${num(d.T.incomplete_never_started)} of them without ever opening Day 1` : ''}. ${num(d.T.selected)} have been selected and ${num(d.T.appointed)} appointed.` : 'No one has registered on this route yet.',
    ap_funnel: (d) => d.biggest ? `The biggest loss is between "${d.biggest.from}" and "${d.biggest.to}": ${num(d.biggest.lost)} candidates. That is where support will make the most difference.` : 'Each bar is the number of candidates who reached that point.',
    ap_status: () => '"Incomplete" means the time window closed before the assessment was submitted. "Awaiting review" means the candidate has finished and HQ must decide.',
    ap_days: () => '"Opened" counts candidates who did anything on that day; "done" counts those who finished it. A day with many openings and few completions is too long or unclear.',
    ap_timing: (d) => (d.TM.median_hours_to_start != null ? `Half of the candidates started within ${d.TM.median_hours_to_start} hours of registering. ` : 'No candidate has started yet. ') + (d.TM.median_hours_to_submit != null ? `Half submitted the assessment within ${d.TM.median_hours_to_submit} hours.` : 'No assessment has been submitted yet.'),
    ap_comms: (d) => `${num(d.C.sends)} automatic emails were sent to ${num(d.C.people_reached)} people. Reminders repeat once a day until the candidate acts. ${num(d.C.rejected)} were refused by the mailer.`,
    ap_quality: (d) => `${num(d.T.duplicates)} people registered more than once, ${num(d.T.email_problems)} emails look mistyped, and ${num(d.T.test_excluded)} test records are left out of every figure.`,
    adefs: ['"Started" means real activity on Day 1 (time spent, answers or acknowledgements), not just an account.', '"Completed" means the final assessment was submitted.', 'People are counted once even if they registered twice (same name or phone).', 'Test records are excluded.'],
    c_pos: 'Position', c_net: 'Network', c_reg: 'Registered', c_started: 'Started', c_done: 'Completed', c_inc: 'Incomplete', c_sel: 'Selected', c_src: 'Source', c_ref: 'Referrer',
    c_day: 'Day', c_title: 'Title', c_opened: 'Opened', c_min: 'Median minutes', c_place: 'Place', c_stage: 'Stage', c_kind: 'Why', c_detail: 'Detail',
    src_focal_person: 'Focal person', src_volunteer_leader: 'Existing leader', src_individual: 'Individual', src_other: 'Other', src_unknown: 'Not stated',
    k_expiring: 'Window closing', k_never_started: 'Never started', k_stuck: 'Stalled', k_awaiting_review: 'Awaiting review', k_email_problem: 'Email problem', k_duplicate: 'Duplicate',
    none: 'Nothing to show for this period.',
  },
  fr: {},
};
/* French: the same keys; missing ones fall back to English */
Object.assign(TX.fr, {
  wdosTitle: 'Rapport des opérations WDOS', wdosSub: 'Responsables bénévoles : activité, engagement, tâches, rapports et communication',
  ref3Title: 'Rapport de l’Activation par recommandation (3 jours)', open7Title: 'Rapport de l’Activation ouverte (7 jours)', actSub: 'Chaque candidate de l’inscription à la nomination, jour par jour',
  period: 'Période', network: 'Réseau', allNetworks: 'WGMN et WNNN', generated: 'Généré le', by: 'Préparé pour', last: '{n} derniers jours',
  contents: 'Sommaire', inPlainWords: 'En clair', whatItMeans: 'Ce que cela signifie', definitions: 'Comment lire ce rapport', page: 'Page',
  s_summary: 'Vue d’ensemble', s_leaders: 'Qui sont nos responsables', s_engagement: 'Niveau d’engagement', s_score: 'Score d’activité', s_activity: 'Ce que les responsables ont fait',
  s_onboarding: 'Intégration du Pack Leadership', s_tasks: 'Tâches', s_reports: 'Rapports mensuels', s_comms: 'Communication du siège', s_meetings: 'Réunions et formation',
  s_countries: 'Par pays', s_top: 'Reconnaissance : responsables les plus actives', s_support: 'Responsables à accompagner', s_autopilot: 'Actions automatiques (pilote automatique)',
  k_leaders: 'Responsables bénévoles', k_active7: 'Actives ces 7 jours', k_active30: 'Actives ces 30 jours', k_never: 'Jamais connectées', k_score: 'Score d’activité moyen',
  k_onb: 'Intégration terminée', k_tasksOver: 'Tâches en retard', k_repOver: 'Rapports en retard', k_new: 'Nommées sur la période', k_notAcc: 'Nomination non acceptée',
  c_country: 'Pays', c_leaders: 'Responsables', c_active: 'Actives 30 j', c_score: 'Score moyen', c_tover: 'Tâches en retard', c_rover: 'Rapports en retard', c_onb: 'Intégration en attente',
  c_name: 'Nom', c_role: 'Rôle', c_lastSeen: 'Vue la dernière fois', c_onbShort: 'Intégration', never: 'jamais', none: 'Rien à afficher pour cette période.',
  a_summary: 'Vue d’ensemble', a_funnel: 'De l’inscription à la nomination', a_status: 'Où en est chaque candidate', a_days: 'Jour par jour', a_timing: 'Délais', a_register: 'Registre des candidates',
});
const tx = (k) => (TX[L()][k] ?? TX.en[k]);

/* ------------------------------------------------------------------------ */
export async function buildReport(kind, { days = 30, net = null, forName = '' } = {}) {
  if (kind === 'wdos') return buildWdos(await opsWdosReport(net, days), { days, net, forName });
  const [S, forms, reg] = await Promise.all([hqActivationStats(kind, false), kind === 'ref3' ? hqReferralForms().catch(() => []) : Promise.resolve([]),
    hqActivationRegister({ route: kind, limit: 500 }).catch(() => ({ rows: [] }))]);
  return buildActivation(kind, S, forms, reg, { forName });
}

/* shared pieces ------------------------------------------------------------ */
function cover(title, sub, meta) {
  return el('header', { class: 'rp-cover' }, [
    el('div', { class: 'rp-cover__brand' }, [el('img', { src: '/assets/woddi-logo.png', alt: 'WODDI', class: 'rp-cover__logo' }), el('span', { text: 'WODDI Digital Operating System' })]),
    el('h1', { text: title }), el('p', { class: 'rp-cover__sub', text: sub }),
    el('dl', { class: 'rp-cover__meta' }, meta.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]))]);
}
function section(no, title, chart, text, extra) {
  return el('section', { class: 'rp-sec' }, [el('h2', {}, [el('span', { class: 'rp-no', text: String(no) }), title]),
    chart ? el('div', { class: 'rp-chart' }, [chart]) : null,
    text ? el('div', { class: 'rp-explain' }, [el('b', {}, [icon('lightbulb', 13), ' ' + tx('whatItMeans')]), el('p', { text: text })]) : null,
    extra || null]);
}
function kpis(items) { return el('div', { class: 'rp-kpis' }, items.map(([label, value, tone]) => el('div', { class: `rp-kpi ${tone ? 'rp-kpi--' + tone : ''}` }, [el('b', { text: String(value) }), el('span', { text: label })]))); }
function table(head, rows) { return rows.length ? el('table', { class: 'rp-table' }, [el('thead', {}, [el('tr', {}, head.map((h) => el('th', { text: h })))]), el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c) => el('td', { text: c == null ? '—' : String(c) })))))]) : el('p', { class: 'muted', text: tx('none') }); }
function defs(list) { return el('section', { class: 'rp-sec rp-defs' }, [el('h2', { text: tx('definitions') }), el('ul', {}, list.map((x) => el('li', { text: x })))]); }
const wk = (d) => { const x = new Date(d); return x.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' }); };

/* WDOS operations ------------------------------------------------------------ */
function buildWdos(R, { days, net, forName }) {
  const l = R.leaders || {}; const T = R.tasks || {}; const Rp = R.reports || {}; const C = R.communications || {}; const M = R.meetings || {}; const G = R.learning || {};
  const levels = (R.by_level || []).map((x) => ({ label: tx('lv_' + x.level) || x.level, value: x.n, sub: `${x.active30} active in 30 days` }));
  const top = [...(R.by_level || [])].sort((a, b) => b.n - a.n)[0];
  const eng = R.engagement || []; const engN = (k) => n0((eng.find((x) => x.k === k) || {}).n);
  const EC = { consistent: STATUS.good, active: '#5e8a11', re_engaged: '#7cb518', under_reengagement: '#8a8a94', declining: STATUS.warn, at_risk: STATUS.serious, inactive: STATUS.critical };
  const kinds = R.activity_by_kind || []; const totalEv = kinds.reduce((a, k) => a + n0(k.n), 0);
  const activePeople = Math.max(0, ...(R.weekly_active || []).map((w) => n0(w.people)));
  const B = R.score_bands || {};
  const d = { l, T, t: T, r: Rp, c: C, m: M, g: G, topLevel: top ? (tx('lv_' + top.level) || top.level).toLowerCase() : '—', inactive: engN('inactive'), weak: n0(B.b0) + n0(B.b25), totalEv, activePeople, topKind: kinds[0] ? tx('ev_' + kinds[0].kind) : '', steps: (R.onboarding_steps || []).length, ap: R.autopilot || [] };
  const doc = el('article', { class: 'rp-doc' });
  doc.append(cover(tx('wdosTitle'), tx('wdosSub'), [[tx('period'), `${tx('last').replace('{n}', days)} (${fmtDate(R.from)} to ${fmtDate(R.as_of)})`], [tx('network'), R.net === 'ALL' ? tx('allNetworks') : R.net], [tx('generated'), fmtDateTime(R.as_of)], forName ? [tx('by'), forName] : null].filter(Boolean)));
  doc.append(section(1, tx('s_summary'), kpis([[tx('k_leaders'), num(l.total)], [tx('k_active7'), `${num(l.active7)} (${pct(l.active7, l.total)}%)`, 'green'], [tx('k_active30'), `${num(l.active30)} (${pct(l.active30, l.total)}%)`], [tx('k_never'), num(l.never), 'red'],
    [tx('k_score'), `${num(l.avg_score)}/100`, 'magenta'], [tx('k_onb'), `${num(l.onboarding_complete)} (${pct(l.onboarding_complete, l.total)}%)`, 'amber'], [tx('k_tasksOver'), num(T.overdue), T.overdue ? 'red' : ''], [tx('k_repOver'), num(Rp.overdue), Rp.overdue ? 'red' : '']]), tx('p_summary')(d)));
  doc.append(section(2, tx('s_leaders'), hbars(levels), tx('p_leaders')(d), kpis([[tx('k_new'), num(l.new_in_period)], [tx('k_notAcc'), num(l.not_accepted), l.not_accepted ? 'amber' : ''], ['WGMN', num(l.wgmn), 'magenta'], ['WNNN', num(l.wnnn), 'green']])));
  doc.append(section(3, tx('s_engagement'), el('div', {}, [stack(eng.map((x) => ({ label: tx('en_' + x.k) || x.k, value: x.n, color: EC[x.k] || '#8a8a94' }))),
    el('h4', { class: 'rp-h4', text: L() === 'fr' ? 'Responsables actives chaque semaine' : 'Different leaders active each week' }), columns((R.weekly_active || []).map((w) => ({ label: wk(w.week), value: w.people })))]), tx('p_engagement')(d)));
  doc.append(section(4, tx('s_score'), stack([{ label: tx('b75'), value: B.b75, color: STATUS.good }, { label: tx('b50'), value: B.b50, color: '#7cb518' }, { label: tx('b25'), value: B.b25, color: STATUS.warn }, { label: tx('b0'), value: B.b0, color: STATUS.critical }]), tx('p_score')(d)));
  doc.append(section(5, tx('s_activity'), kinds.length ? hbars(kinds.map((k) => ({ label: tx('ev_' + k.kind) || k.kind, value: k.n, sub: `${k.people} leaders` })), { labelW: 210 }) : null, tx('p_activity')(d)));
  doc.append(section(6, tx('s_onboarding'), hbars((R.onboarding_steps || []).map((s2, i) => ({ label: `${i + 1}. ${s2.title}`, value: s2.done })), { max: Math.max(1, n0(l.total)), labelW: 230, color: COLORS.second }), tx('p_onboarding')(d)));
  doc.append(section(7, tx('s_tasks'), el('div', { class: 'rp-meters' }, [meter(L() === 'fr' ? 'Terminées à temps' : 'Completed on time', pct(T.completed_on_time, T.completed)), meter(L() === 'fr' ? 'Ouvertes en retard' : 'Open tasks overdue', pct(T.overdue, T.open))]), tx('p_tasks')(d),
    kpis([[L() === 'fr' ? 'Attribuées' : 'Assigned', num(T.assigned)], [L() === 'fr' ? 'Terminées' : 'Completed', num(T.completed), 'green'], [L() === 'fr' ? 'Ouvertes' : 'Open', num(T.open)], [tx('k_tasksOver'), num(T.overdue), T.overdue ? 'red' : '']])));
  doc.append(section(8, tx('s_reports'), el('div', { class: 'rp-meters' }, [meter(L() === 'fr' ? 'Rapports dus soumis' : 'Due reports submitted', pct(Rp.submitted, Rp.due)), meter(L() === 'fr' ? 'Soumis à temps' : 'Submitted on time', pct(Rp.on_time, Rp.submitted))]), tx('p_reports')(d),
    kpis([[L() === 'fr' ? 'Dus' : 'Due', num(Rp.due)], [L() === 'fr' ? 'Soumis' : 'Submitted', num(Rp.submitted), 'green'], [L() === 'fr' ? 'En retard' : 'Late', num(Rp.late), 'amber'], [tx('k_repOver'), num(Rp.overdue), 'red'], [L() === 'fr' ? 'Renvoyés' : 'Returned', num(Rp.returned)], [L() === 'fr' ? 'Approuvés' : 'Approved', num(Rp.approved), 'green']])));
  doc.append(section(9, tx('s_comms'), el('div', { class: 'rp-meters' }, [meter(L() === 'fr' ? 'Messages du siège lus' : 'HQ messages read', pct(C.read, C.hq_messages))]), tx('p_comms')(d),
    kpis([[L() === 'fr' ? 'Messages directs' : 'Direct messages', num(C.hq_messages)], [L() === 'fr' ? 'Lus' : 'Read', num(C.read), 'green'], [L() === 'fr' ? 'Réponses' : 'Replies', num(C.replies)], [L() === 'fr' ? 'Envois groupés' : 'Group sends', num(C.batches)], [L() === 'fr' ? 'Messages hebdo lus' : 'Weekly messages read', num(C.weekly_hq_reads)]])));
  doc.append(section(10, tx('s_meetings'), kpis([[L() === 'fr' ? 'Réunions tenues' : 'Meetings held', num(M.held)], [L() === 'fr' ? 'Présences' : 'Attendances', num(M.attendances)], [L() === 'fr' ? 'Cours commencés' : 'Courses started', num(G.enrolled)], [L() === 'fr' ? 'Cours terminés' : 'Courses completed', num(G.completed), 'green']]), tx('p_meetings')(d)));
  doc.append(section(11, tx('s_countries'), table([tx('c_country'), tx('c_leaders'), tx('c_active'), tx('c_score'), tx('c_tover'), tx('c_rover'), tx('c_onb')], (R.countries || []).map((c) => [c.country, c.leaders, c.active30, c.avg_score, c.tasks_overdue, c.reports_overdue, c.onboarding_pending])), null));
  doc.append(section(12, tx('s_top'), table([tx('c_name'), tx('c_role'), tx('c_country'), tx('c_score')], (R.top || []).map((x) => [x.name, x.role, x.country, x.score])), null));
  doc.append(section(13, tx('s_support'), table([tx('c_name'), tx('c_role'), tx('c_country'), tx('c_score'), tx('c_lastSeen'), tx('c_onbShort'), tx('c_tover')], (R.support || []).map((x) => [x.name, x.role, x.country, x.score, x.last_seen_at ? fmtDate(x.last_seen_at) : tx('never'), x.onboarding, x.tasks_overdue])), null));
  doc.append(section(14, tx('s_autopilot'), (R.autopilot || []).length ? hbars(R.autopilot.map((a) => ({ label: tx('ap_' + a.rule) || a.rule, value: a.n })), { labelW: 230 }) : null, tx('p_autopilot')(d)));
  doc.append(defs(tx('defs')));
  return { doc, filename: `WDOS-Operations-Report-${new Date().toISOString().slice(0, 10)}.pdf` };
}

/* Activation (3-Day / 7-Day) --------------------------------------------------- */
function buildActivation(kind, S, forms, reg, { forName }) {
  const T = S.totals || {}; const TM = S.timing || {}; const C = S.comms || {};
  const F = (S.funnel || []).map((f) => ({ label: f.key === 'registered' ? tx('f_registered') : f.key === 'started' ? tx('f_started') : f.day ? tx('f_day').replace('{n}', f.day) : tx('f_' + f.key), value: f.n }));
  let biggest = null; for (let i = 1; i < F.length; i += 1) { const lost = n0(F[i - 1].value) - n0(F[i].value); if (lost > 0 && (!biggest || lost > biggest.lost)) biggest = { from: F[i - 1].label, to: F[i].label, lost }; }
  const started = (S.funnel || []).find((f) => f.key === 'started')?.n ?? 0;
  const d = { T, TM, C, started, biggest };
  const doc = el('article', { class: 'rp-doc' });
  doc.append(cover(kind === 'ref3' ? tx('ref3Title') : tx('open7Title'), tx('actSub'), [[tx('network'), tx('allNetworks')], [tx('generated'), fmtDateTime(S.as_of)], forName ? [tx('by'), forName] : null].filter(Boolean)));
  let no = 1;
  doc.append(section(no++, tx('a_summary'), kpis([[tx('ak_reg'), num(T.registrations)], [tx('ak_people'), num(T.people)], [tx('ak_started'), `${num(started)} (${num(T.started_rate)}%)`, 'green'], [tx('ak_inprog'), num(T.in_progress), 'amber'],
    [tx('ak_awaiting'), num(T.awaiting_review), 'magenta'], [tx('ak_incomplete'), num(T.incomplete), 'red'], [tx('ak_selected'), num(T.selected), 'green'], [tx('ak_appointed'), num(T.appointed), 'green']]), tx('ap_summary')(d)));
  if (kind === 'ref3' && forms.length) doc.append(section(no++, tx('a_forms'), table(['Form', L() === 'fr' ? 'Visites' : 'Visits', L() === 'fr' ? '7 jours' : 'Last 7 days', tx('c_reg'), tx('c_started'), tx('c_done')], forms.map((f) => [f.code, f.visits, f.visits_7d, f.registrations, f.started, f.completed])),
    L() === 'fr' ? 'Le taux de conversion (inscriptions / visites) montre si le formulaire convainc.' : `Conversion from visit to registration: ${forms.map((f) => `${f.code} ${pct(f.registrations, f.visits)}%`).join(', ')}. A low figure means people open the link but do not finish the form.`));
  doc.append(section(no++, tx('a_funnel'), hbars(F, { max: Math.max(1, n0(F[0]?.value)), labelW: 200 }), tx('ap_funnel')(d)));
  doc.append(section(no++, tx('a_status'), stack([{ label: tx('st_not_started'), value: T.not_started, color: '#8a8a94' }, { label: tx('st_in_progress'), value: T.in_progress, color: STATUS.warn }, { label: tx('st_awaiting_review'), value: T.awaiting_review, color: COLORS.primary }, { label: tx('st_decided'), value: T.decided, color: STATUS.good }, { label: tx('st_incomplete'), value: T.incomplete, color: STATUS.critical }]), tx('ap_status')(d)));
  doc.append(section(no++, tx('a_days'), hbars((S.by_day || []).map((x) => ({ label: `${tx('c_day')} ${x.day}`, value: x.completed, sub: `${x.opened} opened` })), { max: Math.max(1, ...(S.by_day || []).map((x) => n0(x.opened))), labelW: 90, color: COLORS.second }), tx('ap_days')(d),
    table([tx('c_day'), tx('c_title'), tx('c_opened'), tx('c_done'), tx('c_min')], (S.by_day || []).map((x) => [x.day, x.title, x.opened, x.completed, x.median_minutes]))));
  doc.append(section(no++, tx('a_timing'), kpis([[L() === 'fr' ? 'Inscription à la première activité' : 'Sign-up to first activity', TM.median_hours_to_start != null ? `${TM.median_hours_to_start} h` : '—'], [L() === 'fr' ? 'Inscription à l’évaluation' : 'Sign-up to assessment', TM.median_hours_to_submit != null ? `${TM.median_hours_to_submit} h` : '—'], [L() === 'fr' ? 'À temps' : 'On time', num(TM.on_time), 'green'], [L() === 'fr' ? 'En retard' : 'Late', num(TM.late), TM.late ? 'red' : '']]), tx('ap_timing')(d)));
  const today = new Date(); const map = new Map((S.signups || []).map((p) => [p.d, n0(p.n)]));
  const series = Array.from({ length: 30 }, (_, i) => { const x = new Date(today); x.setDate(today.getDate() - (29 - i)); const k = x.toISOString().slice(0, 10); return { label: k.slice(5), value: map.get(k) || 0 }; });
  doc.append(section(no++, tx('a_signups'), columns(series), null));
  doc.append(section(no++, tx('a_position'), table([tx('c_pos'), tx('c_net'), tx('c_reg'), tx('c_started'), tx('c_done'), tx('c_inc'), tx('c_sel')], (S.by_position || []).map((x) => [x.position, x.network, x.n, x.started, x.completed, x.incomplete, x.selected])), null));
  doc.append(section(no++, tx('a_country'), (S.by_country || []).length ? hbars((S.by_country || []).map((x) => ({ label: x.country, value: x.n, sub: `${x.people} people` }))) : null, null,
    table([tx('c_country'), tx('c_reg'), tx('ak_people'), tx('st_in_progress'), tx('c_done'), tx('c_inc'), tx('c_sel')], (S.by_country || []).map((x) => [x.country, x.n, x.people, x.in_progress, x.completed, x.incomplete, x.selected]))));
  doc.append(section(no++, tx('a_source'), table([tx('c_src'), tx('c_ref'), tx('c_reg'), tx('c_started'), tx('c_done'), tx('c_sel')], (S.by_source || []).map((x) => [tx('src_' + x.category) || x.category, x.referrer, x.n, x.started, x.completed, x.selected])), null));
  doc.append(section(no++, tx('a_comms'), (C.by_trigger || []).length ? hbars(C.by_trigger.map((x) => ({ label: t('hqa.tr_' + x.trigger), value: x.sends, sub: `${x.people} people` })), { labelW: 200 }) : null, tx('ap_comms')(d)));
  doc.append(section(no++, tx('a_quality'), null, tx('ap_quality')(d), (S.duplicates || []).length ? table([tx('c_name'), 'Emails'], S.duplicates.map((x) => [x.name, (x.emails || []).join(', ')])) : null));
  doc.append(section(no++, tx('a_attention'), table([tx('c_name'), tx('c_kind'), tx('c_pos'), tx('c_place'), tx('c_detail')], (S.attention || []).map((a) => [a.name, tx('k_' + a.kind) || a.kind, a.position, a.place, a.detail])), null));
  doc.append(section(no++, tx('a_register'), table([tx('c_name'), tx('c_pos'), tx('c_place'), tx('c_net'), tx('c_stage'), tx('c_day')], (reg.rows || []).map((c) => [c.name, c.position, c.position_place || c.country, c.network, tx('st_' + c.stage) || c.stage, `${c.day}/${c.days_total}`])), null));
  doc.append(defs(tx('adefs')));
  return { doc, filename: `WDOS-${kind === 'ref3' ? '3-Day' : '7-Day'}-Activation-Report-${new Date().toISOString().slice(0, 10)}.pdf` };
}

/* ------------------------------------------------------------------------ */
let h2pLoading = null;
function loadHtml2Pdf() {
  if (window.html2pdf) return Promise.resolve(window.html2pdf);
  if (!h2pLoading) h2pLoading = new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = '/vendor/html2pdf/html2pdf.bundle.min.js'; sc.onload = () => ok(window.html2pdf); sc.onerror = () => { h2pLoading = null; no(new Error('PDF engine did not load')); }; document.head.append(sc); });
  return h2pLoading;
}
/* Renders the report element into an A4 PDF and downloads it. */
export async function downloadPdf(doc, filename) {
  const h2p = await loadHtml2Pdf();
  const holder = el('div', { class: 'rp-print-holder' }); const clone = doc.cloneNode(true); clone.classList.add('rp-doc--pdf'); holder.append(clone); document.body.append(holder);
  try {
    await h2p().set({ margin: [10, 10, 12, 10], filename, image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 820 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'], avoid: ['.rp-kpis', '.rp-chart', '.rp-explain', 'tr', 'h2'] } })
      .from(clone).toPdf().get('pdf').then((pdf) => {
        const n = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= n; i += 1) { pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(120); pdf.text(`WODDI · WDOS · ${filename.replace(/\.pdf$/, '')}`, 10, 290); pdf.text(`${tx('page')} ${i} / ${n}`, 200, 290, { align: 'right' }); }
      }).save();
  } finally { holder.remove(); }
}

/* Mounts the report builder UI (used by the Operations Centre Reports tab and the Activation page). */
export function reportBuilder(target, { initial = 'wdos', forName = '' } = {}) {
  clear(target);
  const kind = el('select', { class: 'select' }, [['wdos', tx('wdosTitle')], ['ref3', tx('ref3Title')], ['open7', tx('open7Title')]].map(([v, l]) => el('option', { value: v, text: l, selected: v === initial || null })));
  const period = el('select', { class: 'select' }, [7, 30, 90, 180].map((dd) => el('option', { value: dd, text: tx('last').replace('{n}', dd), selected: dd === 30 || null })));
  const netSel = el('select', { class: 'select' }, [['', tx('allNetworks')], ['WGMN', 'WGMN'], ['WNNN', 'WNNN']].map(([v, l]) => el('option', { value: v, text: l })));
  const go = el('button', { class: 'btn btn--primary' }, [icon('chart-column', 14), ' ', t('ops.rpGenerate')]);
  const pdfBtn = el('button', { class: 'btn btn--secondary', disabled: true }, [icon('file-pdf', 14), ' ', t('ops.rpPdf')]);
  const printBtn = el('button', { class: 'btn btn--quiet', disabled: true }, [icon('print', 14), ' ', t('ops.rpPrint')]);
  const status = el('span', { class: 'muted' }); const view = el('div', { class: 'rp-view' });
  const sync = () => { period.disabled = kind.value !== 'wdos'; netSel.disabled = kind.value !== 'wdos'; };
  kind.addEventListener('change', sync); sync();
  let current = null;
  go.addEventListener('click', async () => {
    go.disabled = true; status.textContent = t('ops.rpBuilding'); clear(view);
    try { current = await buildReport(kind.value, { days: Number(period.value), net: netSel.value || null, forName }); view.append(current.doc); pdfBtn.disabled = false; printBtn.disabled = false; status.textContent = ''; }
    catch (e) { status.textContent = e?.message || t('errors.load'); }
    go.disabled = false;
  });
  pdfBtn.addEventListener('click', async () => { if (!current) return; pdfBtn.disabled = true; status.textContent = t('ops.rpMaking'); try { await downloadPdf(current.doc, current.filename); status.textContent = t('ops.rpDone'); } catch (e) { status.textContent = e?.message || 'PDF failed'; } pdfBtn.disabled = false; });
  printBtn.addEventListener('click', () => { document.body.classList.add('rp-printing'); window.print(); setTimeout(() => document.body.classList.remove('rp-printing'), 500); });
  target.append(el('div', { class: 'rp-bar' }, [kind, period, netSel, go, pdfBtn, printBtn, status]), el('p', { class: 'muted', text: t('ops.rpIntro') }), view);
  return { generate: () => go.click() };
}
