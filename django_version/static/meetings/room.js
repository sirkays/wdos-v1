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

  var BOT = 'wdos-translator-bot', audio = [], amMod = false, micAllowed = true, camAllowed = true;
  var pPerms = {};   // identity -> { mic: bool, cam: bool }
  var handUp = false, hands = {};   // raise hand: my own state, and who had a hand up last time we looked (for one toast per raise)
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
      cam: cached.cam !== undefined ? cached.cam : (m.camAllowed !== false)
    };
  }
  function syncMyMeta() {
    if (!room || !room.localParticipant) return;
    room.localParticipant.setMetadata(JSON.stringify({
      lang: myLang, moderator: amMod, micAllowed: micAllowed, camAllowed: camAllowed, hand: handUp
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

  function sendMediaCtrl(targetIdentity, changes) {
    if (!amMod || !room || !room.localParticipant) return;
    if (targetIdentity === '*') {
      room.remoteParticipants.forEach(function (p) {
        if (isBot(p)) return;
        pPerms[p.identity] = {
          mic: changes.mic !== undefined ? changes.mic : permOf(p).mic,
          cam: changes.cam !== undefined ? changes.cam : permOf(p).cam
        };
      });
    } else {
      var cur = pPerms[targetIdentity] || { mic: true, cam: true };
      pPerms[targetIdentity] = {
        mic: changes.mic !== undefined ? changes.mic : cur.mic,
        cam: changes.cam !== undefined ? changes.cam : cur.cam
      };
    }
    var pkt = new TextEncoder().encode(JSON.stringify({
      target: targetIdentity, mic: changes.mic, cam: changes.cam, kick: changes.kick, lowerHand: changes.lowerHand
    }));
    room.localParticipant.publishData(pkt, { reliable: true, topic: 'wdos_media_ctrl' });
    renderModControls();
  }

  function kickParticipant(identity) {
    if (!amMod || !identity) return;
    sendMediaCtrl(identity, { kick: true });
    if (identity.indexOf('guest-') === 0) {
      var gid = identity.slice(6), gp = $('guestpanel');
      if (gp && gp.dataset.json && /^\d+$/.test(gid)) {
        var fd = new FormData();
        fd.append('csrfmiddlewaretoken', csrf);
        fetch(gp.dataset.json + gid + '/remove/', {
          method: 'POST', body: fd, credentials: 'same-origin', headers: { 'x-requested-with': 'fetch' }
        }).then(function () { document.dispatchEvent(new CustomEvent('wdos:lobby')); }).catch(function () {});
      }
    }
    if (tiles[identity]) remove({ identity: identity });
  }
  document.addEventListener('wdos:kick', function (ev) {
    if (ev && ev.detail && ev.detail.identity) sendMediaCtrl(ev.detail.identity, { kick: true });
  });

  function renderModControls() {
    if (!amMod || !room) return;
    var listEl = $('live-participants-list');
    var remotes = [];
    room.remoteParticipants.forEach(function (p) { if (!isBot(p)) remotes.push(p); });

    // Update tile overlay controls on each remote tile
    remotes.forEach(function (p) {
      var d = tiles[p.identity];
      if (!d) return;
      var bar = d.querySelector('.tile-mod-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'tile-mod-bar';
        d.appendChild(bar);
      }
      var prm = permOf(p);
      bar.innerHTML = '';
      var micBtn = document.createElement('button');
      micBtn.type = 'button';
      micBtn.className = 'mod-ctrl-btn ' + (prm.mic ? 'allowed' : 'locked');
      micBtn.textContent = prm.mic ? 'Mic Allowed' : 'Allow Mic';
      micBtn.title = prm.mic ? 'Click to mute & lock microphone' : 'Click to allow microphone';
      micBtn.onclick = function () { sendMediaCtrl(p.identity, { mic: !prm.mic }); };

      var camBtn = document.createElement('button');
      camBtn.type = 'button';
      camBtn.className = 'mod-ctrl-btn ' + (prm.cam ? 'allowed' : 'locked');
      camBtn.textContent = prm.cam ? 'Video Allowed' : 'Allow Video';
      camBtn.title = prm.cam ? 'Click to stop & lock camera' : 'Click to allow camera';
      camBtn.onclick = function () { sendMediaCtrl(p.identity, { cam: !prm.cam }); };

      var kickBtn = document.createElement('button');
      kickBtn.type = 'button';
      kickBtn.className = 'mod-ctrl-btn locked';
      kickBtn.textContent = 'Remove';
      kickBtn.title = 'Remove participant from the meeting';
      kickBtn.onclick = function () { kickParticipant(p.identity); };

      bar.appendChild(micBtn);
      bar.appendChild(camBtn);
      bar.appendChild(kickBtn);
    });

    if (!listEl) return;
    listEl.innerHTML = '';
    if (!remotes.length) {
      listEl.innerHTML = '<li class="ws-empty" style="color:#64748b !important;">No other participants in the room yet.</li>';
      return;
    }
    // Raised hands first, so the host sees who wants to speak without scrolling.
    remotes.sort(function (a, b) { return (hands[b.identity] ? 1 : 0) - (hands[a.identity] ? 1 : 0); });
    remotes.forEach(function (p) {
      var prm = permOf(p), up = !!hands[p.identity];
      var li = document.createElement('li');
      if (up) li.className = 'hand-up';

      var head = document.createElement('div');
      head.className = 'pl-head';
      var nm = document.createElement('span');
      nm.className = 'pl-name';
      nm.textContent = p.name || 'Participant';
      var lg = document.createElement('span');
      lg.className = 'pl-lang';
      lg.textContent = (langOf(p) || 'en').toUpperCase();
      head.appendChild(nm);
      head.appendChild(lg);
      if (up) {
        var hb = document.createElement('button');
        hb.type = 'button';
        hb.className = 'pl-hand-chip';
        hb.title = 'Hand raised — click to lower it';
        hb.textContent = '\u270B Lower';
        hb.onclick = function () { sendMediaCtrl(p.identity, { lowerHand: true }); };
        head.appendChild(hb);
      }
      var kb = document.createElement('button');
      kb.type = 'button';
      kb.className = 'pl-remove';
      kb.title = 'Remove from the meeting';
      kb.setAttribute('aria-label', 'Remove ' + (p.name || 'participant') + ' from the meeting');
      kb.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      kb.onclick = function () { kickParticipant(p.identity); };
      head.appendChild(kb);

      var acts = document.createElement('div');
      acts.className = 'pl-actions';
      var mBtn = document.createElement('button');
      mBtn.type = 'button';
      mBtn.className = 'mod-ctrl-btn ' + (prm.mic ? 'allowed' : 'locked');
      mBtn.textContent = prm.mic ? 'Mic allowed' : 'Mic locked';
      mBtn.title = prm.mic ? 'Click to mute & lock microphone' : 'Click to allow microphone';
      mBtn.onclick = function () { sendMediaCtrl(p.identity, { mic: !prm.mic }); };

      var cBtn = document.createElement('button');
      cBtn.type = 'button';
      cBtn.className = 'mod-ctrl-btn ' + (prm.cam ? 'allowed' : 'locked');
      cBtn.textContent = prm.cam ? 'Video allowed' : 'Video locked';
      cBtn.title = prm.cam ? 'Click to stop & lock camera' : 'Click to allow camera';
      cBtn.onclick = function () { sendMediaCtrl(p.identity, { cam: !prm.cam }); };

      acts.appendChild(mBtn);
      acts.appendChild(cBtn);
      li.appendChild(head);
      li.appendChild(acts);
      listEl.appendChild(li);
    });
  }

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

  function syncGridCount() {
    var count = Object.keys(tiles).length;
    if (grid) grid.setAttribute('data-count', String(count));
    if (emptyStage) emptyStage.style.display = count > 0 ? 'none' : '';
    if (pCount) pCount.textContent = String(count);
    if (room && room.state === 'connected') {
      setStatus((amMod ? 'Connected as moderator' : 'Connected as listener') + ' · ' + count + ' in room', 'live');
    }
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

  // Subscribe to every video track, and only to the audio tracks I should hear. Re-run whenever someone joins, publishes,
  // or changes language, and when I change mine.
  function syncSubscriptions() {
    if (!room || room.state !== 'connected') return;
    var bot = botHere();
    room.remoteParticipants.forEach(function (p) {
      p.trackPublications.forEach(function (pub) {
        var want = pub.kind === 'video' ? true : wantsAudio(p, pub, bot);
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

  function renderShareBtn() {
    if (!shareBtn) return;
    shareBtn.classList.toggle('on', sharing);
    shareBtn.setAttribute('aria-pressed', sharing ? 'true' : 'false');
    shareBtn.title = sharing ? 'Stop presenting' : 'Present your screen';
    setLabel(shareBtn, sharing ? 'Stop sharing' : 'Share');
    document.querySelectorAll('[data-share-state]').forEach(function (e) {
      e.textContent = sharing ? 'Sharing now · tap to stop' : 'Present to everyone';
    });
  }

  function setScreenShare(on) {
    if (!room || room.state !== 'connected') return Promise.resolve();
    if (on && !camAllowed && !amMod) { showMediaToast('Sharing is locked by the host'); return Promise.resolve(); }
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
    grid.appendChild(d);
    tiles[p.identity] = d;
    syncGridCount();
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
    if (tiles[p.identity]) {
      tiles[p.identity].remove();
      delete tiles[p.identity];
      delete pPerms[p.identity];
      delete hands[p.identity];
      syncGridCount();
      renderModControls();
    }
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
      room.on(L.RoomEvent.TrackSubscribed, function (tr, pub, p) { attach(tr, p, pub); })
          .on(L.RoomEvent.TrackUnsubscribed, function (tr, pub, p) { detach(tr, p); })
          .on(L.RoomEvent.TrackPublished, function () { syncSubscriptions(); })
          .on(L.RoomEvent.ParticipantConnected, function (p) { tile(p); applyAudio(); renderHands(); })
          .on(L.RoomEvent.ParticipantMetadataChanged, function () { applyAudio(); renderHands(); })
          .on(L.RoomEvent.ParticipantDisconnected, function (p) { remove(p); applyAudio(); })
          .on(L.RoomEvent.ActiveSpeakersChanged, function (sp) {
            Object.keys(tiles).forEach(function (k) { tiles[k].classList.remove('speaking'); });
            sp.forEach(function (p) { if (tiles[p.identity]) tiles[p.identity].classList.add('speaking'); });
          })
          .on(L.RoomEvent.DataReceived, function (payload, p, kind, topic) {
            if (topic === 'wdos_lobby') { document.dispatchEvent(new CustomEvent('wdos:lobby')); return; }   // host lobby changed
            if (topic === CHAT_TOPIC) { onChat(payload, p); return; }
            if (topic === 'wdos_media_ctrl') {
              if (p && (isBot(p) || p.identity.indexOf('guest-') === 0)) return;   // only server or members can send host commands, never guests
              try {
                var cmd = JSON.parse(new TextDecoder().decode(payload));
                var myId = room && room.localParticipant && room.localParticipant.identity;
                if (!myId || (cmd.target !== '*' && cmd.target !== myId)) return;
                if (cmd.kick && !amMod) {
                  exitRoomAsRemoved();
                  return;
                }
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
                  setLabel(speak, micAllowed ? (talking ? 'Speaking — tap to stop' : 'Tap to speak') : 'Mic locked by host');
                  showMediaToast(micAllowed ? 'Host allowed your microphone — tap Speak to talk' : 'Host muted & locked your microphone');
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
                  if (!camAllowed && sharing) setScreenShare(false);   // "video" permission covers presenting too
                  if (shareBtn) shareBtn.disabled = !camAllowed;
                  setLabel(cam, camAllowed ? (camOn ? 'Camera off' : 'Camera on') : 'Video locked by host');
                  showMediaToast(camAllowed ? 'Host allowed your camera — tap Camera on' : 'Host turned off & locked your camera');
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
          })
          .on(L.RoomEvent.LocalTrackUnpublished, function (pub, p) {
            if (pub.source === L.Track.Source.ScreenShare) { removeScreen(p); sharing = false; renderShareBtn(); }
          })
          .on(L.RoomEvent.Reconnected, function () { document.dispatchEvent(new CustomEvent('wdos:lobby')); })
          .on(L.RoomEvent.Disconnected, function () {
            setStatus('Disconnected', 'offline');
            speak.disabled = cam.disabled = true;
            if (handBtn) handBtn.disabled = true;
            if (!leavingVoluntarily) exitRoomAsRemoved();
          });
      // autoSubscribe off: we pick the tracks ourselves (see wantsAudio) so nobody downloads audio they should not hear
      return room.connect(t.url, t.token, { autoSubscribe: false }).then(function () {
        amMod = !!t.moderator;
        // "Join muted": the server marks my token with locked mic/camera; honour it before the controls are enabled.
        var mine = metaOf(room.localParticipant);
        if (!amMod && mine.micAllowed === false) micAllowed = false;
        if (!amMod && mine.camAllowed === false) camAllowed = false;
        tile(room.localParticipant);
        room.remoteParticipants.forEach(function (p) {
          tile(p);
          p.trackPublications.forEach(function (pub) { if (pub.track) attach(pub.track, p, pub); });
        });
        syncSubscriptions();
        setStatus((amMod ? 'Connected as moderator' : 'Connected as listener') + ' · ' + Object.keys(tiles).length + ' in room', 'live');
        syncMyMeta();
        renderModControls();
        document.dispatchEvent(new CustomEvent('wdos:lobby'));   // resync the guest list now that we are live
        speak.disabled = !micAllowed;
        cam.disabled = !camAllowed;
        if (!micAllowed) setLabel(speak, 'Mic locked by host');
        if (!camAllowed) setLabel(cam, 'Video locked by host');
        if (!micAllowed || !camAllowed) showMediaToast('You joined muted \u2014 the host will allow your mic and video when needed');
        if (shareBtn) shareBtn.disabled = !camAllowed && !amMod;
        if (handBtn) handBtn.disabled = false;
        renderHands();
      });
    }).catch(function (e) { setStatus('Could not connect: ' + (e.message || e), 'error'); });

  var allowAllBtn = $('mod-allow-all-btn'), muteAllBtn = $('mod-mute-all-btn'), leaveBtn = $('leave');
  var leavingVoluntarily = false, exitedRoom = false;
  function exitRoomAsRemoved() {
    if (exitedRoom) return;
    exitedRoom = true;
    leavingVoluntarily = true;
    if (room) { try { room.disconnect(); } catch (e) {} }
    var href = (leaveBtn && leaveBtn.getAttribute('href')) || '/';
    var sep = href.indexOf('?') === -1 ? '?' : '&';
    location.replace(href + sep + 'removed=1');
  }
  if (allowAllBtn) allowAllBtn.addEventListener('click', function () { sendMediaCtrl('*', { mic: true, cam: true }); });
  if (muteAllBtn) muteAllBtn.addEventListener('click', function () { sendMediaCtrl('*', { mic: false, cam: false }); });
  if (leaveBtn) leaveBtn.addEventListener('click', function () { leavingVoluntarily = true; if (room) room.disconnect(); });

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
