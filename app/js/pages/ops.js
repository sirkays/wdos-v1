/* ---------------------------------------------------------------------------
 * Phase 211: OPERATIONS CENTRE (#/ops/:tab), the Head of Field & Country
 * Operations' working screen. She interfaces with every volunteer leader:
 *   overview  : the state of the whole leadership in one screen
 *   leaders   : every seated leader, her activity and score; select one, some
 *               or all and message them or assign a task; open a leader for her
 *               full record and timeline
 *   activity  : what leaders did, day by day
 *   messages  : message leaders (in-app + push, optional email copy); history
 *               with read counts
 *   tasks     : assign tasks to leaders; progress of every HQ task batch
 *   reports   : structured PDF reports (WDOS operations, 3-Day, 7-Day)
 *   autopilot : self-governing rules WDOS runs every morning, with a preview
 * All data comes from ops_* RPCs, which refuse anyone who is not HQ.
 * ------------------------------------------------------------------------- */
import { el, clear, debounce } from '../core/dom.js';
import { t, fmtDate, fmtDateTime } from '../core/i18n.js';
import { opsLeaders, opsLeaderDetail, opsActivityFeed, opsSendMessage, opsMessageHistory, opsMessageBatch, opsAssignTask, opsTaskBatches,
  opsAutopilotState, opsAutopilotSet, avatarUrl } from '../core/db.js';
import { renderShell } from '../components/layout.js';
import { icon } from '../components/icons.js';
import { toast, toastError } from '../components/toast.js';
import { hbars, columns, stack, meter, STATUS, COLORS } from '../components/opscharts.js';
import { reportBuilder } from './opsreport.js';

const TABS = [['overview', 'gauge-high'], ['leaders', 'people-group'], ['activity', 'wave-square'], ['messages', 'paper-plane'], ['tasks', 'list-check'], ['reports', 'file-pdf'], ['autopilot', 'robot']];
const STATUSES = ['active7', 'inactive30', 'never', 'onboarding_pending', 'overdue_tasks', 'reports_overdue', 'unread_hq', 'not_accepted', 'low_score'];
const LEVELS = ['headquarters', 'country', 'state_region', 'district_lga', 'community_cluster', 'chapter'];
const n0 = (v) => Number(v || 0);
const pct = (a, b) => (n0(b) ? Math.round((100 * n0(a)) / n0(b)) : 0);
const ago = (iso) => { if (!iso) return t('ops.never'); const d = (Date.now() - new Date(iso).getTime()) / 86400000; if (d < 1) return t('ops.today'); if (d < 2) return t('ops.yesterday'); return t('ops.daysAgo', { n: Math.floor(d) }); };
const scoreTone = (s) => (s >= 75 ? 'good' : s >= 50 ? 'fair' : s >= 25 ? 'weak' : 'poor');

/* shared filter state (kept while switching tabs) */
const F = { net: '', country: '', level: '', status: '', q: '', sort: 'score', days: 30, offset: 0 };
const SEL = new Set();

export async function render(root, params, ctx) {
  const shell = renderShell(root, { profile: ctx.profile, modules: ctx.modules, titleKey: 'ops.title' });
  const out = shell.outlet; clear(out);
  // HQ only. The database refuses everyone else anyway; this says so plainly instead of showing an empty frame.
  if (ctx.hq === false) {
    out.append(el('div', { class: 'card ops-card' }, [el('h3', {}, [icon('lock', 16), ' ', t('ops.hqOnly')]), el('p', { class: 'muted', text: t('ops.hqOnlyBody') }), el('a', { class: 'btn btn--primary', href: '#/' }, [t('ops.goHome')])]));
    return shell.teardown;
  }
  const tab = TABS.some(([k]) => k === params?.tab) ? params.tab : 'overview';
  const qs = new URLSearchParams((location.hash.split('?')[1]) || '');
  for (const k of ['net', 'country', 'level', 'status', 'q']) if (qs.has(k)) F[k] = qs.get(k) || '';
  out.append(el('div', { class: 'ops-head' }, [
    el('div', {}, [el('h2', {}, [icon('tower-broadcast', 20), ' ', t('ops.title')]), el('p', { class: 'muted', text: t('ops.subtitle') })]),
    el('div', { class: 'ops-head__net' }, ['', 'WGMN', 'WNNN'].map((n) => el('button', { class: `ops-pill ${F.net === n ? 'is-on' : ''}`, text: n || t('ops.allNetworks'),
      onclick: () => { F.net = n; F.offset = 0; render(root, params, ctx); } })))]));
  out.append(el('nav', { class: 'ops-tabs', 'aria-label': t('ops.title') }, TABS.map(([k, ic]) => el('a', { href: `#/ops/${k}`, class: `ops-tab ${k === tab ? 'is-on' : ''}`, 'aria-current': k === tab ? 'page' : null }, [icon(ic, 15), el('span', { text: t('ops.t_' + k) })]))));
  const body = el('div', { class: 'ops-body' }); out.append(body);
  const loading = () => { clear(body); body.append(el('div', { class: 'state' }, [el('div', { class: 'spinner' })])); };
  const fail = (e) => { clear(body); body.append(el('div', { class: 'card' }, [el('h3', { text: t('errors.loadTitle') }), el('p', { class: 'muted', text: String(e?.message || e).slice(0, 240) })])); };
  const go = (href) => { location.hash = href; };
  const me = ctx.profile;
  loading();
  try {
    if (tab === 'overview') await overview();
    else if (tab === 'leaders') await leaders();
    else if (tab === 'activity') await activity();
    else if (tab === 'messages') await messages();
    else if (tab === 'tasks') await tasks();
    else if (tab === 'reports') { clear(body); const box = el('div', { class: 'card ops-card' }); body.append(box); const rb = reportBuilder(box, { initial: qs.get('kind') || 'wdos', forName: `${me.first_name || ''} ${me.last_name || ''}`.trim() }); if (qs.get('kind')) rb.generate(); }
    else if (tab === 'autopilot') await autopilot();
  } catch (e) { fail(e); }
  return shell.teardown;

  /* ======================= OVERVIEW ======================= */
  async function overview() {
    const [R, A] = await Promise.all([opsLeaders({ net: F.net, days: F.days, limit: 8, sort: 'score_asc' }), opsActivityFeed({ net: F.net, days: 14, limit: 12 })]);
    const T = R.totals || {}; clear(body);
    const kpi = (ic, label, value, sub, tone, status) => el('a', { class: `ops-kpi ops-kpi--${tone || 'plain'}`, href: status ? `#/ops/leaders?status=${status}` : '#/ops/leaders' },
      [el('span', { class: 'ops-kpi__ic' }, [icon(ic, 16)]), el('b', { text: String(value) }), el('span', { class: 'ops-kpi__l', text: label }), sub ? el('small', { class: 'muted', text: sub }) : null]);
    body.append(el('div', { class: 'ops-kpis' }, [
      kpi('people-group', t('ops.k_leaders'), n0(T.leaders), `${n0(T.wgmn)} WGMN · ${n0(T.wnnn)} WNNN`, 'magenta'),
      kpi('bolt', t('ops.k_active7'), n0(T.active7), `${pct(T.active7, T.leaders)}%`, 'green', 'active7'),
      kpi('moon', t('ops.k_inactive30'), n0(T.inactive30), `${pct(T.inactive30, T.leaders)}%`, 'amber', 'inactive30'),
      kpi('user-slash', t('ops.k_never'), n0(T.never), t('ops.k_neverSub'), 'red', 'never'),
      kpi('graduation-cap', t('ops.k_onboarding'), n0(T.onboarding_pending), t('ops.k_onboardingSub', { n: n0(T.onboarding_complete) }), 'amber', 'onboarding_pending'),
      kpi('gauge-high', t('ops.k_score'), `${n0(T.avg_score)}/100`, t('ops.k_scoreSub', { n: n0(T.low_score) }), 'plain', 'low_score'),
      kpi('list-check', t('ops.k_tasksOver'), n0(T.tasks_overdue), t('ops.k_tasksOpen', { n: n0(T.tasks_open) }), n0(T.tasks_overdue) ? 'red' : 'plain', 'overdue_tasks'),
      kpi('file-circle-exclamation', t('ops.k_reportsOver'), n0(T.reports_overdue), t('ops.k_reportsSub', { a: n0(T.reports_submitted), b: n0(T.reports_due) }), n0(T.reports_overdue) ? 'red' : 'plain', 'reports_overdue'),
      kpi('envelope-open', t('ops.k_unread'), n0(T.unread_hq), t('ops.k_unreadSub', { n: n0(T.leaders_unread) }), 'plain', 'unread_hq'),
      kpi('handshake', t('ops.k_notAccepted'), n0(T.not_accepted), t('ops.k_notAcceptedSub'), n0(T.not_accepted) ? 'amber' : 'plain', 'not_accepted'),
    ]));
    // quick actions
    body.append(el('div', { class: 'ops-actions' }, [
      el('a', { class: 'ops-action ops-action--magenta', href: '#/ops/messages' }, [icon('paper-plane', 18), el('b', { text: t('ops.qa_message') }), el('small', { text: t('ops.qa_messageSub') })]),
      el('a', { class: 'ops-action ops-action--green', href: '#/ops/tasks' }, [icon('list-check', 18), el('b', { text: t('ops.qa_task') }), el('small', { text: t('ops.qa_taskSub') })]),
      el('a', { class: 'ops-action', href: '#/ops/reports' }, [icon('file-pdf', 18), el('b', { text: t('ops.qa_report') }), el('small', { text: t('ops.qa_reportSub') })]),
      el('a', { class: 'ops-action', href: '#/ops/autopilot' }, [icon('robot', 18), el('b', { text: t('ops.qa_auto') }), el('small', { text: t('ops.qa_autoSub') })])]));
    const B = R.score_bands || {}; const eng = R.by_engagement || [];
    const EC = { consistent: STATUS.good, active: '#5e8a11', re_engaged: '#7cb518', under_reengagement: '#8a8a94', declining: STATUS.warn, at_risk: STATUS.serious, inactive: STATUS.critical };
    body.append(el('div', { class: 'ops-grid' }, [
      card('chart-simple', t('ops.c_engagement'), [stack(eng.map((x) => ({ label: t('ops.en_' + x.k), value: x.n, color: EC[x.k] || '#8a8a94' }))), el('p', { class: 'ops-note', text: t('ops.engNote') })]),
      card('gauge', t('ops.c_score'), [stack([{ label: t('ops.b75'), value: B.b75, color: STATUS.good }, { label: t('ops.b50'), value: B.b50, color: '#7cb518' }, { label: t('ops.b25'), value: B.b25, color: STATUS.warn }, { label: t('ops.b0'), value: B.b0, color: STATUS.critical }]), el('p', { class: 'ops-note', text: t('ops.scoreNote') })]),
    ]));
    body.append(el('div', { class: 'ops-grid' }, [
      card('wave-square', t('ops.c_daily'), [columns(fillDays(A.daily || [], 14).map((x) => ({ label: x.label, value: x.people }))), el('p', { class: 'ops-note', text: t('ops.dailyNote', { n: n0(A.active_people), m: n0(A.leaders_in_scope) }) })], el('a', { href: '#/ops/activity', class: 'btn btn--quiet', text: t('v.viewAll') })),
      card('layer-group', t('ops.c_level'), [hbars((R.by_level || []).map((x) => ({ label: t('ops.lv_' + x.level), value: x.n, sub: t('ops.activeOf', { n: x.active30 }) })))]),
    ]));
    body.append(el('div', { class: 'ops-grid' }, [
      card('triangle-exclamation', t('ops.c_support'), [(R.rows || []).length ? el('div', { class: 'ops-list' }, R.rows.map((r) => leaderLine(r))) : el('p', { class: 'muted', text: t('ops.none') })], el('a', { href: '#/ops/leaders?status=low_score', class: 'btn btn--quiet', text: t('v.viewAll') })),
      card('clock-rotate-left', t('ops.c_recent'), [(A.events || []).length ? el('div', { class: 'ops-feed' }, A.events.map(feedLine)) : el('p', { class: 'muted', text: t('ops.none') })], el('a', { href: '#/ops/activity', class: 'btn btn--quiet', text: t('v.viewAll') })),
    ]));
    body.append(card('earth-africa', t('ops.c_country'), [tableEl([t('v.country'), t('ops.col_leaders'), t('ops.col_active30'), t('ops.col_score'), t('ops.col_onbPending'), t('ops.col_overdue')],
      (R.by_country || []).map((c) => el('tr', { class: 'is-link', onclick: () => go(`#/ops/leaders?country=${encodeURIComponent(c.country === '(no country)' ? '' : c.country)}`) }, [el('td', { text: c.country }), el('td', { text: String(c.n) }),
        el('td', { text: `${c.active30} (${pct(c.active30, c.n)}%)` }), el('td', {}, [scorePill(c.avg_score)]), el('td', { text: String(c.onboarding_pending) }), el('td', { text: String(c.overdue) })])))]));
  }

  /* ======================= LEADERS ======================= */
  async function leaders() {
    const R = await opsLeaders({ ...F, limit: 50 }); clear(body);
    const bar = filterBar(R.countries || [], () => leaders());
    const selInfo = el('span', { class: 'ops-sel__n' });
    const matchAll = el('label', { class: 'ops-check' }, [el('input', { type: 'checkbox' }), el('span', { text: t('ops.selectAllMatching', { n: n0(R.total) }) })]);
    const selBar = el('div', { class: 'ops-sel' }, [selInfo, matchAll,
      el('button', { class: 'btn btn--primary', onclick: () => composeFor('message') }, [icon('paper-plane', 14), ' ', t('ops.msgSelected')]),
      el('button', { class: 'btn btn--secondary', onclick: () => composeFor('task') }, [icon('list-check', 14), ' ', t('ops.taskSelected')]),
      el('button', { class: 'btn btn--quiet', onclick: exportCsv }, [icon('file-csv', 14), ' ', t('ops.exportCsv')]),
      el('button', { class: 'btn btn--quiet', onclick: () => { SEL.clear(); leaders(); } }, [t('ops.clearSel')])]);
    const updSel = () => { const all = matchAll.firstChild.checked; selInfo.textContent = all ? t('ops.selN', { n: n0(R.total) }) : t('ops.selN', { n: SEL.size }); selBar.classList.toggle('is-on', all || SEL.size > 0); };
    matchAll.firstChild.addEventListener('change', updSel);
    const T = R.totals || {};
    const head = el('tr', {}, [el('th', {}, [el('input', { type: 'checkbox', 'aria-label': t('ops.selectPage'), onchange: (e) => { (R.rows || []).forEach((r) => (e.target.checked ? SEL.add(r.profile_id) : SEL.delete(r.profile_id))); body.querySelectorAll('.ops-row-cb').forEach((c) => { c.checked = e.target.checked; }); updSel(); } })]),
      ...['ops.col_leader', 'ops.col_network', 'ops.col_lastSeen', 'ops.col_onboarding', 'ops.col_tasks', 'ops.col_reports', 'ops.col_msgs', 'ops.col_score'].map((k) => el('th', { text: t(k) }))]);
    const rows = (R.rows || []).map((r) => {
      const cb = el('input', { type: 'checkbox', class: 'ops-row-cb', checked: SEL.has(r.profile_id) || null, onclick: (e) => e.stopPropagation(), onchange: (e) => { if (e.target.checked) SEL.add(r.profile_id); else SEL.delete(r.profile_id); updSel(); } });
      return el('tr', { class: 'is-link', onclick: () => openLeader(r.profile_id) }, [el('td', {}, [cb]),
        el('td', {}, [el('div', { class: 'ops-who' }, [avatar(r), el('div', {}, [el('b', { text: r.name }), el('div', { class: 'muted ops-sm', text: `${r.role_title} · ${r.unit}${r.country && r.country !== r.unit ? ', ' + r.country : ''}` })])])]),
        el('td', { 'data-l': t('ops.col_network') }, [el('span', { class: `ops-net ops-net--${(r.network || '').toLowerCase()}`, text: r.network })]),
        el('td', { 'data-l': t('ops.col_lastSeen'), class: r.last_seen_at && (Date.now() - new Date(r.last_seen_at)) < 7 * 864e5 ? 'ops-ok' : 'ops-warn', text: ago(r.last_seen_at) }),
        el('td', { 'data-l': t('ops.col_onboarding') }, [el('div', { class: 'ops-mini' }, [el('div', { class: 'ops-mini__bar' }, [el('span', { style: `width:${pct(r.onboarding_done, r.onboarding_total)}%` })]), el('small', { text: `${r.onboarding_done}/${r.onboarding_total}` })])]),
        el('td', { 'data-l': t('ops.col_tasks'), text: r.tasks_open ? `${r.tasks_open}${r.tasks_overdue ? ' · ' + t('ops.overdueN', { n: r.tasks_overdue }) : ''}` : '—', class: r.tasks_overdue ? 'ops-bad' : '' }),
        el('td', { 'data-l': t('ops.col_reports'), text: r.reports_overdue ? t('ops.overdueN', { n: r.reports_overdue }) : (r.reports_submitted ? t('ops.submittedN', { n: r.reports_submitted }) : '—'), class: r.reports_overdue ? 'ops-bad' : '' }),
        el('td', { 'data-l': t('ops.col_msgs'), text: r.msgs_unread ? t('ops.unreadN', { n: r.msgs_unread }) : '—' }),
        el('td', { 'data-l': t('ops.col_score2'), class: 'ops-td-score' }, [scorePill(r.score)])]);
    });
    const pager = el('div', { class: 'ops-pager' }, [el('span', { class: 'muted', text: t('ops.pageOf', { from: n0(R.total) ? F.offset + 1 : 0, to: Math.min(n0(R.total), F.offset + (R.rows || []).length), total: n0(R.total) }) }),
      el('button', { class: 'btn btn--quiet', disabled: F.offset === 0 || null, onclick: () => { F.offset = Math.max(0, F.offset - 50); leaders(); } }, [icon('chevron-left', 12), ' ', t('ops.prev')]),
      el('button', { class: 'btn btn--quiet', disabled: F.offset + 50 >= n0(R.total) || null, onclick: () => { F.offset += 50; leaders(); } }, [t('ops.next'), ' ', icon('chevron-right', 12)])]);
    body.append(el('div', { class: 'card ops-card' }, [
      el('div', { class: 'card__head' }, [el('h3', {}, [icon('people-group', 16), ' ', t('ops.t_leaders')]), el('span', { class: 'ops-count', text: String(n0(R.total)) })]),
      el('p', { class: 'muted', text: t('ops.leadersIntro', { a: n0(T.active7), b: n0(T.never) }) }), bar, selBar,
      el('div', { class: 'table-wrap' }, [el('table', { class: 'vs-table ops-table ops-table--leaders' }, [el('thead', {}, [head]), el('tbody', {}, rows.length ? rows : [el('tr', {}, [el('td', { colspan: 9, class: 'muted', text: t('ops.none') })])])])]), pager]));
    updSel();
    function composeFor(kind) {
      const all = matchAll.firstChild.checked;
      if (!all && !SEL.size) return toastError(t('ops.pickFirst'));
      composer(kind, all ? { filter: { ...F }, count: n0(R.total) } : { ids: [...SEL], count: SEL.size });
    }
    async function exportCsv() {
      const all = await opsLeaders({ ...F, limit: 5000, offset: 0 });
      const H = ['Name', 'Email', 'Phone', 'Network', 'Role', 'Unit', 'Level', 'Country', 'Seat since', 'Accepted', 'Last seen', 'Sign-ins (period)', 'Onboarding done', 'Onboarding total', 'Tasks open', 'Tasks overdue', 'Tasks done (period)', 'Reports due', 'Reports submitted', 'Reports overdue', 'HQ messages (period)', 'Unread HQ messages', 'Engagement', 'Score'];
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [H.join(',')].concat((all.rows || []).map((r) => [r.name, r.email, r.phone, r.network, r.role_title, r.unit, r.level, r.country, r.seat_since, r.accepted ? 'yes' : 'no', r.last_seen_at, r.signins, r.onboarding_done, r.onboarding_total, r.tasks_open, r.tasks_overdue, r.tasks_done, r.reports_due, r.reports_submitted, r.reports_overdue, r.msgs_from_hq, r.msgs_unread, r.engagement, r.score].map(esc).join(',')));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = `wdos-volunteer-leaders-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    }
  }

  function filterBar(countries, refresh) {
    const q = el('input', { class: 'input', type: 'search', placeholder: t('ops.search'), value: F.q }); q.addEventListener('input', debounce(() => { F.q = q.value.trim(); F.offset = 0; refresh(); }, 350));
    const sel = (key, opts, label) => { const s = el('select', { class: 'select' }, [el('option', { value: '', text: label }), ...opts.map(([v, l]) => el('option', { value: v, text: l, selected: F[key] === v || null }))]); s.addEventListener('change', () => { F[key] = s.value; F.offset = 0; refresh(); }); return s; };
    const sort = el('select', { class: 'select' }, [['score', t('ops.sortScore')], ['score_asc', t('ops.sortScoreAsc')], ['last_seen', t('ops.sortSeen')], ['overdue', t('ops.sortOverdue')], ['name', t('ops.sortName')]].map(([v, l]) => el('option', { value: v, text: l, selected: F.sort === v || null })));
    sort.addEventListener('change', () => { F.sort = sort.value; refresh(); });
    return el('div', { class: 'ops-filters' }, [q, sel('country', countries.map((c) => [c, c]), t('v.country')), sel('level', LEVELS.map((l) => [l, t('ops.lv_' + l)]), t('ops.level')),
      sel('status', STATUSES.map((s) => [s, t('ops.s_' + s)]), t('ops.status')), sort]);
  }

  /* ======================= ONE LEADER (drawer) ======================= */
  async function openLeader(id) {
    const drawer = el('aside', { class: 'ops-drawer', role: 'dialog', 'aria-modal': 'true' }); const veil = el('div', { class: 'ops-veil', onclick: () => close() });
    const close = () => { drawer.remove(); veil.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', onKey);
    drawer.append(el('div', { class: 'state' }, [el('div', { class: 'spinner' })])); document.body.append(veil, drawer);
    let D; try { D = await opsLeaderDetail(id, 90); } catch (e) { clear(drawer); drawer.append(el('p', { class: 'muted', text: e?.message || t('errors.load') })); return; }
    const r = D.leader; clear(drawer);
    drawer.append(el('div', { class: 'ops-drawer__head' }, [avatar(r, 56), el('div', { class: 'grow' }, [el('h3', { text: r.name }), el('div', { class: 'muted', text: `${r.role_title} · ${r.unit}${r.country && r.country !== r.unit ? ', ' + r.country : ''}` }),
      el('div', { class: 'ops-drawer__tags' }, [el('span', { class: `ops-net ops-net--${(r.network || '').toLowerCase()}`, text: r.network }), el('span', { class: `ops-eng ops-eng--${r.engagement}`, text: t('ops.en_' + r.engagement) }), scorePill(r.score), !r.accepted ? el('span', { class: 'vs-badge vs-badge--amber', text: t('ops.notAccepted') }) : null])]),
      el('button', { class: 'btn btn--quiet ops-x', 'aria-label': t('app.close'), onclick: close }, [icon('xmark', 16)])]));
    drawer.append(el('div', { class: 'ops-drawer__actions' }, [
      el('button', { class: 'btn btn--primary', onclick: () => composer('message', { ids: [id], count: 1, name: r.name }) }, [icon('paper-plane', 14), ' ', t('ops.message')]),
      el('button', { class: 'btn btn--secondary', onclick: () => composer('task', { ids: [id], count: 1, name: r.name }) }, [icon('list-check', 14), ' ', t('ops.assignTask')]),
      r.email ? el('a', { class: 'btn btn--quiet', href: `mailto:${r.email}` }, [icon('envelope', 14), ' ', t('ops.email')]) : null,
      r.phone ? el('a', { class: 'btn btn--quiet', href: `https://wa.me/${String(r.phone).replace(/[^0-9]/g, '')}`, target: '_blank', rel: 'noopener' }, [icon('brands:whatsapp', 14), ' WhatsApp']) : null,
      el('a', { class: 'btn btn--quiet', href: `#/members/${id}` }, [icon('id-card', 14), ' ', t('ops.profile')])]));
    const mini = (label, v, tone) => el('div', { class: `ops-dk ops-dk--${tone || 'plain'}` }, [el('b', { text: String(v) }), el('span', { text: label })]);
    drawer.append(el('div', { class: 'ops-dks' }, [mini(t('ops.col_lastSeen'), ago(r.last_seen_at), r.last_seen_at ? 'plain' : 'red'), mini(t('ops.d_signins'), r.signins), mini(t('ops.col_onboarding'), `${r.onboarding_done}/${r.onboarding_total}`, r.onboarding_done < r.onboarding_total ? 'amber' : 'green'),
      mini(t('ops.d_tasksOpen'), r.tasks_open), mini(t('ops.d_tasksOver'), r.tasks_overdue, r.tasks_overdue ? 'red' : 'plain'), mini(t('ops.d_reportsOver'), r.reports_overdue, r.reports_overdue ? 'red' : 'plain'),
      mini(t('ops.d_msgsHq'), r.msgs_from_hq), mini(t('ops.d_unread'), r.msgs_unread, r.msgs_unread ? 'amber' : 'plain'), mini(t('ops.d_meetings'), r.meetings)]));
    drawer.append(el('p', { class: 'ops-note', text: scoreExplain(r) }));
    drawer.append(dsec('wave-square', t('ops.d_weekly'), columns(fillWeeks(D.weekly || [], 13).map((w) => ({ label: w.label, value: w.n })), { width: 520, height: 140 })));
    drawer.append(dsec('address-card', t('ops.d_contact'), el('dl', { class: 'ops-dl' }, [[t('v.email'), r.email], [t('join.phone'), r.phone], [t('ops.d_seatSince'), r.seat_since ? fmtDate(r.seat_since) : null],
      [t('ops.d_mailbox'), D.mailbox ? `${D.mailbox.email} (${D.mailbox.open ? t('mb.state_open') : t('mb.state_locked')})` : t('ops.d_noMailbox')], [t('ops.d_membership'), D.profile?.membership_no]].flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v || '—' })]))));
    drawer.append(dsec('graduation-cap', t('ops.col_onboarding'), el('ul', { class: 'ops-checklist' }, (D.onboarding || []).filter((s) => s.required).map((s) => el('li', { class: s.done_at ? 'is-done' : '' }, [icon(s.done_at ? 'circle-check' : 'regular:circle', 14), el('span', { text: s.title }), s.done_at ? el('small', { class: 'muted', text: fmtDate(s.done_at) }) : null])))));
    drawer.append(dsec('list-check', t('ops.d_tasks'), (D.tasks || []).length ? el('ul', { class: 'ops-simple' }, D.tasks.map((x) => el('li', {}, [el('span', { class: 'grow', text: x.title }), el('span', { class: `vs-badge vs-badge--${x.overdue ? 'red' : x.status === 'completed' ? 'green' : 'grey'}`, text: x.overdue ? t('ops.overdue') : t('taskstatus.' + x.status) }), x.due_on ? el('small', { class: 'muted', text: fmtDate(x.due_on) }) : null]))) : el('p', { class: 'muted', text: t('ops.d_noTasks') })));
    drawer.append(dsec('file-lines', t('ops.d_reports'), (D.reports || []).length ? el('ul', { class: 'ops-simple' }, D.reports.map((x) => el('li', {}, [el('span', { class: 'grow', text: `${x.template.replace(/_/g, ' ')} · ${fmtDate(x.period_start)}` }), el('span', { class: `vs-badge vs-badge--${x.submitted_at ? 'green' : x.due_on && new Date(x.due_on) < new Date() ? 'red' : 'grey'}`, text: t('rp.st_' + x.status) })]))) : el('p', { class: 'muted', text: t('ops.none') })));
    drawer.append(dsec('clock-rotate-left', t('ops.d_timeline'), (D.timeline || []).length ? el('div', { class: 'ops-feed' }, D.timeline.map((e) => el('div', { class: 'ops-ev' }, [el('span', { class: `ops-ev__ic ops-ev__ic--${e.kind}` }, [icon(evIcon(e.kind), 12)]), el('div', { class: 'grow' }, [el('b', { text: t('ops.ev_' + e.kind) }), e.detail ? el('div', { class: 'muted ops-sm', text: e.detail }) : null]), el('small', { class: 'muted', text: fmtDateTime(e.at) })]))) : el('p', { class: 'muted', text: t('ops.d_noActivity') })));
    drawer.append(el('p', { class: 'muted ops-sm', text: t('ops.privacyNote') }));
  }

  /* ======================= ACTIVITY ======================= */
  async function activity(kind = '') {
    const days = F.days <= 14 ? F.days : 14; const A = await opsActivityFeed({ net: F.net, country: F.country, days: F.days, kind, limit: 200 }); clear(body);
    const kinds = A.by_kind || [];
    const per = el('select', { class: 'select' }, [7, 14, 30, 60, 90].map((d) => el('option', { value: d, text: t('ops.lastN', { n: d }), selected: d === F.days || null })));
    per.addEventListener('change', () => { F.days = Number(per.value); activity(kind); });
    const kindSel = el('select', { class: 'select' }, [el('option', { value: '', text: t('ops.allKinds') }), ...kinds.map((k) => el('option', { value: k.kind, text: t('ops.ev_' + k.kind), selected: k.kind === kind || null }))]);
    kindSel.addEventListener('change', () => activity(kindSel.value));
    void days;
    body.append(el('div', { class: 'ops-grid' }, [
      card('wave-square', t('ops.c_daily'), [columns(fillDays(A.daily || [], Math.min(F.days, 60)).map((x) => ({ label: x.label, value: x.people }))), el('p', { class: 'ops-note', text: t('ops.dailyNote', { n: n0(A.active_people), m: n0(A.leaders_in_scope) }) })]),
      card('chart-bar', t('ops.c_kinds'), [kinds.length ? hbars(kinds.map((k) => ({ label: t('ops.ev_' + k.kind), value: k.n, sub: t('ops.peopleN', { n: k.people }) })), { labelW: 200 }) : el('p', { class: 'muted', text: t('ops.none') })])]));
    body.append(card('clock-rotate-left', t('ops.c_feed'), [el('div', { class: 'ops-filters' }, [per, kindSel]), (A.events || []).length ? el('div', { class: 'ops-feed ops-feed--big' }, A.events.map(feedLine)) : el('p', { class: 'muted', text: t('ops.none') }), el('p', { class: 'muted ops-sm', text: t('ops.privacyNote') })]));
  }

  /* ======================= MESSAGES ======================= */
  async function messages() {
    const H = await opsMessageHistory(30); clear(body);
    body.append(card('paper-plane', t('ops.m_new'), [el('p', { class: 'muted', text: t('ops.m_intro') }), el('button', { class: 'btn btn--primary', onclick: () => composer('message', { filter: { ...F, status: '', q: '' }, count: null }) }, [icon('pen-to-square', 14), ' ', t('ops.m_compose')])]));
    body.append(card('clock-rotate-left', t('ops.m_history'), [(H || []).length ? el('div', { class: 'ops-list' }, H.map((b) => el('div', { class: 'ops-batch' }, [
      el('div', { class: 'grow' }, [el('b', { text: b.subject || b.body.slice(0, 70) }), el('div', { class: 'muted ops-sm', text: `${fmtDateTime(b.created_at)} · ${b.sender}${b.auto_rule ? ' · ' + t('ops.auto') : ''}` }),
        meter(t('ops.m_readOf', { a: b.read, b: b.recipients }), pct(b.read, b.recipients), b.emailed ? t('ops.m_emailed', { n: b.emailed, ok: b.email_accepted, bad: b.email_failed }) : null)]),
      el('div', { class: 'ops-batch__side' }, [el('span', { class: 'ops-count', text: String(b.replies) }), el('small', { class: 'muted', text: t('ops.m_replies') }), el('button', { class: 'btn btn--quiet', onclick: () => batchDetail(b) }, [t('ops.m_who')])])]))) : el('p', { class: 'muted', text: t('ops.m_none') })]));
  }
  async function batchDetail(b) {
    const rows = await opsMessageBatch(b.id);
    const box = modalBox(b.subject || t('ops.m_history'), [el('p', { class: 'ops-quote', text: b.body }), tableEl([t('v.name'), t('v.country'), t('ops.m_read'), t('ops.m_emailCol')], (rows || []).map((x) => el('tr', {}, [el('td', { text: x.name }), el('td', { text: x.country || '' }), el('td', { text: x.read_at ? fmtDateTime(x.read_at) : '—' }), el('td', { text: !x.emailed ? '—' : x.email_status == null ? t('ops.m_pending') : x.email_status < 300 ? t('ops.m_accepted') : t('ops.m_failed') })])))]);
    document.body.append(box);
  }

  /* ======================= TASKS ======================= */
  async function tasks() {
    const B = await opsTaskBatches(30); clear(body);
    body.append(card('list-check', t('ops.tk_new'), [el('p', { class: 'muted', text: t('ops.tk_intro') }), el('button', { class: 'btn btn--primary', onclick: () => composer('task', { filter: { ...F, status: '', q: '' }, count: null }) }, [icon('plus', 14), ' ', t('ops.tk_compose')])]));
    body.append(card('bars-progress', t('ops.tk_batches'), [(B || []).length ? el('div', { class: 'ops-list' }, B.map((b) => el('div', { class: 'ops-batch' }, [
      el('div', { class: 'grow' }, [el('b', { text: b.title }), el('div', { class: 'muted ops-sm', text: `${fmtDateTime(b.created_at)} · ${b.by}${b.due_on ? ' · ' + t('ops.due', { d: fmtDate(b.due_on) }) : ''}` }),
        stack([{ label: t('taskstatus.completed'), value: b.completed, color: STATUS.good }, { label: t('taskstatus.awaiting_review'), value: b.awaiting_review, color: COLORS.primary }, { label: t('taskstatus.in_progress'), value: b.in_progress, color: STATUS.warn }, { label: t('taskstatus.not_started'), value: b.not_started, color: '#8a8a94' }], { width: 480 })]),
      el('div', { class: 'ops-batch__side' }, [el('span', { class: `ops-count ${b.overdue ? 'ops-count--red' : ''}`, text: String(b.overdue) }), el('small', { class: 'muted', text: t('ops.overdue') }), el('a', { class: 'btn btn--quiet', href: '#/tasks?view=assigned' }, [t('v.open')])])]))) : el('p', { class: 'muted', text: t('ops.tk_none') })]));
  }

  /* ======================= COMPOSER (message or task) ======================= */
  function composer(kind, target) {
    // target: { ids, count, name } or { filter, count }
    const aud = { ...(target.filter || {}) };
    const audLine = el('p', { class: 'ops-aud' });
    const countNow = async () => {
      if (target.ids) { audLine.replaceChildren(icon('users', 13), ' ', target.name ? t('ops.toOne', { name: target.name }) : t('ops.toN', { n: target.ids.length })); return target.ids.length; }
      audLine.textContent = t('ops.counting');
      try { const R = await opsLeaders({ ...aud, limit: 1 }); audLine.replaceChildren(icon('users', 13), ' ', t('ops.toN', { n: n0(R.total) })); return n0(R.total); } catch { audLine.textContent = ''; return 0; }
    };
    const audPicker = target.ids ? null : el('div', { class: 'ops-filters' }, [
      mkSel(['', 'WGMN', 'WNNN'].map((v) => [v, v || t('ops.allNetworks')]), 'net'),
      mkSel([['', t('ops.allLevels')], ...LEVELS.map((l) => [l, t('ops.lv_' + l)])], 'level'),
      mkSel([['', t('ops.everyone')], ...STATUSES.map((s) => [s, t('ops.s_' + s)])], 'status'),
      (() => { const i = el('input', { class: 'input', placeholder: t('ops.countryOpt'), value: aud.country || '' }); i.addEventListener('change', () => { aud.country = i.value.trim(); countNow(); }); return i; })()]);
    function mkSel(opts, key) { const s = el('select', { class: 'select' }, opts.map(([v, l]) => el('option', { value: v, text: l, selected: (aud[key] || '') === v || null }))); s.addEventListener('change', () => { aud[key] = s.value; countNow(); }); return s; }
    let fields; let submit;
    if (kind === 'message') {
      const subject = el('input', { class: 'input', maxlength: 140, placeholder: t('ops.m_subjectPh') });
      const bodyTa = el('textarea', { class: 'input', rows: 7, maxlength: 4000, placeholder: t('ops.m_bodyPh') });
      const counter = el('small', { class: 'muted', text: '0 / 4000' }); bodyTa.addEventListener('input', () => { counter.textContent = `${bodyTa.value.length} / 4000`; });
      const email = el('input', { type: 'checkbox' });
      fields = [el('label', { class: 'ops-field' }, [el('span', { text: t('ops.m_subject') }), subject]), el('label', { class: 'ops-field' }, [el('span', { text: t('ops.m_body') }), bodyTa, counter]),
        el('label', { class: 'ops-check' }, [email, el('span', { text: t('ops.m_emailToo') })]), el('p', { class: 'muted ops-sm', text: t('ops.m_how') })];
      submit = async (n) => {
        if (!bodyTa.value.trim()) throw new Error(t('ops.m_needBody'));
        if (!window.confirm(t('ops.m_confirm', { n }))) return null;
        const r = await opsSendMessage({ ids: target.ids || null, body: bodyTa.value.trim(), subject: subject.value.trim(), email: email.checked, ...(target.ids ? {} : aud) });
        return t('ops.m_sent', { n: r.sent, e: r.emailed });
      };
    } else {
      const title = el('input', { class: 'input', maxlength: 160, placeholder: t('ops.tk_titlePh') });
      const details = el('textarea', { class: 'input', rows: 4, placeholder: t('ops.tk_detailsPh') });
      const pri = el('select', { class: 'select' }, ['low', 'medium', 'high', 'urgent'].map((p) => el('option', { value: p, text: t('ops.pr_' + p), selected: p === 'medium' || null })));
      const due = el('input', { class: 'input', type: 'date', min: new Date().toISOString().slice(0, 10) });
      const appr = el('input', { type: 'checkbox' });
      const reqs = el('textarea', { class: 'input', rows: 3, placeholder: t('ops.tk_reqsPh') });
      fields = [el('label', { class: 'ops-field' }, [el('span', { text: t('ops.tk_title') }), title]), el('label', { class: 'ops-field' }, [el('span', { text: t('ops.tk_details') }), details]),
        el('div', { class: 'ops-row2' }, [el('label', { class: 'ops-field' }, [el('span', { text: t('ops.tk_priority') }), pri]), el('label', { class: 'ops-field' }, [el('span', { text: t('ops.tk_due') }), due])]),
        el('label', { class: 'ops-field' }, [el('span', { text: t('ops.tk_reqs') }), reqs]), el('label', { class: 'ops-check' }, [appr, el('span', { text: t('ops.tk_approval') })]), el('p', { class: 'muted ops-sm', text: t('ops.tk_how') })];
      submit = async (n) => {
        if (!title.value.trim()) throw new Error(t('ops.tk_needTitle'));
        if (!window.confirm(t('ops.tk_confirm', { n }))) return null;
        const r = await opsAssignTask({ ids: target.ids || null, title: title.value.trim(), details: details.value.trim(), priority: pri.value, dueOn: due.value || null, requiresApproval: appr.checked,
          requirements: reqs.value.split('\n').map((x) => x.trim()).filter(Boolean), ...(target.ids ? {} : aud) });
        return t('ops.tk_done', { n: r.assigned });
      };
    }
    const sendBtn = el('button', { class: 'btn btn--primary' }, [icon(kind === 'message' ? 'paper-plane' : 'check', 14), ' ', t(kind === 'message' ? 'ops.m_send' : 'ops.tk_assign')]);
    const box = modalBox(t(kind === 'message' ? 'ops.m_new' : 'ops.tk_new'), [el('h4', { class: 'ops-h4', text: t('ops.audience') }), audPicker, audLine, ...fields, el('div', { class: 'ops-modal__foot' }, [sendBtn])]);
    sendBtn.addEventListener('click', async () => {
      sendBtn.disabled = true;
      try { const n = await countNow(); if (!n) throw new Error(t('ops.noAudience')); const msg = await submit(n); if (msg) { toast(msg); box.remove(); if (tab === 'messages' || tab === 'tasks') render(root, params, ctx); } }
      catch (e) { toastError(e?.message || t('errors.save')); }
      sendBtn.disabled = false;
    });
    document.body.append(box); countNow();
  }

  /* ======================= AUTOPILOT ======================= */
  async function autopilot() {
    const S = await opsAutopilotState(); clear(body);
    body.append(el('div', { class: 'card ops-card ops-auto-intro' }, [el('h3', {}, [icon('robot', 18), ' ', t('ops.ap_title')]), el('p', { text: t('ops.ap_intro') }), el('p', { class: 'muted ops-sm', text: t('ops.ap_when') })]));
    const PARAM = { inactive_checkin: 'days', onboarding_nudge: 'days', overdue_task_reminder: 'every_days', overdue_escalation: 'days', weekly_digest: 'weekday' };
    body.append(el('div', { class: 'ops-rules' }, (S.rules || []).map((r) => {
      const key = PARAM[r.code]; const val = el('input', { class: 'input ops-num', type: 'number', min: 1, max: key === 'weekday' ? 7 : 90, value: r.params?.[key] ?? '' });
      const sw = el('input', { type: 'checkbox', role: 'switch', checked: r.enabled || null });
      const save = async (enabled) => {
        try { const p = {}; p[key] = Number(val.value); if (!(p[key] >= 1)) throw new Error(t('ops.ap_badNum')); await opsAutopilotSet(r.code, enabled, p); toast(enabled ? t('ops.ap_on') : t('ops.ap_off')); autopilot(); }
        catch (e) { sw.checked = r.enabled; toastError(e?.message || t('errors.save')); }
      };
      sw.addEventListener('change', () => { if (sw.checked && !window.confirm(t('ops.ap_confirm', { rule: t('ops.ap_' + r.code), n: n0(r.would_act) }))) { sw.checked = false; return; } save(sw.checked); });
      return el('div', { class: `ops-rule ${r.enabled ? 'is-on' : ''}` }, [
        el('div', { class: 'ops-rule__head' }, [el('span', { class: 'ops-rule__ic' }, [icon(({ inactive_checkin: 'hand-holding-heart', onboarding_nudge: 'graduation-cap', overdue_task_reminder: 'bell', overdue_escalation: 'arrow-up-right-dots', weekly_digest: 'newspaper' })[r.code] || 'robot', 16)]),
          el('b', { class: 'grow', text: t('ops.ap_' + r.code) }), el('label', { class: 'ops-switch' }, [sw, el('span', {})])]),
        el('p', { class: 'ops-sm', text: t('ops.apd_' + r.code) }),
        el('div', { class: 'ops-rule__param' }, [el('span', { text: t('ops.app_' + r.code) }), val, el('button', { class: 'btn btn--quiet', onclick: () => save(r.enabled) }, [t('ops.save')])]),
        el('div', { class: 'ops-rule__foot' }, [el('span', { class: 'ops-sm' }, [icon('eye', 12), ' ', t('ops.ap_would', { n: n0(r.would_act) })]), el('span', { class: 'muted ops-sm', text: t('ops.ap_last30', { n: n0(r.last_30d) }) })]),
        (r.sample || []).length ? el('small', { class: 'muted', text: r.sample.map((x) => x.name).join(', ') + (n0(r.would_act) > r.sample.length ? '…' : '') }) : null,
        r.enabled && r.owner ? el('small', { class: 'muted', text: t('ops.ap_owner', { name: r.owner, d: fmtDateTime(r.updated_at) }) }) : null]);
    })));
    body.append(card('clipboard-list', t('ops.ap_log'), [(S.log || []).length ? tableEl([t('ops.when'), t('ops.ap_rule'), t('v.name'), t('ops.detail')], S.log.map((g) => el('tr', {}, [el('td', { text: fmtDateTime(g.at) }), el('td', { text: t('ops.ap_' + g.rule) }), el('td', { text: g.name || '' }), el('td', { text: g.detail || '' })]))) : el('p', { class: 'muted', text: t('ops.ap_noLog') })]));
  }

  /* ======================= helpers ======================= */
  function card(ic, title, kids, extra) { return el('section', { class: 'card ops-card' }, [el('div', { class: 'card__head' }, [el('h3', {}, [icon(ic, 16), ' ', title]), extra || null]), ...kids]); }
  function dsec(ic, title, kid) { return el('section', { class: 'ops-dsec' }, [el('h4', {}, [icon(ic, 14), ' ', title]), kid]); }
  function tableEl(head, rows) { return el('div', { class: 'table-wrap' }, [el('table', { class: 'vs-table ops-table' }, [el('thead', {}, [el('tr', {}, head.map((h) => el('th', { text: h })))]), el('tbody', {}, rows)])]); }
  function avatar(r, size = 36) { const img = el('img', { class: 'ops-ava', src: avatarUrl(r.profile_id), alt: '', width: size, height: size, style: `width:${size}px;height:${size}px` }); img.addEventListener('error', () => { img.replaceWith(el('span', { class: 'ops-ava ops-ava--txt', style: `width:${size}px;height:${size}px`, text: (r.name || '?').split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase() })); }, { once: true }); return img; }
  function scorePill(s) { return el('span', { class: `ops-score ops-score--${scoreTone(n0(s))}`, title: t('ops.scoreTip') }, [el('b', { text: String(n0(s)) }), el('small', { text: '/100' })]); }
  function leaderLine(r) { return el('div', { class: 'ops-line is-link', onclick: () => openLeader(r.profile_id) }, [avatar(r, 32), el('div', { class: 'grow' }, [el('b', { text: r.name }), el('div', { class: 'muted ops-sm', text: `${r.role_title} · ${r.country || r.unit} · ${t('ops.seen', { w: ago(r.last_seen_at) })}` })]), scorePill(r.score),
    el('button', { class: 'btn btn--quiet ops-ic-btn', title: t('ops.message'), onclick: (e) => { e.stopPropagation(); composer('message', { ids: [r.profile_id], count: 1, name: r.name }); } }, [icon('paper-plane', 13)])]); }
  function feedLine(e) { return el('div', { class: 'ops-ev is-link', onclick: () => e.profile_id && openLeader(e.profile_id) }, [el('span', { class: `ops-ev__ic ops-ev__ic--${e.kind}` }, [icon(evIcon(e.kind), 12)]),
    el('div', { class: 'grow' }, [el('b', { text: e.name || '' }), el('span', { class: 'muted', text: ` ${t('ops.ev_' + e.kind).toLowerCase()}` }), el('div', { class: 'muted ops-sm', text: [e.role, e.country, e.detail].filter(Boolean).join(' · ') })]), el('small', { class: 'muted', text: ago(e.at) })]); }
  function evIcon(k) { return ({ signin: 'right-to-bracket', onboarding_step: 'graduation-cap', task_assigned: 'clipboard-list', task_completed: 'circle-check', report_submitted: 'file-circle-check', msg_from_hq: 'envelope', msg_read: 'envelope-open', msg_to_hq: 'reply', msg_to_leader: 'comments', meeting_attended: 'video', hq_message_read: 'newspaper', course_completed: 'certificate', seated: 'chair', accepted: 'handshake' })[k] || 'circle'; }
  function scoreExplain(r) { return t('ops.scoreWhy', { seen: r.last_seen_at && (Date.now() - new Date(r.last_seen_at)) < 7 * 864e5 ? 25 : r.last_seen_at && (Date.now() - new Date(r.last_seen_at)) < 30 * 864e5 ? 12 : 0, onb: Math.round(20 * (r.onboarding_total ? Math.min(1, r.onboarding_done / r.onboarding_total) : 1)), total: r.score }); }
  function modalBox(title, kids) {
    const box = el('div', { class: 'ops-modal', role: 'dialog', 'aria-modal': 'true' });
    const panel = el('div', { class: 'ops-modal__panel' }, [el('div', { class: 'ops-modal__head' }, [el('h3', { text: title }), el('button', { class: 'btn btn--quiet ops-x', 'aria-label': t('app.close'), onclick: () => box.remove() }, [icon('xmark', 16)])]), ...kids.filter(Boolean)]);
    box.append(panel); box.addEventListener('click', (e) => { if (e.target === box) box.remove(); });
    return box;
  }
}

function fillDays(daily, n) { const map = new Map(daily.map((x) => [String(x.d), x])); const out = []; const today = new Date(); for (let i = n - 1; i >= 0; i -= 1) { const d = new Date(today); d.setDate(today.getDate() - i); const k = d.toISOString().slice(0, 10); const x = map.get(k) || {}; out.push({ label: k.slice(5), people: n0(x.people), n: n0(x.n) }); } return out; }
function fillWeeks(weekly, n) { const map = new Map(weekly.map((x) => [String(x.week), n0(x.n)])); const out = []; const now = new Date(); const day = (now.getUTCDay() + 6) % 7; const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day)); for (let i = n - 1; i >= 0; i -= 1) { const d = new Date(monday); d.setUTCDate(monday.getUTCDate() - 7 * i); const k = d.toISOString().slice(0, 10); out.push({ label: k.slice(5), n: map.get(k) || 0 }); } return out; }
