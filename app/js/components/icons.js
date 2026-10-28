/**
 * WDOS icon system, Phase 211: Font Awesome 7 (Free, self-hosted in
 * /vendor/fontawesome, so it works offline and needs no CDN). Every existing
 * call icon('users') keeps working: the old names map to Font Awesome glyphs.
 * Any Font Awesome name can also be passed directly: icon('rocket'),
 * icon('regular:envelope'), icon('brands:whatsapp').
 */
const MAP = {
  home: 'house', lock: 'lock', users: 'users', userplus: 'user-plus', sitemap: 'sitemap',
  tasks: 'list-check', calendar: 'calendar-days', chart: 'chart-column', megaphone: 'bullhorn',
  sliders: 'sliders', signout: 'right-from-bracket', pin: 'location-dot', file: 'file-lines',
  check: 'circle-check', folder: 'folder-open', search: 'magnifying-glass', book: 'book-open',
  sun: 'sun', moon: 'moon', bell: 'bell', clip: 'paperclip', menu: 'bars', briefcase: 'briefcase',
  support: 'life-ring', shield: 'shield-halved', heart: 'heart', mail: 'envelope', message: 'comment-dots',
};

export function icon(name, size = 18) {
  const raw = String(name || 'file');
  let style = 'solid'; let glyph = raw;
  if (raw.includes(':')) [style, glyph] = raw.split(':');
  glyph = MAP[glyph] || glyph;
  const i = document.createElement('i');
  i.className = `fa-${style} fa-${glyph} wd-ico`;
  i.setAttribute('aria-hidden', 'true');
  i.style.fontSize = `${Math.round(size * 0.9)}px`;
  return i;
}

/* A meaningful icon for a destination, used where a menu only knows the
 * route (the HQ sidebars in assets/hq-sidebars.json). First match wins. */
const ROUTES = [
  [/^#\/$/, 'gauge-high'], [/^#\/ops\/leaders/, 'people-group'], [/^#\/ops\/messages/, 'paper-plane'], [/^#\/ops\/tasks/, 'list-check'],
  [/^#\/ops\/reports/, 'file-pdf'], [/^#\/ops\/autopilot/, 'robot'], [/^#\/ops/, 'tower-broadcast'],
  [/^#\/hq\/activation/, 'rocket'], [/^#\/hq\/mailboxes/, 'envelope'], [/^#\/organisation/, 'earth-africa'], [/^#\/command/, 'chart-line'],
  [/^#\/recruitment/, 'user-check'], [/^#\/accounts\?f=pending/, 'user-clock'], [/^#\/accounts\?f=never/, 'user-slash'], [/^#\/accounts/, 'id-card'],
  [/^#\/structure\?status=vacant/, 'chair'], [/^#\/structure/, 'sitemap'], [/^#\/tasks/, 'list-check'], [/^#\/programmes/, 'diagram-project'],
  [/^#\/planned\/finance/, 'coins'], [/^#\/planned/, 'hourglass-half'], [/^#\/members/, 'people-roof'], [/^#\/announcements/, 'bullhorn'],
  [/^#\/reporting\/issues/, 'triangle-exclamation'], [/^#\/reporting\/compliance/, 'clipboard-check'], [/^#\/reporting\/review/, 'magnifying-glass-chart'],
  [/^#\/reporting\/archive/, 'box-archive'], [/^#\/reporting/, 'file-lines'], [/^#\/cases/, 'shield-halved'], [/^#\/doctor/, 'heart-pulse'],
  [/^#\/meetings/, 'calendar-days'], [/^#\/helpdesk/, 'headset'], [/^#\/library/, 'folder-open'], [/^#\/engagement/, 'hand-holding-heart'],
  [/^#\/outreach/, 'school'], [/^#\/messages/, 'comments'], [/^#\/room/, 'video'], [/^#\/ask/, 'wand-magic-sparkles'], [/^#\/settings/, 'gear'],
  [/^#\/content/, 'pen-to-square'], [/^#\/spotlight/, 'star'], [/^#\/dashboard/, 'chart-pie'], [/^#\/network\//, 'circle-nodes'],
  [/^#\/my\/onboarding/, 'graduation-cap'], [/^#\/my\/referrals|^#\/my\/reflinks/, 'user-plus'], [/^#\/my\/country/, 'flag'],
];
export function iconFor(hash, fallback = 'circle-dot') {
  const h = String(hash || '');
  for (const [re, g] of ROUTES) if (re.test(h)) return g;
  return fallback;
}
