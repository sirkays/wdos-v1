import { el } from './dom.js';
/**
 * Phase 163 — profile pictures served straight from the HQ Google Drive
 * folder when a leader has not uploaded one in WDOS. The mapping
 * (assets/leader-photos.json) pairs each listed leader with her Drive file;
 * the picture is shown through Drive's thumbnail endpoint, which works for
 * files the folder shares as "anyone with the link can view". No download or
 * upload is needed on HQ's side. An uploaded WDOS photo always wins.
 */
let table = null;
async function load() {
  if (table) return table;
  try { table = await (await fetch('/assets/leader-photos.json', { cache: 'force-cache' })).json(); }
  catch { table = { byName: {}, tokens: {} }; }
  return table;
}
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const words = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
export function driveThumb(id, size = 320) { return `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`; }
/** Drive photo URL for a person, or null. Accepts a profile-like object or a full name. */
export async function drivePhotoFor(p, size = 320) {
  const t = await load();
  const full = typeof p === 'string' ? p : `${p?.first_name || ''} ${p?.last_name || ''}`;
  // Phase 180: the headshots Azeez supplied are bundled in /assets/leaders/ and win over the Drive thumbnail
  const local = t.local || {};
  const id = t.byName[norm(full)];
  if (id) return local[id] ? `/assets/leaders/${local[id]}` : driveThumb(id, size);
  const w = words(full);
  if (w.length < 2) return null;
  for (const [fid, tw] of Object.entries(t.tokens || {})) {
    const hits = w.filter((x) => tw.includes(x));
    if (hits.length >= 2) return local[fid] ? `/assets/leaders/${local[fid]}` : driveThumb(fid, size);
  }
  for (const e of t.localExtra || []) {
    const hits = w.filter((x) => e.tokens.includes(x));
    if (hits.length >= 2) return `/assets/leaders/${e.file}`;
  }
  return null;
}
/** Wire an <img>: if the WDOS avatar fails, try the Drive photo, then initials. */
/** Phase 179: a round avatar for a person we only know by name (attention items, tables).
 *  Starts as initials, swaps to the HQ Drive photo when the name is in the map. */
export function driveAvatarByName(name, cls = 'ava-name') {
  const parts = String(name || '').trim().split(/\s+/);
  const initials = ((parts[0] || '?')[0] + (parts[1] || '')[0]).toUpperCase();
  const disc = el('div', { class: cls, text: initials, title: name || '' });
  if (parts.length >= 2) drivePhotoFor(name, 160).then((url) => {
    if (!url) return;
    const img = el('img', { class: cls, alt: '', src: url, title: name || '' });
    img.onerror = () => { img.replaceWith(disc); };
    disc.replaceWith(img);
  }).catch(() => {});
  return disc;
}
export function withDriveFallback(img, p, initialsNode) {
  img.onerror = async () => {
    img.onerror = () => { img.replaceWith(initialsNode()); };
    const url = await drivePhotoFor(p, 320);
    if (url) img.src = url; else img.replaceWith(initialsNode());
  };
  return img;
}
