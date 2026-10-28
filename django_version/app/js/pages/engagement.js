/**
 * Phase 168 — Volunteer Strategic Engagement & Retention (HQ, HOFCO-owned;
 * the Secretary maintains it). Engagement overview · calendar with status
 * (scheduled / upcoming / due / completed / missed / follow-up) · leaders
 * needing follow-up · re-engagement tracker · by country / level · retention.
 */
import { el, clear } from '../core/dom.js';
import { t, fmtDate } from '../core/i18n.js';
import { db } from '../core/db.js';
import { renderShell } from '../components/layout.js';
import { toast, toastError } from '../components/toast.js';

const rpc = async (fn, args) => { const { data, error } = await db().rpc(fn, args); if (error) throw error; return data; };

export async function render(root, params, ctx) {
  const shell = renderShell(root, { profile: ctx.profile, modules: ctx.modules, titleKey: 'eng.title' });
  const out = shell.outlet; clear(out);
  const net = params?.net || 'all';
  out.append(el('div', { class: 'hf-head' }, [el('div', {}, [el('h2', { text: t('eng.title') }), el('div', { class: 'muted', text: t('eng.sub') })]),
    el('div', { class: 'ca-nets' }, ['all', 'WGMN', 'WNNN'].map((n) => el('button', { class: `reg-lang ${net === n ? 'is-active' : ''}`, text: n === 'all' ? t('ca.allNetworks') : n, onclick: () => render(root, { ...params, net: n }, ctx) })))]));
  const body = el('div', { class: 'state' }, [el('div', { class: 'spinner' })]); out.append(body);
  let d;
  try { await rpc('engagement_roll', {}).catch(() => {}); d = await rpc('engagement_overview', { p_net: net }); }
  catch (err) { clear(body); body.className = 'card'; body.append(el('h3', { text: t('errors.loadTitle') }), el('p', { class: 'muted', text: String(err?.message || err).slice(0, 200) })); return shell.teardown; }
  clear(body); body.className = '';
  const T = d.totals || {};
  const mini = (l, v, tone) => el('div', { class: `vs-mini__t ${tone ? 'vs-mini__t--' + tone : ''}` }, [el('b', { text: String(v ?? 0) }), el('small', { text: l })]);
  body.append(el('div', { class: 'card ca-card' }, [el('h3', { text: t('eng.overview') }), el('div', { class: 'vs-mini' }, [
    mini(t('eng.total'), T.total), mini(t('eng.new'), T.new), mini(t('hf.eActive'), T.active, 'green'), mini(t('hf.eConsistent'), T.consistent, 'green'), mini(t('hf.eDeclining'), T.declining, 'amber'), mini(t('hf.eAtRisk'), T.at_risk, 'red'), mini(t('hf.eInactive'), T.inactive, 'red'),
    mini(t('eng.underReengagement'), T.under_reengagement, 'amber'), mini(t('eng.reEngaged'), T.re_engaged, 'green'), mini(t('eng.exited'), T.exited_90d), mini(t('eng.birthdays'), T.birthdays_30d, 'magenta'), mini(t('eng.milestones'), T.milestones_30d, 'magenta'), mini(t('hf.eSupport'), T.support_open, T.support_open ? 'amber' : ''), mini(t('eng.retention'), `${T.retention_rate ?? 0}%`, (T.retention_rate ?? 0) >= 80 ? 'green' : 'amber')])]));
  // calendar
  const ST = { scheduled: 'grey', upcoming: 'amber', due: 'amber', completed: 'green', missed: 'red', follow_up: 'red' };
  const cal = el('div', { class: 'card ca-card' }, [el('div', { class: 'card__head' }, [el('h3', { text: t('eng.calendar') }), el('button', { class: 'btn btn--secondary', text: t('eng.addItem'), onclick: addItem })])]);
  for (const it of d.calendar || []) cal.append(el('div', { class: 'ca-attn' }, [el('span', { class: `vs-badge vs-badge--${ST[it.status] || 'grey'}`, text: t('eng.st_' + it.status) }), el('div', { class: 'grow' }, [el('b', { text: it.title }), el('div', { class: 'muted', text: `${t('eng.k_' + it.kind)} · ${fmtDate(it.due_on)} · ${it.network || t('eng.bothNetworks')} · ${t('eng.participants', { n: it.participants })}` })]),
    it.status !== 'completed' ? el('button', { class: 'btn btn--quiet', text: t('eng.markDone'), onclick: async () => { const ev = prompt(t('eng.evidencePrompt')) || ''; try { await rpc('engagement_item_set', { p_id: it.id, p_status: 'completed', p_evidence: ev || null }); toast(t('eng.saved')); render(root, params, ctx); } catch (e) { toastError(e?.message || t('errors.save')); } } }) : null]));
  // needs follow-up + open follow-ups
  const fu = el('div', { class: 'card ca-card' }, [el('h3', { text: t('eng.needsFollowup', { n: (d.needs_followup || []).length }) })]);
  for (const l of (d.needs_followup || []).slice(0, 25)) fu.append(el('div', { class: 'ca-attn' }, [el('span', { class: `vs-badge vs-badge--${l.status === 'inactive' ? 'red' : 'amber'}`, text: t('eng.s_' + l.status) }), el('div', { class: 'grow' }, [el('b', { text: l.name }), el('div', { class: 'muted', text: `${t('role.' + l.role)} · ${l.country || ''} · ${l.last_seen ? t('cty.lastSeen', { d: fmtDate(l.last_seen) }) : t('cty.neverSeen')}` })]),
    el('a', { href: `#/messages?u=${l.id}`, class: 'btn btn--quiet', text: t('cty.message') }),
    el('button', { class: 'btn btn--secondary', text: t('eng.openFollowup'), onclick: async () => { const note = prompt(t('eng.followupNote')) || null; try { await rpc('engagement_followup_open', { pid: l.id, p_reason: l.status === 'inactive' ? 'inactive' : l.status === 'at_risk' ? 'at_risk' : 'declining', p_note: note }); toast(t('eng.saved')); render(root, params, ctx); } catch (e) { toastError(e?.message || t('errors.save')); } } })]));
  if (!(d.needs_followup || []).length) fu.append(el('p', { class: 'muted', text: t('eng.noneNeed') }));
  const open = el('div', { class: 'card ca-card' }, [el('h3', { text: t('eng.tracker', { n: (d.followups || []).length }) })]);
  for (const f of d.followups || []) open.append(el('div', { class: 'ca-attn' }, [el('span', { class: 'vs-badge vs-badge--amber', text: t('eng.r_' + f.reason) }), el('div', { class: 'grow' }, [el('b', { text: f.name }), el('div', { class: 'muted', text: `${f.country || ''} · ${t('eng.opened', { d: fmtDate(f.opened_at) })}${f.note ? ' · ' + f.note : ''}` })]),
    ...['re_engaged', 'exit', 'closed'].map((s) => el('button', { class: `btn ${s === 're_engaged' ? 'btn--primary' : 'btn--quiet'}`, text: t('eng.close_' + s), onclick: async () => { const o = prompt(t('eng.outcomePrompt')) || null; try { await rpc('engagement_followup_close', { fid: f.id, p_status: s, p_outcome: o }); toast(t('eng.saved')); render(root, params, ctx); } catch (e) { toastError(e?.message || t('errors.save')); } } }))]));
  if (!(d.followups || []).length) open.append(el('p', { class: 'muted', text: t('eng.noOpen') }));
  body.append(el('div', { class: 'ca-grid ca-grid--2' }, [cal, el('div', {}, [fu, open])]));
  // by country / by level
  const byc = el('div', { class: 'card ca-card' }, [el('h3', { text: t('eng.byCountry') }), el('div', { class: 'table-wrap' }, [el('table', { class: 'vs-table ca-table' }, [el('thead', {}, [el('tr', {}, [el('th', { text: t('v.country') }), el('th', { text: t('eng.leaders') }), el('th', { text: t('eng.engaged') }), el('th', { text: '%' })])]),
    el('tbody', {}, (d.by_country || []).map((c) => el('tr', {}, [el('td', { text: c.country || '—' }), el('td', { text: String(c.total) }), el('td', { text: String(c.engaged) }), el('td', { text: c.total ? `${Math.round(100 * c.engaged / c.total)}%` : '—' })])))])])]);
  const byl = el('div', { class: 'card ca-card' }, [el('h3', { text: t('eng.byLevel') }), el('div', { class: 'table-wrap' }, [el('table', { class: 'vs-table ca-table' }, [el('thead', {}, [el('tr', {}, [el('th', { text: t('acc.thRole') }), el('th', { text: t('eng.leaders') }), el('th', { text: t('eng.engaged') }), el('th', { text: '%' })])]),
    el('tbody', {}, (d.by_level || []).map((r) => el('tr', {}, [el('td', { text: t('role.' + r.role) }), el('td', { text: String(r.total) }), el('td', { text: String(r.engaged) }), el('td', { text: r.total ? `${Math.round(100 * r.engaged / r.total)}%` : '—' })])))])])]);
  body.append(el('div', { class: 'ca-grid ca-grid--eq' }, [byc, byl]));
  return shell.teardown;

  async function addItem() {
    const title = prompt(t('eng.addTitle')); if (!title) return;
    const due = prompt(t('eng.addDate'), new Date().toISOString().slice(0, 10)); if (!due) return;
    try { const { error } = await db().from('engagement_items').insert({ kind: 'other', title, due_on: due, network: net === 'all' ? null : net, created_by: ctx.profile.id }); if (error) throw error; toast(t('eng.saved')); render(root, params, ctx); }
    catch (e) { toastError(e?.message || t('errors.save')); }
  }
}
