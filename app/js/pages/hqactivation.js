/* ---------------------------------------------------------------------------
 * Phase 210: HQ: Activation & Readiness (#/hq/activation), rebuilt on
 * database-side analytics. Every figure is computed in hq_activation_stats()
 * (one route at a time, test records excluded unless asked), the register is
 * paged and filtered in the database (hq_activation_register), and a
 * candidate's full record is fetched only when HQ opens it
 * (hq_activation_candidate). Nothing on this page is counted in the browser.
 * ------------------------------------------------------------------------- */
import { el, clear, debounce } from '../core/dom.js';
import { t, fmtDate, fmtDateTime } from '../core/i18n.js';
import { hqActivationStats, hqActivationRegister, hqActivationCandidate, hqActivationSetTest, hqReadinessDetail, reviewReadinessV2, hqActivationRanking,
  decideActivationExtension, referralLinkSet, joinUrl, avatarUrl, hqReferralForms, hqActivationErrors, hqAppointCandidate, hqCandidateComms, hqPositionMailboxes,
  activationPassedExport } from '../core/db.js';
import { toast, toastError } from '../components/toast.js';
import { renderShell } from '../components/layout.js';
import { icon } from '../components/icons.js';

export async function render(root, _params, ctx) {
  const shell = renderShell(root, { profile: ctx?.profile, modules: ctx?.modules, titleKey: 'hqa.title' });
  await draw(shell.outlet);
  return shell.teardown;
}

let ROUTE = 'ref3';          // 'ref3' | 'open7' | 'd14' (Phase 218: the 14-Day journey, passed list)
let D14 = null;              // cached passed list (raw rows from activation_passed_export)
let INCLUDE_TEST = false;    // test records stay out of every figure unless HQ asks
const PAGE = 50;

const n0 = (v) => Number(v || 0);
const pct = (a, b) => (n0(b) ? Math.round(100 * n0(a) / n0(b)) : 0);
const tile = (n, label, tone, sub) => el('div', { class: 'vs-mini__t' + (tone ? ' vs-mini__t--' + tone : '') }, [el('b', { text: String(n ?? 0) }), el('small', { text: label }), sub ? el('small', { class: 'muted', text: sub }) : null]);
const table = (head, rows) => el('div', { class: 'table-wrap' }, [el('table', { class: 'vs-table ca-table hf-table' }, [
  el('thead', {}, [el('tr', {}, head.map((h) => el('th', { text: h })))]), el('tbody', {}, rows)])]);
const section = (title, body, extra, cls) => el('section', { class: 'vs-card' + (cls ? ' ' + cls : '') }, [el('div', { class: 'card__head' }, [el('h3', { text: title }), extra || null]), ...(Array.isArray(body) ? body : [body])]);
const nothing = () => el('p', { class: 'muted', text: t('hqa.nothingYet') });
const placeOf = (c) => c.position_place || [c.cluster, c.lga, c.state, c.country].filter(Boolean).join(', ');
const STAGE_TONE = { not_started: 'grey', in_progress: 'amber', awaiting_review: 'magenta', decided: 'green', incomplete: 'red' };
const KIND_TONE = { expiring: 'red', never_started: 'amber', stuck: 'amber', awaiting_review: 'magenta', email_problem: 'red', duplicate: 'grey' };

/* The route tabs, shared by every view. counts: { ref3, open7, d14 }. */
function tabsEl(out, counts) {
  const tab = (route, label, sub, n) => el('button', { class: 'hqa-tab' + (ROUTE === route ? ' is-on' : ''), 'data-route': route, onclick: () => { ROUTE = route; draw(out); } }, [
    el('b', { text: label }), el('small', { text: sub }), el('span', { class: 'hqa-tab__n', text: n == null ? '' : String(n) })]);
  const row = el('div', { class: 'hqa-tabs hqa-tabs--3' }, [
    tab('ref3', t('hqa.tabRef3'), t('hqa.tabRef3Sub'), counts.ref3 ?? 0),
    tab('open7', t('hqa.tabOpen7'), t('hqa.tabOpen7Sub'), counts.open7 ?? 0),
    tab('d14', t('hqa.tabD14'), t('hqa.tabD14Sub'), counts.d14)]);
  if (counts.d14 == null) {
    // The passed count arrives in the background; the badge fills in.
    loadD14().then((rows) => { const b = row.querySelector('[data-route="d14"] .hqa-tab__n'); if (b) b.textContent = String(rows.length); }).catch(() => {});
  }
  return row;
}
function loadD14() {
  if (!D14) D14 = activationPassedExport().then((r) => r || []).catch((e) => { D14 = null; throw e; });
  return D14;
}

/* ---- Phase 218: the 14-Day Activation Journey (Jul to Aug 2026) --------
   Regina asked for the candidates who passed, with name, email, phone,
   network, position applied for and location, downloadable as PDF, CSV and
   Excel. "Passed" is WDOS's own evaluation (activation_passed_export). */
async function drawD14(out) {
  const [s3, s7] = await Promise.all([hqActivationStats('ref3', INCLUDE_TEST).catch(() => null), hqActivationStats('open7', INCLUDE_TEST).catch(() => null)]);
  let raw;
  try { raw = await loadD14(); } catch (err) {
    out.append(tabsEl(out, { ref3: s3?.totals?.registrations, open7: s7?.totals?.registrations, d14: 0 }));
    out.append(el('div', { class: 'vs-card' }, [el('p', { text: err?.message || t('errors.load') })])); return;
  }
  out.append(tabsEl(out, { ref3: s3?.totals?.registrations, open7: s7?.totals?.registrations, d14: raw.length }));
  const X = await import('../core/passedexport.js');
  const rows = X.prepare(raw);
  const by = (k) => rows.reduce((m, r) => { const v = r[k] || ''; m[v] = (m[v] || 0) + 1; return m; }, {});
  const nets = by('network'); const countries = Object.keys(by('country')).filter(Boolean);
  const seats = rows.filter((r) => r.seat).length;

  const dl = (label, fn) => {
    const b = el('button', { class: 'btn btn--secondary', 'data-format': fn }, [icon(fn === 'downloadPassedPdf' ? 'file-pdf' : 'download', 14), ' ', label]);
    b.addEventListener('click', async () => {
      b.disabled = true;
      try { await X[fn](raw); toast(t('hqa.d14Downloaded', { n: rows.length })); }
      catch (e) { toastError(e?.message || t('rep.dlFailed')); }
      b.disabled = false;
    });
    return b;
  };
  out.append(section(t('hqa.d14Title'), [
    el('p', { class: 'muted', text: t('hqa.d14Intro') }),
    el('div', { class: 'vs-mini' }, [
      tile(rows.length, t('hqa.d14Passed'), 'green'),
      tile(nets.WGMN || 0, 'WGMN', 'magenta'), tile(nets.WNNN || 0, 'WNNN', 'green'),
      tile(countries.length, t('hqa.d14Countries'), null, countries.join(', ')),
      tile(seats, t('hqa.d14Seats'))]),
    el('div', { class: 'row', 'data-passed-export': '', style: 'gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px;' }, [
      el('b', { text: t('hqa.d14Download') }),
      dl('PDF', 'downloadPassedPdf'), dl('CSV', 'downloadPassedCsv'), dl('Excel', 'downloadPassedExcel')]),
  ]));

  const body = el('tbody');
  const fill = (q) => {
    const k = String(q || '').trim().toLowerCase();
    const list = k ? rows.filter((r) => [r.name, r.email, r.phone, r.network, r.position, r.location].join(' ').toLowerCase().includes(k)) : rows;
    body.replaceChildren(...list.map((r) => el('tr', {}, [
      el('td', { class: 'muted', text: String(r.no) }),
      el('td', {}, [el('b', { text: r.name }), r.seat ? el('div', { class: 'muted', style: 'font-size:11px;', text: t('hqa.d14SeatHeld', { seat: r.seat }) }) : null]),
      el('td', { text: r.email }), el('td', { style: 'white-space:nowrap;', text: r.phone }),
      el('td', { text: r.network }), el('td', { text: r.position }), el('td', { class: 'hf-td-wrap', text: r.location })])));
    count.textContent = String(list.length);
  };
  const count = el('span', { class: 'hf-count', text: String(rows.length) });
  const search = el('input', { class: 'input', type: 'search', placeholder: t('hqa.d14Filter'), style: 'max-width:340px;' });
  search.addEventListener('input', debounce(() => fill(search.value), 150));
  out.append(section(t('hqa.d14ListTitle'), [
    search,
    el('div', { class: 'table-wrap', style: 'margin-top:10px;' }, [el('table', { class: 'vs-table ca-table hf-table' }, [
      el('thead', {}, [el('tr', {}, ['#', t('hqa.d14Name'), t('hqa.d14Email'), t('hqa.d14Phone'), t('hqa.d14Network'), t('hqa.d14Position'), t('hqa.d14Location')].map((h) => el('th', { text: h })))]),
      body])]),
  ], count));
  fill('');
}

async function draw(out) {
  clear(out);
  if (ROUTE === 'd14') return drawD14(out);
  let S;
  try { S = await hqActivationStats(ROUTE, INCLUDE_TEST); } catch (err) { out.append(el('div', { class: 'vs-card' }, [el('p', { text: err?.message || t('errors.load') })])); return; }
  const T = S.totals || {};
  let S2 = null;   // the other route's headline, for the tab badge
  try { S2 = await hqActivationStats(ROUTE === 'ref3' ? 'open7' : 'ref3', INCLUDE_TEST); } catch { S2 = null; }

  /* ---- 0. route tabs + test toggle --------------------------------------- */
  out.append(tabsEl(out, {
    ref3: (ROUTE === 'ref3' ? T : S2?.totals)?.registrations,
    open7: (ROUTE === 'open7' ? T : S2?.totals)?.registrations,
    d14: undefined }));   // the passed count fills in from the background load
  out.append(el('div', { class: 'hqa-toolbar' }, [
    el('label', { class: 'hqa-switch' }, [el('input', { type: 'checkbox', checked: INCLUDE_TEST || null, onchange: (e) => { INCLUDE_TEST = e.target.checked; draw(out); } }), el('span', { text: t('hqa.includeTest', { n: T.test_excluded ?? 0 }) })]),
    el('span', { class: 'muted', text: t('hqa.asOf', { at: fmtDateTime(S.as_of) }) }),
    el('a', { class: 'btn btn--secondary', href: `#/ops/reports?kind=${ROUTE}` }, [icon('file-pdf', 14), ' ', t('ops.rpActivation')])]));

  /* ---- 1. the two referral forms --------------------------------------- */
  if (ROUTE === 'ref3') {
    let forms = []; try { forms = await hqReferralForms(); } catch { forms = []; }
    out.append(section(t('hqa.twoForms'), [
      el('p', { class: 'muted', text: t('hqa.twoFormsIntro') }),
      el('div', { class: 'ca-grid ca-grid--eq' }, forms.map((f) => {
        const url = joinUrl(f.code);
        return el('div', { class: `hqa-form hqa-form--${f.code.toLowerCase()}` }, [
          el('div', { class: 'hqa-form__head' }, [el('img', { src: f.code === 'WNNN' ? '/assets/logos/wnnn-disc.png' : '/assets/logos/wgmn-disc.png', alt: f.code, class: 'hqa-form__logo' }),
            el('div', {}, [el('b', { text: f.code === 'WNNN' ? t('join.labelWnnn') : t('join.labelWgmn') }), el('div', { class: 'muted', text: f.label || '' })]),
            el('span', { class: `vs-badge vs-badge--${f.active ? 'green' : 'grey'}`, text: f.active ? t('lt.live') : t('lt.paused') })]),
          el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0;' }, [
            el('code', { style: 'user-select:all;font-size:14px;font-weight:700;', text: url }),
            el('button', { class: 'btn btn--primary', text: t('ref.copy'), onclick: async () => { try { await navigator.clipboard.writeText(url); toast(t('acc.copied')); } catch { /* ignore */ } } }),
            el('a', { href: `https://wa.me/?text=${encodeURIComponent(t('join.shareText', { url }))}`, target: '_blank', rel: 'noopener', class: 'btn btn--quiet', text: 'WhatsApp' }),
            el('button', { class: 'btn btn--quiet', text: f.active ? t('lt.pause') : t('lt.resume'), onclick: async () => { try { await referralLinkSet(null, !f.active, null, f.code); toast(t('v.saved')); await draw(out); } catch (e) { toastError(e?.message || t('errors.save')); } } })]),
          el('div', { class: 'vs-mini' }, [tile(f.visits, t('lt.visits')), tile(f.visits_7d, t('lt.visits7')), tile(f.registrations, t('lt.registered')), tile(f.started, t('hqa.started'), 'green'), tile(f.in_progress, t('lt.inProgress'), 'amber'), tile(f.completed, t('lt.completed'), 'green')]),
          f.last_visit ? el('p', { class: 'muted', text: t('lt.lastVisit', { date: fmtDateTime(f.last_visit) }) }) : el('p', { class: 'muted', text: t('lt.noVisits') }),
        ]);
      })),
    ]));
  } else out.append(section(t('hqa.open7Title'), [el('p', { class: 'muted', text: t('hqa.open7Intro') })]));

  /* ---- 2. attention now ------------------------------------------------- */
  const A = S.attention || [];
  out.append(section(t('hqa.attentionTitle'), [
    el('p', { class: 'muted', text: t('hqa.attentionIntro') }),
    A.length ? el('div', {}, A.map((a) => el('div', { class: 'hqa-attn' }, [
      el('span', { class: `vs-badge vs-badge--${KIND_TONE[a.kind] || 'grey'}`, text: t('hqa.k_' + a.kind) }),
      el('div', { class: 'grow' }, [el('b', { text: a.name }), el('span', { class: 'muted', text: ` · ${a.position || ''} · ${a.place || ''} · ${a.network}` }), el('div', { class: 'muted', style: 'font-size:12px;', text: a.detail })]),
      a.hours_left != null && a.hours_left > 0 ? el('span', { class: 'hqa-hours', text: t('hqa.hoursLeft', { h: Math.round(a.hours_left) }) }) : null,
      el('button', { class: 'btn btn--quiet', text: t('hqa.open'), onclick: () => openCandidate(a.activation_id) }),
    ]))) : el('p', { class: 'vs-ok', text: t('hqa.attentionNone') }),
  ], el('span', { class: 'hf-count', text: String(A.length) })));

  /* ---- 3. anything that failed, in plain sight ------------------------ */
  try {
    const E = await hqActivationErrors(30);
    if ((E || []).length) out.append(section(t('hqa.errorsTitle'), [el('p', { class: 'muted', text: t('hqa.errorsIntro') }),
      table([t('hqa.when'), t('v.email'), t('hqa.stage'), t('hqa.formCode'), t('hqa.message')], E.map((x) => el('tr', {}, [el('td', { text: fmtDateTime(x.at) }), el('td', { text: x.email || '—' }), el('td', { text: x.stage }), el('td', { text: x.code || '—' }), el('td', { class: 'hf-td-wrap', text: x.message })])))]));
  } catch { /* HQ only */ }

  /* ---- 4. at a glance ---------------------------------------------------- */
  out.append(section(ROUTE === 'ref3' ? t('hqa.totalsRef3') : t('hqa.totalsOpen7'), [
    el('div', { class: 'vs-mini' }, [
      tile(T.registrations, t('hqa.registrations')), tile(T.people, t('hqa.people'), 'magenta', T.duplicates ? t('hqa.dupNote', { n: T.duplicates }) : null),
      tile(T.wgmn, 'WGMN'), tile(T.wnnn, 'WNNN'),
      tile(T.not_started, t('hqa.notStarted'), 'grey'), tile(T.in_progress, t('hqa.inProgress'), 'amber'),
      tile(T.awaiting_review, t('hqa.awaitingReview'), 'magenta'), tile(T.decided, t('hqa.decided'), 'green'),
      tile(T.incomplete, t('hqa.incomplete'), 'red', T.incomplete_never_started ? t('hqa.neverStartedOf', { n: T.incomplete_never_started }) : null),
      tile(T.extension_requested, t('hqa.extReq')), tile(T.assess_returned, t('hqa.returned')),
      tile(T.selected, t('hqa.selected'), 'green'), tile(T.reserve, t('hqa.reserve')), tile(T.further_review, t('hqa.further')), tile(T.not_selected, t('hqa.notSel')), tile(T.appointed, t('hqa.appointed'), 'green')]),
    el('div', { class: 'hqa-rates' }, [
      rate(t('hqa.startedRate'), T.started_rate, t('hqa.startedRateSub')),
      rate(t('hqa.completionRate'), T.completion_rate, t('hqa.completionRateSub')),
      rate(t('hqa.completionOfStarted'), T.completion_rate_of_started, t('hqa.completionOfStartedSub'))]),
  ]));

  /* ---- 5. funnel + timing + sign-ups ------------------------------------- */
  const F = S.funnel || []; const base = n0(F[0]?.n);
  const funnel = el('div', { class: 'hqa-funnel' }, F.map((f) => el('div', { class: 'hqa-funnel__row' }, [
    el('span', { class: 'hqa-funnel__label', text: f.key.startsWith('day') && f.day ? t('hqa.f_day', { n: f.day }) : f.key === 'last_day' ? t('hqa.f_last_day', { n: f.day }) : t('hqa.f_' + f.key) }),
    el('div', { class: 'hqa-funnel__bar' }, [el('div', { class: 'hqa-funnel__fill', style: `width:${base ? Math.max(2, Math.round(100 * n0(f.n) / base)) : 0}%` })]),
    el('b', { class: 'hqa-funnel__n', text: String(n0(f.n)) }), el('small', { class: 'muted', text: `${pct(f.n, base)}%` })])));
  const TM = S.timing || {};
  const timing = el('div', { class: 'vs-mini vs-mini--tight' }, [
    tile(TM.median_hours_to_start != null ? `${TM.median_hours_to_start} h` : '—', t('hqa.medStart')),
    tile(TM.median_hours_to_submit != null ? `${TM.median_hours_to_submit} h` : '—', t('hqa.medSubmit')),
    tile(TM.on_time, t('hqa.onTime'), 'green'), tile(TM.late, t('hqa.late'), TM.late ? 'red' : null),
    ...((TM.per_day || []).map((d) => tile(`${d.median_minutes} min`, t('hqa.medDay', { n: d.day }), null, t('hqa.nCompleted', { n: d.n }))))]);
  out.append(el('div', { class: 'ca-grid ca-grid--eq' }, [
    section(t('hqa.funnelTitle'), [el('p', { class: 'muted', text: t('hqa.funnelIntro') }), funnel]),
    section(t('hqa.timingTitle'), [el('p', { class: 'muted', text: t('hqa.timingIntro') }), timing, el('h4', { text: t('hqa.signups30') }), sparkline(S.signups || [])]),
  ]));

  /* ---- 6. communications, with the mailer's real answer ------------------ */
  const C = S.comms || {};
  let CL = null; try { CL = await hqCandidateComms(60); } catch { CL = null; }
  out.append(section(t('hqa.commsTitle'), [
    el('p', { class: 'muted', text: t('hqa.commsIntro2') }),
    el('div', { class: 'vs-mini' }, [tile(C.sends, t('hqa.commsSends')), tile(C.people_reached, t('hqa.commsPeople'), 'magenta'), tile(C.accepted, t('hqa.commsAccepted'), 'green'), tile(C.queued, t('hqa.commsQueued'), 'amber'),
      tile(C.rejected, t('hqa.commsRejected'), C.rejected ? 'red' : null), tile(C.unverified, t('hqa.commsUnverified'), 'grey'), tile(C.unknown, t('hqa.commsUnknown'), C.unknown ? 'red' : 'grey')]),
    el('p', { class: n0(C.welcome_missing) ? 'vs-warn' : 'vs-ok', text: n0(C.welcome_missing) ? t('hqa.welcomeMissing', { n: C.welcome_missing }) : t('hqa.welcomeAll', { n: C.before_live ?? 0 }) }),
    table([t('hqa.message'), t('hqa.commsSends'), t('hqa.commsPeople'), t('hqa.commsFailed')], (C.by_trigger || []).map((x) => el('tr', {}, [el('td', { text: t('hqa.tr_' + x.trigger) }), el('td', { text: String(x.sends) }), el('td', { text: String(x.people) }), el('td', { text: String(x.failed) })]))),
    (CL?.undelivered || []).length ? el('div', {}, [el('h4', { text: t('hqa.commsUndelivered') }), table([t('v.email'), t('hqa.trigger'), t('hqa.message'), t('hqa.when')], CL.undelivered.map((x) => el('tr', {}, [el('td', { text: x.email }), el('td', { text: t('hqa.tr_' + x.trigger) }), el('td', { class: 'hf-td-wrap', text: x.error || '' }), el('td', { text: fmtDateTime(x.at) })])))]) : null,
    CL ? el('details', {}, [el('summary', { text: t('hqa.commsRecent') }), table([t('hqa.when'), t('v.email'), t('hqa.trigger'), t('hqa.subject'), t('hqa.mailerSaid')], (CL.recent || []).map((x) => el('tr', {}, [el('td', { text: fmtDateTime(x.at) }), el('td', { text: x.email }), el('td', { text: t('hqa.tr_' + x.trigger) }), el('td', { class: 'hf-td-wrap', text: x.subject }), el('td', { text: mailerWord(x) })])))]) : null,
  ]));

  /* ---- 7. breakdowns ------------------------------------------------------ */
  const bp = S.by_position || [], bc = S.by_country || [], bs = S.by_state || [], br = S.by_source || [], bd = S.by_day || [];
  out.append(el('div', { class: 'ca-grid ca-grid--eq' }, [
    section(t('hqa.byPosition'), bp.length ? table([t('hqa.position'), t('v.network'), t('hqa.registrations'), t('hqa.started'), t('hqa.done'), t('hqa.incomplete'), t('hqa.selected')],
      bp.map((x) => el('tr', {}, [el('td', { class: 'hf-td-wrap', text: x.position }), el('td', { text: x.network }), el('td', { text: String(x.n) }), el('td', { text: String(x.started) }), el('td', { text: String(x.completed) }), el('td', { text: String(x.incomplete) }), el('td', { text: String(x.selected) })]))) : nothing()),
    section(t('hqa.byCountry'), bc.length ? table([t('v.country'), t('hqa.registrations'), t('hqa.people'), t('hqa.notStarted'), t('hqa.inProgress'), t('hqa.done'), t('hqa.incomplete'), t('hqa.selected')],
      bc.map((x) => el('tr', {}, [el('td', { text: x.country }), el('td', { text: String(x.n) }), el('td', { text: String(x.people) }), el('td', { text: String(x.not_started) }), el('td', { text: String(x.in_progress) }), el('td', { text: String(x.completed) }), el('td', { text: String(x.incomplete) }), el('td', { text: String(x.selected) })]))) : nothing()),
  ]));
  out.append(section(t('hqa.bySource'), br.length ? table([t('hqa.sourceCat'), t('hqa.referrer'), t('hqa.registrations'), t('hqa.started'), t('hqa.done'), t('hqa.incomplete'), t('hqa.selected')],
    br.map((x) => el('tr', {}, [el('td', { text: t('hqa.cat_' + x.category) }), el('td', { text: x.referrer }), el('td', { text: String(x.n) }), el('td', { text: String(x.started) }), el('td', { text: String(x.completed) }), el('td', { text: String(x.incomplete) }), el('td', { text: String(x.selected) })]))) : nothing()));
  out.append(el('div', { class: 'ca-grid ca-grid--eq' }, [
    section(t('hqa.byState'), bs.length ? table([t('v.country'), t('hqa.stateRegion'), t('hqa.registrations'), t('hqa.started'), t('hqa.done'), t('hqa.selected')],
      bs.map((x) => el('tr', {}, [el('td', { text: x.country }), el('td', { text: x.state }), el('td', { text: String(x.n) }), el('td', { text: String(x.started) }), el('td', { text: String(x.completed) }), el('td', { text: String(x.selected) })]))) : nothing()),
    section(ROUTE === 'ref3' ? t('hqa.byDay3') : t('hqa.byDay7'), [el('p', { class: 'muted', text: t('hqa.byDayIntro') }), table([t('hqa.day'), t('hqa.dayTitle'), t('hqa.opened'), t('hqa.done'), t('hqa.rate'), t('hqa.medianMin')],
      bd.map((d) => el('tr', {}, [el('td', { text: String(d.day) }), el('td', { class: 'hf-td-wrap', text: d.title }), el('td', { text: String(d.opened) }), el('td', { text: String(d.completed) }), el('td', { text: d.opened ? `${pct(d.completed, d.opened)}%` : '—' }), el('td', { text: d.median_minutes != null ? String(d.median_minutes) : '—' })])))]),
  ]));

  /* ---- 8. data quality ---------------------------------------------------- */
  const D = S.duplicates || [];
  out.append(section(t('hqa.qualityTitle'), [
    el('p', { class: 'muted', text: t('hqa.qualityIntro') }),
    el('div', { class: 'vs-mini vs-mini--tight' }, [tile(T.duplicates, t('hqa.qDuplicates'), T.duplicates ? 'amber' : null), tile(T.email_problems, t('hqa.qEmails'), T.email_problems ? 'red' : null), tile(T.test_excluded, t('hqa.qTest'), 'grey')]),
    D.length ? table([t('v.name'), t('hqa.registrations'), t('hqa.emails')], D.map((d) => el('tr', {}, [el('td', { text: d.name }), el('td', { text: String(d.n) }), el('td', { class: 'hf-td-wrap', text: (d.emails || []).join(', ') })]))) : null,
  ]));

  /* ---- 9. ranking: several candidates for the same seat ------------------- */
  let R = []; try { R = await hqActivationRanking(); } catch { R = []; }
  const contested = (R || []).filter((g) => (g.candidates || []).length > 0);
  out.append(section(t('hqa.rankingTitle'), [
    el('p', { class: 'muted', text: t('hqa.rankingIntro') }),
    contested.length ? el('div', {}, contested.map((g) => el('details', { class: 'hqa-cand', open: g.n > 1 || null }, [
      el('summary', {}, [el('div', { class: 'hqa-cand__row' }, [
        el('div', { class: 'grow' }, [el('b', { text: `${g.position} · ${g.network}` }), el('div', { class: 'muted', text: [g.cluster, g.lga, g.state, g.country].filter(Boolean).join(', ') })]),
        el('span', { class: `vs-badge vs-badge--${g.n > 1 ? 'amber' : 'grey'}`, text: t('hqa.nCandidates', { n: g.n }) })])]),
      table([t('hqa.rank'), t('v.name'), t('hqa.systemRec'), t('hqa.rankScore'), t('hqa.yesOf30'), t('hqa.clarifications'), t('hqa.shortScore'), t('hqa.readiness'), t('hqa.timeTaken'), t('hqa.onTime'), t('hqa.hqReview'), t('hqa.outcome'), ''],
        (g.candidates || []).map((c, i) => el('tr', {}, [
          el('td', {}, [el('b', { text: String(i + 1) })]), el('td', { class: 'hf-td-wrap' }, [el('b', { text: c.name }), el('div', { class: 'muted', text: c.email })]),
          el('td', {}, [el('span', { class: `vs-badge vs-badge--${{ recommended: 'green', reserve: 'amber', further_review: 'grey', not_recommended: 'red' }[c.recommendation] || 'grey'}`, text: c.recommendation ? t('hqa.rec_' + c.recommendation) : '—' }), c.tie ? el('div', { class: 'muted', text: t('hqa.tie') }) : null]),
          el('td', {}, [el('b', { text: c.rank_score != null ? String(c.rank_score) : '—' })]), el('td', { text: String(c.yes_count ?? 0) }), el('td', { text: String(c.clarifications ?? 0) }),
          el('td', { text: c.short_score != null ? `${c.short_score}/8${c.short_auto ? ' ' + t('hqa.auto') : ''}` : t('hqa.notScored') }), el('td', { text: c.readiness ? t('ra.r_' + c.readiness) : '—' }),
          el('td', { text: c.hours_taken != null ? (c.hours_taken < 48 ? `${Number(c.hours_taken).toFixed(1)} h` : `${Number(c.days_taken).toFixed(1)} d`) : '—' }), el('td', { text: c.on_time ? '✓' : '✗' }),
          el('td', { text: c.understanding_review ? t('hqa.u_' + c.understanding_review) + (c.next_stage ? ' · ' + t('hqa.n_' + c.next_stage) : '') : t('hqa.pendingReview') }),
          el('td', { text: c.appointed ? t('hqa.appointed') : (c.outcome ? t('hqa.o_' + c.outcome) : '—') }),
          el('td', {}, [!c.appointed && !c.outcome ? el('button', { class: `btn ${c.recommendation === 'recommended' ? 'btn--primary' : 'btn--quiet'}`, text: t('hqa.approveAppoint'), onclick: async () => {
            if (!window.confirm(t('hqa.approveConfirm', { name: c.name, position: g.position, place: [g.cluster, g.lga, g.state, g.country].filter(Boolean).join(', ') }))) return;
            try { await hqAppointCandidate(c.activation_id, c.recommendation === 'recommended' ? 'per system recommendation' : 'HQ decision'); toast(t('hqa.appointedToast', { name: c.name })); await draw(out); } catch (e) { toastError(e?.message || t('errors.save')); } } }) : null])]))),
      el('p', { class: 'muted', style: 'font-size:12px;', text: t('hqa.rankFormula2') }),
    ]))) : nothing(),
  ]));

  /* ---- 10. the candidate register (paged in the database) ---------------- */
  const filters = { q: '', network: '', stage: '', country: '', offset: 0 };
  const fsel = (key, opts, label) => { const s = el('select', { class: 'input', style: 'width:auto;' }, [el('option', { value: '', text: label }), ...opts.map((o) => el('option', { value: o[0], text: o[1] }))]); s.addEventListener('change', () => { filters[key] = s.value; filters.offset = 0; drawRows(); }); return s; };
  const search = el('input', { class: 'input', style: 'width:220px;', placeholder: t('hqa.search') }); search.addEventListener('input', debounce(() => { filters.q = search.value.trim(); filters.offset = 0; drawRows(); }, 300));
  const countrySel = fsel('country', [], t('v.country'));
  const bar = el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;margin-bottom:8px;' }, [
    search, fsel('network', [['WGMN', 'WGMN'], ['WNNN', 'WNNN']], t('v.network')),
    fsel('stage', [['not_started', t('hqa.notStarted')], ['in_progress', t('hqa.inProgress')], ['awaiting_review', t('hqa.awaitingReview')], ['decided', t('hqa.decided')], ['incomplete', t('hqa.incomplete')], ['active', t('hqa.activeNow')]], t('hqa.status')),
    countrySel,
    el('button', { class: 'btn btn--quiet', text: t('hqa.exportCsv'), onclick: exportCsv })]);
  const body = el('div'); const count = el('span', { class: 'hf-count', text: '0' }); const pager = el('div', { class: 'hqa-pager' });
  out.append(section(t('hqa.register'), [el('p', { class: 'muted', text: t('hqa.registerIntro') }), bar, body, pager], count));
  await drawRows();

  /* ---- 11. position mailboxes, in one line -------------------------------- */
  try {
    const M = await hqPositionMailboxes({ limit: 1 }); const mt = M?.totals || {};
    out.append(section(t('mb.hqTitle'), [
      el('p', { class: 'muted', text: t('mb.hqIntroShort') }),
      el('div', { class: 'vs-mini vs-mini--tight' }, [tile(mt.mailboxes, t('mb.tMailboxes')), tile(mt.matched, t('mb.tMatched')), tile(mt.held, t('mb.tHeld'), 'magenta'), tile(mt.open, t('mb.tOpen'), 'green'), tile(mt.locked, t('mb.tLocked'), 'amber'), tile(mt.parked_at_hq, t('mb.tParked'), mt.parked_at_hq ? 'red' : null), tile(mt.reveals, t('mb.tReveals'))]),
      el('a', { href: '#/hq/mailboxes', class: 'btn btn--primary', text: t('mb.hqOpen') })]));
  } catch { /* HQ only */ }

  /* ======================= helpers bound to this draw ======================= */
  function rate(label, v, sub) { return el('div', { class: 'hqa-rate' }, [el('div', { class: 'hqa-rate__bar' }, [el('div', { class: 'hqa-rate__fill', style: `width:${Math.min(100, n0(v))}%` })]), el('b', { text: `${n0(v)}%` }), el('span', { text: label }), el('small', { class: 'muted', text: sub })]); }

  async function drawRows() {
    clear(body); clear(pager); body.append(el('div', { class: 'state' }, [el('div', { class: 'spinner' })]));
    let R2;
    try { R2 = await hqActivationRegister({ route: ROUTE, q: filters.q || null, network: filters.network || null, stage: filters.stage || null, country: filters.country || null, includeTest: INCLUDE_TEST, limit: PAGE, offset: filters.offset }); }
    catch (e) { clear(body); body.append(el('p', { class: 'muted', text: e?.message || t('errors.load') })); return; }
    clear(body);
    count.textContent = String(R2.total ?? 0);
    if (countrySel.options.length <= 1) (R2.countries || []).forEach((c) => countrySel.append(el('option', { value: c, text: c })));
    const rows = R2.rows || [];
    if (!rows.length) { body.append(el('p', { class: 'muted', text: t('hqa.noCandidates') })); return; }
    body.append(...rows.map((c) => candidateCard(c)));
    const total = n0(R2.total), from = filters.offset + 1, to = Math.min(total, filters.offset + rows.length);
    pager.append(el('span', { class: 'muted', text: t('hqa.pageOf', { from, to, total }) }),
      el('button', { class: 'btn btn--quiet', text: t('hqa.prev'), disabled: filters.offset === 0 || null, onclick: () => { filters.offset = Math.max(0, filters.offset - PAGE); drawRows(); } }),
      el('button', { class: 'btn btn--quiet', text: t('hqa.next'), disabled: to >= total || null, onclick: () => { filters.offset += PAGE; drawRows(); } }));
  }

  function candidateCard(c) {
    const steps = c.steps || [];
    const dots = el('div', { class: 'hqa-dots' }, Array.from({ length: c.days_total || 3 }, (_, i) => {
      const s = steps.find((x) => x.day === i + 1);
      return el('span', { class: `hqa-dot hqa-dot--${s ? s.status : 'not_started'}`, title: `Day ${i + 1}: ${s ? t('hqa.st_' + s.status) : t('hqa.st_not_started')}`, text: String(i + 1) });
    }));
    const flags = (c.flags || []).map((f) => el('span', { class: `vs-badge vs-badge--${KIND_TONE[f] || 'grey'} hqa-flag`, text: t('hqa.k_' + f) }));
    const det = el('details', { class: 'hqa-cand' + (c.is_test ? ' hqa-cand--test' : ''), 'data-activation': c.activation_id });
    const bodyEl = el('div', { class: 'hqa-cand__body' }, [el('div', { class: 'state' }, [el('div', { class: 'spinner' })])]);
    det.append(el('summary', {}, [el('div', { class: 'hqa-cand__row' }, [
      el('img', { class: 'hqa-cand__photo', src: avatarUrl(c.profile_id), alt: '', onerror: 'this.style.visibility="hidden"' }),
      el('div', { class: 'grow' }, [
        el('b', { text: c.name }), el('span', { class: 'muted', text: `  · ${c.route === 'ref3' ? '3-Day' : '7-Day'} · ${c.network}` }), c.is_test ? el('span', { class: 'vs-badge vs-badge--grey', text: t('hqa.testRecord') }) : null,
        el('div', { class: 'hqa-cand__pos', text: `${c.position || '—'} · ${placeOf(c)}` }),
        el('div', { class: 'muted', style: 'font-size:12px;', text: t('hqa.livesAt', { place: [c.cluster, c.lga, c.state, c.country].filter(Boolean).join(', ') }) + (c.referrer_name ? ` · ${t('hqa.referredBy', { name: c.referrer_name })}` : '') }),
        flags.length ? el('div', { class: 'hqa-flags' }, flags) : null]),
      dots,
      el('span', { class: `vs-badge vs-badge--${STAGE_TONE[c.stage] || 'grey'}`, text: t('hqa.g_' + c.stage) }),
      c.hours_left != null ? el('span', { class: 'muted', style: 'font-size:12px;', text: c.hours_left > 0 ? t('hqa.hoursLeft', { h: Math.round(c.hours_left) }) : t('hqa.windowClosed') }) : null,
      c.outcome ? el('span', { class: 'vs-badge vs-badge--magenta', text: t('hqa.o_' + c.outcome) }) : (c.assessment ? el('span', { class: 'vs-badge vs-badge--grey', text: t('hqa.a_' + c.assessment) }) : null),
    ])]), bodyEl);
    det.addEventListener('toggle', async () => { if (det.open && !det.dataset.loaded) { det.dataset.loaded = '1'; await fillDetail(bodyEl, c.activation_id); } });
    return det;
  }

  async function openCandidate(id) {
    const node = [...body.querySelectorAll('details.hqa-cand')].find((d) => d.dataset.activation === id);
    if (node) { node.open = true; node.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    // not on this page of the register: show it in a panel at the top
    const box = el('div', { class: 'vs-card act-modal' }, [el('div', { class: 'card__head' }, [el('h3', { text: t('hqa.candidateRecord') }), el('button', { class: 'btn btn--quiet', text: t('app.close'), onclick: () => box.remove() })]), el('div', { class: 'state' }, [el('div', { class: 'spinner' })])]);
    out.prepend(box); box.scrollIntoView({ behavior: 'smooth' });
    const holder = box.lastChild; await fillDetail(holder, id);
  }

  async function fillDetail(holder, id) {
    let c; try { c = await hqActivationCandidate(id); } catch (e) { clear(holder); holder.append(el('p', { class: 'muted', text: e?.message || t('errors.load') })); return; }
    clear(holder);
    const ra = c.assessment;
    holder.append(el('div', { class: 'ca-grid ca-grid--eq' }, [
      kv(t('hqa.formDetails'), [
        [t('v.email'), c.email + (c.email_problem ? '  ⚠ ' + c.email_problem : '')], [t('join.phone'), c.phone || '—'], [t('join.dob'), c.birth_date ? fmtDate(c.birth_date) : '—'], [t('hqa.language'), (c.language || 'en').toUpperCase()],
        [t('v.network'), `${c.network}${c.network_chosen ? ' (' + t('hqa.chosen') + ')' : ''}`], [t('hqa.position'), c.position || '—'], [t('v.country'), c.country || '—'], [t('hqa.stateRegion'), c.state || '—'],
        [t('hqa.lga'), c.lga || '—'], [t('hqa.cluster'), c.cluster || '—'], [t('hqa.sourceCat'), c.referrer_category ? t('hqa.cat_' + c.referrer_category) : '—'], [t('hqa.referrer'), c.referrer_name || '—']]),
      kv(t('hqa.progress'), [
        [t('hqa.registeredAt'), fmtDateTime(c.created_at)], [t('hqa.firstActivity'), c.first_activity_at ? fmtDateTime(c.first_activity_at) : t('hqa.notStarted')], [t('hqa.deadline'), c.deadline ? fmtDateTime(c.deadline) : '—'],
        [t('hqa.completedAt'), c.completed_at ? fmtDateTime(c.completed_at) : '—'], [t('hqa.extension'), c.extension_status ? t('act.ext_' + c.extension_status) : '—'],
        [t('hqa.assessment'), ra?.status && !(c.status === 'incomplete' && ra.status === 'pending') ? t('hqa.a_' + ra.status) : t('hqa.notSubmitted')], [t('hqa.rankScore'), ra?.rank_score != null ? `${ra.rank_score}/100` : '—'],
        [t('hqa.systemRec'), ra?.recommendation ? t('hqa.rec_' + ra.recommendation) : '—'], [t('hqa.clarifications'), ra?.clarifications != null ? String(ra.clarifications) : '—'], [t('hqa.readiness'), ra?.readiness ? t('ra.r_' + ra.readiness) : '—'],
        [t('hqa.understanding'), ra?.understanding_review ? t('hqa.u_' + ra.understanding_review) : '—'], [t('hqa.nextStage'), ra?.next_stage ? t('hqa.n_' + ra.next_stage) : '—'],
        [t('hqa.outcome'), ra?.outcome ? t('hqa.o_' + ra.outcome) : '—'], [t('hqa.reviewer'), ra?.reviewer || '—'], [t('hqa.seat'), c.seat ? `${c.seat.role} · ${c.seat.unit}` : '—']]),
    ]));
    if ((c.same_person || []).length) holder.append(el('p', { class: 'vs-warn', text: t('hqa.samePerson', { list: c.same_person.map((s) => `${s.email} (${t('hqa.g_' + (s.status === 'completed' ? 'awaiting_review' : s.status === 'in_progress' ? 'in_progress' : 'incomplete'))}, ${fmtDate(s.created_at)})`).join('; ') }) }));
    holder.append(el('h4', { text: t('hqa.activities') }),
      table([t('hqa.day'), t('hqa.dayTitle'), t('hqa.status'), t('lt.started'), t('hqa.completedAt'), t('hqa.timeSpent'), t('hqa.acks'), t('hqa.answers')],
        (c.steps || []).map((s) => el('tr', {}, [el('td', { text: String(s.day) }), el('td', { class: 'hf-td-wrap', text: s.title || '' }), el('td', { text: t('hqa.st_' + s.status) }),
          el('td', { text: s.started_at ? fmtDateTime(s.started_at) : '—' }), el('td', { text: s.completed_at ? fmtDateTime(s.completed_at) : '—' }),
          el('td', { text: s.seconds ? `${Math.round(s.seconds / 60)} min` : '—' }), el('td', { text: String(s.acks || 0) }),
          el('td', { class: 'hf-td-wrap' }, Object.entries(s.answers || {}).length ? Object.entries(s.answers || {}).map(([k, v]) => el('div', { class: 'hqa-ans' }, [el('small', { class: 'muted', text: k }), el('div', { text: String(v) })])) : [el('span', { class: 'muted', text: '—' })])]))));
    holder.append(el('h4', { text: t('hqa.commsForHer') }),
      (c.comms || []).length ? table([t('hqa.when'), t('hqa.trigger'), t('hqa.subject'), t('hqa.mailerSaid')], c.comms.map((x) => el('tr', {}, [el('td', { text: fmtDateTime(x.at) }), el('td', { text: t('hqa.tr_' + x.trigger) }), el('td', { class: 'hf-td-wrap', text: x.subject }), el('td', { text: mailerWord(x) })]))) : el('p', { class: 'muted', text: t('hqa.noComms') }));
    if ((c.errors || []).length) holder.append(el('h4', { text: t('hqa.errorsTitle') }), table([t('hqa.when'), t('hqa.stage'), t('hqa.message')], c.errors.map((x) => el('tr', {}, [el('td', { text: fmtDateTime(x.at) }), el('td', { text: x.stage }), el('td', { class: 'hf-td-wrap', text: x.message })]))));
    holder.append(el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;margin-top:10px;' }, [
      c.extension_status === 'requested' ? el('button', { class: 'btn btn--quiet', text: t('hqa.extDecide'), onclick: () => extensionModal(c) }) : null,
      ra?.id && (ra.status === 'submitted' || ra.status === 'completed') ? el('button', { class: 'btn btn--primary', text: t('hqa.review'), onclick: () => reviewModal({ ...c, assessment_id: ra.id }) }) : null,
      el('button', { class: 'btn btn--quiet', text: c.is_test ? t('hqa.unmarkTest') : t('hqa.markTest'), onclick: async () => {
        const note = c.is_test ? null : window.prompt(t('hqa.markTestWhy'), c.test_note || '');
        if (!c.is_test && note === null) return;
        try { await hqActivationSetTest(c.activation_id, !c.is_test, note); toast(t('v.saved')); await draw(out); } catch (e) { toastError(e?.message || t('errors.save')); } } }),
    ]));
  }

  function kv(title, pairs) { return el('div', {}, [el('h4', { text: title }), el('div', { class: 'act-kv' }, pairs.map(([k, v]) => el('div', { class: 'act-kv__row' }, [el('span', { class: 'muted', text: k }), el('b', { text: String(v) })])))]); }

  async function exportCsv() {
    const H = ['Name', 'Email', 'Phone', 'Date of birth', 'Language', 'Route', 'Network', 'Position', 'Position place', 'Country', 'State/Region', 'LGA/District', 'Community Cluster', 'Referral source', 'Referred by', 'Stage', 'Status', 'Day', 'Registered', 'First activity', 'Deadline', 'Completed', 'Extension', 'Assessment', 'Rank score', 'Recommendation', 'Outcome', 'Appointed', 'Flags', 'Test record'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const all = []; let off = 0;
    try {
      for (;;) { const R3 = await hqActivationRegister({ route: ROUTE, q: filters.q || null, network: filters.network || null, stage: filters.stage || null, country: filters.country || null, includeTest: INCLUDE_TEST, limit: 200, offset: off }); all.push(...(R3.rows || [])); off += 200; if (!(R3.rows || []).length || off >= n0(R3.total)) break; }
    } catch (e) { return toastError(e?.message || t('errors.load')); }
    const lines = [H.join(',')].concat(all.map((c) => [c.name, c.email, c.phone, c.birth_date, c.language, c.route, c.network, c.position, c.position_place, c.country, c.state, c.lga, c.cluster, c.referrer_category, c.referrer_name, c.stage, c.status, c.day, c.created_at, c.started_at, c.deadline, c.completed_at, c.extension_status, c.assessment, c.rank_score, c.recommendation, c.outcome, c.appointed ? 'yes' : '', (c.flags || []).join(' '), c.is_test ? 'yes' : ''].map(esc).join(',')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = `wdos-activation-${ROUTE}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  function extensionModal(c) {
    const until = el('input', { class: 'input', type: 'date' });
    const reason = el('textarea', { class: 'input', rows: 2, placeholder: t('hqa.reason') });
    const box = el('div', { class: 'vs-card act-modal' }, [
      el('h3', { text: t('hqa.extFor', { name: c.name }) }),
      el('label', { class: 'act-q' }, [el('span', { text: t('hqa.newDeadline') }), until]),
      el('label', { class: 'act-q' }, [el('span', { text: t('hqa.reason') }), reason]),
      el('div', { class: 'row', style: 'gap:8px;' }, [
        el('button', { class: 'btn btn--primary', text: t('hqa.approve'), onclick: () => decide(true) }),
        el('button', { class: 'btn btn--quiet', text: t('hqa.decline'), onclick: () => decide(false) }),
        el('button', { class: 'btn btn--quiet', text: t('v.cancel'), onclick: () => box.remove() })])]);
    async function decide(ok) {
      if (ok && !until.value) return toastError(t('hqa.needDate'));
      if (!reason.value.trim()) return toastError(t('hqa.needReason'));
      try { await decideActivationExtension(c.activation_id, ok, ok ? new Date(until.value + 'T23:59:00').toISOString() : null, reason.value.trim()); toast(t('v.saved')); await draw(out); }
      catch (e) { toastError(e?.message || t('errors.save')); }
    }
    out.prepend(box); box.scrollIntoView({ behavior: 'smooth' });
  }

  async function reviewModal(c) {
    let d;
    try { d = await hqReadinessDetail(c.assessment_id); } catch (e) { return toastError(e?.message || t('errors.load')); }
    const full = c.assessment || {};
    const stmts = d.statements || {};
    const clarified = Object.entries(stmts).filter(([, v]) => v === 'clarify').map(([k]) => k);
    const shortScore = el('select', { class: 'input', style: 'width:auto;' }, [0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => el('option', { value: String(n), text: `${n} / 8` })));
    shortScore.value = String(full.short_score ?? 8);
    const understanding = el('select', { class: 'input' }, [['satisfactory', t('hqa.u_satisfactory')], ['further_discussion', t('hqa.u_further_discussion')]].map(([v, l]) => el('option', { value: v, text: l })));
    if (full.understanding_review) understanding.value = full.understanding_review;
    const nextStage = el('select', { class: 'input' }, [['proceed', t('hqa.n_proceed')], ['further_review', t('hqa.n_further_review')], ['do_not_proceed', t('hqa.n_do_not_proceed')]].map(([v, l]) => el('option', { value: v, text: l })));
    if (full.next_stage) nextStage.value = full.next_stage;
    const comments = el('textarea', { class: 'input', rows: 3, placeholder: t('hqa.comment') });
    const returnNote = el('textarea', { class: 'input', rows: 2, placeholder: t('hqa.returnNote') });
    const outcome = el('select', { class: 'input' }, ['further_review', 'selected', 'reserve', 'alternative_role', 'not_selected'].map((o) => el('option', { value: o, text: t('hqa.o_' + o) })));
    const disclosed = el('textarea', { class: 'input', rows: 2, placeholder: t('hqa.disclosedPh') });
    const qText = Object.fromEntries((d.question_texts || []).map((q) => [String(q.seq), q.question]));
    const sText = Object.fromEntries((d.statement_texts || []).map((q) => [String(q.seq), q.statement]));
    const shortQs = Object.entries(d.short_answers || d.answers || {}).map(([k, v]) => el('div', { class: 'act-review-q' }, [el('b', { text: `${k}. ${qText[k] || ''}` }), el('p', { class: 'act-answer', text: String(v) })]));
    const clarList = clarified.length ? el('ul', { class: 'vs-list' }, clarified.map((k) => el('li', { text: `${k}. ${sText[k] || ''}` }))) : null;
    const box = el('div', { class: 'vs-card act-modal' }, [
      el('h3', { text: t('hqa.reviewFor', { name: c.name }) }), el('p', { class: 'muted', text: t('hqa.reviewIntro2') }),
      el('div', { class: 'act-kv' }, [
        el('div', { class: 'act-kv__row' }, [el('span', { class: 'muted', text: t('hqa.yesOf30') }), el('b', { text: String(Object.values(stmts).filter((v) => v === 'yes').length) })]),
        el('div', { class: 'act-kv__row' }, [el('span', { class: 'muted', text: t('hqa.clarifications') }), el('b', { text: clarified.length ? clarified.join(', ') : '0' })]),
        el('div', { class: 'act-kv__row' }, [el('span', { class: 'muted', text: t('hqa.readiness') }), el('b', { text: full.readiness ? t('ra.r_' + full.readiness) : '—' })]),
        el('div', { class: 'act-kv__row' }, [el('span', { class: 'muted', text: t('ra.q5') }), el('b', { text: d.clarification_note || t('hqa.none') })])]),
      clarList ? el('div', {}, [el('h4', { text: t('hqa.clarifiedOn') }), clarList]) : null,
      el('h4', { text: t('ra.sectionI') }), ...shortQs,
      el('label', { class: 'act-q' }, [el('span', { text: t('hqa.shortScore') }), shortScore]),
      el('h4', { text: t('hqa.forHqUse') }),
      el('label', { class: 'act-q' }, [el('span', { text: t('hqa.understanding') }), understanding]),
      el('label', { class: 'act-q' }, [el('span', { text: t('hqa.nextStage') }), nextStage]),
      el('label', { class: 'act-q' }, [el('span', { text: t('hqa.comments') }), comments]),
      el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;' }, [el('button', { class: 'btn btn--quiet', text: t('hqa.saveReview'), onclick: () => act('score') })]),
      el('label', { class: 'act-q' }, [el('span', { text: t('hqa.returnNote') }), returnNote]),
      el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;' }, [el('button', { class: 'btn btn--quiet', text: t('hqa.returnForCorrection'), onclick: () => act('return') })]),
      el('h4', { text: t('hqa.decision') }),
      el('label', { class: 'act-q' }, [el('span', { text: t('hqa.outcome') }), outcome]),
      el('label', { class: 'act-q' }, [el('span', { text: t('hqa.disclosed') }), disclosed]),
      el('div', { class: 'row', style: 'gap:8px;' }, [el('button', { class: 'btn btn--primary', text: t('hqa.complete'), onclick: () => act('complete') }), el('button', { class: 'btn btn--quiet', text: t('v.cancel'), onclick: () => box.remove() })]),
    ]);
    async function act(action) {
      if (action === 'return' && !returnNote.value.trim()) return toastError(t('hqa.needReturnNote'));
      try {
        await reviewReadinessV2(c.assessment_id, Number(shortScore.value), understanding.value, nextStage.value, comments.value.trim() || null, action,
          returnNote.value.trim() || null, action === 'complete' ? outcome.value : null, action === 'complete' ? disclosed.value.trim() || null : null);
        toast(t('v.saved')); await draw(out);
      } catch (e) { toastError(e?.message || t('errors.save')); }
    }
    out.prepend(box); box.scrollIntoView({ behavior: 'smooth' });
  }
}

/* the mailer's answer, in one word */
function mailerWord(x) {
  if (x.http_status >= 200 && x.http_status < 300) return t('hqa.m_accepted');
  if (x.http_status === -2) return t('hqa.m_unverified');
  if (x.http_status === -1) return t('hqa.m_unknown');
  if (x.http_status == null) return x.sent ? t('hqa.m_queued') : t('hqa.m_rejected');
  return t('hqa.m_rejected');
}

/* 30-day sign-up sparkline, drawn inline (no library) */
function sparkline(points) {
  const days = 30; const today = new Date(); const map = new Map((points || []).map((p) => [p.d, n0(p.n)]));
  const series = Array.from({ length: days }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() - (days - 1 - i)); const key = d.toISOString().slice(0, 10); return { key, n: map.get(key) || 0 }; });
  const max = Math.max(1, ...series.map((s) => s.n)); const W = 360, H = 64, bw = W / days;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H + 14}`); svg.setAttribute('class', 'hqa-spark'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('hqa.signups30'));
  series.forEach((s, i) => {
    const h = Math.round((s.n / max) * H); const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', String(i * bw + 1)); r.setAttribute('y', String(H - h)); r.setAttribute('width', String(Math.max(1, bw - 2))); r.setAttribute('height', String(h));
    r.setAttribute('rx', '2'); r.setAttribute('class', s.n ? 'hqa-spark__bar' : 'hqa-spark__bar hqa-spark__bar--zero');
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title'); title.textContent = `${s.key}: ${s.n}`; r.append(title); svg.append(r);
  });
  const lab = (x, txt, anchor) => { const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text'); tx.setAttribute('x', String(x)); tx.setAttribute('y', String(H + 12)); tx.setAttribute('class', 'hqa-spark__t'); tx.setAttribute('text-anchor', anchor); tx.textContent = txt; svg.append(tx); };
  lab(0, series[0].key.slice(5), 'start'); lab(W, series[days - 1].key.slice(5), 'end');
  const total = series.reduce((a, s) => a + s.n, 0);
  return el('div', { class: 'hqa-spark-wrap' }, [svg, el('div', { class: 'muted', style: 'font-size:12px;', text: t('hqa.signupsTotal', { n: total, max }) })]);
}
