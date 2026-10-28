/**
 * WDOS — 14-Day Activation: candidates who passed (Phase 218).
 *
 * Regina asked for the people who passed the 14-Day Activation with their
 * name, email, phone, network, position applied for and location, and for
 * Reports to produce that list on demand as PDF, CSV and Excel. All three are
 * built here in the browser from activation_passed_export() (migration 171).
 *
 * Presentation only, the data is never changed: names and places get
 * consistent capitalisation, and phone numbers are shown in one
 * international format with the same digits. House rule: no em dashes.
 */

function loadVendor(src, globalName) {
  return new Promise((resolve, reject) => {
    if (window[globalName]) { resolve(window[globalName]); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(window[globalName]);
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(s);
  });
}

const noDash = (s) => String(s ?? '').replace(/\s*[–—]\s*/g, ', ');

/* ------------------------------------------------------------ tidy-up */
const ACRO = new Set(['LGA', 'LCDA', 'AMAC', 'KMC', 'FCT']);
const LETTERS = /[A-Za-zÀ-ÿ]/;
const core = (w) => w.replace(/[^A-Za-zÀ-ÿ]/g, '');
function seg(s, force) {
  if (ACRO.has(core(s).toUpperCase())) return s.toUpperCase();
  const c = core(s);
  let out = (force || c === c.toUpperCase() || c === c.toLowerCase()) ? s.toLowerCase() : s;
  const i = out.search(LETTERS);
  if (i >= 0) out = out.slice(0, i) + out[i].toUpperCase() + out.slice(i + 1);
  return out;
}
function wordCase(w) {
  const c = core(w);
  const force = c === c.toUpperCase() || c === c.toLowerCase();
  return w.split(/([-/])/).map((x) => (x === '-' || x === '/' ? x : seg(x, force))).join('');
}
export function tidy(s) {
  if (!s) return '';
  const t = String(s).trim().replace(/\(\s+/g, '(').replace(/\/\s+/g, '/').replace(/\.+$/, '');
  return t.split(/\s+/).map(wordCase).join(' ');
}

export function formatPhone(raw) {
  const p = String(raw || '').trim();
  if (!p) return '';
  let d = p.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) { /* already international */ }
  else if (d.startsWith('234') && d.length === 13) d = '+' + d;
  else if (d.startsWith('0') && d.length === 11) d = '+234' + d.slice(1);
  else if (d.length === 10 && /^[789]/.test(d)) d = '+234' + d;
  else return p;
  // A common slip: +234 followed by the local leading 0.
  if (/^\+2340\d{10}$/.test(d)) d = '+234' + d.slice(5);
  let m;
  if ((m = d.match(/^\+234(\d{3})(\d{3})(\d{4})$/))) return `+234 ${m[1]} ${m[2]} ${m[3]}`;
  if ((m = d.match(/^\+233(\d{2})(\d{3})(\d{4})$/))) return `+233 ${m[1]} ${m[2]} ${m[3]}`;
  if ((m = d.match(/^\+257(\d{2})(\d{2})(\d{2})(\d{2})$/))) return `+257 ${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  return d;
}

const SEAT = {
  country_rep: 'Country Representative',
  deputy_country_rep: 'Deputy Country Representative',
  state_coordinator: 'State Coordinator',
  assistant_state_coordinator: 'Assistant State Coordinator',
};
const seatLabel = (s) => (s ? SEAT[s] || tidy(String(s).replace(/_/g, ' ')) : '');

/** Clean, sorted rows: network, country, state, name. */
export function prepare(raw) {
  const order = { WGMN: 0, WNNN: 1 };
  const rows = (raw || []).map((x) => {
    const lga = tidy(x.lga);
    const state = tidy(x.state);
    const country = tidy(x.country);
    return {
      name: tidy(`${x.first_name || ''} ${x.last_name || ''}`),
      email: String(x.email || '').trim().toLowerCase(),
      phone: formatPhone(x.phone),
      network: x.network || '',
      position: x.role_applied || '',
      lga, state, country,
      location: [lga, state, country].filter(Boolean).join(', '),
      seat: seatLabel(x.seat),
      membership_no: x.membership_no || '',
    };
  });
  rows.sort((a, b) => ((order[a.network] ?? 9) - (order[b.network] ?? 9))
    || a.country.localeCompare(b.country) || a.state.localeCompare(b.state)
    || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  rows.forEach((r, i) => { r.no = i + 1; });
  return rows;
}

function counts(rows, key) {
  const m = new Map();
  rows.forEach((r) => { const k = r[key] || 'Not stated'; m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const todayLong = () => new Date().toLocaleDateString('en-GB',
  { day: 'numeric', month: 'long', year: 'numeric' });
const stamp = () => {   // local date, the same day the PDF says it was generated
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const BASENAME = 'WODDI-14Day-Activation-Passed-Candidates';
const TITLE = 'Candidates who passed the 14-Day Activation Journey';
const PASS_RULE = 'Passed means WDOS evaluated the journey as passed: all required '
  + 'tasks submitted, both gate days answered correctly, and an overall score of '
  + 'at least 50%.';

/* ------------------------------------------------------------ CSV */
export function buildCsv(rows) {
  const head = ['No', 'Name', 'Email', 'Phone', 'Network', 'Position applied for',
    'LGA', 'State', 'Country', 'Already holds a leadership seat'];
  const q = (v) => {
    const s = String(v ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head, ...rows.map((r) => [r.no, r.name, r.email, r.phone, r.network,
    r.position, r.lga, r.state, r.country, r.seat])].map((a) => a.map(q).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';   // BOM so Excel reads accents
}

function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

export async function downloadPassedCsv(raw) {
  const rows = prepare(raw);
  saveBlob(new Blob([buildCsv(rows)], { type: 'text/csv;charset=utf-8' }),
    `${BASENAME}-${stamp()}.csv`);
  return rows.length;
}

/* ------------------------------------------------------------ Excel */
export async function downloadPassedExcel(raw) {
  const XLSX = await loadVendor('/assets/vendor/xlsx.full.min.js', 'XLSX');
  const rows = prepare(raw);
  const head = ['No', 'Name', 'Email', 'Phone', 'Network', 'Position applied for',
    'LGA', 'State', 'Country', 'Already holds a leadership seat'];
  const aoa = [head, ...rows.map((r) => [r.no, r.name, r.email, r.phone, r.network,
    r.position, r.lga, r.state, r.country, r.seat])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Phones as text so Excel keeps the + and the spacing.
  rows.forEach((r, i) => {
    const ref = XLSX.utils.encode_cell({ r: i + 1, c: 3 });
    if (ws[ref]) { ws[ref].t = 's'; ws[ref].z = '@'; }
  });
  ws['!cols'] = [6, 30, 34, 20, 9, 36, 24, 18, 12, 30].map((wch) => ({ wch }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: head.length - 1 } }) };

  const sum = [
    [TITLE], ['Generated', todayLong()], ['Source', 'WDOS live database'], [],
    ['Candidates who passed', rows.length], [],
    ['By network', 'Number'], ...counts(rows, 'network'), [],
    ['By country', 'Number'], ...counts(rows, 'country'), [],
    ['By position applied for', 'Number'], ...counts(rows, 'position'), [],
    ['Already hold a leadership seat', rows.filter((r) => r.seat).length], [],
    ['How passed is decided', PASS_RULE],
    ['Confidential', 'Contains personal contact details, for WODDI internal use only.'],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(sum);
  ws2['!cols'] = [{ wch: 40 }, { wch: 60 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Passed candidates');
  XLSX.utils.book_append_sheet(wb, ws2, 'Summary');
  XLSX.writeFile(wb, `${BASENAME}-${stamp()}.xlsx`);
  return rows.length;
}

/* ------------------------------------------------------------ PDF */
const MAGENTA = [212, 0, 106];
const LEMON = [124, 181, 24];
const INK = [31, 26, 34];
const MUTED = [107, 100, 112];
const LINE = [230, 225, 232];
const ZEBRA_PINK = [251, 246, 249];
const ZEBRA_GREEN = [241, 248, 230];

/* The logo, scaled to print size first (the original is 963 px wide and
   would make the PDF about 1.6 MB). */
async function logoDataUrl() {
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i); i.onerror = reject;
      i.src = '/assets/woddi-logo.png';
    });
    const w = 288; const h = Math.round(w * (img.naturalHeight / img.naturalWidth));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);   // flatten transparency for JPEG
    g.drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.9);
  } catch { return null; }
}

export async function downloadPassedPdf(raw) {
  const { jsPDF } = await loadVendor('/assets/vendor/jspdf.umd.min.js', 'jspdf');
  const rows = prepare(raw);
  const logo = await logoDataUrl();
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const BOTTOM = H - 44;
  let y = 0;

  const stripe = () => {
    doc.setFillColor(...MAGENTA); doc.rect(0, 0, W, 4, 'F');
    doc.setFillColor(...LEMON); doc.rect(0, 4, W, 2, 'F');
  };
  const newPage = () => { doc.addPage(); stripe(); y = 30; };
  const text = (s, x, yy, opts) => doc.text(noDash(s), x, yy, opts);

  /* ---- header ---- */
  stripe();
  y = 26;
  if (logo) doc.addImage(logo, 'JPEG', M, y, 72, 30);
  else { doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...MAGENTA); text('WODDI', M, y + 22); }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...INK);
  text(TITLE, M + 86, y + 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  text(`Prepared for the Head of Field and Country Operations  ·  Source: WDOS live database, ${todayLong()}`, M + 86, y + 28);
  y += 46;

  /* ---- stat boxes ---- */
  const byNet = Object.fromEntries(counts(rows, 'network'));
  const byCountry = counts(rows, 'country');
  const boxes = [
    [String(rows.length), 'candidates passed', MAGENTA, 0.22],
    [String(byNet.WGMN || 0), 'WGMN', MAGENTA, 0.22],
    [String(byNet.WNNN || 0), 'WNNN', LEMON, 0.22],
    [String(byCountry.length), 'countries: ' + byCountry.map(([c, n]) => `${c} ${n}`).join('  ·  '), INK, 0.34],
  ];
  const BW = W - 2 * M;
  let bx = M;
  doc.setDrawColor(...LINE); doc.setFillColor(250, 248, 251);
  doc.rect(M, y, BW, 50, 'FD');
  boxes.forEach(([n, label, color, frac], i) => {
    const w = BW * frac;
    if (i) doc.line(bx, y, bx, y + 50);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.setTextColor(...color);
    text(n, bx + 10, y + 24);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(...MUTED);
    text(doc.splitTextToSize(noDash(label), w - 20)[0], bx + 10, y + 39);
    bx += w;
  });
  y += 64;

  /* ---- intro ---- */
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.6); doc.setTextColor(...INK);
  const intro = 'This list contains every candidate whose 14-Day Activation Journey is recorded as '
    + `passed in WDOS. ${PASS_RULE} It is sorted by network, then country, state and name. `
    + 'Positions are each candidate\'s own latest choice on their WDOS profile. Phone numbers are '
    + 'shown in international format so they can be dialled or saved to WhatsApp directly.';
  const introLines = doc.splitTextToSize(noDash(intro), BW);
  doc.text(introLines, M, y); y += introLines.length * 11 + 10;

  /* ---- summary by position ---- */
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...INK);
  text('Summary by position applied for', M, y); y += 12;
  const pos = counts(rows, 'position');
  const half = Math.ceil(pos.length / 2);
  const colW = BW * 0.42;
  doc.setFontSize(7.8);
  doc.setFont('helvetica', 'bold');
  [[M, 'Position applied for'], [M + colW + 30, 'Position applied for']].forEach(([x, l]) => {
    text(l, x + 2, y + 8); text('No.', x + colW - 2, y + 8, { align: 'right' });
  });
  doc.setDrawColor(...INK); doc.setLineWidth(0.7);
  doc.line(M, y + 11, M + colW, y + 11); doc.line(M + colW + 30, y + 11, M + 2 * colW + 30, y + 11);
  y += 13;
  doc.setFont('helvetica', 'normal'); doc.setLineWidth(0.35); doc.setDrawColor(...LINE);
  for (let i = 0; i < half; i += 1) {
    [[M, pos[i]], [M + colW + 30, pos[i + half]]].forEach(([x, p]) => {
      if (!p) return;
      text(p[0], x + 2, y + 9); text(String(p[1]), x + colW - 2, y + 9, { align: 'right' });
      doc.line(x, y + 13, x + colW, y + 13);
    });
    y += 14;
  }
  y += 14;

  /* ---- tables, one per network ---- */
  const cols = [['#', 22], ['Name', 132], ['Email', 162], ['Phone', 92], ['Network', 44],
    ['Position applied for', 148], ['Location (LGA, State, Country)', BW - 600]];
  const drawHead = (accent) => {
    doc.setFillColor(...accent); doc.rect(M, y, BW, 16, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.6); doc.setTextColor(255, 255, 255);
    let cx = M;
    cols.forEach(([l, w]) => { text(l, cx + 4, y + 11); cx += w; });
    y += 16;
  };
  const nets = [...new Set(rows.map((r) => r.network))];
  nets.forEach((net) => {
    const group = rows.filter((r) => r.network === net);
    const accent = net === 'WNNN' ? LEMON : MAGENTA;
    const zebra = net === 'WNNN' ? ZEBRA_GREEN : ZEBRA_PINK;
    const groupH = 40 + group.length * 16;
    if (group.length <= 25 && y + groupH > BOTTOM) newPage();
    else if (y + 60 > BOTTOM) newPage();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...INK);
    text(net, M, y + 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
    text(`${group.length} candidates`, M + doc.getTextWidth(net) * 12 / 8.5 + 8, y + 10);
    y += 18;
    drawHead(accent);
    group.forEach((r, idx) => {
      doc.setFontSize(7.6);
      const cells = [String(r.no), r.name + (r.seat ? ' *' : ''), r.email, r.phone, r.network, r.position, r.location];
      const wrapped = cells.map((c, i) => doc.splitTextToSize(noDash(c), cols[i][1] - 8));
      const lines = Math.max(...wrapped.map((w) => w.length));
      const rh = lines * 9 + 7;
      if (y + rh > BOTTOM) { newPage(); drawHead(accent); }
      if (idx % 2 === 1) { doc.setFillColor(...zebra); doc.rect(M, y, BW, rh, 'F'); }
      let cx = M;
      wrapped.forEach((w, i) => {
        doc.setFont('helvetica', i === 1 ? 'bold' : 'normal');
        doc.setTextColor(...(i === 0 ? MUTED : INK));
        if (i === 1 && r.seat) doc.setTextColor(...INK);
        doc.text(w, cx + 4, y + 10);
        cx += cols[i][1];
      });
      doc.setDrawColor(...LINE); doc.setLineWidth(0.35); doc.line(M, y + rh, M + BW, y + rh);
      y += rh;
    });
    y += 16;
  });

  /* ---- notes ---- */
  const seats = rows.filter((r) => r.seat);
  const notes = [];
  if (seats.length) {
    notes.push(['* Already holds a leadership seat (' + seats.length + ').',
      seats.map((r) => `${r.name} (${r.seat})`).join(', ') + '.']);
  }
  notes.push(['How passed is decided.', PASS_RULE]);
  notes.push(['Phone numbers.', 'Candidates typed their numbers in different ways (with or without +234, '
    + 'with a leading 0, or with spaces). They are shown here in one international format; the digits '
    + 'are unchanged. Name capitalisation has been made consistent for the same reason.']);
  doc.setFontSize(8);
  const noteBlocks = notes.map(([h, b]) => doc.splitTextToSize(noDash(`${h} ${b}`), BW));
  const notesH = 20 + noteBlocks.reduce((a, l) => a + l.length * 10.5 + 5, 0);
  if (y + notesH > BOTTOM) newPage();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...INK);
  text('Notes', M, y + 8); y += 18;
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK);
  noteBlocks.forEach((lines) => { doc.text(lines, M, y + 6); y += lines.length * 10.5 + 5; });

  /* ---- footer on every page ---- */
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.6); doc.line(M, H - 32, W - M, H - 32);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
    text('WODDI  ·  ' + TITLE + '  ·  Confidential: contains personal contact details, for WODDI internal use only', M, H - 20);
    text(`Page ${i} of ${n}`, W - M, H - 20, { align: 'right' });
  }
  doc.save(`${BASENAME}-${stamp()}.pdf`);
  return rows.length;
}
