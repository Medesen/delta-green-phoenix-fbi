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
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
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

  function fetchIgnoreList(folder) {
    return fetch(RAW + folder + '/.mediaignore')
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (text) {
        return text.split(/\r?\n/)
          .map(function (l) { return l.trim(); })
          .filter(function (l) { return l && !l.startsWith('#'); });
      })
      .catch(function () { return []; });
  }

  function renderFolderItem(name, onClick) {
    var wrap = document.createElement('div');
    wrap.className = 'media-item media-folder';
    var icon = document.createElement('div');
    icon.className = 'media-folder-icon';
    icon.textContent = '▶';
    wrap.appendChild(icon);
    var cap = document.createElement('div');
    cap.className = 'media-caption';
    var a = document.createElement('a');
    a.href = '#';
    a.textContent = name;
    a.addEventListener('click', function (e) { e.preventDefault(); onClick(); });
    cap.appendChild(a);
    wrap.appendChild(cap);
    return wrap;
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

  window.initMediaSection = function (rootFolder, containerEl) {
    var history = [];

    function loadFolder(folder) {
      containerEl.innerHTML = '<p>Loading...</p>';

      Promise.all([
        fetchIgnoreList(folder),
        fetch(API + folder)
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      ]).then(function (results) {
        var ignored  = results[0];
        var allItems = results[1];

        var skip = ignored.concat(['.gitkeep', '.mediaignore']);
        var visible = allItems.filter(function (f) { return skip.indexOf(f.name) === -1; });

        var dirs      = visible.filter(function (f) { return f.type === 'dir'; });
        var fileItems = visible.filter(function (f) { return f.type === 'file'; });

        var mdSet = {};
        fileItems.forEach(function (f) { if (f.name.endsWith('.md')) mdSet[f.name] = true; });

        // Standalone .md files (no matching media companion)
        var standaloneMd = fileItems.filter(function (f) {
          if (!f.name.endsWith('.md')) return false;
          var base = f.name.slice(0, -3);
          return !fileItems.some(function (m) {
            return !m.name.endsWith('.md') && m.name.slice(0, m.name.lastIndexOf('.')) === base;
          });
        });

        // Media files (non-.md)
        var mediaFiles = fileItems.filter(function (f) { return !f.name.endsWith('.md'); });

        dirs.sort(function (a, b) { return a.name.localeCompare(b.name); });
        standaloneMd.sort(function (a, b) { return a.name.localeCompare(b.name); });
        mediaFiles.sort(function (a, b) { return a.name.localeCompare(b.name); });

        // Fetch standalone .md content
        var mdPromises = standaloneMd.map(function (file) {
          return fetch(RAW + folder + '/' + encodeURIComponent(file.name))
            .then(function (r) { return r.text(); })
            .then(function (text) { return { kind: 'section', html: marked.parse(parseFrontmatter(text).body) }; });
        });

        // Fetch companion metadata for media files
        var mediaPromises = mediaFiles.map(function (file) {
          var companion = file.name.slice(0, file.name.lastIndexOf('.')) + '.md';
          if (mdSet[companion]) {
            return fetch(RAW + folder + '/' + encodeURIComponent(companion))
              .then(function (r) { return r.text(); })
              .then(function (text) { return { kind: 'media', file: file, meta: parseFrontmatter(text).meta }; });
          }
          return Promise.resolve({ kind: 'media', file: file, meta: {} });
        });

        return Promise.all(mdPromises.concat(mediaPromises)).then(function (resolved) {
          containerEl.innerHTML = '';

          // Back button
          if (history.length > 0) {
            var backP = document.createElement('p');
            var backA = document.createElement('a');
            backA.href = '#'; backA.textContent = '← Back';
            backA.style.fontSize = '0.9rem';
            backA.addEventListener('click', function (e) {
              e.preventDefault();
              loadFolder(history.pop());
            });
            backP.appendChild(backA);
            containerEl.appendChild(backP);
          }

          if (visible.length === 0) {
            containerEl.appendChild(document.createTextNode('Nothing here yet.'));
            return;
          }

          var grid = document.createElement('div');
          grid.className = 'media-grid';

          // 1. Standalone .md sections
          resolved.slice(0, standaloneMd.length).forEach(function (item) {
            grid.appendChild(renderMarkdownSection(item.html));
          });

          // 2. Subfolders
          dirs.forEach(function (dir) {
            grid.appendChild(renderFolderItem(dir.name, function () {
              history.push(folder);
              loadFolder(folder + '/' + dir.name);
            }));
          });

          // 3. Media files
          resolved.slice(standaloneMd.length).forEach(function (item) {
            grid.appendChild(renderMediaItem(item.file.name, item.meta, folder));
          });

          containerEl.appendChild(grid);
        });

      }).catch(function () {
        containerEl.innerHTML = '<p style="color:#888">Could not load content. Try refreshing.</p>';
      });
    }

    loadFolder(rootFolder);
  };
})();
