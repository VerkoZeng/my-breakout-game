/* ============================================================================
 * lingjing / data.js
 * 数据层：账户、英雄、NPC、排行榜 + localStorage 持久化 + 战斗属性计算
 * 全局命名空间：window.LJ.data
 * ----------------------------------------------------------------------------
 * 说明：
 *  - 浏览器无法直接写服务器文件，故运行时持久化使用 localStorage（即“浏览器内的数据文件”）。
 *  - data/accounts.json、data/npcs.json、data/leaderboard.json 为项目内的“数据文件”，
 *    在通过本地服务器(http)运行时可由游戏直接读取；读取失败时回退到本文件内嵌的种子数据。
 *  - 提供导出/导入 JSON 功能，便于把账户数据当作可移植的数据文件使用。
 * ==========================================================================*/
(function () {
  'use strict';

  // ---- 游戏常量（来自 lingjing.txt）--------------------------------------
  var CONST = {
    hp: 100,        // 基础生命
    dfPoint: 10,    // 防御-点
    akPoint: 40,    // 攻击-点
    dfEdge: 5,      // 防御-边
    akEdge: 20      // 攻击-边
  };

  // ---- 默认英雄形状（8 顶点 blob，与参考文件一致，百分比坐标）------------
  var DEFAULT_HERO = [
    [35, 0], [75, 12], [100, 45], [82, 88],
    [40, 100], [8, 78], [0, 40], [18, 12]
  ];

  // ---- 种子数据（与 data/*.json 保持一致，供 file:// 直接运行回退）--------
  var SEED = {
    accounts: {
      demo: {
        username: 'demo',
        password: 'demo123',
        hero: DEFAULT_HERO.map(function (p) { return p.slice(); }),
        createdAt: '2026-08-19',
        lastLogin: null
      }
    },
    npcs: [
      { name: '小三角', behavior: 'aggressive', radius: 22, speed: 0.65, color: '#ff66c4', hpMul: 0.9,
        points: [[50, 0], [100, 100], [0, 100]] },
      { name: '方块', behavior: 'tank', radius: 34, speed: 0.35, color: '#66ccff', hpMul: 1.4,
        points: [[0, 0], [100, 0], [100, 100], [0, 100]] },
      { name: '尖钉', behavior: 'hunter', radius: 24, speed: 0.70, color: '#ffd400', hpMul: 0.8,
        points: [[50, 0], [62, 38], [100, 50], [62, 62], [50, 100], [38, 62], [0, 50], [38, 38]] },
      { name: '五边形', behavior: 'tank', radius: 30, speed: 0.40, color: '#9cff57', hpMul: 1.3,
        points: [[50, 0], [98, 38], [79, 100], [21, 100], [2, 38]] },
      { name: '盾形', behavior: 'guard', radius: 32, speed: 0.45, color: '#c77dff', hpMul: 1.4,
        points: [[50, 0], [90, 20], [100, 60], [50, 100], [0, 60], [10, 20]] },
      { name: '锯齿', behavior: 'swarm', radius: 24, speed: 0.85, color: '#ff66c4', hpMul: 0.8,
        points: [[50, 0], [70, 25], [100, 20], [80, 50], [100, 80], [70, 75], [50, 100], [30, 75], [0, 80], [20, 50], [0, 20], [30, 25]] },
      // ---- 新增类型 ----
      { name: '游魂', behavior: 'wanderer', radius: 26, speed: 0.50, color: '#88ffff', hpMul: 1.0,
        points: [[50, 0], [80, 15], [100, 45], [85, 80], [50, 100], [15, 80], [0, 45], [20, 15]] },
      { name: '飞镖', behavior: 'swarm', radius: 20, speed: 1.00, color: '#ffaa00', hpMul: 0.7,
        points: [[50, 0], [60, 40], [100, 50], [60, 60], [50, 100], [40, 60], [0, 50], [40, 40]] },
      { name: '巨岩', behavior: 'tank', radius: 40, speed: 0.28, color: '#bbbbbb', hpMul: 1.8,
        points: [[30, 5], [70, 5], [100, 50], [70, 95], [30, 95], [0, 50]] },
      { name: '魅影', behavior: 'coward', radius: 24, speed: 0.80, color: '#ff3399', hpMul: 0.9,
        points: [[50, 0], [62, 38], [100, 50], [62, 62], [50, 100], [38, 62], [0, 50], [38, 38]] },
      { name: '炮塔', behavior: 'hunter', radius: 30, speed: 0.50, color: '#ff4444', hpMul: 1.2,
        points: [[42, 0], [58, 0], [58, 42], [100, 42], [100, 58], [58, 58], [58, 100], [42, 100], [42, 58], [0, 58], [0, 42], [42, 42]] }
    ],
    leaderboard: [
      { name: 'Nova', kills: 42, deaths: 3, date: '2026-08-10' },
      { name: 'Echo', kills: 31, deaths: 5, date: '2026-08-12' },
      { name: 'Rook', kills: 27, deaths: 8, date: '2026-08-15' }
    ]
  };

  var STORAGE_KEY = 'lingjing_save_v1';

  // ---- 内部状态 ----------------------------------------------------------
  var state = null;

  function defaultState() {
    return {
      accounts: clone(SEED.accounts),
      leaderboard: clone(SEED.leaderboard),
      currentUser: null
    };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function loadState() {
    if (state) return state;
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        state = JSON.parse(raw);
        // 兼容补全
        if (!state.accounts) state.accounts = {};
        if (!state.leaderboard) state.leaderboard = [];
        if (!state.currentUser) state.currentUser = null;
        return state;
      } catch (e) { /* 损坏则重建 */ }
    }
    state = defaultState();
    persist();
    return state;
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 忽略 */ }
  }

  // ---- 尝试从 data/*.json 读取（仅 http 运行时有效）----------------------
  function tryLoadJson(name) {
    if (typeof fetch !== 'function') return null;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'data/' + name, false); // 同步，初始化阶段使用
      xhr.send();
      if (xhr.status === 200) return JSON.parse(xhr.responseText);
    } catch (e) { /* file:// 下会失败，忽略 */ }
    return null;
  }

  // 初始化：若 http 运行且有数据文件，则用其覆盖种子
  function initSeedFromFile() {
    var acc = tryLoadJson('accounts.json');
    var npc = tryLoadJson('npcs.json');
    var lb = tryLoadJson('leaderboard.json');
    if (acc && acc.accounts) SEED.accounts = acc.accounts;
    if (npc && npc.npcs) SEED.npcs = npc.npcs;
    if (lb && lb.leaderboard) SEED.leaderboard = lb.leaderboard;
  }

  // ---- 计算多边形有向面积（判断顶点走向：CCW>0 / CW<0）------------------
  function signedArea(points) {
    var a = 0;
    for (var i = 0; i < points.length; i++) {
      var p = points[i], q = points[(i + 1) % points.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a;
  }

  // ---- 计算多边形“真正内角”（含凹多边形的优角 >180°）---------------------
  // 旧实现取两射线较小夹角(0~180)，对凹顶点错误。
  // 正确做法：沿遍历方向取两条邻边向量 e_in=cur-prev、e_out=next-cur，
  //   有向外角 t = atan2(cross, dot)，内角 = 180 - t * orient
  //   orient = sign(有向面积)，用于区分凸/凹（优角）。
  // 对任意简单多边形，Σ内角 = (n-2)*180°（已 Node 验证）。
  function interiorAngle(prev, cur, next, orient) {
    if (orient === undefined || orient === 0) orient = 1; // 默认按 CCW 估算
    var inx = cur[0] - prev[0], iny = cur[1] - prev[1];     // e_in = cur - prev
    var outx = next[0] - cur[0], outy = next[1] - cur[1];   // e_out = next - cur
    var cross = inx * outy - iny * outx;
    var dot = inx * outx + iny * outy;
    var t = Math.atan2(cross, dot) * 180 / Math.PI;          // 有向外角 (-180,180]
    var ang = 180 - t * orient;
    if (ang <= 0) ang += 360;
    if (ang >= 360) ang -= 360;
    return ang;
  }

  // ---- 核心：由顶点(百分比坐标)计算战斗属性 ------------------------------
  // 攻击系数 = 1 - 角度/360 ; 防御系数 = 角度/360
  // 顶点用其内角；边视为 180 度角
  // 设计（lingjing.txt）：攻击/防御取“单个顶点”或“单条边”的值，不求和；
  //   顶点 i：atkRaw = ak-点(40) ; defRaw = df-点(10) ; attackCoef = 1-角度/360 ; defenseCoef = 角度/360
  //   边  e：atkRaw = ak-边(20) ; defRaw = df-边(5)  ; 边视为 180°，attackCoef = defenseCoef = 0.5
  // 对抗伤害（与设计公式完全一致）：hp -= MAX(1, ak*attackCoef - df*defenseCoef)
  //   其中 ak = 攻击方接触部位.atkRaw、attackCoef = 该部位.atkCoef；
  //        df = 防守方接触部位.defRaw、defenseCoef = 该部位.defCoef。
  // 另提供 avgAk / avgDf：所有“顶点+边”单个部位攻防的算术平均（HUD/徽章概览用）。
  function computeStats(points) {
    var n = points.length;
    if (!points || n < 3) return { ak: 0, df: 0, avgAk: 0, avgDf: 0, hp: CONST.hp, vertices: [], edges: [] };
    var sumAtk = 0, sumDef = 0, elemCount = 0;
    var vertices = [];
    var edges = [];
    var orient = signedArea(points) >= 0 ? 1 : -1;   // 顶点走向，用于正确计算凹(优)角
    for (var i = 0; i < n; i++) {
      var prev = points[(i - 1 + n) % n];
      var cur = points[i];
      var next = points[(i + 1) % n];
      var ang = interiorAngle(prev, cur, next, orient);
      var defCoef = ang / 360;
      var atkCoef = 1 - defCoef;
      vertices.push({
        angle: ang,
        atkRaw: CONST.akPoint, defRaw: CONST.dfPoint,
        atkCoef: atkCoef, defCoef: defCoef,
        atk: CONST.akPoint * atkCoef, def: CONST.dfPoint * defCoef
      });
      sumAtk += vertices[i].atk; sumDef += vertices[i].def; elemCount++;
    }
    // 边（视为 180 度，攻击/防御系数均为 0.5）
    var edgeAng = 180, edgeDefCoef = 0.5, edgeAtkCoef = 0.5;
    for (var e = 0; e < n; e++) {
      edges.push({
        angle: edgeAng,
        atkRaw: CONST.akEdge, defRaw: CONST.dfEdge,
        atkCoef: edgeAtkCoef, defCoef: edgeDefCoef,
        atk: CONST.akEdge * edgeAtkCoef, def: CONST.dfEdge * edgeDefCoef
      });
      sumAtk += edges[e].atk; sumDef += edges[e].def; elemCount++;
    }
    return {
      ak: Math.round(sumAtk),       // 整体求和（仅作概览，战斗不取此值）
      df: Math.round(sumDef),
      avgAk: +(sumAtk / elemCount).toFixed(2),   // 平均攻击（单点/单边均值）
      avgDf: +(sumDef / elemCount).toFixed(2),   // 平均防御
      hp: CONST.hp,
      vertices: vertices,
      edges: edges
    };
  }

  // ---- 找到离某点最近的多边形顶点下标（用于接触时的角度系数）------------
  function nearestVertexIndex(points, px, py) {
    var best = 0, bestD = Infinity;
    for (var i = 0; i < points.length; i++) {
      var dx = points[i][0] - px;
      var dy = points[i][1] - py;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // =======================================================================
  // 对外 API
  // =======================================================================
  var api = {
    CONST: CONST,
    DEFAULT_HERO: DEFAULT_HERO,
    SEED: SEED,

    init: function () { initSeedFromFile(); loadState(); },

    // ---- 账户 ----
    register: function (username, password) {
      loadState();
      username = (username || '').trim();
      if (!username || !password) return { ok: false, msg: '用户名与密码均不能为空' };
      if (username.length < 2) return { ok: false, msg: '用户名至少 2 个字符' };
      if (state.accounts[username]) return { ok: false, msg: '该用户名已被注册' };
      state.accounts[username] = {
        username: username,
        password: password,
        hero: DEFAULT_HERO.map(function (p) { return p.slice(); }),
        createdAt: todayStr(),
        lastLogin: null            // 最近登录时间（注册时无记录）
      };
      persist();
      return { ok: true };
    },

    login: function (username, password) {
      loadState();
      username = (username || '').trim();
      var acc = state.accounts[username];
      if (!acc) return { ok: false, msg: '用户不存在' };
      if (acc.password !== password) return { ok: false, msg: '密码错误' };
      state.currentUser = username;
      acc.lastLogin = nowStr();          // ★ 记录最近登录时间（yyyy-mm-dd hh:mm:ss）
      persist();
      return { ok: true };
    },

    logout: function () {
      loadState();
      state.currentUser = null;
      persist();
    },

    getCurrentUser: function () {
      loadState();
      var u = state.currentUser ? state.accounts[state.currentUser] : null;
      if (u && u.lastLogin === undefined) u.lastLogin = null;   // 兼容旧账户
      return u;
    },

    getHero: function () {
      var u = api.getCurrentUser();
      return u ? (u.hero || DEFAULT_HERO).map(function (p) { return p.slice(); }) : DEFAULT_HERO.map(function (p) { return p.slice(); });
    },

    saveHero: function (points) {
      loadState();
      if (!state.currentUser) return { ok: false, msg: '未登录' };
      state.accounts[state.currentUser].hero = points.map(function (p) { return [p[0], p[1]]; });
      persist();
      return { ok: true };
    },

    getUserStats: function () {
      return computeStats(api.getHero());
    },

    // ---- NPC ----
    getNpcs: function () {
      loadState();
      return clone(SEED.npcs);
    },

    // ---- 排行榜（区排行）----
    // 聚合为“每玩家一行”，按历史最高击杀降序；展示 历史最高击杀 / 平均击杀。
    getLeaderboard: function () {
      loadState();
      var map = {};
      state.leaderboard.forEach(function (r) {
        var m = map[r.name];
        if (!m) { m = map[r.name] = { name: r.name, best: 0, total: 0, games: 0 }; }
        m.games++;
        m.total += (r.kills || 0);
        if ((r.kills || 0) > m.best) m.best = r.kills;
      });
      return Object.keys(map).map(function (k) {
        var m = map[k];
        return { name: m.name, best: m.best, avg: m.games ? +(m.total / m.games).toFixed(1) : 0 };
      }).sort(function (a, b) { return b.best - a.best || b.avg - a.avg; });
    },

    // 当前登录玩家的聚合战绩（区排行中高亮用）
    getMyRecords: function () {
      loadState();
      var u = api.getCurrentUser();
      if (!u) return { name: '', best: 0, total: 0, deaths: 0, games: 0, last: 0 };
      var mine = state.leaderboard.filter(function (r) { return r.name === u.username; });
      var best = 0, total = 0, deaths = 0;
      mine.forEach(function (r) { if ((r.kills || 0) > best) best = r.kills; total += (r.kills || 0); deaths += (r.deaths || 0); });
      return { name: u.username, best: best, total: total, deaths: deaths, games: mine.length,
        last: mine.length ? (mine[mine.length - 1].kills || 0) : 0 };
    },

    addScore: function (name, kills, deaths) {
      loadState();
      state.leaderboard.push({ name: name, kills: kills || 0, deaths: deaths || 0, date: todayStr() });
      persist();
    },

    // ---- 工具 ----
    computeStats: computeStats,
    interiorAngle: interiorAngle,
    nearestVertexIndex: nearestVertexIndex,

    // 导出/导入（数据文件）
    exportAccounts: function () {
      loadState();
      return JSON.stringify({ accounts: state.accounts }, null, 2);
    },
    importAccounts: function (json) {
      var obj = JSON.parse(json);
      if (!obj || !obj.accounts) throw new Error('格式不正确');
      loadState();
      state.accounts = obj.accounts;
      persist();
    }
  };

  function todayStr() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // 精确到秒的时间戳（最近登录用）：yyyy-mm-dd hh:mm:ss
  function nowStr() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  window.LJ = window.LJ || {};
  window.LJ.data = api;
})();
