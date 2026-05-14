(function () {
  var REPO = 'Medesen/delta-green-phoenix-fbi';
  var RAW  = 'https://raw.githubusercontent.com/' + REPO + '/main/';
  var API  = 'https://api.github.com/repos/' + REPO + '/contents/';

  function parseFrontmatter(text) {
    var match = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
    if (!match) return { meta: {}, body: text };
    var meta = {};
    match[1].split(/\r?\n/).forEach(function (line) {
      var i = line.indexOf(':');
      if (i > 0) {
        meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      }
    });
    return { meta: meta, body: text.slice(match[0].length).trim() };
  }

  function fileType(name) {
    var ext = name.split('.').pop().toLowerCase();
    if (['jpg','jpeg','png','gif','webp'].indexOf(ext) >= 0) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (['mp3','ogg','wav','m4a','flac'].indexOf(ext) >= 0) return 'audio';
    if (ext === 'md') return 'markdown';
    return 'other';
  }

  function renderMediaItem(fileName, meta, folder) {
    var url     = RAW + folder + '/' + encodeURIComponent(fileName);
    var caption = meta.caption || fileName;
    var type    = fileType(fileName);
    var wrap    = document.createElement('div');
    wrap.className = 'media-item';

    if (type === 'image') {
      var a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      a.className = 'media-thumb-link';
      var img = document.createElement('img');
      img.src = url; img.alt = caption;
      a.appendChild(img);
      wrap.appendChild(a);
      var cap = document.createElement('div');
      cap.className = 'media-caption';
      var capLink = document.createElement('a');
      capLink.href = url; capLink.target = '_blank'; capLink.rel = 'noopener';
      capLink.textContent = caption;
      cap.appendChild(capLink);
      wrap.appendChild(cap);

    } else if (type === 'pdf') {
      var cap = document.createElement('div');
      cap.className = 'media-caption';
      var a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = caption;
      cap.appendChild(a);
      var note = document.createElement('span');
      note.className = 'note'; note.textContent = ' PDF';
      cap.appendChild(note);
      wrap.appendChild(cap);

    } else if (type === 'audio') {
      var cap = document.createElement('div');
      cap.className = 'media-caption'; cap.textContent = caption;
      wrap.appendChild(cap);
      var audio = document.createElement('audio');
      audio.controls = true; audio.style.width = '100%'; audio.style.marginTop = '6px';
      var src = document.createElement('source'); src.src = url;
      audio.appendChild(src);
      wrap.appendChild(audio);

    } else {
      var cap = document.createElement('div');
      cap.className = 'media-caption';
      var a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = caption;
      cap.appendChild(a);
      wrap.appendChild(cap);
    }

    return wrap;
  }

  function renderMarkdownSection(htmlContent) {
    var wrap = document.createElement('div');
    wrap.className = 'media-section';
    wrap.innerHTML = htmlContent;
    wrap.querySelectorAll('a').forEach(function (a) {
      a.target = '_blank'; a.rel = 'noopener';
    });
    return wrap;
  }

  window.initMediaSection = function (folder, containerEl) {
    fetch(API + folder)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (files) {
        var mdSet = {};
        files.forEach(function (f) { if (f.name.endsWith('.md')) mdSet[f.name] = true; });

        var toShow = files.filter(function (f) {
          if (f.name === '.gitkeep') return false;
          if (!f.name.endsWith('.md')) return true;
          // Only show .md files that have no matching media file (standalone)
          var base = f.name.slice(0, -3);
          var hasMedia = files.some(function (m) {
            return !m.name.endsWith('.md') && m.name.slice(0, m.name.lastIndexOf('.')) === base;
          });
          return !hasMedia;
        });

        toShow.sort(function (a, b) { return a.name.localeCompare(b.name); });

        if (toShow.length === 0) {
          containerEl.innerHTML = '<p>Nothing here yet.</p>';
          return Promise.resolve(null);
        }

        var promises = toShow.map(function (file) {
          if (fileType(file.name) === 'markdown') {
            // Standalone .md: fetch and render inline
            return fetch(RAW + folder + '/' + encodeURIComponent(file.name))
              .then(function (r) { return r.text(); })
              .then(function (text) {
                var parsed = parseFrontmatter(text);
                var html = marked.parse(parsed.body);
                return { type: 'section', html: html };
              });
          }
          // Media file: check for companion .md
          var base      = file.name.slice(0, file.name.lastIndexOf('.'));
          var companion = base + '.md';
          if (mdSet[companion]) {
            return fetch(RAW + folder + '/' + encodeURIComponent(companion))
              .then(function (r) { return r.text(); })
              .then(function (text) {
                var parsed = parseFrontmatter(text);
                return { type: 'media', file: file, meta: parsed.meta };
              });
          }
          return Promise.resolve({ type: 'media', file: file, meta: {} });
        });

        return Promise.all(promises);
      })
      .then(function (items) {
        if (!items) return;
        var grid = document.createElement('div');
        grid.className = 'media-grid';
        items.forEach(function (item) {
          if (item.type === 'section') {
            grid.appendChild(renderMarkdownSection(item.html));
          } else {
            grid.appendChild(renderMediaItem(item.file.name, item.meta, folder));
          }
        });
        containerEl.innerHTML = '';
        containerEl.appendChild(grid);
      })
      .catch(function () {
        containerEl.innerHTML = '<p style="color:#888">Could not load content. Try refreshing.</p>';
      });
  };
})();
