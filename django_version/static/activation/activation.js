(function () {
  var J = function (id) { var e = document.getElementById(id); return e ? JSON.parse(e.textContent) : null; };
  var csrf = function (root) { return root.querySelector('[name=csrfmiddlewaretoken]').value; };
  var post = function (url, body, token) {
    return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': token }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return [r.ok, j]; }); });
  };

  var ext = document.getElementById('ext');
  if (ext) ext.addEventListener('click', function () {
    var fd = new FormData(); fd.append('reason', document.getElementById('reason').value);
    fd.append('csrfmiddlewaretoken', csrf(document));
    fetch(ext.dataset.url, { method: 'POST', body: fd, credentials: 'same-origin' }).then(function () { location.reload(); });
  });

  var as = document.getElementById('assess');
  if (as) {
    var sa = J('saved-assess') || {};
    as.querySelectorAll('textarea').forEach(function (t) { t.value = sa[t.dataset.seq] || ''; });
    var aerr = document.getElementById('err');
    document.getElementById('submit-assess').addEventListener('click', function () {
      var body = {}; as.querySelectorAll('textarea').forEach(function (t) { body[t.dataset.seq] = t.value; });
      post(as.dataset.url, body, csrf(as)).then(function (x) { if (x[0]) location.reload(); else aerr.textContent = x[1].error; });
    });
  }

  var d = document.getElementById('day'); if (!d) return;
  var started = Date.now(), reached = !d.dataset.content, err = document.getElementById('err'), saved = document.getElementById('saved');
  var sans = J('saved-answers') || {}, sacks = J('saved-acks') || [];
  d.querySelectorAll('textarea[data-key]').forEach(function (t) { t.value = sans[t.dataset.key] || ''; });
  d.querySelectorAll('[data-ack]').forEach(function (c) { c.checked = sacks.indexOf(+c.dataset.ack) >= 0; });
  function collect() {
    var a = {}, k = [];
    d.querySelectorAll('textarea[data-key]').forEach(function (t) { a[t.dataset.key] = t.value; });
    d.querySelectorAll('[data-ack]').forEach(function (c) { if (c.checked) k.push(+c.dataset.ack); });
    return { answers: a, acks: k, reached_end: reached, seconds: Math.floor((Date.now() - started) / 1000) };
  }
  function save() { return post(d.dataset.save, collect(), csrf(d)).then(function (x) { saved.textContent = x[0] ? 'Saved' : ''; return x; }); }
  var timer; function later() { clearTimeout(timer); saved.textContent = 'Saving…'; timer = setTimeout(save, 700); }
  d.addEventListener('input', later); d.addEventListener('change', later);

  var boxes = d.querySelectorAll('.ob-scroller'), seenAll = {};
  boxes.forEach(function (box, i) {
    var art = box.querySelector('article');
    var mark = function () { if (box.scrollTop + box.clientHeight >= box.scrollHeight - 48) { seenAll[i] = true; reached = Object.keys(seenAll).length === boxes.length; later(); } };
    box.addEventListener('scroll', mark);
    var url = box.dataset.doc.replace(/x\/$/, box.dataset.name + '/');
    fetch(url, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (h) { art.innerHTML = h; mark(); })
      .catch(function () { art.textContent = 'The document could not load.'; seenAll[i] = true; reached = Object.keys(seenAll).length === boxes.length; });
  });
  document.getElementById('next').addEventListener('click', function () {
    err.textContent = '';
    save().then(function () { return post(d.dataset.complete, {}, csrf(d)); })
      .then(function (x) { if (x[0]) location.reload(); else err.textContent = x[1].error; });
  });
})();
