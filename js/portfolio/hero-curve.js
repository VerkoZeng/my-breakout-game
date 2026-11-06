/*!
 * portfolio / hero-curve.js
 * ---------------------------------------------------------------------------
 * Hero 区「抽卡累计出货率曲线」绘制与入场动画。
 * 职责：依据「70 抽软保底线 / 100 抽硬保底」模型计算累计出货率，并写入 SVG 路径与全部标注。
 *
 * 模型来源：gacha-model.js —— 与「概率抽卡模拟器」共用同一份概率函数，
 *           避免 Hero 曲线 / 模拟器 / 文案三处口径漂移（此前本文件写死 90 硬 / 60 软，
 *           与页面宣称的 100 硬 / 70 软并不一致）。
 *
 * 默认参数：SSR 1% · 每抽递增 1% · 软保底 70 · 硬保底 100 → 次数期望 ≈ 56.1 抽
 *   软保底线（70 抽）处累计出货率约 50.5%——曲线在软保底线处约半高，此后加速抬升至 100%。
 * 累计出货率定义：cum(n) = 1 - Π_{i=1..n}(1 - p(i))（单个保底周期内至少出货一次）
 *
 * 依赖 DOM：#heroCurve #curvePath #curveFill #pityPoint #pityLabel #softPoint
 *           #curveZone #zoneLabel #tickStart #tickSoft #tickHard
 *           #gridV1 #gridV2 #gridV3 #midLabel #axisBase #legendSoft
 *           #chartExp #chartHard
 * 无跨模块依赖，无全局变量泄漏（IIFE 封装）。
 * ========================================================================== */
/* ================= Hero 累计出货率曲线 ================= */
(function () {
  'use strict';

  var GM = window.GachaModel;
  if (!GM) { console.error('[hero-curve] 未加载 gacha-model.js，曲线无法绘制'); return; }

  var M = GM.make(GM.DEFAULTS);
  var P = M.params, SOFT = P.soft, N = P.hard;

  // ---- 几何映射：抽数 → X，累计出货率 → Y ----
  var X0 = 40, Y0 = 190, X1 = 410, Y1 = 30;
  var x = function (n) { return X0 + (X1 - X0) * (n - 1) / (N - 1); };
  var y = function (c) { return Y0 - (Y0 - Y1) * c; };

  var $ = function (id) { return document.getElementById(id); };
  var attr = function (el, k, v) { if (el) el.setAttribute(k, v); };

  // 概率 → 百分比文本（自适应精度，去掉多余的 0）
  function fmtPct(p) {
    var v = p * 100;
    var s = v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(3);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s + '%';
  }

  // ---- 累计出货率曲线（SVG path）----
  var path = $('curvePath'), fill = $('curveFill');
  if (!path || !fill) return;
  var d = 'M ' + x(1).toFixed(1) + ' ' + y(M.cum(1)).toFixed(1);
  for (var n = 2; n <= N; n++) d += ' L ' + x(n).toFixed(1) + ' ' + y(M.cum(n)).toFixed(1);
  path.setAttribute('d', d);
  fill.setAttribute('d', d + ' L ' + x(N).toFixed(1) + ' ' + Y0 + ' L ' + x(1).toFixed(1) + ' ' + Y0 + ' Z');

  // ---- 硬保底点：n = N，累计出货率恒为 100% ----
  attr($('pityPoint'), 'cx', x(N));
  attr($('pityPoint'), 'cy', y(1));
  var lb = $('pityLabel');
  if (lb) { attr(lb, 'x', x(N) - 16); attr(lb, 'y', y(1) - 12); lb.textContent = '100%'; }

  // ---- 软保底线：n = SOFT ----
  attr($('curveZone'), 'x1', x(SOFT));
  attr($('curveZone'), 'x2', x(SOFT));
  var zl = $('zoneLabel');
  if (zl) {
    zl.textContent = SOFT + ' 抽后概率递增';
    attr(zl, 'x', x(SOFT) - 12);
    attr(zl, 'text-anchor', 'end');
  }
  var cdfSoft = M.cum(SOFT);
  attr($('softPoint'), 'cx', x(SOFT));
  attr($('softPoint'), 'cy', y(cdfSoft));

  // ---- 软保底线处的累计出货率标注 ----
  // 本模型下 50% 穿越点与软保底线几乎重合（69 vs 70 抽），
  // 故标注直接指向【软保底线与曲线的交点】，语义更准且不重复。
  var ml = $('midLabel');
  if (ml) {
    // 显示交点真实值（一位小数），避免四舍五入后与曲线位置对不上
    ml.textContent = '≈ ' + (cdfSoft * 100).toFixed(1) + '%';
    // 放在软保底点【右下方】空白：右上与左上都会被上升段曲线穿过
    attr(ml, 'x', x(SOFT) + 8);
    attr(ml, 'y', y(cdfSoft) + 15);
    attr(ml, 'text-anchor', 'start');
  }

  // ---- 坐标刻度 ----
  var ts = $('tickSoft'), th = $('tickHard');
  if (ts) { ts.textContent = SOFT; attr(ts, 'x', x(SOFT) - 10); }
  if (th) { th.textContent = N; attr(th, 'x', x(N) - 14); }
  var gv = [$('gridV1'), $('gridV2'), $('gridV3')];
  for (var i = 0; i < gv.length; i++) {
    if (!gv[i]) continue;
    var gx = x(Math.round(N * (i + 1) / 4));
    attr(gv[i], 'x1', gx); attr(gv[i], 'x2', gx);
  }
  // ---- 轴标注与图例：随模型同步 ----
  var ab = $('axisBase');
  if (ab) ab.textContent = fmtPct(P.baseSSR);
  var lg = $('legendSoft');
  if (lg) lg.textContent = SOFT;

  // ---- 头部读数：与曲线同源，改模型即同步 ----
  var expEl = $('chartExp'), hardEl = $('chartHard');
  if (expEl) expEl.textContent = '≈ ' + M.expected().toFixed(1) + ' 抽';
  if (hardEl) hardEl.textContent = N + ' 抽';

  // ---- 入场动画：一次编排 ----
  var len = path.getTotalLength();
  path.style.strokeDasharray = len;
  path.style.strokeDashoffset = len;
  requestAnimationFrame(function () {
    path.style.transition = 'stroke-dashoffset 1.4s var(--ease)';
    path.style.strokeDashoffset = 0;
    var pt = $('pityPoint');
    if (pt) { pt.style.transition = 'opacity .5s 1.1s var(--ease)'; pt.style.opacity = 1; }
  });
})();
