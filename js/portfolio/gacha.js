/*!
 * portfolio / gacha.js
 * ---------------------------------------------------------------------------
 * 概率抽卡模拟器：参数手动可调（SSR/SR 基础概率、软保底、硬保底），
 * 单抽 / 十连、硬保底计数、累计出货率迷你曲线、抽取记录。
 * 默认：SSR 1% · SR 5% · 软保底 70 · 硬保底 100（与 原型记录.xlsx 参数区一致）。
 *
 * 概率模型来自 gacha-model.js（与 Hero 曲线共用同一份实现，保证全站口径一致）。
 * 依赖 DOM：#inSSR #inSR #inSSRInc #inSoft #inHard #modelLabel #ssrRate #srRate
 *           #btnSingle #btnTen #btnReset #expVal
 *           #totalCnt #ssrCnt #srCnt #pityText #pityFill #gachaLog #gachaCurve
 * 无跨模块依赖，无全局变量泄漏（IIFE 封装）。
 * ========================================================================== */
/* ================= 抽卡模拟器 ================= */
(function () {
  var DEFAULTS = { ssr: 1.0, sr: 5.0, inc: 1.0, soft: 70, hard: 100 };

  // 参数输入
  var inSSR  = document.getElementById('inSSR');
  var inSR   = document.getElementById('inSR');
  var inSoft = document.getElementById('inSoft');
  var inHard = document.getElementById('inHard');
  var inSSRInc = document.getElementById('inSSRInc');
  var modelLabel = document.getElementById('modelLabel');
  var ssrRateEl  = document.getElementById('ssrRate');
  var srRateEl   = document.getElementById('srRate');
  var expValEl   = document.getElementById('expVal');

  // 画布与日志
  var logEl = document.getElementById('gachaLog');
  var curveCanvas = document.getElementById('gachaCurve');
  var ctx = curveCanvas.getContext('2d');
  var DPR = window.devicePixelRatio || 1;

  // 运行状态
  var pity = 0, total = 0, ssr = 0, sr = 0, r = 0;

  function clamp(v, lo, hi) {
    if (isNaN(v)) return lo;
    return Math.min(hi, Math.max(lo, v));
  }
  function readParams() {
    var ssrPct = clamp(parseFloat(inSSR.value), 0, 100);
    var srPct  = clamp(parseFloat(inSR.value), 0, 100);
    var soft = Math.max(1, Math.floor(parseFloat(inSoft.value)));
    var hard = Math.max(soft + 1, Math.floor(parseFloat(inHard.value)));
    var incPct = clamp(parseFloat(inSSRInc.value), 0, 100);
    return { baseSSR: ssrPct / 100, baseSR: srPct / 100, inc: incPct / 100, soft: soft, hard: hard };
  }
  // 概率模型：与 Hero 曲线共用 gacha-model.js（单一事实源）
  var P = readParams();
  var M = window.GachaModel.make(P);

  function refreshParams() {
    P = readParams();
    M = window.GachaModel.make(P);
    updateModelLabel();
    drawCurve();
    updateUI();
  }

  // 第 n 抽（1-based）SSR 单抽概率；n >= 硬保底 必出（由 gacha-model 提供）
  function p(n) { return M.p(n); }
  // 前 n 抽累计出货概率
  function cum(n) { return M.cum(n); }

  // 次数期望：与 原型记录.xlsx 的 LET 公式一致
  // E = 1 + Σ_{k=1}^{hard-1} ∏_{i=1}^{k}(1-p(i))（生存函数法；硬保底必出，尾项=0）
  function expectedPulls() { return M.expected(); }

  function sizeCanvas() {
    var w = curveCanvas.clientWidth || 320, h = 96;
    curveCanvas.width = w * DPR; curveCanvas.height = h * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { w: w, h: h };
  }

  function drawCurve() {
    var N = P.hard, SOFT = P.soft;
    var s = sizeCanvas(), w = s.w, h = s.h;
    var padL = 6, padR = 6, padT = 8, padB = 16;
    var cw = w - padL - padR, ch = h - padT - padB;
    ctx.clearRect(0, 0, w, h);
    // 网格
    ctx.strokeStyle = 'rgba(20,22,28,0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    for (var i = 0; i <= 4; i++) {
      var yy = padT + ch * i / 4;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
    }
    ctx.setLineDash([]);
    // 软保底线
    var sx = padL + cw * (SOFT - 1) / (N - 1);
    ctx.strokeStyle = 'rgba(201,138,27,0.35)';
    ctx.beginPath(); ctx.moveTo(sx, padT); ctx.lineTo(sx, padT + ch); ctx.stroke();
    // 累计曲线
    ctx.strokeStyle = '#4050E0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var n = 1; n <= N; n++) {
      var cx = padL + cw * (n - 1) / (N - 1);
      var cy = padT + ch * (1 - cum(n));
      if (n === 1) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    // 当前位置
    var px = padL + cw * Math.min(pity, N - 1) / (N - 1);
    var py = padT + ch * (1 - cum(Math.min(pity, N)));
    ctx.fillStyle = '#C98A1B';
    ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill();
    // 坐标标签
    ctx.fillStyle = '#5C6272';
    ctx.font = '10px sans-serif';
    ctx.fillText('1', padL, h - 4);
    ctx.fillText(String(SOFT), padL + cw * (SOFT - 1) / (N - 1) - 8, h - 4);
    ctx.fillText(String(N), w - padR - 14, h - 4);
    ctx.fillText('100%', padL, padT + 8);
  }

  function updateModelLabel() {
    modelLabel.innerHTML = 'SR <b>' + (P.baseSR * 100).toFixed(1) + '%</b> + SSR <b>'
      + (P.baseSSR * 100).toFixed(1) + '%</b> · ' + P.soft + ' 抽后递增 · ' + P.hard + ' 抽<b>硬保底</b>';
  }

  function updateUI() {
    document.getElementById('totalCnt').textContent = total;
    document.getElementById('ssrCnt').textContent = ssr;
    document.getElementById('srCnt').textContent = sr;
    document.getElementById('pityText').textContent = '第 ' + pity + ' 抽 / ' + P.hard;
    document.getElementById('pityFill').style.width = (pity / P.hard * 100) + '%';
    // 出货率随总抽数刷新：有抽数显示实测率，否则显示配置基础率
    ssrRateEl.textContent = 'SSR 出货 ' + (total > 0 ? (ssr / total * 100) : P.baseSSR * 100).toFixed(2) + '%';
    srRateEl.textContent  = 'SR 出货 '  + (total > 0 ? (sr  / total * 100) : P.baseSR  * 100).toFixed(2) + '%';
    expValEl.textContent  = '≈ ' + expectedPulls().toFixed(2) + ' 抽';
    drawCurve();
  }

  function rollOne() {
    pity++;
    var pp = p(pity);
    var srP = Math.min(P.baseSR, 1 - pp);   // 概率预算被 SSR 吃满时 SR 让位，保证总额 <= 1
    var roll = Math.random();
    if (roll < pp) { pity = 0; ssr++; return 'SSR'; }
    if (roll < pp + srP) { sr++; return 'SR'; }
    r++; return 'R';
  }

  // 单个结果徽标
  function resTag(k) {
    if (k === 'SSR') return '<span class="ssr">SSR</span>';
    if (k === 'SR') return '<span class="sr">SR</span>';
    return '<span class="r">R</span>';
  }
  // 一条记录：抽数在前、操作类型、结果在后
  function logRow(from, ks, isTen) {
    var cnt = ks.length;
    var idx = cnt === 1
      ? '<span class="g-idx">第 <b>' + from + '</b> 抽</span>'
      : '<span class="g-idx">第 <b>' + from + '</b>–<b>' + (from + cnt - 1) + '</b> 抽</span>';
    var tags = '';
    for (var i = 0; i < cnt; i++) tags += resTag(ks[i]);
    return '<div class="g-row new">'
      + idx
      + '<span class="g-type' + (isTen ? ' ten' : '') + '">' + (isTen ? '十连' : '单抽') + '</span>'
      + '<span class="g-res">' + tags + '</span>'
      + '</div>';
  }
  var MAX_ROWS = 40;
  function pushRow(from, ks, isTen) {
    var emptyTip = logEl.querySelector('.empty');
    if (emptyTip) emptyTip.remove();
    logEl.insertAdjacentHTML('afterbegin', logRow(from, ks, isTen));
    while (logEl.children.length > MAX_ROWS) logEl.removeChild(logEl.lastChild);
    updateUI();
  }

  document.getElementById('btnSingle').addEventListener('click', function () {
    var from = total + 1;
    total++;
    pushRow(from, [rollOne()], false);
  });
  document.getElementById('btnTen').addEventListener('click', function () {
    var from = total + 1;
    var ks = [];
    for (var i = 0; i < 10; i++) { total++; ks.push(rollOne()); }
    pushRow(from, ks, true);
  });
  document.getElementById('btnReset').addEventListener('click', function () {
    inSSR.value = DEFAULTS.ssr; inSR.value = DEFAULTS.sr;
    inSSRInc.value = DEFAULTS.inc;
    inSoft.value = DEFAULTS.soft; inHard.value = DEFAULTS.hard;
    P = readParams();
    M = window.GachaModel.make(P);
    pity = 0; total = 0; ssr = 0; sr = 0; r = 0;
    logEl.innerHTML = '<span class="empty">还没有抽卡，点一下试试。</span>';
    updateModelLabel();
    updateUI();
  });

  // 参数实时调整
  [inSSR, inSR, inSSRInc, inSoft, inHard].forEach(function (el) {
    el.addEventListener('input', refreshParams);
    el.addEventListener('change', refreshParams);
  });

  window.addEventListener('resize', drawCurve);
  updateUI();
})();
