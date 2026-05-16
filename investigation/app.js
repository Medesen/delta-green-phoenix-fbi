/* ─────────────────────────────────────────────────────────────
   Configuration
───────────────────────────────────────────────────────────── */
var WORKER_URL      = 'https://dg-investigation.medesen.workers.dev';
var SEARCH_INDEX_URL = 'https://medesen.github.io/delta-green-phoenix-fbi/search_index.json';
var AUTOSAVE_KEY    = 'dg_investigation_autosave';
var AUTOSAVE_MS     = 3 * 60 * 1000; // 3 minutes

var NODE_TYPES = {
  person:   { label: 'Person',   shape: 'ellipse',        color: '#7EB5D6' },
  location: { label: 'Location', shape: 'round-rectangle', color: '#8DB48E' },
  handout:  { label: 'Handout',  shape: 'hexagon',        color: '#C4A882' },
  object:   { label: 'Object',   shape: 'diamond',        color: '#C48FA0' },
};

var NODE_COLORS  = ['#7EB5D6','#8DB48E','#C4A882','#C48FA0','#A8C4D6','#B8D6A8','#D6C4A8','#C4B8D6','#A8D6C4','#D6A8C4'];
var EDGE_COLORS  = ['#111111','#8B1A1A','#1A2E8B','#1A6B2E','#5B1A8B','#8B5B1A','#1A6B6B','#4A4A1A','#444444','#8B1A6B'];

/* ─────────────────────────────────────────────────────────────
   State
───────────────────────────────────────────────────────────── */
var cy;
var currentLayout = null;
var gmMode       = false;
var gmPassphrase = '';
var connectOrigin = null;   // node id when in connect mode
var connectAnim   = null;   // requestAnimationFrame handle
var dirty         = false;
var searchIndex   = null;

/* ─────────────────────────────────────────────────────────────
   Utility
───────────────────────────────────────────────────────────── */
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function toast(msg, ms) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(function() { el.classList.remove('show'); }, ms || 2500);
}

function markDirty() {
  dirty = true;
  document.getElementById('save-status').textContent = 'Unsaved changes';
}

function markClean(label) {
  dirty = false;
  document.getElementById('save-status').textContent = label || 'Saved';
}

/* ─────────────────────────────────────────────────────────────
   Cytoscape initialisation
───────────────────────────────────────────────────────────── */
function initCytoscape(elements) {
  cytoscape.use(cytoscapeCola);

  cy = cytoscape({
    container: document.getElementById('cy'),
    elements: elements || [],
    style: buildStyle(true),
    layout: { name: 'preset' },
    wheelSensitivity: 0.3,
    minZoom: 0.1,
    maxZoom: 4,
  });

  // Run cola layout only when there are nodes without saved positions
  var hasPositions = (elements || []).some(function(e) {
    return e.group === 'nodes' && e.position;
  });
  if (!hasPositions && cy.nodes().length > 0) runLayout();

  bindCyEvents();
}

function buildStyle(showLabels) {
  return [
    {
      selector: 'node',
      style: {
        'shape': function(ele) { return (NODE_TYPES[ele.data('type')] || NODE_TYPES.object).shape; },
        'background-color': function(ele) { return ele.data('color') || (NODE_TYPES[ele.data('type')] || NODE_TYPES.object).color; },
        'border-width': 1.5,
        'border-color': '#111',
        'label': 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 11,
        'color': '#111',
        'text-wrap': 'ellipsis',
        'text-max-width': '70px',
        'width': 80,
        'height': 80,
        'shadow-blur': 8,
        'shadow-color': 'rgba(0,0,0,0.22)',
        'shadow-offset-x': 2,
        'shadow-offset-y': 3,
        'shadow-opacity': 1,
      }
    },
    {
      selector: 'node:selected',
      style: {
        'border-width': 3,
        'border-color': '#333',
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': function(ele) { return ele.data('color') || '#111'; },
        'target-arrow-color': function(ele) { return ele.data('color') || '#111'; },
        'source-arrow-color': function(ele) { return ele.data('color') || '#111'; },
        'target-arrow-shape': function(ele) {
          var d = ele.data('direction');
          return (d === 'forward' || d === 'both') ? 'triangle' : 'none';
        },
        'source-arrow-shape': function(ele) {
          return ele.data('direction') === 'both' ? 'triangle' : 'none';
        },
        'curve-style': 'bezier',
        'label': showLabels ? 'data(label)' : '',
        'font-size': 10,
        'color': '#333',
        'text-background-color': '#fff',
        'text-background-opacity': 0.8,
        'text-background-padding': '2px',
        'text-rotation': 'autorotate',
      }
    },
    {
      selector: 'edge:selected',
      style: { 'width': 3 }
    },
  ];
}

function runLayout() {
  if (currentLayout) currentLayout.stop();
  currentLayout = cy.layout({
    name: 'cola',
    animate: true,
    infinite: true,
    fit: false,
    randomize: false,
    nodeSpacing: 60,
    edgeLength: 180,
  });
  currentLayout.run();
}

/* ─────────────────────────────────────────────────────────────
   Connect mode (animated dashed line)
───────────────────────────────────────────────────────────── */
var connectCanvas  = document.getElementById('connect-canvas');
var connectCtx     = connectCanvas.getContext('2d');
var mousePos       = { x: 0, y: 0 };
var dashOffset     = 0;

function resizeConnectCanvas() {
  connectCanvas.width  = window.innerWidth;
  connectCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeConnectCanvas);
resizeConnectCanvas();

document.addEventListener('mousemove', function(e) {
  mousePos.x = e.clientX;
  mousePos.y = e.clientY;
});

function startConnectMode(nodeId) {
  connectOrigin = nodeId;
  connectCanvas.style.pointerEvents = 'auto';
  connectCanvas.style.cursor = 'crosshair';
  dashOffset = 0;
  animateConnectLine();

  connectCanvas.addEventListener('click', onConnectCanvasClick);
}

function stopConnectMode() {
  connectOrigin = null;
  if (connectAnim) { cancelAnimationFrame(connectAnim); connectAnim = null; }
  connectCtx.clearRect(0, 0, connectCanvas.width, connectCanvas.height);
  connectCanvas.style.pointerEvents = 'none';
  connectCanvas.style.cursor = '';
  connectCanvas.removeEventListener('click', onConnectCanvasClick);
}

function animateConnectLine() {
  connectCtx.clearRect(0, 0, connectCanvas.width, connectCanvas.height);

  if (!connectOrigin) return;
  var srcNode = cy.getElementById(connectOrigin);
  if (!srcNode.length) { stopConnectMode(); return; }

  var pos = srcNode.renderedPosition();

  dashOffset = (dashOffset + 1) % 24;
  connectCtx.save();
  connectCtx.setLineDash([8, 6]);
  connectCtx.lineDashOffset = -dashOffset;
  connectCtx.strokeStyle = '#555';
  connectCtx.lineWidth = 2;
  connectCtx.beginPath();
  connectCtx.moveTo(pos.x, pos.y);
  connectCtx.lineTo(mousePos.x, mousePos.y);
  connectCtx.stroke();
  connectCtx.restore();

  connectAnim = requestAnimationFrame(animateConnectLine);
}

function onConnectCanvasClick(e) {
  // Check if click lands on a Cytoscape node
  var target = cy.elementFromPoint(e.clientX, e.clientY);
  if (target && target.isNode && target.isNode() && target.id() !== connectOrigin) {
    var originId = connectOrigin;
    stopConnectMode();
    openEdgeModal(originId, target.id());
  } else {
    stopConnectMode();
  }
}

/* ─────────────────────────────────────────────────────────────
   Context menu
───────────────────────────────────────────────────────────── */
var ctxMenu   = document.getElementById('ctx-menu');
var ctxTarget = null; // cy element or null for canvas

function showCtxMenu(x, y, items) {
  ctxMenu.innerHTML = '';
  items.forEach(function(item) {
    if (item === 'sep') {
      var sep = document.createElement('div');
      sep.className = 'ctx-item separator disabled';
      ctxMenu.appendChild(sep);
      return;
    }
    var div = document.createElement('div');
    div.className = 'ctx-item' + (item.danger ? ' danger' : '');
    div.textContent = item.label;
    div.addEventListener('click', function() {
      hideCtxMenu();
      item.action();
    });
    ctxMenu.appendChild(div);
  });

  // Clamp to viewport
  ctxMenu.classList.add('visible');
  var rect = ctxMenu.getBoundingClientRect();
  var cx = Math.min(x, window.innerWidth  - rect.width  - 4);
  var cy2 = Math.min(y, window.innerHeight - rect.height - 4);
  ctxMenu.style.left = cx + 'px';
  ctxMenu.style.top  = cy2 + 'px';
}

function hideCtxMenu() { ctxMenu.classList.remove('visible'); }

document.addEventListener('click', function(e) {
  if (!ctxMenu.contains(e.target)) hideCtxMenu();
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') { hideCtxMenu(); stopConnectMode(); }
});

/* ─────────────────────────────────────────────────────────────
   Cytoscape event bindings
───────────────────────────────────────────────────────────── */
function bindCyEvents() {
  // Right-click on empty canvas
  cy.on('cxttap', function(e) {
    if (e.target !== cy) return;
    if (connectOrigin) { stopConnectMode(); return; }
    var pos = e.renderedPosition || e.position;
    var graphPos = e.position;
    showCtxMenu(pos.x, pos.y, [
      { label: 'Create node', action: function() { openNodeModal(null, graphPos); } },
      { label: 'Cancel',      action: function() {} },
    ]);
  });

  // Right-click on node
  cy.on('cxttap', 'node', function(e) {
    if (connectOrigin) { stopConnectMode(); return; }
    var node = e.target;
    var pos  = e.renderedPosition || { x: e.originalEvent.clientX, y: e.originalEvent.clientY };
    showCtxMenu(pos.x, pos.y, [
      { label: 'Edit',    action: function() { openNodeModal(node); } },
      { label: 'Connect', action: function() { startConnectMode(node.id()); } },
      { label: 'Delete',  action: function() { deleteNode(node); }, danger: true },
      { label: 'Cancel',  action: function() {} },
    ]);
  });

  // Right-click on edge
  cy.on('cxttap', 'edge', function(e) {
    if (connectOrigin) { stopConnectMode(); return; }
    var edge = e.target;
    var pos  = e.renderedPosition || { x: e.originalEvent.clientX, y: e.originalEvent.clientY };
    showCtxMenu(pos.x, pos.y, [
      { label: 'Edit edge',   action: function() { openEdgeModal(null, null, edge); } },
      { label: 'Delete edge', action: function() { deleteEdge(edge); }, danger: true },
      { label: 'Cancel',      action: function() {} },
    ]);
  });

  // Clicking empty canvas in connect mode cancels it
  cy.on('tap', function(e) {
    if (connectOrigin && e.target === cy) stopConnectMode();
  });

  // Mark dirty on node move
  cy.on('dragfree', 'node', function() { markDirty(); });
}


/* ─────────────────────────────────────────────────────────────
   Keyboard shortcuts
───────────────────────────────────────────────────────────── */
document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === '+' || e.key === '=') cy.zoom({ level: cy.zoom() * 1.15, renderedPosition: { x: window.innerWidth/2, y: window.innerHeight/2 }});
  if (e.key === '-' || e.key === '_') cy.zoom({ level: cy.zoom() * 0.87, renderedPosition: { x: window.innerWidth/2, y: window.innerHeight/2 }});
});

/* ─────────────────────────────────────────────────────────────
   Toolbar buttons
───────────────────────────────────────────────────────────── */
document.getElementById('btn-zoom-in').addEventListener('click', function() {
  cy.zoom({ level: cy.zoom() * 1.2, renderedPosition: { x: window.innerWidth/2, y: window.innerHeight/2 }});
});
document.getElementById('btn-zoom-out').addEventListener('click', function() {
  cy.zoom({ level: cy.zoom() * 0.83, renderedPosition: { x: window.innerWidth/2, y: window.innerHeight/2 }});
});
document.getElementById('btn-fit').addEventListener('click', function() {
  cy.fit(undefined, 60);
});

document.getElementById('toggle-labels').addEventListener('change', function() {
  cy.style(buildStyle(this.checked));
});

/* ─────────────────────────────────────────────────────────────
   Node CRUD
───────────────────────────────────────────────────────────── */
function deleteNode(node) {
  if (!confirm('Delete node "' + node.data('name') + '"?')) return;
  node.connectedEdges().remove();
  node.remove();
  markDirty();
}

function deleteEdge(edge) {
  edge.remove();
  markDirty();
}

/* ─────────────────────────────────────────────────────────────
   Modal system
───────────────────────────────────────────────────────────── */
var modalResolve = null;

function openModal(title, bodyHTML) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-overlay').classList.add('visible');
  return new Promise(function(resolve) { modalResolve = resolve; });
}

function closeModal(result) {
  document.getElementById('modal-overlay').classList.remove('visible');
  if (modalResolve) { modalResolve(result); modalResolve = null; }
}

document.getElementById('modal-cancel').addEventListener('click', function() { closeModal(null); });
document.getElementById('modal-confirm').addEventListener('click', function() { closeModal('confirm'); });
document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal(null);
});

/* ─────────────────────────────────────────────────────────────
   Color palette widget
───────────────────────────────────────────────────────────── */
function renderPalette(containerId, colors, selectedColor, onSelect) {
  var wrap = document.getElementById(containerId);
  wrap.innerHTML = '';
  colors.forEach(function(c) {
    var sw = document.createElement('div');
    sw.className = 'color-swatch' + (c === selectedColor ? ' selected' : '');
    sw.style.background = c;
    sw.title = c;
    sw.addEventListener('click', function() {
      wrap.querySelectorAll('.color-swatch').forEach(function(s) { s.classList.remove('selected'); });
      sw.classList.add('selected');
      onSelect(c);
    });
    wrap.appendChild(sw);
  });
}

/* ─────────────────────────────────────────────────────────────
   website_ref autocomplete
───────────────────────────────────────────────────────────── */
function initRefField(inputId, dropdownId, clearId, initialValue, onChange) {
  var input    = document.getElementById(inputId);
  var dropdown = document.getElementById(dropdownId);
  var clearBtn = document.getElementById(clearId);
  var selected = initialValue || null;

  if (selected) { input.value = selected.title || ''; }

  function getGroups(query) {
    if (!searchIndex) return {};
    var q = query.toLowerCase();
    var groups = {};
    searchIndex.items.forEach(function(item) {
      if (!q || item.title.toLowerCase().indexOf(q) >= 0) {
        var g = item.type;
        if (!groups[g]) groups[g] = [];
        if (groups[g].length < 8) groups[g].push(item);
      }
    });
    return groups;
  }

  function renderDropdown(query) {
    var groups = getGroups(query);
    dropdown.innerHTML = '';
    var hasAny = false;
    var TYPE_LABELS = { character: 'Characters', session: 'Sessions', media: 'Media' };
    Object.keys(groups).forEach(function(type) {
      var label = document.createElement('div');
      label.className = 'ref-group-label';
      label.textContent = TYPE_LABELS[type] || type;
      dropdown.appendChild(label);
      groups[type].forEach(function(item) {
        var div = document.createElement('div');
        div.className = 'ref-item';
        div.textContent = item.title;
        div.addEventListener('mousedown', function(e) {
          e.preventDefault();
          selected = item;
          input.value = item.title;
          dropdown.classList.remove('open');
          onChange(item);
        });
        dropdown.appendChild(div);
        hasAny = true;
      });
    });
    dropdown.classList.toggle('open', hasAny);
  }

  input.addEventListener('input', function() { renderDropdown(input.value); selected = null; onChange(null); });
  input.addEventListener('focus', function() { renderDropdown(input.value); });
  input.addEventListener('blur', function() { setTimeout(function() { dropdown.classList.remove('open'); }, 150); });

  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      input.value = '';
      selected = null;
      onChange(null);
      dropdown.classList.remove('open');
    });
  }

  return function() { return selected; };
}

/* ─────────────────────────────────────────────────────────────
   Node modal
───────────────────────────────────────────────────────────── */
function openNodeModal(existingNode, graphPos) {
  var data = existingNode ? existingNode.data() : {};
  var nodeColor = data.color || (NODE_TYPES[data.type] || NODE_TYPES.person).color;
  var selectedColor = nodeColor;
  var selectedRef   = data.website_ref_obj || null;

  var typeOptions = Object.keys(NODE_TYPES).map(function(k) {
    return '<option value="' + k + '"' + (data.type === k ? ' selected' : '') + '>'
      + NODE_TYPES[k].label + '</option>';
  }).join('');

  var html = [
    '<div class="form-field required"><label>Name</label>',
    '<input type="text" id="f-name" value="' + esc(data.name || '') + '" placeholder="Node name"></div>',

    '<div class="form-field required"><label>Type</label>',
    '<select id="f-type">' + typeOptions + '</select></div>',

    '<div class="form-field"><label>Color</label>',
    '<div class="color-palette" id="f-color-palette"></div></div>',

    '<div class="form-field"><label>Website reference</label>',
    '<div class="ref-wrap">',
    '<input type="text" id="f-ref-input" placeholder="Search…" autocomplete="off">',
    '<div class="ref-dropdown" id="f-ref-dropdown"></div>',
    '</div>',
    '<span class="ref-clear" id="f-ref-clear">✕ Clear</span></div>',

    '<div class="form-field"><label>Notes</label>',
    '<textarea id="f-notes">' + esc(data.notes || '') + '</textarea></div>',
  ].join('');

  openModal(existingNode ? 'Edit Node' : 'Create Node', html).then(function(result) {
    if (!result) return;
    var name = document.getElementById('f-name').value.trim();
    var type = document.getElementById('f-type').value;
    if (!name || !type) { toast('Name and type are required.'); return; }

    var label = name.length > 12 ? name.slice(0, 11) + '…' : name;
    var refObj = getSelectedRef();

    if (existingNode) {
      existingNode.data({
        name: name, label: label, type: type,
        color: selectedColor,
        website_ref: refObj ? refObj.url : '',
        website_ref_obj: refObj,
        notes: document.getElementById('f-notes').value,
      });
      // update shape/color via style
      cy.style(buildStyle(document.getElementById('toggle-labels').checked));
    } else {
      cy.add({
        group: 'nodes',
        data: {
          id: uuid(),
          name: name, label: label, type: type,
          color: selectedColor,
          website_ref: refObj ? refObj.url : '',
          website_ref_obj: refObj,
          notes: document.getElementById('f-notes').value,
        },
        position: graphPos || { x: cy.width()/2, y: cy.height()/2 },
      });
      runLayout();
    }
    markDirty();
  });

  // Populate palette after DOM is ready
  setTimeout(function() {
    renderPalette('f-color-palette', NODE_COLORS, selectedColor, function(c) { selectedColor = c; });
    // Update palette default when type changes
    document.getElementById('f-type').addEventListener('change', function() {
      selectedColor = (NODE_TYPES[this.value] || NODE_TYPES.person).color;
      renderPalette('f-color-palette', NODE_COLORS, selectedColor, function(c) { selectedColor = c; });
    });
    var getSelectedRef = initRefField('f-ref-input', 'f-ref-dropdown', 'f-ref-clear', selectedRef, function(r) { selectedRef = r; });
    // Expose getter so the confirm handler can read it
    window._getSelectedRef = getSelectedRef;
  }, 0);

  // Wrap confirm handler to capture closure correctly
  var origConfirm = document.getElementById('modal-confirm').onclick;
  document.getElementById('modal-confirm').onclick = null;
}

// Because of the async modal we need a slight re-architecture: store getSelectedRef globally
var _getSelectedRef_global = function() { return null; };
function getSelectedRef() { return window._getSelectedRef ? window._getSelectedRef() : null; }

/* ─────────────────────────────────────────────────────────────
   Edge modal
───────────────────────────────────────────────────────────── */
function openEdgeModal(sourceId, targetId, existingEdge) {
  var data = existingEdge ? existingEdge.data() : {};
  var selectedEdgeColor = data.color || '#111111';
  var selectedDir       = data.direction || 'forward';

  var html = [
    '<div class="form-field required"><label>Relationship label</label>',
    '<input type="text" id="e-label" value="' + esc(data.label || '') + '" placeholder="e.g. husband, found at, suspect…"></div>',

    '<div class="form-field required"><label>Direction</label>',
    '<div class="direction-group">',
    '<div class="dir-opt' + (selectedDir === 'none'    ? ' selected' : '') + '" data-dir="none">None ●—●</div>',
    '<div class="dir-opt' + (selectedDir === 'forward' ? ' selected' : '') + '" data-dir="forward">Forward ●→●</div>',
    '<div class="dir-opt' + (selectedDir === 'both'    ? ' selected' : '') + '" data-dir="both">Both ●↔●</div>',
    '</div></div>',

    '<div class="form-field"><label>Color</label>',
    '<div class="color-palette" id="e-color-palette"></div></div>',
  ].join('');

  openModal(existingEdge ? 'Edit Edge' : 'Connect Nodes', html).then(function(result) {
    if (!result) return;
    var label = document.getElementById('e-label').value.trim();
    if (!label) { toast('A relationship label is required.'); return; }
    var dir = document.querySelector('.dir-opt.selected');
    if (!dir) { toast('Please select a direction.'); return; }

    if (existingEdge) {
      existingEdge.data({ label: label, direction: dir.dataset.dir, color: selectedEdgeColor });
      cy.style(buildStyle(document.getElementById('toggle-labels').checked));
    } else {
      cy.add({
        group: 'edges',
        data: {
          id: uuid(),
          source: sourceId, target: targetId,
          label: label,
          direction: dir.dataset.dir,
          color: selectedEdgeColor,
        }
      });
    }
    markDirty();
  });

  setTimeout(function() {
    renderPalette('e-color-palette', EDGE_COLORS, selectedEdgeColor, function(c) { selectedEdgeColor = c; });

    document.querySelectorAll('.dir-opt').forEach(function(opt) {
      opt.addEventListener('click', function() {
        document.querySelectorAll('.dir-opt').forEach(function(o) { o.classList.remove('selected'); });
        opt.classList.add('selected');
        selectedDir = opt.dataset.dir;
      });
    });
  }, 0);
}

/* ─────────────────────────────────────────────────────────────
   Serialise / deserialise graph
───────────────────────────────────────────────────────────── */
function graphToJSON() {
  var nodes = cy.nodes().map(function(n) {
    return { group: 'nodes', data: n.data(), position: n.position() };
  });
  var edges = cy.edges().map(function(e) {
    return { group: 'edges', data: e.data() };
  });
  return { nodes: nodes, edges: edges };
}

function jsonToElements(obj) {
  return (obj.nodes || []).concat(obj.edges || []);
}

/* ─────────────────────────────────────────────────────────────
   localStorage auto-save
───────────────────────────────────────────────────────────── */
function autoSave() {
  if (!dirty) return;
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ ts: Date.now(), graph: graphToJSON() }));
  } catch(e) {}
}

setInterval(autoSave, AUTOSAVE_MS);

/* ─────────────────────────────────────────────────────────────
   GitHub save / load via Worker
───────────────────────────────────────────────────────────── */
function workerRequest(endpoint, body) {
  var headers = { 'Content-Type': 'application/json' };
  if (gmMode && gmPassphrase) headers['X-GM-Passphrase'] = gmPassphrase;
  return fetch(WORKER_URL + endpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body),
  }).then(function(r) {
    if (!r.ok) return r.text().then(function(t) { throw new Error(t || r.status); });
    return r.json();
  });
}

function loadMasterGraph() {
  return fetch(WORKER_URL + '/read', { method: 'GET' })
    .then(function(r) { return r.ok ? r.json() : { nodes: [], edges: [] }; })
    .catch(function() { return { nodes: [], edges: [] }; });
}

document.getElementById('btn-save').addEventListener('click', function() {
  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  workerRequest('/save-draft', { graph: graphToJSON() })
    .then(function() {
      markClean('Draft saved');
      try { localStorage.removeItem(AUTOSAVE_KEY); } catch(e) {}
      toast('Draft saved to GitHub.');
    })
    .catch(function(err) { toast('Save failed: ' + err.message); })
    .finally(function() { btn.disabled = false; btn.textContent = 'Save draft'; });
});

// GM: publish draft → master
document.getElementById('btn-publish').addEventListener('click', function() {
  if (!gmMode) return;
  if (!confirm('Publish the current player draft as the new master graph?')) return;
  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Publishing…';
  workerRequest('/publish', {})
    .then(function() { toast('Published to master graph.'); })
    .catch(function(err) { toast('Publish failed: ' + err.message); })
    .finally(function() { btn.disabled = false; btn.textContent = 'Publish to master'; });
});

// GM: load draft for review
document.getElementById('btn-load-draft').addEventListener('click', function() {
  if (!confirm('Load the player draft? This will replace your current view.')) return;
  fetch(WORKER_URL + '/read-draft', { method: 'GET' })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(obj) {
      if (!obj) { toast('No player draft found.'); return; }
      cy.elements().remove();
      cy.add(jsonToElements(obj));
      cy.fit(undefined, 60);
      toast('Player draft loaded.');
    })
    .catch(function(err) { toast('Failed to load draft: ' + err.message); });
});

/* ─────────────────────────────────────────────────────────────
   GM mode
───────────────────────────────────────────────────────────── */
function checkGMMode() {
  var params = new URLSearchParams(window.location.search);
  if (params.get('gm') !== 'true') return;
  var passphrase = prompt('GM passphrase:');
  if (!passphrase) return;
  // Validate against worker
  fetch(WORKER_URL + '/gm-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-GM-Passphrase': passphrase },
    body: JSON.stringify({}),
  }).then(function(r) {
    if (!r.ok) { alert('Wrong passphrase.'); return; }
    gmMode = true;
    gmPassphrase = passphrase;
    document.getElementById('gm-banner').style.display = 'block';
    document.getElementById('btn-publish').style.display = '';
    document.getElementById('btn-load-draft').style.display = '';
    toast('GM mode active.');
  }).catch(function() { alert('Could not verify passphrase. Check Worker URL.'); });
}

/* ─────────────────────────────────────────────────────────────
   Escape helper (prevents XSS in innerHTML strings)
───────────────────────────────────────────────────────────── */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─────────────────────────────────────────────────────────────
   Bootstrap
───────────────────────────────────────────────────────────── */
function boot() {
  checkGMMode();

  // Load search index for website_ref autocomplete
  fetch(SEARCH_INDEX_URL)
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) { searchIndex = data; })
    .catch(function() {});

  // Load master graph, then check localStorage for a newer autosave
  loadMasterGraph().then(function(masterGraph) {
    var autosaved = null;
    try {
      var raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) autosaved = JSON.parse(raw);
    } catch(e) {}

    var useAutosave = false;
    if (autosaved && autosaved.graph) {
      useAutosave = confirm(
        'An autosaved session was found from ' +
        new Date(autosaved.ts).toLocaleString() +
        '.\nResume from autosave? (Cancel to load the master graph)'
      );
    }

    var elements = jsonToElements(useAutosave ? autosaved.graph : masterGraph);
    initCytoscape(elements);
    if (useAutosave) markDirty();
    else markClean('Loaded from master');
  });
}

boot();
