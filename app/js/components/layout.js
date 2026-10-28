/**
 * Authenticated app shell: black sidebar, topbar, content outlet,
 * offline banner, language switcher. Pages render into the returned
 * outlet node.
 */
import { el, esc, clear } from '../core/dom.js';
import { t, getLocale, setLocale, supportedLocales } from '../core/i18n.js';
import { signOut, getSchemaStatus } from '../core/db.js';
import { APP_VERSION, EXPECTED_SCHEMA_VERSION } from '../core/db.js';
import { toastError } from './toast.js';
import { icon, iconFor } from './icons.js';
import { bellButton } from './notify.js';
import { openSearch } from './search.js';
import { renderVolunteerShell } from './vshell.js';

/* Phase 131: 'hq' = this black sidebar; 'volunteer' = the Volunteer
   Dashboard shell. Set once per session by app.js after sign-in. */
let shellMode = 'hq';
export function setShellMode(mode) { shellMode = mode; }
export function getShellMode() { return shellMode; }

// Phase 155: the founder's Central Admin sidebar (22 items). Each points at
// the WDOS screen that holds that function; `module` entries appear only for
// members who hold the module. Order and names follow the specification.
// Phase 164: the founder's "Recommended WDOS Central Admin Sidebar": twelve
// sections, every entry opening the WDOS screen that holds that function
// today. Module-gated entries appear only for members holding the module.
const NAV = [
  { group: 'hqs.command', items: [
    { hash: '#/', key: 'hqs.commandCentre', icon: 'home', module: null },
    { hash: '#/reporting/dashboard', key: 'hqs.attention', icon: 'shield', module: 'hq' },
    { hash: '#/recruitment', key: 'hqs.approvals', icon: 'check', module: 'recruitment' }]},
  { group: 'hqs.people', items: [
    { hash: '#/members', key: 'hqs.peopleDir', icon: 'users', module: 'members' },
    { hash: '#/organisation', key: 'hqs.countries', icon: 'sitemap', module: 'organisation' },
    { hash: '#/structure', key: 'hqs.structure', icon: 'sitemap', module: 'hq' },
    { hash: '#/structure?status=vacant', key: 'hqs.coverage', icon: 'briefcase', module: 'hq' },
    { hash: '#/command', key: 'hqs.expansion', icon: 'chart', module: 'hq' }]},
  { group: 'hqs.networks', items: [
    { hash: '#/structure?net=WGMN', key: 'hqs.wgmn', icon: 'sitemap', module: 'hq' },
    { hash: '#/structure?net=WNNN', key: 'hqs.wnnn', icon: 'sitemap', module: 'hq' }]},
  { group: 'hqs.recruit', items: [
    { hash: '#/recruitment', key: 'hqs.recruitCentre', icon: 'userplus', module: 'recruitment' },
    { hash: '#/recruitment?src=online', key: 'hqs.onlineApps', icon: 'userplus', module: 'recruitment' },
    { hash: '#/reflinks', key: 'hqs.referrals', icon: 'userplus', module: 'hq' },
    { hash: '#/recruitment?tab=activation', key: 'hqs.activation', icon: 'userplus', module: 'recruitment' },
    { hash: '#/recruitment?tab=review', key: 'hqs.review', icon: 'check', module: 'recruitment' },
    { hash: '#/accounts?f=pending', key: 'hqs.appointments', icon: 'shield', module: 'hq' },
    { hash: '#/leaders', key: 'hqs.seats', icon: 'briefcase', module: 'hq' },
    { hash: '#/library', key: 'hqs.packs', icon: 'book', module: 'library' },
    { hash: '#/structure?status=vacant', key: 'hqs.succession', icon: 'briefcase', module: 'hq' }]},
  { group: 'hqs.ops', items: [
    { hash: '#/tasks', key: 'nav.tasks', icon: 'tasks', module: 'tasks' },
    { hash: '#/meetings', key: 'hqs.meetings', icon: 'calendar', module: 'meetings' },
    { hash: '#/room', key: 'nav.room', icon: 'support', module: null },
    { hash: '#/reporting/issues', key: 'hqs.countryOps', icon: 'shield', module: 'hq' },
    { hash: '#/tasks?view=hq', key: 'hqs.readiness', icon: 'clip', module: 'tasks' }]},
  { group: 'hqs.account', items: [
    { hash: '#/reporting', key: 'nav.reporting', icon: 'chart', module: 'hq' },
    { hash: '#/reporting/review', key: 'hqs.weekly', icon: 'chart', module: 'hq' },
    { hash: '#/reporting/archive', key: 'hqs.monthly', icon: 'folder', module: 'hq' },
    { hash: '#/reporting/compliance', key: 'hqs.compliance', icon: 'chart', module: 'hq' },
    { hash: '#/reporting/records', key: 'hqs.evidence', icon: 'clip', module: 'hq' },
    { hash: '#/command', key: 'hqs.scorecards', icon: 'chart', module: 'hq' }]},
  { group: 'hqs.prog', items: [
    { hash: '#/programmes', key: 'nav.programmesActivities', icon: 'chart', module: 'programmes' },
    { hash: '#/programmes?tab=calendar', key: 'hqs.progCalendar', icon: 'calendar', module: 'programmes' },
    { hash: '#/programmes?tab=plans', key: 'hqs.countryPlans', icon: 'file', module: 'programmes' },
    { hash: '#/programmes?tab=approvals', key: 'hqs.activityApprovals', icon: 'check', module: 'programmes' },
    { hash: '#/reporting/records', key: 'hqs.activityReporting', icon: 'clip', module: 'hq' },
    { hash: '#/dashboard', key: 'hqs.impact', icon: 'chart', module: 'hq' }]},
  { group: 'hqs.engage', items: [
    { hash: '#/announcements', key: 'hqs.commsCentre', icon: 'megaphone', module: 'announcements' },
    { hash: '#/messages', key: 'nav.messages', icon: 'users', module: null },
    { hash: '#/engagement', key: 'hqs.engagement', icon: 'users', module: 'hq' }]},
  { group: 'hqs.safety', items: [
    { hash: '#/cases', key: 'hqs.safeguarding', icon: 'shield', module: 'cases' },
    { hash: '#/cases?type=complaint', key: 'hqs.complaints', icon: 'shield', module: 'cases' },
    { hash: '#/helpdesk', key: 'hqs.helpdesk', icon: 'support', module: 'helpdesk' }]},
  { group: 'hqs.eco', items: [
    { hash: '#/outreach', key: 'hqs.institute', icon: 'book', module: 'hq' },
    { hash: '#/members?status=community', key: 'hqs.community', icon: 'users', module: 'members' },
    { hash: '#/settings', key: 'hqs.integrations', icon: 'sliders', module: 'settings' }]},
  { group: 'hqs.insights', items: [
    { hash: '#/command', key: 'hqs.analytics', icon: 'chart', module: 'hq' },
    { hash: '#/reporting/archive', key: 'hqs.execReports', icon: 'file', module: 'hq' },
    { hash: '#/doctor', key: 'hqs.audit', icon: 'clip', module: 'hq' }]},
  { group: 'hqs.admin', items: [
    { hash: '#/accounts', key: 'hqs.users', icon: 'users', module: 'hq' },
    { hash: '#/accounts', key: 'hqs.roles', icon: 'lock', module: 'hq' },
    { hash: '#/settings', key: 'hqs.workflow', icon: 'sliders', module: 'settings' },
    { hash: '#/content', key: 'hqs.forms', icon: 'file', module: 'content' },
    { hash: '#/settings', key: 'hqs.notifications', icon: 'megaphone', module: 'settings' },
    { hash: '#/settings', key: 'hqs.languages', icon: 'book', module: 'settings' },
    { hash: '#/settings', key: 'hqs.system', icon: 'sliders', module: 'settings' },
    { hash: '#/doctor', key: 'hqs.security', icon: 'lock', module: 'hq' }]},
  { group: 'hqs.resources', items: [
    { hash: '#/library', key: 'hqs.library', icon: 'book', module: 'library' },
    { hash: '#/ask', key: 'nav.ask', icon: 'book', module: null }]},
];

const LOCALE_NAMES = {
  en: 'English', fr: 'Français', pt: 'Português', ar: 'العربية',
  sw: 'Kiswahili', ha: 'Hausa', yo: 'Yorùbá', ig: 'Igbo',
};

export function renderShell(root, { profile, titleKey, modules }) {
  if (shellMode === 'volunteer') {
    return renderVolunteerShell(root, { profile, titleKey, modules });
  }
  const allowed = modules ?? new Set();
  clear(root);

  const sidebar = el('aside', { class: 'sidebar', id: 'sidebar' });
  const brand = el('div', { class: 'sidebar__brand' });
  brand.innerHTML = `<img src="/assets/woddi-logo.png" alt="WODDI" `
    + `style="height:46px;max-width:100%;object-fit:contain;display:block;`
    + `margin:0 auto 2px;background:#fff;border-radius:8px;padding:3px 8px;">`
    + `<em>${esc(t('app.subtitle'))}</em>`;
  const navEl = el('nav', { class: 'nav', 'aria-label': t('nav.label') });
  // Phase 165: HQ roles from the founder's architecture each get their own
  // sidebar (assets/hq-sidebars.json). A role with no entry falls back to the
  // recommended Central Admin sidebar below.
  const roleFn = profile.hq_function || window.__wdosHqFn || null;
  const roleSb = roleFn && (window.__wdosSidebars?.sidebars?.[roleFn] || null);
  if (roleSb) {
    navEl.append(el('div', { class: 'nav__section', text: t('hqfn.' + roleFn) }));
    for (const [label, hash] of roleSb) {
      const a = el('a', { href: hash }, [icon(iconFor(hash)), label]);
      if (hash.startsWith('#/planned')) a.classList.add('nav__planned');
      if (location.hash === hash || (!location.hash && hash === '#/')) a.setAttribute('aria-current', 'page');
      navEl.append(a);
    }
    for (const hash of ['#/messages', '#/room', '#/ask']) navEl.append(el('a', { href: hash }, [icon(iconFor(hash)), t(hash === '#/messages' ? 'nav.messages' : hash === '#/room' ? 'nav.room' : 'nav.ask')]));
  }
  const here = (location.hash || '#/').split('?')[0];
  const openGroups = new Set(JSON.parse(localStorage.getItem('wdos.hqs.open') || '[]'));
  for (const g of (roleSb ? [] : NAV)) {
    const items = g.items.filter((x) => x.module === null || allowed.has(x.module));
    if (!items.length) continue;
    const current = items.some((n) => here === n.hash.split('?')[0]);
    const isOpen = current || openGroups.has(g.group);
    const head = el('button', { class: `nav__group ${isOpen ? 'is-open' : ''}`, type: 'button' }, [
      el('span', { text: t(g.group) }), el('span', { class: 'nav__caret', text: isOpen ? '\u2212' : '+' })]);
    const box = el('div', { class: 'nav__items', hidden: !isOpen });
    head.addEventListener('click', () => {
      box.hidden = !box.hidden; head.classList.toggle('is-open', !box.hidden);
      head.lastChild.textContent = box.hidden ? '+' : '\u2212';
      if (box.hidden) openGroups.delete(g.group); else openGroups.add(g.group);
      localStorage.setItem('wdos.hqs.open', JSON.stringify([...openGroups]));
    });
    for (const n of items) {
      const a = el('a', { href: n.hash }, [icon(iconFor(n.hash, n.icon)), t(n.key)]);
      if (location.hash === n.hash || (!location.hash && n.hash === '#/')) a.setAttribute('aria-current', 'page');
      box.append(a);
    }
    navEl.append(head, box);
  }
  const foot = el('div', { class: 'sidebar__foot' });
  foot.innerHTML = `${esc(profile.first_name)} ${esc(profile.last_name)}<br>${esc(profile.email)}<br><span style="opacity:.55;
  foot.append(el('button', { class: 'btn btn--quiet',
    style: 'margin-top:8px;font-size:11px;padding:4px 10px;',
    text: t('bn.enableBtn'),
    onclick: async (e) => {
      const { enableBrowserNotifications } =
        await import('../core/notifybrowser.js');
      const st = await enableBrowserNotifications(profile);
      if (st === 'granted') {
        try {
          const { enablePush } = await import('../core/push.js');
          await enablePush();
        } catch { /* device push optional; in-tab notify already on */ }
      }
      e.target.textContent = st === 'granted'
        ? t('bn.onShort') : t('bn.enableBtn');
    } }));font-size:11px;">build v${esc(APP_VERSION)} · db ${esc(String(EXPECTED_SCHEMA_VERSION))}</span>`;
  sidebar.append(brand, navEl, foot);

  const scrim = el('div', { class: 'scrim', hidden: true,
    onclick: () => toggleSidebar(false) });

  const localeSelect = el('select', {
    class: 'select', 'aria-label': t('app.language'), style: 'width:auto;',
    onchange: async (e) => {
      try {
        const code = e.target.value;
        if (code !== 'en' && code !== 'fr') {
          try {
            const { getOrgSetting } = await import('../core/db.js');
            const dict = await getOrgSetting('locale_' + code)
              .catch(() => null);
            if (!dict) toastError(t('lang.notBuiltToast',
              { lang: LOCALE_NAMES[code] }));
          } catch { /* proceed */ }
        }
        await setLocale(code);
        try {
          const { updateMyProfile } = await import('../core/db.js');
          await updateMyProfile({ preferred_locale: code });
        } catch (err) { console.warn('[wdos] language saved on this browser only; account save failed:', err?.message || err); }
        location.reload();
      } catch { toastError(t('errors.localeLoad')); }
    },
  }, supportedLocales().map((code) =>
    el('option', { value: code, selected: code === getLocale() || null,
      text: LOCALE_NAMES[code] })
  ));
  // truth-in-menu: mark languages whose dictionary isn't built yet
  (async () => {
    try {
      const { getOrgSetting } = await import('../core/db.js');
      for (const opt of localeSelect.options) {
        const code = opt.value;
        if (code === 'en' || code === 'fr') continue;
        const dict = await getOrgSetting('locale_' + code).catch(() => null);
        if (!dict) opt.text = LOCALE_NAMES[code] + ' — ' + t('lang.needsBuild');
      }
    } catch { /* menu stays plain */ }
  })();

  const themeBtn = el('button', {
    class: 'btn btn--icon btn--quiet', 'aria-label': t('app.theme'),
    onclick: () => {
      const dark = document.documentElement.dataset.theme !== 'dark';
      document.documentElement.dataset.theme = dark ? 'dark' : '';
      localStorage.setItem('wdos.theme', dark ? 'dark' : 'light');
      themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon'));
    },
  }, [icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')]);

  const topbar = el('header', { class: 'topbar' }, [
    el('button', {
      class: 'btn btn--icon btn--quiet', 'aria-label': t('nav.openMenu'),
      onclick: () => toggleSidebar(true), text: '☰',
    }),
    el('h1', { class: 'topbar__title', text: t(titleKey) }),
    el('button', { class: 'btn btn--icon btn--quiet',
      'aria-label': t('search.label'),
      onclick: openSearch }, [icon('search')]),
    bellButton(icon('bell')),
    themeBtn,
    localeSelect,
    el('button', {
      class: 'btn btn--quiet', text: t('auth.signOut'),
      onclick: async () => {
        try { await signOut(); location.hash = '#/login'; }
        catch { toastError(t('errors.signOut')); }
      },
    }),
  ]);

  const offline = el('div', {
    class: 'offline-banner', hidden: navigator.onLine,
    text: t('app.offline'),
  });
  const schemaBanner = el('div', {
    class: 'offline-banner', hidden: true,
    style: 'background:var(--danger-tint);color:var(--danger);',
  });
  if (allowed.has('settings')) {
    getSchemaStatus().then((sst) => {
      if (!sst.known || sst.missing.length > 0) {
        schemaBanner.textContent = t('app.schemaBehind', {
          list: sst.missing.map((v) => String(v).padStart(3, '0')).join(', '),
        });
        schemaBanner.hidden = false;
      }
    }).catch(() => {});
  }
  const syncBanner = () => { offline.hidden = navigator.onLine; };
  window.addEventListener('online', syncBanner);
  window.addEventListener('offline', syncBanner);

  const outlet = el('div', { class: 'content' });
  const main = el('div', { class: 'main' }, [topbar, schemaBanner, offline, outlet]);
  root.append(el('div', { class: 'shell' }, [sidebar, scrim, main]));

  function toggleSidebar(open) {
    sidebar.classList.toggle('open', open);
    scrim.hidden = !open;
  }
  // Mobile: close the drawer after navigating
  sidebar.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => toggleSidebar(false)));

  return {
    outlet,
    teardown() {
      window.removeEventListener('online', syncBanner);
      window.removeEventListener('offline', syncBanner);
    },
  };
}

function isCurrent(hash) {
  const h = location.hash || '#/';
  return hash === '#/' ? h === '#/' : h.startsWith(hash);
}
