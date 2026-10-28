/**
 * WODDI Rooms v3 — Phase 59. Calls live INSIDE WDOS again: the open-source
 * call engine is embedded in our shell from a community server with no
 * demo limit (configurable in Settings → Call engine; a self-hosted server
 * slots into the same dial later). Includes the ring system, per-language
 * interpretation channels, and the WODDI Scribe: an AI minute-taker that
 * listens, transcribes, and drafts meeting minutes — saved straight onto
 * the meeting record.
 */
import { el, clear } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { db, announceGroupCall, amIStaff, getOrgSetting, meetingJoin,
  getAiToken, saveMeetingMinutes, APP_VERSION } from '../core/db.js';
import { aiSummarizeMinutes } from '../core/ai.js';
import { renderShell } from '../components/layout.js';
import { toast, toastError } from '../components/toast.js';

const DEFAULT_DOMAIN = 'meet.jit.si';
const libLoaded = new Map();

// Phase 124: the managed engine (Jitsi as a Service, 8x8.vc) serves its
// iframe library from a per-app path, so the loader takes an explicit
// script URL; the plain-domain form is kept for self-hosted engines.
function loadCallLib(domain, src = `https://${domain}/external_api.js`) {
  if (window.JitsiMeetExternalAPI && libLoaded.get(src)) {
    return Promise.resolve();
  }
  if (!libLoaded.has(src)) {
    libLoaded.set(src, new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = src;
      sc.onload = () => res();
      sc.onerror = () => { libLoaded.delete(src); rej(new Error('lib')); };
      document.head.append(sc);
      setTimeout(() => { libLoaded.delete(src); rej(new Error('timeout')); }, 12000);
    }));
  }
  return libLoaded.get(src);
}

// Asks the meeting-token Edge Function for a personal token for this room.
// Resolves { ok: true, data } or { ok: false, why } — never throws, because
// a missing engine must degrade to the open-tab call, not break the page.
async function fetchMeetingToken(room) {
  try {
    const fns = db().functions;
    if (!fns || typeof fns.invoke !== 'function') {
      return { ok: false, why: 'client' };
    }
    const { data, error } = await fns.invoke('meeting-token', { body: { room } });
    if (error) {
      let why = String(error?.message || 'error');
      try {
        const body = await error.context?.json?.();
        if (body?.error) {
          why = body.error + (body.missing?.length
            ? ' (' + body.missing.join(', ') + ')' : '');
        }
      } catch { /* no body */ }
      return { ok: false, why };
    }
    if (!data?.jwt || !data?.appId || !data?.domain) {
      return { ok: false, why: 'empty' };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, why: String(e?.message || e) };
  }
}

function slugRoom(name) {
  return 'WODDI-' + name.trim().replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '').slice(0, 40);
}

export async function render(root, params, ctx) {
  const shell = renderShell(root, {
    profile: ctx.profile, modules: ctx.modules, titleKey: 'nav.room',
  });
  const out = shell.outlet;
  clear(out);

  let api = null;
  let recog = null;
  let roomStop = null;
  const teardown = () => {
    try { roomStop?.(); } catch { /* room already gone */ }
    try { api?.dispose(); } catch { /* gone */ }
    try { recog?.stop(); } catch { /* stopped */ }
    roomStop = null; api = null; recog = null;
    return shell.teardown();
  };

  const mods = ctx.modules;
  const isHq = !!mods && (typeof mods.has === 'function'
    ? mods.has('settings') : mods.includes('settings'));
  const staff = await amIStaff().catch(() => false);
  const displayName =
    `${ctx.profile.first_name} ${ctx.profile.last_name}`.trim() || 'WODDI';
  let callDomain = DEFAULT_DOMAIN;
  try {
    const d = await getOrgSetting('call_domain');
    if (d && String(d).trim()) callDomain = String(d).trim();
  } catch { /* default */ }
  // HQ's choice of call mode: 'embedded' (default, call inside this page)
  // or 'tab' (the earlier open-in-new-tab call, interpreter stays here).
  let callMode = 'embedded';
  try {
    const m = await getOrgSetting('call_mode');
    if (String(m || '').trim().toLowerCase() === 'tab') callMode = 'tab';
  } catch { /* default */ }
  // Booth mode (default): listeners hear ONLY the interpreter's voice in
  // their language; the speaker's own voice does not go into the call.
  // Set org setting call_raw_voice = 'on' to let the real voice through.
  try {
    const sp = String((await getOrgSetting('tts_space')) || '').trim();
    if (sp) {
      fetch(sp.replace(/\/+$/, '') + '/warmup', { mode: 'no-cors' })
        .catch(() => { /* just a wake-up tap */ });
    }
  } catch { /* no space configured */ }
  let rawVoice = false;
  try {
    const rv = await getOrgSetting('call_raw_voice');
    if (String(rv || '').trim().toLowerCase() === 'on') rawVoice = true;
  } catch { /* default */ }
  // HQ interpreter kill switch (Settings → Multilingua interpreter). Default
  // on. When off, the room is a plain Jitsi call: no capture, no auto
  // language, no mute of anyone — Jitsi's own controls are the only mute.
  let interpreterOn = true;
  try {
    const v = await getOrgSetting('interpreter_enabled');
    interpreterOn = v === null || v === true || v === 'true';
  } catch { interpreterOn = true; }

  const meetingId = params?.m ? String(params.m) : null;
  if (meetingId) meetingJoin(meetingId).catch(() => {});

  try {
    if (params?.r) await joinRoom(String(params.r));
    else lobby();
  } catch (e) {
    clear(out);
    out.append(el('div', { class: 'card state' }, [
      el('h3', { text: t('errors.loadTitle') }),
      el('p', { text: String(e?.message || t('errors.loadHint')) }),
    ]));
  }
  return teardown;

  /* ------------------------------ lobby ------------------------------ */
  function lobby() {
    try { roomStop?.(); } catch { /* noop */ }
    roomStop = null;
    try { api?.dispose(); } catch { /* noop */ }
    try { recog?.stop(); } catch { /* noop */ }
    api = null; recog = null;
    clear(out);
    out.append(el('p', { class: 'muted mb-4', text: t('room.hint') }));

    const grid = el('div', { class: 'grid-2 mb-4' });
    if (staff || isHq) {
      grid.append(roomCard(t('room.hqRoom'), t('room.hqRoomHint'),
        'WODDI-HQ-OPERATIONS', 'room-card--hq'));
    }
    const unitRoom = ctx.profile.org_unit_id
      ? 'WODDI-' + (ctx.profile.network || 'TEAM') + '-'
        + String(ctx.profile.org_unit_id).replace(/-/g, '').slice(0, 10)
      : 'WODDI-' + (ctx.profile.network || 'FAMILY') + '-ROOM';
    grid.append(roomCard(t('room.myRoom'), t('room.myRoomHint'),
      unitRoom, 'room-card--field'));
    out.append(grid);

    const nameIn = el('input', { class: 'input',
      placeholder: t('room.customPh'), style: 'flex:1;min-width:200px;' });
    out.append(el('div', { class: 'card mb-4' }, [
      el('div', { class: 'card__head' }, [el('h2', { text: t('room.custom') })]),
      el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;' }, [
        nameIn,
        el('button', { class: 'btn btn--secondary', text: t('room.join'),
          onclick: () => {
            if (nameIn.value.trim().length < 3) {
              toastError(t('room.nameShort')); return;
            }
            joinRoom(slugRoom(nameIn.value));
          } }),
      ]),
    ]));

    const LANGS = [
      ['EN', 'English'], ['HA', 'Hausa'], ['YO', 'Yorùbá'], ['IG', 'Igbo'],
      ['FR', 'Français'], ['PT', 'Português'], ['AR', 'العربية'],
      ['SW', 'Kiswahili'],
    ];
    const baseIn = el('input', { class: 'input',
      placeholder: t('room.interpBasePh'), style: 'flex:1;min-width:180px;' });
    const langGrid = el('div', { class: 'lang-grid mt-2' });
    for (const [code, label] of LANGS) {
      langGrid.append(el('button', { class: 'lang-btn',
        onclick: () => joinRoom(
          `${slugRoom(baseIn.value || 'WODDI-MEETING')}-${code}`) }, [
        el('span', { class: 'lang-btn__code', text: code }),
        el('span', { text: label }),
      ]));
    }
    out.append(el('div', { class: 'card mb-4' }, [
      el('div', { class: 'card__head' }, [el('h2', { text: t('room.interp') })]),
      el('p', { class: 'muted', text: t('room.interpHint') }),
      el('div', { class: 'row mt-2', style: 'gap:8px;' }, [baseIn]),
      langGrid,
      el('p', { class: 'mt-2' }, [
        el('a', { href: '#/interpret', text: t('room.captionsLink') }),
      ]),
    ]));

    function roomCard(title, hintText, room, cls) {
      return el('div', { class: 'card ' + cls }, [
        el('h3', { text: title }),
        el('p', { class: 'muted', style: 'font-size:13px;margin:6px 0 12px;',
          text: hintText }),
        el('button', { class: 'btn btn--primary', text: t('room.join'),
          onclick: () => joinRoom(room) }),
      ]);
    }
  }

  /* ------------------------------ in-call ---------------------------- */
  async function joinRoom(room) {
    try { roomStop?.(); } catch { /* previous room already stopped */ }
    roomStop = null; api = null; recog = null;
    clear(out);
    const { createLingua } = await import('../core/lingua.js');
    const lingua = createLingua();
    const myName = `${ctx.profile.first_name} ${ctx.profile.last_name}`.trim();

    const LANGS = [['en','English'],['fr','Français'],['ha','Hausa'],
      ['yo','Yorùbá'],['ig','Igbo'],['sw','Kiswahili'],['pt','Português'],
      ['ar','العربية']];
    // The microphone understands these five reliably; regioned tags make
    // recognition noticeably more accurate. Everyone can LISTEN in all
    // eight; speaking Hausa, Yorùbá or Igbo arrives with the voice Space.
    const SR_LANGS = [['en','English','en-US'],['fr','Français','fr-FR'],
      ['ar','العربية','ar-SA'],['pt','Português','pt-PT'],
      ['sw','Kiswahili','sw-KE']];
    const srTag = (c) => (SR_LANGS.find(([x]) => x === c) || [])[2] || 'en-US';
    const pref = (ctx.profile.preferred_locale || 'en').slice(0, 2);
    // The last choice wins over the profile locale, so a person picks her
    // languages once and finds them set on every later meeting.
    const remembered = (k, fallback, allowed) => {
      try {
        const v = localStorage.getItem('wdos.room.' + k);
        if (v && allowed.some(([c]) => c === v)) return v;
      } catch { /* private mode */ }
      return fallback;
    };
    const remember = (k, v) => {
      try { localStorage.setItem('wdos.room.' + k, v); } catch { /* ignore */ }
    };
    const speakPref = remembered('speak',
      SR_LANGS.some(([c]) => c === pref) ? pref : 'en', SR_LANGS);
    const hearPref = remembered('hear',
      LANGS.some(([c]) => c === pref) ? pref : 'en', LANGS);
    const mySpeak = el('select', { class: 'select', style: 'max-width:130px;' },
      SR_LANGS.map(([c, n]) => el('option', { value: c, text: n,
        selected: speakPref === c || null })));
    const myHear = el('select', { class: 'select', style: 'max-width:130px;' },
      LANGS.map(([c, n]) => el('option', { value: c, text: n,
        selected: hearPref === c || null })));
    mySpeak.addEventListener('change', () => remember('speak', mySpeak.value));
    myHear.addEventListener('change', () => remember('hear', myHear.value));
    // Phase 139: one person, one language. The language she wants to hear is
    // the language she speaks, unless she opens the advanced option. The
    // speak picker only offers the languages the cloud ears can transcribe,
    // so when My language is not among them, the nearest supported one stays.
    // Phase 146: there is no "I speak" picker. The cloud ears detect the
    // spoken language on every clip; "I want to hear" is the only choice.
    // mySpeak stays as an internal, hidden control set to 'auto' so the
    // browser-recogniser fallback still has a language to start from.
    mySpeak.hidden = true;
    const speakWrap = el('span', { hidden: true }, [mySpeak]);
    const splitToggle = el('input', { type: 'checkbox', hidden: true });
    let detectedLang = null;                 // last language the ears detected
    myHear.addEventListener('change', () => { try { if (chanLive) announceHello(); } catch { /* not joined yet */ } });
    const langName = (code) =>
      (LANGS.find(([c]) => c === code) || [code, code])[1];

    let channel = null;
    let chanLive = false;
    let userEnded = false;
    let restartTimer = null;
    let interpretingTimer = null;
    // Phase 124: the interpreter's microphone runs ONLY while the person
    // has tapped "Speak". Listening is the default, on every device.
    let speaking = false;
    let joined = false;
    let engine = { kind: 'popout' };
    const onHidden = () => {
      if (document.hidden && speaking) setSpeaking(false, 'hidden');
    };
    document.addEventListener('visibilitychange', onHidden);
    const stopAll = () => {
      if (restartTimer) clearTimeout(restartTimer);
      if (interpretingTimer) clearTimeout(interpretingTimer);
      document.removeEventListener('visibilitychange', onHidden);
      try { recog?.stop(); } catch { /* off */ }
      try { api?.dispose(); } catch { /* gone */ }
      try { if (channel) db().removeChannel(channel); } catch { /* gone */ }
      restartTimer = null; interpretingTimer = null;
      channel = null; chanLive = false;
      if (roomStop === stopAll) roomStop = null;
    };
    roomStop = stopAll;
    let speakOut = (text, lang, opts = {}) =>
      lingua.speak(text, lang, opts);
    let diagnoseVoiceLane = async () => {};
    let noteTranslateFallback = () => {};

    const chipStyle = 'font-size:12px;padding:4px 8px;border-radius:999px;'
      + 'background:rgba(0,0,0,.08);';
    const transChip = el('span', { class: 'muted', style: chipStyle,
      text: '🌐 …' });
    const voiceChip = el('span', { class: 'muted', style: chipStyle,
      text: '🔊 …' });
    const versionChip = el('span', { class: 'muted', style: chipStyle,
      text: t('room.buildOk', { v: APP_VERSION }) });
    const interpretingChip = el('span', { class: 'muted',
      style: chipStyle + 'display:none;', text: t('room.interpreting') });
    // Phase 138 — stage stopwatch for the interpreter lane. Every clip
    // records: pause (silence wait before the cut), ears (upload +
    // transcribe), queue (time the caption waited for an earlier voice),
    // translate, voice (until audio starts), total. Shown on the grey
    // diagnostic line; the last 60 kept for a p50/p95 summary and copy.
    const timings = [];
    let voiceBusyUntil = 0;                 // when this device's voice queue empties (performance.now ms)
    const BACKLOG_FAST_MS = 1500, BACKLOG_SKIP_MS = 4000;
    const pct = (arr, q) => { if (!arr.length) return 0; const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * (a.length - 1)))]; };
    const timingLine = (tm) => Object.entries(tm).filter(([k, v]) => k !== 'at' && v != null)
      .map(([k, v]) => k === 'lang' || k === 'via' ? String(v) : k === 'size' ? `${t('room.tm_size')} ${Math.round(v / 1024)}KB`
        : `${t('room.tm_' + k)} ${v >= 1000 ? (v / 1000).toFixed(1) + 's' : Math.round(v) + 'ms'}`).join(' \u00B7 ');
    const noteTiming = (tm) => {
      timings.push({ at: Date.now(), ...tm }); if (timings.length > 60) timings.shift();
      const totals = timings.map((x) => x.total).filter((x) => x != null);
      setDiag('timing', t('room.tmLast') + ': ' + timingLine(tm)
        + (totals.length > 1 ? `  |  ${t('room.tmSummary', { n: totals.length, p50: (pct(totals, 0.5) / 1000).toFixed(1), p95: (pct(totals, 0.95) / 1000).toFixed(1) })}` : ''));
      try { console.info('[lane]', timingLine(tm)); } catch { /* no console */ }
    };
    const diagLines = new Map();
    const diagFeed = el('div', { class: 'muted mb-2',
      style: 'display:none;font-size:12px;line-height:1.35;' });
    const setDiag = (key, text, danger = false) => {
      if (text) diagLines.set(key, { text, danger });
      else diagLines.delete(key);
      clear(diagFeed);
      for (const line of diagLines.values()) {
        diagFeed.append(el('p', { style: 'margin:2px 0;'
          + (line.danger ? 'color:var(--magenta);' : ''),
          text: line.text }));
      }
      diagFeed.style.display = diagLines.size ? '' : 'none';
    };
    const paintChips = () => {
      const tr = lingua.status.translate;
      const vo = lingua.status.voice;
      transChip.textContent = '🌐 ' + t('room.tr_' + tr);
      transChip.style.color = tr === 'off' ? 'var(--magenta)' : '';
      voiceChip.textContent = '🔊 ' + t('room.vo_' + vo);
      voiceChip.title = lingua.status.voiceDetail || '';
      voiceChip.style.color = ['blocked', 'off'].includes(vo)
        ? 'var(--magenta)' : '';
    };
    const micChip = el('span', { class: 'muted', style:
      'font-size:12px;padding:4px 8px;border-radius:999px;'
      + 'background:rgba(0,0,0,.08);', text: '🎤 ' + t('room.micIdle') });
    const engineChip = el('span', { class: 'muted', style: chipStyle,
      text: t('room.engineOpen') });
    // One big control. Tap: your call microphone opens AND the interpreter
    // starts listening to you. Tap again: both close. Everyone else stays
    // a listener, so no phone "hears" the room's audio as speech.
    const speakBtn = el('button', { class: 'btn btn--primary room-speak',
      text: '🎤 ' + t('room.tapToSpeak') });
    let setSpeaking = (on) => { speaking = !!on; paintSpeak(); };
    const paintSpeak = () => {
      speakBtn.textContent = speaking
        ? '⏹ ' + t('room.speakingNow') : '🎤 ' + t('room.tapToSpeak');
      speakBtn.classList.toggle('room-speak--on', speaking);
      if (!speaking) micChip.textContent = '🎤 ' + t('room.micIdle');
    };
    const syncCallMic = (on) => {
      // Keep the call's own microphone in step with the interpreter's.
      if (!api || !joined) return;
      try {
        Promise.resolve(api.isAudioMuted()).then((muted) => {
          if (muted === !!on) api.executeCommand('toggleAudio');
        }).catch(() => {});
      } catch { /* engine not ready */ }
    };
    const toggleSpeak = () => {
      // HQ interpreter switch: when off, this button does nothing at all —
      // not even a no-op mute toggle. Jitsi's own microphone button is the
      // only thing that mutes anyone while the interpreter is off.
      if (!interpreterOn) return;
      // Local first: the interpreter switches at once and the call mic is
      // brought in step (syncCallMic). If the engine also reports the mute
      // change, that report is idempotent.
      setSpeaking(!speaking, 'tap');
    };
    speakBtn.onclick = toggleSpeak;
    if (!interpreterOn) {
      speakBtn.disabled = true;
      speakBtn.textContent = '🎤 ' + t('room.interpreterOffBtn');
      speakBtn.title = t('room.interpreterOffHint');
    }
    const invite = el('button', { class: 'btn btn--secondary',
      text: t('room.invite'),
      onclick: async () => {
        const link = `https://woddicrm.org/#/room?r=${encodeURIComponent(room)}`;
        try { await navigator.clipboard.writeText(link);
          toast(t('room.inviteCopied')); }
        catch { prompt(t('room.invite'), link); }
      } });
    const top = el('div', { class: 'row mb-2',
      style: 'gap:8px;flex-wrap:wrap;align-items:center;' }, [
      el('strong', { style: 'flex:1;min-width:120px;overflow-wrap:anywhere;',
        text: room }),
      interpreterOn ? el('span', { class: 'muted', style: 'font-size:12px;',
        text: t('room.iWantToHear') }) : null,
      interpreterOn ? myHear : null,
      interpreterOn ? speakWrap : null,
      invite,
      interpreterOn ? el('button', { class: 'btn btn--secondary', title: t('room.voiceTest'),
        text: '🔈', onclick: async () => {
          const to = myHear.value;
          const sample = await lingua.translate(
            'The WODDI interpreter is working.', 'en', to);
          capFeed.append(el('p', { class: 'muted',
            style: 'margin:2px 0;font-size:13px;',
            text: `🔈 ${sample}` }));
          noteTranslateFallback('The WODDI interpreter is working.',
            sample, 'en', to);
          const mode = await speakOut(sample, to, {
            onBlockedUrl: (u) => {
              const b = el('button', { class: 'btn btn--quiet',
                text: '▶ ' + t('room.tapPlay') });
              b.onclick = () => { new Audio(u).play(); b.remove(); };
              capFeed.append(b);
            } });
          if (['blocked', 'off'].includes(mode)) toastError(t('room.noVoiceFor'));
          diagnoseVoiceLane();
          paintChips();
        } }) : null,
      interpreterOn ? engineChip : null, interpreterOn ? transChip : null, interpreterOn ? voiceChip : null, interpreterOn ? interpretingChip : null, interpreterOn ? versionChip : null,
      el('button', { class: 'btn btn--danger', text: t('room.endCall'),
        onclick: () => { userEnded = true; stopAll(); lobby(); } }),
    ].filter(Boolean));
    const copyTimings = el('button', { class: 'btn btn--quiet', style: 'font-size:12px;', text: t('room.tmCopy'), onclick: async () => {
      const lines = timings.map((x) => `${new Date(x.at).toISOString()} ${timingLine(x)}`);
      const head = `WDOS lane timings v${APP_VERSION} · hear=${myHear.value} (spoken language detected per clip) · ${navigator.userAgent}`;
      try { await navigator.clipboard.writeText([head, ...lines].join('\n')); toast(t('room.tmCopied', { n: lines.length })); }
      catch { toastError(t('errors.save')); }
    } });
    if (!interpreterOn) {
      out.append(top, el('div', { class: 'room-interp-off' }, [
        el('b', { text: t('room.interpreterOffTitle') }),
        el('p', { text: t('room.interpreterOffBody') }),
      ]));
    } else {
      out.append(top, diagFeed, copyTimings);
    }

    const frame = el('div', { class: 'room-stage' });
    const speakBar = el('div', { class: 'room-speakbar' }, [
      speakBtn, interpreterOn ? micChip : null,
      el('span', { class: 'muted', style: 'font-size:12px;flex:1;min-width:160px;',
        text: interpreterOn ? t('room.speakHint') : t('room.interpreterOffHint') }),
    ].filter(Boolean));
    const capFeed = el('div', { class: 'room-caps mt-2' });
    out.append(frame);
    if (interpreterOn) {
      out.append(speakBar, capFeed);
      out.append(el('p', { class: 'muted', style: 'font-size:12px;',
        text: t('room.hybridHint') }));
    }

    let lastEngineError = '';
    function showFallback() {
      clear(frame);
      const url = engine.kind === 'jaas'
        ? `https://${engine.domain}/${engine.appId}/${encodeURIComponent(room)}`
          + `?jwt=${encodeURIComponent(engine.jwt)}`
        : `https://${callDomain}/${encodeURIComponent(room)}`
          + `#userInfo.displayName=%22${encodeURIComponent(myName)}%22`;
      frame.style.background = 'var(--panel, #FAF3F7)';
      frame.style.height = 'auto';
      frame.append(el('div', { class: 'card state' }, [
        el('h3', { text: t('room.embedFail') }),
        el('p', { text: lastEngineError
          ? t('room.engineSaid', { msg: lastEngineError })
          : t('room.embedFailHint') }),
        el('div', { class: 'row mt-2',
          style: 'gap:10px;justify-content:center;flex-wrap:wrap;' }, [
          el('a', { class: 'btn btn--primary', href: url,
            target: '_blank', rel: 'noopener', text: t('room.reopen') }),
          el('button', { class: 'btn btn--secondary',
            text: t('room.retryHere'),
            onclick: () => joinRoom(room) }),
        ]),
        el('p', { class: 'muted mt-2', style: 'font-size:12px;',
          text: t('room.interpStays') }),
      ]));
    }

    // ── the call stage, embedded on this page.
    // Phase 124: with the managed engine (Jitsi as a Service) the call
    // lives INSIDE WDOS with no time limit; the person's token comes from
    // the meeting-token Edge Function and carries her name and role.
    async function mountStage() {
    try {
      const managed = engine.kind === 'jaas';
      const domain = managed ? engine.domain : callDomain;
      const src = managed
        ? `https://${engine.domain}/${engine.appId}/external_api.js`
        : undefined;
      await loadCallLib(domain, src);
      joined = false;
      api = new window.JitsiMeetExternalAPI(domain, {
        roomName: managed ? `${engine.appId}/${room}` : room,
        jwt: managed ? engine.jwt : undefined,
        width: '100%',
        height: '100%',
        parentNode: frame,
        userInfo: { displayName: myName, email: ctx.profile.email || undefined },
        configOverwrite: {
          prejoinConfig: { enabled: false },
          disableDeepLinking: true,
          // Everyone arrives as a listener; the Speak button opens the mic.
          startWithAudioMuted: true,
          disableThirdPartyRequests: true,
          hideConferenceSubject: true,
        },
        interfaceConfigOverwrite: {
          MOBILE_APP_PROMO: false,
          SHOW_CHROME_EXTENSION_BANNER: false,
        },
      });
      api.addListener('readyToClose', () => {
        if (userEnded || managed) { userEnded = true; stopAll(); lobby(); return; }
        // a self-hosted engine may drop the frame — rejoin the same room
        try { api?.dispose(); } catch { /* gone */ }
        api = null;
        toast(t('room.rejoining'));
        setTimeout(() => { if (!userEnded) mountStage(); }, 1200);
      });
      api.addListener('videoConferenceJoined', () => {
        joined = true;
        engineChip.textContent = managed
          ? t('room.engineCloud') : t('room.engineCustom');
        engineChip.style.color = '';
        setDiag('engine', '');
        // Start in step. If she tapped Speak while the call was still
        // connecting, open the call mic now; otherwise follow the call.
        if (speaking) { syncCallMic(true); return; }
        try {
          Promise.resolve(api.isAudioMuted()).then((muted) => {
            if (!muted) setSpeaking(true, 'engine');
          }).catch(() => {});
        } catch { /* engine not ready */ }
      });
      api.addListener('participantJoined', () => { joined = true; });
      // The call's own mute button is the other way to speak: unmuting
      // there starts the interpreter, muting there stops it.
      api.addListener('audioMuteStatusChanged', (e) => {
        const on = !e?.muted;
        if (speaking !== on) setSpeaking(on, 'engine');
      });
      api.addListener('errorOccurred', (e) => {
        lastEngineError = String(e?.error?.message || e?.error?.name
          || e?.message || '').slice(0, 160);
      });
      setTimeout(() => {
        if (joined) return;
        try { api?.dispose(); } catch { /* gone */ }
        api = null;
        showFallback();
      }, 25000);
    } catch {
      showFallback();
    }
    }
    // meet.jit.si caps EMBEDDED calls at 5 minutes (their policy since
    // 2023), so the public server is never embedded: it opens in its own
    // tab and this page stays the interpreter console. Phase 124 makes
    // this the LAST resort only — when the managed engine is not yet
    // configured — because on a phone the interpreter cannot run behind
    // another tab.
    function showPopoutStage() {
      clear(frame);
      const url = `https://${callDomain}/${encodeURIComponent(room)}`;
      frame.style.background = 'var(--panel, #FAF3F7)';
      frame.style.height = 'auto';
      frame.append(el('div', { style: 'padding:26px 18px;text-align:center;' }, [
        el('h3', { style: 'margin:0 0 6px;', text: t('room.openedTitle') }),
        el('p', { class: 'muted', style: 'margin:0 0 14px;',
          text: t('room.openedHint') }),
        el('a', { class: 'btn btn--primary', href: url,
          target: '_blank', rel: 'noopener',
          style: 'font-size:16px;padding:12px 22px;',
          text: t('room.reopen') }),
        el('p', { class: 'muted mt-2', style: 'font-size:12px;',
          text: t('room.interpStays') }),
      ]));
    }
    (async () => {
      if (callMode === 'tab') {
        engine = { kind: 'popout' };
        engineChip.textContent = t('room.engineOpen');
        showPopoutStage();
        return;
      }
      const tok = await fetchMeetingToken(room);
      if (userEnded || roomStop !== stopAll) return; // left meanwhile
      if (tok.ok) {
        engine = { kind: 'jaas', ...tok.data };
        engineChip.textContent = t('room.engineCloud');
        await mountStage();
        return;
      }
      if (callDomain !== DEFAULT_DOMAIN) {
        engine = { kind: 'custom' };
        engineChip.textContent = t('room.engineCustom');
        await mountStage();
        return;
      }
      engine = { kind: 'popout' };
      engineChip.textContent = t('room.engineOpen');
      engineChip.style.color = 'var(--magenta)';
      if (staff || isHq) {
        setDiag('engine', t('room.engineNotSetup', { why: tok.why }), true);
      }
      showPopoutStage();
    })();

    // ── the WODDI interpreter lane, riding beside the stage
    // Shared-air rule: in one physical room, ANY device's translation
    // audio reaches EVERY device's microphone. This protocol now sends a
    // tiny warning before audio, waits a short pre-roll, and includes the
    // spoken text so every neighbor can suppress both early and late echoes.
    const PROTOCOL_VERSION = 2;
    const TTS_LEAD_MS = 700;
    const TTS_TAIL_MS = 1200;
    const REMOTE_TAIL_MS = 900;
    const ECHO_TTL_MS = 30000;
    const ECHO_MAX = 24;
    const TTS_TEXT_LIMIT = 260;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const peerId = (() => {
      try { return crypto.randomUUID(); }
      catch { return String(Date.now()) + '-' + Math.random(); }
    })();

    let voicingUntil = 0;
    let lastHelloReplyAt = 0;
    const recentEcho = [];
    const fallbackNoted = new Set();
    const normEcho = (x) => String(x || '').toLowerCase()
      .replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
    const echoTokens = (x) => normEcho(x).split(' ')
      .filter((w) => w.length > 2);
    const echoLooksLike = (a, b) => {
      if (!a || !b) return false;
      if (a.includes(b) || b.includes(a)) return true;
      const aa = new Set(echoTokens(a));
      const bb = new Set(echoTokens(b));
      if (aa.size < 2 || bb.size < 2) return false;
      let shared = 0;
      for (const w of aa) if (bb.has(w)) shared += 1;
      return shared / Math.min(aa.size, bb.size) >= 0.65;
    };
    const rememberEcho = (x, lang = '') => {
      const tn = normEcho(x);
      if (tn.length < 4) return;
      recentEcho.push({ t: tn, lang, at: Date.now() });
      while (recentEcho.length > ECHO_MAX) recentEcho.shift();
    };
    const isEcho = (tn) => {
      const now = Date.now();
      return tn.length > 4 && recentEcho.some((e) =>
        now - e.at < ECHO_TTL_MS && echoLooksLike(tn, e.t));
    };
    const holdMicFor = (ms) => {
      voicingUntil = Math.max(voicingUntil,
        Date.now() + Math.min(Number(ms) || 0, 36000));
      interpretingChip.style.display = '';
      if (interpretingTimer) clearTimeout(interpretingTimer);
      interpretingTimer = setTimeout(() => {
        if (Date.now() >= voicingUntil) interpretingChip.style.display = 'none';
      }, Math.max(100, voicingUntil - Date.now() + 50));
    };
    const sendBroadcast = (event, payload = {}) => {
      if (!chanLive || !channel) return;
      try {
        Promise.resolve(channel.send({ type: 'broadcast', event,
          payload: { ...payload, id: peerId, v: APP_VERSION,
            p: PROTOCOL_VERSION } })).catch(() => {});
      } catch { /* realtime is optional */ }
    };
    const notePeerVersion = (pl) => {
      if (!pl) return;
      const who = String(pl.name || t('room.someone')).slice(0, 40);
      if (!pl.v) {
        versionChip.textContent = t('room.buildUnknownShort', { name: who });
        versionChip.style.color = 'var(--magenta)';
        setDiag('version', t('room.buildUnknown',
          { name: who, mine: APP_VERSION }), true);
        return;
      }
      if (String(pl.v) === APP_VERSION) return;
      versionChip.textContent = t('room.buildSkewShort',
        { name: who, theirs: pl.v });
      versionChip.style.color = 'var(--magenta)';
      setDiag('version', t('room.buildSkew',
        { name: who, mine: APP_VERSION, theirs: pl.v }), true);
    };
    const announceHello = (event = 'hello') =>
      sendBroadcast(event, { name: myName, speak: detectedLang || myHear.value, hear: myHear.value });
    // Phase 140: warm the on-device translator for a peer's language the
    // moment she is known, so the first sentence does not pay the 3-second
    // language-pack cost the 8 Sep log showed.
    const warmFor = (from) => {
      const to = myHear.value;
      if (!from || from === to) return;
      lingua.translate('hello', from, to).catch(() => {});
    };
    const announceTts = (text, lang, ms) => {
      const spoken = String(text || '').trim();
      rememberEcho(spoken, lang);
      sendBroadcast('tts', { ms, lead: TTS_LEAD_MS, lang, name: myName,
        text: spoken.slice(0, TTS_TEXT_LIMIT) });
    };
    noteTranslateFallback = (input, output, from, to) => {
      if (!input || from === to) return;
      const mode = lingua.status.translate;
      const unchanged = normEcho(input) && normEcho(input) === normEcho(output);
      if (mode !== 'off' && !unchanged) return;
      // A healthy translator (device/ai/free) returning a SHORT fragment
      // unchanged is almost always an untranslatable utterance ("gua",
      // a name, a number), not a failure. Only warn on unchanged output
      // when the engine is genuinely off, or the text was a real
      // sentence that should have changed.
      if (mode !== 'off') {
        const words = normEcho(input).split(' ').filter(Boolean).length;
        if (words < 3) return;
      }
      const key = `${from}|${to}`;
      if (fallbackNoted.has(key)) return;
      fallbackNoted.add(key);
      const trace = (lingua.status?.translateTrace || []).join(' | ');
      setDiag('translate-' + key, t('room.translateFallback',
        { from: from.toUpperCase(), to: to.toUpperCase() }) + (trace ? ` (${trace})` : ''), true);
    };
    let voiceDiagSeq = 0;
    diagnoseVoiceLane = async () => {
      const seq = ++voiceDiagSeq;
      const lang = myHear.value;
      const info = await lingua.voiceStatus(lang);
      if (seq !== voiceDiagSeq) return;
      paintChips();
      if (info.mode === 'off') {
        setDiag('voice', t('room.noVoiceDevice',
          { lang: langName(lang) }), true);
      } else {
        setDiag('voice', '');
      }
    };
    speakOut = async (text, lang, opts = {}) => {
      const spoken = String(text || '').trim();
      if (!spoken) return 'off';
      const estMs = lingua.estimateSpeakMs
        ? lingua.estimateSpeakMs(spoken) : Math.min(1500 + spoken.length * 90, 30000);
      const tmReq = performance.now(); let tmJobStart = null;
      const mode = await lingua.speak(spoken, lang, {
        onBlockedUrl: opts.onBlockedUrl || (() => {}),
        rate: opts.rate || 1,
        onJobStart: () => { tmJobStart = performance.now(); },
        beforeStart: async () => {
          if (opts.onStart) {
            const start = tmJobStart ?? tmReq;
            opts.onStart(Math.round(start - tmReq), Math.round(performance.now() - start));
          }
          announceTts(spoken, lang, estMs);
          holdMicFor(TTS_LEAD_MS + estMs + TTS_TAIL_MS);
          await wait(TTS_LEAD_MS);
        },
      });
      if (mode === 'off') {
        setDiag('voice', t('room.noVoiceDevice',
          { lang: langName(lang) }), true);
      } else if (mode === 'blocked') {
        setDiag('voice', t('room.voiceBlocked'), true);
      }
      holdMicFor(700);
      paintChips();
      return mode;
    };
    channel = db().channel(`cap-${room}`,
      { config: { broadcast: { self: false } } });
    channel.on('broadcast', { event: 'tts' }, ({ payload: pl }) => {
      notePeerVersion(pl);
      if (pl?.text) rememberEcho(pl.text, pl.lang || '');
      // Booth mode: another device's interpreter voice never reaches this
      // microphone through the call, so only the text-echo guard applies.
      // With the real voice in the call, hold as before.
      if (rawVoice) {
        const ms = Math.min(Number(pl?.ms) || 2000, 30000);
        const lead = Math.min(Number(pl?.lead) || 0, 2000);
        holdMicFor(lead + ms + REMOTE_TAIL_MS);
      }
    });
    channel.on('broadcast', { event: 'hello' }, ({ payload: pl }) => {
      notePeerVersion(pl); warmFor(pl?.speak);
      if (Date.now() - lastHelloReplyAt > 2500) {
        lastHelloReplyAt = Date.now();
        announceHello('hello_ack');
      }
    });
    channel.on('broadcast', { event: 'hello_ack' }, ({ payload: pl }) => {
      notePeerVersion(pl); warmFor(pl?.speak);
    });
    channel.on('broadcast', { event: 'cap' }, async ({ payload: pl }) => {
      if (!pl?.text) return;
      notePeerVersion(pl);
      const to = myHear.value;
      const from = pl.lang || 'en';
      const tmRecv = performance.now();
      const shown = await lingua.translate(pl.text, from, to);
      const tmTranslate = Math.round(performance.now() - tmRecv);
      noteTranslateFallback(pl.text, shown, from, to);
      capFeed.append(el('p', { style: 'margin:2px 0;font-size:14px;' }, [
        el('strong', { text: (pl.name || '') + ': ' }),
        el('span', { text: shown }),
      ]));
      capFeed.scrollTop = capFeed.scrollHeight;
      // Booth mode: the real voice is not in the call, so even a listener
      // in the speaker's own language hears the words from the interpreter.
      let tmQueue = null, tmVoice = null;
      if (from !== to || !rawVoice) {
        // Phase 144: playback backlog policy (the 8 Sep log showed the voice
        // queue growing 0.3 → 6.5 → 9.4 s). If the voice is more than
        // BACKLOG_SKIP_MS behind, this sentence stays text-only and says so;
        // between BACKLOG_FAST_MS and that, the voice speaks faster to catch up.
        const est = lingua.estimateSpeakMs ? lingua.estimateSpeakMs(shown) : 1500 + shown.length * 90;
        const behind = Math.max(0, voiceBusyUntil - performance.now());
        if (behind > BACKLOG_SKIP_MS) {
          setDiag('backlog', t('room.voiceBehindSkip', { s: (behind / 1000).toFixed(1) }), true);
          capFeed.lastElementChild?.classList.add('cap--textonly');
          tmQueue = Math.round(behind); tmVoice = 0;
        } else {
          const rate = behind > BACKLOG_FAST_MS ? 1.2 : 1;
          if (rate > 1) setDiag('backlog', t('room.voiceBehindFast', { s: (behind / 1000).toFixed(1) }));
          else setDiag('backlog', '');
          voiceBusyUntil = Math.max(voiceBusyUntil, performance.now()) + est / (rate);
          const tmSpeakReq = performance.now();
          await speakOut(shown, to, { rate, onStart: (queueMs, voiceMs) => { tmQueue = queueMs; tmVoice = voiceMs; } });
          // the estimate is generous: settle the clock on the real finish
          voiceBusyUntil = Math.min(voiceBusyUntil, performance.now());
          if (tmVoice == null) tmVoice = Math.round(performance.now() - tmSpeakReq);
        }
      }
      const spk = pl.tm || {};
      const total = (spk.pause || 0) + (spk.ears || 0) + tmTranslate + (tmQueue || 0) + (tmVoice || 0);
      noteTiming({ lang: `${from}\u2192${to}`, pause: spk.pause ?? null, ears: spk.ears ?? null,
        upload: spk.upload ?? null, transcribe: spk.transcribe ?? null, translate: tmTranslate,
        queue: tmQueue, voice: tmVoice, total,
        via: `${lingua.status?.translate || ''}${(lingua.status?.translateTrace || []).length ? ' [' + lingua.status.translateTrace.join(' | ') + ']' : ''}` });
      paintChips();
    });
    channel.subscribe((st) => {
      chanLive = st === 'SUBSCRIBED';
      if (chanLive) announceHello();
    });
    myHear.addEventListener('change', () => {
      diagnoseVoiceLane();
      paintChips();
    });
    diagnoseVoiceLane();

    // One path for a finished utterance, whichever ears produced it: the
    // browser recogniser (below) or the cloud ears (Phase 127). Guards,
    // broadcast, caption and the hear-yourself translation all live here.
    let lastCap = ''; let lastCapAt = 0;
    const handleFinal = async (text, spk = {}) => {
      if (!text) return;
      micChip.textContent = '🎤 ' + t('room.micLive');
      // guard: anything heard while our own translation is playing is the
      // app's voice, not the person
      if (Date.now() < voicingUntil) { setDiag('skip', t('room.clipDuringVoice')); return; }
      setDiag('skip', '');
      // drop chopped fragments and immediate repeats
      if (text.length < 3) return;
      const tn = normEcho(text);
      if (isEcho(tn)) return;
      const now = Date.now();
      if (text.toLowerCase() === lastCap && now - lastCapAt < 5000) return;
      lastCap = text.toLowerCase(); lastCapAt = now;
      const spokenLang = spk.lang || detectedLang || myHear.value;
      if (chanLive) {
        sendBroadcast('cap', { text, lang: spokenLang, name: myName,
          tm: { pause: spk.pause ?? null, ears: spk.ears ?? null, size: spk.size ?? null,
            upload: spk.upload ?? null, transcribe: spk.transcribe ?? null } });
      }
      if (spk.ears != null) noteTiming({ lang: `${spokenLang} (${t('room.tmSpeaker')})`, pause: spk.pause, ears: spk.ears,
        upload: spk.upload, transcribe: spk.transcribe });
      capFeed.append(el('p', { class: 'muted',
        style: 'margin:2px 0;font-size:13px;',
        text: `${myName}: ${text}` }));
      // hear yourself translated — the solo proof and the demo trick
      if (spokenLang !== myHear.value) {
        const shown = await lingua.translate(text, spokenLang,
          myHear.value);
        noteTranslateFallback(text, shown, spokenLang, myHear.value);
        capFeed.append(el('p', { style: 'margin:2px 0;font-size:14px;' }, [
          el('strong', { text: `${myName} (${myHear.value}): ` }),
          el('span', { text: shown }),
        ]));
        await speakOut(shown, myHear.value);
        paintChips();
      }
      capFeed.scrollTop = capFeed.scrollHeight;
    };

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const isEdge = /\bEdg(e|A|iOS)?\//.test(navigator.userAgent || '');
    if (SR && isEdge) setDiag('browser', t('room.micEdge'), true);
    if (SR) {
      recog = new SR();
      recog.continuous = true;
      recog.interimResults = true;
      const setLang = () => { recog.lang = srTag(mySpeak.value); };
      setLang();
      let micDead = false;
      let micPaused = true; // Phase 124: listener until Speak is tapped
      let captureFails = 0;
      let networkFails = 0;
      let lastStartTryAt = 0;
      const scheduleRestart = (delay = 450) => {
        if (restartTimer) clearTimeout(restartTimer);
        restartTimer = setTimeout(() => {
          restartTimer = null;
          if (!channel || micDead || micPaused || userEnded) return;
          const now = Date.now();
          if (now - lastStartTryAt < 350) {
            scheduleRestart(500);
            return;
          }
          lastStartTryAt = now;
          setLang();
          try { recog.start(); }
          catch { scheduleRestart(900); }
        }, delay);
      };
      mySpeak.addEventListener('change', () => {
        setLang();
        if (micPaused) return;
        try { recog.stop(); } catch { /* will restart below */ }
        scheduleRestart(550);
      });
      // The mic runs only while Speak is on; the guards below still
      // filter anything heard while announced translation audio plays.
      setSpeaking = (on, source = 'tap') => {
        speaking = !!on && !micDead;
        micPaused = !speaking;
        paintSpeak();
        if (speaking) {
          captureFails = 0;
          networkFails = 0;
          setDiag('capture', '');
          setDiag('sr', '');
          micChip.textContent = '🎤 ' + t('room.micStarting');
          scheduleRestart(0);
        } else {
          if (restartTimer) clearTimeout(restartTimer);
          restartTimer = null;
          try { recog.stop(); } catch { /* already off */ }
        }
        if (source !== 'engine') syncCallMic(speaking);
      };
      recog.onstart = () => { micChip.textContent =
        '🎤 ' + t('room.micLive'); };
      recog.onerror = (e) => {
        const code = String(e?.error || 'unknown');
        if (code === 'network' || code === 'language-not-supported') {
          // The browser could not reach (or does not have) a speech
          // service. Edge has shipped a broken recogniser since v134;
          // say so in plain words, and stop hammering it.
          networkFails += 1;
          setDiag('sr', t(isEdge ? 'room.micEdge' : 'room.micNetwork'), true);
          if (networkFails >= 3) {
            micPaused = true;
            if (restartTimer) clearTimeout(restartTimer);
            restartTimer = null;
            micChip.textContent = '🎤 ' + t('room.micNoRecog');
          }
          return;
        }
        if (!['no-speech', 'aborted'].includes(code)) {
          // Say what the recogniser said, in its own words, so a failed
          // test reports itself: audio-capture, not-allowed…
          setDiag('sr', t('room.micError', { code }), code !== 'no-speech');
        }
        if (['not-allowed', 'service-not-allowed'].includes(e?.error)) {
          micDead = true;
          micChip.textContent = '🎤 ' + t('room.micBlocked');
          toastError(t('room.micBlockedHint'));
          speaking = false; micPaused = true; paintSpeak();
          micChip.textContent = '🎤 ' + t('room.micBlocked');
        } else if (e?.error === 'audio-capture') {
          // Some phones refuse a second microphone capture while the call
          // holds the first. After three refusals stop retrying: the call
          // mic stays open (others hear her voice), the interpreter does
          // not, and the page says so plainly.
          captureFails += 1;
          if (captureFails >= 3) {
            micPaused = true;
            if (restartTimer) clearTimeout(restartTimer);
            restartTimer = null;
            micChip.textContent = '🎤 ' + t('room.micNoRecog');
            setDiag('capture', t('room.micBusy'), true);
          }
        }
      };
      recog.onresult = async (e) => {
        const last = e.results[e.results.length - 1];
        if (last && last.isFinal === false) {
          const heard = String(last[0]?.transcript || '').trim();
          if (heard) micChip.textContent = '🎤 ' + t('room.micHearing')
            + ' ' + heard.slice(-48);
          return;
        }
        await handleFinal(last?.[0]?.transcript?.trim());
      };
      recog.onend = () => { if (channel && !micDead && !micPaused) {
        scheduleRestart(500); } };
      // No auto-start: everyone joins as a listener (Phase 124).
    } else {
      // No recognition on this browser (Firefox, some in-app browsers):
      // captions and voice still arrive; Speak only opens the call mic.
      setSpeaking = (on, source = 'tap') => {
        speaking = !!on; paintSpeak();
        if (source !== 'engine') syncCallMic(speaking);
      };
      micChip.textContent = '🎤 ' + t('room.micNoRecog');
      capFeed.append(el('p', { class: 'muted', text: t('room.noRecog') }));
    }

    // ── Phase 127: cloud ears — speaking works in ANY browser, any phone.
    // The browser recogniser above is Chrome-only and fragile on phones.
    // When the transcribe function is configured, Speak becomes
    // push-to-talk: tap, talk, tap again → a short clip is recorded with
    // MediaRecorder (universal) and transcribed by the cloud; the text then
    // takes the same handleFinal path as before. The browser recogniser
    // stays as the fallback when the cloud is not configured.
    let rec = null; let recStream = null; let recChunks = [];
    let recBusy = false; let recMime = '';
    let vadCtx = null; let vadTimer = null; let vadBuf = null;
    let segStartAt = 0; let segHadSpeech = false; let speechMs = 0;
    let sessionHeard = false; let vadPaint = 0;
    let silenceMs = 0; let quietMs = 0; let noise = 0.008;
    let uploads = Promise.resolve();
    const stopRecStream = () => {
      try { recStream?.getTracks().forEach((tr) => tr.stop()); }
      catch { /* already stopped */ }
      recStream = null;
    };
    const pickMime = () => {
      const MR = window.MediaRecorder;
      if (!MR || typeof MR.isTypeSupported !== 'function') return '';
      for (const m of ['audio/webm;codecs=opus', 'audio/webm',
        'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg']) {
        try { if (MR.isTypeSupported(m)) return m; } catch { /* next */ }
      }
      return '';
    };
    let lastCutPauseMs = null;   // silence waited before the last cut
    // Cut thresholds (Phase 140): 500 ms of silence after at least 350 ms of
    // speech. HQ can tune both in org_settings: lane_pause_ms, lane_min_speech_ms.
    let PAUSE_MS = 500, MIN_SPEECH_MS = 450;
    let MIN_RMS = 0.01, MIN_PEAK = 0.015;   // HQ-tunable: lane_min_rms, lane_min_peak
    let segPeak = 0, lastSkipWhy = '', liveRms = 0, liveThreshold = 0;
    getOrgSetting('lane_min_rms').then((v) => { const n = Number(v); if (n > 0 && n < 0.2) MIN_RMS = n; }).catch(() => {});
    getOrgSetting('lane_min_peak').then((v) => { const n = Number(v); if (n > 0 && n < 0.5) MIN_PEAK = n; }).catch(() => {});
    // live microphone readout while Speak is on, so a skipped sentence can be
    // read against real numbers instead of guessed ones
    let micMeter = null;
    const startMicMeter = () => { if (!micMeter) micMeter = setInterval(() => {
      setDiag('mic', t('room.micLive', { now: liveRms.toFixed(3), floor: liveThreshold.toFixed(3), peak: segPeak.toFixed(3) })); }, 500); };
    const stopMicMeter = () => { if (micMeter) { clearInterval(micMeter); micMeter = null; setDiag('mic', ''); } };
    const FILLER = new Set(['thank you', 'thanks', 'thank you for watching', 'obrigado', 'obrigada', 'merci', 'gracias', 'bye', 'e aí', 'e ai', 'salut', 'hello', 'um', 'uh', 'you', 'the', 'so']);
    getOrgSetting('lane_pause_ms').then((v) => { const n = Number(v); if (n >= 250 && n <= 2000) PAUSE_MS = n; }).catch(() => {});
    getOrgSetting('lane_min_speech_ms').then((v) => { const n = Number(v); if (n >= 150 && n <= 2000) MIN_SPEECH_MS = n; }).catch(() => {});
    // Keep the transcribe function awake while Speak is on (a cold function
    // adds up to a second to the first clip after a quiet spell).
    let keepWarm = null;
    const warmEars = () => { db().functions.invoke('transcribe', { method: 'GET' }).catch(() => {}); };
    const startKeepWarm = () => { if (!keepWarm) { warmEars(); keepWarm = setInterval(warmEars, 4 * 60 * 1000); } };
    const stopKeepWarm = () => { if (keepWarm) { clearInterval(keepWarm); keepWarm = null; } };
    // Warm from the moment the room is open: the 8 Sep log showed the first
    // clip paying a 3-second cold start because Speak came before the ping.
    startKeepWarm();
    window.addEventListener('hashchange', stopKeepWarm, { once: true });
    const cloudTranscribe = async (blob) => {
      if (!blob || blob.size < 1200) return; // a click, no speech
      const tmPause = lastCutPauseMs; lastCutPauseMs = null;
      const tmSent = performance.now();
      recBusy = true;
      if (speaking) micChip.textContent = '🎤 ' + t('room.earsSending');
      try {
        const fd = new FormData();
        const ext = (blob.type || '').includes('mp4') ? 'm4a'
          : (blob.type || '').includes('ogg') ? 'ogg' : 'webm';
        fd.append('audio', blob, `clip.${ext}`);
        fd.append('lang', 'auto');
        const { data, error } = await db().functions.invoke('transcribe',
          { body: fd });
        if (error) throw error;
        let text = String(data?.text || '').trim();
        const tmEars = Math.round(performance.now() - tmSent);
        const fnMs = Number(data?.fn_ms) || null;
        const lang2 = data?.language ? String(data.language).slice(0, 2) : null;
        const ROOM_LANGS = LANGS.map(([c]) => c);
        if (lang2 && !ROOM_LANGS.includes(lang2) && text.length < 60) { setDiag('skip', t('room.clipNoise')); text = ''; }
        if (text && FILLER.has(text.toLowerCase().replace(/[^\p{L}\s]/gu, '').trim())) { setDiag('skip', t('room.clipNoise')); text = ''; }
        if (text && lang2) detectedLang = lang2;
        setDiag('capture', '');
        if (text) await handleFinal(text, { pause: tmPause, ears: tmEars, size: blob.size,
          upload: fnMs ? Math.max(0, tmEars - fnMs) : null, transcribe: Number(data?.groq_ms) || null,
          lang: data?.language ? String(data.language).slice(0, 2) : null });
      } catch (err) {
        setDiag('ears', t('room.earsError', {
          why: String(err?.message || err || 'error').slice(0, 80) }), true);
      } finally {
        recBusy = false;
        micChip.textContent = '🎤 ' + (speaking
          ? t('room.earsListening') : t('room.micIdle'));
      }
    };
    // Clips are sent in the order they were spoken, one after another.
    const enqueue = (blob) => {
      uploads = uploads.then(() => cloudTranscribe(blob)).catch(() => {});
    };
    // One MediaRecorder per sentence. Cutting at a pause and starting a
    // new one is how "tap once, talk naturally" becomes sentence-by-
    // sentence interpretation instead of one clip at the end.
    const startSegment = () => {
      if (!recStream) return;
      // Phase 143: each recorder owns its chunks and its "had speech" flag.
      // rec.stop() finishes asynchronously; the old code reset the shared
      // flag when the next segment started, so the finished clip read
      // "no speech" and was thrown away (works once, then stops).
      const r = new MediaRecorder(recStream,
        recMime ? { mimeType: recMime } : undefined);
      const chunks = [];
      r.__had = false;
      r.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        const blob = new Blob(chunks, { type: r.mimeType || recMime || 'audio/webm' });
        if (r.__had) enqueue(blob);
        else { setDiag('skip', lastSkipWhy || t('room.clipNoSpeech')); lastSkipWhy = ''; }
      };
      rec = r;
      r.start();
      segStartAt = Date.now(); segHadSpeech = false; segPeak = 0;
      speechMs = 0; silenceMs = 0;
    };
    const cutSegment = () => {
      try {
        if (rec && rec.state !== 'inactive') {
          // a clip is speech only if it had at least MIN_SPEECH_MS above the
          // floor and a clear peak; otherwise it is noise and never leaves
          // the device (Whisper invents words for noise)
          const ok = segHadSpeech && speechMs >= MIN_SPEECH_MS && segPeak >= MIN_PEAK;
          rec.__had = ok;
          if (!ok && segHadSpeech) lastSkipWhy = `${t('room.clipNoise')} (${t('room.micNumbers', { peak: segPeak.toFixed(3), floor: MIN_PEAK.toFixed(3), ms: Math.round(speechMs) })})`;
          rec.stop();
        }
      } catch { /* nothing recording */ }
    };
    const vadTick = () => {
      if (!vadCtx || !vadBuf) return;
      const an = vadCtx.__an;
      try {
        if (an.getFloatTimeDomainData) an.getFloatTimeDomainData(vadBuf);
        else {
          const b = new Uint8Array(vadBuf.length);
          an.getByteTimeDomainData(b);
          for (let k = 0; k < b.length; k += 1) vadBuf[k] = (b[k] - 128) / 128;
        }
      } catch { return; }
      let sum = 0;
      for (let k = 0; k < vadBuf.length; k += 1) sum += vadBuf[k] * vadBuf[k];
      const rms = Math.sqrt(sum / vadBuf.length);
      // adaptive noise floor: drifts slowly toward the quiet level
      if (rms < noise * 1.5) noise = noise * 0.9 + rms * 0.1;
      // Phase 148: the floor is measured, not guessed. MIN_RMS (default
      // 0.01, HQ-tunable) or three times the room's own quiet level,
      // whichever is higher; the live readout on the grey line shows both.
      const threshold = Math.max(MIN_RMS, noise * 3);
      liveRms = rms; liveThreshold = threshold;
      const dt = 100;
      if (rms > threshold) {
        speechMs += dt; silenceMs = 0; quietMs = 0;
        segPeak = Math.max(segPeak, rms);
        if (rec) rec.__had = true;
        segHadSpeech = true; sessionHeard = true;
      } else {
        silenceMs += dt; quietMs += dt;
      }
      // live input level so silence is visible, not mysterious
      vadPaint = (vadPaint + 1) % 4;
      if (vadPaint === 0 && speaking && !recBusy) {
        const bars = ['▁▁▁▁', '▂▁▁▁', '▃▃▁▁', '▅▅▃▁', '▆▆▅▃'];
        const lvl = Math.min(4, Math.floor((rms / Math.max(threshold, 0.001)) * 2));
        micChip.textContent = '🎤 ' + t('room.earsListening')
          + '  ' + bars[lvl];
      }
      const segMs = Date.now() - segStartAt;
      if (segHadSpeech && speechMs >= MIN_SPEECH_MS && silenceMs >= PAUSE_MS) {
        // a sentence just ended: send it, keep listening
        lastCutPauseMs = Math.round(silenceMs);
        cutSegment(); startSegment();
      } else if (segHadSpeech && segMs > 20000) {
        // a very long stretch without a pause: send what we have
        cutSegment(); startSegment();
      } else if (!segHadSpeech && segMs > 30000) {
        // half a minute of nothing: restart quietly so buffers stay small
        cutSegment(); startSegment();
      }
      if (quietMs >= 90000) {
        // ninety seconds of silence: assume Speak was forgotten
        setSpeaking(false, 'timer');
      }
    };
    const recStart = async () => {
      recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Show WHICH microphone the page received. If Windows meters one
      // device while Chrome hands us another, this line exposes it.
      try {
        const label = recStream.getAudioTracks()[0]?.label || '';
        if (label) setDiag('mic-dev', t('room.micUsing', { name: label }));
      } catch { /* label unavailable */ }
      recMime = pickMime();
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        try {
          vadCtx = new AC();
          const src = vadCtx.createMediaStreamSource(recStream);
          const an = vadCtx.createAnalyser();
          an.fftSize = 1024;
          src.connect(an);
          vadCtx.__an = an;
          vadBuf = new Float32Array(an.fftSize);
        } catch { vadCtx = null; vadBuf = null; }
      }
      quietMs = 0; noise = 0.008; sessionHeard = false;
      startSegment();
      micChip.textContent = '🎤 ' + t('room.earsListening');
      if (vadCtx) vadTimer = setInterval(vadTick, 100);
      else {
        // no analyser on this browser: fall back to fixed 8-second clips
        vadTimer = setInterval(() => {
          segHadSpeech = true; cutSegment(); startSegment();
        }, 8000);
      }
    };
    const recStop = () => {
      if (vadTimer) { clearInterval(vadTimer); vadTimer = null; }
      cutSegment();
      rec = null;
      try { vadCtx?.close(); } catch { /* fine */ }
      vadCtx = null; vadBuf = null;
      // give the last onstop a moment to collect its data, then release
      setTimeout(stopRecStream, 250);
    };
    const cloudSetSpeaking = (on, source = 'tap') => {
      speaking = !!on;
      paintSpeak();
      if (speaking) {
        setDiag('ears', '');
        startKeepWarm(); startMicMeter();
        recStart().catch(() => {
          speaking = false; paintSpeak();
          micChip.textContent = '🎤 ' + t('room.micBlocked');
          setDiag('ears', t('room.earsMicError'), true);
        });
      } else {
        recStop(); stopMicMeter();
        if (!sessionHeard) {
          setDiag('ears', t('room.earsNoSpeech'), true);
        }
      }
      // Booth mode keeps the call microphone closed: the interpreter is
      // the only voice listeners hear. call_raw_voice = 'on' reopens it.
      if (source !== 'engine' && rawVoice) syncCallMic(speaking);
    };
    (async () => {
      try {
        const fns = db().functions;
        if (!fns || !window.MediaRecorder || !navigator.mediaDevices) return;
        const { data, error } = await fns.invoke('transcribe', { method: 'GET' });
        if (error || !data?.configured) return;
        // cloud ears ready: every browser can now speak
        setSpeaking = cloudSetSpeaking;
        setDiag('browser', '');
        setDiag('sr', '');
        setDiag('capture', '');
        micChip.textContent = '🎤 ' + t('room.micIdle');
        speakBtn.title = t('room.earsHint');
        capFeed.append(el('p', { class: 'muted', style: 'font-size:12px;',
          text: t('room.earsReady') }));
      } catch { /* cloud not available; browser recogniser stays */ }
    })();
    paintSpeak();
  }
}
