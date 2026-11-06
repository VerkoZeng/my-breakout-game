/*!
 * portfolio / radar.js
 * ---------------------------------------------------------------------------
 * 能力地图 · 五维雷达图。由 index.html 中 .radar-item 的 data-* 驱动。
 *   <li class="radar-item" data-label="全链路数值体系" data-value="85"></li>
 * 纯逻辑，无依赖；IIFE 封装，不污染全局。
 * ---------------------------------------------------------------------------
 * 几何常量（viewBox 0 0 460 330）
 *   CX/CY  雷达中心
 *   R      外环半径（=100%）
 *   标签半径 R + 22，按角度自动选择对齐方式（左端 / 中 / 右端）
 * ---------------------------------------------------------------------------
 */

(function () {
  'use strict';

  var svg = document.getElementById('radarChart');
  if (!svg) return;

  var items = Array.prototype.slice.call(document.querySelectorAll('.radar-item'));
  if (!items.length) return;

  var NS = 'http://www.w3.org/2000/svg';
  var CX = 230, CY = 160, R = 118;
  var LABEL_R = R + 22;

  var reduce = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var data = items.map(function (el) {
    var v = parseFloat(el.getAttribute('data-value'));
    if (isNaN(v)) v = 0;
    return {
      label: el.getAttribute('data-label') || '',
      value: Math.max(0, Math.min(100, v)),
      el: el
    };
  });
  var N = data.length;

  function mk(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] != null) {
        e.setAttribute(k, attrs[k]);
      }
    }
    return e;
  }

  /* 第 i 个维度的角度：正上方为起点，顺时针均分 */
  function angle(i) {
    return -Math.PI / 2 + i * 2 * Math.PI / N;
  }

  function point(i, ratio) {
    var a = angle(i);
    return [CX + Math.cos(a) * R * ratio, CY + Math.sin(a) * R * ratio];
  }

  function polygonPoints(values) {
    var out = [];
    for (var i = 0; i < N; i++) {
      var p = point(i, values[i] / 100);
      out.push(p[0].toFixed(1) + ',' + p[1].toFixed(1));
    }
    return out.join(' ');
  }

  /* ---------- 网格：5 层环 + 5 条轴线 ---------- */
  var gGrid = mk('g', { 'class': 'radar-grid' });
  [0.2, 0.4, 0.6, 0.8, 1].forEach(function (r) {
    gGrid.appendChild(mk('polygon', { 'class': 'radar-ring', points: polygonPoints([100, 100, 100, 100, 100].map(function () { return r * 100; })) }));
  });
  for (var i = 0; i < N; i++) {
    var p = point(i, 1);
    gGrid.appendChild(mk('line', { 'class': 'radar-axis', x1: CX, y1: CY, x2: p[0].toFixed(1), y2: p[1].toFixed(1) }));
  }
  svg.appendChild(gGrid);

  /* ---------- 数据区 + 顶点 ---------- */
  var area = mk('polygon', { 'class': 'radar-area', points: polygonPoints(data.map(function () { return 0; })) });
  svg.appendChild(area);

  var dots = data.map(function () {
    var c = mk('circle', { 'class': 'radar-dot', r: 4, cx: CX, cy: CY });
    svg.appendChild(c);
    return c;
  });

  /* ---------- 轴标签 ---------- */
  var gLabel = mk('g', { 'class': 'radar-labels' });
  data.forEach(function (d, i) {
    var a = angle(i);
    var x = CX + Math.cos(a) * LABEL_R;
    var y = CY + Math.sin(a) * LABEL_R;
    /* deg: 270=正上方，顺时针增大。右侧标签左对齐、左侧标签右对齐、顶部居中 */
    var deg = (a * 180 / Math.PI + 360) % 360;
    var anchor = 'middle';
    if (deg > 240 && deg < 300) anchor = 'middle';   // 正上方
    else if (deg >= 300 || deg < 120) anchor = 'start'; // 右侧
    else anchor = 'end';                              // 左侧

    var t = mk('text', {
      'class': 'radar-label',
      x: x.toFixed(1),
      y: (y + 4).toFixed(1),
      'text-anchor': anchor
    });
    t.textContent = d.label;
    gLabel.appendChild(t);
  });
  svg.appendChild(gLabel);

  /* ---------- 右侧图例（数值 + 进度条） ---------- */
  data.forEach(function (d) {
    var valEl = d.el.querySelector('.rl-val');
    if (valEl) valEl.textContent = d.value;
    var bar = d.el.querySelector('.rl-bar i');
    if (bar) bar.style.width = '0%';
  });

  /* ---------- 绘制动画：从 0 生长到实际值 ---------- */
  function render(t) {
    var values = data.map(function (d) { return d.value * t; });
    area.setAttribute('points', polygonPoints(values));
    for (var i = 0; i < N; i++) {
      var p = point(i, values[i] / 100);
      dots[i].setAttribute('cx', p[0].toFixed(1));
      dots[i].setAttribute('cy', p[1].toFixed(1));
    }
    data.forEach(function (d) {
      var bar = d.el.querySelector('.rl-bar i');
      if (bar) bar.style.width = (d.value * t) + '%';
    });
  }

  render(0);

  if (reduce) {
    render(1);
    return;
  }

  var start = null;
  var DUR = 900;

  function tick(ts) {
    if (start === null) start = ts;
    var t = Math.min(1, (ts - start) / DUR);
    /* easeOutCubic */
    var e = 1 - Math.pow(1 - t, 3);
    render(e);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
