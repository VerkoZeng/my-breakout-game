/* ============================================================================
 * lingjing / game.js
 * 游戏核心：星空无边界背景、鼠标/触控移动、冲刺、NPC 与战斗、击杀计数
 *
 * 战斗模型（遵循 lingjing.txt 修订）：
 *   每个“顶点”和“边”都有独立的攻击/防御值，不求和。
 *   - 顶点 i：atk = ak-点 * 攻击系数(atkCoef) ; def = df-点 * 防御系数(defCoef)
 *   - 边  e：atk = ak-边 * 0.5 ; def = df-边 * 0.5  （边视为 180°，系数各 0.5）
 *   碰撞时，取“接触方向上的最前顶点/边”组成攻防对：
 *     dmg = MAX(1, battleScale * (攻击方接触部位.atk - 防守方接触部位.def))
 *   任意接触（点/边）均产生对抗并扣血，冷却为常量 HIT_COOLDOWN(0.2s)。
 *
 * NPC：多种类型，生成不重叠；NPC 之间亦可互相造成伤害；
 *      行为由轻量“行为树(Behavior Tree)”驱动（追击/伏击/游荡/畏缩/守卫/群聚）。
 *
 * 全局命名空间：window.LJ.game
 * ==========================================================================*/
(function () {
  'use strict';

  // ---- 可调参数（平衡用，可自由修改）------------------------------------
  var TUNE = {
    playerSpeed: 3.0,     // 普通移动速度(px/帧@60)
    dashSpeed: 12,        // 冲刺速度
    dashDuration: 220,    // 冲刺持续时间(ms)
    dashCooldown: 1000,   // ★ 点击冲刺冷却 1 秒（第八轮需求调整）
    joyRadius: 60,        // 手机端摇杆最大半径(px)，方向向量归一化 [-1,1]
    npcSpeed: 0.55,       // NPC 漂移速度基准（模板可覆盖）
    playerRadius: 34,     // 玩家多边形半径
    npcRadius: 26,        // NPC 默认半径（模板可覆盖）
    battleScale: 0.45,    // 伤害缩放，使单点/单边的攻防差可玩
    maxNpcs: 8,           // 同屏 NPC 上限
    spawnRadius: 560,     // 在玩家周围此半径内维持 NPC / 资源
    hitCooldown: 200,     // ★ 接触冷却常量 0.2 秒（所有伤害共用）
    dashDmgMult: 1.0,     // 冲刺命中伤害倍率
    touchDmgMult: 0.6,    // 普通接触伤害倍率
    sightRange: 360,      // NPC 索敌视野半径
    maxResources: 4,      // 同屏圆形资源上限
    resourceRadiusFactor: 0.25, // 资源半径 = 玩家半径 × 1/4
    resourceHp: 8,        // 资源生命
    killHealRatio: 0.20,  // 击杀敌人恢复 生命上限×20% 当前生命
    growBase: 100,        // 基础生命上限（用于成长/体型计算）
    growStep: 30,         // 每超出 30（基础10%）→ 体型 +10%
    growMax: 800,         // 最大生命上限硬上限（防止体型失控）
    buffDuration: 10000,  // 资源增益持续 10 秒
    buffAtk: 2,           // 红色资源：每层 +2 攻击（可叠加）
    buffSpeed: 0.20,      // 黄色资源：每层 +20% 移速（可叠加）
    resFleeRange: 150,    // 资源感知威胁半径（玩家/NPC 进入即逃避）
    resFleeSpeed: 1.5,    // 资源逃避速度（<玩家速度，可被追上）
    resWanderSpeed: 0.7,  // 资源闲置游荡速度
    resLeash: 1.35,       // 资源软绳：超出 玩家×此倍数 则回流
    fxStarCount: 16,      // 击杀星光粒子数
    fxBurstCount: 7,      // 普通死亡/资源消灭爆裂粒子数
    playerDmgMult: 1.25,  // ★ 玩家攻击伤害倍率（仅玩家攻击时生效，平衡 1v1 击杀节奏）
    regenInterval: 2000,  // 生命恢复间隔(ms)：每 2 秒 +1 当前生命
    regenAmount: 1        // 每次恢复 1 点当前生命（不超过上限）
  };

  // 特效系统：星光粒子（世界坐标）+ 飘字（屏幕坐标）
  var particles = [];
  var floaters = [];

  var canvas, ctx, W, H, raf = null, running = false;
  var player, npcs = [], resources = [], stars = [];
  var kills = 0;
  var lastTs = 0;
  var mouseScreen = { x: 0, y: 0 };
  var heroPoints = [], npcTemplates = [];
  var dashReadyAt = 0;
  var regenTimer = 0;     // 生命恢复计时（每 2 秒 +1）

  // ---- 手机端虚拟摇杆（左手摇杆控方向，右手按钮/右半屏冲刺）----
  var joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
  var isTouchDevice = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    ('ontouchstart' in window);
  // 游戏运行时屏蔽触摸手势（下拉刷新 / 左滑退出等）
  function blockTouchMove(e) { if (running) e.preventDefault(); }

  function el(id) { return document.getElementById(id); }

  // ---- 形态动画（与 lingjing-hero.html 一致的顶点循环位移）-------------
  function rotateLeft(arr, k) { k = ((k % arr.length) + arr.length) % arr.length; return arr.slice(k).concat(arr.slice(0, k)); }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function morphPoints(base, t) {
    var shift = Math.floor(t) % base.length;
    var frac = smooth(t - Math.floor(t));
    var a = rotateLeft(base, shift), b = rotateLeft(base, shift + 1);
    return a.map(function (p, i) { return [p[0] + (b[i][0] - p[0]) * frac, p[1] + (b[i][1] - p[1]) * frac]; });
  }

  // 把百分比顶点转成以(cx,cy)为中心、半径R的局部世界坐标
  function vertexWorld(base, i, cx, cy, R) {
    return [cx + (base[i][0] - 50) / 50 * R, cy + (base[i][1] - 50) / 50 * R];
  }

  function normAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  // ---- 接触部位：找到“朝向目标方向”的最前顶点或边 -----------------------
  // 返回该部位的 { atk, def }（单点/单边的攻防值，不求和）
  function frontPart(ent, tx, ty) {
    if (!ent.base) return ent.vertices[0];   // 圆形资源：无多边形，返回固定占位部位
    var base = ent.base, cx = ent.x, cy = ent.y, R = ent.R;
    var dir = Math.atan2(ty - cy, tx - cx);
    var bestV = 0, bestVD = Infinity;
    for (var i = 0; i < base.length; i++) {
      var w = vertexWorld(base, i, cx, cy, R);
      var a = Math.atan2(w[1] - cy, w[0] - cx);
      var d = Math.abs(normAngle(a - dir));
      if (d < bestVD) { bestVD = d; bestV = i; }
    }
    var bestE = 0, bestED = Infinity;
    for (var e = 0; e < base.length; e++) {
      var aA = vertexWorld(base, e, cx, cy, R);
      var aB = vertexWorld(base, (e + 1) % base.length, cx, cy, R);
      var mid = Math.atan2(((aA[1] + aB[1]) / 2) - cy, ((aA[0] + aB[0]) / 2) - cx);
      var d2 = Math.abs(normAngle(mid - dir));
      if (d2 < bestED) { bestED = d2; bestE = e; }
    }
    if (bestVD <= bestED) return ent.vertices[bestV];
    return ent.edges[bestE];
  }

  // ---- 伤害原始值（未四舍五入、未取 MAX）-------------------------------
  // 严格对应设计公式：hp -= MAX(1, ak*attackCoef - df*defenseCoef)
  //   ak = 攻击方接触部位.atkRaw ，attackCoef = 该部位.atkCoef
  //   df = 防守方接触部位.defRaw ，defenseCoef = 该部位.defCoef
  // 顶点/边各自独立（不求和），由 frontPart 选取接触方向上的最前部位。
  // 临时攻击增益（红色资源）：att.atkBuff 直接叠加到攻击值上。
  function computeDamageRaw(att, def) {
    var aEl = frontPart(att, def.x, def.y);   // 攻击方接触的部位（点/边）
    var dEl = frontPart(def, att.x, att.y);   // 防守方接触的部位（点/边）
    var ak = aEl.atkRaw * aEl.atkCoef + (att.atkBuff || 0);  // = ak-点(40)*攻击系数 或 ak-边(20)*0.5
    var df = dEl.defRaw * dEl.defCoef;        // = df-点(10)*防御系数 或 df-边(5)*0.5
    return TUNE.battleScale * (ak - df);
  }

  // ---- 一次接触结算（带 0.2s 冷却常量）--------------------------------
  // 返回是否击杀防守方
  function applyContact(att, def, mult) {
    if (def.dead || att.dead) return false;
    if (att.isResource) return false;          // ★ 圆形资源不发动攻击
    var now = performance.now();
    if (now - att.lastHit > TUNE.hitCooldown && now - def.lastHurt > TUNE.hitCooldown) {
      var dmg = Math.max(1, Math.round(computeDamageRaw(att, def) * mult));
      def.hp -= dmg;
      att.lastHit = now; def.lastHurt = now; def.flash = 200;
      // 记录“英雄(玩家)对该敌人的伤害”用于击杀参与判定（成长/统计）
      if (att === player && def !== player && !def.isResource) {
        def.dmgByPlayer = (def.dmgByPlayer || 0) + dmg;
        def.lastPlayerHit = now;
      }
      return def.hp <= 0;
    }
    return false;
  }

  // ---- 实体统计（玩家或 NPC）-------------------------------------------
  function makeEntity(base, x, y, R, tpl) {
    var s = LJ.data.computeStats(base);
    var e = {
      base: base, x: x, y: y,
      ak: s.ak, df: s.df,                       // 整体概览（HUD/徽章），战斗不取此求和值
      avgAk: s.avgAk, avgDf: s.avgDf,           // 平均攻击/防御（主界面与游戏 HUD 同步显示）
      vertices: s.vertices, edges: s.edges,     // ★ 单点/单边攻防
      behavior: (tpl && tpl.behavior) || 'wanderer',
      speed: (tpl && tpl.speed) || TUNE.npcSpeed,
      color: (tpl && tpl.color) || '#ff66c4',
      hpMax: TUNE.growBase,   // 固定 100 基础生命（成长在此基础上叠加）
      hp: 0,
      baseR: R, sizeMul: 1,                     // 体型缩放（随成长扩大）
      atkBuffStacks: 0, atkBuffUntil: 0,        // 红色资源：每层 +2 攻击（可叠加）
      speedBuffStacks: 0, speedBuffUntil: 0,    // 黄色资源：每层 +20% 移速（可叠加）
      atkBuff: 0, speedMul: 1,                  // 派生实效值（每帧由 above 推导）
      lastHit: 0, lastHurt: 0,
      dashTimer: 0, vx: 0, vy: 0,
      flash: 0, dead: false,
      dmgByPlayer: 0, lastPlayerHit: -1e9,      // 英雄对该敌人的伤害累计（成长/统计）
      wx: 0, wy: 0, wt: 0
    };
    applySizeScaling(e);                        // 初始 sizeMul=1 → R 不变
    return e;
  }

  // ---- 体型缩放：最大生命超过基础 10%(=110) 后，每超出 30(=基础30%) 体型 +10% ----
  function applySizeScaling(e) {
    var base = TUNE.growBase;
    var threshold = base * 1.1;                // 110
    var step = base * 0.3;                     // 30
    if (e.hpMax > threshold) {
      var steps = Math.floor((e.hpMax - threshold) / step + 1e-9);  // 浮点保护
      e.sizeMul = 1 + 0.1 * steps;
    } else {
      e.sizeMul = 1;
    }
    e.R = e.baseR * e.sizeMul;
  }

  // ---- 击杀敌人：恢复自身生命上限 20% 当前生命（百分比回血，加粗“+”）----
  function healOnKill() {
    player.hp = Math.min(player.hpMax, player.hp + player.hpMax * TUNE.killHealRatio);
    spawnHealFx(player.hpMax * TUNE.killHealRatio, true);  // 百分比回血 → 加粗“+”
  }

  // ---- 击杀敌人：按“伤害量 / 敌人最大生命”比例提升自身最大生命 ----
  // 增量“基于默认生命值”计算：Δ = ratio × 基础生命(growBase)，可多次叠加。
  // 英雄需在敌人死亡前 10 秒内有造成伤害才算“参与击杀”。
  function growOnKill(dmgByPlayer, enemyMaxHp) {
    var ratio = Math.min(1, (dmgByPlayer || 0) / enemyMaxHp);  // 比例上限 1（独杀）
    player.hpMax = Math.min(TUNE.growMax, player.hpMax + ratio * TUNE.growBase);
    applySizeScaling(player);                                   // 同步体型
  }

  // ---- 圆形资源：随机 绿/红/黄，半径=英雄1/4，8生命，防御0 ----
  function spawnResource() {
    var palette = ['#39ff14', '#ff3030', '#ffd400']; // 绿 / 红 / 黄
    var color = palette[Math.floor(Math.random() * palette.length)];
    var R = TUNE.playerRadius * TUNE.resourceRadiusFactor;
    var p = findSpot(R);
    resources.push({
      isResource: true, resColor: color, color: color,
      base: null, x: p[0], y: p[1], R: R, baseR: R, sizeMul: 1,
      vx: 0, vy: 0, wx: 0, wy: 0, wt: 0,
      hpMax: TUNE.resourceHp, hp: TUNE.resourceHp,
      vertices: [{ atkRaw: 0, defRaw: 0, atkCoef: 0, defCoef: 1, atk: 0, def: 0 }],
      edges: [{ atkRaw: 0, defRaw: 0, atkCoef: 0, defCoef: 1, atk: 0, def: 0 }],
      dmgByPlayer: 0, lastPlayerHit: -1e9,
      dead: false, flash: 0, lastHit: 0, lastHurt: 0
    });
  }

  function ensureResources() {
    while (resources.length < TUNE.maxResources) spawnResource();
  }

  // 在不与 玩家/NPC/资源 重叠处找一个点
  function findSpot(R) {
    for (var tries = 0; tries < 24; tries++) {
      var ang = Math.random() * Math.PI * 2;
      var dist = TUNE.spawnRadius * (0.4 + Math.random() * 0.5);
      var x = player.x + Math.cos(ang) * dist;
      var y = player.y + Math.sin(ang) * dist;
      var ok = true;
      if (Math.hypot(x - player.x, y - player.y) < player.R + R + 8) ok = false;
      if (ok) for (var k = 0; k < npcs.length; k++) {
        if (npcs[k].dead) continue;
        if (Math.hypot(x - npcs[k].x, y - npcs[k].y) < npcs[k].R + R + 8) { ok = false; break; }
      }
      if (ok) for (var m = 0; m < resources.length; m++) {
        if (resources[m].dead) continue;
        if (Math.hypot(x - resources[m].x, y - resources[m].y) < resources[m].R + R + 8) { ok = false; break; }
      }
      if (ok) return [x, y];
    }
    var a2 = Math.random() * Math.PI * 2;
    return [player.x + Math.cos(a2) * TUNE.spawnRadius, player.y + Math.sin(a2) * TUNE.spawnRadius];
  }

  // ---- 击败资源：按颜色给予增益（同增益可叠加层数）----
  // killer 可为 玩家 或 NPC（NPC 视为“假玩家”，判断计算逻辑同玩家）
  function onResourceDefeated(res, killer) {
    if (!killer) killer = player;
    var now = performance.now();
    if (res.resColor === '#39ff14') {
      var before = killer.hp;
      killer.hp = Math.min(killer.hpMax, killer.hp + 2);                 // 绿：+2 当前生命
      if (killer.hp > before) spawnHealFx(2, false, killer);             // 普通“+”飘字（在攻击者身上）
    } else if (res.resColor === '#ff3030') {
      killer.atkBuffStacks++;                                            // 红：+2 攻击（叠加层数）
      killer.atkBuffUntil = now + TUNE.buffDuration;
    } else {
      killer.speedBuffStacks++;                                          // 黄：+20% 移速（叠加层数）
      killer.speedBuffUntil = now + TUNE.buffDuration;
    }
  }

  // =======================================================================
  // NPC 行为树（Behavior Tree）— 轻量 Selector / Sequence / Condition / Action
  // =======================================================================
  function sel(children) { return { type: 'sel', children: children }; }
  function seq(children) { return { type: 'seq', children: children }; }
  function cond(fn) { return { type: 'cond', fn: fn }; }
  function act(fn) { return { type: 'act', fn: fn }; }

  function tick(node, n) {
    if (node.type === 'cond') return node.fn(n) ? 'success' : 'failure';
    if (node.type === 'act') { node.fn(n); return 'success'; }
    if (node.type === 'sel') {
      for (var i = 0; i < node.children.length; i++) {
        var r = tick(node.children[i], n);
        if (r !== 'failure') return r;
      }
      return 'failure';
    }
    if (node.type === 'seq') {
      for (var j = 0; j < node.children.length; j++) {
        var r2 = tick(node.children[j], n);
        if (r2 !== 'success') return r2;
      }
      return 'success';
    }
    return 'failure';
  }

  // ---- 感知：最近敌人（玩家或别的 NPC）--------------------------------
  function nearestEnemy(n) {
    var best = null, bestD = Infinity;
    if (player && player.hp > 0) {
      var d = Math.hypot(player.x - n.x, player.y - n.y);
      if (d < bestD) { bestD = d; best = player; }
    }
    for (var i = 0; i < npcs.length; i++) {
      var o = npcs[i];
      if (o === n || o.dead) continue;
      var d2 = Math.hypot(o.x - n.x, o.y - n.y);
      if (d2 < bestD) { bestD = d2; best = o; }
    }
    return { target: best, d: bestD };
  }

  // ---- 转向（设置 n.vx / n.vy，按速度 sp 每帧位移）---------------------
  function steerTo(n, tx, ty, sp) {
    var dx = tx - n.x, dy = ty - n.y, d = Math.hypot(dx, dy) || 1;
    n.vx = dx / d * sp; n.vy = dy / d * sp;
  }
  function steerAway(n, tx, ty, sp) {
    var dx = n.x - tx, dy = n.y - ty, d = Math.hypot(dx, dy) || 1;
    n.vx = dx / d * sp; n.vy = dy / d * sp;
  }
  function wander(n, sp) {
    if (!n.wt || n.wt <= 0) { var a = Math.random() * Math.PI * 2; n.wx = Math.cos(a); n.wy = Math.sin(a); n.wt = 30 + Math.random() * 70; }
    else n.wt--;
    n.vx = n.wx * sp; n.vy = n.wy * sp;
  }
  function idle(n) { n.vx = 0; n.vy = 0; }

  // ---- 行为动作（Action）-----------------------------------------------
  function actChaseNearest(n) { var e = nearestEnemy(n); if (e.target) steerTo(n, e.target.x, e.target.y, n.speed); else wander(n, n.speed); }
  function actChasePlayer(n) { if (player.hp > 0) steerTo(n, player.x, player.y, n.speed); else wander(n, n.speed); }
  function actChargePlayer(n) { if (player.hp > 0) steerTo(n, player.x, player.y, n.speed * 2.2); else wander(n, n.speed); }
  function actFleePlayer(n) { if (player.hp > 0) steerAway(n, player.x, player.y, n.speed); else wander(n, n.speed); }
  function actTankChase(n) { var e = nearestEnemy(n); if (e.target) steerTo(n, e.target.x, e.target.y, n.speed * 0.6); else wander(n, n.speed * 0.6); }
  function actWander(n) { wander(n, n.speed); }
  function actIdle(n) { idle(n); }

  // ---- 行为条件（Condition）-------------------------------------------
  function condEnemyInSight(n) { var e = nearestEnemy(n); return !!e.target && e.d < TUNE.sightRange; }
  function inRange(range) { return function (n) { return player.hp > 0 && Math.hypot(player.x - n.x, player.y - n.y) < range; }; }

  // ---- 行为树表（按模板 behavior 选取）--------------------------------
  var BT = {
    aggressive: sel([ seq([ cond(condEnemyInSight), act(actChaseNearest) ]), act(actWander) ]),
    coward: sel([ seq([ cond(inRange(240)), act(actFleePlayer) ]), act(actWander) ]),
    wanderer: act(actWander),
    hunter: sel([ seq([ cond(inRange(300)), act(actChargePlayer) ]), act(actWander) ]),
    tank: sel([ seq([ cond(condEnemyInSight), act(actTankChase) ]), act(actWander) ]),
    guard: sel([ seq([ cond(inRange(220)), act(actChaseNearest) ]), act(actIdle) ]),
    swarm: sel([ seq([ cond(condEnemyInSight), act(actChaseNearest) ]), act(actWander) ])
  };

  // =======================================================================
  // 圆形资源“逃避”行为树（Flee AI）
  // =======================================================================
  // 感知：最近的威胁（玩家 或 任意未死亡 NPC）
  function nearestThreat(x, y) {
    var best = null, bestD = Infinity;
    if (player && player.hp > 0) {
      var d = Math.hypot(player.x - x, player.y - y);
      if (d < bestD) { bestD = d; best = player; }
    }
    for (var i = 0; i < npcs.length; i++) {
      var o = npcs[i];
      if (o.dead) continue;
      var d2 = Math.hypot(o.x - x, o.y - y);
      if (d2 < bestD) { bestD = d2; best = o; }
    }
    return { target: best, d: bestD };
  }
  function condThreatNear(res) {
    var t = nearestThreat(res.x, res.y);
    return !!t.target && t.d < TUNE.resFleeRange;
  }
  function actResFlee(res) {
    var t = nearestThreat(res.x, res.y);
    if (t.target) steerAway(res, t.target.x, t.target.y, TUNE.resFleeSpeed);
    else wander(res, TUNE.resWanderSpeed);
  }
  function actResWander(res) { wander(res, TUNE.resWanderSpeed); }
  var BT_RES = sel([
    seq([ cond(condThreatNear), act(actResFlee) ]),
    act(actResWander)
  ]);
  function tickResource(res) {
    tick(BT_RES, res);
    // 软绳：离玩家过远则回流，避免资源永远跑出视野
    var d = Math.hypot(res.x - player.x, res.y - player.y);
    if (d > TUNE.spawnRadius * TUNE.resLeash) steerTo(res, player.x, player.y, TUNE.resWanderSpeed);
  }

  // =======================================================================
  // 战斗表现（特效）：星光粒子 + 飘字 + 资源光晕
  // =======================================================================
  // ---- 星光：击杀后先在死亡点“爆开”，再螺旋吸入“参与击杀且将提升最大生命的英雄(玩家)” ----
  // ★ 修正：目标必须是【世界坐标】(player.x, player.y)——此前误用屏幕中心(W/2,H/2)，
  //   与粒子(世界坐标)坐标系不一致，导致星光实际飞向屏幕右下角而非英雄。
  function spawnStarlight(wx, wy) {
    for (var i = 0; i < TUNE.fxStarCount; i++) {
      var a = Math.random() * Math.PI * 2, sp = 1.6 + Math.random() * 2.4;
      particles.push({
        x: wx, y: wy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,     // 第一阶段：向外爆开
        tx: player.x, ty: player.y,                     // 目标（世界坐标）
        target: player,                                 // ★ 指定的英雄；若其死亡则停止归向
        homing: true, spiralDir: (Math.random() < 0.5 ? 1 : -1),  // 螺旋旋转方向
        delay: 200 + Math.random() * 120,               // 爆开阶段时长，随后螺旋吸入
        color: '#ffffff', life: 1100 + Math.random() * 400, max: 1500,
        size: 1.5 + Math.random() * 2
      });
    }
  }
  // ---- 普通死亡/资源消灭：原地彩色爆裂（不归向玩家）----
  function spawnBurst(wx, wy, color) {
    for (var i = 0; i < TUNE.fxBurstCount; i++) {
      var a = Math.random() * Math.PI * 2, sp = 0.8 + Math.random() * 2.2;
      particles.push({
        x: wx, y: wy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * -1 - 0.4,
        tx: 0, ty: 0, homing: false,
        color: color || '#ff66c4', life: 500 + Math.random() * 300, max: 800,
        size: 1.5 + Math.random() * 2
      });
    }
  }
  // ---- 回血飘字：几个绿色“+”，百分比回血用加粗“+” ----
  // who：被治疗者（玩家恒在屏幕中心；NPC 按其屏幕坐标）
  function spawnHealFx(amount, isPercent, who) {
    who = who || player;
    var pos = (who === player) ? [W / 2, H / 2] : worldToScreen(who.x, who.y);
    var cx = pos[0], cy = pos[1] - who.R - 16;
    var n = isPercent ? 4 : 3;   // “几个”绿色 +
    for (var i = 0; i < n; i++) {
      floaters.push({
        x: cx + (Math.random() - 0.5) * who.R * 1.6,
        y: cy - Math.random() * 10,
        vy: -0.5 - Math.random() * 0.3,
        text: '+',
        color: '#39ff14', bold: !!isPercent,
        life: 800 + Math.random() * 300, max: 1100
      });
    }
  }

  function updateEffects(dt) {
    var f = dt / 16.67;
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      if (p.delay > 0) {
        p.delay -= dt;                       // 爆开阶段：保持初始外向速度
      } else if (p.homing && p.target && !p.target.dead && p.target.hp > 0) {
        p.tx = p.target.x; p.ty = p.target.y;         // 目标实时跟随
        var dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy) || 1;
        var ux = dx / d, uy = dy / d;
        var tanX = -uy * p.spiralDir, tanY = ux * p.spiralDir;   // 切向 → 螺旋
        var sp2 = Math.min(7, 0.8 + d * 0.045);        // 远快近慢，避免穿越
        p.vx = (ux * 0.88 + tanX * 0.45) * sp2;        // 径向吸入 + 切向旋转 = 螺旋
        p.vy = (uy * 0.88 + tanY * 0.45) * sp2;
      }
      p.x += p.vx * f; p.y += p.vy * f;
      p.life -= dt;
      var arrived = p.homing && p.target && !p.target.dead &&
        Math.hypot(p.tx - p.x, p.ty - p.y) < 12;
      if (p.life <= 0 || arrived) particles.splice(i, 1);
    }
    for (var j = floaters.length - 1; j >= 0; j--) {
      var fl = floaters[j];
      fl.y += fl.vy * f;
      fl.life -= dt;
      if (fl.life <= 0) floaters.splice(j, 1);
    }
  }

  // 把世界坐标转为屏幕坐标（玩家在屏幕中心）
  function worldToScreen(wx, wy) { return [W / 2 + (wx - player.x), H / 2 + (wy - player.y)]; }

  function drawEffects() {
    var now = performance.now();
    // 星光粒子（世界坐标）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var s = worldToScreen(p.x, p.y);
      var a = Math.max(0, Math.min(1, p.life / p.max));
      ctx.fillStyle = p.color;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(s[0], s[1], p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // 飘字（屏幕坐标）
    ctx.save();
    ctx.textAlign = 'center';
    for (var k = 0; k < floaters.length; k++) {
      var fl = floaters[k];
      var fa = Math.max(0, Math.min(1, fl.life / fl.max));
      ctx.globalAlpha = fa;
      ctx.fillStyle = fl.color;
      ctx.font = (fl.bold ? '900 ' : '700 ') + (fl.bold ? 22 : 16) + 'px system-ui, sans-serif';
      ctx.fillText(fl.text, fl.x, fl.y);
    }
    ctx.restore();
  }

  // ---- 资源生效光晕：以【英雄边缘线条】形式实现（红=攻击、黄=移速）----
  // ★ 第八轮需求：改为沿英雄多边形边缘描边发光（不再内部填充缩小版）。
  //   层数越高线条越粗越亮（同增益叠加），红/黄两种颜色可叠加描边；
  //   玩家与 NPC（假玩家）通用。
  function drawBuffAuras(cx, cy, e, morphT) {
    if (!e || !e.base) return;
    var now = performance.now();
    var atkStacks = (now < e.atkBuffUntil) ? e.atkBuffStacks : 0;
    var spdStacks = (now < e.speedBuffUntil) ? e.speedBuffStacks : 0;
    if (!atkStacks && !spdStacks) return;
    var mp = morphPoints(e.base, morphT || 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    buildPolyPath(mp, cx, cy, e.R);   // 与英雄完全一致的边缘路径
    if (atkStacks > 0) {
      ctx.strokeStyle = 'rgba(255,48,48,' + Math.min(0.95, 0.45 + 0.16 * atkStacks).toFixed(3) + ')';
      ctx.lineWidth = 3 + 1.5 * atkStacks;
      ctx.shadowColor = '#ff3030';
      ctx.shadowBlur = 10 + 6 * atkStacks;
      ctx.stroke();
    }
    if (spdStacks > 0) {
      ctx.strokeStyle = 'rgba(255,212,0,' + Math.min(0.95, 0.45 + 0.16 * spdStacks).toFixed(3) + ')';
      ctx.lineWidth = 3 + 1.5 * spdStacks;
      ctx.shadowColor = '#ffd400';
      ctx.shadowBlur = 10 + 6 * spdStacks;
      ctx.stroke();
    }
    ctx.restore();
  }
  // 以 (cx,cy) 为中心、半径 R 构建 morph 后的多边形边缘路径
  function buildPolyPath(mp, cx, cy, R) {
    ctx.beginPath();
    for (var i = 0; i < mp.length; i++) {
      var wx = cx + (mp[i][0] - 50) / 50 * R;
      var wy = cy + (mp[i][1] - 50) / 50 * R;
      if (i === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
    }
    ctx.closePath();
  }

  // ---- 星空 ----
  function initStars() {
    stars = [];
    var n = 220;
    for (var i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        depth: 0.2 + Math.random() * 0.8,
        size: Math.random() < 0.85 ? 1 : 2,
        tw: Math.random() * Math.PI * 2
      });
    }
  }

  // ---- NPC 生成（不重叠放置）------------------------------------------
  function spawnNpc() {
    var tpl = npcTemplates[Math.floor(Math.random() * npcTemplates.length)];
    var R = tpl.radius || TUNE.npcRadius;
    var placed = null;
    for (var tries = 0; tries < 24; tries++) {
      var ang = Math.random() * Math.PI * 2;
      var dist = TUNE.spawnRadius * (0.6 + Math.random() * 0.4);
      var x = player.x + Math.cos(ang) * dist;
      var y = player.y + Math.sin(ang) * dist;
      var ok = true;
      if (Math.hypot(x - player.x, y - player.y) < player.R + R + 10) ok = false;
      if (ok) {
        for (var k = 0; k < npcs.length; k++) {
          if (npcs[k].dead) continue;
          if (Math.hypot(x - npcs[k].x, y - npcs[k].y) < npcs[k].R + R + 10) { ok = false; break; }
        }
      }
      if (ok) { placed = [x, y]; break; }
    }
    if (!placed) {
      var a2 = Math.random() * Math.PI * 2;
      placed = [player.x + Math.cos(a2) * TUNE.spawnRadius, player.y + Math.sin(a2) * TUNE.spawnRadius];
    }
    var e = makeEntity(tpl.points, placed[0], placed[1], R, tpl);
    e.hp = e.hpMax;
    e.name = tpl.name;
    npcs.push(e);
  }

  function ensureNpcs() {
    while (npcs.length < TUNE.maxNpcs) spawnNpc();
  }

  // ---- 开始 / 结束 ----
  function start() {
    if (running) return;
    heroPoints = LJ.data.getHero();
    npcTemplates = LJ.data.getNpcs();
    canvas = el('game-canvas');
    ctx = canvas.getContext('2d');
    resize();
    player = makeEntity(heroPoints, 0, 0, TUNE.playerRadius);
    player.hpMax = TUNE.growBase;            // 每次开局最大生命回到默认 100
    player.hp = player.hpMax;
    player.atkBuffStacks = 0; player.atkBuffUntil = 0;
    player.speedBuffStacks = 0; player.speedBuffUntil = 0;
    player.atkBuff = 0; player.speedMul = 1;
    player.color = '#ffffff';
    regenTimer = 0;                                 // 生命恢复计时复位
    npcs = []; resources = []; kills = 0; ensureNpcs(); ensureResources();
    particles = []; floaters = [];   // 清空上一局特效
    initStars();
    mouseScreen = { x: W / 2, y: H / 2 };
    running = true; lastTs = performance.now();
    window.addEventListener('resize', resize);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchmove', blockTouchMove, { passive: false });  // ★ 屏蔽下拉刷新/左滑退出
    updateHud();
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    window.removeEventListener('resize', resize);
    if (canvas) {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    }
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('touchmove', blockTouchMove);
  }

  function resize() {
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    W = canvas.width = rect.width; H = canvas.height = rect.height;
  }

  // ---- 输入 ----
  function worldFromScreen(sx, sy) {
    return [player.x + (sx - W / 2), player.y + (sy - H / 2)];
  }
  function onPointerMove(e) {
    var rect = canvas.getBoundingClientRect();
    mouseScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    // 手机端：移动中的摇杆手指 → 更新方向向量（以起点为原点，半径 joyRadius，归一化 [-1,1]）
    if (joy.active && e.pointerId === joy.id) {
      var dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
      var len = Math.hypot(dx, dy);
      var R = TUNE.joyRadius;
      if (len > R) { dx = dx / len * R; dy = dy / len * R; }
      joy.dx = dx / R; joy.dy = dy / R;
    }
  }
  function onPointerDown(e) {
    var rect = canvas.getBoundingClientRect();
    var sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    mouseScreen = { x: sx, y: sy };
    var isTouchPtr = (e.pointerType === 'touch' || e.pointerType === 'pen');
    if (isTouchPtr && sx < W * 0.5) {
      // ★ 左手摇杆：左半屏按下 → 记录起点，进入摇杆控制
      joy.active = true; joy.id = e.pointerId;
      joy.ox = sx; joy.oy = sy; joy.dx = 0; joy.dy = 0;
    } else {
      // 手机右半屏 / PC 点击 → 冲刺
      doDash();
    }
  }
  function onPointerUp(e) {
    if (joy.active && e.pointerId === joy.id) {
      joy.active = false; joy.id = null;
      joy.dx = 0; joy.dy = 0;
    }
  }
  function onKey(e) { if (e.code === 'Space') { e.preventDefault(); doDash(); } }
  function doDash() {
    if (!running) return;
    var now = performance.now();
    if (now < dashReadyAt) return;
    dashReadyAt = now + TUNE.dashCooldown;
    // 冲刺方向：摇杆激活时用摇杆方向，否则朝鼠标/触控目标
    var tgt = (joy.active && (Math.abs(joy.dx) > 0.1 || Math.abs(joy.dy) > 0.1))
      ? [player.x + joy.dx, player.y + joy.dy]
      : worldFromScreen(mouseScreen.x, mouseScreen.y);
    var dx = tgt[0] - player.x, dy = tgt[1] - player.y;
    var len = Math.hypot(dx, dy) || 1;
    player.vx = dx / len * TUNE.dashSpeed;
    player.vy = dy / len * TUNE.dashSpeed;
    player.dashTimer = TUNE.dashDuration;
  }

  // ---- 主循环 ----
  function loop(ts) {
    if (!running) return;
    var dt = Math.min(50, ts - lastTs); lastTs = ts;
    update(dt);
    draw(ts);
    raf = requestAnimationFrame(loop);
  }

  function update(dt) {
    var f = dt / 16.67; // 帧归一化
    var now = performance.now();

    // ---- 临时增益：由截止时间 + 叠加层数推导当前生效值 ----
    // ★ 修正：增益一旦过期即清空层数——同增益只在 10 秒窗口内叠加，
    //   过期后重新拾取从 +1 层开始（此前层数残留，导致下次显示/生效 +40% 甚至更多）。
    if (now >= player.atkBuffUntil) player.atkBuffStacks = 0;
    if (now >= player.speedBuffUntil) player.speedBuffStacks = 0;
    player.atkBuff = (now < player.atkBuffUntil) ? player.atkBuffStacks * TUNE.buffAtk : 0;
    player.speedMul = (now < player.speedBuffUntil) ? (1 + player.speedBuffStacks * TUNE.buffSpeed) : 1;
    // NPC 视为“假玩家”：同样推导资源增益（红=攻击 / 黄=移速）
    for (var bi = 0; bi < npcs.length; bi++) {
      var bn = npcs[bi];
      if (bn.dead) continue;
      if (now >= bn.atkBuffUntil) bn.atkBuffStacks = 0;
      if (now >= bn.speedBuffUntil) bn.speedBuffStacks = 0;
      bn.atkBuff = (now < bn.atkBuffUntil) ? bn.atkBuffStacks * TUNE.buffAtk : 0;
      bn.speedMul = (now < bn.speedBuffUntil) ? (1 + bn.speedBuffStacks * TUNE.buffSpeed) : 1;
    }

    // 生命恢复：当前生命低于上限时，每 2 秒 +1（不会超过生命上限）
    regenTimer += dt;
    if (regenTimer >= TUNE.regenInterval) {
      regenTimer = 0;
      if (player.hp < player.hpMax) player.hp = Math.min(player.hpMax, player.hp + TUNE.regenAmount);
    }

    // 玩家移动（手机端优先摇杆方向，PC 用鼠标跟随）
    var tgt = worldFromScreen(mouseScreen.x, mouseScreen.y);
    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
      player.x += player.vx * f;
      player.y += player.vy * f;
    } else if (joy.active && (Math.abs(joy.dx) > 0.12 || Math.abs(joy.dy) > 0.12)) {
      // ★ 左手摇杆：按归一化方向恒速移动
      var jl = Math.hypot(joy.dx, joy.dy) || 1;
      var jsp = TUNE.playerSpeed * player.speedMul * f;
      player.x += joy.dx / jl * jsp;
      player.y += joy.dy / jl * jsp;
    } else {
      var dx = tgt[0] - player.x, dy = tgt[1] - player.y;
      var d = Math.hypot(dx, dy);
      if (d > 4) {
        var sp = Math.min(TUNE.playerSpeed * player.speedMul, d / 4) * f;
        player.x += dx / d * sp;
        player.y += dy / d * sp;
      }
    }

    // NPC：行为树驱动移动
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      if (n.dead) continue;
      tick(BT[n.behavior] || BT.wanderer, n);
      n.x += n.vx * f * n.speedMul;   // 移速增益（黄色资源，NPC 同玩家生效）
      n.y += n.vy * f * n.speedMul;
      if (n.flash > 0) n.flash -= dt;
    }

    // 玩家 vs 每个 NPC
    for (var p = npcs.length - 1; p >= 0; p--) {
      var np = npcs[p];
      if (np.dead) continue;
      var cd = Math.hypot(player.x - np.x, player.y - np.y);
      if (cd < player.R + np.R) {
        // ★ 玩家攻击倍率含 playerDmgMult（平衡 1v1 击杀节奏）
        var pMult = (player.dashTimer > 0 ? TUNE.dashDmgMult : TUNE.touchDmgMult) * TUNE.playerDmgMult;
        var npKilled = applyContact(player, np, pMult);
        if (npKilled) np.dead = true;                 // ★ 已击杀的敌人立即标记死亡
        if (!np.dead) {                               // ★ 死亡敌人不再反击（修复“对方见底自己却死”）
          var nMult = np.dashTimer > 0 ? TUNE.dashDmgMult : TUNE.touchDmgMult;
          applyContact(np, player, nMult);
        }
        if (player.hp <= 0) { gameOver(); return; }
      }
    }

    // 玩家 vs 圆形资源（接触造成伤害，击败触发增益）
    for (var r = resources.length - 1; r >= 0; r--) {
      var res = resources[r];
      if (res.dead) continue;
      var cr = Math.hypot(player.x - res.x, player.y - res.y);
      if (cr < player.R + res.R) {
        var rrMult = player.dashTimer > 0 ? TUNE.dashDmgMult : TUNE.touchDmgMult;
        applyContact(player, res, rrMult);
        // ★ 击杀资源【不计入】击杀目标计数(kills)——kills 仅在 NPC 死亡且英雄参与时递增；
        //   资源被击败仅触发 onResourceDefeated 增益（绿+2血/红+2攻/黄+20%移速）。
        if (res.hp <= 0) { res.dead = true; onResourceDefeated(res, player); resources.splice(r, 1); }
      }
    }

    // NPC vs NPC（互相造成伤害）
    for (var a = 0; a < npcs.length; a++) {
      for (var b = a + 1; b < npcs.length; b++) {
        var na = npcs[a], nb = npcs[b];
        if (na.dead || nb.dead) continue;
        var dd = Math.hypot(na.x - nb.x, na.y - nb.y);
        if (dd < na.R + nb.R) {
          applyContact(na, nb, na.dashTimer > 0 ? TUNE.dashDmgMult : TUNE.touchDmgMult);
          if (nb.hp <= 0) nb.dead = true;             // ★ 每轮结算后立即标记死亡
          applyContact(nb, na, nb.dashTimer > 0 ? TUNE.dashDmgMult : TUNE.touchDmgMult);
          if (na.hp <= 0) na.dead = true;             // ★ 防止已死亡单位继续攻击
        }
      }
    }

    // NPC vs 圆形资源：NPC 视为“假玩家”，攻击逻辑与玩家一致（资源仍不反击）
    for (var n2 = 0; n2 < npcs.length; n2++) {
      var nn = npcs[n2];
      if (nn.dead) continue;
      for (var rr = resources.length - 1; rr >= 0; rr--) {
        var rr2 = resources[rr];
        if (rr2.dead) continue;
        var drr = Math.hypot(nn.x - rr2.x, nn.y - rr2.y);
        if (drr < nn.R + rr2.R) {
          var nrm = nn.dashTimer > 0 ? TUNE.dashDmgMult : TUNE.touchDmgMult;
          applyContact(nn, rr2, nrm);   // 与 applyContact(player, res, ...) 完全一致
          if (rr2.hp <= 0) {
            rr2.dead = true;
            spawnBurst(rr2.x, rr2.y, rr2.resColor);   // 资源被消灭：原地爆裂
            onResourceDefeated(rr2, nn);              // ★ NPC 视为“假玩家”：同样获得资源增益（不计入击杀数）
            resources.splice(rr, 1);
          }
        }
      }
    }

    // 圆形资源：逃避行为树驱动移动（威胁=玩家/最近NPC）
    for (var ri = 0; ri < resources.length; ri++) {
      var rz = resources[ri];
      if (rz.dead) continue;
      tickResource(rz);
      rz.x += rz.vx * f;
      rz.y += rz.vy * f;
      if (rz.flash > 0) rz.flash -= dt;
    }

    // 清理死亡 NPC：英雄 10 秒内曾造成伤害 → 参与击杀（回血 + 成长 + 星光飞向英雄）
    var removed = false;
    for (var c = npcs.length - 1; c >= 0; c--) {
      if (npcs[c].dead) {
        if (now - npcs[c].lastPlayerHit <= 10000) {
          kills++;
          healOnKill();
          growOnKill(npcs[c].dmgByPlayer, npcs[c].hpMax);
          spawnStarlight(npcs[c].x, npcs[c].y);   // 星光飞向“参与击杀且将提升最大生命的英雄”
        } else {
          spawnBurst(npcs[c].x, npcs[c].y, npcs[c].color);  // NPC 互杀：原地爆裂
        }
        npcs.splice(c, 1);
        removed = true;
      }
    }
    updateEffects(dt);   // 推进特效（星光/飘字）
    if (removed) ensureNpcs();
    ensureResources();   // 维持资源数量
    updateHud();         // 每帧刷新 HUD（含血条/增益）
  }

  function draw(ts) {
    // 星空（视差，无边界）
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    var camX = player.x, camY = player.y;
    for (var s = 0; s < stars.length; s++) {
      var st = stars[s];
      var sx = (st.x - camX * st.depth * 0.15) % W; if (sx < 0) sx += W;
      var sy = (st.y - camY * st.depth * 0.15) % H; if (sy < 0) sy += H;
      var a = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(ts / 600 + st.tw));
      ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
      ctx.fillRect(sx, sy, st.size, st.size);
    }

    // 玩家（屏幕中心）
    var pcx = W / 2, pcy = H / 2;
    drawEntity(player, pcx, pcy, ts / 1000 * 0.5, true);
    drawBuffAuras(pcx, pcy, player, ts / 1000 * 0.5);   // 内部发光（缩小版英雄，可叠加）

    // NPC
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      var nx = pcx + (n.x - player.x);
      var ny = pcy + (n.y - player.y);
      if (nx < -80 || nx > W + 80 || ny < -80 || ny > H + 80) continue;
      drawEntity(n, nx, ny, ts / 1000 * 0.5 + i, false);
      drawBuffAuras(nx, ny, n, ts / 1000 * 0.5 + i);   // ★ NPC 持增益时同样发光（假玩家）
    }

    // 圆形资源（绿/红/黄）
    for (var ri = 0; ri < resources.length; ri++) {
      var rs = resources[ri];
      var rx = pcx + (rs.x - player.x);
      var ry = pcy + (rs.y - player.y);
      if (rx < -40 || rx > W + 40 || ry < -40 || ry > H + 40) continue;
      ctx.beginPath();
      ctx.arc(rx, ry, rs.R, 0, Math.PI * 2);
      ctx.fillStyle = rs.color;
      ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#000000'; ctx.stroke();
      // 资源血条
      var rbw = rs.R * 2, rbh = 4, rby = ry - rs.R - 8;
      ctx.fillStyle = '#330011'; ctx.fillRect(rx - rbw / 2, rby, rbw, rbh);
      ctx.fillStyle = rs.color; ctx.fillRect(rx - rbw / 2, rby, rbw * Math.max(0, rs.hp / rs.hpMax), rbh);
    }

    // 特效：星光粒子 + 回血飘字（最上层）
    drawEffects();

    // 手机端虚拟摇杆（左手）：仅触摸设备且激活时绘制
    if (isTouchDevice && joy.active) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(joy.ox, joy.oy, TUNE.joyRadius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = '#ff2d2d';
      var hx = joy.ox + joy.dx * (TUNE.joyRadius * 0.55), hy = joy.oy + joy.dy * (TUNE.joyRadius * 0.55);
      ctx.beginPath(); ctx.arc(hx, hy, 22, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawEntity(e, cx, cy, morphT, isPlayer) {
    var mp = morphPoints(e.base, morphT);
    ctx.beginPath();
    for (var i = 0; i < mp.length; i++) {
      var lx = (mp[i][0] - 50) / 50 * e.R;
      var ly = (mp[i][1] - 50) / 50 * e.R;
      var wx = cx + lx, wy = cy + ly;
      if (i === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
    }
    ctx.closePath();
    if (e.flash > 0) ctx.fillStyle = '#ffffff';
    else ctx.fillStyle = e.color;
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#000000'; ctx.stroke();

    // 血条（玩家与 NPC 同位置：多边形正上方）
    var bw = e.R * 1.6, bh = 5, by = cy - e.R - 14;
    ctx.fillStyle = '#330011'; ctx.fillRect(cx - bw / 2, by, bw, bh);
    ctx.fillStyle = isPlayer ? '#ffffff' : e.color;
    ctx.fillRect(cx - bw / 2, by, bw * Math.max(0, e.hp / e.hpMax), bh);
    if (!isPlayer) {
      // NPC 名称（显示类型与行为）
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText((e.name || '') + '·' + e.behavior, cx, cy - e.R - 20);
    }
  }

  function updateHud() {
    var hpEl = el('hud-hp-fill'), killsEl = el('hud-kills'), statEl = el('hud-stats');
    if (hpEl) hpEl.style.width = Math.max(0, (player.hp / player.hpMax) * 100) + '%';
    if (killsEl) killsEl.textContent = '击杀 ' + kills;
    if (statEl) {
      var txt = '生命 ' + Math.max(0, Math.ceil(player.hp)) + '/' + Math.round(player.hpMax) +
        ' · 平均攻击 ' + player.avgAk + ' · 平均防御 ' + player.avgDf;
      var now = performance.now(), buffs = [];
      if (now < player.atkBuffUntil && player.atkBuffStacks > 0)
        buffs.push('攻击+' + (player.atkBuffStacks * TUNE.buffAtk) + '(x' + player.atkBuffStacks + ',' + Math.ceil((player.atkBuffUntil - now) / 1000) + 's)');
      if (now < player.speedBuffUntil && player.speedBuffStacks > 0)
        buffs.push('速度+' + Math.round(player.speedBuffStacks * TUNE.buffSpeed * 100) + '%(x' + player.speedBuffStacks + ',' + Math.ceil((player.speedBuffUntil - now) / 1000) + 's)');
      if (buffs.length) txt += '  [' + buffs.join(' ') + ']';
      statEl.textContent = txt;
    }
    // 冲刺按钮冷却倒计时（手机端可见；PC 隐藏按钮）
    var dashBtn = el('btn-dash');
    if (dashBtn) {
      var remain = dashReadyAt - performance.now();
      if (remain > 0) {
        dashBtn.disabled = true;
        dashBtn.textContent = (remain / 1000).toFixed(1) + 's';
      } else {
        dashBtn.disabled = false;
        dashBtn.textContent = '冲刺';
      }
    }
  }

  function gameOver() {
    stop();
    var u = LJ.data.getCurrentUser();
    var name = u ? u.username : 'You';
    LJ.data.addScore(name, kills, 1);   // 每局阵亡记 1 次死亡
    if (LJ.app) LJ.app.onGameOver(kills);
  }

  window.LJ = window.LJ || {};
  window.LJ.game = { start: start, stop: stop, isRunning: function () { return running; } };
})();
