/**
 * Phase 131 — Accounts (HQ master control) at #/accounts.
 *
 * Every leader and member the organisation has, with their login state,
 * and the controls HQ asked for: create a login for an onboarded leader
 * who has none, open her dashboard read-only ("View as"), edit details,
 * seat or unseat her, walk her membership status, issue a new temporary
 * password, change her sign-in email, suspend or restore sign-in, delete
 * the account. The auth side runs through the admin-users Edge Function
 * (service key stays on the server); the profile/role side through
 * HQ-guarded RPCs. Temporary passwords are shown exactly once and never
 * stored by WDOS.
 */
import { el, clear, debounce } from '../core/dom.js';
import { t, fmtDate, fmtDateTime } from '../core/i18n.js';
import {
  hqAccountList, hqUpdateProfile, hqSetStatus, hqSetRole, hqEndRoles,
  hqLinkDirectory, adminUsers, listOrgUnits, uploadAvatar, avatarUrl, db,
  hqSetAppointment, onboardingOverview, directorySeatTarget, registerContactsApply, registerContactsNgApply, hqBackdateSeat, uploadPendingPhoto,
} from '../core/db.js';
import { apptBadge } from './structure.js';
import { renderShell } from '../components/layout.js';
import { openModal, closeModal } from '../components/modal.js';
import { withDriveFallback, drivePhotoFor } from '../core/photos.js';
import { toast, toastError } from '../components/toast.js';
import { icon } from '../components/icons.js';
import { AFRICAN_COUNTRIES, NG_STATES, countryIso, flagSrc } from '../core/geo.js';

const ROLES = ['country_rep', 'deputy_country_rep', 'state_coordinator',
  'assistant_state_coordinator', 'state_secretary', 'district_coordinator', 'assistant_district_coordinator',
  'cluster_coordinator', 'assistant_cluster_coordinator',
  'chapter_lead', 'assistant_chapter_lead',
  'volunteer', 'member', 'programme_staff', 'institute_admin', 'hq_team',
  'executive_director', 'super_admin'];
const POSITIONS = ROLES.slice(0, 10);
const APPT = ['appointed', 'acting', 'pending'];
const STATUSES = ['applicant', 'under_review', 'approved', 'activated', 'in_training',
  'active', 'inactive', 'suspended', 'resigned', 'removed', 'alumni', 'reinstated'];

export async function render(root, _params, ctx) {
  const shell = renderShell(root, {
    profile: ctx.profile, modules: ctx.modules, titleKey: 'nav.accounts',
  });
  const out = shell.outlet;
  clear(out);

  let units = null;
  const unitsP = listOrgUnits().then((u) => { units = u; return u; }).catch(() => []);

  const search = el('input', { class: 'input', type: 'search',
    placeholder: t('acc.searchPh'), style: 'max-width:360px;' });
  const only = el('select', { class: 'select', style: 'width:auto;' }, [
    el('option', { value: '', text: t('acc.fAll') }),
    el('option', { value: 'leaders', text: t('acc.fLeaders') }),
    el('option', { value: 'nologin', text: t('acc.fNoLogin') }),
    el('option', { value: 'suspended', text: t('acc.fSuspended') }),
    el('option', { value: 'never', text: t('acc.fNever') }),
    el('option', { value: 'onboarding', text: t('acc.fOnboarding') }),
    el('option', { value: 'acceptance', text: t('acc.fAcceptance') }),
  ]);
  const addBtn = el('button', { class: 'btn btn--primary', text: t('acc.addLeader'),
    onclick: () => createModal(null) });
  // Phase 149: create logins for every directory leader with an email and no
  // login, seat each from her recorded position and country/state, and show
  // one printable sheet of temporary passwords (shown once; never stored).
  const bulkBtn = el('button', { class: 'btn btn--secondary', text: t('acc.bulkCreate'), onclick: bulkCreate });
  async function bulkCreate() {
    const targets = rows.filter((r) => !r.has_login && r.email && r.membership_no && !r.on_hold);
    const held = rows.filter((r) => !r.has_login && r.email && r.membership_no && r.on_hold).length;
    if (!targets.length) { toast(t('acc.bulkNone')); return; }
    if (!confirm(t('acc.bulkConfirm', { n: targets.length }) + (held ? `\n${t('acc.bulkHeld', { n: held })}` : ''))) return;
    bulkBtn.disabled = true;
    const done = []; const failed = []; let sessionLost = false;
    for (const r of targets) {
      const [first, ...rest] = String(r.name || '').split(' ');
      // stop cleanly if this browser's session has gone (the 9 Sep run lost it mid-loop)
      try { const { getSession } = await import('../core/db.js'); if (!(await getSession())) { sessionLost = true; break; } } catch { /* continue */ }
      try {
        const res = await adminUsers('create', {
          email: r.email, first_name: first, last_name: rest.join(' ') || '-', network: r.network || 'WGMN',
          phone: r.phone || '', country: r.country || '', state_region: r.state_region || '', lga: '',
          role_applied: r.role_applied || '', is_leader: true, member_code: r.membership_no,
        });
        let seat = ''; let tg = null;
        try { await hqLinkDirectory(res.id, r.membership_no); } catch { /* noted below */ }
        try {
          tg = await directorySeatTarget(r.membership_no);
          if (tg?.role && tg?.unit_id) {
            await hqSetRole(res.id, tg.role, tg.unit_id); seat = `${t('role.' + tg.role)} @ ${tg.unit}`;
            if (tg.appointed_on) { try { await hqBackdateSeat(res.id, tg.role, tg.appointed_on); } catch { /* date stays today */ } }
          }
          else seat = t('acc.bulkNoSeat');
        } catch { seat = t('acc.bulkNoSeat'); }
        done.push({ name: r.name, role: r.role_applied, country: r.country, state: r.state_region || tg?.state || '', email: r.email, password: res.temp_password || '', seat });
      } catch (e) { failed.push({ name: r.name, email: r.email, why: e?.message || 'failed' }); }
    }
    bulkBtn.disabled = false;
    if (sessionLost) toastError(t('acc.bulkSessionLost', { n: done.length }));
    if (done.length || failed.length) showSheet(done, failed);
    load();
  }
  function showSheet(done, failed, title) {
    const win = window.open('', '_blank');
    const esc = (x) => String(x ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const roleRank = (r) => { const x = String(r || '').toLowerCase(); return x.startsWith('assistant') || x.startsWith('deputy') ? 1 : 0; };
    const isNg = (d) => /nigeria/i.test(d.country || '') && /state/i.test(d.role || '');
    const isCr = (d) => /country rep/i.test(d.role || '');
    const ng = done.filter(isNg).sort((a, b) => (a.state || '').localeCompare(b.state || '') || roleRank(a.role) - roleRank(b.role));
    const af = done.filter((d) => !isNg(d) && isCr(d)).sort((a, b) => (a.country || '').localeCompare(b.country || '') || roleRank(a.role) - roleRank(b.role));
    const rest = done.filter((d) => !isNg(d) && !isCr(d)).sort((a, b) => (a.country || '').localeCompare(b.country || '') || (a.name || '').localeCompare(b.name || ''));
    const table = (rows, groupKey, groupLabel) => {
      let html = `<table><thead><tr><th>${esc(groupLabel)}</th><th>${esc(t('acc.thName'))}</th><th>${esc(t('acc.thRole'))}</th><th>${esc(t('acc.thSeat'))}</th><th>Email</th><th>${esc(t('acc.thTempPw'))}</th></tr></thead><tbody>`;
      let last = null;
      for (const d of rows) {
        const g = d[groupKey] || '';
        html += `<tr${g !== last ? ' class="grp"' : ''}><td>${g !== last ? '<b>' + esc(g) + '</b>' : ''}</td><td>${esc(d.name)}</td><td>${esc(d.role)}</td><td>${esc(d.seat)}</td><td>${esc(d.email)}</td><td class="pw">${esc(d.password)}</td></tr>`;
        last = g;
      }
      return html + '</tbody></table>';
    };
    const failHtml = failed.length ? `<h3>${esc(t('acc.bulkFailed'))}</h3><ul>${failed.map((f) => `<li>${esc(f.name)} (${esc(f.email)}): ${esc(f.why)}</li>`).join('')}</ul>` : '';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>WDOS temporary passwords</title>
      <style>body{font-family:Arial,sans-serif;margin:24px;color:#1b1b1f}h1{color:#D4006A;margin:0 0 4px}h2{font-size:14px;color:#5b5b63;font-weight:normal;margin:0 0 16px}
      h3{color:#D4006A;margin:22px 0 8px;font-size:16px}table{border-collapse:collapse;width:100%;font-size:12px;margin-bottom:8px}th{background:#FBE7F0;color:#D4006A;text-align:left}th,td{border:1px solid #d9d9de;padding:6px 8px;vertical-align:top}
      tr.grp td{border-top:2px solid #D4006A}.pw{font-family:Consolas,monospace;font-weight:bold}.note{margin-top:16px;font-size:12px;color:#5b5b63}@media print{button{display:none}h3{page-break-after:avoid}}</style></head><body>
      <h1>WODDI Digital Operating System</h1><h2>${esc(title || t('acc.sheetTitle', { n: done.length, d: new Date().toLocaleString() }))}</h2>
      <button onclick="window.print()">${esc(t('acc.sheetPrint'))}</button>
      ${ng.length ? `<h3>${esc(t('acc.sheetNg', { n: ng.length }))}</h3>` + table(ng, 'state', t('vol.state')) : ''}
      ${af.length ? `<h3>${esc(t('acc.sheetAf', { n: af.length }))}</h3>` + table(af, 'country', t('v.country')) : ''}
      ${rest.length ? `<h3>${esc(t('acc.sheetOther', { n: rest.length }))}</h3>` + table(rest, 'country', t('v.country')) : ''}
      ${failHtml}<p class="note">${esc(t('acc.sheetNote'))}</p></body></html>`;
    if (win) { win.document.write(html); win.document.close(); }
    else toastError(t('acc.sheetBlocked'));
  }
  // Phase 153: ONE complete sheet for every volunteer leader (Africa CR/DCR,
  // Nigeria SC/ASC): creates the missing logins, issues a new temporary
  // password to those who have never signed in, seats anyone unseated, and
  // lists everyone, including those who already use their own password and
  // those with no email on file, grouped by state and by country.
  const completeBtn = el('button', { class: 'btn btn--primary', text: t('acc.completeSheet'), onclick: async () => {
    const isLeaderRow = (r) => (r.roles || []).length > 0 || /country rep|deputy country|state coord|assistant state|regional coord/i.test(r.role_applied || '');
    const isNgRow = (r) => /nigeria/i.test(r.country || '') && /state coord|assistant state/i.test(r.role_applied || ((r.roles || [])[0]?.role || '').replace(/_/g, ' '));
    const isAfRow = (r) => /country rep|deputy country|country_rep/i.test(r.role_applied || ((r.roles || [])[0]?.role || ''));
    const pool = rows.filter((r) => isLeaderRow(r) && !r.on_hold);
    if (!pool.length) { toast(t('acc.bulkNone')); return; }
    // scope chooser: Nigeria SC/ASC, Africa CR/DCR, others; and whether to reset signed-in leaders
    const cNg = el('input', { type: 'checkbox', checked: true }), cAf = el('input', { type: 'checkbox', checked: true }), cOt = el('input', { type: 'checkbox' }), cRs = el('input', { type: 'checkbox' });
    const row = (cb, label, n) => el('label', { class: 'row', style: 'gap:8px;align-items:center;margin:6px 0;' }, [cb, el('span', { text: `${label} (${n})` })]);
    const choice = await new Promise((resolve) => {
      openModal(t('acc.completeTitle'), el('div', {}, [
        el('p', { class: 'muted', text: t('acc.completeHint') }),
        el('b', { text: t('acc.completeScope') }),
        row(cNg, t('acc.scopeNg'), pool.filter(isNgRow).length), row(cAf, t('acc.scopeAf'), pool.filter(isAfRow).length),
        row(cOt, t('acc.scopeOther'), pool.filter((r) => !isNgRow(r) && !isAfRow(r)).length),
        el('hr'), row(cRs, t('acc.resetSignedIn'), pool.filter((r) => r.has_login && r.last_sign_in_at).length),
        el('div', { class: 'row', style: 'margin-top:10px;' }, [el('span', { class: 'grow' }),
          el('button', { class: 'btn btn--quiet', text: t('acc.cancel'), onclick: () => { closeModal(); resolve(null); } }),
          el('button', { class: 'btn btn--primary', text: t('acc.completeRun'), onclick: () => { closeModal(); resolve({ ng: cNg.checked, af: cAf.checked, ot: cOt.checked, rs: cRs.checked }); } })])]));
    });
    if (!choice) return;
    const all = pool.filter((r) => (choice.ng && isNgRow(r)) || (choice.af && isAfRow(r)) || (choice.ot && !isNgRow(r) && !isAfRow(r)));
    if (!all.length) { toast(t('acc.bulkNone')); return; }
    const includeSignedIn = choice.rs;
    completeBtn.disabled = true;
    const done = []; const failed = []; let sessionLost = false;
    for (const r of all) {
      try { const { getSession } = await import('../core/db.js'); if (!(await getSession())) { sessionLost = true; break; } } catch { /* continue */ }
      const seat0 = (r.roles || [])[0];
      const base = { name: r.name, role: seat0 ? t('role.' + seat0.role) : r.role_applied, country: r.country, state: r.state_region || '', email: r.email || '',
        seat: seat0 ? `${t('role.' + seat0.role)} @ ${seat0.unit}` : '' };
      if (!r.email) { done.push({ ...base, password: t('acc.noEmail') }); continue; }
      try {
        let id = r.id; let password = '';
        if (!r.has_login) {
          const [first, ...rest] = String(r.name || '').split(' ');
          const res = await adminUsers('create', { email: r.email, first_name: first, last_name: rest.join(' ') || '-', network: r.network || 'WGMN',
            phone: r.phone || '', country: r.country || '', state_region: r.state_region || '', lga: '', role_applied: r.role_applied || '', is_leader: true, member_code: r.membership_no });
          id = res.id; password = res.temp_password || '';
          if (r.membership_no) { try { await hqLinkDirectory(id, r.membership_no); } catch { /* noted */ } }
        } else if (!r.last_sign_in_at || includeSignedIn) {
          const res = await adminUsers('set_password', { id: r.id });
          password = res.temp_password || '';
        } else {
          password = t('acc.ownPassword');
        }
        if (!seat0 && r.membership_no) {
          try {
            const tg = await directorySeatTarget(r.membership_no);
            if (tg?.role && tg?.unit_id) {
              await hqSetRole(id, tg.role, tg.unit_id); base.seat = `${t('role.' + tg.role)} @ ${tg.unit}`; base.role = t('role.' + tg.role); base.state = base.state || tg.state || '';
              if (tg.appointed_on) { try { await hqBackdateSeat(id, tg.role, tg.appointed_on); } catch { /* today */ } }
            } else base.seat = t('acc.bulkNoSeat');
          } catch { base.seat = base.seat || t('acc.bulkNoSeat'); }
        }
        done.push({ ...base, password });
      } catch (e) { failed.push({ name: r.name, email: r.email, why: e?.message || 'failed' }); }
    }
    completeBtn.disabled = false;
    if (sessionLost) toastError(t('acc.bulkSessionLost', { n: done.length }));
    if (done.length || failed.length) showSheet(done, failed, t('acc.sheetTitleComplete', { n: done.length, d: new Date().toLocaleString() }));
    load();
  } });
  // Phase 162: import a folder of photos. Each file name is matched to a
  // leader by the name words it contains (titles, roles, states and words
  // such as "Copy of" ignored); HQ reviews and corrects the matches, then
  // one press resizes each picture and uploads it to the leader's profile
  // (or, for a leader without a login yet, to the pending-photos store she
  // collects at her first sign-in).
  const photosBtn = el('button', { class: 'btn btn--secondary', text: t('acc.importPhotos'), onclick: importPhotos });
  const STOP = new Set(('copy of sc asc dcr cr state states coordinator coordinators cordinator corodinator assistant ass country representative representante représentante représentant adjointe adjoint pays woddi photo photos picture headshot deputy mrs mr dr hon lady barr pharm rt the of for centrafrique tchad guinée guinee ' +
    'abia adamawa akwa ibom anambra bauchi bayelsa benue borno cross river delta ebonyi edo ekiti enugu gombe imo jigawa kaduna kano katsina kebbi kogi kwara lagos nasarawa nassarawa niger ogun ondo osun oyo plateau rivers sokoto taraba yobe zamfara fct abuja ' +
    'nigeria ghana senegal mali guinea togo benin chad cameroon cameroun morocco morrocco tunisia rwanda uganda burkina faso congo ivoire cote côte madagascar south africa gambia bissau burundi republic').split(/\s+/));
  const tokens = (str) => String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '')
    .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
  function lev(a, b) {
    const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i += 1) {
      const cur = [i];
      for (let j = 1; j <= n; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function matchLeader(fileName) {
    const ft = tokens(fileName);
    let best = null, bestScore = 0;
    for (const r of rows) {
      const nt = tokens(r.name);
      const hits = ft.filter((w) => nt.some((n) => n === w || (w.length > 4 && n.startsWith(w.slice(0, 5))) || (w.length >= 6 && n.length >= 6 && lev(w, n) <= 2)));
      const score = hits.length + (ft.length && hits.length === ft.length ? 0.5 : 0);
      if (score > bestScore) { bestScore = score; best = r; }
    }
    return bestScore >= 2 || (bestScore >= 1 && ft.length === 1) ? best : null;
  }
  async function shrink(file) {
    if (!/^image\//.test(file.type) || /heic|heif/i.test(file.type)) return null;
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const max = 640; const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch { return null; } finally { URL.revokeObjectURL(url); }
  }
  async function importPhotos() {
    const input = el('input', { type: 'file', multiple: true, accept: 'image/*', hidden: true });
    input.addEventListener('change', async () => {
      const files = [...(input.files || [])];
      if (!files.length) return;
      const plan = files.map((f) => ({ file: f, match: matchLeader(f.name) }));
      const list = el('div', { class: 'table-wrap' });
      const tbl = el('table', { class: 'vs-table' }, [el('thead', {}, [el('tr', {}, [el('th', { text: t('acc.phFile') }), el('th', { text: t('acc.phLeader') }), el('th', { text: t('acc.phStatus') })])])]);
      const tb = el('tbody'); tbl.append(tb); list.append(tbl);
      const opts = rows.filter((r) => r.email).sort((a, b) => a.name.localeCompare(b.name));
      for (const pl of plan) {
        const sel = el('select', { class: 'select' }, [el('option', { value: '', text: t('acc.phSkip') }), ...opts.map((r) => el('option', { value: r.email, text: `${r.name} (${r.role_applied || ''}${r.state_region ? ', ' + r.state_region : ''})`, selected: pl.match && pl.match.email === r.email || null }))]);
        sel.addEventListener('change', () => { pl.match = opts.find((r) => r.email === sel.value) || null; });
        pl.status = el('span', { class: 'muted', text: pl.match ? t('acc.phMatched') : t('acc.phNoMatch') });
        tb.append(el('tr', {}, [el('td', { text: pl.file.name }), el('td', {}, [sel]), el('td', {}, [pl.status])]));
      }
      const go = el('button', { class: 'btn btn--primary', text: t('acc.phUpload'), onclick: async () => {
        go.disabled = true; let ok = 0, fail = 0;
        for (const pl of plan) {
          if (!pl.match) continue;
          try {
            const small = await shrink(pl.file);
            if (!small) { pl.status.textContent = t('acc.phUnsupported'); fail += 1; continue; }
            if (pl.match.id && pl.match.has_login) await uploadAvatar(pl.match.id, small);
            else await uploadPendingPhoto(pl.match.email, small);
            pl.status.textContent = t('acc.phDone'); ok += 1;
          } catch (e) { pl.status.textContent = e?.message || t('errors.save'); fail += 1; }
        }
        toast(t('acc.phSummary', { ok, fail })); photoBust = Date.now(); load();
      } });
      openModal(t('acc.importPhotos'), el('div', {}, [el('p', { class: 'muted', text: t('acc.phHint') }), list, el('div', { class: 'row', style: 'margin-top:10px;' }, [el('span', { class: 'grow' }), go])]));
    });
    input.click();
  }
  // Phase 152: a fresh temporary password for every leader who has a login but
  // has never signed in (a password already issued cannot be read back; only a
  // new one can be issued), on the same grouped sheet.
  const resetSheetBtn = el('button', { class: 'btn btn--secondary', text: t('acc.resetNever'), onclick: async () => {
    const targets = rows.filter((r) => r.has_login && !r.last_sign_in_at && !r.on_hold && (r.roles || []).length);
    if (!targets.length) { toast(t('acc.resetNeverNone')); return; }
    if (!confirm(t('acc.resetNeverConfirm', { n: targets.length }))) return;
    resetSheetBtn.disabled = true;
    const done = []; const failed = []; let sessionLost = false;
    for (const r of targets) {
      try { const { getSession } = await import('../core/db.js'); if (!(await getSession())) { sessionLost = true; break; } } catch { /* continue */ }
      try {
        const res = await adminUsers('set_password', { id: r.id });
        const seat = (r.roles || [])[0];
        done.push({ name: r.name, role: seat ? t('role.' + seat.role) : r.role_applied, country: r.country, state: r.state_region || '',
          email: r.email, password: res.temp_password || '', seat: seat ? `${t('role.' + seat.role)} @ ${seat.unit}` : '' });
      } catch (e) { failed.push({ name: r.name, email: r.email, why: e?.message || 'failed' }); }
    }
    resetSheetBtn.disabled = false;
    if (sessionLost) toastError(t('acc.bulkSessionLost', { n: done.length }));
    if (done.length || failed.length) showSheet(done, failed, t('acc.sheetTitleReset', { n: done.length, d: new Date().toLocaleString() }));
  } });
  // Phase 165: HQ function (founder / hofco / secretary / admin / programmes / comms / finance / it / qa)
  const FN = ['', 'founder', 'hofco', 'secretary', 'admin', 'programmes', 'comms', 'finance', 'it', 'qa'];
  function hqFunctionModal(r) {
    const sel = el('select', { class: 'select' }, FN.map((f) => el('option', { value: f, text: f ? t('hqfn.' + f) : t('acc.fnNone'), selected: (r.hq_function || '') === f || null })));
    openModal(t('acc.fnTitle', { name: r.name }), el('div', {}, [el('p', { class: 'muted', text: t('acc.fnHint') }), sel,
      el('div', { class: 'row', style: 'margin-top:10px;' }, [el('span', { class: 'grow' }), el('button', { class: 'btn btn--primary', text: t('acc.save'), onclick: async () => {
        try { const { error } = await db().rpc('hq_set_function', { pid: r.id, fn: sel.value }); if (error) throw error; closeModal(); toast(t('acc.fnSaved')); load(); }
        catch (e) { toastError(e?.message || t('errors.save')); }
      } })])]));
  }
  const contactsBtn = el('button', { class: 'btn btn--quiet', text: t('acc.applyContacts'), onclick: async () => {
    try {
      const r = await registerContactsApply();
      const n = await registerContactsNgApply();
      toast(t('acc.applyContactsDone', { p: r.already_with_login + n.already_with_login, u: r.directory_updated + n.directory_updated, a: r.directory_added + n.directory_added })); load();
    }
    catch (e) { toastError(e?.message || t('errors.save')); }
  } });
  const summary = el('p', { class: 'muted' });
  const listBox = el('div');
  out.append(
    el('p', { class: 'muted mb-2', text: t('acc.sub') }),
    el('div', { class: 'row mb-4', style: 'gap:10px;flex-wrap:wrap;' }, [search, only, el('span', { class: 'grow' }), contactsBtn, photosBtn, completeBtn, bulkBtn, resetSheetBtn, addBtn]),
    summary, listBox);

  // Phase 213: check the admin function, and say exactly what is wrong. Only a
  // function that truly does not exist (404) blocks the buttons; a dropped
  // connection used to be reported as "not deployed" and disabled every
  // button for the rest of the visit, even though the next click would work.
  let fnOk = null;
  const fnBanner = el('div', { class: 'offline-banner',
    style: 'background:var(--warn-tint);color:var(--warn);display:none;gap:12px;align-items:center;flex-wrap:wrap;' });
  out.insertBefore(fnBanner, summary);
  function checkFn() {
    adminUsers('ping').then(() => { fnOk = true; fnBanner.style.display = 'none'; })
      .catch((e) => {
        const why = e?.cause || e?.code || e?.message || '';
        const key = e?.code === 'not_deployed' ? 'acc.fnMissing'
          : e?.code === 'hq_only' ? 'acc.fnNotHq'
            : e?.code === 'not_signed_in' ? 'acc.fnSignedOut'
              : e?.code === 'unreachable' ? 'acc.fnUnreachable' : 'acc.fnError';
        fnOk = e?.code === 'not_deployed' ? false : null;
        clear(fnBanner);
        fnBanner.append(el('span', { class: 'grow', text: t(key, { why }) }),
          el('button', { class: 'btn btn--secondary', type: 'button', text: t('acc.fnCheckAgain'),
            onclick: (ev) => { ev.target.disabled = true; ev.target.textContent = t('acc.fnChecking'); checkFn(); } }));
        fnBanner.style.display = 'flex';
      });
  }
  checkFn();

  let rows = [];
  let photoBust = Date.now();
  let onb = {};
  async function load() {
    clear(listBox);
    listBox.append(el('div', { class: 'state' }, [el('div', { class: 'spinner' })]));
    try {
      const [o, r] = await Promise.all([onboardingOverview().catch(() => ({})), hqAccountList(search.value.trim(), 1000)]);
      onb = o || {}; rows = r || [];
    }
    catch (err) {
      clear(listBox);
      listBox.append(el('p', { class: 'muted', text: err?.message === 'HQ only'
        ? t('atlas.hqOnly') : (err?.message || t('errors.load')) }));
      return;
    }
    draw();
  }
  function draw() {
    clear(listBox);
    const f = only.value;
    const shown = rows.filter((r) => {
      if (f === 'leaders') return r.is_leader || (r.roles || []).length;
      if (f === 'nologin') return !r.has_login;
      if (f === 'suspended') return r.banned;
      if (f === 'never') return r.has_login && !r.last_sign_in_at;
      if (f === 'onboarding') { const o = onb[r.id]; return o && o.done < o.total; }
      if (f === 'acceptance') return (r.roles || []).some((x) => x.accepted_at === null && !x.declined_at);
      return true;
    });
    summary.textContent = t('acc.summary', {
      n: shown.length, login: rows.filter((r) => r.has_login).length,
      none: rows.filter((r) => !r.has_login).length,
      susp: rows.filter((r) => r.banned).length });
    if (!shown.length) { listBox.append(el('p', { class: 'muted', text: t('acc.none') })); return; }
    for (const r of shown) listBox.append(row(r));
  }
  search.addEventListener('input', debounce(load, 350));
  only.addEventListener('change', draw);
  await load();
  return shell.teardown;

  /* ------------------------------------------------------------ row */
  function row(r) {
    const seat = (r.roles || [])[0];
    const login = !r.has_login ? ['acc.noLogin', 'badge--exited']
      : r.banned ? ['acc.suspended', 'badge--exited']
      : !r.last_sign_in_at ? ['acc.neverIn', 'badge--paused']
      : ['acc.loginOk', 'badge--active'];
    const card = el('div', { class: 'card', style: 'margin-bottom:10px;padding:12px 14px;' });
    const initials = ((r.first_name || '?')[0] + (r.last_name || '')[0]).toUpperCase();
    const noPhoto = () => el('div', { class: 'acc-ava acc-ava--none', text: initials, title: t('acc.noPhoto') });
    let ava;
    if (r.has_login) {
      ava = withDriveFallback(el('img', { class: 'acc-ava', alt: '', src: avatarUrl(r.id, photoBust) }), { first_name: r.name.split(' ')[0], last_name: r.name.split(' ').slice(1).join(' ') }, noPhoto);
    } else {
      ava = noPhoto();
      drivePhotoFor(r.name, 160).then((u) => { if (u) { const im = el('img', { class: 'acc-ava', alt: '', src: u }); im.onerror = () => im.replaceWith(noPhoto()); ava.replaceWith(im); } }).catch(() => {});
    }
    const head = el('div', { class: 'row', style: 'gap:10px;align-items:flex-start;' }, [
      ava,
      el('div', { class: 'grow', style: 'min-width:220px;' }, [
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;' }, [
          el('b', { text: r.name }),
          flagSrc(countryIso(r.country)) ? el('img', { class: 'vs-flag vs-flag--sm', src: flagSrc(countryIso(r.country)), alt: r.country || '', width: '20', height: '15', onerror: (e) => e.target.remove() }) : null,
          el('span', { class: 'badge badge--pipeline', text: r.network || '' }),
          r.status ? el('span', { class: 'badge badge--neutral', text: t(`status.${r.status}`) }) : null,
          el('span', { class: `badge ${login[1]}`, text: t(login[0]) }),
          r.is_staff ? el('span', { class: 'badge badge--neutral', text: t('acc.staff') }) : null,
        ]),
        el('div', { class: 'muted', text: [r.email, r.phone, r.membership_no].filter(Boolean).join(' \u00B7 ') }),
        el('div', { class: 'muted', style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;' }, [
          el('span', { text: [r.network, r.country, r.state_region, r.lga,
            seat ? t(`role.${seat.role}`) : (r.role_applied || t('acc.noSeat'))].filter(Boolean).join(' | ') }),
          seat ? apptBadge(seat.appointment_status) : null,
          seat ? el('span', { text: `@ ${seat.unit}` }) : null,
          seat && seat.accepted_at === null && !seat.declined_at ? el('span', { class: 'vs-badge vs-badge--amber', text: t('acc.acceptPending') }) : null,
          seat && seat.accepted_at ? el('span', { class: 'muted', text: t('acc.acceptedOn', { d: fmtDate(seat.accepted_at) }) }) : null,
          onb[r.id] ? el('span', { class: `vs-badge vs-badge--${onb[r.id].done >= onb[r.id].total ? 'green' : 'amber'}`, text: t('acc.onboarding', { d: onb[r.id].done, n: onb[r.id].total }) }) : null,
          r.on_hold ? el('span', { class: 'vs-badge vs-badge--red', text: t('acc.onHold') }) : null,
        ]),
        el('div', { class: 'muted', text: r.has_login
          ? t('acc.signins', { last: r.last_sign_in_at ? fmtDateTime(r.last_sign_in_at) : t('acc.never'),
              seen: r.last_seen_at ? fmtDateTime(r.last_seen_at) : t('acc.never') })
          : t('acc.directoryOnly') }),
      ]),
    ]);
    const acts = el('div', { class: 'row', style: 'gap:6px;margin-top:8px;' });
    if (!r.has_login) {
      acts.append(btn(t('acc.createLogin'), 'btn--primary', () => createModal(r)));
    } else {
      acts.append(
        el('a', { href: `#/view-as/${r.id}`, class: 'btn btn--primary', text: t('acc.viewAs') }),
        btn(t('acc.photo'), 'btn--secondary', () => photoModal(r)),
        btn(t('acc.edit'), 'btn--secondary', () => editModal(r)),
        btn(t('acc.seat'), 'btn--secondary', () => seatModal(r)),
        ...((r.roles || []).some((x) => ['super_admin', 'executive_director', 'hq_team'].includes(x.role)) ? [btn(t('acc.fnBtn'), 'btn--secondary', () => hqFunctionModal(r))] : []),
        btn(t('acc.status'), 'btn--secondary', () => statusModal(r)),
        btn(t('acc.resetPw'), 'btn--quiet', () => resetModal(r)),
        btn(t('acc.email'), 'btn--quiet', () => emailModal(r)),
        btn(r.banned ? t('acc.restore') : t('acc.suspend'), 'btn--quiet', () => banToggle(r)),
        btn(t('acc.delete'), 'btn--quiet', () => deleteModal(r)),
      );
    }
    card.append(head, acts);
    return card;
  }
  function btn(label, cls, onclick) {
    return el('button', { class: `btn ${cls}`, text: label, onclick });
  }
  // Function declaration on purpose: it is used by handlers that run after
  // render() has returned, so it must be hoisted (a const here would sit in
  // the temporal dead zone forever, which is exactly the v65.0 CONVENING bug).
  function needFn() {
    // only a function that does not exist blocks; anything else is worth trying
    if (fnOk === false) { toastError(t('acc.fnMissingShort')); return false; }
    return true;
  }

  /* ------------------------------------------------------------ photo */
  function photoModal(r) {
    const preview = el('img', { class: 'acc-photo', alt: '', src: avatarUrl(r.id, photoBust),
      onerror: (e) => { e.target.style.display = 'none'; none.hidden = false; } });
    const none = el('p', { class: 'muted', hidden: true, text: t('acc.noPhoto') });
    const file = el('input', { type: 'file', accept: 'image/*', hidden: true });
    const err = el('p', { class: 'field__error', role: 'alert', hidden: true });
    const pick = el('button', { class: 'btn btn--primary', text: t('acc.choosePhoto'), onclick: () => file.click() });
    const remove = el('button', { class: 'btn btn--quiet', text: t('acc.removePhoto'), onclick: async () => {
      if (!confirm(t('acc.removePhotoConfirm', { name: r.name }))) return;
      remove.disabled = true;
      try {
        const { error } = await db().storage.from('avatars').remove([r.id]);
        if (error) throw error;
        photoBust = Date.now(); closeModal(); toast(t('acc.photoRemoved')); draw();
      } catch (e) { err.textContent = e?.message || t('errors.save'); err.hidden = false; remove.disabled = false; }
    } });
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0]; if (!f) return;
      if (!/^image\//.test(f.type)) { err.textContent = t('acc.photoType'); err.hidden = false; return; }
      if (f.size > 5 * 1024 * 1024) { err.textContent = t('acc.photoSize'); err.hidden = false; return; }
      err.hidden = true; pick.disabled = true; pick.textContent = t('app.saving');
      try {
        await uploadAvatar(r.id, f);
        photoBust = Date.now(); closeModal(); toast(t('acc.photoSaved', { name: r.name })); draw();
      } catch (e) {
        err.textContent = e?.message || t('errors.save'); err.hidden = false;
        pick.disabled = false; pick.textContent = t('acc.choosePhoto');
      }
    });
    openModal(t('acc.photoFor', { name: r.name }), el('div', {}, [
      el('p', { class: 'muted', text: t('acc.photoHint') }),
      el('div', { class: 'row', style: 'gap:14px;align-items:center;' }, [preview, none]),
      file, err,
      el('div', { class: 'row', style: 'margin-top:12px;' }, [remove, el('span', { class: 'grow' }), pick]),
    ]));
  }

  /* ------------------------------------------------------------ create */
  function createModal(pre) {
    if (!needFn()) return;
    const v = (k) => (pre && pre[k]) || '';
    const first = el('input', { class: 'input', value: v('first_name') });
    const last = el('input', { class: 'input', value: v('last_name') });
    const email = el('input', { class: 'input', type: 'email', value: v('email') });
    const phone = el('input', { class: 'input', value: v('phone') });
    const network = sel(['WGMN', 'WNNN'], v('network') || 'WGMN');
    const country = sel(AFRICAN_COUNTRIES, v('country'), true);
    const state = el('input', { class: 'input', value: v('state_region'), list: 'acc-states' });
    const lga = el('input', { class: 'input', value: v('lga') });
    const roleApplied = positionSelect(v('role_applied'));
    const code = el('input', { class: 'input', value: v('membership_no'), placeholder: t('acc.codePh') });
    const isLeader = el('input', { type: 'checkbox', checked: pre ? !!pre.is_leader : true });
    const pw = el('input', { class: 'input', placeholder: t('acc.pwAuto'), autocomplete: 'off' });
    const seatRole = sel(['', ...ROLES.filter((x) => !['super_admin', 'executive_director', 'hq_team'].includes(x))], '', false,
      (x) => (x ? t(`role.${x}`) : t('acc.noSeatYet')));
    const seatUnit = unitPicker();
    const err = el('p', { class: 'field__error', role: 'alert', hidden: true });
    const go = el('button', { class: 'btn btn--primary', text: t('acc.createLoginGo') });
    go.addEventListener('click', async () => {
      err.hidden = true;
      if (!first.value.trim() || !last.value.trim()) { err.textContent = t('acc.needNames'); err.hidden = false; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) { err.textContent = t('acc.needEmail'); err.hidden = false; return; }
      if (pw.value && pw.value.length < 8) { err.textContent = t('acct.errShort'); err.hidden = false; return; }
      if (seatRole.value && !seatUnit.value()) { err.textContent = t('acc.needUnit'); err.hidden = false; return; }
      go.disabled = true;
      try {
        const res = await adminUsers('create', {
          email: email.value.trim(), password: pw.value || undefined,
          first_name: first.value.trim(), last_name: last.value.trim(),
          network: network.value, phone: phone.value.trim(),
          country: country.value, state_region: state.value.trim(), lga: lga.value.trim(),
          role_applied: roleApplied.value.trim(), is_leader: isLeader.checked,
          member_code: code.value.trim(),
        });
        const notes = [];
        if (pre && !pre.has_login && pre.membership_no) {
          try { await hqLinkDirectory(res.id, pre.membership_no); notes.push(t('acc.linkedDirectory')); }
          catch (e) { notes.push(t('acc.linkFailed', { why: e?.message || '' })); }
        }
        if (seatRole.value) {
          try { await hqSetRole(res.id, seatRole.value, seatUnit.value()); notes.push(t('acc.seated')); }
          catch (e) { notes.push(t('acc.seatFailed', { why: e?.message || '' })); }
        }
        closeModal();
        credentialsModal(`${first.value.trim()} ${last.value.trim()}`, res.email, res.temp_password, notes);
        await load();
      } catch (e) {
        err.textContent = e?.code === 'email_exists' ? t('acc.emailExists')
          : (e?.message || t('errors.save'));
        err.hidden = false; go.disabled = false;
      }
    });
    openModal(pre ? t('acc.createLoginFor', { name: pre.name }) : t('acc.addLeader'), el('div', {}, [
      el('p', { class: 'muted', text: t('acc.createHint') }),
      el('div', { class: 'form-grid' }, [
        field(t('v.firstName'), first), field(t('v.lastName'), last),
        field(t('v.email'), email), field(t('v.phone'), phone),
        field(t('v.network'), network), field(t('v.country'), country),
        field(t('v.state'), state), field(t('v.lga'), lga),
        field(t('v.roleApplied'), roleApplied), field(t('acc.code'), code),
        field(t('acc.tempPw'), pw),
        el('label', { class: 'field row', style: 'gap:8px;align-items:center;padding-top:26px;' },
          [isLeader, el('span', { text: t('acc.isLeader') })]),
      ]),
      el('h3', { class: 'mt-4', text: t('acc.seatHeading') }),
      el('div', { class: 'form-grid' }, [field(t('acc.role'), seatRole), field(t('acc.unit'), seatUnit.node)]),
      datalistStates(),
      err, el('div', { class: 'row' }, [el('span', { class: 'grow' }), go]),
    ]));
  }

  function credentialsModal(name, email, password, notes) {
    const pwBox = el('code', { style: 'font-size:20px;letter-spacing:1px;user-select:all;', text: password });
    const copy = el('button', { class: 'btn btn--secondary', text: t('acc.copy'), onclick: async () => {
      try { await navigator.clipboard.writeText(`WDOS login\n${email}\n${password}\nhttps://woddicrm.org`); toast(t('acc.copied')); }
      catch { toastError(t('errors.save')); }
    } });
    openModal(t('acc.credTitle'), el('div', {}, [
      el('p', { text: t('acc.credFor', { name }) }),
      el('div', { class: 'card', style: 'background:var(--green-tint);' }, [
        el('div', { class: 'muted', text: t('v.email') }), el('b', { text: email }),
        el('div', { class: 'muted mt-4', text: t('acc.tempPw') }), pwBox,
      ]),
      el('p', { class: 'muted', text: t('acc.credOnce') }),
      notes && notes.length ? el('ul', { class: 'vs-list' }, notes.map((n) => el('li', { text: n }))) : null,
      el('div', { class: 'row' }, [copy, el('span', { class: 'grow' }),
        el('button', { class: 'btn btn--primary', text: t('acc.done'), onclick: closeModal })]),
    ]));
  }

  /* ------------------------------------------------------------ edit */
  function editModal(r) {
    const first = el('input', { class: 'input', value: r.first_name || '' });
    const last = el('input', { class: 'input', value: r.last_name || '' });
    const phone = el('input', { class: 'input', value: r.phone || '' });
    const network = sel(['WGMN', 'WNNN'], r.network || 'WGMN');
    const country = sel(AFRICAN_COUNTRIES, r.country || '', true);
    const state = el('input', { class: 'input', value: r.state_region || '', list: 'acc-states' });
    const lga = el('input', { class: 'input', value: r.lga || '' });
    const roleApplied = positionSelect(r.role_applied);
    const code = el('input', { class: 'input', value: r.membership_no || '' });
    const isLeader = el('input', { type: 'checkbox', checked: !!r.is_leader });
    const err = el('p', { class: 'field__error', role: 'alert', hidden: true });
    const go = el('button', { class: 'btn btn--primary', text: t('acc.save') });
    go.addEventListener('click', async () => {
      go.disabled = true;
      try {
        await hqUpdateProfile(r.id, {
          first_name: first.value.trim(), last_name: last.value.trim(),
          phone: phone.value.trim(), network: network.value, country: country.value,
          state_region: state.value.trim(), lga: lga.value.trim(),
          role_applied: roleApplied.value.trim(), is_leader: isLeader.checked,
          membership_no: code.value.trim(),
        });
        closeModal(); toast(t('acc.saved')); await load();
      } catch (e) { err.textContent = e?.message || t('errors.save'); err.hidden = false; go.disabled = false; }
    });
    openModal(t('acc.editFor', { name: r.name }), el('div', {}, [
      el('div', { class: 'form-grid' }, [
        field(t('v.firstName'), first), field(t('v.lastName'), last),
        field(t('v.phone'), phone), field(t('v.network'), network),
        field(t('v.country'), country), field(t('v.state'), state),
        field(t('v.lga'), lga), field(t('v.roleApplied'), roleApplied),
        field(t('acc.code'), code),
        el('label', { class: 'field row', style: 'gap:8px;align-items:center;padding-top:26px;' },
          [isLeader, el('span', { text: t('acc.isLeader') })]),
      ]),
      datalistStates(), err,
      el('div', { class: 'row' }, [el('span', { class: 'grow' }), go]),
    ]));
  }

  /* ------------------------------------------------------------ seat */
  function seatModal(r) {
    const seat = (r.roles || [])[0];
    const role = sel(ROLES, seat ? seat.role : 'country_rep', false, (x) => t(`role.${x}`));
    const unit = unitPicker(seat ? seat.unit_id : null);
    const appt = sel(APPT, (seat && seat.appointment_status) || 'appointed', false, (x) => t(`st.status_${x}`));
    const err = el('p', { class: 'field__error', role: 'alert', hidden: true });
    const go = el('button', { class: 'btn btn--primary', text: t('acc.seatGo') });
    go.addEventListener('click', async () => {
      if (!unit.value()) { err.textContent = t('acc.needUnit'); err.hidden = false; return; }
      go.disabled = true;
      try { await hqSetRole(r.id, role.value, unit.value(), appt.value); closeModal(); toast(t('acc.seated')); await load(); }
      catch (e) { err.textContent = e?.message || t('errors.save'); err.hidden = false; go.disabled = false; }
    });
    const end = el('button', { class: 'btn btn--quiet', text: t('acc.unseat'), onclick: async () => {
      if (!confirm(t('acc.unseatConfirm', { name: r.name }))) return;
      try { await hqEndRoles(r.id); closeModal(); toast(t('acc.unseated')); await load(); }
      catch (e) { toastError(e?.message || t('errors.save')); }
    } });
    openModal(t('acc.seatFor', { name: r.name }), el('div', {}, [
      el('p', { class: 'muted', text: seat
        ? t('acc.currentSeat', { role: t(`role.${seat.role}`), unit: seat.unit })
        : t('acc.noSeat') }),
      el('p', { class: 'muted', text: t('acc.seatHint') }),
      el('div', { class: 'form-grid' }, [field(t('acc.role'), role), field(t('acc.unit'), unit.node),
        field(t('st.appointment'), appt)]),
      err,
      el('div', { class: 'row' }, [seat ? end : null,
        seat ? el('button', { class: 'btn btn--secondary', text: t('acc.apptOnly'), onclick: async () => {
          try { await hqSetAppointment(r.id, appt.value); closeModal(); toast(t('acc.apptSaved')); await load(); }
          catch (e) { err.textContent = e?.message || t('errors.save'); err.hidden = false; }
        } }) : null,
        el('span', { class: 'grow' }), go]),
    ]));
  }

  /* ------------------------------------------------------------ status */
  function statusModal(r) {
    const status = sel(STATUSES, r.status || 'active', false, (x) => t(`status.${x}`));
    const err = el('p', { class: 'field__error', role: 'alert', hidden: true });
    const go = el('button', { class: 'btn btn--primary', text: t('acc.statusGo') });
    go.addEventListener('click', async () => {
      go.disabled = true;
      try { const res = await hqSetStatus(r.id, status.value); closeModal(); toast(t('acc.statusDone', { res })); await load(); }
      catch (e) { err.textContent = e?.message || t('errors.save'); err.hidden = false; go.disabled = false; }
    });
    openModal(t('acc.statusFor', { name: r.name }), el('div', {}, [
      el('p', { class: 'muted', text: t('acc.statusHint') }),
      field(t('acc.status'), status), err,
      el('div', { class: 'row' }, [el('span', { class: 'grow' }), go]),
    ]));
  }

  /* ------------------------------------------------------------ auth side */
  function resetModal(r) {
    if (!needFn()) return;
    const pw = el('input', { class: 'input', placeholder: t('acc.pwAuto'), autocomplete: 'off' });
    const err = el('p', { class: 'field__error', role: 'alert', hidden: true });
    const go = el('button', { class: 'btn btn--primary', text: t('acc.resetGo') });
    go.addEventListener('click', async () => {
      if (pw.value && pw.value.length < 8) { err.textContent = t('acct.errShort'); err.hidden = false; return; }
      go.disabled = true;
      try {
        const res = await adminUsers('set_password', { id: r.id, password: pw.value || undefined });
        closeModal(); credentialsModal(r.name, r.email, res.temp_password, [t('acc.resetNote')]);
      } catch (e) { err.textContent = e?.message || t('errors.save'); err.hidden = false; go.disabled = false; }
    });
    openModal(t('acc.resetFor', { name: r.name }), el('div', {}, [
      el('p', { class: 'muted', text: t('acc.resetHint') }),
      field(t('acc.tempPw'), pw), err,
      el('div', { class: 'row' }, [el('span', { class: 'grow' }), go]),
    ]));
  }

  function emailModal(r) {
    if (!needFn()) return;
    const email = el('input', { class: 'input', type: 'email', value: r.email || '' });
    const err = el('p', { class: 'field__error', role: 'alert', hidden: true });
    const go = el('button', { class: 'btn btn--primary', text: t('acc.emailGo') });
    go.addEventListener('click', async () => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) { err.textContent = t('acc.needEmail'); err.hidden = false; return; }
      go.disabled = true;
      try { await adminUsers('set_email', { id: r.id, email: email.value.trim() }); closeModal(); toast(t('acc.emailDone')); await load(); }
      catch (e) {
        err.textContent = e?.code === 'email_exists' ? t('acc.emailExists') : (e?.message || t('errors.save'));
        err.hidden = false; go.disabled = false;
      }
    });
    openModal(t('acc.emailFor', { name: r.name }), el('div', {}, [
      el('p', { class: 'muted', text: t('acc.emailHint') }),
      field(t('v.email'), email), err,
      el('div', { class: 'row' }, [el('span', { class: 'grow' }), go]),
    ]));
  }

  async function banToggle(r) {
    if (!needFn()) return;
    const on = !r.banned;
    if (!confirm(on ? t('acc.suspendConfirm', { name: r.name }) : t('acc.restoreConfirm', { name: r.name }))) return;
    try {
      await adminUsers('ban', { id: r.id, on });
      toast(on ? t('acc.suspendedDone') : t('acc.restoredDone'));
      await load();
    } catch (e) { toastError(e?.code === 'protected_account' ? t('acc.protected') : (e?.message || t('errors.save'))); }
  }

  function deleteModal(r) {
    if (!needFn()) return;
    const word = el('input', { class: 'input', placeholder: 'DELETE', autocomplete: 'off' });
    const err = el('p', { class: 'field__error', role: 'alert', hidden: true });
    const go = el('button', { class: 'btn btn--primary', style: 'background:var(--danger);', text: t('acc.deleteGo') });
    go.addEventListener('click', async () => {
      if (word.value.trim() !== 'DELETE') { err.textContent = t('acc.deleteType'); err.hidden = false; return; }
      go.disabled = true;
      try { await adminUsers('delete', { id: r.id }); closeModal(); toast(t('acc.deleted')); await load(); }
      catch (e) {
        err.textContent = e?.code === 'protected_account' ? t('acc.protected')
          : t('acc.deleteFailed', { why: e?.message || '' });
        err.hidden = false; go.disabled = false;
      }
    });
    openModal(t('acc.deleteFor', { name: r.name }), el('div', {}, [
      el('p', { text: t('acc.deleteHint') }),
      el('p', { class: 'muted', text: t('acc.deleteAlt') }),
      field(t('acc.deleteWord'), word), err,
      el('div', { class: 'row' }, [el('span', { class: 'grow' }), go]),
    ]));
  }

  /* ------------------------------------------------------------ pickers */
  function unitPicker(preset) {
    const input = el('input', { class: 'input', placeholder: t('acc.unitPh'), autocomplete: 'off' });
    const list = el('div', { class: 'acc-units', hidden: true });
    let chosen = preset || null;
    const wrap = el('div', { style: 'position:relative;' }, [input, list]);
    unitsP.then((u) => {
      if (chosen) { const hit = u.find((x) => x.id === chosen); if (hit) input.value = label(hit, u); }
    });
    const label = (x, all) => {
      const parent = all.find((p) => p.id === x.parent_id);
      return `${x.name} (${t(`v.lvl_${x.level}`)}${parent ? ' \u00B7 ' + parent.name : ''})`;
    };
    input.addEventListener('input', () => {
      chosen = null;
      const q = input.value.trim().toLowerCase();
      clear(list);
      if (!units || q.length < 2) { list.hidden = true; return; }
      const hits = units.filter((x) => x.name.toLowerCase().includes(q)).slice(0, 12);
      for (const x of hits) list.append(el('button', { class: 'acc-units__opt', text: label(x, units),
        onclick: () => { chosen = x.id; input.value = label(x, units); list.hidden = true; } }));
      list.hidden = hits.length === 0;
    });
    return { node: wrap, value: () => chosen };
  }
  /** Position Master List instead of a free-text title; an existing value
   *  that is not on the list is kept as one extra option so nothing is lost. */
  function positionSelect(cur) {
    const labels = POSITIONS.map((p) => t(`role.${p}`));
    const opts = [el('option', { value: '', text: t('acc.noPosition') })];
    for (const lb of labels) opts.push(el('option', { value: lb, text: lb, selected: lb === cur || null }));
    if (cur && !labels.includes(cur)) opts.push(el('option', { value: cur, text: `${cur} (${t('acc.legacyTitle')})`, selected: true }));
    return el('select', { class: 'select' }, opts);
  }
  function sel(opts, cur, blank = false, labelFn = null) {
    return el('select', { class: 'select' }, [
      blank ? el('option', { value: '', text: '\u2014' }) : null,
      ...opts.map((o) => el('option', { value: o, text: labelFn ? labelFn(o) : o,
        selected: o === cur || null })),
    ]);
  }
  function datalistStates() {
    return el('datalist', { id: 'acc-states' }, NG_STATES.map((s) => el('option', { value: s })));
  }
  function field(label, node) {
    return el('div', { class: 'field' }, [el('label', { class: 'field__label', text: label }), node]);
  }
}

// referenced for the icon set consistency check
export const __icons = icon;
export const __fmt = fmtDate;
