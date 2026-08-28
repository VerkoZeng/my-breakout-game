/* ============================================================================
 * lingjing / heroEditor.js
 * 灵境英雄创建 / 编辑界面（基于 lingjing-hero-editor.html 移植）
 *  - 三种模式：拖动 / 删除 / 新增 顶点
 *  - 拖拽顶点、点边增点、右键删点、撤销/重做
 *  - 选中顶点/边后，实时显示“该顶点/边”的攻击、防御值（不求和）
 *  - 右侧预览播放 lingjing-hero.html 的 morph 动画
 *  - 保存进当前账户，可后续再次打开调整
 * 全局命名空间：window.LJ.editor
 * ==========================================================================*/
(function () {
  'use strict';

  var stage, blob, preview, statsBox;
  var handleEls = [];
  var points = [];
  var draggingIndex = -1, dragSnapshot = null;
  var mode = 'drag';                 // drag | delete | add
  var selected = null;               // { kind:'vertex'|'edge', index }
  var undoStack = [], redoStack = [];

  var MAX_HISTORY = 5, MIN_POINTS = 3, SEG_THRESHOLD = 3.5;

  // ---- 工具 ----
  function snapshot() { return points.map(function (p) { return p.slice(); }); }
  function pct(arr) { return arr.map(function (p) { return p[0].toFixed(2) + '% ' + p[1].toFixed(2) + '%'; }).join(', '); }
  function clipOf(arr) { return 'polygon(' + pct(arr) + ')'; }

  function generateKeyframes(pts) {
    function shifted(shift) { return pts.slice(shift % pts.length).concat(pts.slice(0, shift % pts.length)); }
    return '@keyframes edMorph{' +
      '0%,100%{clip-path:polygon(' + pct(shifted(0)) + ');}' +
      '25%{clip-path:polygon(' + pct(shifted(1)) + ');}' +
      '50%{clip-path:polygon(' + pct(shifted(2)) + ');}' +
      '75%{clip-path:polygon(' + pct(shifted(3)) + ');}}';
  }

  // ---- 历史 ----
  function pushHistory(snap) { undoStack.push(snap); if (undoStack.length > MAX_HISTORY) undoStack.shift(); redoStack = []; updateButtons(); }
  function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); points = undoStack.pop(); selected = null; rebuild(); updateAll(); }
  function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); points = redoStack.pop(); selected = null; rebuild(); updateAll(); }
  function updateButtons() {
    var u = document.getElementById('ed-undo'), r = document.getElementById('ed-redo');
    if (u) u.disabled = undoStack.length === 0;
    if (r) r.disabled = redoStack.length === 0;
  }

  function rebuild() {
    handleEls.forEach(function (e) { e.remove(); });
    handleEls = [];
    points.forEach(function (p, i) {
      var h = document.createElement('div');
      h.className = 'handle'; h.dataset.index = i;
      stage.appendChild(h); handleEls.push(h);
    });
  }

  function updateBlob() { blob.style.clipPath = clipOf(points); }
  function updateHandles() {
    handleEls.forEach(function (e, i) {
      e.style.left = points[i][0] + '%';
      e.style.top = points[i][1] + '%';
      e.classList.toggle('sel', !!(selected && selected.kind === 'vertex' && selected.index === i));
    });
  }
  function updatePreview() {
    var style = document.getElementById('ed-keyframe-style');
    style.textContent = generateKeyframes(points);
  }

  // 显示“选中顶点/边”的攻击、防御值（不求和；不显示角度）
  function updateStats() {
    var s = LJ.data.computeStats(points);
    var html = '';
    if (selected && selected.kind === 'vertex' && s.vertices[selected.index]) {
      var v = s.vertices[selected.index];
      html =
        '<div class="stat"><span>选中·顶点#' + selected.index + '</span><b>&nbsp;</b></div>' +
        '<div class="stat"><span>攻击</span><b>' + v.atk.toFixed(1) + '</b></div>' +
        '<div class="stat"><span>防御</span><b>' + v.def.toFixed(1) + '</b></div>';
    } else if (selected && selected.kind === 'edge' && s.edges[selected.index]) {
      var ed = s.edges[selected.index];
      html =
        '<div class="stat"><span>选中·边#' + selected.index + '</span><b>&nbsp;</b></div>' +
        '<div class="stat"><span>攻击</span><b>' + ed.atk.toFixed(1) + '</b></div>' +
        '<div class="stat"><span>防御</span><b>' + ed.def.toFixed(1) + '</b></div>';
    } else {
      html =
        '<div class="stat"><span>平均·攻击</span><b>' + s.avgAk + '</b></div>' +
        '<div class="stat"><span>平均·防御</span><b>' + s.avgDf + '</b></div>' +
        '<div class="stat"><span>生命</span><b>' + s.hp + '</b></div>' +
        '<p class="stat-hint">点选顶点 / 边查看其攻击、防御；切换模式 拖动 / 删除 / 新增。</p>';
    }
    statsBox.innerHTML = html;
  }

  function updateAll() { updateBlob(); updateHandles(); updatePreview(); updateStats(); }

  function clientToPercent(cx, cy) {
    var rect = stage.getBoundingClientRect();
    var x = ((cx - rect.left) / rect.width) * 100;
    var y = ((cy - rect.top) / rect.height) * 100;
    return [Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y))];
  }

  function distToSegment(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    var t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    var cx = ax + t * dx, cy = ay + t * dy;
    return [cx, cy, Math.hypot(px - cx, py - cy)];
  }
  function findSegment(x, y) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < points.length; i++) {
      var a = points[i], b = points[(i + 1) % points.length];
      var r = distToSegment(x, y, a[0], a[1], b[0], b[1]);
      if (r[2] < bestD) { bestD = r[2]; best = { index: i, x: r[0], y: r[1] }; }
    }
    return bestD <= SEG_THRESHOLD ? best : null;
  }

  // ---- 事件 ----
  function onDown(e) {
    var t = e.target.closest('.handle');
    if (t) {
      var idx = +t.dataset.index;
      if (mode === 'delete') {
        if (points.length > MIN_POINTS) {
          pushHistory(snapshot()); points.splice(idx, 1); selected = null; rebuild(); updateAll();
        }
        return;
      }
      // 选中该顶点
      selected = { kind: 'vertex', index: idx };
      updateStats(); updateHandles();
      if (mode === 'drag') {
        e.preventDefault();
        draggingIndex = idx; dragSnapshot = snapshot();
        stage.setPointerCapture(e.pointerId);
      }
      return;
    }
    // 空白处（可能是边）
    var c = clientToPercent(e.clientX, e.clientY);
    var seg = findSegment(c[0], c[1]);
    if (mode === 'add' && seg) {
      pushHistory(snapshot());
      points.splice(seg.index + 1, 0, [seg.x, seg.y]);
      selected = { kind: 'vertex', index: seg.index + 1 };
      rebuild(); updateAll();
      return;
    }
    if (seg) selected = { kind: 'edge', index: seg.index };
    else selected = null;
    updateStats(); updateHandles();
  }
  function onMove(e) {
    if (draggingIndex < 0) return;
    var c = clientToPercent(e.clientX, e.clientY);
    points[draggingIndex] = [c[0], c[1]];
    updateAll();
  }
  function onUp(e) {
    if (draggingIndex < 0) return;
    var moved = points[draggingIndex][0] !== dragSnapshot[draggingIndex][0] || points[draggingIndex][1] !== dragSnapshot[draggingIndex][1];
    if (moved) pushHistory(dragSnapshot);
    draggingIndex = -1; dragSnapshot = null;
    stage.releasePointerCapture(e.pointerId);
  }
  function onContext(e) {
    var t = e.target.closest('.handle');
    if (!t) return;
    e.preventDefault();
    if (points.length <= MIN_POINTS) return;
    var idx = +t.dataset.index;
    pushHistory(snapshot());
    points.splice(idx, 1); selected = null; rebuild(); updateAll();
  }

  function render() {
    var screen = document.getElementById('screen-editor');
    if (!screen) return;
    var hero = LJ.data.getHero();
    points = hero.map(function (p) { return p.slice(); });
    undoStack = []; redoStack = [];
    selected = null; mode = 'drag';

    screen.innerHTML = '' +
      '<div class="panel editor-panel">' +
        '<div class="panel-bar"><span>灵境英雄创建 / 调整</span>' +
          '<span class="hint">拖动 / 删除 / 新增 顶点 · 点选查看攻防</span></div>' +
        '<div class="editor-wrap">' +
          '<div class="stage-wrap">' +
            '<div class="stage" id="ed-stage"><div class="blob" id="ed-blob"></div></div>' +
          '</div>' +
          '<div class="editor-side">' +
            '<div class="mode-row">' +
              '<button class="toolbar-btn mode-btn active" data-mode="drag" id="ed-mode-drag">拖动</button>' +
              '<button class="toolbar-btn mode-btn" data-mode="delete" id="ed-mode-delete">删除</button>' +
              '<button class="toolbar-btn mode-btn" data-mode="add" id="ed-mode-add">新增</button>' +
              '<span class="group"><button class="toolbar-btn" id="ed-undo">UNDO</button>' +
              '<button class="toolbar-btn" id="ed-redo">REDO</button></span>' +
            '</div>' +
            '<div class="preview-label">动画预览 (morph)</div>' +
            '<div class="preview-box"><div class="preview-blob" id="ed-preview"></div></div>' +
            '<div class="stats" id="ed-stats"></div>' +
            '<div class="editor-actions">' +
              '<button class="big-btn" id="ed-save">保存灵境英雄</button>' +
              '<button class="toolbar-btn" id="ed-back">返回</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<style id="ed-keyframe-style"></style>';

    stage = document.getElementById('ed-stage');
    blob = document.getElementById('ed-blob');
    preview = document.getElementById('ed-preview');
    statsBox = document.getElementById('ed-stats');

    preview.style.animation = 'edMorph 8s ease-in-out infinite';

    rebuild(); updateAll(); updateButtons();

    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', function () { draggingIndex = -1; dragSnapshot = null; });
    stage.addEventListener('contextmenu', onContext);

    document.getElementById('ed-undo').addEventListener('click', undo);
    document.getElementById('ed-redo').addEventListener('click', redo);

    // 模式切换
    document.querySelectorAll('.mode-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        mode = b.dataset.mode;
        document.querySelectorAll('.mode-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
      });
    });

    document.getElementById('ed-save').addEventListener('click', function () {
      var res = LJ.data.saveHero(points);
      var b = this;
      b.textContent = res.ok ? '已保存 ✓' : '保存失败';
      setTimeout(function () { b.textContent = '保存灵境英雄'; }, 1200);
      if (res.ok && LJ.app) LJ.app.refreshHeroBadge();
    });
    document.getElementById('ed-back').addEventListener('click', function () {
      if (LJ.app) LJ.app.onEditorBack();
    });
    if (!keyBound) { window.addEventListener('keydown', onKey); keyBound = true; }
  }

  var keyBound = false;
  function onKey(e) {
    if (document.getElementById('screen-editor').classList.contains('hidden')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault(); if (e.shiftKey) redo(); else undo();
    }
  }

  window.LJ = window.LJ || {};
  window.LJ.editor = { render: render };
})();
