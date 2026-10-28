/**
 * Phase 131 — the Volunteer Dashboard (WGMN / WNNN).
 *
 * Routes: #/ (home, non-HQ), #/my/:tab, #/view-as/:id (HQ, read-only).
 * One RPC (volunteer_home) feeds every card; the shell caches it for a
 * minute. Nothing on this page is estimated or padded: a tile shows a
 * number only when the database recorded the rows behind it.
 *
 * Tabs: home · profile · network · leadership (leaders) · learning ·
 * impact · referrals · documents · calendar · support · safeguarding ·
 * settings. Tasks, Meetings, Announcements and Messages open the existing
 * pages, which wear the same shell for volunteers.
 */
import { el, clear } from '../core/dom.js';
import { t, fmtDate, fmtDateTime, fmtNumber, getLocale, setLocale, supportedLocales } from '../core/i18n.js';
import {
  volunteerHome, updateMyProfile, saveMyProfileChanges, avatarUrl, uploadAvatar, changePassword,
  fileTicket, fileCase, submitReferral, documentUrl,
  acceptAppointment, declineAppointment, onboardingStatus, setOnboardingStep, countryDashboard, myMessageStream, myHqMessage, hqMessageSeen, myMonthlyInspiration, myFounderWelcome, founderWelcomeSeen, db } from '../core/db.js';
import { getHome, invalidateHome } from '../core/homecache.js';
import { renderVolunteerShell, networkName } from '../components/vshell.js';
import { apptBadge } from './structure.js';
import { renderCourses } from '../components/courses.js';
import { icon } from '../components/icons.js';
import { toast, toastError } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { AFRICAN_COUNTRIES, NG_STATES, countryIso, flagSrc } from '../core/geo.js';
import { withDriveFallback } from '../core/photos.js';
import { roleTitle } from '../core/titles.js';
import { mailboxCard } from '../components/mailboxcard.js';
import { allowedByVisit } from '../core/obvisit.js';

const TAB_TITLE = {
  home: 'v.navHome', profile: 'v.navProfile', network: 'v.navNetwork',
  leadership: 'v.navLeadership', learning: 'v.navLearning', impact: 'v.navImpact',
  referrals: 'v.navReferrals', documents: 'v.navDocuments', calendar: 'v.navCalendar',
  support: 'v.navSupport', safeguarding: 'v.navSafeguarding', settings: 'v.navSettings',
  templates: 'v.navTemplates', reflinks: 'nav.reflinks', onboarding: 'v.navOnboarding', country: 'v.navCountry',
};
const LEVEL_KEY = {
  headquarters: 'v.lvlHq', country: 'v.lvlCountry', state_region: 'v.lvlState',
  district_lga: 'v.lvlLga', community_cluster: 'v.lvlCluster', chapter: 'v.lvlChapter',
};
const LOCALE_NAMES = {
  en: 'English', fr: 'Français', pt: 'Português', ar: 'العربية',
  sw: 'Kiswahili', ha: 'Hausa', yo: 'Yorùbá', ig: 'Igbo',
};
const REFERRAL_CATS = ['welfare', 'health', 'education', 'livelihood',
  'community_need', 'leadership_candidate', 'other'];
const REFERRAL_LADDER = ['submitted', 'received', 'assigned', 'in_progress', 'closed'];
const TICKET_CATS = ['login', 'app_problem', 'certificate', 'role_access',
  'training_access', 'technical', 'other'];
const STATIC_DOCS = [
  { key: 'v.docHandbook', href: '/content/leadership-manual.pdf', kind: 'pdf' },
  { key: 'v.docConduct', href: '/content/code-of-conduct.html', kind: 'html' },
  { key: 'v.docAgreement', href: '/content/volunteer-agreement.html', kind: 'html' },
];

export async function render(root, params, ctx) {
  const viewAsId = params.id || null;
  const tab = TAB_TITLE[params.tab] ? params.tab : 'home';
  // The route this render belongs to. If the browser moves on while the
  // bundle is loading (a dropped session sends people to #/login), this
  // render must not touch the page any more: an earlier build drew its
  // error card over the login form in exactly that case.
  const myRoute = location.hash;
  const stale = () => location.hash !== myRoute;
  if (!ctx.profile) { location.hash = '#/login'; return () => {}; }

  let h;
  try {
    h = viewAsId ? await volunteerHome(viewAsId) : await getHome();
  } catch (err) {
    if (stale()) return () => {};
    console.error('[home] bundle failed:', err);
    const notSignedIn = /not signed in|jwt|401/i.test(String(err?.message || err?.code || ''));
    if (notSignedIn) { location.hash = '#/login'; return () => {}; }
    clear(root);
    root.append(el('div', { class: 'vs-shell' }, [el('div', { class: 'vs-main' }, [
      el('div', { class: 'vs-content' }, [errorState(
        () => render(root, params, ctx), err)])])]));
    return () => {};
  }
  if (stale()) return () => {};
  const ro = !!viewAsId;                        // read-only "View as"
  const P = h.profile;
  const shell = renderVolunteerShell(root, {
    profile: P, modules: ctx.modules, titleKey: TAB_TITLE[tab],
    viewingAs: ro ? { id: P.id, name: `${P.first_name} ${P.last_name}` } : null,
  });
  const out = shell.outlet;
  const isLeader = (h.roles || []).length > 0;

  // Phase 145 gate: nothing works for a leader until she has read the
  // Volunteer Leadership Pack (onboarding step 'pack'). HQ view-as bypasses.
  const OPEN_TABS = new Set(['home', 'onboarding', 'profile', 'documents', 'templates', 'support', 'settings']);
  let gated = false;
  if (isLeader && !ro) {
    // Phase 184: the gate lifts only when EVERY required step is finished,
    // and each one now carries evidence that the document was actually read.
    try { const st = await onboardingStatus(); gated = (st?.steps || []).some((x) => x.required && !x.done_at); } catch { gated = false; }
  }
  // Phase 214: the page of the onboarding step she has just opened ("Confirm
  // my reporting line" opens My network) is let through, or the step could
  // never be done.
  if (gated && !OPEN_TABS.has(tab) && !allowedByVisit(P.id, location.hash)) { toastError(t('v.gateNotice')); location.replace('#/my/onboarding'); return shell.teardown; }
  const TABS = {
    home, messages, profile: profileTab, network, leadership, learning, impact,
    referrals, documents, calendar, support, safeguarding, settings, templates, reflinks, onboarding, country,
  };
  try { await (TABS[tab] || home)(); }
  catch (err) {
    if (stale()) return shell.teardown;
    console.error('[home] tab failed:', tab, err);
    clear(out); out.append(errorState(() => render(root, params, ctx), err));
  }
  return shell.teardown;

  /* ================================================================== */
  /* HOME                                                               */
  /* ================================================================== */
  async function home() {
    clear(out);
    out.append(welcome());
    // Phase 184c: the HQ message is encouragement, not privileged data, so it
    // shows during onboarding too — that is exactly when it is most welcome.
    if (!ro) {
      const fw = await founderWelcomePanel();          // first, and only once
      if (fw) out.append(fw);
      const mc = await hqMessageCard(); if (mc) out.append(mc);
      const ml = await monthlyCard(); if (ml) out.append(ml);
    }
    if (gated) {
      out.append(el('div', { class: 'vs-card vs-card--danger' }, [el('h3', { text: t('v.gateTitle') }), el('p', { text: t('v.gateBody') }),
        el('a', { href: '#/my/onboarding', class: 'btn btn--primary', text: t('v.navOnboarding') })]));
      out.append(await onboardingCard());
      // Phase 210: the position mailbox is shown locked here, with the reason,
      // so the leader knows exactly what opens it.
      if (isLeader && !ro) { const mb = await mailboxCard(); if (mb) out.append(mb); }
      return;
    }
    // Phase 210: "My WODDI mailbox" for every seated leader. The database
    // decides open/locked from the signed-in leader's own seat (auth.uid());
    // nothing here takes a profile id, so no leader can reach another's.
    if (isLeader && !ro) { const mb = await mailboxCard(); if (mb) out.append(mb); }
    // Phase 166: approved reference screens. Country-level seat → Screen 2
    // (country overview, attention, my structure, recruitment pathways,
    // activities, engagement, recent). Chapter / cluster / LGA seat or a
    // member → Screen 3 (what needs doing next, my chapter, announcements,
    // required learning, quick actions, get help), mobile-first.
    const seat0 = (h.roles || [])[0];
    const level = seat0 ? seat0.level : null;
    const isDeputy = seat0 && /^(deputy_|assistant_)/.test(seat0.role);
    if (isDeputy) { await delegatedPortfolio(); }
    if (isLeader && (level === 'country' || level === 'state_region')) { await countryHome(); return; }
    if (level === 'chapter' || level === 'community_cluster' || level === 'district_lga' || !isLeader) { await chapterHome(); return; }
    out.append(statRow());

    // Candidates: the activation journey door (the 14 days live on #/me)
    if (h.journey && h.journey.status === 'in_progress' && !ro) {
      out.append(el('div', { class: 'vs-card vs-journey' }, [
        el('div', { class: 'grow' }, [
          el('b', { text: t('v.journeyTitle', { day: h.journey.day }) }),
          el('div', { class: 'muted', text: t('v.journeyHint',
            { date: fmtDate(h.journey.extended_until || h.journey.due_at) }) }),
        ]),
        el('a', { href: '#/me/journey', class: 'btn btn--primary', text: t('v.journeyGo') }),
      ]));
    }

    if (isLeader && !ro) {
      const pending = (h.roles || []).filter((r) => !r.accepted_at && !r.declined_at);
      if (pending.length) out.append(acceptanceCard(pending));
      out.append(await onboardingCard());
    }
    const grid = el('div', { class: 'vs-grid' });
    grid.append(learningCard(), tasksCard(), networkCard());
    grid.append(meetingsCard(), announcementsCard());
    if (isLeader && h.leadership) grid.append(leadershipCard());
    grid.append(impactCard(), quickActions(), achievementsCard());
    out.append(grid);
    out.append(footerLine());
  }

  /* ---------------- Appendix §4 · My Delegated Portfolio (Deputies and Assistants) */
  async function delegatedPortfolio() {
    const rows = (h.tasks || []).filter((x) => x.status !== 'completed');
    const card = el('div', { class: 'vs-card vs-card--delegated' }, [
      el('div', { class: 'card__head' }, [el('h3', { text: t('dp.title') }), el('a', { href: '#/tasks', class: 'btn btn--quiet', text: t('v.viewAll') })]),
      el('p', { class: 'muted', text: t('dp.rule') }),
      rows.length ? el('div', { class: 'table-wrap' }, [el('table', { class: 'vs-table ca-table hf-table' }, [
        el('thead', {}, [el('tr', {}, ['dp.cAssignment', 'dp.cBy', 'dp.cArea', 'dp.cAssigned', 'dp.cDeadline', 'v.thStatus', 'dp.cEvidence'].map((k) => el('th', { text: t(k) })))]),
        el('tbody', {}, rows.slice(0, 8).map((x) => el('tr', {}, [el('td', { class: 'hf-td-wrap', text: x.title || '' }), el('td', { text: x.assigned_by_name || x.assigner || t('dp.principal') }), el('td', { text: x.org_unit_name || x.unit || '' }),
          el('td', { text: x.created_at ? fmtDate(x.created_at) : '' }), el('td', { text: x.due_on ? fmtDate(x.due_on) : '\u2014', style: x.due_on && new Date(x.due_on) < new Date() ? 'color:var(--danger);font-weight:700;' : '' }),
          el('td', {}, [el('span', { class: `vs-badge vs-badge--${x.status === 'awaiting_review' ? 'amber' : x.status === 'in_progress' ? 'green' : 'grey'}`, text: t('tk.st_' + x.status, {}) || x.status })]),
          el('td', { text: x.evidence_required ? t('dp.yes') : t('dp.no') })])))])])
        : el('p', { class: 'muted', text: t('dp.none') })]);
    out.append(card);
  }

  /* ---------------- Reference Screen 2 · Country Representative / Country Lead */
  async function countryHome() {
    let d = null;
    // Phase 216: in View as, the viewed leader's own unit (null meant the VIEWER's unit: HQ has none, "No leadership unit")
    try { d = await countryDashboard(ro ? ((h.roles || [])[0]?.unit_id || null) : null, P.network); } catch { d = null; }
    const T = d?.totals || {}; const lv = d?.by_level || []; const kids = d?.children || [];
    const stateRow = lv.find((x) => x.role === 'state_coordinator') || lv[0] || {};
    const seatsVacant = lv.reduce((a, x) => a + (Number(x.seats) - Number(x.filled)), 0);
    const overdueTasks = (h.tasks || []).filter((x) => x.due_on && new Date(x.due_on) < new Date() && x.status !== 'completed').length;
    const reportsIn = kids.filter((c) => c.report_status && c.report_status !== 'draft').length;
    const tile = (v, l, sub, tone, href) => el('a', { class: `ca-tile ca-tile--${tone}`, href }, [el('b', { text: String(v) }), el('span', { text: l }), el('small', { class: 'muted', text: sub })]);
    out.append(el('div', { class: 'ca-tiles ca-tiles--6' }, [
      tile(`${stateRow.filled ?? 0} / ${stateRow.seats ?? 0}`, t('cr.tStates'), t('cr.tStatesSub', { pct: stateRow.seats ? Math.round(100 * stateRow.filled / stateRow.seats) : 0 }), 'green', '#/my/country'),
      tile(seatsVacant, t('cr.tVacancies'), t('cr.tVacanciesSub'), seatsVacant ? 'red' : 'green', '#/structure?status=vacant'),
      tile((h.tasks || []).length, t('cr.tTasks'), overdueTasks ? t('cr.tTasksOverdue', { n: overdueTasks }) : t('cr.tTasksNone'), overdueTasks ? 'amber' : 'green', '#/tasks'),
      tile(h.announcements_unread || 0, t('cr.tDirectives'), t('cr.tDirectivesSub'), 'magenta', '#/announcements'),
      tile((h.referrals || []).length, t('cr.tReferrals'), t('cr.tReferralsSub'), 'magenta', '#/my/referrals'),
      tile(`${reportsIn} / ${kids.length}`, t('cr.tReports'), d?.period?.due ? t('cr.tReportsSub', { d: fmtDate(d.period.due), n: kids.length - reportsIn }) : '', kids.length - reportsIn ? 'amber' : 'green', '#/reporting/compliance'),
    ]));
    // attention required (rules on my own structure)
    const items = [];
    for (const c of kids) {
      if (!c.report_status && d?.period?.due && new Date(d.period.due) < new Date() && (c.leaders || []).length) items.push({ a: t('cr.aReportOverdue', { u: c.name }), b: t('cr.dueOn', { d: fmtDate(d.period.due) }), p: 'high', href: c.report_id ? `#/reporting/report/${c.report_id}` : '#/reporting/compliance' });
      if ((c.seats || 0) > (c.filled || 0)) items.push({ a: t('cr.aVacant', { u: c.name, n: c.seats - c.filled }), b: t('cr.seatsVacant'), p: 'high', href: '#/structure?status=vacant' });
      for (const l of c.leaders || []) if (l.resp === 'inactive' || l.resp === 'never') items.push({ a: t('cr.aInactive', { name: l.name }), b: `${roleTitle(l.role, P.network)} · ${l.unit}`, p: 'medium', href: `#/messages?u=${l.id}` });
    }
    for (const x of (h.tasks || []).filter((x) => x.due_on && new Date(x.due_on) < new Date() && x.status !== 'completed')) items.push({ a: t('cr.aTaskOverdue', { title: x.title }), b: t('cr.dueOn', { d: fmtDate(x.due_on) }), p: 'medium', href: '#/tasks' });
    if (h.announcements_unread) items.push({ a: t('cr.aDirective', { n: h.announcements_unread }), b: t('cr.aDirectiveSub'), p: 'normal', href: '#/announcements' });
    const PRI = { high: 'red', medium: 'amber', normal: 'grey' };
    const attn = el('div', { class: 'vs-card' }, [el('div', { class: 'card__head' }, [el('h3', {}, [el('span', { text: t('cr.attentionShort') }), items.length ? el('span', { class: 'hf-count', text: String(items.length) }) : null]), el('a', { href: '#/my/country', class: 'btn btn--quiet', text: items.length > 6 ? t('hf.viewAllN', { n: items.length }) : t('v.viewAll') })]),
      ...(items.length ? items.slice(0, 6).map((it) => el('a', { href: it.href, class: 'ca-attn' }, [el('span', { class: `vs-badge vs-badge--${PRI[it.p]}`, text: t('hf.pr_' + it.p) }), el('div', { class: 'grow' }, [el('b', { text: it.a }), el('div', { class: 'muted', text: it.b })]), el('span', { class: 'btn btn--secondary', text: t('cr.open') })])) : [el('p', { class: 'muted', text: t('hf.attentionNone') })])]);
    // recruitment pathways + activities + engagement
    const resp = { active: 0, quiet: 0, inactive: 0, never: 0 }; for (const c of kids) for (const l of c.leaders || []) resp[l.resp] = (resp[l.resp] || 0) + 1;
    const mini = (l, v, tone) => el('div', { class: `vs-mini__t ${tone ? 'vs-mini__t--' + tone : ''}` }, [el('b', { text: String(v ?? 0) }), el('small', { text: l })]);
    const line = (l, v, href) => el('a', { href, class: 'ca-attn' }, [el('span', { class: 'grow', text: l }), el('b', { text: String(v) })]);
    const recruit = el('div', { class: 'vs-card' }, [el('div', { class: 'card__head' }, [el('h3', { text: t('cr.recruit') }), el('a', { href: '#/my/reflinks', class: 'btn btn--quiet', text: t('nav.reflinks') })]),
      el('b', { class: 'cr-path', text: t('cr.pathReferral') }),
      line(t('cr.referred'), (h.referrals || []).length, '#/my/referrals'), line(t('cr.referralsOpen'), (h.referrals || []).filter((r) => r.status !== 'closed').length, '#/my/referrals'),
      el('b', { class: 'cr-path cr-path--lemon', text: t('cr.pathOnline') }),
      line(t('cr.vacanciesLinked'), seatsVacant, '#/my/reflinks'),
      el('p', { class: 'muted', text: t('cr.recruitNote') })]);
    const act = el('div', { class: 'vs-card' }, [el('div', { class: 'card__head' }, [el('h3', { text: t('cr.activities') }), el('a', { href: '#/my/calendar', class: 'btn btn--quiet', text: t('v.navCalendar') })]),
      el('div', { class: 'vs-mini' }, [mini(t('cr.meetings30'), T.meetings30), mini(t('cr.activities30'), T.activities30, 'green'), mini(t('cr.issuesOpen'), T.issues_open, T.issues_open ? 'amber' : '')]),
      (h.meetings || [])[0] ? el('p', { text: t('cr.nextMeeting', { title: h.meetings[0].title, d: fmtDateTime(h.meetings[0].starts_at) }) }) : el('p', { class: 'muted', text: t('cr.noMeeting') }),
      el('a', { href: '#/reporting/new/activity_report', class: 'btn btn--primary', text: t('cr.submitActivity') })]);
    const eng = el('div', { class: 'vs-card' }, [el('div', { class: 'card__head' }, [el('h3', { text: t('cr.engagement') }), el('a', { href: '#/my/country', class: 'btn btn--quiet', text: t('v.viewAll') })]),
      el('div', { class: 'vs-mini' }, [mini(t('cty.resp_active'), resp.active, 'green'), mini(t('cty.resp_quiet'), resp.quiet, 'amber'), mini(t('cty.resp_inactive'), resp.inactive, 'red'), mini(t('cty.resp_never'), resp.never, 'red')]),
      el('p', { class: 'muted', text: t('cr.engagementNote') })]);
    // Attention Required beside My Structure, immediately under the tiles —
    // this is the layout the founder approved (Figma reference); nothing
    // else sits between the tiles and this row.
    const structureBox = el('div');
    // Phase 177: structure gets the wider column (its table has 5-6 columns) and scrolls inside the row so the two cards stay level
    structureBox.className = 'hm-struct';
    out.append(el('div', { class: 'ca-grid ca-grid--struct' }, [attn, structureBox]));
    const { renderCountryPanel } = await import('./country.js');
    await renderCountryPanel(structureBox, { profile: P, ro });
    out.append(el('div', { class: 'vs-grid' }, [recruit, act, eng]));
    if (isLeader && !ro) { const pending = (h.roles || []).filter((r) => !r.accepted_at && !r.declined_at); if (pending.length) out.append(acceptanceCard(pending)); }
    out.append(footerLine());
  }

  /* ---------------- Reference Screen 3 · Chapter Coordinator / Chapter Lead (mobile-first) */
  async function chapterHome() {
    const seat0 = (h.roles || [])[0];
    const overdue = (h.tasks || []).filter((x) => x.due_on && new Date(x.due_on) < new Date() && x.status !== 'completed');
    const open = (h.tasks || []).filter((x) => x.status !== 'completed');
    const next = (h.meetings || [])[0];
    const big = (label, sub, href, tone) => el('a', { href, class: `ch-big ch-big--${tone}` }, [el('div', {}, [el('b', { text: label }), sub ? el('small', { text: sub }) : null]), el('span', { text: '›' })]);
    const card = (title, link, kids) => el('div', { class: 'vs-card' }, [el('div', { class: 'card__head' }, [el('h3', { text: title }), link ? el('a', { href: link[0], class: 'btn btn--quiet', text: link[1] }) : null]), ...kids]);
    out.append(card(t('ch.next'), null, [
      (h.report_due_on || (isLeader && seat0)) ? big(t('ch.reportDue'), h.report_due_on ? fmtDate(h.report_due_on) : t('ch.reportMonthly'), '#/reporting/mine', 'red') : null,
      next ? big(t('ch.nextActivity', { title: next.title }), fmtDateTime(next.starts_at), '#/my/calendar', 'magenta') : big(t('ch.noActivity'), t('ch.planOne'), '#/my/calendar', 'grey'),
      big(t('ch.myTasks', { n: open.length }), overdue.length ? t('cr.tTasksOverdue', { n: overdue.length }) : t('cr.tTasksNone'), '#/tasks', overdue.length ? 'amber' : 'green'),
    ].filter(Boolean)));
    let d = null; if (isLeader && seat0) { try { d = await countryDashboard(ro ? (seat0.unit_id || null) : null, P.network); } catch { d = null; } }
    const T = d?.totals || {};
    const mini = (v, l, tone) => el('div', { class: `ch-mini ch-mini--${tone}` }, [el('b', { text: String(v ?? 0) }), el('small', { text: l })]);
    out.append(card(isLeader ? t('ch.myChapter', { unit: seat0?.unit || '' }) : t('ch.myNetwork'), ['#/my/network', t('v.navNetwork')], [
      el('div', { class: 'ch-minis' }, [mini(T.members ?? (h.network_size || 0), t('ch.members'), 'magenta'), mini(T.activities30 ?? 0, t('ch.activities30'), 'green'), mini((h.referrals || []).length, t('ch.referrals'), 'lemon')])]));
    const ann = (h.announcements || [])[0];
    out.append(card(t('v.navAnnounce'), ['#/announcements', t('v.viewAll')], [ann ? el('p', { text: ann.title }) : el('p', { class: 'muted', text: t('ch.noAnnouncements') }), h.announcements_unread ? el('a', { href: '#/announcements', class: 'muted', text: t('ch.newAnnouncements', { n: h.announcements_unread }) }) : null].filter(Boolean)));
    const courses = h.learning || []; const done = courses.filter((c) => Number(c.progress_pct) >= 100).length;
    out.append(card(t('ch.learning'), ['#/my/learning', t('v.navLearning')], [
      el('div', { class: 'vs-bar' }, [el('span', { style: `width:${courses.length ? Math.round(100 * done / courses.length) : 0}%` })]),
      el('p', { class: 'muted', text: courses.length ? t('ch.learningLine', { done, total: courses.length }) : t('ch.learningNone') })]));
    const qa = [['#/my/network', t('ch.qaAddMember'), 'magenta'], ['#/reporting/new/activity_report', t('ch.qaReport'), 'lemon'], ['#/my/referrals', t('ch.qaRefer'), 'magenta'], ['#/my/calendar', t('ch.qaNext'), 'lemon'], ['#/my/support', t('ch.qaSupport'), 'navy']];
    out.append(card(t('hf.quick'), null, [el('div', { class: 'ch-quick' }, qa.map(([href, l, tone]) => el('a', { href, class: `ch-quick__a ch-quick__a--${tone}`, text: l })))]));
    const sup = h.leadership?.reports_to?.name;
    out.append(el('div', { class: 'vs-card ch-help' }, [el('p', { text: sup ? t('ch.helpLine', { name: sup }) : t('ch.helpLineHq') }), el('a', { href: '#/my/support', class: 'btn btn--primary', text: t('ch.getHelp') })]));
    if (isLeader && !ro) { const pending = (h.roles || []).filter((r) => !r.accepted_at && !r.declined_at); if (pending.length) out.append(acceptanceCard(pending)); }
    if (h.journey && h.journey.status === 'in_progress' && !ro) out.append(el('div', { class: 'vs-card vs-journey' }, [el('div', { class: 'grow' }, [el('b', { text: t('v.journeyTitle', { day: h.journey.day }) })]), el('a', { href: '#/me/journey', class: 'btn btn--primary', text: t('v.journeyGo') })]));
    out.append(footerLine());
  }

  function term(level) {
    const tm = h.terms || {};
    return tm[level] || t(LEVEL_KEY[level] || 'v.lvlUnit');
  }
  function contextLine() {
    const seat = (h.roles || [])[0];
    const parts = [P.network, P.country || unitOf('country'), P.state_region || unitOf('state_region'),
      P.lga || unitOf('district_lga'), unitOf('chapter'),
      seat ? roleTitle(seat.role, P.network) : (P.role_applied || t('v.volunteer'))].filter(Boolean);
    return `${P.first_name} ${P.last_name} \u2014 ${parts.join(' | ')}`;
  }

  /* ---------------------------------------------------------------- */
  /* Phase 183 — the HQ message. ONE at a time: birthday on the day,   */
  /* the monthly message in the first three days of the month, the     */
  /* weekly message otherwise. The artwork changes with the tone of    */
  /* the message. Addressed by name, signed by WODDI HQ.               */
  /* ---------------------------------------------------------------- */
  /* ------------------------------------------------------------------ */
  /* Phase 186 — FROM WODDI HQ · Weekly Inspiration.                      */
  /* Released Monday, present all week, built to the Founder's card spec: */
  /* logo line, network + week, greeting, headline, 80-150 word message,  */
  /* highlighted key thought, THIS WEEK action for her exact role,        */
  /* closing, WODDI HQ signature and network tagline.                     */
  /* ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ */
  /* Phase 188 — Monthly Leadership Inspiration (first Wednesday, visible  */
  /* for the month) and the Founder's Welcome (once per appointment).      */
  /* ------------------------------------------------------------------ */
  async function monthlyCard(anyDay) {
    let m = null;
    try { m = await myMonthlyInspiration(!!anyDay); } catch { m = null; }
    if (!m) return null;
    return el('section', { class: 'vs-card mli' }, [
      el('div', { class: 'mli__art' }, [el('img', { src: m.image, alt: m.image_alt || '', loading: 'lazy' })]),
      el('div', { class: 'mli__text' }, [
        el('div', { class: 'wi__kick' }, [
          el('b', { class: 'wi__from', text: t('mli.from') }),
          el('span', { class: 'wi__label wi__label--green', text: t('mli.label') }),
          el('small', { class: 'muted', text: `${m.network} \u00B7 ${m.role_title} \u00B7 ${m.month_label}` })]),
        el('p', { class: 'wi__greeting', text: m.greeting }),
        el('h3', { class: 'wi__headline', text: m.theme_title }),
        el('p', { class: 'wi__body', text: m.core_message }),
        m.network_lens ? el('p', { class: 'mli__lens' }, [
          el('b', { text: t('mli.network', { net: m.network }) }), el('span', { text: ' ' + m.network_lens })]) : null,
        m.role_lens ? el('p', { class: 'mli__lens mli__lens--role' }, [
          el('b', { text: t('mli.yourRole') }), el('span', { text: ' ' + m.role_lens })]) : null,
        m.reflection ? el('div', { class: 'mli__reflect' }, [
          el('b', { text: t('mli.reflect') }), el('p', { text: m.reflection })]) : null,
        el('p', { class: 'wi__sign', text: m.closing }),
      ]),
    ]);
  }

  /* The Founder's welcome: shown once, on first login after appointment. */
  async function founderWelcomePanel() {
    let f = null;
    try { f = await myFounderWelcome(); } catch { f = null; }
    if (!f) return null;
    const go = el('button', { class: 'btn btn--primary btn--lg', text: t('fw.continue') });
    const panel = el('section', { class: 'vs-card fw' }, [
      el('div', { class: 'fw__head' }, [
        el('img', { class: 'fw__photo', src: f.founder_image, alt: f.founder_name, loading: 'lazy',
          onerror: 'this.style.display=\'none\'' }),
        el('div', {}, [
          el('h3', { text: f.title }),
          el('small', { class: 'muted', text: `${f.network} \u00B7 ${f.role_title}` })]),
      ]),
      el('div', { class: 'fw__body' }, String(f.body || '').split(/\n\n+/).map((para) => el('p', { text: para }))),
      el('div', { class: 'fw__sign' }, [
        el('b', { text: f.founder_name }),
        el('small', { class: 'muted', text: f.founder_role })]),
      el('div', { class: 'row', style: 'margin-top:12px;' }, [go]),
    ]);
    go.addEventListener('click', async () => {
      try { await founderWelcomeSeen(f.content_id); } catch { /* best effort */ }
      panel.remove();
    });
    return panel;
  }

  async function hqMessageCard(anyDay) {
    let m = null;
    try { m = await myHqMessage(!!anyDay); } catch { m = null; }
    if (!m) return hqMessageCardLegacy();

    const body = el('p', { class: 'wi__body', text: m.body });
    const full = el('div', { class: 'wi__full', hidden: true }, [
      m.key_thought ? el('blockquote', { class: 'wi__key', text: `\u201C${m.key_thought}\u201D` }) : null,
      m.act ? el('div', { class: 'wi__act' }, [
        el('b', { text: t('wi.thisWeek') }), el('p', { text: m.act })]) : null,
      el('p', { class: 'wi__closing', text: m.closing }),
      el('p', { class: 'wi__sign', text: '\u2014 ' + (m.signature || 'WODDI HQ') }),
      el('p', { class: 'wi__tag', text: m.tagline || '' }),
    ]);
    const more = el('button', { class: 'btn btn--primary', text: t('wi.readFull') });
    more.addEventListener('click', () => {
      full.hidden = !full.hidden;
      more.textContent = full.hidden ? t('wi.readFull') : t('wi.showLess');
      hqMessageSeen(m.message_id, full.hidden ? 'read' : 'opened').catch(() => {});
    });

    return el('section', { class: 'vs-card wi' }, [
      el('div', { class: 'wi__art' }, [
        el('img', { src: m.graphic, alt: m.headline, loading: 'lazy' })]),
      el('div', { class: 'wi__text' }, [
        el('div', { class: 'wi__kick' }, [
          el('b', { class: 'wi__from', text: t('wi.from') }),
          el('span', { class: 'wi__label', text: t('wi.label') }),
          el('small', { class: 'muted', text: `${m.network} \u00B7 ${t('wi.weekOf', { date: m.week_of })}` })]),
        el('p', { class: 'wi__greeting', text: m.greeting }),
        el('h3', { class: 'wi__headline', text: m.headline }),
        body,
        el('div', { class: 'row', style: 'gap:8px;margin-top:10px;' }, [more,
          el('a', { href: '#/my/messages', class: 'btn btn--quiet', text: t('wi.archive') })]),
        full,
      ]),
    ]);
  }

  /* the pre-engine card (monthly inspiration and birthday) stays available */
  async function hqMessageCardLegacy() {
    let st;
    try { st = await myMessageStream(); } catch { return null; }
    if (!st || !st.primary) return null;
    const all = [st.primary, ...(st.others || [])];
    const box = el('section', { class: `vs-card msg msg--${st.primary.tone || 'purpose'}` });
    box.append(messageBlock(all[0], true));
    if (all.length > 1) {
      box.append(el('div', { class: 'msg__more' }, [
        el('small', { class: 'muted', text: t('msg.alsoWaiting') }),
        ...all.slice(1).map((m) => messageBlock(m, false)),
      ]));
    }
    return box;
  }

  /* one message, fully readable where it stands */
  function messageBlock(m, lead) {
    const tone = m.tone || 'purpose';
    const body = m.body || m.focus || '';
    const head = el('div', { class: 'msg__kick' }, [
      el('b', { text: t('msg.from') }),
      el('span', { class: `msg__tag msg__tag--${m.kind}`, text: t('msg.k_' + m.kind) }),
      m.period_label ? el('small', { class: 'muted', text: m.period_label }) : null]);
    const text = el('div', { class: 'msg__text' }, [
      head,
      m.lead ? el('p', { class: 'msg__lead', text: m.lead }) : null,
      el(lead ? 'h3' : 'h4', { text: m.title }),
      body ? el('p', { class: 'msg__body', text: body }) : null,
      el('p', { class: 'msg__sign', text: '\u2014 ' + (m.signature || 'WODDI HQ') }),
    ]);
    if (!lead) return el('article', { class: `msg__item msg__item--${tone}` }, [
      el('span', { class: `msg__dot msg__dot--${tone}` }), text]);
    return el('div', { class: 'msg__lead-row' }, [
      el('div', { class: 'msg__art' }, [el('img', { src: `/assets/messages/${tone}.svg`, alt: '', loading: 'lazy' })]),
      text]);
  }

  function welcome() {
    const seat = (h.roles || [])[0];
    // Phase 190: the designation names the seat, not only the role — "State Secretary, Imo State"
    const seatPlace = seat && seat.unit
      ? `, ${seat.unit}${seat.level === 'state_region' && !/state|region|province/i.test(seat.unit) ? ' State' : ''}`
      : '';
    const designation = seat ? roleTitle(seat.role, P.network) + seatPlace : (P.role_applied || t('v.volunteer'));
    const line = (k, v) => el('div', { class: 'vs-welcome__line' }, [el('small', { text: k }), el('b', { text: v || '\u2014' })]);
    return el('section', { class: 'vs-welcome vs-welcome--simple' }, [
      avatarNode(P, 'vs-welcome__ava'),
      el('div', { class: 'vs-welcome__who' }, [
        el('h2', {}, [el('span', { text: t('v.welcome', { name: P.first_name }) }), flagNode(P, h)]),
        line(t('v.volunteerId'), P.membership_no || t('v.idPending')),
        line(t('v.fullName'), `${P.first_name} ${P.last_name}`),
        line(t('v.network'), P.network || ''),
        line(t('v.country'), (P.country || unitOf('country') || '')),
        line(t('v.designation'), designation),
        statusBadge(P.status, P.is_leader),
      ]),
    ]);
  }

  function statRow() {
    const tc = h.task_counts || {};
    const learn = learningSummary();
    const next = (h.meetings || [])[0];
    const im = h.impact || {};
    const participation = Number(im.meetings_attended || 0) + Number(im.tasks_completed || 0);
    const stat = (cls, ic, label, value, sub, href) => {
      const node = el(href ? 'a' : 'div', { class: `vs-stat vs-stat--${cls}`, href }, [
        el('div', { class: 'vs-stat__ic' }, [icon(ic, 20)]),
        el('div', { class: 'vs-stat__body' }, [
          el('div', { class: 'vs-stat__label', text: label }),
          el('div', { class: 'vs-stat__value', text: value }),
          sub ? (sub instanceof Node ? sub : el('div', { class: 'vs-stat__sub', text: sub })) : null,
        ]),
      ]);
      return node;
    };
    const bar = el('div', { class: 'vs-bar vs-bar--sm' }, [
      el('span', { style: `width:${learn.percent}%` })]);
    return el('section', { class: 'vs-stats' }, [
      stat('green', 'check', t('v.sMyStatus'), t(`status.${P.status}`), t('v.sThanks')),
      stat('violet', 'book', t('v.sLearning'), `${learn.percent}%`,
        el('div', {}, [el('div', { class: 'vs-stat__sub',
          text: learn.current ? t('v.sModuleIn', { m: learn.current }) : t('v.sNoCourse') }), bar]),
        '#/my/learning'),
      stat('blue', 'tasks', t('v.sTasks'), fmtNumber(tc.open || 0),
        tc.overdue ? t('v.sOverdue', { n: tc.overdue }) : t('v.sPending'), '#/tasks'),
      stat('pink', 'calendar', t('v.sMeeting'), fmtNumber((h.meetings || []).length),
        next ? t('v.sNext', { d: fmtDateTime(next.starts_at) }) : t('v.sNoMeeting'), '#/meetings'),
      stat('amber', 'users', t('v.sParticipation'), fmtNumber(participation), t('v.sActivities')),
      stat('lime', 'chart', t('v.sImpact'),
        fmtNumber(im.women_reached || 0),
        t('v.sImpactSub', { w: im.women_reached || 0, r: im.referrals || 0 }), '#/my/impact'),
      stat('sky', 'megaphone', t('v.sAnnouncements'), fmtNumber(h.announcements_unread || 0),
        t('v.sNewAnn'), '#/announcements'),
      stat('indigo', 'support', t('v.sSupport'), t('v.sNeedHelp'), t('v.sHere'), '#/my/support'),
    ]);
  }

  /* ---------------- cards ---------------- */
  function cardShell(ic, title, href, body, extraClass = '') {
    return el('div', { class: `vs-card ${extraClass}` }, [
      el('div', { class: 'vs-card__head' }, [
        el('span', { class: 'vs-card__ic' }, [icon(ic, 18)]),
        el('h3', { text: title }),
        href ? el('a', { href, class: 'vs-card__all', text: t('v.viewAll') }) : null,
      ]),
      body,
    ]);
  }

  function learningSummary() {
    const courses = h.learning || [];
    const enrolled = courses.filter((c) => c.enrollment_id);
    const total = enrolled.reduce((a, c) => a + Number(c.modules_total || 0), 0);
    const passed = enrolled.reduce((a, c) => a + Number(c.modules_passed || 0), 0);
    const percent = total ? Math.round((passed / total) * 100) : 0;
    let current = null;
    for (const c of enrolled) {
      const m = (c.modules || []).find((x) => !x.passed);
      if (m) { current = m.title; break; }
    }
    return { courses, enrolled, total, passed, percent, current };
  }

  function learningCard() {
    const L = learningSummary();
    const body = el('div');
    if (!L.courses.length) {
      body.append(el('p', { class: 'muted', text: t('v.learnNone') }));
    } else {
      const c = L.enrolled[0] || L.courses[0];
      const pct = c.modules_total ? Math.round((c.modules_passed / c.modules_total) * 100) : 0;
      body.append(el('div', { class: 'vs-learn__title', text: c.title }),
        el('div', { class: 'row', style: 'gap:10px;' }, [
          el('div', { class: 'vs-bar grow' }, [el('span', { style: `width:${pct}%` })]),
          el('b', { text: `${pct}%` })]));
      const list = el('ul', { class: 'vs-modules' });
      let seenOpen = false;
      for (const m of (c.modules || [])) {
        let st = 'v.modNotStarted', cls = 'todo';
        if (m.passed) { st = 'v.modCompleted'; cls = 'done'; }
        else if (c.enrollment_id && !seenOpen) { st = 'v.modInProgress'; cls = 'now'; seenOpen = true; }
        list.append(el('li', { class: `vs-mod vs-mod--${cls}` }, [
          el('span', { class: 'vs-mod__dot' }, [cls === 'done' ? icon('check', 12) : null]),
          el('span', { class: 'grow', text: `${t('v.module')} ${m.seq} \u2013 ${m.title}` }),
          el('small', { text: t(st) })]));
      }
      list.append(el('li', { class: 'vs-mod vs-mod--todo' }, [
        el('span', { class: 'vs-mod__dot' }),
        el('span', { class: 'grow', text: t('v.certification') }),
        el('small', { text: c.completed_at
          ? (c.cert_no ? `${t('v.certIssued')} ${c.cert_no}` : t('v.certIssued'))
          : t('v.certLocked') })]));
      body.append(list);
      if (!c.enrollment_id) body.append(el('p', { class: 'muted', text: t('v.learnNotEnrolled') }));
    }
    body.append(el('a', { href: '#/my/learning', class: 'btn btn--primary vs-cta',
      text: t('v.continueLearning') }));
    return cardShell('book', t('v.myLearning'), '#/my/learning', body);
  }

  function tasksCard() {
    const rows = h.tasks || [];
    const body = el('div');
    if (!rows.length) body.append(el('p', { class: 'muted', text: t('v.tasksNone') }));
    else {
      const tbl = el('table', { class: 'vs-table' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: t('v.thTask') }), el('th', { text: t('v.thDue') }),
          el('th', { text: t('v.thStatus') })])]),
        el('tbody', {}, rows.slice(0, 5).map((r) => el('tr', {
          onclick: () => { location.hash = '#/tasks'; } }, [
          el('td', { text: r.title }),
          el('td', { text: r.due_on ? fmtDate(r.due_on) : '\u2014' }),
          el('td', {}, [taskBadge(r)])]))),
      ]);
      body.append(el('div', { class: 'table-wrap' }, [tbl]));
    }
    return cardShell('tasks', t('v.myTasks'), '#/tasks', body);
  }

  function taskBadge(r) {
    if (r.overdue) return el('span', { class: 'vs-badge vs-badge--red', text: t('v.overdue') });
    if (r.status === 'in_progress') return el('span', { class: 'vs-badge vs-badge--blue', text: t('v.inProgress') });
    if (r.status === 'awaiting_review') return el('span', { class: 'vs-badge vs-badge--violet', text: t('v.awaitingReview') });
    return el('span', { class: 'vs-badge vs-badge--amber', text: t('v.pending') });
  }

  function networkCard() {
    const body = el('div', { class: 'vs-net' });
    body.append(chainNode());
    body.append(coordinatorNode());
    return cardShell('sitemap', t('v.myNetwork'), '#/my/network', body,
      P.network === 'WNNN' ? 'vs-card--wnnn' : 'vs-card--wgmn');
  }

  function chainNode() {
    const steps = [networkName(P.network), 'Africa'];
    const chain = h.chain || [];
    if (chain.length) {
      for (const c of chain) if (c.level !== 'headquarters') steps.push(c.name);
    } else {
      for (const v of [P.country, P.state_region, P.lga]) if (v) steps.push(v);
    }
    steps.push(t('v.you'));
    return el('ol', { class: 'vs-chain' }, steps.map((s, i) =>
      el('li', { class: i === steps.length - 1 ? 'vs-chain__you' : '' }, [
        el('span', { class: 'vs-chain__dot' }), el('span', { text: s })])));
  }

  function coordinatorNode() {
    const c = h.coordinator;
    const box = el('div', { class: 'vs-coord' }, [el('b', { text: isLeader ? t('v.reportsTo') : t('v.myCoordinator') })]);
    if (!c) {
      box.append(el('p', { class: 'muted', text: t('v.coordNone') }));
      if (!ro) box.append(el('a', { href: '#/messages', class: 'btn btn--secondary',
        text: t('v.messageHq') }));
      return box;
    }
    box.append(el('div', { class: 'vs-coord__who' }, [
      avatarNode({ id: c.id, first_name: c.name.split(' ')[0], last_name: c.name.split(' ')[1] || '' }, 'vs-coord__ava'),
      el('div', {}, [el('b', { text: c.name }),
        el('div', { class: 'muted' }, [el('span', { text: t(`role.${c.role}`) + ' ' }), c.appointment_status ? apptBadge(c.appointment_status) : null]),
        el('div', { class: 'muted', text: c.unit })]),
    ]));
    if (!ro) box.append(el('a', { href: `#/messages?u=${c.id}`, class: 'btn btn--secondary',
      text: t('v.messageCoordinator') }));
    return box;
  }

  function meetingsCard() {
    const rows = h.meetings || [];
    const body = el('div');
    if (!rows.length) body.append(el('p', { class: 'muted', text: t('v.meetNone') }));
    for (const m of rows.slice(0, 3)) {
      const place = m.platform === 'woddi' || m.mode === 'virtual'
        ? t('v.online') : (m.location || t(`v.mode_${m.mode}`));
      body.append(el('div', { class: 'vs-meet' }, [
        el('div', { class: 'vs-meet__ic' }, [icon('calendar', 18)]),
        el('div', { class: 'grow' }, [
          el('b', { text: m.title }),
          el('div', { class: 'muted', text: `${fmtDateTime(m.starts_at)} \u00B7 ${place}` }),
          el('div', { class: 'muted', text: audienceLabel(m) }),
        ]),
        el('div', { class: 'vs-meet__btns' }, [
          el('a', { href: '#/meetings', class: 'btn btn--secondary', text: t('v.viewDetails') }),
          (!ro && m.platform === 'woddi' && String(m.location || '').startsWith('WODDI-'))
            ? el('a', { href: `#/room?r=${encodeURIComponent(m.location)}&m=${m.id}`,
              class: 'btn btn--primary', text: t('v.joinMeeting') }) : null,
        ]),
      ]));
    }
    return cardShell('calendar', t('v.upcomingMeetings'), '#/meetings', body);
  }

  function audienceLabel(m) {
    const a = m.audience || 'unit';
    if (a === 'all') return t('v.audAll');
    if (a === 'hq') return t('v.audHq');
    if (a.startsWith('wgmn') || a.startsWith('wnnn')) {
      const net = a.slice(0, 4).toUpperCase();
      return a.endsWith('_ng') ? t('v.audNetNg', { net }) : t('v.audNetAll', { net });
    }
    return m.unit ? t('v.audUnit', { unit: m.unit }) : '';
  }

  function announcementsCard() {
    const rows = h.announcements || [];
    const body = el('div');
    if (!rows.length) body.append(el('p', { class: 'muted', text: t('v.annNone') }));
    for (const a of rows.slice(0, 4)) {
      body.append(el('a', { href: '#/announcements', class: 'vs-ann' }, [
        el('span', { class: `vs-ann__dot${a.read ? '' : ' vs-ann__dot--new'}` }),
        el('span', { class: 'grow', text: a.title }),
        el('small', { class: 'muted', text: fmtDate(a.created_at) }),
      ]));
    }
    return cardShell('megaphone', t('v.latestAnnouncements'), '#/announcements', body);
  }

  function leadershipCard() {
    const L = h.leadership;
    const seat = h.roles[0];
    const body = el('div');
    body.append(el('p', { class: 'muted', text: t('v.leadScope',
      { role: t(`role.${seat.role}`), unit: seat.unit }) }));
    body.append(el('div', { class: 'vs-mini' }, [
      mini(t('v.seats'), L.seats), mini(t('v.filled'), L.filled, 'green'),
      mini(t('v.vacant'), L.vacant, L.vacant > 0 ? 'red' : 'green'),
      mini(t('v.membersInScope'), L.members), mini(t('v.activeMembers'), L.members_active, 'green'),
    ]));
    body.append(el('a', { href: '#/my/leadership', class: 'btn btn--primary vs-cta',
      text: t('v.openLeadership') }));
    return cardShell('shield', t('v.myLeadership'), '#/my/leadership', body);
  }

  function impactCard() {
    const im = h.impact || {};
    const body = el('div', { class: 'vs-impact' }, [
      tileI('users', im.women_reached, t('v.womenReached'), 'pink'),
      tileI('userplus', im.referrals, t('v.communityReferrals'), 'green'),
      tileI('calendar', im.meetings_attended, t('v.meetingsAttended'), 'amber'),
      tileI('check', im.tasks_completed, t('v.tasksCompleted'), 'lime'),
      tileI('chart', im.months_of_service, t('v.monthsOfService'), 'gold'),
    ]);
    return cardShell('chart', t('v.myImpact'), '#/my/impact', body);
  }

  function quickActions() {
    const body = el('div', { class: 'vs-quick' }, [
      qa('#/my/referrals', 'userplus', t('v.qaReferral')),
      qa('#/my/documents', 'folder', t('v.qaDocuments')),
      qa('#/my/calendar', 'calendar', t('v.qaCalendar')),
      qa('#/my/safeguarding', 'shield', t('v.qaSafeguarding'), 'danger'),
      qa('#/my/support', 'support', t('v.qaSupport')),
      qa('#/ask', 'book', t('v.qaHelpCentre')),
    ]);
    return cardShell('tasks', t('v.quickActions'), null, body);
  }

  function qa(href, ic, label, cls = '') {
    return el('a', { href, class: `vs-qa ${cls ? 'vs-qa--' + cls : ''}` },
      [icon(ic, 18), el('span', { text: label })]);
  }

  function achievementsCard() {
    const rows = h.achievements || [];
    const body = el('div');
    if (!rows.length) body.append(el('p', { class: 'muted', text: t('v.achNone') }));
    for (const a of rows.slice(0, 5)) {
      body.append(el('div', { class: 'vs-ach' }, [
        el('span', { class: 'vs-ach__star', text: a.code === 'module' ? '\u2714' : '\u2605' }),
        el('span', { class: 'grow', text: achLabel(a) }),
        el('small', { class: 'muted', text: a.at ? fmtDate(a.at) : '' }),
      ]));
    }
    return cardShell('chart', t('v.myAchievements'), null, body);
  }

  function achLabel(a) {
    if (a.code === 'orientation') return t('v.achOrientation');
    if (a.code === 'module') return t('v.achModule', { title: a.title });
    if (a.code === 'certificate') return t('v.achCertificate', { title: a.title });
    if (a.code === 'appointed') return t('v.achAppointed', { role: t(`role.${a.title}`), unit: a.unit || '' });
    if (a.code && a.code.startsWith('service_')) return t('v.achService', { n: a.code.split('_')[1] });
    return a.title || a.code;
  }

  function acceptanceCard(pending) {
    const seat = pending[0];
    const reason = el('textarea', { class: 'input', rows: '2', placeholder: t('v.declineReasonPh'), hidden: true });
    const card = el('div', { class: 'vs-card vs-card--danger' }, [
      el('h3', { text: t('v.acceptTitle', { role: t(`role.${seat.role}`), unit: seat.unit }) }),
      el('p', { text: t('v.acceptDeclaration') }),
      reason,
      el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;' }, [
        el('button', { class: 'btn btn--primary', text: t('v.acceptBtn'), onclick: async (e) => {
          e.target.disabled = true;
          try { await acceptAppointment(); toast(t('v.accepted')); invalidateHome(); h = await getHome(true); await home(); }
          catch (err) { toastError(err?.message || t('errors.save')); e.target.disabled = false; }
        } }),
        el('button', { class: 'btn btn--quiet', text: t('v.declineBtn'), onclick: async (e) => {
          if (reason.hidden) { reason.hidden = false; reason.focus(); return; }
          if (reason.value.trim().length < 3) { toastError(t('v.declineNeedReason')); return; }
          if (!confirm(t('v.declineConfirm'))) return;
          e.target.disabled = true;
          try { await declineAppointment(reason.value.trim()); toast(t('v.declined')); invalidateHome(); location.reload(); }
          catch (err) { toastError(err?.message || t('errors.save')); e.target.disabled = false; }
        } }),
      ]),
    ]);
    return card;
  }

  async function onboardingCard() {
    let st;
    try { st = await onboardingStatus(ro ? P.id : null); } catch { return el('div'); }
    if (!st) return el('div');
    const done = Number(st.done || 0), total = Number(st.total || 0);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const list = el('ul', { class: 'vs-modules' });
    for (const s of (st.steps || [])) {
      const cb = el('input', { type: 'checkbox', checked: !!s.done_at, disabled: true });
      cb.addEventListener('change', async () => {
        try { await setOnboardingStep(s.code, cb.checked); invalidateHome(); const n = await onboardingStatus(); bar.firstChild.style.width = `${n.total ? Math.round((n.done / n.total) * 100) : 0}%`; pctB.textContent = `${n.done}/${n.total}`; }
        catch (err) { cb.checked = !cb.checked; toastError(err?.message || t('errors.save')); }
      });
      list.append(el('li', { class: `vs-mod vs-mod--${s.done_at ? 'done' : 'todo'}` }, [
        cb, el('span', { class: 'grow' }, [el('span', { text: s.title }), s.detail ? el('div', { class: 'muted', text: s.detail }) : null]),
        s.href ? el('a', { href: s.href, class: 'btn btn--quiet', text: t('v.open'), target: s.href.startsWith('/') ? '_blank' : null }) : null,
        s.done_at ? el('small', { class: 'muted', text: fmtDate(s.done_at) }) : null]));
    }
    const bar = el('div', { class: 'vs-bar grow' }, [el('span', { style: `width:${pct}%` })]);
    const pctB = el('b', { text: `${done}/${total}` });
    return el('div', { class: 'vs-card' }, [
      el('h3', { text: done >= total && total ? t('v.onboardingDone') : t('v.onboardingTitle') }),
      el('div', { class: 'row', style: 'gap:10px;' }, [bar, pctB]),
      el('p', { class: 'muted', text: t('v.onboardingHint') }),
      el('a', { href: '#/my/onboarding', class: 'btn btn--primary', style: 'margin-bottom:8px;',
        text: done >= total && total ? t('ob.review') : t('ob.continue') }),
      list]);
  }

  function footerLine() {
    return el('footer', { class: 'vs-foot' }, [
      el('span', { text: t('v.footOrg') }),
      el('span', { text: t('v.footMotto') }),
    ]);
  }

  /* ================================================================== */
  /* PROFILE                                                            */
  /* ================================================================== */
  async function profileTab() {
    clear(out);
    out.append(el('div', { class: 'vs-card' }, [
      el('h3', { text: t('v.myLogin') }),
      el('div', { class: 'vs-welcome__line' }, [el('small', { text: t('v.loginEmail') }), el('b', { text: P.email || '' })]),
      el('div', { class: 'vs-welcome__line' }, [el('small', { text: t('v.volunteerId') }), el('b', { text: P.membership_no || t('v.idPending') })]),
      el('div', { class: 'vs-welcome__line' }, [el('small', { text: t('v.lastSignIn') }), el('b', { text: P.last_seen_at ? fmtDateTime(P.last_seen_at) : t('v.thisIsFirst') })]),
      el('p', { class: 'muted', text: t('v.loginHint') }),
      ro ? null : el('a', { href: '#/my/settings', class: 'btn btn--secondary', text: t('v.changePassword') }),
    ]));
    const pct = Number(P.completion || 0);
    const head = el('div', { class: 'vs-card' }, [
      el('div', { class: 'row', style: 'gap:16px;' }, [
        avatarNode(P, 'vs-welcome__ava'),
        el('div', { class: 'grow' }, [
          el('h2', { text: `${P.first_name} ${P.last_name}` }),
          el('div', { class: 'muted', text: `${P.membership_no || t('v.idPending')} \u00B7 ${networkName(P.network)}` }),
          statusBadge(P.status, P.is_leader),
        ]),
        el('div', { style: 'min-width:180px;' }, [
          el('div', { class: 'muted', text: t('v.profileCompletion', { pct }) }),
          el('div', { class: 'vs-bar' }, [el('span', { style: `width:${pct}%` })]),
          pct < 100 ? el('small', { class: 'muted', text: t('v.completeProfile') }) : null,
        ]),
      ]),
    ]);
    // Phase 164: a leader's profile and photo are maintained by Headquarters
    const locked = ro || isLeader;
    if (locked && !ro) head.append(el('p', { class: 'muted', style: 'margin-top:10px;' }, [
      el('span', { text: t('v.profileHqManaged') + ' ' }), el('a', { href: '#/my/support', text: t('v.profileAskHq') })]));
    if (!locked) {
      const file = el('input', { type: 'file', accept: 'image/*', hidden: true });
      file.addEventListener('change', async () => {
        const f = file.files && file.files[0]; if (!f) return;
        try { await uploadAvatar(P.id, f); toast(t('v.photoSaved')); invalidateHome(); location.reload(); }
        catch { toastError(t('errors.save')); }
      });
      head.append(el('div', { class: 'row', style: 'margin-top:10px;' }, [
        el('button', { class: 'btn btn--secondary', text: t('v.changePhoto'), onclick: () => file.click() }), file]));
    }
    out.append(head);

    const f = fields();
    // Phase 218: send only what changed. A box that opened empty (e.g. a
    // stored country that is not in the dropdown) must not wipe the value.
    const readForm = () => ({
      first_name: f.first.value.trim() || P.first_name,
      last_name: f.last.value.trim() || P.last_name,
      phone: f.phone.value.trim() || null,
      country: f.country.value || null,
      state_region: f.state.value.trim() || null,
      lga: f.lga.value.trim() || null,
      birth_date: f.birth.value || null,
      preferred_locale: f.locale.value,
    });
    let shown = readForm();
    const form = el('div', { class: 'vs-card' }, [
      el('h3', { text: t('v.profileDetails') }),
      el('div', { class: 'form-grid' }, [
        field(t('v.firstName'), f.first), field(t('v.lastName'), f.last),
        field(t('v.email'), f.email), field(t('v.phone'), f.phone),
        field(t('v.country'), f.country), field(t('v.state'), f.state),
        field(t('v.lga'), f.lga), field(t('v.roleApplied'), f.role),
        field(t('v.birthDate'), f.birth), field(t('v.preferredLanguage'), f.locale),
      ]),
      el('div', { class: 'form-grid' }, [
        readonlyField(t('v.volunteerId'), P.membership_no || t('v.idPending')),
        readonlyField(t('v.network'), networkName(P.network)),
        readonlyField(t('v.dateJoined'), fmtDate(P.joined_at)),
        readonlyField(t('v.sMyStatus'), t(`status.${P.status}`)),
      ]),
    ]);
    if (locked) { for (const inp of form.querySelectorAll('input, select, textarea')) inp.disabled = true; }
    if (!locked) {
      form.append(el('div', { class: 'row' }, [el('span', { class: 'grow' }),
        el('button', { class: 'btn btn--primary', text: t('v.saveProfile'), onclick: async (e) => {
          e.target.disabled = true;
          try {
            const diff = await saveMyProfileChanges(shown, readForm());
            Object.assign(P, diff);
            shown = readForm();
            toast(t('v.profileSaved')); invalidateHome();
          } catch (err) { toastError(err?.message || t('errors.save')); }
          e.target.disabled = false;
        } })]));
    } else {
      for (const k of Object.keys(f)) f[k].disabled = true;
    }
    out.append(form);
  }

  function fields() {
    // Phase 218: the stored value is always one of the options, even if it
    // is not in the standard list, so it shows and is kept.
    const sel = (opts, cur) => el('select', { class: 'select' },
      [el('option', { value: '', text: '\u2014' }),
       ...(cur && !opts.includes(cur) ? [cur, ...opts] : opts).map((o) =>
        el('option', { value: o, text: o, selected: o === cur || null }))]);
    const states = (P.country === 'Nigeria' || !P.country) ? NG_STATES : [];
    return {
      first: el('input', { class: 'input', value: P.first_name || '' }),
      last: el('input', { class: 'input', value: P.last_name || '' }),
      email: el('input', { class: 'input', value: P.email || '', disabled: true }),
      phone: el('input', { class: 'input', value: P.phone || '', type: 'tel' }),
      country: sel(AFRICAN_COUNTRIES, P.country),
      state: states.length && (!P.state_region || states.includes(P.state_region))
        ? sel(states, P.state_region) : el('input', { class: 'input', value: P.state_region || '' }),
      lga: el('input', { class: 'input', value: P.lga || '' }),
      role: el('input', { class: 'input', value: P.role_applied || '', disabled: true, title: t('v.roleLocked') }),
      birth: el('input', { class: 'input', type: 'date', value: P.birth_date || '' }),
      locale: el('select', { class: 'select' }, supportedLocales().map((c) =>
        el('option', { value: c, text: LOCALE_NAMES[c] || c, selected: c === P.preferred_locale || null }))),
    };
  }

  /* ================================================================== */
  /* NETWORK                                                            */
  /* ================================================================== */
  async function network() {
    clear(out);
    out.append(el('div', { class: 'vs-card' }, [
      el('h3', { text: t('v.whereISit') }),
      el('p', { class: 'muted', text: t('v.whereHint') }),
      chainNode(),
    ]));
    out.append(el('div', { class: 'vs-card' }, [coordinatorNode()]));
    if ((h.roles || []).length) {
      out.append(el('div', { class: 'vs-card' }, [
        el('h3', { text: t('v.mySeats') }),
        ...h.roles.map((r) => el('div', { class: 'vs-seat' }, [
          el('b', { text: t(`role.${r.role}`) }),
          el('span', { class: 'muted', text: `${term(r.level)} \u00B7 ${r.unit} \u00B7 ${t('v.since')} ${fmtDate(r.since)}` }),
        ])),
        el('a', { href: '#/my/leadership', class: 'btn btn--primary vs-cta', text: t('v.openLeadership') }),
      ]));
    }
  }

  /* ================================================================== */
  /* LEADERSHIP (leaders only)                                          */
  /* ================================================================== */
  async function leadership() {
    clear(out);
    if (!isLeader || !h.leadership) {
      out.append(el('div', { class: 'vs-card' }, [
        el('h3', { text: t('v.myLeadership') }),
        el('p', { class: 'muted', text: t('v.leadNotLeader') })]));
      return;
    }
    const L = h.leadership;
    const seat = h.roles[0];
    out.append(el('div', { class: 'vs-card' }, [
      el('h3', { text: t('v.leadHeading', { role: t(`role.${seat.role}`), unit: seat.unit }) }),
      el('div', { class: 'vs-mini' }, [
        mini(t('v.seats'), L.seats), mini(t('v.filled'), L.filled, 'green'),
        mini(t('v.vacant'), L.vacant, L.vacant > 0 ? 'red' : 'green'),
        mini(t('v.membersInScope'), L.members), mini(t('v.activeMembers'), L.members_active, 'green'),
      ]),
      el('p', { class: 'muted', text: t('v.leadLegend') }),
    ]));

    out.append(await onboardingCard());
    const dr = h.direct_reports || [];
    out.append(el('div', { class: 'vs-card' }, [
      el('h3', { text: t('v.directReports', { n: dr.length }) }),
      dr.length ? el('div', {}, dr.map((d) => el('div', { class: 'vs-tree__row vs-tree__row--green' }, [
        el('span', { class: 'vs-tree__dot' }),
        el('div', { class: 'grow' }, [el('b', { text: d.name }),
          el('div', { class: 'muted' }, [el('span', { text: `${t(`role.${d.role}`)} \u00B7 ${d.unit} ` }), apptBadge(d.appointment_status)])]),
        !ro ? el('a', { href: `#/messages?u=${d.id}`, class: 'btn btn--secondary', text: t('v.message') }) : null,
      ]))) : el('p', { class: 'muted', text: t('v.directReportsNone') }),
    ]));

    // hierarchy tree: seat unit → children, from the flat node list
    const nodes = L.nodes || [];
    const byParent = new Map();
    for (const n of nodes) {
      const k = n.parent_id || 'root';
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k).push(n);
    }
    const nodeIds = new Set(nodes.map((n) => n.org_unit_id));
    const roots = nodes.filter((n) => !nodeIds.has(n.parent_id));
    const tree = el('div', { class: 'vs-tree' });
    const draw = (list, depth) => {
      for (const n of list) {
        const st = n.vacant ? 'red' : (staleSeen(n.last_seen) ? 'amber' : 'green');
        const row = el('div', { class: `vs-tree__row vs-tree__row--${st}`,
          style: `padding-left:${12 + depth * 22}px` }, [
          el('span', { class: 'vs-tree__dot' }),
          el('div', { class: 'grow' }, [
            el('b', { text: n.location }),
            el('span', { class: 'muted', text: ` \u00B7 ${term(n.level)}` }),
            el('div', { class: 'muted' }, n.vacant ? [el('span', { text: t('v.seatVacant') })] : [
              el('span', { text: `${n.holder_name} \u00B7 ${t(`role.${n.role}`)} ` }),
              apptBadge(n.appointment_status),
              el('span', { text: n.last_seen ? ` \u00B7 ${t('v.lastSeen')} ${fmtDate(n.last_seen)}` : ` \u00B7 ${t('v.neverSignedIn')}` })]),
          ]),
          (!ro && !n.vacant && n.holder_id) ? el('a', { href: `#/messages?u=${n.holder_id}`,
            class: 'btn btn--secondary', text: t('v.message') }) : null,
          (!ro && n.vacant && ctx.modules?.has('recruitment')) ? el('a', { href: '#/recruitment',
            class: 'btn btn--quiet', text: t('v.referCandidate') }) : null,
        ]);
        tree.append(row);
        draw(byParent.get(n.org_unit_id) || [], depth + 1);
      }
    };
    draw(roots, 0);
    if (!nodes.length) tree.append(el('p', { class: 'muted', text: t('v.leadNoUnits') }));
    if (L.nodes_total > nodes.length) tree.append(el('p', { class: 'muted',
      text: t('v.leadTruncated', { shown: nodes.length, total: L.nodes_total }) }));
    out.append(el('div', { class: 'vs-card' }, [el('h3', { text: t('v.leadStructure') }), tree]));

    out.append(el('div', { class: 'vs-card' }, [
      el('h3', { text: t('v.leadTools') }),
      el('div', { class: 'vs-quick' }, [
        qa('#/tasks', 'tasks', t('v.navTasks')),
        qa('#/meetings', 'calendar', t('v.navMeetings')),
        qa('#/announcements', 'megaphone', t('v.navAnnounce')),
        ctx.modules?.has('recruitment') ? qa('#/recruitment', 'userplus', t('v.navVacancies')) : null,
        ctx.modules?.has('reports') ? qa('#/reports', 'chart', t('v.navReports')) : null,
        qa('#/me', 'home', t('v.phoneView')),
      ]),
      el('p', { class: 'muted', text: t('v.leadGovernance') }),
    ]));
  }

  function staleSeen(iso) {
    if (!iso) return true;
    return (Date.now() - new Date(iso).getTime()) > 30 * 86400000;
  }

  /* ================================================================== */
  /* LEARNING                                                           */
  /* ================================================================== */
  async function learning() {
    clear(out);
    const L = learningSummary();
    out.append(el('div', { class: 'vs-card' }, [
      el('h3', { text: P.network === 'WNNN' ? t('v.learnProgWnnn') : t('v.learnProgWgmn') }),
      el('div', { class: 'row', style: 'gap:10px;' }, [
        el('div', { class: 'vs-bar grow' }, [el('span', { style: `width:${L.percent}%` })]),
        el('b', { text: `${L.percent}%` })]),
      el('p', { class: 'muted', text: t('v.learnOverall', { p: L.passed, n: L.total }) }),
      el('p', { class: 'muted', text: t('v.learnInstitute') }),
    ]));
    const box = el('div');
    out.append(box);
    if (ro) {
      for (const c of L.courses) {
        box.append(el('div', { class: 'vs-card' }, [
          el('b', { text: c.title }),
          el('div', { class: 'muted', text: c.enrollment_id
            ? t('v.learnOverall', { p: c.modules_passed, n: c.modules_total })
            : t('v.learnNotEnrolled') }),
          ...(c.modules || []).map((m) => el('div', { class: 'muted',
            text: `${t('v.module')} ${m.seq} \u2013 ${m.title}: ${t(m.passed ? 'v.modCompleted' : 'v.modNotStarted')}` })),
        ]));
      }
      return;
    }
    try { await renderCourses(box, ctx.profile, () => invalidateHome()); }
    catch { box.append(el('p', { class: 'muted', text: t('errors.loadHint') })); }
  }

  /* ================================================================== */
  /* IMPACT                                                             */
  /* ================================================================== */
  async function impact() {
    clear(out);
    const im = h.impact || {};
    out.append(el('div', { class: 'vs-card' }, [
      el('h3', { text: t('v.myImpact') }),
      el('p', { class: 'muted', text: t('v.impactHint') }),
      el('div', { class: 'vs-impact vs-impact--wide' }, [
        tileI('users', im.women_reached, t('v.womenReached'), 'pink'),
        tileI('userplus', im.referrals, t('v.communityReferrals'), 'green'),
        tileI('calendar', im.meetings_attended, t('v.meetingsAttended'), 'amber'),
        tileI('check', im.tasks_completed, t('v.tasksCompleted'), 'lime'),
        tileI('book', im.modules_completed, t('v.modulesCompleted'), 'violet'),
        tileI('chart', im.months_of_service, t('v.monthsOfService'), 'gold'),
      ]),
      el('p', { class: 'muted', text: t('v.serviceSince', { d: fmtDate(im.service_since) }) }),
    ]));
    out.append(achievementsCard());
    out.append(el('div', { class: 'vs-card' }, [
      el('h3', { text: t('v.impactHow') }),
      el('ul', { class: 'vs-list' }, [
        el('li', { text: t('v.impactHow1') }), el('li', { text: t('v.impactHow2') }),
        el('li', { text: t('v.impactHow3') }), el('li', { text: t('v.impactHow4') }),
      ]),
    ]));
  }

  /* ================================================================== */
  /* REFERRALS                                                          */
  /* ================================================================== */
  async function referrals() {
    clear(out);
    // Phase 199: the two referral forms, one per network
    if (isLeader && !ro) {
      try {
        const { joinUrl } = await import('../core/db.js');
        const card = (code, label, logo) => { const url = joinUrl(code); return el('div', { class: `hqa-form hqa-form--${code.toLowerCase()}` }, [
          el('div', { class: 'hqa-form__head' }, [el('img', { src: logo, alt: code, class: 'hqa-form__logo' }), el('b', { text: label })]),
          el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;' }, [
            el('code', { style: 'user-select:all;font-size:13px;font-weight:700;', text: url }),
            el('button', { class: 'btn btn--primary', text: t('acc.copy'), onclick: async () => { try { await navigator.clipboard.writeText(url); toast(t('acc.copied')); } catch { /* ignore */ } } }),
            el('a', { href: `https://wa.me/?text=${encodeURIComponent(t('join.shareText', { url }))}`, target: '_blank', rel: 'noopener', class: 'btn btn--quiet', text: 'WhatsApp' })])]); };
        out.append(el('section', { class: 'vs-card' }, [el('h3', { text: t('hqa.twoForms') }), el('p', { class: 'muted', text: t('hqa.twoFormsLeader') }),
          el('div', { class: 'ca-grid ca-grid--eq' }, [card('WGMN', t('join.labelWgmn'), '/assets/logos/wgmn-disc.png'), card('WNNN', t('join.labelWnnn'), '/assets/logos/wnnn-disc.png')])]));
      } catch { /* optional */ }
    }
    const list = el('div');
    const drawList = () => {
      clear(list);
      const rows = h.referrals || [];
      if (!rows.length) { list.append(el('p', { class: 'muted', text: t('v.refNone') })); return; }
      for (const r of rows) list.append(referralRow(r));
    };
    out.append(el('div', { class: 'vs-card' }, [
      el('div', { class: 'row' }, [
        el('h3', { class: 'grow', text: t('v.myReferrals') }),
        !ro ? el('button', { class: 'btn btn--primary', text: t('v.newReferral'),
          onclick: () => referralModal(async () => { h = await getHome(true); drawList(); }) }) : null,
      ]),
      el('p', { class: 'muted', text: t('v.refHint') }),
      list,
    ]));
    drawList();
  }

  function referralRow(r) {
    const idx = REFERRAL_LADDER.indexOf(r.status);
    return el('div', { class: 'vs-ref' }, [
      el('div', { class: 'row' }, [
        el('b', { text: `${r.ref_no || ''} \u00B7 ${t('v.refCat_' + r.category)}` }),
        el('span', { class: 'grow' }),
        el('small', { class: 'muted', text: fmtDate(r.created_at) })]),
      el('div', { text: r.reason }),
      el('ol', { class: 'vs-ladder' }, REFERRAL_LADDER.map((s, i) =>
        el('li', { class: i < idx ? 'done' : (i === idx ? 'now' : ''), text: t('v.refSt_' + s) }))),
    ]);
  }

  function referralModal(onDone) {
    const cat = el('select', { class: 'select' }, REFERRAL_CATS.map((c) =>
      el('option', { value: c, text: t('v.refCat_' + c) })));
    const country = el('input', { class: 'input', value: P.country || '' });
    const state = el('input', { class: 'input', value: P.state_region || '' });
    const lga = el('input', { class: 'input', value: P.lga || '' });
    const community = el('input', { class: 'input' });
    const reason = el('input', { class: 'input', maxlength: '300' });
    const details = el('textarea', { class: 'input', rows: '4', maxlength: '3000' });
    const consent = el('input', { type: 'checkbox' });
    const err = el('p', { class: 'field__error', role: 'alert', hidden: true });
    const send = el('button', { class: 'btn btn--primary', text: t('v.submitReferral') });
    send.addEventListener('click', async () => {
      if (reason.value.trim().length < 3) { err.textContent = t('v.refNeedReason'); err.hidden = false; return; }
      if (!consent.checked) { err.textContent = t('v.refNeedConsent'); err.hidden = false; return; }
      err.hidden = true; send.disabled = true;
      try {
        const r = await submitReferral({
          category: cat.value, country: country.value.trim() || null,
          state_region: state.value.trim() || null, lga: lga.value.trim() || null,
          community: community.value.trim() || null, reason: reason.value.trim(),
          details: details.value.trim() || null,
        });
        closeModal(); toast(t('v.refSubmitted', { no: r.ref_no })); invalidateHome();
        if (onDone) await onDone();
      } catch (e) { err.textContent = e?.message || t('errors.save'); err.hidden = false; send.disabled = false; }
    });
    openModal(t('v.newReferral'), el('div', {}, [
      el('p', { class: 'muted', text: t('v.refSafeguardingNote') }),
      field(t('v.refCategory'), cat),
      el('div', { class: 'form-grid' }, [field(t('v.country'), country), field(t('v.state'), state),
        field(t('v.lga'), lga), field(t('v.community'), community)]),
      field(t('v.refReason'), reason), field(t('v.refDetails'), details),
      el('label', { class: 'row', style: 'gap:8px;margin:6px 0 12px;' }, [consent, el('span', { text: t('v.refConsent') })]),
      err, el('div', { class: 'row' }, [el('span', { class: 'grow' }), send]),
    ]));
  }

  /* ================================================================== */
  /* DOCUMENTS                                                          */
  /* ================================================================== */
  async function documents() {
    clear(out);
    out.append(el('div', { class: 'vs-card' }, [
      el('h3', { text: t('v.myDocuments') }),
      el('p', { class: 'muted', text: t('v.docsHint') }),
      ...STATIC_DOCS.map((d) => docRow(t(d.key), d.href, d.kind)),
    ]));
    const rows = h.documents || [];
    out.append(el('div', { class: 'vs-card' }, [
      el('h3', { text: t('v.sharedDocs') }),
      rows.length ? el('div', {}, rows.map((d) => docRow(`${d.folder} \u00B7 ${d.name}`,
        documentUrl(d.path), 'file', fmtDate(d.created_at))))
        : el('p', { class: 'muted', text: t('v.docsNone') }),
      ctx.modules?.has('documents') ? el('a', { href: '#/documents', class: 'btn btn--secondary vs-cta',
        text: t('v.openLibrary') }) : null,
    ]));
    const certs = (h.learning || []).filter((c) => c.cert_no);
    if (certs.length) out.append(el('div', { class: 'vs-card' }, [
      el('h3', { text: t('v.myCertificates') }),
      ...certs.map((c) => el('div', { class: 'vs-doc' }, [icon('check', 18),
        el('span', { class: 'grow', text: `${c.title} \u00B7 ${c.cert_no}` }),
        el('a', { href: '#/my/learning', class: 'btn btn--quiet', text: t('v.view') })])),
    ]));
  }

  function docRow(name, href, kind, when) {
    return el('div', { class: 'vs-doc' }, [
      icon(kind === 'pdf' ? 'file' : 'folder', 18),
      el('span', { class: 'grow', text: name }),
      when ? el('small', { class: 'muted', text: when }) : null,
      el('a', { href, target: '_blank', rel: 'noopener', class: 'btn btn--quiet', text: t('v.view') }),
    ]);
  }

  /* ================================================================== */
  /* TEMPLATES & TOOLS (founder's operational templates)                */
  /* ================================================================== */
  async function templates() {
    clear(out);
    let list = [];
    try { list = await (await fetch('/content/templates/index.json', { cache: 'no-cache' })).json(); }
    catch { list = []; }
    const card = el('div', { class: 'vs-card' }, [el('h3', { text: t('v.navTemplates') }),
      el('p', { class: 'muted', text: t('v.templatesHint') })]);
    if (!list.length) card.append(el('p', { class: 'muted', text: t('v.docsNone') }));
    for (const d of list) {
      card.append(el('div', { class: 'vs-doc' }, [
        icon('file', 18),
        el('div', { class: 'grow' }, [el('b', { text: d.title }), el('div', { class: 'muted', text: d.kind })]),
        d.pdf ? el('a', { href: `/content/templates/${d.pdf}`, target: '_blank', rel: 'noopener', class: 'btn btn--secondary', text: t('v.read') }) : null,
        el('a', { href: `/content/templates/${d.file}`, download: d.file, class: 'btn btn--quiet', text: t('v.download') }),
      ]));
    }
    out.append(card);
  }

  /* ================================================================== */
  /* MY ONBOARDING (acceptance + checklist, the gate for everything else) */
  /* ================================================================== */
  /* Phase 185 — every message in one place (replaces the retired #/me feed) */
  async function messages() {
    clear(out);
    // Phase 187: the dashboard shows the weekly message on Monday only, so My
    // Messages must always show it, whatever day she opens the page.
    const card = await hqMessageCard(true);
    const monthly = await monthlyCard(true);
    if (card) out.append(card);
    if (monthly) out.append(monthly);
    try {
      const { myHqArchive } = await import('../core/db.js');
      const arch = await myHqArchive(30);
      if (arch && arch.length > 1) {
        out.append(el('section', { class: 'vs-card' }, [
          el('h3', { text: t('wi.archiveTitle') }),
          el('div', {}, arch.slice(1).map((a) => el('article', { class: 'msg__item' }, [
            el('img', { class: 'wi__thumb', src: a.graphic, alt: '', loading: 'lazy' }),
            el('div', { class: 'grow' }, [
              el('div', { class: 'msg__kick' }, [el('b', { text: t('wi.from') }),
                el('span', { class: 'wi__label', text: t('wi.label') }),
                el('small', { class: 'muted', text: `${a.network} \u00B7 ${t('wi.week', { n: a.week_no })}` })]),
              el('h4', { text: a.headline }),
              a.body ? el('p', { class: 'msg__body', text: a.body }) : null,
              a.key_thought ? el('blockquote', { class: 'wi__key', text: `\u201C${a.key_thought}\u201D` }) : null,
              el('p', { class: 'msg__sign', text: '\u2014 WODDI HQ' })]),
          ]))),
        ]));
      }
    } catch { /* archive is best-effort */ }
    const { getMyNotices, markNoticeRead } = await import('../core/db.js');
    let notices = [];
    try { notices = await getMyNotices(40); } catch { notices = []; }
    if (!card && !monthly && !notices.length) {
      out.append(el('div', { class: 'vs-card' }, [el('h3', { text: t('msg.mine') }), el('p', { class: 'muted', text: t('msg.none') })]));
      return;
    }
    if (notices.length) {
      out.append(el('section', { class: 'vs-card' }, [
        el('h3', { text: t('msg.earlier') }),
        el('div', { class: 'msg__list' }, notices.map((nz) => {
          const item = el('article', { class: 'msg__item' + (nz.read_at ? '' : ' msg__item--new') }, [
            el('span', { class: `msg__dot msg__dot--${(nz.meta && nz.meta.tone) || (nz.kind === 'birthday' ? 'celebration' : 'purpose')}` }),
            el('div', { class: 'grow' }, [
              el('div', { class: 'msg__kick' }, [el('b', { text: t('msg.from') }),
                el('span', { class: `msg__tag msg__tag--${nz.kind}`, text: t('me.notice.' + nz.kind) }),
                el('small', { class: 'muted', text: fmtDate(nz.created_at) })]),
              el('h4', { text: nz.title }),
              nz.body ? el('p', { class: 'msg__body', text: nz.body }) : null,
              el('p', { class: 'msg__sign', text: '\u2014 WODDI HQ' })]),
          ]);
          if (!nz.read_at) markNoticeRead(nz.id).catch(() => {});
          return item;
        })),
      ]));
    }
  }

  async function onboarding() {
    clear(out);
    if (isLeader && !ro) {
      const pending = (h.roles || []).filter((r) => !r.accepted_at && !r.declined_at);
      if (pending.length) out.append(acceptanceCard(pending));
    }
    const holder = el('div', {});
    out.append(holder);
    const { renderOnboarding } = await import('./onboarding.js');
    await renderOnboarding(holder, { ro, profileId: ro ? P.id : null, selfId: P.id });
  }

  function networkBanner() {
    const net = P.network || 'WODDI';
    return el('div', { class: `vs-netbanner vs-netbanner--${net.toLowerCase()}` }, [
      net === 'WGMN' ? el('img', { src: '/assets/wgmn-logo.png', alt: 'WGMN', class: 'vs-netbanner__logo' }) : null,
      el('div', {}, [
        el('b', { text: t('v.netBannerTitle', { net, full: net === 'WNNN' ? t('vol.wnnnFull') : t('vol.wgmnFull') }) }),
        el('small', { text: isLeader ? t('v.netBannerLeader') : t('v.netBannerMember') })]),
    ]);
  }

  /* ================================================================== */
  /* MY COUNTRY (structure below me: coverage, responsiveness, reports)   */
  /* ================================================================== */
  async function country() {
    clear(out);
    if (!isLeader) { out.append(el('div', { class: 'vs-card' }, [el('h3', { text: t('v.navCountry') }), el('p', { class: 'muted', text: t('v.leadNotLeader') })])); return; }
    const { renderCountryPanel } = await import('./country.js');
    await renderCountryPanel(out, { profile: P, ro });
  }

  /* ================================================================== */
  /* REFERRAL LINKS (leaders)                                            */
  /* ================================================================== */
  async function reflinks() {
    clear(out);
    if (!isLeader) { out.append(el('div', { class: 'vs-card' }, [el('h3', { text: t('nav.reflinks') }), el('p', { class: 'muted', text: t('v.leadNotLeader') })])); return; }
    const { renderReferralPanel } = await import('./reflinks.js');
    await renderReferralPanel(out, { hq: false, profile: P, net: P.network });
  }

  /* ================================================================== */
  /* CALENDAR                                                           */
  /* ================================================================== */
  async function calendar() {
    clear(out);
    // Appendix §2: the master engagement calendar shows on the leader's own calendar
    try {
      const { data } = await db().from('engagement_items').select('id,kind,title,network,due_on,status').gte('due_on', new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)).lte('due_on', new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10)).order('due_on');
      const mine = (data || []).filter((e) => !e.network || e.network === P.network);
      if (mine.length) {
        const c = el('div', { class: 'vs-card' }, [el('h3', { text: t('dp.engCalendar') }), el('p', { class: 'muted', text: t('dp.engHint') })]);
        for (const e of mine.slice(0, 12)) c.append(el('div', { class: 'ca-attn' }, [el('span', { class: `vs-badge vs-badge--${e.status === 'completed' ? 'green' : e.status === 'missed' ? 'red' : e.status === 'due' || e.status === 'upcoming' ? 'amber' : 'grey'}`, text: t('eng.st_' + e.status) }),
          el('div', { class: 'grow' }, [el('b', { text: e.title }), el('div', { class: 'muted', text: `${t('eng.k_' + e.kind)} · ${fmtDate(e.due_on)}` })]),
          ro ? null : el('button', { class: 'btn btn--secondary', text: t('dp.tookPart'), onclick: async (ev) => { try { await db().rpc('engagement_participate', { p_item: e.id, p_kind: 'participated' }); ev.target.textContent = t('dp.recorded'); ev.target.disabled = true; } catch { toastError(t('errors.save')); } } })]));
        out.append(c);
      }
    } catch { /* calendar continues without engagement items */ }
    const items = [];
    for (const m of (h.meetings || [])) items.push({ at: m.starts_at, kind: 'meeting', title: m.title, href: '#/meetings' });
    for (const tk of (h.tasks || [])) if (tk.due_on) items.push({ at: tk.due_on, kind: 'task', title: tk.title, href: '#/tasks' });
    if (h.journey && h.journey.status === 'in_progress') {
      items.push({ at: h.journey.extended_until || h.journey.due_at, kind: 'journey', title: t('v.journeyDeadline'), href: '#/me/journey' });
    }
    items.sort((a, b) => new Date(a.at) - new Date(b.at));
    const byMonth = new Map();
    for (const it of items) {
      const d = new Date(it.at);
      const key = d.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' });
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(it);
    }
    const card = el('div', { class: 'vs-card' }, [el('h3', { text: t('v.myCalendar') }),
      el('p', { class: 'muted', text: t('v.calHint') })]);
    if (!items.length) card.append(el('p', { class: 'muted', text: t('v.calNone') }));
    for (const [month, list] of byMonth) {
      card.append(el('h4', { class: 'vs-cal__month', text: month.toUpperCase() }));
      for (const it of list) {
        const d = new Date(it.at);
        card.append(el('a', { href: it.href, class: `vs-cal vs-cal--${it.kind}` }, [
          el('b', { text: String(d.getDate()).padStart(2, '0') }),
          el('span', { class: 'grow', text: it.title }),
          el('small', { class: 'muted', text: t('v.cal_' + it.kind) }),
        ]));
      }
    }
    out.append(card);
  }

  /* ================================================================== */
  /* SUPPORT                                                            */
  /* ================================================================== */
  async function support() {
    clear(out);
    const tk = h.tickets || {};
    const listBox = el('div');
    const drawTickets = () => {
      clear(listBox);
      const rows = tk.recent || [];
      if (!rows.length) { listBox.append(el('p', { class: 'muted', text: t('v.ticketsNone') })); return; }
      for (const r of rows) listBox.append(el('div', { class: 'vs-ticket' }, [
        el('b', { text: r.ticket_no || '' }), el('span', { class: 'grow', text: r.subject }),
        el('span', { class: `vs-badge vs-badge--${['resolved', 'closed'].includes(r.status) ? 'green' : 'blue'}`,
          text: t('ticketstatus.' + r.status) })]));
    };
    out.append(el('div', { class: 'vs-card' }, [
      el('h3', { text: t('v.needHelp') }),
      el('p', { class: 'muted', text: t('v.supportHint') }),
      el('div', { class: 'vs-quick' }, [
        !ro ? qaBtn('support', t('v.supTech'), () => ticketModal('technical', drawTickets)) : null,
        h.coordinator && !ro ? qa(`#/messages?u=${h.coordinator.id}`, 'users', t('v.supCoordinator')) : null,
        !ro ? qaBtn('book', t('v.supLearning'), () => ticketModal('training_access', drawTickets)) : null,
        qa('#/my/safeguarding', 'shield', t('v.supSafeguarding'), 'danger'),
        !ro ? qaBtn('clip', t('v.supProblem'), () => ticketModal('app_problem', drawTickets)) : null,
        qa('#/ask', 'support', t('v.supFaq')),
        qa('#/messages', 'users', t('v.messageHq')),
      ]),
    ]));
    out.append(el('div', { class: 'vs-card' }, [
      el('div', { class: 'row' }, [el('h3', { class: 'grow', text: t('v.myTickets') }),
        el('span', { class: 'muted', text: t('v.ticketCounts', { o: tk.open || 0, r: tk.resolved || 0 }) })]),
      listBox,
    ]));
    drawTickets();
  }

  function qaBtn(ic, label, onclick) {
    return el('button', { class: 'vs-qa', onclick }, [icon(ic, 18), el('span', { text: label })]);
  }

  function ticketModal(defaultCat, onDone) {
    const cat = el('select', { class: 'select' }, TICKET_CATS.map((c) =>
      el('option', { value: c, text: t('ticketcat.' + c), selected: c === defaultCat || null })));
    const subject = el('input', { class: 'input', maxlength: '160' });
    const details = el('textarea', { class: 'input', rows: '5', maxlength: '4000' });
    const err = el('p', { class: 'field__error', role: 'alert', hidden: true });
    const send = el('button', { class: 'btn btn--primary', text: t('v.sendRequest') });
    send.addEventListener('click', async () => {
      if (subject.value.trim().length < 3 || details.value.trim().length < 5) {
        err.textContent = t('v.ticketNeed'); err.hidden = false; return;
      }
      err.hidden = true; send.disabled = true;
      try {
        const r = await fileTicket({ category: cat.value, priority: 'medium',
          subject: subject.value.trim(), details: details.value.trim() });
        closeModal(); toast(t('v.ticketFiled', { no: r.ticket_no || '' }));
        invalidateHome(); h = await getHome(true); if (onDone) onDone();
      } catch (e) { err.textContent = e?.message || t('errors.save'); err.hidden = false; send.disabled = false; }
    });
    openModal(t('v.newTicket'), el('div', {}, [
      field(t('v.ticketCategory'), cat), field(t('v.ticketSubject'), subject),
      field(t('v.ticketDetails'), details), err,
      el('div', { class: 'row' }, [el('span', { class: 'grow' }), send]),
    ]));
  }

  /* ================================================================== */
  /* SAFEGUARDING                                                       */
  /* ================================================================== */
  async function safeguarding() {
    clear(out);
    const subject = el('input', { class: 'input', maxlength: '160' });
    const details = el('textarea', { class: 'input', rows: '6', maxlength: '8000' });
    const err = el('p', { class: 'field__error', role: 'alert', hidden: true });
    const done = el('div', { hidden: true });
    const send = el('button', { class: 'btn btn--primary', text: t('v.sgSubmit') });
    send.addEventListener('click', async () => {
      if (subject.value.trim().length < 3 || details.value.trim().length < 10) {
        err.textContent = t('v.sgNeed'); err.hidden = false; return;
      }
      err.hidden = true; send.disabled = true;
      try {
        const c = await fileCase({ category: 'safeguarding', org_unit_id: P.org_unit_id || null,
          subject: subject.value.trim(), details: details.value.trim() });
        subject.value = ''; details.value = '';
        done.hidden = false;
        done.replaceChildren(el('div', { class: 'vs-ok' }, [icon('check', 18),
          el('span', { text: t('v.sgFiled', { no: c.case_no || '' }) })]));
        toast(t('v.sgFiledToast'));
      } catch (e) { err.textContent = e?.message || t('errors.save'); err.hidden = false; }
      send.disabled = false;
    });
    out.append(el('div', { class: 'vs-card vs-card--danger' }, [
      el('h3', { text: t('v.sgTitle') }),
      el('p', { text: t('v.sgIntro') }),
      el('ul', { class: 'vs-list' }, [el('li', { text: t('v.sgPoint1') }),
        el('li', { text: t('v.sgPoint2') }), el('li', { text: t('v.sgPoint3') })]),
      ro ? el('p', { class: 'muted', text: t('v.sgReadOnly') }) : el('div', {}, [
        field(t('v.sgSubject'), subject), field(t('v.sgDetails'), details), err, done,
        el('div', { class: 'row' }, [el('span', { class: 'grow' }), send])]),
    ]));
  }

  /* ================================================================== */
  /* SETTINGS                                                           */
  /* ================================================================== */
  async function settings() {
    clear(out);
    const localeSel = el('select', { class: 'select' }, supportedLocales().map((c) =>
      el('option', { value: c, text: LOCALE_NAMES[c] || c, selected: c === getLocale() || null })));
    localeSel.addEventListener('change', async () => {
      try { await setLocale(localeSel.value); await updateMyProfile({ preferred_locale: localeSel.value }); location.reload(); }
      catch { toastError(t('errors.localeLoad')); }
    });
    const dark = document.documentElement.dataset.theme === 'dark';
    const theme = el('button', { class: 'btn btn--secondary', text: dark ? t('v.themeLight') : t('v.themeDark'),
      onclick: () => {
        const d = document.documentElement.dataset.theme !== 'dark';
        document.documentElement.dataset.theme = d ? 'dark' : '';
        localStorage.setItem('wdos.theme', d ? 'dark' : 'light');
        theme.textContent = d ? t('v.themeLight') : t('v.themeDark');
      } });
    out.append(el('div', { class: 'vs-card' }, [
      el('h3', { text: t('v.navSettings') }),
      el('div', { class: 'form-grid' }, [field(t('v.preferredLanguage'), localeSel),
        field(t('v.appearance'), theme)]),
      el('div', { class: 'row', style: 'gap:8px;' }, [
        el('button', { class: 'btn btn--secondary', text: t('bn.enableBtn'), onclick: async (e) => {
          const { enableBrowserNotifications } = await import('../core/notifybrowser.js');
          const st = await enableBrowserNotifications(ctx.profile);
          if (st === 'granted') {
            try { const { enablePush } = await import('../core/push.js'); await enablePush(); } catch { /* optional */ }
          }
          e.target.textContent = st === 'granted' ? t('bn.onShort') : t('bn.enableBtn');
        } }),
        el('a', { href: '#/me', class: 'btn btn--quiet', text: t('v.phoneView') }),
      ]),
    ]));
    if (ro) return;
    const pw1 = el('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
    const pw2 = el('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
    const pwErr = el('p', { class: 'field__error', role: 'alert', hidden: true });
    out.append(el('div', { class: 'vs-card' }, [
      el('h3', { text: t('acct.title') }), el('p', { class: 'muted', text: t('acct.hint') }),
      el('div', { class: 'form-grid' }, [field(t('acct.newPw'), pw1), field(t('acct.confirmPw'), pw2)]),
      pwErr,
      el('div', { class: 'row' }, [el('span', { class: 'grow' }),
        el('button', { class: 'btn btn--secondary', text: t('acct.change'), onclick: async (e) => {
          if (pw1.value.length < 8) { pwErr.textContent = t('acct.errShort'); pwErr.hidden = false; return; }
          if (pw1.value !== pw2.value) { pwErr.textContent = t('acct.errMatch'); pwErr.hidden = false; return; }
          pwErr.hidden = true; e.target.disabled = true;
          try { await changePassword(pw1.value); pw1.value = ''; pw2.value = ''; toast(t('acct.changed')); }
          catch (err) {
            pwErr.textContent = String(err?.message ?? '').includes('different from the old')
              ? t('acct.errSame') : t('errors.save');
            pwErr.hidden = false;
          } finally { e.target.disabled = false; }
        } })]),
    ]));
  }

  /* ================================================================== */
  /* small helpers                                                      */
  /* ================================================================== */
  function unitOf(level) {
    const c = (h.chain || []).find((x) => x.level === level);
    return c ? c.name : null;
  }
  function mini(label, value, tone = '') {
    return el('div', { class: `vs-mini__t ${tone ? 'vs-mini__t--' + tone : ''}` }, [
      el('b', { text: fmtNumber(value || 0) }), el('small', { text: label })]);
  }
  function tileI(ic, value, label, tone) {
    return el('div', { class: `vs-imp vs-imp--${tone}` }, [
      el('div', { class: 'vs-imp__ic' }, [icon(ic, 20)]),
      el('b', { text: fmtNumber(value || 0) }), el('small', { text: label })]);
  }
  function field(label, node) {
    return el('div', { class: 'field' }, [el('label', { class: 'field__label', text: label }), node]);
  }
  function readonlyField(label, value) {
    return field(label, el('input', { class: 'input', value: value || '', disabled: true }));
  }
}

export function flagNode(p, bundle, size = 22) {
  const iso = countryIso(p.country || (bundle?.chain || []).find((c) => c.level === 'country')?.name, bundle?.country_iso);
  const src = flagSrc(iso);
  if (!src) return null;
  return el('img', { class: 'vs-flag', src, alt: iso, title: p.country || iso, width: String(Math.round(size * 4 / 3)), height: String(size),
    onerror: (e) => { e.target.remove(); } });
}

function statusBadge(status, leader) {
  const good = ['active', 'activated', 'in_training', 'reinstated', 'approved'].includes(status);
  return el('span', { class: `vs-status ${good ? 'vs-status--ok' : 'vs-status--warn'}` }, [
    good ? icon('check', 12) : null,
    el('span', { text: leader ? t('v.activeLeader') : t(`v.st_${status}`) }),
  ]);
}

function avatarNode(p, cls) {
  const initials = ((p.first_name || '?')[0] + (p.last_name || '')[0]).toUpperCase();
  const img = el('img', { class: cls, alt: '', src: avatarUrl(p.id, Math.floor(Date.now() / 3600000)) });
  return withDriveFallback(img, p, () => el('div', { class: cls, text: initials }));
}

function errorState(retry, err) {
  return el('div', { class: 'card state' }, [
    el('h3', { text: t('errors.loadTitle') }),
    el('p', { text: t('errors.loadHint') }),
    (String(err?.message || err?.code || '') ? el('p', { class: 'muted',
      style: 'font-size:12px;word-break:break-word;',
      text: String(err?.message || err?.code || '').slice(0, 200) }) : null),
    el('button', { class: 'btn btn--quiet', text: t('app.retry'), onclick: retry }),
  ]);
}
