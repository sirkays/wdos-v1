/* ---------------------------------------------------------------------------
 * Phase 184 — Guided onboarding.
 * One step at a time. Reading steps open the document inside the step; Next
 * stays disabled until the leader has scrolled to the end of it and spent a
 * sensible minimum on the page. Visit steps open the WDOS page they refer to
 * and can only be confirmed after it has been opened. The workspace gate lifts
 * when every required step is finished.
 * ------------------------------------------------------------------------- */
import { el, clear } from '../core/dom.js';
import { t, fmtDate } from '../core/i18n.js';
import { onboardingStatus, completeOnboardingStep } from '../core/db.js';
import { toast, toastError } from '../components/toast.js';
import { markVisit, readVisit, clearVisit } from '../core/obvisit.js';

export async function renderOnboarding(out, ctx = {}) {
  const ro = !!ctx.ro;
  const selfId = ctx.selfId || null;
  clear(out);
  let st;
  try { st = await onboardingStatus(ro ? ctx.profileId : null); }
  catch (err) { out.append(el('div', { class: 'vs-card' }, [el('p', { text: err?.message || t('errors.load') })])); return; }

  const steps = (st.steps || []).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0));
  // a visit record whose step is now finished has done its job
  if (!ro) { const v = readVisit(selfId); if (v && steps.some((s) => s.code === v.code && s.done_at)) clearVisit(); }
  const done = steps.filter((s) => s.done_at).length;
  const total = steps.length;
  const requiredLeft = steps.filter((s) => s.required && !s.done_at).length;

  /* progress header ------------------------------------------------------ */
  const bar = el('div', { class: 'ob-bar' }, [el('span', { style: `width:${total ? Math.round((done / total) * 100) : 0}%` })]);
  const head = el('section', { class: 'vs-card ob-head' }, [
    el('h3', { text: requiredLeft ? t('ob.title') : t('ob.titleDone') }),
    el('p', { class: 'muted', text: requiredLeft ? t('ob.intro') : t('ob.introDone') }),
    el('div', { class: 'row', style: 'gap:10px;align-items:center;' }, [bar, el('b', { text: `${done}/${total}` })]),
    el('div', { class: 'ob-dots' }, steps.map((s, i) => el('span', {
      class: `ob-dot${s.done_at ? ' ob-dot--done' : ''}`, title: `${i + 1}. ${s.title}`,
      text: s.done_at ? '\u2713' : String(i + 1) }))),
  ]);
  out.append(head);

  if (ro) {                                    // HQ / supervisor viewing someone
    out.append(el('div', { class: 'vs-card' }, [el('h3', { text: t('ob.record') }),
      el('ul', { class: 'ob-list' }, steps.map((s) => el('li', { class: s.done_at ? 'ob-li ob-li--done' : 'ob-li' }, [
        el('span', { class: 'grow' }, [el('b', { text: s.title }), s.detail ? el('div', { class: 'muted', text: s.detail }) : null]),
        el('small', { class: 'muted', text: s.done_at ? fmtDate(s.done_at) : t('ob.notYet') })])))]));
    return;
  }

  /* the current step ----------------------------------------------------- */
  const current = steps.find((s) => !s.done_at);
  if (!current) {
    out.append(el('section', { class: 'vs-card ob-finished' }, [
      el('h3', { text: t('ob.allDone') }),
      el('p', { text: t('ob.allDoneBody') }),
      el('a', { href: '#/', class: 'btn btn--primary', text: t('ob.goDashboard') }),
    ]));
    out.append(recordCard());
    return;
  }
  out.append(stepCard(current, steps.indexOf(current) + 1, steps.length));
  out.append(recordCard());

  /* ---------------------------------------------------------------------- */
  function recordCard() {
    return el('details', { class: 'vs-card ob-record' }, [
      el('summary', { text: t('ob.record') }),
      el('ul', { class: 'ob-list' }, steps.map((s) => el('li', { class: s.done_at ? 'ob-li ob-li--done' : 'ob-li' }, [
        el('span', { class: 'ob-li__mark', text: s.done_at ? '\u2713' : '\u2022' }),
        el('span', { class: 'grow' }, [el('b', { text: s.title }), s.detail ? el('div', { class: 'muted', text: s.detail }) : null]),
        el('small', { class: 'muted', text: s.done_at ? fmtDate(s.done_at) : t('ob.notYet') })]))),
    ]);
  }

  function stepCard(s, n, of) {
    const mode = s.mode || (s.doc_url ? 'read' : 'visit');
    const minSec = Number(s.min_seconds || 20);
    // Phase 214: a visit step she already opened (record kept in this browser)
    // stays opened when she comes back, and its waiting time has passed.
    const visit = mode === 'visit' ? readVisit(selfId) : null;
    const openedBefore = !!(visit && visit.code === s.code);
    const started = openedBefore ? Math.min(Date.now(), visit.at || Date.now()) : Date.now();
    let reachedEnd = mode !== 'read';
    let opened = mode !== 'visit' || openedBefore;

    const next = el('button', { class: 'btn btn--primary', disabled: true, text: t('ob.next') });
    const hint = el('p', { class: 'ob-hint muted', text: modeHint() });
    const tick = setInterval(refresh, 1000);

    function secs() { return Math.round((Date.now() - started) / 1000); }
    function ready() { return reachedEnd && opened && secs() >= Math.min(minSec, 90); }
    function modeHint() {
      if (mode === 'read') return reachedEnd ? t('ob.hintReadDone') : t('ob.hintRead');
      if (mode === 'visit') return opened ? t('ob.hintVisitDone') : t('ob.hintVisit');
      return t('ob.hintDeclare');
    }
    function refresh() {
      const left = Math.max(0, Math.min(minSec, 90) - secs());
      next.disabled = !ready();
      // say what is actually missing (the old "Next (1s)" when the page had
      // not been opened looked like a countdown that never ended)
      next.textContent = ready() ? t('ob.next')
        : !opened ? t('ob.nextOpenFirst')
          : !reachedEnd && left === 0 ? t('ob.nextReadFirst')
            : t('ob.nextWait', { s: left || 1 });
      hint.textContent = modeHint();
    }

    /* the document itself */
    let viewer = null;
    if (mode === 'read' && s.doc_url) {
      // Phase 184b: the document is fetched and rendered INSIDE our own
      // scroller. An iframe was blocked by the site's frame-src policy (the
      // grey broken-document box), and framing also hid the scroll position
      // we need in order to know the leader reached the end.
      const page = el('article', { class: 'ob-doc' }, [el('p', { class: 'muted', text: t('ob.loadingDoc') })]);
      const scroller = el('div', { class: 'ob-scroller' }, [page]);
      const seen = () => {
        if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 48) { reachedEnd = true; refresh(); }
      };
      scroller.addEventListener('scroll', seen);
      fetch(s.doc_url, { cache: 'no-cache' })
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); })
        .then((html) => {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          doc.querySelectorAll('script, style, iframe, object, embed, link').forEach((n) => n.remove());
          const src = doc.body && doc.body.children.length ? doc.body : doc.documentElement;
          clear(page);
          page.append(...Array.from(src.childNodes));
          seen();                       // a short document may already be fully visible
          refresh();
        })
        .catch(() => {
          clear(page);
          page.append(el('p', { text: t('ob.docFailed') }),
            el('a', { href: s.doc_url, target: '_blank', rel: 'noopener', class: 'btn btn--primary', text: t('ob.openTab') }));
          reachedEnd = true;            // never trap her behind a file that will not load
          refresh();
        });
      viewer = el('div', {}, [
        el('div', { class: 'ob-doc__bar' }, [
          el('b', { text: t('ob.document') }),
          el('a', { href: s.doc_url, target: '_blank', rel: 'noopener', class: 'btn btn--quiet', text: t('ob.openTab') })]),
        scroller,
      ]);
    } else if (mode === 'visit') {
      const go = el('a', { href: s.href || '#/', class: 'btn btn--primary', text: t('ob.openPage') });
      go.addEventListener('click', () => { markVisit(selfId, s, n, of); opened = true; setTimeout(refresh, 50); });
      viewer = el('div', { class: 'ob-visit' }, [
        el('p', { text: t('ob.visitBody') }), go,
      ]);
    } else {
      const note = el('textarea', { class: 'input', rows: 3, placeholder: t('ob.declarePh') });
      viewer = el('div', { class: 'ob-visit' }, [el('p', { text: t('ob.declareBody') }), note]);
      viewer.__note = note;
    }

    next.addEventListener('click', async () => {
      next.disabled = true;
      try {
        await completeOnboardingStep(s.code, secs(), reachedEnd, viewer.__note ? viewer.__note.value.trim() || null : null);
        clearInterval(tick);
        if (openedBefore || mode === 'visit') clearVisit();
        toast(t('ob.saved', { title: s.title }));
        await renderOnboarding(out, ctx);                 // redraw on the next step
        window.dispatchEvent(new CustomEvent('wdos:onboarding-changed'));
      } catch (err) { toastError(err?.message || t('errors.save')); next.disabled = false; }
    });

    setTimeout(refresh, 100);
    return el('section', { class: 'vs-card ob-step' }, [
      el('div', { class: 'ob-step__head' }, [
        el('span', { class: 'ob-step__n', text: t('ob.stepOf', { n, of }) }),
        el('h3', { text: s.title }),
        s.detail ? el('p', { class: 'muted', text: s.detail }) : null,
      ]),
      viewer,
      hint,
      el('div', { class: 'row', style: 'gap:8px;margin-top:8px;' }, [next]),
    ]);
  }
}
