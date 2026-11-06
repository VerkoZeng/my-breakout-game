/* ============================================================================
 * G-Tool / lingjing-gesture-guard.js
 * 全局手势守卫 —— 屏蔽系统手势，防止影响游戏与页面正常操作
 * ----------------------------------------------------------------------------
 * 覆盖范围（G-Tool 全站启用，包括 2048 / 象棋 / 围棋 / 国际象棋 / 灵境 /
 * 首页 / 关于页等所有界面）：
 *   ① 左右边缘（24px 内）起手的水平滑动 → 系统"返回"手势
 *   ② 滚动容器处于顶部时向下拖拽 → 下拉刷新 / 顶部橡皮筋
 *   ③ 滚动容器处于底部时向上拖拽 → 底部橡皮筋
 *   ④ 双指捏合 / 旋转（iOS gesturestart）→ 页面缩放
 * 排除范围（游戏棋盘区域不拦截，由各游戏自身处理触摸）：
 *   - #game2048-board（2048 滑动操作）
 *   - #chess-canvas / #weiqi-canvas / #intlchess-canvas（棋盘点击）
 *   - #game-canvas（灵境画布，摇杆/冲刺）
 * 保留能力：
 *   - 灵境登录 / 排行榜 / 编辑器等可滚动界面的正常纵向滚动
 *   - 各游戏画布的触摸控制（Pointer Events，不受 preventDefault 影响）
 * 说明：
 *   - 配合 G-Tool 顶层 `body { overscroll-behavior: none }` 分层生效。
 *   - preventDefault 仅拦截浏览器默认手势行为，不影响 Pointer Events 派发。
 * ==========================================================================*/
(function () {
  'use strict';

  var EDGE = 24;   // 左右边缘判定宽度(px)
  var DRAG = 10;   // 判定为"拖动"的最小位移(px)

  // 游戏棋盘选择器：这些区域内的触摸由各游戏模块自身处理
  var GAME_BOARD_SELECTOR = [
    '#game2048-board',
    '#chess-canvas',
    '#weiqi-canvas',
    '#intlchess-canvas',
    '#game-canvas'
  ].join(', ');

  var sx = 0, sy = 0;          // 本次触摸起点
  var edgeTouch = false;       // 起点是否位于左右边缘
  var active = false;          // 是否正在跟踪单指触摸

  // 找到可纵向滚动的祖先容器（无则视为页面根）
  function scrollableOf(el) {
    var n = el;
    while (n && n.nodeType === 1 && n !== document.body) {
      var o = window.getComputedStyle(n).overflowY;
      if (o === 'auto' || o === 'scroll' || o === 'overlay') return n;
      n = n.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  // 目标是否在游戏棋盘内（不拦截）
  function isInGameBoard(el) {
    if (!el || !el.closest) return false;
    return !!el.closest(GAME_BOARD_SELECTOR);
  }

  // 记录触摸起点
  function onTouchStart(e) {
    if (e.touches.length !== 1) { active = false; return; }
    var t = e.touches[0];
    sx = t.clientX;
    sy = t.clientY;
    var vw = window.innerWidth, vh = window.innerHeight;
    edgeTouch = (sx < EDGE || sx > vw - EDGE) && sy >= 0 && sy <= vh;
    active = true;
  }

  // 拦截系统手势
  function onTouchMove(e) {
    if (!active || e.touches.length !== 1) return;

    // 游戏棋盘区域：放行，由各游戏模块自行处理
    if (isInGameBoard(e.target)) return;

    var t = e.touches[0];
    var dx = t.clientX - sx, dy = t.clientY - sy;
    var adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx < DRAG && ady < DRAG) return;

    // ① 左右边缘水平滑动 → 系统返回手势
    if (edgeTouch && adx > DRAG && adx > ady) { e.preventDefault(); return; }

    // ② 顶部下拉 → 下拉刷新 / 顶部橡皮筋
    if (ady > DRAG && dy > 0 && ady >= adx) {
      var sc1 = scrollableOf(e.target);
      if (sc1.scrollTop <= 0) { e.preventDefault(); return; }
    }

    // ③ 底部上拉 → 底部橡皮筋
    if (ady > DRAG && dy < 0 && ady >= adx) {
      var sc2 = scrollableOf(e.target);
      if (sc2.scrollTop + sc2.clientHeight >= sc2.scrollHeight - 1) { e.preventDefault(); }
    }
  }

  // ④ iOS 双指缩放 / 旋转手势兜底（页面已 user-scalable=no）
  function onGestureStart(e) { e.preventDefault(); }

  // 全站启用
  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('gesturestart', onGestureStart, { passive: false });

  window.LJ = window.LJ || {};
  window.LJ.gestureGuard = {
    isEnabled: function () { return true; }
  };
})();
