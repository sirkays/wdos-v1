/* ---------------------------------------------------------------------------
 * Phase 210: "My WODDI mailbox", the position mailbox card on a leader's
 * dashboard. The database (my_position_mailbox) decides open / locked / none
 * from the signed-in leader's own seat; this component only shows the answer.
 * The password is fetched only when she clicks Show, and every reveal is
 * recorded server-side.
 * ------------------------------------------------------------------------- */
import { el } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { myPositionMailbox } from '../core/db.js';
import { icon } from './icons.js';
import { toast, toastError } from './toast.js';
import { roleTitle } from '../core/titles.js';

export async function mailboxCard() {
  let m;
  try { m = await myPositionMailbox(false); } catch { return null; }
  if (!m || m.state === 'not_signed_in' || m.state === 'no_seat') return null;
  if (m.state === 'none' && m.reason_none === 'position_has_no_mailbox') return null;   // chapter roles and secretaries have no WODDI mailbox
  const seat = m.seat || {};
  const head = el('div', { class: 'card__head' }, [el('h3', {}, [icon(m.state === 'open' ? 'check' : 'lock', 18), ' ', t('mb.cardTitle')]),
    el('span', { class: `vs-badge vs-badge--${m.state === 'open' ? 'green' : m.state === 'locked' ? 'amber' : 'grey'}`, text: t('mb.state_' + m.state) })]);
  const seatLine = el('p', { class: 'muted', text: t('mb.seatLine', { title: seat.title || roleTitle(seat.role) || seat.role || '', unit: seat.unit || '' }) });
  if (m.state === 'none') {
    return el('div', { class: 'vs-card mb-card mb-card--none' }, [head, seatLine, el('p', { text: t('mb.none_' + (m.reason_none || 'unit_not_matched')) })]);
  }
  if (m.state === 'locked') {
    const g = m.gate || {};
    const why = t('mb.why_' + (g.reason || 'no_activation'));
    return el('div', { class: 'vs-card mb-card mb-card--locked' }, [head, seatLine,
      el('p', { text: t('mb.lockedBody') }), el('p', { class: 'mb-why' }, [el('b', { text: t('mb.whyLabel') }), ' ', why]),
      g.reason === 'onboarding_pending' ? el('a', { href: '#/my/onboarding', class: 'btn btn--primary', text: t('mb.goOnboarding') }) : null,
      g.reason === 'activation_in_progress' || g.reason === 'activation_incomplete' ? el('a', { href: '#/candidate', class: 'btn btn--primary', text: t('mb.goActivation') }) : null]);
  }
  // open
  const mb = m.mailbox || {};
  const pw = el('code', { class: 'mb-secret', text: '••••••••••' });
  let revealed = null;
  const copy = async (v) => { try { await navigator.clipboard.writeText(v); toast(t('acc.copied')); } catch { toastError(t('mb.copyFailed')); } };
  const showBtn = el('button', { class: 'btn btn--quiet', text: t('mb.show') });
  const copyPw = el('button', { class: 'btn btn--quiet', text: t('mb.copy'), disabled: true });
  showBtn.addEventListener('click', async () => {
    if (revealed) { revealed = null; pw.textContent = '••••••••••'; showBtn.textContent = t('mb.show'); copyPw.disabled = true; return; }
    showBtn.disabled = true;
    try {
      const r = await myPositionMailbox(true);            // every reveal is recorded in the database
      if (r?.state !== 'open' || !r?.mailbox?.password) throw new Error(t('mb.revealRefused'));
      revealed = r.mailbox.password; pw.textContent = revealed; showBtn.textContent = t('mb.hide'); copyPw.disabled = false;
    } catch (e) { toastError(e?.message || t('errors.load')); }
    showBtn.disabled = false;
  });
  copyPw.addEventListener('click', () => { if (revealed) copy(revealed); });
  return el('div', { class: 'vs-card mb-card mb-card--open' }, [head, seatLine,
    el('p', { class: 'muted', text: t('mb.openBody') }),
    el('div', { class: 'mb-row' }, [el('span', { class: 'mb-k', text: t('mb.email') }), el('code', { class: 'mb-v', style: 'user-select:all;', text: mb.email || '' }), el('button', { class: 'btn btn--quiet', text: t('mb.copy'), onclick: () => copy(mb.email || '') })]),
    el('div', { class: 'mb-row' }, [el('span', { class: 'mb-k', text: t('mb.password') }), pw, showBtn, copyPw]),
    el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;margin-top:8px;' }, [
      el('a', { href: m.webmail_url || 'https://9.qservers.net:2096/', target: '_blank', rel: 'noopener noreferrer', class: 'btn btn--primary', text: t('mb.openWebmail') })]),
    el('p', { class: 'muted', style: 'font-size:12px;', text: t('mb.recorded') })]);
}
