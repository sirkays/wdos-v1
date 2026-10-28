/**
 * Phase 165 — a named place for a module the founder's architecture defines
 * but WDOS has not built yet (#/planned/:key). Shows the module's purpose and
 * its status honestly, so no sidebar entry is ever a dead link and nobody
 * mistakes a scheduled module for a working one.
 */
import { el, clear } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { renderShell } from '../components/layout.js';

export async function render(root, params, ctx) {
  const shell = renderShell(root, { profile: ctx.profile, modules: ctx.modules, titleKey: 'pl.title' });
  clear(shell.outlet);
  let info = null;
  try { const j = await (await fetch('/assets/hq-sidebars.json', { cache: 'force-cache' })).json(); info = j.planned?.[params.key] || null; } catch { /* below */ }
  shell.outlet.append(el('div', { class: 'card' }, [
    el('span', { class: 'vs-badge vs-badge--amber', text: t('pl.badge') }),
    el('h3', { text: info ? info[0] : params.key }),
    el('p', { text: info ? info[1] : t('pl.generic') }),
    el('p', { class: 'muted', text: t('pl.hint') }),
    el('a', { href: '#/', class: 'btn btn--secondary', text: t('pl.back') }),
  ]));
  return shell.teardown;
}
