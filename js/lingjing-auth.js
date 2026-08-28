/* ============================================================================
 * lingjing / auth.js
 * 登录 / 注册界面（数据存入 localStorage 数据文件，可导出 JSON）
 * 全局命名空间：window.LJ.auth
 * ==========================================================================*/
(function () {
  'use strict';

  var container = null;

  function el(id) { return document.getElementById(id); }

  function render() {
    container = el('screen-auth');
    if (!container) return;
    container.innerHTML = '' +
      '<div class="panel">' +
        '<div class="panel-bar"><span>灵境 · 登录 / 注册</span>' +
          '<span class="hint">数据存于本地数据文件 (localStorage)</span></div>' +
        '<div class="tabs">' +
          '<button class="tab active" data-tab="login">登录</button>' +
          '<button class="tab" data-tab="register">注册</button>' +
        '</div>' +
        '<div class="form" id="auth-form"></div>' +
        '<div class="auth-actions">' +
          '<button class="toolbar-btn" id="exportAccBtn">导出账户数据(JSON)</button>' +
        '</div>' +
        '<p class="auth-tip">演示账户：demo / demo123</p>' +
      '</div>';

    var tab = 'login';
    function showForm() {
      var form = el('auth-form');
      if (tab === 'login') {
        form.innerHTML = '' +
          '<label>用户名<input type="text" id="au-user" autocomplete="username" placeholder="demo"></label>' +
          '<label>密码<input type="password" id="au-pass" autocomplete="current-password" placeholder="demo123"></label>' +
          '<button class="big-btn" id="au-submit">登 录</button>' +
          '<p class="msg" id="au-msg"></p>';
      } else {
        form.innerHTML = '' +
          '<label>用户名<input type="text" id="au-user" autocomplete="username" placeholder="至少 2 个字符"></label>' +
          '<label>密码<input type="password" id="au-pass" autocomplete="new-password" placeholder="任意密码"></label>' +
          '<button class="big-btn" id="au-submit">注 册</button>' +
          '<p class="msg" id="au-msg"></p>';
      }
      el('au-submit').addEventListener('click', submit);
    }

    function submit() {
      var user = el('au-user').value;
      var pass = el('au-pass').value;
      var msg = el('au-msg');
      var res = (tab === 'login')
        ? LJ.data.login(user, pass)
        : LJ.data.register(user, pass);
      if (!res.ok) { msg.textContent = res.msg; msg.className = 'msg err'; return; }
      msg.textContent = (tab === 'login' ? '登录成功' : '注册成功，已自动登录');
      msg.className = 'msg ok';
      if (LJ.app) LJ.app.onLogin();
    }

    container.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () {
        container.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        tab = b.dataset.tab;
        showForm();
      });
    });

    el('exportAccBtn').addEventListener('click', function () {
      var json = LJ.data.exportAccounts();
      download('accounts.json', json, 'application/json');
    });

    showForm();
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  window.LJ = window.LJ || {};
  window.LJ.auth = { render: render };
})();
