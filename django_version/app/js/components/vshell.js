/**
 * Phase 131 — the Volunteer Dashboard shell.
 *
 * One shell for every WGMN/WNNN member and volunteer leader: white header
 * (logo, WDOS title, notifications, messages, help, identity), navy sidebar
 * with the fifteen volunteer areas, canvas content. The menu is role-aware:
 * "My Leadership", "Leadership Vacancies" and "Reports" appear only for
 * people who hold a leadership seat / the module. HQ staff never see this
 * shell; they keep the central management dashboard.
 *
 * Every page that calls renderShell() gets this chrome automatically when
 * the signed-in person is not HQ (layout.js delegates here), so #/tasks,
 * #/meetings, #/announcements, #/messages look like the rest of the
 * volunteer experience without any page-level change.
 */
import { el, esc, clear } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { signOut, avatarUrl, APP_VERSION, EXPECTED_SCHEMA_VERSION } from '../core/db.js';
import { getHome } from '../core/homecache.js';
import { countryIso, flagSrc } from '../core/geo.js';
import { withDriveFallback } from '../core/photos.js';
import { icon, iconFor } from './icons.js';
import { bellButton } from './notify.js';
import { toastError } from './toast.js';

const NETWORK_NAME = { WGMN: 'Good Mother Network', WNNN: 'Nurture NextGen Network' };

// Phase 145: the sidebar follows the founder's "Country Representative WDOS
// Dashboard Sidebar" (17 sections). Sections with no screen of their own
// yet point at the closest working screen. Sections marked leader show for
// seated leaders only; `module` follows HQ module grants.
// Phase 150: the sidebar mirrors the founder's "Country Representative WDOS
// Dashboard Sidebar" section by section (1 to 17) and sub-section by
// sub-section. Every entry points at a working screen; where a sub-section's
// dedicated screen is not built yet, the entry opens the closest screen that
// holds that information (never a dead link). `module` entries fall back to
// `alt` when the member does not hold that module. Groups collapse; the
// current group stays open.
const MENU = [
  { group: 'sb.1', items: [
    { hash: '#/', key: 'sb.1_0', icon: 'home', open: true },
    { hash: '#/my/country', key: 'sb.1_1', icon: 'sitemap', leader: true },
    { hash: '#/reporting/dashboard', key: 'sb.1_2', icon: 'shield', leader: true },
    { hash: '#/tasks', key: 'sb.1_3', icon: 'tasks', module: 'tasks', alt: '#/my/onboarding' },
    { hash: '#/reporting/compliance', key: 'sb.1_4', icon: 'chart', leader: true }]},
  { group: 'sb.2', leader: true, items: [
    { hash: '#/my/leadership', key: 'sb.2_1', icon: 'shield' },
    { hash: '#/structure?level=state_region', key: 'sb.2_2', icon: 'sitemap' },
    { hash: '#/structure?level=district_lga', key: 'sb.2_3', icon: 'sitemap' },
    { hash: '#/structure?level=community_cluster', key: 'sb.2_4', icon: 'sitemap' },
    { hash: '#/structure?level=chapter', key: 'sb.2_5', icon: 'sitemap' },
    { hash: '#/structure?status=vacant', key: 'sb.2_6', icon: 'briefcase' },
    { hash: '#/structure?status=filled&appt=appointed', key: 'sb.2_7', icon: 'users' },
    { hash: '#/structure?activation=active', key: 'sb.2_8', icon: 'users' },
    { hash: '#/structure?activation=inactive', key: 'sb.2_9', icon: 'users' },
    { hash: '#/structure?appt=pending', key: 'sb.2_10', icon: 'users' },
    { hash: '#/structure?status=vacant', key: 'sb.2_11', icon: 'briefcase' },
    { hash: '#/my/network', key: 'sb.2_12', icon: 'users' }]},
  { group: 'sb.3', items: [
    { hash: '#/my/referrals', key: 'sb.3_1', icon: 'userplus' },
    { hash: '#/hq/activation', key: 'sb.3_7', icon: 'chart', module: 'recruitment', alt: '#/my/referrals' },
    { hash: '#/recruitment', key: 'sb.3_2', icon: 'userplus', module: 'recruitment', alt: '#/my/reflinks' },
    { hash: '#/recruitment', key: 'sb.3_3', icon: 'userplus', module: 'recruitment', alt: '#/my/reflinks' },
    { hash: '#/recruitment', key: 'sb.3_4', icon: 'userplus', module: 'recruitment', alt: '#/my/messages' },
    { hash: '#/recruitment', key: 'sb.3_5', icon: 'userplus', module: 'recruitment', alt: '#/structure?appt=pending' },
    { hash: '#/structure?appt=pending', key: 'sb.3_6', icon: 'users', leader: true },
    { hash: '#/my/reflinks', key: 'sb.3_7', icon: 'userplus', leader: true }]},
  { group: 'sb.4', items: [
    { hash: '#/', key: 'dp.title', icon: 'briefcase', deputy: true },
    { hash: '#/tasks?view=mine', key: 'sb.4_1', icon: 'tasks', module: 'tasks', alt: '#/my/onboarding' },
    { hash: '#/tasks?view=assigned', key: 'sb.4_2', icon: 'tasks', module: 'tasks', alt: '#/my/onboarding' },
    { hash: '#/tasks?view=overdue', key: 'sb.4_3', icon: 'tasks', module: 'tasks', alt: '#/my/onboarding' },
    { hash: '#/tasks?view=done', key: 'sb.4_4', icon: 'tasks', module: 'tasks', alt: '#/my/onboarding' },
    { hash: '#/reporting/records', key: 'sb.4_5', icon: 'clip', leader: true }]},
  { group: 'sb.5', leader: true, items: [
    { hash: '#/reporting/mine', key: 'sb.5_1', icon: 'chart' },
    { hash: '#/reporting/review', key: 'sb.5_2', icon: 'chart' },
    { hash: '#/reporting/compliance', key: 'sb.5_3', icon: 'chart' },
    { hash: '#/reporting/review', key: 'sb.5_4', icon: 'chart' },
    { hash: '#/reporting/compliance', key: 'sb.5_5', icon: 'chart' }]},
  { group: 'sb.6', items: [
    { hash: '#/meetings', key: 'sb.6_1', icon: 'calendar', module: 'meetings', alt: '#/my/calendar' },
    { hash: '#/meetings?new=1', key: 'sb.6_2', icon: 'calendar', module: 'meetings', alt: '#/room' },
    { hash: '#/meetings', key: 'sb.6_3', icon: 'calendar', module: 'meetings', alt: '#/my/calendar' },
    { hash: '#/reporting/new/meeting_actions', key: 'sb.6_4', icon: 'file', leader: true },
    { hash: '#/tasks', key: 'sb.6_5', icon: 'tasks', module: 'tasks', alt: '#/my/calendar' }]},
  { group: 'sb.7', items: [
    { hash: '#/my/calendar', key: 'sb.7_1', icon: 'calendar' },
    { hash: '#/programmes', key: 'sb.7_2', icon: 'chart', module: 'programmes', alt: '#/my/calendar' },
    { hash: '#/reporting/records', key: 'sb.7_3', icon: 'clip', leader: true },
    { hash: '#/reporting/archive', key: 'sb.7_4', icon: 'folder', leader: true },
    { hash: '#/reporting/new/activity_report', key: 'sb.7_5', icon: 'file', leader: true },
    { hash: '#/my/documents', key: 'sb.7_6', icon: 'folder', open: true }]},
  { group: 'sb.8', items: [
    { hash: '#/my/learning', key: 'sb.8_1', icon: 'book' },
    { hash: '#/my/learning', key: 'sb.8_2', icon: 'book' },
    { hash: '#/my/learning', key: 'sb.8_3', icon: 'book' },
    { hash: '#/my/learning', key: 'sb.8_4', icon: 'book' },
    { href: 'https://woddiinstitute.com', key: 'sb.8_5', icon: 'book', external: true }]},
  { group: 'sb.9', items: [
    { hash: '#/members?net=WGMN', key: 'sb.9_1', icon: 'users', module: 'members', alt: '#/my/network' },
    { hash: '#/members?net=WNNN', key: 'sb.9_2', icon: 'users', module: 'members', alt: '#/my/network' },
    { hash: '#/recruitment', key: 'sb.9_3', icon: 'userplus', module: 'recruitment', alt: '#/my/referrals' },
    { hash: '#/my/impact', key: 'sb.9_4', icon: 'chart' },
    { hash: '#/structure?level=chapter', key: 'sb.9_5', icon: 'sitemap', leader: true }]},
  { group: 'sb.10', items: [
    { hash: '#/announcements', key: 'sb.10_1', icon: 'megaphone', module: 'announcements', alt: '#/my/calendar' },
    { hash: '#/messages', key: 'sb.10_2', icon: 'users' },
    { hash: '#/my/settings', key: 'sb.10_3', icon: 'sliders', open: true },
    { hash: '#/my/calendar', key: 'sb.10_4', icon: 'calendar' },
    { hash: '#/announcements', key: 'sb.10_5', icon: 'megaphone', module: 'announcements', alt: '#/messages' }]},
  { group: 'sb.11', items: [
    { hash: '#/my/safeguarding', key: 'sb.11_1', icon: 'shield', open: true },
    { hash: '#/reporting/issues', key: 'sb.11_2', icon: 'shield', leader: true },
    { hash: '#/reporting/issues', key: 'sb.11_3', icon: 'shield', leader: true },
    { hash: '#/reporting/dashboard', key: 'sb.11_4', icon: 'shield', leader: true }]},
  { group: 'sb.12', leader: true, items: [
    { hash: '#/my/country', key: 'sb.12_1', icon: 'chart' },
    { hash: '#/my/country', key: 'sb.12_2', icon: 'chart' },
    { hash: '#/my/reflinks', key: 'sb.12_3', icon: 'chart' },
    { hash: '#/reporting/compliance', key: 'sb.12_4', icon: 'chart' },
    { hash: '#/my/impact', key: 'sb.12_5', icon: 'chart' }]},
  { group: 'sb.13', items: [
    { hash: '#/my/documents', key: 'sb.13_1', icon: 'folder', open: true },
    { hash: '#/my/documents', key: 'sb.13_2', icon: 'folder', open: true },
    { hash: '#/my/templates', key: 'sb.13_3', icon: 'file', open: true },
    { href: '/content/code-of-conduct.html', key: 'sb.13_4', icon: 'file', external: true },
    { hash: '#/my/documents', key: 'sb.13_5', icon: 'folder', open: true },
    { hash: '#/my/templates', key: 'sb.13_6', icon: 'file', open: true }]},
  { group: 'sb.14', leader: true, items: [
    { hash: '#/structure', key: 'sb.14_1', icon: 'users' },
    { hash: '#/my/network', key: 'sb.14_2', icon: 'users' },
    { hash: '#/my/country', key: 'sb.14_3', icon: 'sitemap' }]},
  { group: 'sb.15', items: [
    { hash: '#/my/support', key: 'sb.15_1', icon: 'support', open: true },
    { hash: '#/my/support', key: 'sb.15_2', icon: 'support', open: true },
    { hash: '#/ask', key: 'sb.15_3', icon: 'book', open: true },
    { hash: '#/messages', key: 'sb.15_4', icon: 'users' }]},
  { group: 'sb.16', leader: true, items: [
    { hash: '#/my/templates', key: 'sb.16_1', icon: 'file', open: true },
    { hash: '#/my/onboarding', key: 'sb.16_2', icon: 'check', open: true },
    { hash: '#/my/onboarding', key: 'sb.16_3', icon: 'check', open: true },
    { hash: '#/my/documents', key: 'sb.16_4', icon: 'folder', open: true },
    { hash: '#/my/onboarding', key: 'sb.16_5', icon: 'check', open: true },
    { hash: '#/my/onboarding', key: 'sb.16_6', icon: 'check', open: true },
    { hash: '#/my/onboarding', key: 'sb.16_7', icon: 'check', open: true }]},
  { group: 'sb.17', items: [
    { hash: '#/my/messages', key: 'sb.17_4', icon: 'megaphone', open: true },
    { hash: '#/my/learning', key: 'sb.17_5', icon: 'book', open: true },
    { hash: '#/my/profile', key: 'sb.17_1', icon: 'users', open: true },
    { hash: '#/my/leadership', key: 'sb.17_2', icon: 'shield', leader: true },
    { hash: '#/my/settings', key: 'sb.17_3', icon: 'sliders', open: true }]},
];

function isCurrent(hash) {
  const h = (location.hash || '#/').split('?')[0];
  return hash === '#/' ? h === '#/' : h.startsWith(hash);
}

/**
 * @param root      the #app node
 * @param opts      { profile, modules, titleKey, viewingAs?: {id,name} }
 * @returns         { outlet, teardown() }
 */
export function renderVolunteerShell(root, { profile, modules, titleKey, viewingAs, candidate }) {
  if (candidate) modules = new Set();   // Phase 194: a candidate has no operational modules
  const allowed = modules ?? new Set();
  clear(root);

  /* ------------------------------------------------------------ sidebar */
  const side = el('aside', { class: 'vs-side', id: 'sidebar' });
  const brand = el('div', { class: 'vs-side__brand' });
  brand.innerHTML = `<img src="/assets/woddi-logo.png" alt="WODDI">`
    + `<em>${esc(t('app.subtitle'))}</em>`;
  const nav = el('nav', { class: 'vs-nav', 'aria-label': t('nav.label') });
  side.append(brand, nav);
  const quote = el('div', { class: 'vs-side__quote' });
  quote.innerHTML = `<span>${esc(t('v.sideQuote'))}</span><small>WODDI</small>`
    + `<div class="vs-side__ver">build v${esc(APP_VERSION)} · db ${esc(String(EXPECTED_SCHEMA_VERSION))}</div>`;
  side.append(quote);

  const openGroups = new Set(JSON.parse(localStorage.getItem('wdos.sb.open') || '[]'));
  const drawMenu = (leader, gated = false) => {
    clear(nav);
    const here = (location.hash || '#/').split('?')[0];
    // Phase 203: a CANDIDATE sees her activation and nothing operational.
    if (candidate) {
      const items = [
        { hash: '#/activation', key: 'act.navTitle', icon: 'check' },
        { hash: '#/my/profile', key: 'v.navProfile', icon: 'users' },
        { hash: '#/my/support', key: 'v.navSupport', icon: 'support' },
        { hash: '#/my/settings', key: 'v.navSettings', icon: 'sliders' },
      ];
      nav.append(el('div', { class: 'vs-nav__group is-open', style: 'cursor:default;' }, [el('span', { text: t('sb.candidate') })]));
      const box = el('div', { class: 'vs-nav__items' });
      for (const m of items) {
        const a = el('a', { href: m.hash, class: 'vs-nav__a' }, [icon(iconFor(m.hash, m.icon), 15), el('span', { text: t(m.key) })]);
        if (here === m.hash) a.setAttribute('aria-current', 'page');
        a.addEventListener('click', () => toggleSide(false));
        box.append(a);
      }
      nav.append(box);
      nav.append(el('p', { class: 'vs-nav__note', text: t('sb.candidateNote') }));
      return;
    }
    for (const g of MENU) {
      if (g.leader && !leader) continue;
      const isDeputy = !!(window.__wdosSeatRole && /^(deputy_|assistant_)/.test(window.__wdosSeatRole));
      const items = g.items.filter((m) => !(m.leader && !leader) && !(m.deputy && !isDeputy)).map((m) => {
        if (m.module && !allowed.has(m.module)) return m.alt ? { ...m, hash: m.alt, module: null } : null;
        return m;
      }).filter(Boolean);
      if (!items.length) continue;
      const current = items.some((m) => !m.external && here === m.hash.split('?')[0]);
      const isOpen = current || openGroups.has(g.group);
      const head = el('button', { class: `vs-nav__group ${isOpen ? 'is-open' : ''}`, type: 'button' }, [
        el('span', { text: t(g.group) }), el('span', { class: 'vs-nav__caret', text: isOpen ? '\u2212' : '+' })]);
      const box = el('div', { class: 'vs-nav__items', hidden: !isOpen });
      head.addEventListener('click', () => {
        box.hidden = !box.hidden; head.classList.toggle('is-open', !box.hidden);
        head.lastChild.textContent = box.hidden ? '+' : '\u2212';
        if (box.hidden) openGroups.delete(g.group); else openGroups.add(g.group);
        localStorage.setItem('wdos.sb.open', JSON.stringify([...openGroups]));
      });
      for (const m of items) {
        const locked = gated && !m.open && !m.external;
        const a = el('a', { href: locked ? '#/my/onboarding' : (m.external ? m.href : m.hash),
          class: `vs-nav__a${locked ? ' vs-nav__a--locked' : ''}`,
          target: m.external ? '_blank' : null, rel: m.external ? 'noopener' : null,
          title: locked ? t('v.gateNotice') : null },
          [icon(locked ? 'lock' : iconFor(m.hash, m.icon), 15), el('span', { text: t(m.key) })]);
        if (!m.external && !locked && location.hash === m.hash) a.setAttribute('aria-current', 'page');
        a.addEventListener('click', () => toggleSide(false));
        box.append(a);
      }
      nav.append(head, box);
    }
    nav.append(el('button', { class: 'vs-nav__a vs-nav__out',
      onclick: async () => {
        try { await signOut(); location.hash = '#/login'; }
        catch { toastError(t('errors.signOut')); }
      } }, [icon('signout', 17), el('span', { text: t('v.navLogout') })]));
  };
  drawMenu(!!profile.is_leader);

  /* ------------------------------------------------------------ header */
  const ava = el('img', { class: 'vs-id__ava', alt: '', src: avatarUrl(profile.id, Math.floor(Date.now() / 3600000)) });
  withDriveFallback(ava, profile, () => el('div', { class: 'vs-id__ava', text: ((profile.first_name || '?')[0] + (profile.last_name || '')[0]).toUpperCase() }));
  const idName = el('b', { text: `${profile.first_name} ${profile.last_name}` });
  const idRole = el('small', { text: profile.role_applied || t('v.volunteer') });
  const idBtn = el('button', { class: 'vs-id', 'aria-haspopup': 'true',
    onclick: () => { menu.hidden = !menu.hidden; } },
    [ava, el('span', { class: 'vs-id__txt' }, [idName, idRole]),
      el('span', { class: 'vs-id__caret', text: '\u25BE' })]);
  const menu = el('div', { class: 'vs-menu', hidden: true }, [
    el('a', { href: '#/my/profile', text: t('v.navProfile') }),
    el('a', { href: '#/my/settings', text: t('v.navSettings') }),
    el('button', { text: t('v.navLogout'), onclick: async () => {
      try { await signOut(); location.hash = '#/login'; }
      catch { toastError(t('errors.signOut')); }
    } }),
  ]);
  const onDoc = (e) => { if (!menu.contains(e.target) && !idBtn.contains(e.target)) menu.hidden = true; };
  document.addEventListener('click', onDoc);

  const msgCount = el('span', { class: 'vs-pill', hidden: true });
  const msgBtn = el('a', { href: '#/messages', class: 'vs-hbtn', title: t('v.navMessages') },
    [icon('users', 19), msgCount, el('span', { text: t('v.hMessages') })]);
  const helpBtn = el('a', { href: '#/my/support', class: 'vs-hbtn', title: t('v.navSupport') },
    [icon('support', 19), el('span', { text: t('v.hHelp') })]);
  const bell = bellButton(icon('bell', 19));
  bell.classList.add('vs-hbtn', 'vs-hbtn--bell');
  // Phase 200: dark mode on the volunteer shell too
  const isDark = () => document.documentElement.dataset.theme === 'dark';
  const themeBtn = el('button', { class: 'vs-hbtn', type: 'button', title: t('app.theme') }, [icon(isDark() ? 'sun' : 'moon', 19), el('span', { text: t('v.hTheme') })]);
  themeBtn.addEventListener('click', () => {
    const dark = !isDark(); document.documentElement.dataset.theme = dark ? 'dark' : '';
    try { localStorage.setItem('wdos.theme', dark ? 'dark' : 'light'); } catch { /* ignore */ }
    themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon', 19), el('span', { text: t('v.hTheme') }));
  });
  bell.append(el('span', { text: t('v.hNotifications') }));

  const header = el('header', { class: 'vs-head' }, [
    el('button', { class: 'vs-burger', 'aria-label': t('nav.openMenu'),
      onclick: () => toggleSide(true) }, [icon('menu', 22)]),
    el('div', { class: 'vs-head__title' }, [
      el('h1', { text: t('v.headTitle') }),
      el('p', { text: t('v.headTagline') }),
    ]),
    el('div', { class: 'vs-head__tools' }, [bell, msgBtn, helpBtn, themeBtn, idBtn, menu]),
  ]);

  /* ------------------------------------------------------------ body */
  const banner = viewingAs ? el('div', { class: 'vs-viewas' }, [
    icon('shield', 16),
    el('span', { text: t('v.viewingAs', { name: viewingAs.name }) }),
    el('a', { href: '#/accounts', class: 'btn btn--quiet', text: t('v.viewingBack') }),
  ]) : null;
  const offline = el('div', { class: 'offline-banner', hidden: navigator.onLine,
    text: t('app.offline') });
  const syncBanner = () => { offline.hidden = navigator.onLine; };
  window.addEventListener('online', syncBanner);
  window.addEventListener('offline', syncBanner);

  const outlet = el('div', { class: 'vs-content' });
  const main = el('div', { class: 'vs-main' }, [header, banner, offline, outlet]);
  const scrim = el('div', { class: 'scrim', hidden: true, onclick: () => toggleSide(false) });
  root.append(el('div', { class: 'vs-shell' }, [side, scrim, main]));
  document.title = `${t(titleKey)} · WDOS`;

  function toggleSide(open) {
    side.classList.toggle('open', open);
    scrim.hidden = !open;
  }

  /* counters and leader menu, from the cached dashboard bundle */
  getHome().then((h) => {
    if (!h) return;
    const unreadMsgs = Number(h.messages_unread || 0);
    msgCount.textContent = String(unreadMsgs);
    msgCount.hidden = unreadMsgs === 0;
    // Phase 149: network wordmark in the header (magenta WGMN, lemon WNNN)
    const netName = h.profile?.network || profile.network || '';
    if (netName && !header.querySelector('.vs-netword')) {
      header.querySelector('.vs-head__title')?.after(el('div', { class: `vs-netword vs-netword--${netName.toLowerCase()}` }, [
        el('b', { text: netName === 'WNNN' ? 'WODDI Nurture NextGen Network' : 'WODDI Good Mother Network' }),
        el('span', { text: netName })]));
    }
    const leader = (h.roles || []).length > 0 || !!h.profile?.is_leader;
    window.__wdosSeatRole = (h.roles || [])[0]?.role || null;
    if (leader && !viewingAs) {
      import('../core/db.js').then((m) => m.onboardingStatus()).then((st) => {
        const gated = !(st?.steps || []).some((x) => x.code === 'pack' && x.done_at);
        drawMenu(leader, gated);
      }).catch(() => { if (leader !== !!profile.is_leader) drawMenu(leader); });
    } else if (leader !== !!profile.is_leader) drawMenu(leader);
    if ((h.roles || []).length) idRole.textContent = t(`role.${h.roles[0].role}`);
    else if (h.profile?.role_applied) idRole.textContent = h.profile.role_applied;
    const iso = countryIso(h.profile?.country || (h.chain || []).find((c) => c.level === 'country')?.name, h.country_iso);
    const src = flagSrc(iso);
    if (src && !idName.querySelector('.vs-flag')) {
      idName.append(el('img', { class: 'vs-flag vs-flag--sm', src, alt: iso, width: '20', height: '15', onerror: (e) => e.target.remove() }));
    }
  }).catch(() => { /* counters are cosmetic */ });

  return {
    outlet,
    teardown() {
      window.removeEventListener('online', syncBanner);
      window.removeEventListener('offline', syncBanner);
      document.removeEventListener('click', onDoc);
    },
  };
}

export function networkName(code) {
  return NETWORK_NAME[code] || code || '';
}
