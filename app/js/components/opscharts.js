/* ---------------------------------------------------------------------------
 * Phase 211: small SVG charts (opscharts.js; the original charts.js with donut/bars/line stays untouched for the Reports page) for the Operations Centre and the PDF reports.
 * No library. Specs: bars <= 24px thick with a 4px rounded data end, 2px gap
 * between touching marks, hairline recessive grid, text in ink tokens (never
 * the series colour), a hover title on every mark, one axis only.
 * Series colours: magenta (primary), green-deep (second series). Status bands
 * always carry a text label, never colour alone.
 * ------------------------------------------------------------------------- */
import { el } from '../core/dom.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, kids = []) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v)); for (const c of [].concat(kids)) if (c != null) n.append(c); return n; };
const title = (txt) => s('title', {}, [document.createTextNode(txt)]);
export const COLORS = { primary: '#d4006a', second: '#5e8a11', grid: '#e4e4e8', ink: '#131316', ink2: '#45454d', ink3: '#77777f' };
export const STATUS = { good: '#2e7d32', warn: '#b96a00', serious: '#d4570f', critical: '#c22030' };
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString());

/* rounded-end bar path: square at the baseline, 4px radius at the data end */
function hbarPath(x, y, w, h, r = 4) { if (w <= 0) return ''; r = Math.min(r, w, h / 2); return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`; }
function vbarPath(x, y, w, h, r = 4) { if (h <= 0) return ''; r = Math.min(r, h, w / 2); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; }

/** Horizontal bars: rows [{label, value, sub?}], one series. */
export function hbars(rows, { width = 520, color = COLORS.primary, max = null, suffix = '', labelW = 170 } = {}) {
  const bh = 18, gap = 10, top = 4; const h = top + rows.length * (bh + gap);
  const mx = max ?? Math.max(1, ...rows.map((r) => Number(r.value || 0)));
  const plotW = width - labelW - 56;
  const svg = s('svg', { viewBox: `0 0 ${width} ${Math.max(h, 24)}`, class: 'wd-chart', role: 'img' });
  rows.forEach((r, i) => {
    const y = top + i * (bh + gap); const v = Number(r.value || 0); const w = Math.round((v / mx) * plotW);
    svg.append(s('text', { x: labelW - 8, y: y + bh / 2 + 4, 'text-anchor': 'end', class: 'wd-chart__lbl' }, [document.createTextNode(truncate(r.label, Math.max(12, Math.floor((labelW - 12) / 6.1))))]));
    svg.append(s('rect', { x: labelW, y, width: plotW, height: bh, fill: COLORS.grid, opacity: 0.35, rx: 3 }));
    const bar = s('path', { d: hbarPath(labelW, y, Math.max(v ? 3 : 0, w), bh), fill: r.color || color, class: 'wd-chart__mark' }, [title(`${r.label}: ${fmt(v)}${suffix}${r.sub ? ' · ' + r.sub : ''}`)]);
    svg.append(bar);
    svg.append(s('text', { x: labelW + Math.max(w, 0) + 6, y: y + bh / 2 + 4, class: 'wd-chart__val' }, [document.createTextNode(fmt(v) + suffix)]));
  });
  return svg;
}

/** Columns over time: points [{label, value}], one series; labels the last and the peak only. */
export function columns(points, { width = 560, height = 170, color = COLORS.primary, suffix = '' } = {}) {
  const padL = 30, padB = 22, padT = 16; const n = Math.max(points.length, 1);
  const mx = Math.max(1, ...points.map((p) => Number(p.value || 0)));
  const plotW = width - padL - 6, plotH = height - padB - padT; const slot = plotW / n; const bw = Math.min(24, Math.max(3, slot - 2));
  const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, class: 'wd-chart', role: 'img' });
  for (const f of [0, 0.5, 1]) { const y = padT + plotH - f * plotH; svg.append(s('line', { x1: padL, x2: width - 6, y1: y, y2: y, stroke: COLORS.grid, 'stroke-width': 1 })); svg.append(s('text', { x: padL - 5, y: y + 3, 'text-anchor': 'end', class: 'wd-chart__axis' }, [document.createTextNode(fmt(Math.round(mx * f)))])); }
  let peak = 0; points.forEach((p, i) => { if (Number(p.value || 0) > Number(points[peak]?.value || 0)) peak = i; });
  points.forEach((p, i) => {
    const v = Number(p.value || 0); const hgt = Math.round((v / mx) * plotH); const x = padL + i * slot + (slot - bw) / 2; const y = padT + plotH - hgt;
    svg.append(s('rect', { x: padL + i * slot, y: padT, width: slot, height: plotH, fill: 'transparent', class: 'wd-chart__hit' }, [title(`${p.label}: ${fmt(v)}${suffix}`)]));
    if (v) svg.append(s('path', { d: vbarPath(x, y, bw, Math.max(hgt, 2)), fill: color, class: 'wd-chart__mark' }, [title(`${p.label}: ${fmt(v)}${suffix}`)]));
    if ((i === peak || i === points.length - 1) && v) svg.append(s('text', { x: x + bw / 2, y: y - 4, 'text-anchor': 'middle', class: 'wd-chart__val' }, [document.createTextNode(fmt(v))]));
  });
  const every = Math.ceil(n / 6);
  points.forEach((p, i) => { if (i % every === 0 || i === n - 1) svg.append(s('text', { x: padL + i * slot + slot / 2, y: height - 6, 'text-anchor': 'middle', class: 'wd-chart__axis' }, [document.createTextNode(p.label)])); });
  return svg;
}

/** One stacked bar of parts [{label, value, color}] with a labelled legend under it (status / distribution). */
export function stack(parts, { width = 560 } = {}) {
  const total = parts.reduce((a, p) => a + Number(p.value || 0), 0) || 1; const h = 22;
  const svg = s('svg', { viewBox: `0 0 ${width} ${h}`, class: 'wd-chart', role: 'img' });
  let x = 0; const nonzero = parts.filter((p) => Number(p.value || 0) > 0);
  nonzero.forEach((p, i) => {
    const w = (Number(p.value) / total) * width; const gap = i < nonzero.length - 1 ? 2 : 0;
    svg.append(s('rect', { x, y: 0, width: Math.max(1, w - gap), height: h, fill: p.color, rx: i === 0 || i === nonzero.length - 1 ? 4 : 0, class: 'wd-chart__mark' }, [title(`${p.label}: ${fmt(p.value)} (${Math.round(100 * p.value / total)}%)`)]));
    x += w;
  });
  const legend = el('div', { class: 'wd-legend' }, parts.map((p) => el('span', { class: 'wd-legend__i' }, [el('i', { style: `background:${p.color}` }), el('span', { text: `${p.label} ` }), el('b', { text: `${fmt(p.value)} (${Math.round(100 * Number(p.value || 0) / total)}%)` })])));
  return el('div', { class: 'wd-stack' }, [svg, legend]);
}

/** A 0-100 gauge meter row (stat with a bar), for rates. */
export function meter(label, pct, note) {
  const v = Math.max(0, Math.min(100, Number(pct || 0)));
  return el('div', { class: 'wd-meter' }, [el('div', { class: 'wd-meter__top' }, [el('span', { text: label }), el('b', { text: `${Math.round(v)}%` })]),
    el('div', { class: 'wd-meter__bar' }, [el('span', { style: `width:${v}%` })]), note ? el('small', { class: 'muted', text: note }) : null]);
}

function truncate(t, n) { t = String(t ?? ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
