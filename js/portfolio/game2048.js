/*!
 * portfolio / game2048.js
 * ---------------------------------------------------------------------------
 * 2048 小游戏（移植自 index22.html 的 js/game2048.js，已去除 App 框架依赖）。
 * 职责：4×4 棋盘合并计分、方向键 / 指针拖拽 / 触摸滑动输入、最高分本地持久化。
 * 依赖 DOM：#game2048-board #g2048-score #g2048-best #g2048-reset
 * 关键参数：棋盘 4×4；生成概率 2 : 4 = 9 : 1；最高分存于 localStorage['g2048_best']
 * 输入方案：Pointer Events 统一处理 PC 鼠标拖拽与移动端滑动；方向键为全局监听。
 * 无跨模块依赖，无全局变量泄漏（IIFE 封装）。
 * ========================================================================== */
/* ================= 2048（迁移自 index22 的 game2048.js，已去除 App 依赖） ================= */
(function () {
  var board = [], score = 0, best = 0;
  var boardEl = document.getElementById('game2048-board');
  var scoreEl = document.getElementById('g2048-score');
  var bestEl = document.getElementById('g2048-best');
  var resetBtn = document.getElementById('g2048-reset');
  var startX = 0, startY = 0, dir = null, pointerId = null;

  function loadBest() { try { best = parseInt(localStorage.getItem('g2048_best') || '0', 10) || 0; } catch (e) { best = 0; } }
  function saveBest() { try { localStorage.setItem('g2048_best', String(best)); } catch (e) {} }

  function reset() {
    board = Array.from({ length: 4 }, function () { return [0, 0, 0, 0]; });
    score = 0; dir = null; pointerId = null;
    addRandom(); addRandom(); render();
  }
  function addRandom() {
    var e = [];
    for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) if (!board[r][c]) e.push([r, c]);
    if (!e.length) return;
    var p = e[Math.floor(Math.random() * e.length)];
    board[p[0]][p[1]] = Math.random() < 0.9 ? 2 : 4;
  }
  function render() {
    if (!boardEl) return;
    boardEl.innerHTML = board.flat().map(function (v) {
      return '<div class="game-2048-cell' + (v ? ' n' + v : '') + '">' + (v || '') + '</div>';
    }).join('');
    if (scoreEl) scoreEl.textContent = score;
    if (bestEl) bestEl.textContent = best;
  }
  function mergeLeft(line) {
    var arr = line.filter(function (v) { return v; });
    for (var i = 0; i < arr.length - 1; i++) {
      if (arr[i] && arr[i] === arr[i + 1]) { arr[i] *= 2; score += arr[i]; arr[i + 1] = 0; i++; }
    }
    arr = arr.filter(function (v) { return v; });
    while (arr.length < 4) arr.push(0);
    return arr;
  }
  function move(d) {
    var b = board.map(function (row) { return row.slice(); });
    for (var i = 0; i < 4; i++) {
      if (d === 'left') b[i] = mergeLeft(b[i]);
      else if (d === 'right') b[i] = mergeLeft(b[i].slice().reverse()).reverse();
      else if (d === 'up') { var col = [b[0][i], b[1][i], b[2][i], b[3][i]]; var mc = mergeLeft(col); for (var j = 0; j < 4; j++) b[j][i] = mc[j]; }
      else if (d === 'down') { var col2 = [b[3][i], b[2][i], b[1][i], b[0][i]]; var mc2 = mergeLeft(col2); for (var k = 0; k < 4; k++) b[3 - k][i] = mc2[k]; }
    }
    var changed = JSON.stringify(b) !== JSON.stringify(board);
    if (changed) {
      board = b;
      if (score > best) { best = score; saveBest(); }
      addRandom(); render();
      if (checkOver()) toast('游戏结束！最高分: ' + best);
    }
  }
  function checkOver() {
    for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) {
      if (board[r][c] === 0) return false;
      if (r > 0 && board[r][c] === board[r - 1][c]) return false;
      if (c > 0 && board[r][c] === board[r][c - 1]) return false;
    }
    return true;
  }
  function toast(msg) {
    var t = document.getElementById('g2048-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'g2048-toast';
      t.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);background:rgba(20,22,28,.9);color:#fff;padding:10px 18px;border-radius:8px;font-size:14px;z-index:999;opacity:0;transition:opacity .3s;pointer-events:none;';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._timer); t._timer = setTimeout(function () { t.style.opacity = '0'; }, 2600);
  }

  // 指针输入（PC 鼠标拖拽 + 移动端触摸滑动，统一用 Pointer Events）
  if (boardEl) {
    boardEl.addEventListener('pointerdown', function (e) {
      pointerId = e.pointerId; startX = e.clientX; startY = e.clientY; dir = null;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
      try { e.preventDefault(); } catch (_) {}
    });
    boardEl.addEventListener('pointermove', function (e) {
      if (e.pointerId !== pointerId) return;
      var dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > Math.abs(dy)) dir = dx > 50 ? 'right' : dx < -50 ? 'left' : null;
      else dir = dy > 50 ? 'down' : dy < -50 ? 'up' : null;
    });
    boardEl.addEventListener('pointerup', function (e) {
      if (e.pointerId !== pointerId) return;
      pointerId = null; if (dir) { move(dir); dir = null; }
    });
    boardEl.addEventListener('pointercancel', function (e) {
      if (e.pointerId !== pointerId) return; pointerId = null; dir = null;
    });
    boardEl.addEventListener('dragstart', function (e) { e.preventDefault(); });
  }
  document.addEventListener('keydown', function (e) {
    var map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
  });
  if (resetBtn) resetBtn.addEventListener('click', reset);

  loadBest(); reset();
})();