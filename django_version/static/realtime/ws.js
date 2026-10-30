/**
 * WDOS Realtime WebSocket Client (Django Channels + Short-Lived Single-Use Tickets)
 * No HTTP polling: fetches a fresh ticket once per connection/reconnect, maintains a
 * 25s application heartbeat, and dispatches server events + 'wdos:lobby' DOM events.
 */
(function (global) {
  'use strict';

  function resolveWsBase(explicitBase) {
    if (explicitBase && explicitBase.trim()) {
      return explicitBase.trim().replace(/\/+$/, '');
    }
    var proto = global.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + global.location.host;
  }

  function createWdosSocket(opts) {
    var ticketUrl = opts.ticketUrl;
    var wsPath = opts.wsPath;
    var wsBase = resolveWsBase(opts.wsBase || '');
    var onEvent = typeof opts.onEvent === 'function' ? opts.onEvent : function () {};
    var onOpen = typeof opts.onOpen === 'function' ? opts.onOpen : function () {};

    var ws = null;
    var pingTimer = null;
    var reconnectTimer = null;
    var attempt = 0;
    var closedPermanently = false;

    function clearTimers() {
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function scheduleReconnect() {
      if (closedPermanently) return;
      clearTimers();
      attempt += 1;
      var baseDelay = Math.min(30000, 1000 * Math.pow(2, Math.min(attempt - 1, 5)));
      var jitter = Math.floor(Math.random() * 500);
      var delay = document.hidden ? Math.max(baseDelay, 10000) : baseDelay + jitter;
      reconnectTimer = setTimeout(connect, delay);
    }

    function connect() {
      if (closedPermanently) return;
      clearTimers();

      fetch(ticketUrl, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json', 'Cache-Control': 'no-store' }
      })
        .then(function (resp) {
          if (!resp.ok) throw new Error('Ticket HTTP ' + resp.status);
          return resp.json();
        })
        .then(function (data) {
          if (closedPermanently) return;
          var base = data.wsUrl ? resolveWsBase(data.wsUrl) : wsBase;
          var path = data.wsPath || wsPath;
          var url = base + path + '?ticket=' + encodeURIComponent(data.ticket);

          try {
            ws = new WebSocket(url);
          } catch (err) {
            scheduleReconnect();
            return;
          }

          ws.onopen = function () {
            attempt = 0;
            pingTimer = setInterval(function () {
              if (ws && ws.readyState === WebSocket.OPEN) {
                try {
                  ws.send(JSON.stringify({ type: 'ping' }));
                } catch (e) {}
              }
            }, 25000);
            onOpen();
          };

          ws.onmessage = function (ev) {
            var msg;
            try {
              msg = JSON.parse(ev.data);
            } catch (e) {
              return;
            }
            if (!msg || msg.type === 'pong') return;
            if (msg.type === 'lobby') {
              try {
                document.dispatchEvent(new Event('wdos:lobby'));
              } catch (e) {}
            }
            onEvent(msg);
          };

          ws.onclose = function (ev) {
            clearTimers();
            if (closedPermanently || ev.code === 4403) return;
            scheduleReconnect();
          };

          ws.onerror = function () {
            // onclose handles reconnect
          };
        })
        .catch(function () {
          scheduleReconnect();
        });
    }

    function close() {
      closedPermanently = true;
      clearTimers();
      if (ws) {
        try {
          ws.close(1000, 'page_unload');
        } catch (e) {}
        ws = null;
      }
    }

    global.addEventListener('pagehide', close);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && !closedPermanently && (!ws || ws.readyState === WebSocket.CLOSED)) {
        attempt = 0;
        connect();
      }
    });

    connect();

    return {
      close: close,
      reconnect: function () {
        if (ws) {
          try {
            ws.close();
          } catch (e) {}
        } else {
          connect();
        }
      }
    };
  }

  global.WdosRealtime = {
    connect: createWdosSocket
  };
})(window);
