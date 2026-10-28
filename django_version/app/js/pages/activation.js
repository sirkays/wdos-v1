/* ---------------------------------------------------------------------------
 * Phase 192 — Candidate activation journey (Route A open7, Route B ref3).
 * One day at a time. Reading opens inside the step; Continue is refused by
 * the server while anything required is missing. Progress is auto-saved.
 * The non-negotiable line is shown on every screen.
 * ------------------------------------------------------------------------- */
import { el, clear } from '../core/dom.js';
import { t, fmtDate } from '../core/i18n.js';
import { myActivation, saveActivationDay, submitReadiness, requestActivationExtension, readinessForm, submitReadinessV2 } from '../core/db.js';
import { toast, toastError } from '../components/toast.js';
import { renderVolunteerShell } from '../components/vshell.js';

export async function render(root, _params, ctx) {
  const shell = renderVolunteerShell(root, { profile: ctx?.profile, modules: ctx?.modules, titleKey: 'act.navTitle', viewingAs: null, candidate: true });
  const out = shell.outlet;
  await draw(out);
  return shell.teardown;
}

async function draw(out) {
  clear(out);
  // Phase 199: if the join form saved her account but the activation step was slow, start it now
  try {
    const { beginReferralActivation, myCandidateState } = await import('../core/db.js');
    const st = await myCandidateState().catch(() => null);
    if (st && !st.has_seat && !st.hq && !st.activation) {
      const pend = JSON.parse(localStorage.getItem('wdos.join.pending') || 'null');
      const code = (pend && pend.code) || st.referral_code;
      if (code) { await beginReferralActivation(code, (pend && pend.form) || {}); localStorage.removeItem('wdos.join.pending'); window.dispatchEvent(new CustomEvent('wdos:activation-changed')); }
    }
  } catch (e) { out.append(el('div', { class: 'vs-card vs-card--danger' }, [el('b', { text: t('act.beginFailed') }), el('p', { text: String(e?.message || e) })])); }
  let a;
  try { a = await myActivation(); } catch (err) { out.append(el('div', { class: 'vs-card' }, [el('p', { text: err?.message || t('errors.load') })])); return; }
  if (!a) { out.append(el('div', { class: 'vs-card' }, [el('h3', { text: t('act.none') }), el('p', { class: 'muted', text: t('act.noneBody') }), el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;margin-top:8px;' }, [el('a', { href: '#/join/WGMN', class: 'btn btn--primary', text: t('join.labelWgmn') }), el('a', { href: '#/join/WNNN', class: 'btn btn--secondary', text: t('join.labelWnnn') })])])); return; }

  const days = a.days || [];
  const done = days.filter((d) => d.status === 'completed').length;
  const deadline = a.deadline ? fmtDate(a.deadline) : '';

  out.append(el('section', { class: 'vs-card act-head' }, [
    el('div', { class: 'wi__kick' }, [el('b', { class: 'wi__from', text: 'WODDI' }), el('span', { class: 'wi__label', text: a.route_label })]),
    el('h3', { text: t('act.title', { name: a.first_name }) }),
    el('p', { class: 'muted', text: t('act.considered', { role: a.role_title, unit: a.unit || a.country || '', net: a.network }) }),
    a.referrer ? el('p', { class: 'muted', text: t('act.referredBy', { name: a.referrer }) }) : null,
    el('div', { class: 'row', style: 'gap:10px;align-items:center;' }, [
      el('div', { class: 'ob-bar' }, [el('span', { style: `width:${Math.round((done / Math.max(1, days.length)) * 100)}%` })]),
      el('b', { text: `${done}/${days.length}` })]),
    el('div', { class: 'ob-dots' }, [
      ...days.map((d) => el('span', { class: `ob-dot${d.status === 'completed' ? ' ob-dot--done' : ''}`, text: d.status === 'completed' ? '\u2713' : String(d.day) })),
      el('span', { class: `ob-dot${a.assessment?.status === 'completed' || a.assessment?.status === 'submitted' ? ' ob-dot--done' : ''}`, title: t('act.assessment'), text: 'A' })]),
    deadline ? el('p', { class: 'muted', text: t('act.deadline', { date: deadline }) + (a.extension_status ? ` \u00B7 ${t('act.ext_' + a.extension_status)}` : '') }) : null,
    el('p', { class: 'act-notice', text: a.notice }),
  ]));

  if (a.status === 'incomplete') {
    out.append(el('section', { class: 'vs-card vs-card--danger' }, [
      el('h3', { text: t('act.incomplete') }), el('p', { text: t('act.incompleteBody') }),
      a.extension_status ? null : extensionForm(),
    ]));
    return;
  }

  // Phase 217: the assessment day counts as done once the assessment exists.
  // Until migration 169 the last day was never marked completed, so candidates
  // got Day 3 again on every Next and never reached the assessment.
  const current = days.find((d) => d.status !== 'completed' && !(d.has_assessment && a.assessment));
  if (current) { out.append(dayCard(current, days.length)); return; }

  // all days complete: the assessment
  out.append(await assessmentCard());

  /* ---------------------------------------------------------------- */
  function extensionForm() {
    const reason = el('textarea', { class: 'input', rows: 3, placeholder: t('act.extPh') });
    const btn = el('button', { class: 'btn btn--quiet', text: t('act.extAsk') });
    btn.addEventListener('click', async () => {
      if (!reason.value.trim()) return;
      try { await requestActivationExtension(reason.value.trim()); toast(t('act.extSent')); await draw(out); } catch (e) { toastError(e?.message); }
    });
    return el('div', { class: 'act-ext' }, [reason, btn]);
  }

  function dayCard(d, of) {
    const started = Date.now();
    let reachedEnd = !(d.content && d.content.length);
    const answers = { ...(d.answers || {}) };
    const acked = new Set((d.acked || []).map(String));

    const readers = (d.content || []).map((c) => docReader(c, () => { reachedEnd = true; refresh(); }));
    const qInputs = (d.questions || []).map((qq) => {
      const ta = el('textarea', { class: 'input', rows: 3, placeholder: t('act.answerPh') });
      ta.value = answers[qq.key] || '';
      ta.addEventListener('input', () => { answers[qq.key] = ta.value; });
      ta.addEventListener('change', () => autosave());
      return el('label', { class: 'act-q' }, [el('span', { text: qq.label }), ta]);
    });
    const ackBoxes = (d.acks || []).map((text, i) => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = acked.has(String(i));
      cb.addEventListener('change', () => { if (cb.checked) acked.add(String(i)); else acked.delete(String(i)); autosave(); refresh(); });
      return el('label', { class: 'act-ack' }, [cb, el('span', { text })]);
    });
    const next = el('button', { class: 'btn btn--primary', text: t('ob.next') });
    const hint = el('p', { class: 'ob-hint muted' });

    function secs() { return Math.round((Date.now() - started) / 1000); }
    function ready() {
      const qOk = (d.questions || []).every((qq) => (answers[qq.key] || '').trim().length > 0);
      const aOk = acked.size >= (d.acks || []).length;
      return reachedEnd && qOk && aOk;
    }
    function refresh() {
      next.disabled = !ready();
      hint.textContent = !reachedEnd ? t('ob.hintRead') : !ready() ? t('act.hintFill') : t('ob.hintReadDone');
    }
    let saving = null;
    function autosave() {
      clearTimeout(saving);
      saving = setTimeout(() => saveActivationDay(d.day, answers, [...acked], reachedEnd, secs(), false).catch(() => {}), 800);
    }
    next.addEventListener('click', async () => {
      next.disabled = true;
      try {
        const r = await saveActivationDay(d.day, answers, [...acked], reachedEnd, secs(), true);
        if (r && r.ok === false) { toastError(t('act.missing')); next.disabled = false; return; }
        toast(t('act.dayDone', { n: d.day }));
        await draw(out);
      } catch (e) { toastError(e?.message || t('errors.save')); next.disabled = false; }
    });
    setTimeout(refresh, 50);

    const profileBlock = null;   // Phase 206: the candidate's details are not shown inside the activation

    return el('section', { class: 'vs-card ob-step' }, [
      el('div', { class: 'ob-step__head' }, [
        el('span', { class: 'ob-step__n', text: t('ob.stepOf', { n: d.day, of }) }),
        el('h3', { text: d.title }),
        el('p', { class: 'muted', text: d.instruction })]),
      profileBlock,
      ...readers,
      d.notice ? el('p', { class: 'act-notice', text: d.notice }) : null,
      qInputs.length ? el('div', { class: 'act-qs' }, qInputs) : null,
      ackBoxes.length ? el('div', { class: 'act-acks' }, [el('b', { text: t('act.acks') }), ...ackBoxes]) : null,
      hint,
      el('div', { class: 'row', style: 'gap:8px;margin-top:8px;' }, [next, el('a', { href: '#/my/support', class: 'btn btn--quiet', text: t('act.help') })]),
    ]);
  }

  function kv(k, v) { return el('div', { class: 'act-kv__row' }, [el('span', { class: 'muted', text: k }), el('b', { text: v })]); }

  function docReader(c, onEnd) {
    const page = el('article', { class: 'ob-doc' }, [el('p', { class: 'muted', text: t('ob.loadingDoc') })]);
    const scroller = el('div', { class: 'ob-scroller' }, [page]);
    scroller.addEventListener('scroll', () => { if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 48) onEnd(); });
    fetch(c.doc, { cache: 'no-cache' }).then((r) => r.text()).then((html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('script, style, iframe, object, embed, link').forEach((n) => n.remove());
      let nodes = Array.from((doc.body && doc.body.children.length ? doc.body : doc.documentElement).childNodes);
      if (c.sections && c.sections.length) nodes = pickSections(nodes, c.sections);
      clear(page);
      if (c.pack) page.append(el('div', { class: 'act-pack' }, [el('b', { text: t('act.packTitle', { role: a.role_title }) }), el('small', { text: a.notice })]));
      page.append(...nodes);
      if (scroller.scrollHeight <= scroller.clientHeight + 48) onEnd();
    }).catch(() => { clear(page); page.append(el('p', { text: t('ob.docFailed') })); onEnd(); });
    return el('div', {}, [el('div', { class: 'ob-doc__bar' }, [el('b', { text: t('ob.document') })]), scroller]);
  }

  // keep only the named h2 sections (heading + everything until the next h2)
  function pickSections(nodes, wanted) {
    const keep = []; let on = false;
    for (const n of nodes) {
      if (n.nodeType === 1 && /^H[12]$/.test(n.tagName)) on = wanted.some((w) => (n.textContent || '').trim().startsWith(w));
      if (on) keep.push(n);
    }
    return keep.length ? keep : nodes;
  }

  /* Phase 198 — the REVISED Understanding & Readiness Assessment as a stepper:
     Candidate information → sections A to H (30 statements) → I (short
     questions) → J (confirmations + readiness + digital confirmation). */
  async function assessmentCard() {
    const as = a.assessment || { status: 'pending' };
    if (as.status === 'submitted') {
      return el('section', { class: 'vs-card' }, [el('h3', { text: t('act.submittedTitle') }), el('p', { text: t('act.submittedBody', { name: a.first_name }) }),
        el('p', { class: 'muted', text: t('act.submittedOn', { date: fmtDate(as.submitted_at) }) })]);
    }
    if (as.status === 'completed') {
      return el('section', { class: 'vs-card' }, [el('h3', { text: t('act.outcomeTitle') }), el('p', { text: as.disclosed || t('act.outcomePending') })]);
    }
    let F;
    try { F = await readinessForm(); } catch (e) { return el('section', { class: 'vs-card' }, [el('p', { text: e?.message || t('errors.load') })]); }
    const ex = F.existing || {};
    const st = { ...(ex.statements || {}) }; const sa = { ...(ex.short_answers || {}) };
    let conf = new Set((ex.confirmations || []).map(Number)); let readiness = ex.readiness || ''; let clarNote = ex.clarification_note || '';
    let sigName = ex.signature_name || [a.first_name, a.last_name].filter(Boolean).join(' ');
    const sections = [];
    const bySec = {};
    (F.statements || []).forEach((x) => { (bySec[x.section] = bySec[x.section] || { key: x.section, title: x.section_title, items: [] }).items.push(x); });
    sections.push({ key: 'info', title: t('ra.candidateInfo') });
    Object.values(bySec).forEach((sec) => sections.push({ key: sec.key, title: `${sec.key}. ${sec.title}`, items: sec.items }));
    sections.push({ key: 'I', title: t('ra.sectionI') }); sections.push({ key: 'J', title: t('ra.sectionJ') });
    let idx = 0;
    const wrap = el('section', { class: 'vs-card ob-step ra' });
    const barWrap = el('div', { class: 'ra-bar' });
    const body = el('div');
    const back = el('button', { class: 'btn btn--quiet', text: t('ra.back') });
    const next = el('button', { class: 'btn btn--primary', text: t('ob.next') });
    const err = el('p', { class: 'form-error', hidden: true });
    back.addEventListener('click', () => { if (idx > 0) { idx -= 1; paint(); } });
    next.addEventListener('click', async () => {
      const problem = validate(); if (problem) { err.textContent = problem; err.hidden = false; return; }
      err.hidden = true;
      if (idx < sections.length - 1) { idx += 1; paint(); return; }
      next.disabled = true;
      try {
        await submitReadinessV2({ statements: st, short_answers: sa, clarification_note: clarNote, confirmations: [...conf], readiness, signature_name: sigName });
        window.dispatchEvent(new CustomEvent('wdos:activation-changed')); toast(t('act.submitted')); await draw(out);
      } catch (e) { toastError(e?.message || t('errors.save')); next.disabled = false; }
    });
    function validate() {
      const sec = sections[idx];
      if (sec.items) { const missing = sec.items.filter((x) => !st[String(x.seq)]); if (missing.length) return t('ra.tickEach'); }
      if (sec.key === 'I') { for (const q of (F.questions || [])) { if (!(sa[String(q.seq)] || '').trim()) return t('ra.answerEach'); } }
      if (sec.key === 'J') {
        if (conf.size < (F.confirmations || []).length) return t('ra.tickConf');
        if (!readiness) return t('ra.pickReadiness');
        if (!sigName.trim()) return t('ra.typeName');
      }
      return '';
    }
    function paint() {
      clear(barWrap); clear(body);
      barWrap.append(el('div', { class: 'ra-bar__track' }, [el('div', { class: 'ra-bar__fill', style: `width:${Math.round(((idx + 1) / sections.length) * 100)}%` })]),
        el('div', { class: 'ra-bar__label', text: t('ra.stepOf', { n: idx + 1, of: sections.length }) }));
      const sec = sections[idx];
      body.append(el('h3', { class: 'ra-title', text: sec.title }));
      if (sec.key === 'info') {
        body.append(el('p', { class: 'muted', text: t('ra.purpose') }), el('p', { class: 'act-notice', text: t('ra.notAppointment') }),
          el('div', { class: 'act-kv' }, [kv(t('v.fullName'), [a.first_name, a.last_name].filter(Boolean).join(' ')), kv(t('v.country'), a.country || ''), kv(t('act.position'), a.role_title),
            kv(t('ra.pathway'), a.route === 'ref3' ? t('ra.referred') : t('ra.openCall')), kv(t('ra.startDate'), a.started_at ? fmtDate(a.started_at) : ''), kv(t('v.network'), a.network)]),
          el('p', { class: 'muted', text: t('ra.howTo') }));
      } else if (sec.items) {
        sec.items.forEach((x) => {
          const yes = el('input', { type: 'radio', name: `s${x.seq}`, value: 'yes' }); const clr = el('input', { type: 'radio', name: `s${x.seq}`, value: 'clarify' });
          if (st[String(x.seq)] === 'yes') yes.checked = true; if (st[String(x.seq)] === 'clarify') clr.checked = true;
          yes.addEventListener('change', () => { st[String(x.seq)] = 'yes'; }); clr.addEventListener('change', () => { st[String(x.seq)] = 'clarify'; });
          body.append(el('div', { class: 'ra-stmt' }, [el('div', { class: 'ra-stmt__n', text: String(x.seq) }), el('div', { class: 'grow', text: x.statement }),
            el('div', { class: 'ra-stmt__opts' }, [el('label', { class: 'ra-opt ra-opt--yes' }, [yes, el('span', { text: t('ra.yes') })]), el('label', { class: 'ra-opt' }, [clr, el('span', { text: t('ra.clarify') })])])]));
        });
      } else if (sec.key === 'I') {
        body.append(el('p', { class: 'muted', text: t('ra.shortIntro') }));
        (F.questions || []).forEach((q) => {
          const ta = el('textarea', { class: 'input', rows: 3, placeholder: t('act.answerPh') }); ta.value = sa[String(q.seq)] || '';
          ta.addEventListener('input', () => { sa[String(q.seq)] = ta.value; });
          body.append(el('label', { class: 'act-q' }, [el('span', { text: `${q.seq}. ${q.question}` }), ta]));
        });
        const no = el('input', { type: 'radio', name: 'clar', value: 'no' }); const yes = el('input', { type: 'radio', name: 'clar', value: 'yes' });
        const note = el('textarea', { class: 'input', rows: 2, placeholder: t('ra.statePh'), hidden: !clarNote }); note.value = clarNote;
        if (clarNote) yes.checked = true; else if (ex.readiness) no.checked = true;
        no.addEventListener('change', () => { clarNote = ''; note.hidden = true; note.value = ''; }); yes.addEventListener('change', () => { note.hidden = false; });
        note.addEventListener('input', () => { clarNote = note.value; });
        body.append(el('div', { class: 'act-q' }, [el('span', { text: `5. ${t('ra.q5')}` }), el('div', { class: 'ra-stmt__opts' }, [el('label', { class: 'ra-opt' }, [no, el('span', { text: t('ra.no') })]), el('label', { class: 'ra-opt' }, [yes, el('span', { text: t('ra.yesState') })])]), note]));
      } else if (sec.key === 'J') {
        (F.confirmations || []).forEach((c) => {
          const cb = el('input', { type: 'checkbox' }); cb.checked = conf.has(c.seq);
          cb.addEventListener('change', () => { if (cb.checked) conf.add(c.seq); else conf.delete(c.seq); });
          body.append(el('label', { class: 'act-ack' }, [cb, el('span', { text: c.text })]));
        });
        body.append(el('h4', { text: t('ra.readinessTitle') }), el('p', { class: 'muted', text: t('ra.readinessQ') }));
        [['ready', t('ra.r_ready')], ['interested', t('ra.r_interested')], ['not_now', t('ra.r_not_now')]].forEach(([v, label]) => {
          const r = el('input', { type: 'radio', name: 'ready', value: v }); r.checked = readiness === v; r.addEventListener('change', () => { readiness = v; });
          body.append(el('label', { class: 'ra-opt ra-opt--block' }, [r, el('span', { text: label })]));
        });
        const sig = el('input', { class: 'input', value: sigName, placeholder: t('ra.sigPh') }); sig.addEventListener('input', () => { sigName = sig.value; });
        body.append(el('label', { class: 'act-q' }, [el('span', { text: t('ra.signature') }), sig, el('small', { class: 'muted', text: t('ra.sigHint', { date: fmtDate(new Date().toISOString()) }) })]));
      }
      back.disabled = idx === 0; next.textContent = idx === sections.length - 1 ? t('act.submit') : t('ob.next');
      wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    wrap.append(el('div', { class: 'ob-step__head' }, [el('span', { class: 'ob-step__n', text: t('act.assessment') }), el('h3', { text: t('act.assessTitle') })]));
    if (as.status === 'returned') wrap.append(el('div', { class: 'vs-card vs-card--danger', style: 'margin:8px 0;' }, [el('b', { text: t('act.returnedTitle') }), el('p', { text: as.return_note || '' })]));
    wrap.append(barWrap, body, err, el('div', { class: 'row', style: 'gap:8px;margin-top:12px;justify-content:space-between;' }, [back, el('div', { class: 'row', style: 'gap:8px;' }, [el('a', { href: '#/my/support', class: 'btn btn--quiet', text: t('act.help') }), next])]));
    paint();
    return wrap;
  }
}
