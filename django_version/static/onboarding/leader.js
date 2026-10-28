(function () {
  var s = document.getElementById('step'); if (!s) return;
  var mode = s.dataset.mode, minSec = +s.dataset.min || 20, started = Date.now();
  var next = document.getElementById('next'), hint = document.getElementById('hint'), err = document.getElementById('err');
  var reached = mode !== 'read', opened = mode !== 'visit';
  var secs = function () { return Math.floor((Date.now() - started) / 1000); };
  function ready() {
    if (mode === 'declare') return document.getElementById('note').value.trim() && secs() >= Math.min(minSec, 20);
    return reached && opened && secs() >= minSec;
  }
  function refresh() {
    var left = Math.max(0, minSec - secs());
    next.disabled = !ready();
    next.textContent = ready() ? 'Next' : (!opened ? 'Open the page first' : (!reached && !left) ? 'Scroll to the end' : 'Next (' + (left || 1) + 's)');
    hint.textContent = mode === 'read' ? 'Scroll to the end of the document. Next unlocks after about ' + minSec + ' seconds.' : '';
  }
  if (mode === 'read') {
    var sc = document.getElementById('scroller'), doc = document.getElementById('doc');
    var seen = function () { if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 48) { reached = true; refresh(); } };
    sc.addEventListener('scroll', seen);
    fetch(s.dataset.doc, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (h) { doc.innerHTML = h; seen(); refresh(); })
      .catch(function () { doc.textContent = 'The document could not load.'; reached = true; refresh(); });
  }
  var o = document.getElementById('opened'); if (o) o.addEventListener('click', function () { opened = true; o.disabled = true; refresh(); });
  var n = document.getElementById('note'); if (n) n.addEventListener('input', refresh);
  setInterval(refresh, 1000); refresh();
  next.addEventListener('click', function () {
    next.disabled = true; err.textContent = '';
    var fd = new FormData();
    fd.append('seconds', secs()); fd.append('reached_end', reached ? '1' : '0'); fd.append('note', n ? n.value.trim() : '');
    fd.append('csrfmiddlewaretoken', s.querySelector('[name=csrfmiddlewaretoken]').value);
    fetch(s.dataset.complete, { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) { return r.json().then(function (j) { return [r.ok, j]; }); })
      .then(function (x) { if (x[0]) location.reload(); else { err.textContent = x[1].error || 'Could not save.'; next.disabled = false; } })
      .catch(function () { err.textContent = 'Could not save.'; next.disabled = false; });
  });
})();
