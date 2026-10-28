/* ---------------------------------------------------------------------------
 * Phase 207 — #/candidate : the Referral Activation sign-in.
 * A separate door for referred candidates (not the leaders' sign-in): the
 * WODDI wordmark, the two networks, sign in to continue an activation, or
 * open the right referral form to start one.
 * ------------------------------------------------------------------------- */
import { el, clear } from '../core/dom.js';
import { t, getLocale, setLocale, supportedLocales } from '../core/i18n.js';
import { db } from '../core/db.js';

export async function render(root) {
  clear(root);
  try { const { data: { session } } = await db().auth.getSession(); if (session) await db().auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
  const LOCALE_NAMES = { en: 'English', fr: 'Français', pt: 'Português', ar: 'العربية', sw: 'Kiswahili', ha: 'Hausa', yo: 'Yorùbá', ig: 'Igbo' };
  const lang = el('div', { class: 'join-langs' }, supportedLocales().map((c) => el('button', { type: 'button', class: 'join-lang' + (c === getLocale() ? ' is-on' : ''), text: LOCALE_NAMES[c] || c,
    onclick: async () => { try { await setLocale(c); location.reload(); } catch { /* keep */ } } })));
  const email = el('input', { class: 'input', type: 'email', autocomplete: 'username', required: true });
  const pw = el('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true });
  const eye = el('button', { type: 'button', class: 'join-eye', 'aria-label': t('join.showPw'), text: '\uD83D\uDC41' });
  eye.addEventListener('click', () => { const show = pw.type === 'password'; pw.type = show ? 'text' : 'password'; eye.classList.toggle('is-on', show); });
  const err = el('p', { class: 'form-error', hidden: true });
  const go = el('button', { class: 'btn btn--primary', style: 'width:100%;', text: t('cand.signIn') });
  go.addEventListener('click', async () => {
    err.hidden = true; go.disabled = true;
    try {
      const { error } = await db().auth.signInWithPassword({ email: email.value.trim().toLowerCase(), password: pw.value });
      if (error) throw error;
      location.hash = '#/activation'; location.reload();
    } catch (e) { err.textContent = /invalid/i.test(String(e?.message)) ? t('cand.badLogin') : (e?.message || t('errors.load')); err.hidden = false; go.disabled = false; }
  });
  root.append(el('div', { class: 'vs-card join-card' }, [
    el('div', { class: 'join-head' }, [el('img', { class: 'join-head__woddi', src: '/assets/logos/woddi-nurturer-wordmark.png', alt: 'WODDI, the nurturer' }), el('div', { class: 'join-head__lang' }, [lang])]),
    el('div', { class: 'cand-nets' }, [el('img', { src: '/assets/logos/wgmn-disc.png', alt: 'WGMN', class: 'cand-net' }), el('img', { src: '/assets/logos/wnnn-disc.png', alt: 'WNNN', class: 'cand-net' })]),
    el('div', { class: 'wi__kick' }, [el('span', { class: 'wi__label', text: t('join.label') })]),
    el('h3', { text: t('cand.title') }),
    el('p', { class: 'muted', text: t('cand.intro') }),
    el('h4', { class: 'join-h4', text: t('cand.continue') }),
    el('label', { class: 'act-q' }, [el('span', { text: t('v.email') }), email]),
    el('label', { class: 'act-q' }, [el('span', { text: t('cand.password') }), el('div', { class: 'join-pw' }, [pw, eye])]),
    err, go,
    el('p', { class: 'muted', style: 'margin-top:8px;font-size:12px;' }, [el('a', { href: '#/reset', text: t('auth.forgot') })]),
    el('h4', { class: 'join-h4', text: t('cand.start') }),
    el('p', { class: 'muted', text: t('cand.startIntro') }),
    el('div', { class: 'join-netbtns' }, [
      el('a', { href: '#/join/WGMN', class: 'join-netbtn join-netbtn--wgmn is-on' }, [el('b', { text: 'WGMN' }), el('small', { text: t('join.labelWgmn') })]),
      el('a', { href: '#/join/WNNN', class: 'join-netbtn join-netbtn--wnnn is-on' }, [el('b', { text: 'WNNN' }), el('small', { text: t('join.labelWnnn') })])]),
    el('p', { class: 'muted', style: 'margin-top:14px;font-size:12px;' }, [el('span', { text: t('cand.leader') + ' ' }), el('a', { href: '#/login', text: t('cand.leaderLink') })]),
  ]));
}
