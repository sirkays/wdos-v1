/**
 * WODDI Volunteer Registration — Phase 52. Public, simple, open-ended.
 * Lives inside WDOS (no external bridge to break). On submit the instant-
 * approval trigger fires; the success screen immediately offers "Create
 * your login" and tells them a welcome email is on its way — registration
 * to activation journey in one sitting.
 */
import { el, clear } from '../core/dom.js';
import { t, setLocale, getLocale } from '../core/i18n.js';
import { AFRICAN_COUNTRIES, NG_STATES, COUNTRY_ISO, countryIso, countryLangs, LANG_NAMES } from '../core/geo.js';
import { db } from '../core/db.js';

export async function render(root, params = {}) {
  clear(root);
  const fixedNet = params.network === 'WGMN' || params.network === 'WNNN' ? params.network : '';
  const inner = el('div', { class: 'card' });
  // Phase 145: the five interface languages, in the order the founder set,
  // switch the whole form (built-in en/fr, AI-built pt/ar/sw).
  const LANGS = [['en', 'English'], ['fr', 'Français'], ['pt', 'Português'], ['ar', 'العربية'], ['sw', 'Kiswahili']];
  const langBar = el('div', { class: 'reg-langs' }, LANGS.map(([code, label]) => el('button', {
    class: `reg-lang ${getLocale() === code ? 'is-active' : ''}`, text: label,
    onclick: async () => { try { await setLocale(code); location.reload(); } catch { /* keep current */ } } })));
  root.append(el('div', { class: 'auth' }, [
    el('div', { class: 'auth__card', style: 'max-width:620px;' }, [
      el('div', { class: 'reg-head' }, [
        el('img', { src: '/assets/woddi-nurturer.png', alt: 'WODDI', class: 'reg-logo' }),
        fixedNet === 'WGMN' ? el('img', { src: '/assets/wgmn-logo.png', alt: 'WGMN', class: 'reg-logo reg-logo--net' }) : null,
        fixedNet === 'WNNN' ? el('div', { class: 'reg-net reg-net--wnnn' }, [el('b', { text: 'WNNN' }), el('small', { text: t('vol.wnnnFull') })]) : null,
      ]),
      el('div', { class: 'reg-title', text: fixedNet ? t('vol.titleNet', { net: fixedNet }) : t('vol.subtitle') }),
      langBar,
      el('div', { class: 'reg-hero' }, [
        el('b', { text: t('vol.heroTitle') }),
        el('p', { text: fixedNet === 'WNNN' ? t('vol.heroWnnn') : t('vol.heroWgmn') }),
        el('em', { text: t('vol.heroTag') }),
      ]),
      inner,
    ]),
  ]));
  form();

  function field(labelText, input, hint) {
    const w = el('div', { class: 'field' }, [
      el('label', { class: 'field__label', text: labelText }), input]);
    if (hint) w.append(el('p', { class: 'muted',
      style: 'font-size:12px;margin-top:2px;', text: hint }));
    return w;
  }

  function form() {
    clear(inner);
    inner.append(
      el('h2', { style: 'margin-bottom:4px;', text: t('vol.title') }),
      el('p', { class: 'muted mb-4', text: t('vol.hint') }));

    const name = el('input', { class: 'input', autocomplete: 'name',
      placeholder: t('vol.namePh') });
    const email = el('input', { class: 'input', type: 'email',
      autocomplete: 'email', placeholder: 'you@example.com' });
    const phone = el('input', { class: 'input', type: 'tel', required: true,
      autocomplete: 'tel', placeholder: '+234 …' });
    // The Founder's rule: your age decides your network.
    // 18 to 29 -> WNNN (Nurture NextGen), 30 and above -> WGMN (Good Mother).
    const age = el('select', { class: 'select' }, [
      el('option', { value: '', text: t('vol.agePick') }),
      fixedNet === 'WGMN' ? null : el('option', { value: '18-29', text: t('vol.age1829') }),
      fixedNet === 'WNNN' ? null : el('option', { value: '30+', text: t('vol.age30') }),
    ]);
    const netNote = el('p', { class: 'muted', hidden: true,
      style: 'margin:4px 0 0;' });
    const network = { get value() {
      return age.value === '18-29' ? 'WNNN'
        : age.value === '30+' ? 'WGMN' : '';
    } };
    age.addEventListener('change', () => {
      netNote.hidden = !network.value;
      netNote.textContent = network.value === 'WNNN'
        ? t('vol.netWnnn') : t('vol.netWgmn');
    });
    const country = el('select', { class: 'select' }, [
      el('option', { value: '', text: t('vol.countryPh') }),
      ...AFRICAN_COUNTRIES.map((c) => el('option', { value: c, text: c }))]);
    const stateIn = el('input', { class: 'input', placeholder: t('vol.statePh'), list: 'reg-states' });
    const stateList = el('datalist', { id: 'reg-states' });
    const langSel = el('select', { class: 'select' }, [el('option', { value: '', text: t('vol.langPick') })]);
    const langHint = el('p', { class: 'muted', style: 'font-size:12px;margin:-4px 0 8px;', text: t('vol.langHint') });
    const fillLangs = () => {
      const iso = countryIso(country.value);
      const top = countryLangs(iso);
      clear(langSel);
      langSel.append(el('option', { value: '', text: t('vol.langPick') }));
      if (country.value) {
        const g = el('optgroup', { label: t('vol.langInCountry', { country: country.value }) });
        for (const c of top) g.append(el('option', { value: c, text: LANG_NAMES[c] || c }));
        langSel.append(g);
      }
      const rest = el('optgroup', { label: t('vol.langOther') });
      for (const c of Object.keys(LANG_NAMES)) if (!top.includes(c) || !country.value) rest.append(el('option', { value: c, text: LANG_NAMES[c] }));
      langSel.append(rest);
      if (country.value && top[0]) langSel.value = top[0];
      clear(stateList);
      if (countryIso(country.value) === 'NG') for (const st of NG_STATES) stateList.append(el('option', { value: st }));
    };
    country.addEventListener('change', fillLangs);
    fillLangs();
    const photo = el('input', { type: 'file', accept: 'image/*', class: 'input' });
    const photoHint = t('vol.photoHint');
    const birthDate = el('input', { type: 'date', class: 'input', max: new Date(Date.now() - 15 * 365.25 * 864e5).toISOString().slice(0, 10) });
    const about = el('textarea', { class: 'input', rows: '5',
      placeholder: t('vol.aboutPh') });
    const err = el('p', { class: 'field__error', hidden: true });
    const btn = el('button', { class: 'btn btn--primary',
      style: 'width:100%;', text: t('vol.submit') });

    inner.append(
      field(t('vol.name'), name),
      field(t('vol.email'), email, t('vol.emailHint')),
      field(t('vol.phone'), phone),
      field(t('vol.birthDate'), birthDate, t('vol.birthDateHint')),
      field(t('vol.age'), age), netNote,
      field(t('vol.country'), country),
      field(t('vol.state'), stateIn), stateList,
      field(t('vol.lang'), langSel), langHint,
      field(t('vol.photo'), photo, photoHint),
      field(t('vol.about'), about, t('vol.aboutHint')),
      err, btn);

    btn.addEventListener('click', async () => {
      err.hidden = true;
      const nm = name.value.trim();
      const em = email.value.trim().toLowerCase();
      if (nm.length < 3) { show(t('vol.errName')); return; }
      if (!em.includes('@')) { show(t('vol.errEmail')); return; }
      if (phone.value.replace(/\D/g, '').length < 7) { show(t('vol.errPhone')); return; }
      if (!country.value) { show(t('vol.errCountry')); return; }
      if (photo.files && photo.files[0] && photo.files[0].size > 5 * 1024 * 1024) { show(t('vol.errPhotoSize')); return; }
      if (about.value.trim().length < 10) { show(t('vol.errAbout')); return; }
      btn.disabled = true;
      try {
        if (!network.value) {
          show(t('vol.agePick')); return;
        }
        const { submitVolunteerReg } = await import('../core/db.js');
        const { storedReferral } = await import('../core/db.js');
        const filed = await submitVolunteerReg({
          fullName: nm, email: em,
          phone: phone.value.trim(), network: network.value,
          country: country.value.trim(), about: about.value.trim(),
          state: stateIn.value.trim(), locale: langSel.value, ref: storedReferral()?.code || null,
          birthDate: birthDate.value || null,
        });
        if (photo.files && photo.files[0]) {
          try { const { uploadPendingPhoto } = await import('../core/db.js'); await uploadPendingPhoto(em, photo.files[0]); }
          catch { /* the photo can be added from the profile later */ }
        }
        try { const { attachStoredReferral } = await import('../core/db.js'); await attachStoredReferral(em); } catch { /* best effort */ }
        success(nm.split(' ')[0], em, filed);
      } catch (e) {
        show(String(e?.message || '').includes('duplicate')
          ? t('vol.errDup') : t('vol.errSave'));
        btn.disabled = false;
      }
    });

    function show(m) { err.textContent = m; err.hidden = false; }
  }

  function success(firstName, em, filed) {
    clear(inner);
    inner.append(
      el('h2', { style: 'color:var(--lime,#7CB518);margin-bottom:6px;',
        text: t('vol.approvedTitle', { name: firstName }) }),
      el('p', { style: 'line-height:1.6;', text: t('vol.approvedBody') }),
      el('p', { style: 'font-weight:700;', text: t('vol.doneRef', {
        ref: filed?.ref || '', network: filed?.network || '' }) }),
      el('p', { class: 'muted mt-2', text: t('vol.emailNote', { email: em }) }),
      el('a', { class: 'btn btn--primary mt-4',
        style: 'width:100%;text-align:center;display:block;', href: '#/claim',
        text: t('vol.claimNow') }),
      el('p', { class: 'muted mt-4', style: 'font-size:12px;',
        text: t('vol.sameEmail') }));
  }
}
