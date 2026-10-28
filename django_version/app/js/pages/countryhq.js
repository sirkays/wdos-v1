/**
 * Phase 157 — HQ view of one country: #/country/:id
 * The same country panel a Country Representative sees (coverage,
 * responsiveness, reports, structure by state with every leader), opened by
 * HQ from the Countries page, with a "View dashboard & KPIs" button on every
 * leader that opens her dashboard read-only.
 */
import { el, clear } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { renderShell } from '../components/layout.js';
import { renderCountryPanel } from './country.js';

export async function render(root, params, ctx) {
  const shell = renderShell(root, { profile: ctx.profile, modules: ctx.modules, titleKey: 'nav.countries' });
  clear(shell.outlet);
  shell.outlet.append(el('a', { href: '#/organisation', class: 'btn btn--quiet', style: 'margin-bottom:8px;', text: t('cty.backCountries') }));
  await renderCountryPanel(shell.outlet, { profile: ctx.profile, ro: true, unitId: params.id, hq: true });
  return shell.teardown;
}
