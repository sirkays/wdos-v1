(function () {
  var cfg = document.getElementById('cfg'), $ = function (id) { return document.getElementById(id); };
  var status = $('status'), grid = $('grid'), speak = $('speak'), cam = $('cam'), caps = $('caps');
  var emptyStage = $('stage-empty'), pCount = $('participant-count'), ccOverlay = $('live-cc-overlay'), langBadge = $('active-lang-badge');

  function setLabel(btn, text) {
    if (!btn) return;
    var lbl = btn.querySelector('.btn-label');
    if (lbl) lbl.textContent = text;
    else btn.textContent = text;
  }

  function setStatus(text, state) {
    if (!status) return;
    status.textContent = text;
    var dot = $('status-dot');
    if (dot) {
      dot.setAttribute('data-state', state || 'connecting');
    }
  }

  if (cfg.dataset.ready !== '1') {
    setStatus('Not connected', 'offline');
    return;
  }

  var L = window.LivekitClient, room, myLang = $('lang').value, tiles = {};
  var csrf = cfg.querySelector('[name=csrfmiddlewaretoken]').value;

  var BOT = 'wdos-translator-bot', audio = [], amMod = false, micAllowed = true, camAllowed = true, shareAllowed = true;
  var pPerms = {};   // identity -> { mic: bool, cam: bool, share: bool }
  var handUp = false, hands = {};   // raise hand: my own state, and who had a hand up last time we looked (for one toast per raise)
  // Participant cards: never more than MAX_CARDS on screen, however many people are in the room. People with their camera on
  // always get a card; the remaining slots go to the host, then whoever spoke most recently (see pickCards).
  var MAX_CARDS = 6, shown = {}, joinSeq = {}, seqN = 0, lastSpoke = {}, gone = {};   // gone: removed by the host, still shown by LiveKit for a moment
  var AVATAR_COLORS = [
    'linear-gradient(135deg, #d4006a 0%, #9b004e 100%)',
    'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
    'linear-gradient(135deg, #059669 0%, #047857 100%)',
    'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
    'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
    'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)'
  ];

  function isBot(p) { return p.identity.indexOf(BOT) === 0; }
  function metaOf(p) { try { return JSON.parse((p && p.metadata) || '{}'); } catch (e) { return {}; } }
  function langOf(p) { return metaOf(p).lang || 'en'; }
  function permOf(p) {
    var m = metaOf(p), cached = pPerms[p.identity] || {};
    return {
      mic: cached.mic !== undefined ? cached.mic : (m.micAllowed !== false),
      cam: cached.cam !== undefined ? cached.cam : (m.camAllowed !== false),
      share: cached.share !== undefined ? cached.share : (m.shareAllowed !== false)
    };
  }
  function syncMyMeta() {
    if (!room || !room.localParticipant) return;
    room.localParticipant.setMetadata(JSON.stringify({
      lang: myLang, moderator: amMod, micAllowed: micAllowed, camAllowed: camAllowed, shareAllowed: shareAllowed, hand: handUp
    }));
  }

  var toastTimer = null;
  function showMediaToast(text) {
    var t = $('media-ctrl-toast');
    if (!t) return;
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 4500);
  }

  var PERM_KEYS = ['mic', 'cam', 'share'];

  // Host commands (allow/lock mic, camera, screen share; lower a hand; remove someone) go through the server, which checks the
  // sender is a real moderator and then pushes the command to the person. Browsers only obey commands that come from the
  // server, so a participant cannot forge "remove" or "end meeting" over the data channel.
  function sendMediaCtrl(targetIdentity, changes) {
    if (!amMod || !room || !cfg.dataset.controlUrl) return;
    function remember(id, base) {
      var next = {};
      PERM_KEYS.forEach(function (k) { next[k] = changes[k] !== undefined ? changes[k] : base[k]; });
      pPerms[id] = next;
    }
    if (targetIdentity === '*') {
      room.remoteParticipants.forEach(function (p) { if (!isBot(p)) remember(p.identity, permOf(p)); });
    } else if (PERM_KEYS.some(function (k) { return changes[k] !== undefined; })) {
      var who = room.remoteParticipants.get(targetIdentity);
      remember(targetIdentity, who ? permOf(who) : { mic: true, cam: true, share: true });
    }
    var fd = new FormData();
    fd.append('csrfmiddlewaretoken', csrf);
    fd.append('target', targetIdentity);
    PERM_KEYS.forEach(function (k) { if (changes[k] !== undefined) fd.append(k, changes[k] ? '1' : '0'); });
    if (changes.lowerHand) fd.append('lowerHand', '1');
    if (changes.kick) fd.append('kick', '1');
    fetch(cfg.dataset.controlUrl, { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'x-requested-with': 'fetch' } })
      .then(function (r) { if (!r.ok) throw new Error('control'); })
      .catch(function () { showMediaToast('Could not send that to the room \u2014 check your connection'); });
    renderModControls();
  }

  function kickParticipant(identity) {
    if (!amMod || !identity) return;
    if (identity.indexOf('guest-') === 0) {
      // guests are removed through the waiting-room endpoint, which also blocks them from coming straight back in
      var gid = identity.slice(6), gp = $('guestpanel');
      if (gp && gp.dataset.json && /^\d+$/.test(gid)) {
        var fd = new FormData();
        fd.append('csrfmiddlewaretoken', csrf);
        fetch(gp.dataset.json + gid + '/remove/', {
          method: 'POST', body: fd, credentials: 'same-origin', headers: { 'x-requested-with': 'fetch' }
        }).then(function () { document.dispatchEvent(new CustomEvent('wdos:lobby')); }).catch(function () {});
      }
    } else {
      sendMediaCtrl(identity, { kick: true });
    }
    gone[identity] = true;
    if (tiles[identity]) remove({ identity: identity });
    else { layoutGrid(); renderModControls(); }
  }

  // ---- People panel (moderators): search anyone, then allow or lock mic / camera / screen sharing ------------------------
  // Built for a big room: only rows that match the search are drawn, repaints are batched, and nothing is drawn while the panel
  // is closed. The video cards on the stage are a separate, capped view (see pickCards).
  var plQuery = '', plHandsOnly = false, modTimer = null, armedRemove = null, armedTimer = null;
  var plList = $('live-participants-list'), plSearch = $('pl-search'), plClear = $('pl-search-clear');
  var plHandsBtn = $('pl-hands-filter'), plResult = $('pl-result');
  var ICONS = {
    mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>',
    cam: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
    share: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    manage: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>'
  };
  var PERM_LABEL = { mic: 'Microphone', cam: 'Camera', share: 'Screen sharing' };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function icon(name, size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
  }

  function peopleOpen() {
    var d = $('meet-drawer'), pane = $('drawer-pane-people'), seg = $('seg-people');
    return !!(d && pane && !d.classList.contains('collapsed') && !pane.hidden && (!seg || !seg.hidden));
  }

  function renderModControls() {            // batched: many room events can ask for a repaint in the same moment
    if (!amMod || !room || modTimer) return;
    modTimer = setTimeout(function () { modTimer = null; paintModControls(); }, 150);
  }

  function personRow(p) {
    var prm = permOf(p), up = !!hands[p.identity], name = p.name || 'Participant';
    var li = el('li', 'pl-row' + (up ? ' hand-up' : ''));
    var av = el('span', 'pl-av', initialsOf(p.name));
    av.style.background = colorFor(p.identity || p.name);
    av.setAttribute('aria-hidden', 'true');

    var main = el('div', 'pl-main');
    var nm = el('span', 'pl-name', name);
    nm.title = name;
    var meta = el('div', 'pl-meta');
    meta.appendChild(el('span', 'pl-lang', (langOf(p) || 'en').toUpperCase()));
    var live = [];
    if (p.isScreenShareEnabled) live.push('Presenting');
    if (p.isMicrophoneEnabled) live.push('Mic on');
    if (p.isCameraEnabled) live.push('Camera on');
    if (live.length) meta.appendChild(el('span', 'pl-live', live.join(' \u00B7 ')));
    if (up) {
      var hb = el('button', 'pl-hand');
      hb.type = 'button';
      hb.title = 'Hand raised \u2014 click to lower it';
      hb.textContent = '\u270B Lower';
      hb.onclick = function () { sendMediaCtrl(p.identity, { lowerHand: true }); };
      meta.appendChild(hb);
    }
    main.appendChild(nm);
    main.appendChild(meta);

    var ctrls = el('div', 'pl-ctrls');
    PERM_KEYS.forEach(function (k) {
      var on = prm[k];
      var b = el('button', 'pl-tog ' + (on ? 'on' : 'off'));
      b.type = 'button';
      b.innerHTML = icon(k, 15);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.title = PERM_LABEL[k] + (on ? ' allowed \u2014 click to lock' : ' locked \u2014 click to allow');
      b.setAttribute('aria-label', PERM_LABEL[k] + ' for ' + name + ': ' + (on ? 'allowed' : 'locked'));
      b.onclick = function () { var change = {}; change[k] = !on; sendMediaCtrl(p.identity, change); };
      ctrls.appendChild(b);
    });
    var armed = armedRemove === p.identity;
    var kb = el('button', 'pl-remove' + (armed ? ' armed' : ''));
    kb.type = 'button';
    if (armed) kb.textContent = 'Remove?'; else kb.innerHTML = icon('x', 13);
    kb.title = armed ? 'Click again to remove ' + name : 'Remove from the meeting';
    kb.setAttribute('aria-label', 'Remove ' + name + ' from the meeting');
    kb.onclick = function () {
      if (armedRemove === p.identity) { armedRemove = null; clearTimeout(armedTimer); kickParticipant(p.identity); return; }
      armedRemove = p.identity;
      clearTimeout(armedTimer);
      armedTimer = setTimeout(function () { armedRemove = null; paintModControls(); }, 3000);
      paintModControls();
    };
    ctrls.appendChild(kb);

    li.appendChild(av);
    li.appendChild(main);
    li.appendChild(ctrls);
    return li;
  }

  function paintModControls() {
    if (!amMod || !room) return;
    var all = [];
    room.remoteParticipants.forEach(function (p) { if (!isBot(p) && !gone[p.identity]) all.push(p); });
    var handsN = all.filter(function (p) { return hands[p.identity]; }).length;
    document.querySelectorAll('[data-people-count]').forEach(function (e) { e.textContent = String(all.length); });
    if (plHandsBtn) {
      plHandsBtn.hidden = handsN === 0 && !plHandsOnly;
      var hc = $('pl-hands-count'); if (hc) hc.textContent = String(handsN);
    }
    if (!plList || !peopleOpen()) return;

    var q = plQuery.trim().toLowerCase();
    var rows = all.filter(function (p) {
      if (plHandsOnly && !hands[p.identity]) return false;
      return !q || (p.name || '').toLowerCase().indexOf(q) !== -1 || (langOf(p) || '').indexOf(q) === 0;
    });
    // Raised hands first, then alphabetical, so a name is easy to find by scanning as well as by searching.
    rows.sort(function (a, b) {
      var h = (hands[b.identity] ? 1 : 0) - (hands[a.identity] ? 1 : 0);
      return h || (a.name || '').localeCompare(b.name || '');
    });
    if (plResult) {
      plResult.textContent = !all.length ? '' : (q || plHandsOnly)
        ? rows.length + ' of ' + all.length + (all.length === 1 ? ' person' : ' people')
        : all.length + (all.length === 1 ? ' person' : ' people') + ' in the room';
    }
    var frag = document.createDocumentFragment();
    if (!rows.length) {
      frag.appendChild(el('li', 'pl-empty', !all.length ? 'Nobody else is in the room yet.'
        : plHandsOnly && !q ? 'No raised hands right now.' : 'No one matches \u201C' + plQuery.trim() + '\u201D.'));
    } else {
      rows.forEach(function (p) { frag.appendChild(personRow(p)); });
    }
    var keep = plList.scrollTop;
    plList.innerHTML = '';
    plList.appendChild(frag);
    plList.scrollTop = keep;
  }

  if (plSearch) plSearch.addEventListener('input', function () {
    plQuery = plSearch.value;
    if (plClear) plClear.hidden = !plQuery;
    paintModControls();
  });
  if (plSearch) plSearch.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && plSearch.value) { e.stopPropagation(); plSearch.value = ''; plQuery = ''; if (plClear) plClear.hidden = true; paintModControls(); }
  });
  if (plClear) plClear.addEventListener('click', function () {
    plSearch.value = ''; plQuery = ''; plClear.hidden = true; paintModControls(); plSearch.focus();
  });
  if (plHandsBtn) plHandsBtn.addEventListener('click', function () {
    plHandsOnly = !plHandsOnly;
    plHandsBtn.setAttribute('aria-pressed', plHandsOnly ? 'true' : 'false');
    plHandsBtn.classList.toggle('on', plHandsOnly);
    paintModControls();
  });
  document.addEventListener('wdos:people-shown', paintModControls);
  // "Manage" on a video card: open the people panel already searched for that person.
  document.addEventListener('wdos:manage', function (ev) {
    var name = (ev.detail && ev.detail.name) || '';
    if (plSearch) { plSearch.value = name; plQuery = name; if (plClear) plClear.hidden = !name; }
    document.dispatchEvent(new CustomEvent('wdos:open-people'));
    paintModControls();
  });
  // ---- Raise hand -----------------------------------------------------------------------------------------
  // The raised state travels in each person's signed participant metadata (like language), so late joiners see it too
  // and nobody can raise a hand on someone else's behalf. The host can lower a hand with a command.
  var handBtn = $('hand');

  function renderHandControls() {
    if (handBtn) {
      handBtn.classList.toggle('on', handUp);
      handBtn.setAttribute('aria-pressed', handUp ? 'true' : 'false');
      handBtn.title = handUp ? 'Lower your hand' : 'Raise your hand';
      handBtn.setAttribute('aria-label', handUp ? 'Lower your hand' : 'Raise your hand');
    }
    document.querySelectorAll('[data-hand-toggle]').forEach(function (b) {
      b.classList.toggle('hand-on', handUp);
      b.setAttribute('aria-pressed', handUp ? 'true' : 'false');
      var st = b.querySelector('[data-hand-state]');
      if (st) st.textContent = handUp ? 'Hand raised · tap to lower' : 'Let the host know you want to speak';
      var ttl = b.querySelector('strong');
      if (ttl) ttl.textContent = handUp ? 'Lower hand' : 'Raise hand';
    });
  }

  function renderHands() {
    if (!room || !room.localParticipant) return;
    var people = [room.localParticipant];
    room.remoteParticipants.forEach(function (p) { if (!isBot(p)) people.push(p); });
    people.forEach(function (p) {
      var up = p.isLocal ? handUp : !!metaOf(p).hand;
      var d = tiles[p.identity];
      if (d) d.classList.toggle('hand-up', up);
      if (!p.isLocal && up && !hands[p.identity]) showMediaToast('\u270B ' + (p.name || 'A participant') + ' raised a hand');
      hands[p.identity] = up;
    });
    renderModControls();
  }

  function setHand(on) {
    handUp = !!on;
    renderHandControls();
    syncMyMeta();
    renderHands();
    if (handUp) showMediaToast('\u270B Hand raised \u2014 everyone can see it');
  }

  if (handBtn) handBtn.addEventListener('click', function () { setHand(!handUp); });
  document.querySelectorAll('[data-hand-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      setHand(!handUp);
      var closeMore = $('more-close-btn'); if (closeMore) closeMore.click();
    });
  });
  renderHandControls();

  function initialsOf(name) {
    var parts = (name || '?').replace(/\(Guest\)/i, '').trim().split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return (parts[0] || '?').charAt(0).toUpperCase();
  }

  function colorFor(str) {
    var h = 0, s = str || 'user';
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  }

  function everyone() {          // me first, then everyone else except the interpreter bot
    var out = [];
    if (room && room.localParticipant) out.push(room.localParticipant);
    if (room) room.remoteParticipants.forEach(function (p) { if (!isBot(p) && !gone[p.identity]) out.push(p); });
    return out;
  }

  function syncGridCount() {
    var count = everyone().length;
    if (pCount) pCount.textContent = String(count);
    if (room && room.state === 'connected') {
      setStatus((amMod ? 'Connected as moderator' : 'Connected as listener') + ' \u00B7 ' + count + ' in room', 'live');
    }
  }

  // ---- Participant cards (never more than MAX_CARDS) --------------------------------------------------------
  // Everyone in the room has a tile element, but only the best MAX_CARDS are put on the stage:
  //   1. people with their camera on (anyone who shares video is included, up to the cap),
  //   2. then the host(s), then whoever spoke most recently, then people already on screen (so cards do not jump around),
  //   3. then me, then whoever joined first.
  // Video is only downloaded for the cards on screen, so a big room costs no more bandwidth than a small one.
  function hasCam(p) { try { return !!p.isCameraEnabled; } catch (e) { return false; } }
  function isMod(p) { return p.isLocal ? amMod : !!metaOf(p).moderator; }
  function recent(id) { var t = lastSpoke[id] || 0; return Date.now() - t < 20000 ? t : 0; }

  function better(a, b) {         // < 0: a deserves a card before b
    var ia = a.identity, ib = b.identity, ca = hasCam(a), cb = hasCam(b);
    if (ca !== cb) return ca ? -1 : 1;
    if (ca) {
      if (!!shown[ia] !== !!shown[ib]) return shown[ia] ? -1 : 1;
      if (recent(ib) !== recent(ia)) return recent(ib) - recent(ia);
    } else {
      if (isMod(a) !== isMod(b)) return isMod(a) ? -1 : 1;
      if (recent(ib) !== recent(ia)) return recent(ib) - recent(ia);
      if (!!shown[ia] !== !!shown[ib]) return shown[ia] ? -1 : 1;
    }
    if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
    return joinSeq[ia] - joinSeq[ib];
  }

  function pickCards(list) {
    list.forEach(function (p) { if (joinSeq[p.identity] === undefined) joinSeq[p.identity] = seqN++; });
    var chosen = list.slice().sort(better).slice(0, MAX_CARDS);
    var me = room && room.localParticipant;
    if (me && hasCam(me) && chosen.indexOf(me) === -1 && chosen.length) chosen[chosen.length - 1] = me;   // always see my own video
    return chosen;
  }

  var layoutTimer = null, moreChip = $('stage-more');
  function scheduleLayout() {     // batched: a burst of room events lays the cards out once
    if (layoutTimer) return;
    layoutTimer = setTimeout(layoutGrid, 350);
  }

  function layoutGrid() {
    clearTimeout(layoutTimer);
    layoutTimer = null;
    if (!room || !grid || !room.localParticipant) return;
    var list = everyone(), chosen = pickCards(list), next = {};
    chosen.forEach(function (p) { next[p.identity] = true; });
    // Take cards away from people who lost their place. The tile is kept (not destroyed) so it is ready if they come back.
    // Cards already on screen are never re-inserted: moving a <video> in the page would pause it.
    Object.keys(shown).forEach(function (id) {
      if (!next[id] && tiles[id] && tiles[id].parentNode === grid) grid.removeChild(tiles[id]);
    });
    chosen.forEach(function (p) {
      var d = tile(p);
      if (d.parentNode !== grid) grid.appendChild(d);
    });
    shown = next;
    grid.setAttribute('data-count', String(chosen.length));
    if (emptyStage) emptyStage.style.display = chosen.length ? 'none' : '';
    if (moreChip) {
      moreChip.hidden = list.length <= chosen.length;
      var t = moreChip.querySelector('[data-more-text]');
      if (t) t.textContent = 'Showing ' + chosen.length + ' of ' + list.length;
      if (stageEl) stageEl.classList.toggle('has-more', !moreChip.hidden);
    }
    syncGridCount();
    syncSubscriptions();          // start video for the new cards, stop it for the ones that left
  }

  // With the interpreter present, hear each speaker in YOUR language: their real voice if they speak it,
  // otherwise the interpreter's lang:<yours> voice. Without the interpreter, hear everyone as they speak.
  function botHere() {
    var here = false;
    room && room.remoteParticipants.forEach(function (p) { if (isBot(p)) here = true; });
    return here;
  }

  // The ONE rule for what reaches my ears. Anything else is never even downloaded (not just muted), so I cannot hear
  // the interpreter voicing my own words, or other languages' voices, however the audio elements behave.
  // Interpretation switch (per listener, remembered on this device). OFF = hear every speaker's original voice and
  // never download the interpreter's tracks. ON = the rule above.
  var interpOn = true;
  try { interpOn = localStorage.getItem('wdos_interp') !== '0'; } catch (e) {}

  function wantsAudio(p, pub, bot) {
    if (p.isLocal) return false;
    if (isBot(p)) return interpOn && ((pub && pub.trackName) || '') === 'lang:' + myLang;
    if (!interpOn) return true;
    return !(bot === undefined ? botHere() : bot) || langOf(p) === myLang;
  }

  // Reflect the switch in every control that mirrors it (more-sheet toggle, language badge). The listening language itself
  // is fixed before joining (members: meeting page; guests: join page) and cannot be changed from inside the room.
  var myLangName = cfg.dataset.langName || myLang.toUpperCase();
  function renderInterpUI() {
    document.querySelectorAll('[data-interp-toggle]').forEach(function (b) {
      b.classList.toggle('active', interpOn);
      b.setAttribute('aria-pressed', interpOn ? 'true' : 'false');
      var st = b.querySelector('[data-interp-state]');
      if (st) st.textContent = interpOn ? 'On · hearing ' + myLangName : 'Off · hearing original voices';
    });
    if (langBadge) langBadge.textContent = interpOn ? myLangName : 'Original voice';
  }

  function setInterp(on) {
    interpOn = !!on;
    try { localStorage.setItem('wdos_interp', interpOn ? '1' : '0'); } catch (e) {}
    renderInterpUI();
    applyAudio();
  }

  // Subscribe only to what I need: the audio I should hear, screen shares, and video for the cards on screen. Re-run whenever
  // someone joins, publishes, changes language or the cards change.
  function syncSubscriptions() {
    if (!room || room.state !== 'connected') return;
    var bot = botHere();
    room.remoteParticipants.forEach(function (p) {
      p.trackPublications.forEach(function (pub) {
        var want = pub.kind === 'video'
          ? (pub.source === L.Track.Source.ScreenShare || !!shown[p.identity])
          : wantsAudio(p, pub, bot);
        if (pub._wdosWant === want) return;
        pub._wdosWant = want;
        pub.setSubscribed(want);
      });
    });
  }

  function applyAudio() {
    syncSubscriptions();
    var botHereNow = botHere();
    audio.forEach(function (a) {
      a.el.muted = !wantsAudio(a.p, a.pub, botHereNow);    // belt and braces: also silent if one slipped through
    });
    Object.keys(tiles).forEach(function (id) {
      var d = tiles[id];
      if (d && d._participant) {
        var b = d.querySelector('.tile-lang');
        if (b) b.textContent = (langOf(d._participant) || 'en').toUpperCase();
      }
    });
    renderModControls();
  }

  // ---- Screen sharing -------------------------------------------------------------------------------------
  // A shared screen gets the big presentation area; everyone's camera tiles shrink to a strip beside/under it.
  var screens = {};   // identity -> presentation element
  var screenStage = $('screen-stage'), stageEl = document.querySelector('.meet-stage');
  var shareBtn = $('share'), sharing = false;

  function syncScreenLayout() {
    var n = Object.keys(screens).length;
    if (screenStage) screenStage.hidden = n === 0;
    if (stageEl) stageEl.classList.toggle('has-screen', n > 0);
  }

  function removeScreen(p) {
    var d = screens[p.identity];
    if (!d) return;
    d.remove();
    delete screens[p.identity];
    syncScreenLayout();
  }

  function attachScreen(track, p) {
    if (!screenStage || screens[p.identity]) return;
    var d = document.createElement('div');
    d.className = 'screen-tile' + (p.isLocal ? ' is-local' : '');
    var label = document.createElement('div');
    label.className = 'screen-label';
    label.textContent = p.isLocal ? 'You are presenting to everyone' : ((p.name || 'Someone') + ' is presenting');
    if (p.isLocal) {
      // Never mirror my own screen back at me (it would recurse); show a calm placeholder with a stop button instead.
      var ph = document.createElement('div');
      ph.className = 'screen-self';
      ph.innerHTML = '<strong>Your screen is being shared</strong><span>Everyone in the meeting can see it.</span>';
      var stop = document.createElement('button');
      stop.type = 'button'; stop.className = 'screen-stop'; stop.textContent = 'Stop sharing';
      stop.onclick = function () { setScreenShare(false); };
      ph.appendChild(stop);
      d.appendChild(ph);
    } else {
      var v = track.attach(); v.muted = true; v.setAttribute('playsinline', '');
      d.appendChild(v);
      var fs = document.createElement('button');
      fs.type = 'button'; fs.className = 'screen-fs'; fs.title = 'Full screen'; fs.setAttribute('aria-label', 'Full screen');
      fs.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
      fs.onclick = function () {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (d.requestFullscreen) d.requestFullscreen();
        else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();   // iOS Safari
      };
      d.appendChild(fs);
    }
    d.appendChild(label);
    screens[p.identity] = d;
    screenStage.appendChild(d);
    syncScreenLayout();
  }

  function shareLocked() { return !shareAllowed && !amMod; }

  function renderShareBtn() {
    var locked = shareLocked();
    if (shareBtn) {
      shareBtn.classList.toggle('on', sharing);
      shareBtn.classList.toggle('is-locked', locked);
      shareBtn.setAttribute('aria-pressed', sharing ? 'true' : 'false');
      shareBtn.disabled = locked && !sharing;
      shareBtn.title = locked && !sharing ? 'Screen sharing is locked \u2014 ask the host to allow it'
        : sharing ? 'Stop presenting' : 'Present your screen';
      setLabel(shareBtn, sharing ? 'Stop sharing' : 'Share');
    }
    document.querySelectorAll('[data-share-toggle]').forEach(function (b) {
      b.disabled = locked && !sharing;
      b.classList.toggle('is-locked', locked && !sharing);
    });
    document.querySelectorAll('[data-share-state]').forEach(function (e) {
      e.textContent = locked && !sharing ? 'Locked \u2014 ask the host' : sharing ? 'Sharing now \u00B7 tap to stop' : 'Present to everyone';
    });
  }

  function setScreenShare(on) {
    if (!room || room.state !== 'connected') return Promise.resolve();
    if (on && shareLocked()) { showMediaToast('Screen sharing is locked \u2014 ask the host to allow it'); return Promise.resolve(); }
    return room.localParticipant.setScreenShareEnabled(!!on, on ? { audio: false, contentHint: 'detail' } : undefined)
      .then(function () { sharing = !!on; renderShareBtn(); })
      .catch(function () { sharing = false; renderShareBtn(); });   // picker cancelled or blocked: stay as we were
  }

  // Browsers on phones and tablets cannot capture the screen: hide the control instead of showing a dead button.
  var canShare = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  document.querySelectorAll('[data-share-control]').forEach(function (e) { e.hidden = !canShare; });
  if (shareBtn) {
    shareBtn.hidden = !canShare;
    shareBtn.addEventListener('click', function () { setScreenShare(!sharing); });
    renderShareBtn();
  }
  document.querySelectorAll('[data-share-toggle]').forEach(function (b) {
    b.addEventListener('click', function () { setScreenShare(!sharing); });
  });

  // ---- Chat -----------------------------------------------------------------------------------------------
  // Messages travel over the room's data channel (topic wdos_chat). The sender's name is taken from their signed
  // LiveKit identity, never from the message, so nobody can post as someone else. History is kept for this tab only.
  var CHAT_TOPIC = 'wdos_chat', CHAT_KEY = 'wdos_chat:' + location.pathname, CHAT_MAX = 1000;
  var chatList = $('chat-list'), chatForm = $('chat-form'), chatInput = $('chat-input');
  var chatLog = [], unread = 0;
  try { chatLog = JSON.parse(sessionStorage.getItem(CHAT_KEY) || '[]'); } catch (e) { chatLog = []; }

  function chatVisible() {
    var d = $('meet-drawer'), pane = $('drawer-pane-chat');
    return !!(d && pane && !d.classList.contains('collapsed') && !pane.hidden);
  }

  function renderUnread() {
    document.querySelectorAll('[data-chat-badge]').forEach(function (b) {
      b.textContent = unread > 99 ? '99+' : String(unread);
      b.hidden = unread === 0;
    });
    document.querySelectorAll('[data-chat-dot]').forEach(function (d) { d.hidden = unread === 0; });
  }

  function chatTime(ts) {
    try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  }

  function drawChat(m) {
    if (!chatList) return;
    var empty = chatList.querySelector('.ws-empty'); if (empty) empty.remove();
    var row = document.createElement('div');
    row.className = 'chat-msg' + (m.mine ? ' mine' : '');
    var meta = document.createElement('div'); meta.className = 'chat-meta';
    var who = document.createElement('strong'); who.textContent = m.mine ? 'You' : m.name;
    var when = document.createElement('span'); when.textContent = chatTime(m.ts);
    meta.appendChild(who); meta.appendChild(when);
    var body = document.createElement('div'); body.className = 'chat-bubble'; body.textContent = m.text;
    row.appendChild(meta); row.appendChild(body);
    chatList.appendChild(row);
    chatList.scrollTop = chatList.scrollHeight;
  }

  function pushChat(m) {
    chatLog.push(m);
    if (chatLog.length > 200) chatLog = chatLog.slice(-200);
    try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(chatLog)); } catch (e) {}
    drawChat(m);
  }

  function onChat(payload, p) {
    if (!p || isBot(p)) return;
    var j; try { j = JSON.parse(new TextDecoder().decode(payload)); } catch (e) { return; }
    var text = (j && typeof j.text === 'string') ? j.text.trim().slice(0, CHAT_MAX) : '';
    if (!text) return;
    var name = p.name || 'Participant';
    pushChat({ name: name, text: text, ts: Date.now(), mine: false });
    if (!chatVisible()) {
      unread += 1; renderUnread();
      showMediaToast(name + ': ' + (text.length > 70 ? text.slice(0, 70) + '…' : text));
    }
  }

  function sendChat(text) {
    text = (text || '').trim().slice(0, CHAT_MAX);
    if (!text) return;
    if (!room || room.state !== 'connected') { showMediaToast('Still connecting — try again in a moment'); return; }
    room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ text: text })), { reliable: true, topic: CHAT_TOPIC })
      .then(function () { pushChat({ name: 'You', text: text, ts: Date.now(), mine: true }); })
      .catch(function () { showMediaToast('Message not sent'); });
  }

  chatLog.forEach(drawChat);
  if (chatForm) chatForm.addEventListener('submit', function (e) {
    e.preventDefault();
    sendChat(chatInput.value);
    chatInput.value = '';
    chatInput.focus();
  });
  document.addEventListener('wdos:chat-opened', function () {
    unread = 0; renderUnread();
    if (chatList) chatList.scrollTop = chatList.scrollHeight;
    if (chatInput && window.innerWidth > 900) chatInput.focus();   // on phones focusing would pop the keyboard up uninvited
  });

  // A tile exists for everyone in the room, but it only appears on the stage when layoutGrid() gives it a card.
  function tile(p) {
    if (isBot(p)) return document.createElement('div');
    if (tiles[p.identity]) return tiles[p.identity];
    var d = document.createElement('div');
    d.className = 'tile' + (p.isLocal ? ' is-local' : '');
    d._participant = p;
    d.innerHTML =
      '<div class="av-wrap"><span class="av"></span></div>' +
      '<span class="tile-hand" aria-hidden="true" title="Hand raised">\u270B</span>' +
      '<span class="tile-wave" aria-hidden="true"><i></i><i></i><i></i></span>' +
      '<div class="tile-bar"><span class="nm"></span><span class="tile-lang"></span></div>';
    var av = d.querySelector('.av');
    av.textContent = initialsOf(p.name);
    av.style.background = colorFor(p.identity || p.name);
    d.querySelector('.nm').textContent = (p.name || 'Guest') + (p.isLocal ? ' (you)' : '');
    d.querySelector('.tile-lang').textContent = (langOf(p) || 'en').toUpperCase();
    if (amMod && !p.isLocal) {
      // The only host control on a card: jump to this person in the people panel (permissions live there, once).
      var mg = document.createElement('button');
      mg.type = 'button';
      mg.className = 'tile-manage';
      mg.title = 'Manage ' + (p.name || 'participant');
      mg.setAttribute('aria-label', 'Manage ' + (p.name || 'participant'));
      mg.innerHTML = icon('manage', 13) + '<span>Manage</span>';
      mg.onclick = function () { document.dispatchEvent(new CustomEvent('wdos:manage', { detail: { name: p.name || '' } })); };
      d.appendChild(mg);
    }
    tiles[p.identity] = d;
    scheduleLayout();
    return d;
  }

  function attach(track, p, pub) {
    if (track.kind === 'video' && ((pub && pub.source) || track.source) === L.Track.Source.ScreenShare) {
      attachScreen(track, p);
      return;
    }
    if (track.kind === 'video') {
      var d = tile(p), old = d.querySelector('video'); if (old) old.remove();
      var v = track.attach(); v.muted = true;
      var wrap = d.querySelector('.av-wrap') || d.querySelector('.av');
      if (wrap) wrap.style.display = 'none';
      d.classList.add('has-video');
      d.prepend(v);
    } else if (track.kind === 'audio' && !p.isLocal) {
      if (!wantsAudio(p, pub)) { if (pub) { pub._wdosWant = false; pub.setSubscribed(false); } return; }   // not for my ears
      if (track._wdosEl) return;                                       // already playing: never attach a track twice
      var a = track.attach(); a.style.display = 'none'; document.body.appendChild(a);   // the room's audio
      track._wdosEl = a;
      audio.push({ el: a, p: p, pub: pub, track: track }); applyAudio();
    }
  }

  function detach(track, p) {
    if (track.kind === 'video' && track.source === L.Track.Source.ScreenShare) {
      track.detach().forEach(function (e) { e.remove(); });
      removeScreen(p);
      return;
    }
    track.detach().forEach(function (e) { e.remove(); });
    if (track.kind === 'audio') {
      track._wdosEl = null;
      audio = audio.filter(function (a) { return a.track !== track; });
    }
    if (track.kind === 'video' && tiles[p.identity]) {
      var d = tiles[p.identity];
      d.querySelectorAll('video').forEach(function (v) { v.remove(); });
      d.classList.remove('has-video');
      var wrap = d.querySelector('.av-wrap') || d.querySelector('.av');
      if (wrap) wrap.style.display = '';
    }
  }

  function remove(p) {
    removeScreen(p);
    delete shown[p.identity];
    delete lastSpoke[p.identity];
    delete joinSeq[p.identity];
    if (tiles[p.identity]) {
      tiles[p.identity].remove();
      delete tiles[p.identity];
      delete pPerms[p.identity];
      delete hands[p.identity];
    }
    layoutGrid();           // someone left: give their card to the next person straight away
    renderModControls();
  }

  var ccHideTimer = null;
  function caption(msg) {
    var line = (msg.translations && msg.translations[myLang]) || msg.text;
    if (!line) return;
    if (caps.querySelector('.ws-empty')) caps.innerHTML = '';
    var last = caps.lastElementChild;
    var spkName = msg.speaker || '';
    var isInterim = msg.final === false;
    // Update the in-progress interim block in place (both while speaking and when the final sentence arrives)
    if (last && ((msg.seg && last.dataset.seg === msg.seg) || (last.dataset.final === '0' && last.dataset.speaker === spkName))) {
      last.dataset.seg = msg.seg || '';
      last.dataset.final = isInterim ? '0' : '1';
      last.querySelector('span').textContent = line;
    } else {
      var p = document.createElement('p');
      p.dataset.seg = msg.seg || '';
      p.dataset.speaker = spkName;
      p.dataset.final = isInterim ? '0' : '1';
      p.innerHTML = '<small></small><br><span></span>';
      p.querySelector('small').textContent = spkName;
      p.querySelector('span').textContent = line;
      caps.appendChild(p);
    }
    caps.scrollTop = caps.scrollHeight;

    if (ccOverlay && ccOverlay.getAttribute('data-enabled') !== '0') {
      var spk = ccOverlay.querySelector('.cc-speaker');
      var txt = ccOverlay.querySelector('.cc-text');
      if (spk) spk.textContent = msg.speaker ? msg.speaker + ':' : '';
      if (txt) txt.textContent = line;
      ccOverlay.classList.add('visible');
      clearTimeout(ccHideTimer);
      ccHideTimer = setTimeout(function () { ccOverlay.classList.remove('visible'); }, 7000);
    }
  }

  fetch(cfg.dataset.token, { credentials: 'same-origin' }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error); return j; }); })
    .then(function (t) {
      room = new L.Room({ adaptiveStream: true, dynacast: true });
      function onMediaChange() { syncSubscriptions(); scheduleLayout(); renderModControls(); }
      room.on(L.RoomEvent.TrackSubscribed, function (tr, pub, p) { attach(tr, p, pub); })
          .on(L.RoomEvent.TrackUnsubscribed, function (tr, pub, p) { detach(tr, p); })
          .on(L.RoomEvent.TrackPublished, onMediaChange)
          .on(L.RoomEvent.TrackUnpublished, onMediaChange)
          .on(L.RoomEvent.TrackMuted, onMediaChange)       // a camera going on or off changes who deserves a card
          .on(L.RoomEvent.TrackUnmuted, onMediaChange)
          .on(L.RoomEvent.ParticipantConnected, function (p) { delete gone[p.identity]; tile(p); applyAudio(); renderHands(); syncGridCount(); })
          .on(L.RoomEvent.ParticipantMetadataChanged, function () { applyAudio(); renderHands(); })
          .on(L.RoomEvent.ParticipantDisconnected, function (p) { remove(p); delete gone[p.identity]; applyAudio(); syncGridCount(); })
          .on(L.RoomEvent.ActiveSpeakersChanged, function (sp) {
            var now = Date.now(), needLayout = false;
            Object.keys(tiles).forEach(function (k) { tiles[k].classList.remove('speaking'); });
            sp.forEach(function (p) {
              if (isBot(p)) return;
              lastSpoke[p.identity] = now;
              if (tiles[p.identity]) tiles[p.identity].classList.add('speaking');
              if (!shown[p.identity]) needLayout = true;      // someone is talking who has no card: give them one
            });
            if (needLayout) scheduleLayout();
          })
          .on(L.RoomEvent.DataReceived, function (payload, p, kind, topic) {
            if (topic === 'wdos_lobby') { document.dispatchEvent(new CustomEvent('wdos:lobby')); return; }   // host lobby changed
            if (topic === CHAT_TOPIC) { onChat(payload, p); return; }
            if (topic === 'wdos_media_ctrl') {
              if (p) return;    // host commands only ever come from the server (it checks the sender is a moderator); another browser cannot forge one
              try {
                var cmd = JSON.parse(new TextDecoder().decode(payload));
                var myId = room && room.localParticipant && room.localParticipant.identity;
                if (!myId || (cmd.target !== '*' && cmd.target !== myId)) return;
                if (cmd.end) { exitRoom('ended'); return; }                    // the host ended the meeting for everyone
                if (cmd.kick && !amMod) { exitRoom('removed'); return; }
                if (cmd.lowerHand && handUp) {
                  setHand(false);
                  showMediaToast('The host lowered your hand');
                }
                if (cmd.mic !== undefined && !amMod) {
                  micAllowed = !!cmd.mic;
                  if (!micAllowed && talking) {
                    talking = false;
                    room.localParticipant.setMicrophoneEnabled(false);
                    speak.classList.remove('on');
                  }
                  speak.disabled = !micAllowed;
                  setLabel(speak, micAllowed ? (talking ? 'Speaking \u2014 tap to stop' : 'Tap to speak') : 'Mic locked by host');
                  showMediaToast(micAllowed ? 'Host allowed your microphone \u2014 tap Speak to talk' : 'Host muted & locked your microphone');
                }
                if (cmd.cam !== undefined && !amMod) {
                  camAllowed = !!cmd.cam;
                  if (!camAllowed && camOn) {
                    camOn = false;
                    room.localParticipant.setCameraEnabled(false);
                    cam.classList.remove('on');
                    detach({ kind: 'video', detach: function () { return []; } }, room.localParticipant);
                  }
                  cam.disabled = !camAllowed;
                  setLabel(cam, camAllowed ? (camOn ? 'Camera off' : 'Camera on') : 'Video locked by host');
                  showMediaToast(camAllowed ? 'Host allowed your camera \u2014 tap Camera on' : 'Host turned off & locked your camera');
                }
                if (cmd.share !== undefined && !amMod) {
                  shareAllowed = !!cmd.share;
                  if (!shareAllowed && sharing) setScreenShare(false);
                  renderShareBtn();
                  showMediaToast(shareAllowed ? 'Host allowed you to share your screen' : 'Host turned off screen sharing for you');
                }
                syncMyMeta();
              } catch (e) {}
              return;
            }
            if (topic !== 'wdos_caption' || !p || !isBot(p)) return;   // captions come from the interpreter only
            try { caption(JSON.parse(new TextDecoder().decode(payload))); } catch (e) {}
          })
          .on(L.RoomEvent.LocalTrackPublished, function (pub, p) {
            // also fires when the browser's own "Stop sharing" bar ends a share, so the button never gets out of sync
            if (pub.source === L.Track.Source.ScreenShare && pub.track) { attachScreen(pub.track, p); sharing = true; renderShareBtn(); }
            scheduleLayout();
          })
          .on(L.RoomEvent.LocalTrackUnpublished, function (pub, p) {
            if (pub.source === L.Track.Source.ScreenShare) { removeScreen(p); sharing = false; renderShareBtn(); }
            scheduleLayout();
          })
          .on(L.RoomEvent.Reconnected, function () { document.dispatchEvent(new CustomEvent('wdos:lobby')); })
          .on(L.RoomEvent.Disconnected, function (reason) {
            var R = L.DisconnectReason || {};
            if (window.console) console.warn('[WODDI Room] disconnected, LiveKit reason:', reason, R[reason] || '');
            setStatus('Disconnected', 'offline');
            speak.disabled = cam.disabled = true;
            if (handBtn) handBtn.disabled = true;
            if (leavingVoluntarily) return;
            // Still joining: leave the page as it is so the connect error below is shown instead of a redirect.
            if (!roomConnected) return;
            // Only say "removed by the host" when LiveKit says so; a dropped connection or the same account joining
            // from another tab/device is not the host's doing.
            if (reason === R.PARTICIPANT_REMOVED) exitRoom('removed');
            else if (reason === R.ROOM_DELETED || reason === R.ROOM_CLOSED) exitRoom('ended');
            else if (reason === R.DUPLICATE_IDENTITY) exitRoom('elsewhere');
            else exitRoom('dropped');
          });
      // autoSubscribe off: we pick the tracks ourselves (see wantsAudio) so nobody downloads audio they should not hear
      return room.connect(t.url, t.token, { autoSubscribe: false }).then(function () {
        roomConnected = true;
        amMod = !!t.moderator;
        // "Join muted": the server marks my token with locked mic / camera / screen sharing; honour it before the controls are enabled.
        var mine = metaOf(room.localParticipant);
        if (!amMod && mine.micAllowed === false) micAllowed = false;
        if (!amMod && mine.camAllowed === false) camAllowed = false;
        if (!amMod && mine.shareAllowed === false) shareAllowed = false;
        tile(room.localParticipant);
        room.remoteParticipants.forEach(function (p) {
          tile(p);
          p.trackPublications.forEach(function (pub) { if (pub.track) attach(pub.track, p, pub); });
        });
        layoutGrid();             // choose the cards now, so video for them starts straight away
        syncMyMeta();
        renderModControls();
        document.dispatchEvent(new CustomEvent('wdos:lobby'));   // resync the guest list now that we are live
        speak.disabled = !micAllowed;
        cam.disabled = !camAllowed;
        if (!micAllowed) setLabel(speak, 'Mic locked by host');
        if (!camAllowed) setLabel(cam, 'Video locked by host');
        if (!micAllowed || !camAllowed || !shareAllowed) showMediaToast('You joined muted \u2014 the host will allow your mic, video or screen when needed');
        renderShareBtn();
        if (handBtn) handBtn.disabled = false;
        renderHands();
        setInterval(scheduleLayout, 3000);    // safety net: pick up camera on/off changes even if an event was missed
      });    }).catch(function (e) { setStatus('Could not connect: ' + (e.message || e), 'error'); });

  var allowAllBtn = $('mod-allow-all-btn'), muteAllBtn = $('mod-mute-all-btn'), leaveBtn = $('leave');
  var leavingVoluntarily = false, exitedRoom = false, roomConnected = false;

  // Leave the room page for good. `why` is shown on the page we land on: 'removed' (the host removed me), 'ended' (the host
  // ended the meeting for everyone), 'elsewhere' (the same account joined from another tab or device) or 'dropped'
  // (the connection to the video service was lost).
  function exitRoom(why) {
    if (exitedRoom) return;
    exitedRoom = true;
    leavingVoluntarily = true;
    if (room) { try { room.disconnect(); } catch (e) {} }
    var href = (leaveBtn && leaveBtn.getAttribute('href')) || '/';
    var sep = href.indexOf('?') === -1 ? '?' : '&';
    var param = { ended: 'ended=1', elsewhere: 'elsewhere=1', dropped: 'dropped=1' }[why] || 'removed=1';
    location.replace(href + sep + param);
  }

  // Moderators: "Leave" opens a choice (leave, or end the meeting for everyone). Everyone else just leaves.
  var leaveDlg = $('leave-dialog'), endBtn = $('end-for-all'), leaveOnly = $('leave-only');
  function closeLeaveDialog() {
    if (!leaveDlg) return;
    leaveDlg.hidden = true;
    if (leaveBtn) leaveBtn.focus();
  }
  function openLeaveDialog() {
    var n = everyone().length - 1;
    var c = $('leave-count'); if (c) c.textContent = n > 0 ? String(n) : 'no one else';
    var w = $('leave-count-word'); if (w) w.hidden = n <= 0;
    leaveDlg.hidden = false;
    if (leaveOnly) leaveOnly.focus();
  }
  if (leaveDlg) {
    leaveDlg.querySelectorAll('[data-leave-close]').forEach(function (b) { b.addEventListener('click', closeLeaveDialog); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !leaveDlg.hidden) closeLeaveDialog(); });
    if (leaveOnly) leaveOnly.addEventListener('click', function () { leavingVoluntarily = true; if (room) room.disconnect(); });
    if (endBtn) endBtn.addEventListener('click', function () {
      var label = endBtn.querySelector('strong'), was = label ? label.textContent : '';
      endBtn.disabled = true;
      if (label) label.textContent = 'Ending the meeting\u2026';
      var fd = new FormData();
      fd.append('csrfmiddlewaretoken', csrf);
      fetch(endBtn.dataset.url, { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'x-requested-with': 'fetch' } })
        .then(function (r) { if (!r.ok) throw new Error('end'); exitRoom('ended'); })
        .catch(function () {
          endBtn.disabled = false;
          if (label) label.textContent = was;
          closeLeaveDialog();
          showMediaToast('Could not end the meeting \u2014 please try again');
        });
    });
  }

  if (allowAllBtn) allowAllBtn.addEventListener('click', function () { sendMediaCtrl('*', { mic: true, cam: true }); });
  if (muteAllBtn) muteAllBtn.addEventListener('click', function () { sendMediaCtrl('*', { mic: false, cam: false, share: false }); });
  if (leaveBtn) leaveBtn.addEventListener('click', function (e) {
    if (leaveDlg) { e.preventDefault(); openLeaveDialog(); return; }
    leavingVoluntarily = true;
    if (room) room.disconnect();
  });

  var prejoinPrefs = {};
  try { prejoinPrefs = JSON.parse(sessionStorage.getItem('wdos_prejoin_prefs') || '{}'); } catch (e) {}

  var talking = false;
  function toggleMic(nextState) {
    if (!room || !room.localParticipant) return;
    if (!micAllowed && !amMod) { showMediaToast('Microphone is locked by the host'); return; }
    talking = nextState !== undefined ? !!nextState : !talking;
    var aOpts = prejoinPrefs.audioDeviceId ? { deviceId: prejoinPrefs.audioDeviceId } : undefined;
    room.localParticipant.setMicrophoneEnabled(talking, aOpts).then(function () {
      speak.classList.toggle('on', talking);
      setLabel(speak, talking ? 'Speaking — tap to stop' : 'Tap to speak');
    }).catch(function () {
      talking = false;
      setStatus('Microphone is blocked. Allow it in your browser.', 'error');
    });
  }
  speak.addEventListener('click', function () { toggleMic(); });

  var camOn = false;
  setLabel(cam, 'Camera on');
  function toggleCam(nextState) {
    if (!room || !room.localParticipant) return;
    if (!camAllowed && !amMod) { showMediaToast('Camera is locked by the host'); return; }
    camOn = nextState !== undefined ? !!nextState : !camOn;
    var vOpts = prejoinPrefs.videoDeviceId ? { deviceId: prejoinPrefs.videoDeviceId } : undefined;
    room.localParticipant.setCameraEnabled(camOn, vOpts).then(function () {
      cam.classList.toggle('on', camOn);
      setLabel(cam, camOn ? 'Camera off' : 'Camera on');
      if (camOn) {
        var pubs = room.localParticipant.videoTrackPublications;
        pubs.forEach(function (pub) { if (pub.track) attach(pub.track, room.localParticipant, pub); });
      } else {
        detach({ kind: 'video', detach: function () { return []; } }, room.localParticipant);
      }
    }).catch(function () {
      camOn = false;
      cam.classList.remove('on');
      setLabel(cam, 'Camera on');
      detach({ kind: 'video', detach: function () { return []; } }, room.localParticipant);
    });
  }
  cam.addEventListener('click', function () { toggleCam(); });

  document.querySelectorAll('[data-interp-toggle]').forEach(function (b) {
    b.addEventListener('click', function () { setInterp(!interpOn); });
  });
  renderInterpUI();

  window.addEventListener('pagehide', function () { leavingVoluntarily = true; if (room) room.disconnect(); });   // leaving mutes you on purpose
  // Switching tabs or apps: on a computer the mic stays live (like Meet/Zoom) so you can keep talking while you look
  // something up. Phones suspend the microphone as soon as the browser is backgrounded, so there we mute cleanly and tell
  // the user, instead of showing "speaking" while nothing is being sent.
  var isPhone = !!(window.matchMedia && window.matchMedia('(pointer: coarse) and (hover: none)').matches);
  var mutedWhileAway = false;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (isPhone && talking && room) {
        talking = false;
        mutedWhileAway = true;
        room.localParticipant.setMicrophoneEnabled(false);
        speak.classList.remove('on');
        setLabel(speak, 'Tap to speak');
      }
    } else if (mutedWhileAway) {
      mutedWhileAway = false;
      showMediaToast('Mic muted while you were away — tap Speak to talk again');
    }
  });
})();
