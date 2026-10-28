/* ---------------------------------------------------------------------------
 * Phase 196 — #/join/CODE : the ONE referral link (woddicrm.org/#/join/WODDI)
 * A non-personalised link any leader can send. The form itself captures the
 * position, then Country → State/Region → LGA/District → Community Cluster
 * (Ward), using each African country's own words for those levels. Network
 * follows the date of birth (18–29 WNNN, 30+ WGMN). Photograph and phone are
 * required. On submit: account, profile, photo, and Day 1 of the 3-Day route.
 * ------------------------------------------------------------------------- */
import { el, clear } from '../core/dom.js';
import { t, getLocale, setLocale, supportedLocales } from '../core/i18n.js';
import { db, referralLinkInfo, beginReferralActivation, referralVisit, geoCountries, geoChildren, geoLevels, uploadAvatar } from '../core/db.js';
import { roleTitle } from '../core/titles.js';

const POSITIONS = ['country_rep', 'deputy_country_rep', 'state_coordinator', 'assistant_state_coordinator', 'state_secretary', 'district_coordinator',
  'assistant_district_coordinator', 'cluster_coordinator', 'assistant_cluster_coordinator', 'chapter_lead', 'assistant_chapter_lead'];

export async function render(root, params) {
  clear(root);
  const code = String(params?.code || '').trim().toUpperCase();
  const card = el('div', { class: 'vs-card join-card' });
  root.append(card);
  // the old single link, or no code: offer the two forms
  if (!code || code === 'WODDI') { (await import('./candidate.js')).render(root); return; }
  let info = null;
  try { info = await referralLinkInfo(code); } catch { info = null; }
  if (!info || !info.code || info.route !== 'ref3' || !info.active) {
    card.append(el('h3', { text: t('join.badTitle') }), el('p', { class: 'muted', text: t('join.badHint') }));
    return;
  }
  try { referralVisit(code); } catch { /* best effort */ }
  // Phase 200: a referral form always starts from a clean session. Whoever was
  // signed in on this browser is signed out here, so her new account can never
  // be mixed up with someone else's.
  try { const { data: { session } } = await db().auth.getSession(); if (session) await db().auth.signOut({ scope: 'local' }); } catch { /* ignore */ }

  /* ---- brand header + language ---------------------------------------- */
  const LOCALE_NAMES = { en: 'English', fr: 'Français', pt: 'Português', ar: 'العربية', sw: 'Kiswahili', ha: 'Hausa', yo: 'Yorùbá', ig: 'Igbo' };
  // languages in plain sight: one chip each, the current one highlighted
  const themeBtn = el('button', { type: 'button', class: 'join-lang', text: document.documentElement.dataset.theme === 'dark' ? '\u2600 ' + t('join.light') : '\u263E ' + t('join.dark'),
    onclick: () => { const dark = document.documentElement.dataset.theme !== 'dark'; document.documentElement.dataset.theme = dark ? 'dark' : ''; try { localStorage.setItem('wdos.theme', dark ? 'dark' : 'light'); } catch { /* ignore */ } themeBtn.textContent = dark ? '\u2600 ' + t('join.light') : '\u263E ' + t('join.dark'); } });
  const lang = el('div', { class: 'join-langs', role: 'group', 'aria-label': 'Language' }, supportedLocales().map((c) =>
    el('button', { type: 'button', class: 'join-lang' + (c === getLocale() ? ' is-on' : ''), text: LOCALE_NAMES[c] || c,
      onclick: async () => { try { await setLocale(c); location.reload(); } catch { /* keep */ } } })));
  const NET = info.network === 'WNNN' ? 'WNNN' : 'WGMN';
  const netMark = el('img', { class: 'join-net__disc', src: NET === 'WNNN' ? '/assets/logos/wnnn-disc.png' : '/assets/logos/wgmn-disc.png', alt: NET === 'WNNN' ? 'WODDI Nurture NextGen Network' : 'WODDI Good Mother Network' });

  /* ---- fields ---------------------------------------------------------- */
  const f = (label, attrs, hint) => {
    const i = el('input', { class: 'input', ...attrs });
    return { i, node: el('label', { class: 'act-q' }, [el('span', { text: label }), i, hint ? el('small', { class: 'muted', text: hint }) : null]) };
  };
  const sel = (label) => {
    const s = el('select', { class: 'input' });
    return { s, node: el('label', { class: 'act-q' }, [el('span', { text: label }), s]) };
  };
  const first = f(t('v.firstName'), { required: true, maxlength: 60 });
  const last = f(t('v.lastName'), { required: true, maxlength: 60 });
  const email = f(t('v.email'), { type: 'email', required: true, maxlength: 254 });
  const phone = f(t('join.phone'), { type: 'tel', required: true, maxlength: 20 });
  const dob = f(t('join.dob'), { type: 'date', required: true });
  const prefLang = sel(t('join.prefLang'));
  supportedLocales().forEach((c) => prefLang.s.append(el('option', { value: c, selected: c === getLocale() || null, text: LOCALE_NAMES[c] || c })));

  const refCat = sel(t('join.refCat'));
  [['', t('join.pick')], ['focal_person', t('join.cat_focal_person')], ['volunteer_leader', t('join.cat_volunteer_leader')], ['individual', t('join.cat_individual')], ['other', t('join.cat_other')]].forEach(([v, l]) => refCat.s.append(el('option', { value: v, text: l })));
  const refName = f(t('join.refName'), { required: true, maxlength: 120 });
  const position = sel(t('join.position'));
  const fillPositions = (net) => {
    clear(position.s);
    position.s.append(el('option', { value: '', text: t('join.pickPosition') }));
    POSITIONS.forEach((r) => position.s.append(el('option', { value: r, text: roleTitle(r, net) })));
  };
  // Phase 199: the network is fixed by the form she opened (WGMN form or WNNN form). Age is not a criterion.
  const network = NET;
  fillPositions(network);

  // Country → level 2 → level 3 → level 4. Lists come from the structure; where a
  // country has no list yet at a level, she types the name and HQ still sees it.
  const country = sel(t('v.country'));
  const lvl2 = sel('State / Region'); const lvl3 = sel('LGA / District'); const lvl4 = sel('Community Cluster (Ward)');
  const typed2 = el('input', { class: 'input', hidden: true, placeholder: t('join.typeIt') });
  const typed3 = el('input', { class: 'input', hidden: true, placeholder: t('join.typeIt') });
  const typed4 = el('input', { class: 'input', hidden: true, placeholder: t('join.typeIt') });
  lvl2.node.append(typed2); lvl3.node.append(typed3); lvl4.node.append(typed4);
  const setLabel = (o, text) => { o.node.querySelector('span').textContent = text; };
  const fillSelect = (o, typed, items, placeholder) => {
    clear(o.s);
    o.s.append(el('option', { value: '', text: placeholder }));
    items.forEach((u) => o.s.append(el('option', { value: u.id, text: u.name })));
    o.s.append(el('option', { value: '__other', text: t('join.notListed') }));
    o.s.hidden = false; typed.hidden = true; typed.value = '';
    if (!items.length) { o.s.value = '__other'; o.s.hidden = true; typed.hidden = false; }
  };
  const hook = (o, typed, next) => o.s.addEventListener('change', async () => {
    typed.hidden = o.s.value !== '__other'; if (typed.hidden) typed.value = '';
    if (next && o.s.value && o.s.value !== '__other') {
      try { fillSelect(next.o, next.typed, await geoChildren(o.s.value), t('join.pick')); } catch { fillSelect(next.o, next.typed, [], t('join.pick')); }
    } else if (next) fillSelect(next.o, next.typed, [], t('join.pick'));
  });
  hook(lvl2, typed2, { o: lvl3, typed: typed3 }); hook(lvl3, typed3, { o: lvl4, typed: typed4 }); hook(lvl4, typed4, null);
  let countries = [];
  try { countries = await geoCountries(); } catch { countries = []; }
  clear(country.s); country.s.append(el('option', { value: '', text: t('join.pickCountry') }));
  countries.forEach((c) => country.s.append(el('option', { value: c.id, text: c.name, 'data-iso': c.iso || '' })));
  country.s.addEventListener('change', async () => {
    const opt = country.s.selectedOptions[0]; const iso = opt?.dataset?.iso || '';
    try { const L = await geoLevels(iso); setLabel(lvl2, L.level2); setLabel(lvl3, L.level3); setLabel(lvl4, L.level4); } catch { /* defaults stay */ }
    try { fillSelect(lvl2, typed2, country.s.value ? await geoChildren(country.s.value) : [], t('join.pick')); } catch { fillSelect(lvl2, typed2, [], t('join.pick')); }
    fillSelect(lvl3, typed3, [], t('join.pick')); fillSelect(lvl4, typed4, [], t('join.pick'));
  });
  fillSelect(lvl2, typed2, [], t('join.pick')); fillSelect(lvl3, typed3, [], t('join.pick')); fillSelect(lvl4, typed4, [], t('join.pick'));

  const photo = el('input', { class: 'input', type: 'file', accept: 'image/*' });
  const preview = el('img', { class: 'join-photo', alt: '', hidden: true });
  let photoBlob = null;   // resized JPEG, small enough to upload on a weak connection
  photo.addEventListener('change', async () => {
    const fl = photo.files && photo.files[0]; photoBlob = null;
    if (!fl) { preview.hidden = true; return; }
    try { photoBlob = await shrinkImage(fl, 640); preview.src = await toDataUrl(photoBlob); preview.hidden = false; }
    catch { preview.hidden = true; err.textContent = t('join.photoUnreadable'); err.hidden = false; }
  });
  const photoNode = el('label', { class: 'act-q' }, [el('span', { text: t('join.photo') }), el('div', { class: 'join-photo__row' }, [preview, photo])]);
  const pw1 = f(t('join.password'), { type: 'password', minlength: 8 });
  const pw2 = f(t('join.password2'), { type: 'password', minlength: 8 });
  [pw1, pw2].forEach((o) => {
    const eye = el('button', { type: 'button', class: 'join-eye', 'aria-label': t('join.showPw'), text: '\uD83D\uDC41' });
    eye.addEventListener('click', () => { const show = o.i.type === 'password'; o.i.type = show ? 'text' : 'password'; eye.classList.toggle('is-on', show); });
    const wrap = el('div', { class: 'join-pw' }); o.i.replaceWith(wrap); wrap.append(o.i, eye);
  });
  const consent = el('input', { type: 'checkbox' });
  const err = el('p', { class: 'form-error', hidden: true });
  const progress = el('p', { class: 'act-notice', hidden: true });
  const go = el('button', { class: 'btn btn--primary', style: 'width:100%;', text: t('join.go') });

  card.append(
    el('div', { class: 'join-head' }, [el('img', { class: 'join-head__woddi', src: '/assets/logos/woddi-nurturer-wordmark.png', alt: 'WODDI, the nurturer' }), el('div', { class: 'join-head__lang' }, [lang, themeBtn])]),
    el('div', { class: 'join-net' }, [netMark]),
    el('div', { class: 'wi__kick' }, [el('span', { class: 'wi__label', text: NET === 'WNNN' ? t('join.labelWnnn') : t('join.labelWgmn') })]),
    el('h3', { text: t('join.title') }),
    ...(info.generic ? [el('p', { text: t('join.intro1') }), el('p', {}, [el('span', { text: t('join.intro2a') + ' ' }), el('b', { text: t('join.intro2b') }), el('span', { text: ' ' + t('join.intro2c') + ' ' }), el('b', { text: t('join.intro2d') }), el('span', { text: ', ' + t('join.intro2e') + ' ' }), el('b', { text: t('join.intro2f') }), el('span', { text: '.' })]), el('p', { text: t('join.intro3') })] : [el('p', { text: t('join.intro', { owner: info.owner, role: info.role_title || '', place: info.unit || info.country || '' }) })]),
    el('p', { class: 'act-notice', text: t('join.notice') }),
    el('h4', { class: 'join-h4', text: t('join.aboutYou') }),
    first.node, last.node, email.node, phone.node, dob.node, prefLang.node, photoNode,
    el('h4', { class: 'join-h4', text: t('join.aboutRole') }),
    refCat.node, refName.node,
    position.node, el('p', { class: 'muted', style: 'margin:-4px 0 8px;font-size:13px;', text: t('join.placeHint') }), country.node, lvl2.node, lvl3.node, lvl4.node,
    el('h4', { class: 'join-h4', text: t('join.yourLogin') }),
    pw1.node, pw2.node,
    el('label', { class: 'act-ack' }, [consent, el('span', { text: t('join.consent') })]),
    err, progress, go,
    el('p', { class: 'muted', style: 'margin-top:10px;font-size:12px;' }, [el('span', { text: t('join.already') + ' ' }), el('a', { href: '#/candidate', text: t('join.signIn') })]),
  );
  if (info.role && !info.generic) { position.s.value = info.role; position.s.disabled = true; }

  /* ---- submit ---------------------------------------------------------- */
  go.addEventListener('click', async () => {
    err.hidden = true;
    const fail = (m) => { err.textContent = m; err.hidden = false; go.disabled = false; window.scrollTo({ top: err.offsetTop - 80, behavior: 'smooth' }); };
    const val = (o, typed) => (o.s.value === '__other' ? typed.value.trim() : (o.s.selectedOptions[0]?.text || '').trim());
    const idOf = (o) => (o.s.value && o.s.value !== '__other' ? o.s.value : null);
    if (!first.i.value.trim() || !last.i.value.trim() || !email.i.value.trim() || !dob.i.value || !phone.i.value.trim()) return fail(t('join.fillAll'));
    if (!/^[0-9+()\-\s]{7,20}$/.test(phone.i.value.trim())) return fail(t('join.badPhone'));
    // Phase 210: the same typo checks the database applies (email_problem), so a
    // ".con" or "gmial" address is caught before an account is created on it.
    const emTyped = email.i.value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(emTyped)) return fail(t('join.badEmail'));
    if (/\.(con|cmo|ocm|coom|cpm|vom|xom|comm)$/.test(emTyped) || /@(gmail|yahoo|hotmail|outlook)\.co$/.test(emTyped)) return fail(t('join.emailEnding', { email: emTyped }));
    if (/@(gmial|gamil|gmal|gmai|gmaill|gnail|gmali|yaho|yahooo|hotmial|hotmal|outlok|outloo|iclod|icloud\.co)\b/.test(emTyped)) return fail(t('join.emailDomain', { email: emTyped }));
    if (!photoBlob) return fail(t('join.needPhoto'));
    if (!refCat.s.value) return fail(t('join.pickRefCat'));
    if (!refName.i.value.trim()) return fail(t('join.needRefName'));
    if (!position.s.value) return fail(t('join.pickPosition'));
    if (!country.s.value) return fail(t('join.pickCountry'));
    if (!val(lvl2, typed2) || !val(lvl3, typed3) || !val(lvl4, typed4)) return fail(t('join.fillPlace'));
    if (pw1.i.value.length < 8) return fail(t('claim.pwShort'));
    if (pw1.i.value !== pw2.i.value) return fail(t('claim.pwMismatch'));
    if (!consent.checked) return fail(t('join.needConsent'));
    go.disabled = true;
    const form = {
      network, position: position.s.value, country: (country.s.selectedOptions[0]?.text || '').trim(),
      country_iso: country.s.selectedOptions[0]?.dataset?.iso || '', country_id: country.s.value,
      state: val(lvl2, typed2), lga: val(lvl3, typed3), cluster: val(lvl4, typed4),
      unit_id: idOf(lvl4) || idOf(lvl3) || idOf(lvl2) || country.s.value,
      state_id: idOf(lvl2), lga_id: idOf(lvl3), cluster_id: idOf(lvl4),
      language: prefLang.s.value || getLocale(), phone: phone.i.value.trim(), birth_date: dob.i.value,
      referrer_category: refCat.s.value, referrer_name: refName.i.value.trim(),
    };
    const em = email.i.value.trim().toLowerCase();
    const cont = el('a', { href: '#/activation', class: 'btn btn--secondary', style: 'width:100%;margin-top:8px;', text: t('join.continueAnyway'), hidden: true,
      onclick: () => { location.hash = '#/activation'; location.reload(); } });
    if (go.parentNode) go.after(cont); else card.append(cont);
    const guard = setTimeout(() => { progress.textContent = t('join.slowNet'); cont.hidden = false; go.disabled = false; }, 90000);
    const step = (k) => { progress.textContent = t('join.step_' + k); progress.hidden = false; };
    const withTimeout = (p, ms, k) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(t('join.timeout', { step: t('join.step_' + k) }))), ms))]);
    try {
      // the form is saved on the device BEFORE anything else, and travels inside the sign-up
      try { localStorage.setItem('wdos.join.pending', JSON.stringify({ code, form, email: em })); } catch { /* ignore */ }
      step('account');
      const { data: su, error: suErr } = await withTimeout(db().auth.signUp({ email: em, password: pw1.i.value,
        options: { data: { first_name: first.i.value.trim(), last_name: last.i.value.trim(), phone: form.phone, birth_date: form.birth_date,
          referral_code: code, referral_form: form, network: form.network } } }), 45000, 'account');
      if (suErr && !/already|registered|exists/i.test(suErr.message)) throw suErr;
      const existed = (suErr && /already|registered|exists/i.test(suErr.message)) || (su && su.user && Array.isArray(su.user.identities) && su.user.identities.length === 0);
      step('signin');
      const { data: si, error: siErr } = await withTimeout(db().auth.signInWithPassword({ email: em, password: pw1.i.value }), 45000, 'signin');
      if (siErr) {
        if (existed) throw new Error(t('join.exists'));
        if (/confirm/i.test(siErr.message)) throw new Error(t('join.confirmEmail'));
        throw siErr;
      }
      const who = (si && si.session && si.session.user) || (su && su.session && su.session.user) || (su && su.user) || null;
      if (!who || String(who.email || '').toLowerCase() !== em) { await db().auth.signOut({ scope: 'local' }).catch(() => {}); throw new Error(t('join.wrongUser')); }
      // remember the form so Day 1 can still be opened if anything below is slow
      step('activation');
      let begun = false;
      let beginErr = null;
      for (let i = 0; i < 4; i++) { try { await withTimeout(beginReferralActivation(code, form), 20000, 'activation'); begun = true; beginErr = null; break; } catch (e) { beginErr = e; await new Promise((r) => setTimeout(r, 800)); } }
      if (!begun && beginErr && !/timeout|longer than expected/i.test(String(beginErr.message))) throw beginErr;
      if (begun) { try { localStorage.removeItem('wdos.join.pending'); } catch { /* ignore */ } }
      step('photo');
      try {
        const uid = who.id;
        await withTimeout(db().from('profiles').update({ phone: form.phone, birth_date: form.birth_date, preferred_locale: form.language }).eq('id', uid), 10000, 'photo');
        await withTimeout(uploadAvatar(uid, new File([photoBlob], 'photo.jpg', { type: 'image/jpeg' })), 25000, 'photo');
      } catch (e) { console.warn('photo deferred', e); }
      step('open');
      clearTimeout(guard);
      location.hash = '#/activation';
      location.reload();
    } catch (e) {
      clearTimeout(guard);
      progress.hidden = true;
      fail(e?.message || t('errors.save'));
    }
  });
}

function toDataUrl(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); }); }
async function shrinkImage(file, max) {
  const url = await toDataUrl(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
  if (!blob) throw new Error('unreadable');
  return blob;
}
