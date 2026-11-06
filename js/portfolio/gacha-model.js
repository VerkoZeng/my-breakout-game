/*!
 * portfolio / gacha-model.js
 * ---------------------------------------------------------------------------
 * 抽卡保底模型的【单一事实源】：Hero 静态曲线与「概率抽卡模拟器」共用同一套概率函数。
 * 目的：此前两处各写一份公式（Hero 用 90/60、模拟器用 100/70），导致曲线与文案脱节。
 *
 * 模型（分段线性 + 硬保底）：
 *   p(n) = base                        (n <= soft)      基础概率
 *        = min(1, base + inc*(n-soft)) (soft < n < hard) 每抽递增
 *        = 1                            (n >= hard)      硬保底必出
 *
 *   累计出货概率 CDF(n) = 1 - Π_{i=1..n} (1 - p(i))
 *   次数期望 E           = 1 + Σ_{k=1..hard-1} Π_{i=1..k} (1 - p(i))   （生存函数法）
 *
 * 默认参数：SSR 1% · 每抽递增 1% · 软保底 70 · 硬保底 100 → E ≈ 56.11 抽
 *   （与 原型记录.xlsx 参数区 C8:E10 = 起始 0/70/100、基础 0.01/0.01/1、累加 0/0.01/0 完全一致）
 *   此时软保底线（70 抽）处累计出货率约 50.5%，即「软保底线」的设计意图：
 *   玩家到 70 抽时整体出货进度约半程，此后概率加速抬升。
 * 单位约定：概率一律用【小数】（0.01 = 1%），抽数用整数。
 * 无 DOM 依赖；仅暴露一个全局命名空间 GachaModel（其余模块保持 IIFE 封装）。
 * ========================================================================== */
/* ================= 抽卡保底模型（单一事实源） ================= */
(function (global) {
  'use strict';

  // 默认参数：与 原型记录.xlsx 参数区 及页面文案「70 抽软保底线 / 100 抽硬保底」一致
  var DEFAULTS = { baseSSR: 0.01, inc: 0.01, soft: 70, hard: 100 };

  function num(v, fallback) {
    var x = parseFloat(v);
    return isFinite(x) ? x : fallback;
  }

  /**
   * 构造一个模型实例
   * @param {Object} params { baseSSR, inc, soft, hard }
   * @returns {{params:Object, p:Function, cum:Function, expected:Function}}
   */
  function make(params) {
    var src = params || {};
    var P = {
      baseSSR: Math.min(1, Math.max(0, num(src.baseSSR, DEFAULTS.baseSSR))),
      inc: Math.min(1, Math.max(0, num(src.inc, DEFAULTS.inc))),
      soft: Math.max(1, Math.floor(num(src.soft, DEFAULTS.soft))),
      hard: Math.max(2, Math.floor(num(src.hard, DEFAULTS.hard)))
    };
    if (P.hard <= P.soft) P.hard = P.soft + 1;

    // 第 n 抽（1-based）单抽出货概率
    function p(n) {
      if (n >= P.hard) return 1;
      if (n <= P.soft) return P.baseSSR;
      return Math.min(1, P.baseSSR + P.inc * (n - P.soft));
    }

    // 前 n 抽至少出货一次的概率（累计出货概率 CDF）
    function cum(n) {
      var q = 1;
      for (var i = 1; i <= n; i++) q *= (1 - p(i));
      return 1 - q;
    }

    // 次数期望：E = 1 + Σ_{k=1..hard-1} Π_{i=1..k}(1-p(i))
    function expected() {
      var surv = 1, sum = 0;
      for (var k = 1; k < P.hard; k++) {
        surv *= (1 - p(k));
        sum += surv;
      }
      return 1 + sum;
    }

    return { params: P, p: p, cum: cum, expected: expected };
  }

  global.GachaModel = { DEFAULTS: DEFAULTS, make: make };
})(typeof window !== 'undefined' ? window : this);
