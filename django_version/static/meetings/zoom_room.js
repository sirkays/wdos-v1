/**
 * WDOS Zoom Meeting SDK 6.10.0 Client View Integration
 * Connects to Zoom Meeting SDK using a server-signed JWT fetched over POST + CSRF,
 * and binds to the WDOS Realtime WebSocket for lobby notifications, co-host promotion, and expulsions.
 */
(function () {
  'use strict';

  var cfgEl = document.getElementById('wdos-zoom-config');
  if (!cfgEl || cfgEl.dataset.configured !== '1') return;

  var sigUrl = cfgEl.dataset.sigUrl;
  var leaveUrl = cfgEl.dataset.leaveUrl;
  var wsTicketUrl = cfgEl.dataset.wsTicketUrl;
  var wsPath = cfgEl.dataset.wsPath;
  var wsBase = cfgEl.dataset.wsBase || '';
  var csrfToken = cfgEl.dataset.csrf || '';
  var isManager = cfgEl.dataset.mgr === '1';

  var overlay = document.getElementById('wdos-zoom-overlay');
  var statusTitle = document.getElementById('wdos-zoom-status-title');
  var statusMsg = document.getElementById('wdos-zoom-status-msg');
  var retryBtn = document.getElementById('wdos-zoom-retry-btn');
  var spinner = document.getElementById('wdos-zoom-spinner');

  // Host drawer controls
  var drawer = document.getElementById('meet-drawer');
  var toggleBtn = document.getElementById('wdos-toggle-guest-drawer');
  var closeBtn = document.getElementById('wdos-close-guest-drawer');
  var toastOpenBtn = document.getElementById('waiting-toast-open');

  function openDrawer() {
    if (!drawer) return;
    drawer.classList.remove('collapsed');
    document.dispatchEvent(new Event('wdos:lobby-reviewed'));
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.add('collapsed');
  }
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      if (drawer && drawer.classList.contains('collapsed')) openDrawer();
      else closeDrawer();
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (toastOpenBtn) toastOpenBtn.addEventListener('click', openDrawer);

  function showError(title, message) {
    if (overlay) overlay.style.display = 'flex';
    if (spinner) spinner.style.display = 'none';
    if (statusTitle) statusTitle.textContent = title || 'Unable to Join Zoom Meeting';
    if (statusMsg) statusMsg.textContent = message || 'Please check your connection and try again.';
    if (retryBtn) retryBtn.style.display = 'inline-flex';
  }

  function friendlySdkError(err) {
    var code = err && (err.errorCode || err.reasonCode);
    if (code === 3008 || code === 1) {
      return 'The host has not started this Zoom meeting yet, or the meeting is currently unavailable.';
    }
    if (code === 3005 || code === 3006) {
      return 'This meeting has reached its participant capacity limit.';
    }
    if (err && err.errorMessage) {
      return String(err.errorMessage);
    }
    return 'Could not connect to the Zoom meeting room. Please try again.';
  }

  // Helper to locate a Zoom SDK userId by customerKey (or fallback participantId)
  function findZoomUserId(targetCustomerKey, fallbackParticipantId, cb) {
    if (!window.ZoomMtg || typeof window.ZoomMtg.getAttendeeslist !== 'function') return;
    window.ZoomMtg.getAttendeeslist({
      success: function (res) {
        var list = (res && res.result && res.result.attendeesList) || [];
        var match = null;
        for (var i = 0; i < list.length; i++) {
          var item = list[i];
          if (targetCustomerKey && item.customerKey === targetCustomerKey) {
            match = item;
            break;
          }
          if (fallbackParticipantId && String(item.userId) === String(fallbackParticipantId)) {
            match = item;
            break;
          }
        }
        if (match && match.userId) {
          cb(match.userId, match);
        }
      }
    });
  }

  // Connect WDOS Realtime WebSocket (no polling)
  if (window.WdosRealtime && wsTicketUrl && wsPath) {
    window.WdosRealtime.connect({
      ticketUrl: wsTicketUrl,
      wsPath: wsPath,
      wsBase: wsBase,
      onOpen: function () {
        // Catch up on anything that happened while the socket was connecting/reconnecting (one read, not polling).
        if (isManager) document.dispatchEvent(new Event('wdos:lobby'));
      },
      onEvent: function (msg) {
        if (!msg || !msg.type) return;

        if (msg.type === 'status' && msg.status === 'completed') {
          window.location.href = leaveUrl + (leaveUrl.indexOf('?') === -1 ? '?ended=1' : '&ended=1');
          return;
        }

        if (msg.type === 'lobby_status') {
          if (msg.status === 'removed') {
            window.location.href = leaveUrl + (leaveUrl.indexOf('?') === -1 ? '?removed=1' : '&removed=1');
          } else if (msg.status === 'ended') {
            window.location.href = leaveUrl;
          }
          return;
        }

        if (isManager && msg.type === 'promote' && window.ZoomMtg && typeof window.ZoomMtg.makeCoHost === 'function') {
          findZoomUserId(msg.customerKey, msg.participantId, function (uid, attendee) {
            if (!attendee.isHost && !attendee.isCoHost) {
              window.ZoomMtg.makeCoHost({ userId: uid });
            }
          });
        }

        if (isManager && msg.type === 'expel' && window.ZoomMtg && typeof window.ZoomMtg.expel === 'function') {
          findZoomUserId(msg.customerKey, null, function (uid) {
            window.ZoomMtg.expel({ userId: uid });
          });
        }
      }
    });
  }

  function startZoomRoom() {
    if (!window.ZoomMtg) {
      showError('Zoom SDK Failed to Load', 'Your network or browser blocked source.zoom.us. Please check your connection.');
      return;
    }

    if (!window.crossOriginIsolated && window.console && console.warn) {
      console.warn('WDOS Zoom Room: window.crossOriginIsolated is false; running in degraded gallery mode.');
    }

    if (spinner) spinner.style.display = 'flex';
    if (retryBtn) retryBtn.style.display = 'none';
    if (statusTitle) statusTitle.textContent = 'Joining Meeting…';
    if (statusMsg) statusMsg.textContent = 'Requesting encrypted meeting signature…';

    try {
      window.ZoomMtg.preLoadWasm();
      window.ZoomMtg.prepareWebSDK();
    } catch (e) {}

    fetch(sigUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'X-CSRFToken': csrfToken,
        'Accept': 'application/json',
        'Cache-Control': 'no-store'
      }
    })
      .then(function (resp) {
        return resp.json().then(function (data) {
          if (!resp.ok) throw new Error(data.error || ('HTTP ' + resp.status));
          return data;
        });
      })
      .then(function (sigData) {
        var langCode = sigData.lang || 'en-US';

        function beginInit() {
          window.ZoomMtg.init({
            leaveUrl: sigData.leaveUrl || leaveUrl,
            disableCORP: !window.crossOriginIsolated,
            patchJsMedia: true,
            disableInvite: true,
            meetingInfo: ['topic', 'host', 'participant', 'dc', 'enctype'],
            success: function () {
              // From here Zoom draws its own screens (pre-join "Use microphone and camera", waiting for host, then the
              // meeting) into #zmmtg-root. Our status overlay is full-screen and would sit on top of them, hiding the
              // button the person has to click, so it is hidden NOW and only comes back if Zoom reports an error.
              if (overlay) overlay.style.display = 'none';

              var joinParams = {
                sdkKey: sigData.sdkKey,
                signature: sigData.signature,
                meetingNumber: sigData.meetingNumber,
                passWord: sigData.password,
                userName: sigData.userName,
                userEmail: sigData.userEmail || '',
                customerKey: sigData.customerKey
              };
              if (sigData.zak) {
                joinParams.zak = sigData.zak;
              }
              window.ZoomMtg.join(
                Object.assign({}, joinParams, {
                  success: function () {
                    if (overlay) overlay.style.display = 'none';
                    if (typeof window.ZoomMtg.inMeetingServiceListener === 'function') {
                      window.ZoomMtg.inMeetingServiceListener('onMeetingStatus', function (st) {
                        if (st && st.meetingStatus === 3) {
                          window.location.href = sigData.leaveUrl || leaveUrl;
                        }
                      });
                    }
                  },
                  error: function (err) {
                    showError('Could Not Join Zoom Room', friendlySdkError(err));
                  }
                })
              );
            },
            error: function (err) {
              showError('Could Not Initialize Zoom Room', friendlySdkError(err));
            }
          });
        }

        // Zoom's UI strings load asynchronously: wait for them (as Zoom's own sample does) before init. The SDK
        // resolves this itself after at most ~3 s, the timer below is only a safety net.
        var started = false;
        function go() {
          if (started) return;
          started = true;
          beginInit();
        }
        try {
          if (window.ZoomMtg.i18n && typeof window.ZoomMtg.i18n.load === 'function') {
            window.ZoomMtg.i18n.load(langCode);
            if (typeof window.ZoomMtg.i18n.onLoad === 'function') {
              window.ZoomMtg.i18n.onLoad(go);
              setTimeout(go, 5000);
              return;
            }
          }
        } catch (e) {}
        go();
      })
      .catch(function (err) {
        showError('Unable to Join Meeting', err && err.message ? err.message : 'Failed to request meeting signature.');
      });
  }

  if (retryBtn) {
    // A clean page load is the reliable way to retry: the SDK cannot be re-initialised once it has started.
    retryBtn.addEventListener('click', function () { window.location.reload(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startZoomRoom);
  } else {
    startZoomRoom();
  }
})();
