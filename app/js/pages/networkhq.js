/**
 * Phase 173 — dedicated network page (#/network/WGMN, #/network/WNNN).
 * "View WGMN details" / "View WNNN details" on the HOFCO and Command Centre
 * screens open this page, scoped entirely to the one network: no other
 * network's figures appear anywhere on it.
 */
import { el, clear } from '../core/dom.js';
import { t, fmtNumber, fmtDate, fmtDateTime } from '../core/i18n.js';
import { db } from '../core/db.js';
import { renderShell } from '../components/layout.js';
import { icon } from '../components/icons.js';
import { driveAvatarByName } from '../core/photos.js';
const PERSON_ISSUES = ['cr_inactive', 'task_overdue', 'activation_stalled', 'appointment_pending', 'engagement_declining', 'support_unresolved'];

export async function render(root, params, ctx) {
  const net = (params?.net || 'WGMN').toUpperCase() === 'WNNN' ? 'WNNN' : 'WGMN';
  const tone = net === 'WGMN' ? 'magenta' : 'lemon';
  const shell = renderShell(root, { profile: ctx.profile, modules: ctx.modules, titleKey: net === 'WGMN' ? 'hqs.wgmn' : 'hqs.wnnn' });
  const out = shell.outlet; clear(out);
  const body = el('div', { class: 'state' }, [el('div', { class: 'spinner' })]); out.append(body);
  let d, hf;
  try {
    const { cachedRpc } = await import('../core/db.js');
    const [a, b] = await Promise.all([
      cachedRpc(`central:${net}`, async () => { const r = await db().rpc('central_admin_cached', { p_net: net }); if (r.error) throw r.error; return r.data; }),
      cachedRpc(`hofco:${net}:month`, async () => { const r = await db().rpc('hofco_dashboard_cached', { p_net: net, p_period: 'month' }); if (r.error) throw r.error; return r.data; }),
    ]);
    d = a; hf = b || {};
  } catch (err) { clear(body); body.className = 'card'; body.append(el('h3', { text: t('errors.loadTitle') }), el('p', { class: 'muted', text: String(err?.message || err).slice(0, 200) })); return shell.teardown; }
  clear(body); body.className = '';
  const T = d.tiles || {}, R = d.reporting || {}, F = net === 'WGMN' ? d.funnel_online : d.funnel_online; const FR = d.funnel_referral || {}, FO = d.funnel_online || {};
  body.before(el('div', { class: `nh-hero nh-hero--${tone}` }, [
    el('div', { class: 'nh-hero__logo' }, [el('img', { src: `/assets/logos/${net.toLowerCase()}.png`, alt: `WODDI ${net} logo`, width: 148, height: 148 })]),
    el('div', { class: 'nh-hero__map' }),
    el('div', { class: 'nh-hero__body' }, [
      el('div', { class: 'nh-hero__title' }, [el('b', { text: net }), el('span', { text: `WODDI ${net === 'WGMN' ? t('vol.wgmnFull') : t('vol.wnnnFull')}` })]),
      el('div', { class: 'nh-hero__motto', text: net === 'WGMN' ? t('v.quoteWgmn') : t('v.quoteWnnn') }),
      el('div', { class: 'nh-hero__tiles' }, [
        heroTile(t('hf.tOperational'), `${(Number(T.countries_represented || 0) + Number(T.countries_strengthen || 0))} / ${T.countries_total || 54}`),
        heroTile(t('hf.tActive'), T.leaders_active30 ?? 0),
        heroTile(t('rh.tMembers'), T.members ?? 0),
        heroTile(t('hf.tVacancies'), (T.vacant_country ?? 0) + (T.vacant_state ?? 0)),
        heroTile(t('hf.tReports'), R.overdue ?? 0),
        heroTile(t('ca.tProgrammes'), T.programmes_running ?? 0)])])]));
  drawHeroMap(out.querySelector('.nh-hero__map'), d.countries || []);

  const items = (hf.attention_items || []).slice(0, 8);
  const PRI = { critical: 'red', high: 'red', medium: 'amber', normal: 'grey' };
  const attn = el('div', { class: 'card ca-card' }, [el('div', { class: 'card__head' }, [el('h3', {}, [icon('shield', 16), el('span', { text: ' ' + t('hf.attentionShort') }), (hf.attention_items || []).length ? el('span', { class: 'hf-count', text: String((hf.attention_items || []).length) }) : null])]),
    ...(items.length ? items.map((it) => el('a', { href: it.href, class: 'ca-attn' }, [el('span', { class: `vs-badge vs-badge--${PRI[it.priority] || 'grey'}`, text: t('hf.pr_' + it.priority) }), PERSON_ISSUES.includes(it.issue) && it.owner ? driveAvatarByName(it.owner) : null, el('div', { class: 'grow' }, [el('b', { text: t('hf.i_' + it.issue) }), el('div', { class: 'muted', text: [it.country, it.owner].filter(Boolean).join(' · ') + (it.deadline ? ' · ' + fmtDate(it.deadline) : '') })]), el('span', { class: 'btn btn--secondary', text: t('hf.a_' + it.issue) })])) : [el('p', { class: 'muted', text: t('hf.attentionNone') })])]);
  const stages = (net === 'WGMN' || net === 'WNNN') ? [['referral', FR.referral], ['contacted', FR.contacted], ['activation3', FR.activation], ['review', FR.review], ['appointmentPending', FR.appointment_pending], ['appointed', FR.appointed]] : [];
  const oStages = [['received', FO.received], ['activation7', FO.activation], ['review', FO.review], ['appointmentPending', FO.appointment_pending], ['appointed', FO.appointed]];
  const maxO = Math.max(1, ...oStages.map(([, v]) => Number(v || 0))), maxR = Math.max(1, ...stages.map(([, v]) => Number(v || 0)));
  // Phase 222: same aligned funnel as the Command Centre (one grid; 0 draws no bar)
  const funnelRows = (arr, max, prefix) => el('div', { class: 'ca-funnel' }, arr.flatMap(([k, v], i) => { const n = Number(v || 0); return [
    el('div', { class: 'ca-funnel__track' }, [el('div', { class: 'ca-funnel__bar', style: `width:${n ? Math.max(3, Math.round((n / Math.max(1, max)) * 100)) : 0}%;opacity:${1 - i * 0.09};` })]),
    el('b', { class: 'ca-funnel__n', text: fmtNumber(n) }), el('span', { class: 'ca-funnel__label', text: t(prefix + k) })]; }));
  const funnel = el('div', { class: 'card ca-card' }, [el('div', { class: 'card__head' }, [el('h3', {}, [icon('userplus', 16), el('span', { text: ' ' + t('ca.funnel') })]), el('a', { href: `#/recruitment`, class: 'btn btn--quiet', text: t('v.viewAll') })]),
    funnelRows(oStages, maxO, 'ca.fo_'), el('div', { class: 'card__head', style: 'margin-top:10px;' }, [el('h3', { text: t('ca.funnelReferral') })]), funnelRows(stages, maxR, 'ca.fr_')]);
  body.append(el('div', { class: 'ca-grid ca-grid--eq' }, [attn, funnel]));

  const rows = (d.countries || []).filter((c) => c.unit_id).slice(0, 20);
  const cty = el('div', { class: 'card ca-card' }, [el('div', { class: 'card__head' }, [el('h3', { text: t('hf.countries') }), el('a', { href: '#/organisation', class: 'btn btn--quiet', text: t('v.viewAll') })]),
    el('div', { class: 'table-wrap' }, [el('table', { class: 'vs-table ca-table hf-table' }, [el('thead', {}, [el('tr', {}, ['v.country', 'ca.thCoverage', 'hf.cVacancies', 'ca.thReports', 'v.thStatus'].map((k) => el('th', { text: t(k) })))]),
      el('tbody', {}, rows.map((c) => { const eng = c.leaders ? Math.round(100 * (c.active_leaders || 0) / c.leaders) : 0; const status = c.coverage === 'not_represented' ? 'intervention' : (c.report_status == null && c.leaders > 0) ? 'attention' : eng < 34 ? 'at_risk' : 'on_track';
        return el('tr', {}, [el('td', {}, [el('a', { href: `#/country/${c.unit_id}`, text: c.name })]), el('td', { text: c.coverage_pct == null ? '\u2014' : `${c.coverage_pct}%` }), el('td', { text: String(Math.max(0, (c.seats || 0) - (c.filled || 0))) }), el('td', { text: c.report_status ? t('rp.st_' + c.report_status) : t('rp.st_not_started') }), el('td', {}, [el('span', { class: `vs-badge vs-badge--${status === 'on_track' ? 'green' : status === 'attention' ? 'amber' : 'red'}`, text: t('hf.st_' + status) })])]); }))])])]);
  body.append(el('div', { class: 'ca-grid' }, [cty]));

  const recent = el('div', { class: 'card ca-card' }, [el('div', { class: 'card__head' }, [el('h3', {}, [icon('clip', 16), el('span', { text: ' ' + t('hf.recent') })])]),
    ...((hf.recent || []).filter((e) => !e.network || e.network === net).slice(0, 8).map((e) => el('div', { class: 'hf-recent' }, [el('small', { class: 'muted', text: e.at ? fmtDateTime(e.at) : '' }), el('div', {}, [el('b', { text: t('hf.k_' + e.kind) }), el('span', { class: 'muted', text: ` · ${e.who || ''}${e.where ? ' · ' + e.where : ''}` })])]))),
    !(hf.recent || []).length ? el('p', { class: 'muted', text: t('hf.recentNone') }) : null]);
  body.append(el('div', { class: 'ca-grid' }, [recent]));
  return shell.teardown;

  function heroTile(l, v) { return el('div', { class: 'nh-hero__tile' }, [el('b', { text: typeof v === 'string' ? v : fmtNumber(Number(v || 0)) }), el('span', { text: l })]); }
  async function drawHeroMap(holder, countries) {
    try {
      const res = await fetch('/assets/africa-map.svg');
      const txt = await res.text();
      if (!res.ok || !txt.trim().startsWith('<svg')) { holder.remove(); return; }
      holder.innerHTML = txt;
      const svg = holder.querySelector('svg'); if (!svg) { holder.remove(); return; }
      const by = Object.fromEntries(countries.map((c) => [c.iso, c.coverage]));
      for (const p of svg.querySelectorAll('path[data-iso]')) p.classList.add('af-' + (by[p.dataset.iso] || 'not_represented'));
    } catch { holder.remove(); }
  }
}
