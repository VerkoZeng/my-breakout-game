/* ============================================================================
 * lingjing / app.js
 * 全局路由：登录 / 菜单 / 编辑 / 游戏 / 排行榜 四个屏的切换与导航
 * 全局命名空间：window.LJ.app
 * ==========================================================================*/
(function () {
  'use strict';

  var screens = {};

  function show(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle('hidden', k !== name);
    });
  }
  function get(name) { return document.getElementById('screen-' + name); }

  function renderLeaderboard() {
    var box = document.getElementById('lb-list');
    if (!box) return;
    var u = LJ.data.getCurrentUser();
    if (!u) { box.innerHTML = '<p class="empty">请先登录后查看战绩</p>'; return; }
    // 区排行：本区全部玩家按历史最高击杀聚合排序（展示 历史最高击杀 / 平均击杀）
    var lb = LJ.data.getLeaderboard();
    if (!lb.length) { box.innerHTML = '<p class="empty">本区暂无战绩</p>'; return; }
    var rows = lb.map(function (r, i) {
      var me = (r.name === u.username) ? ' me' : '';
      return '<div class="lb-row' + me + '">' +
        '<span class="lb-rank">' + (i + 1) + '</span>' +
        '<span class="lb-name">' + escapeHtml(r.name) + '</span>' +
        '<span class="lb-kills">' + r.best + '</span>' +
        '<span class="lb-avg">' + r.avg + '</span></div>';
    }).join('');
    box.innerHTML =
      '<div class="lb-head"><span>排名</span><span>玩家</span><span>历史最高击杀</span><span>平均击杀</span></div>' +
      rows +
      '<p class="empty">本区全部玩家的历史最高击杀与平均击杀排行；“我”以红色高亮。</p>';
  }

  function refreshHeroBadge() {
    var u = LJ.data.getCurrentUser();
    var badge = document.getElementById('hero-badge');
    if (!badge || !u) return;
    var s = LJ.data.computeStats(u.hero);
    badge.innerHTML = '当前灵境英雄：平均攻击 ' + s.avgAk + ' · 平均防御 ' + s.avgDf + ' · 生命 ' + s.hp + ' · 顶点 ' + u.hero.length +
      '<div class="badge-sub">最近登录：' + (u.lastLogin ? escapeHtml(u.lastLogin) : '首次登录') + '</div>';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var api = {
    _bound: false,

    // 由 G-Tool 路由进入灵境页时调用：首次进入绑定事件，每次进入刷新初始屏
    init: function () {
      if (!api._bound) api._bind();
      // 初始屏
      if (LJ.data.getCurrentUser()) { api.refreshHeroBadge(); show('menu'); }
      else { LJ.auth.render(); show('auth'); }
    },

    // 由 G-Tool 路由离开灵境页时调用：停止游戏
    // 手势守卫全站启用，此处不需停用
    leave: function () {
      if (LJ.game && LJ.game.isRunning()) LJ.game.stop();
    },

    _bind: function () {
      api._bound = true;
      ['auth', 'menu', 'editor', 'game', 'leaderboard'].forEach(function (n) { screens[n] = get(n); });
      LJ.data.init();

      // 导航绑定
      document.getElementById('btn-start').addEventListener('click', function () {
        show('game'); api.refreshHeroBadge();
        if (!LJ.game.isRunning()) LJ.game.start();
      });
      document.getElementById('btn-edit').addEventListener('click', function () {
        LJ.editor.render(); show('editor');
      });
      document.getElementById('btn-lb').addEventListener('click', function () {
        renderLeaderboard(); show('leaderboard');
      });
      document.getElementById('btn-logout').addEventListener('click', function () {
        LJ.data.logout(); LJ.auth.render(); show('auth');
      });
      document.getElementById('btn-lb-back').addEventListener('click', function () { show('menu'); });

      // 游戏内控制
      document.getElementById('btn-game-back').addEventListener('click', function () {
        LJ.game.stop(); show('menu');
      });
      document.getElementById('btn-dash').addEventListener('click', function () {
        // 复用游戏内的冲刺（通过派发空格键）
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      });
    },

    onLogin: function () {
      api.refreshHeroBadge(); show('menu');
    },
    onEditorBack: function () {
      if (LJ.game.isRunning()) { show('game'); }
      else { api.refreshHeroBadge(); show('menu'); }
    },
    onGameOver: function (kills) {
      var ov = document.getElementById('gameover');
      document.getElementById('go-kills').textContent = kills;
      ov.classList.remove('hidden');
      document.getElementById('btn-go-again').onclick = function () { ov.classList.add('hidden'); LJ.game.start(); };
      document.getElementById('btn-go-menu').onclick = function () { ov.classList.add('hidden'); show('menu'); };
    },
    refreshHeroBadge: refreshHeroBadge,
    show: show
  };

  window.LJ = window.LJ || {};
  window.LJ.app = api;
})();
