(function () {
  var INDEX_URL = 'search_index.json';
  var _index = null;
  var _loadPromise = null;

  function loadIndex() {
    if (_index) return Promise.resolve(_index);
    if (_loadPromise) return _loadPromise;
    _loadPromise = fetch(INDEX_URL)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) { _index = data; return data; });
    return _loadPromise;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function matchesQuery(item, q) {
    var ql = q.toLowerCase();
    if (ql.charAt(0) === '#') {
      return item.tags.some(function (t) { return t.toLowerCase() === ql; });
    }
    return (
      item.title.toLowerCase().indexOf(ql) >= 0 ||
      item.body.toLowerCase().indexOf(ql) >= 0 ||
      item.tags.some(function (t) { return t.toLowerCase().indexOf(ql) >= 0; })
    );
  }

  function typeLabel(type) {
    if (type === 'session') return 'Session Log';
    if (type === 'character') return 'Character';
    return 'Media';
  }

  var input = document.getElementById('search-input');
  var dropdown = document.getElementById('search-dropdown');

  if (!input) return;

  // Navigate to results page on Enter
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      var q = input.value.trim();
      if (q) {
        window.location.href = 'search.html?q=' + encodeURIComponent(q);
      }
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
    }
  });

  // Tag autocomplete when # appears
  input.addEventListener('input', function () {
    var val = input.value;
    var lastHash = val.lastIndexOf('#');
    if (lastHash === -1) {
      dropdown.style.display = 'none';
      return;
    }
    var partial = val.slice(lastHash).toLowerCase();
    loadIndex().then(function (data) {
      var matches = (data.tags || []).filter(function (t) {
        return t.toLowerCase().indexOf(partial) === 0 && t.length > partial.length;
      }).slice(0, 12);
      dropdown.innerHTML = '';
      if (matches.length === 0) {
        dropdown.style.display = 'none';
        return;
      }
      matches.forEach(function (tag) {
        var div = document.createElement('div');
        div.className = 'search-dropdown-item';
        div.textContent = tag;
        div.addEventListener('mousedown', function (e) {
          e.preventDefault();
          input.value = val.slice(0, lastHash) + tag;
          dropdown.style.display = 'none';
          input.focus();
        });
        dropdown.appendChild(div);
      });
      dropdown.style.display = 'block';
    }).catch(function () {
      dropdown.style.display = 'none';
    });
  });

  input.addEventListener('blur', function () {
    setTimeout(function () { dropdown.style.display = 'none'; }, 150);
  });

  // Search results logic — only runs on search.html
  if (window.location.pathname.replace(/.*\//, '') !== 'search.html') return;

  var params = new URLSearchParams(window.location.search);
  var q = (params.get('q') || '').trim();
  var resultsEl = document.getElementById('search-results');
  var headingEl = document.querySelector('#content h2');

  if (!q || !resultsEl) return;

  input.value = q;
  resultsEl.innerHTML = '<p>Searching…</p>';

  loadIndex().then(function (data) {
    var results = (data.items || []).filter(function (item) { return matchesQuery(item, q); });
    var label = results.length + ' result' + (results.length === 1 ? '' : 's');
    if (headingEl) headingEl.textContent = 'Search: ' + q + ' (' + label + ')';

    if (results.length === 0) {
      resultsEl.innerHTML = '<p>No results found for <em>' + escapeHtml(q) + '</em>.</p>';
      return;
    }

    var ul = document.createElement('ul');
    ul.className = 'file-list';
    results.forEach(function (item) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = item.url;
      a.textContent = item.title;
      li.appendChild(a);
      var note = document.createElement('span');
      note.className = 'note';
      var noteText = typeLabel(item.type);
      if (item.tags && item.tags.length > 0) {
        noteText += ' · ' + item.tags.join(', ');
      }
      note.textContent = noteText;
      li.appendChild(note);
      ul.appendChild(li);
    });
    resultsEl.innerHTML = '';
    resultsEl.appendChild(ul);
  }).catch(function () {
    resultsEl.innerHTML = '<p style="color:#888">Could not load search index. Try refreshing.</p>';
  });
})();
