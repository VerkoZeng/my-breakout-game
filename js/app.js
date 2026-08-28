/*!
 * G-Tool Web App — 核心框架
 * 路由、导航、工具函数、Toast/Modal
 */
const App = {
  currentPage: 'home',
  pages: {},

  init() {
    this.initNavbar();
    this.initTabs();
    this.navigateTo('home');
  },

  /* ---------- 导航 ---------- */
  initNavbar() {
    const backBtn = document.getElementById('navbar-back');
    if (backBtn) backBtn.addEventListener('click', () => this.navigateTo('home'));

    const rulesBtn = document.getElementById('navbar-rules');
    if (rulesBtn) {
      rulesBtn.addEventListener('click', () => {
        const page = this.currentPage;
        if (page === 'chess') ChessChineseModule.toggleRules();
        else if (page === 'weiqi') ChessGoModule.toggleRules();
        else if (page === 'intlchess') ChessIntlModule.toggleRules();
      });
    }
  },

  initTabs() {
    document.querySelectorAll('.tab-item').forEach(tab => {
      tab.addEventListener('click', () => {
        const page = tab.dataset.page;
        this.navigateTo(page);
      });
    });
  },

  navigateTo(pageName) {
    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    // 显示目标页面
    const target = document.getElementById('page-' + pageName);
    if (target) target.classList.add('active');

    // 更新Tab激活状态
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    const tab = document.querySelector(`.tab-item[data-page="${pageName}"]`);
    if (tab) tab.classList.add('active');

    // 更新导航栏标题
    const titles = {
      home: '枼沄',
      game2048: '枼沄 2048',
      chess: '枼沄 象棋',
      weiqi: '枼沄 围棋',
      intlchess: '枼沄 国际象棋',
      lingjing: '枼沄 灵境',
      about: '枼沄 待定'
    };
    const titleEl = document.getElementById('navbar-title');
    if (titleEl) titleEl.textContent = titles[pageName] || '枼沄';

    // 返回按钮
    const backBtn = document.getElementById('navbar-back');
    if (backBtn) backBtn.style.display = pageName === 'home' ? 'none' : 'inline-flex';

    // 规则按钮（仅棋盘游戏页显示）
    const rulesBtn = document.getElementById('navbar-rules');
    if (rulesBtn) {
      const gamePages = ['chess', 'weiqi', 'intlchess'];
      rulesBtn.classList.toggle('show', gamePages.includes(pageName));
    }

    // 灵境模块生命周期：进入时初始化并显示初始屏、离开时停止游戏并释放手势守卫
    // 注意：需在 this.currentPage 被覆盖前判断"是否正离开灵境页"
    if (pageName === 'lingjing') {
      if (window.LJ && LJ.app) LJ.app.init();
    } else if (this.currentPage === 'lingjing' && window.LJ && LJ.app) {
      LJ.app.leave();
    }

    this.currentPage = pageName;
    window.scrollTo(0, 0);

    // 灵境页隐藏底部 Tab 栏与版本标记，保证游戏全屏显示
    const tabBar = document.querySelector('.tab-bar');
    const versionMark = document.querySelector('.version-mark');
    if (tabBar) tabBar.style.display = (pageName === 'lingjing') ? 'none' : '';
    if (versionMark) versionMark.style.display = (pageName === 'lingjing') ? 'none' : '';

    // 初始化页面
    if (pageName === 'game2048' && !this._g2048Init) { this._g2048Init = true; G2048Module.init(); }
    if (pageName === 'chess' && !this._chessInit) { this._chessInit = true; ChessChineseModule.init(); }
    if (pageName === 'weiqi' && !this._weiqiInit) { this._weiqiInit = true; ChessGoModule.init(); }
    if (pageName === 'intlchess' && !this._intlchessInit) { this._intlchessInit = true; ChessIntlModule.init(); }
  },

  /* ---------- Toast ---------- */
  showToast(msg, duration = 2000) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
  },

  /* ---------- Modal ---------- */
  showModal(title, content, editable = false, placeholder = '') {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay show';
      let inputHtml = '';
      if (editable) inputHtml = `<input type="text" id="modal-input" placeholder="${placeholder}" value="${content}" />`;
      else if (content) inputHtml = `<p>${content}</p>`;
      overlay.innerHTML = `<div class="modal-box"><h3>${title}</h3>${inputHtml}<div class="modal-actions"><button class="btn" id="modal-cancel">取消</button><button class="btn btn-primary" id="modal-confirm">确定</button></div></div>`;
      document.body.appendChild(overlay);

      const close = (result) => {
        overlay.remove();
        resolve(result);
      };

      overlay.querySelector('#modal-cancel').addEventListener('click', () => close(null));
      overlay.querySelector('#modal-confirm').addEventListener('click', () => {
        if (editable) {
          const input = overlay.querySelector('#modal-input');
          close({ confirm: true, content: input ? input.value : content });
        } else {
          close({ confirm: true });
        }
      });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    });
  },

  showActionSheet(items) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay show';
      const itemBtns = items.map((item, i) =>
        `<button class="btn" style="display:block;width:100%;margin-bottom:8px;" data-idx="${i}">${item}</button>`
      ).join('');
      overlay.innerHTML = `<div class="modal-box"><h3>请选择</h3>${itemBtns}<button class="btn" id="as-cancel">取消</button></div>`;
      document.body.appendChild(overlay);

      overlay.querySelectorAll('[data-idx]').forEach(btn => {
        btn.addEventListener('click', () => { overlay.remove(); resolve({ tapIndex: parseInt(btn.dataset.idx) }); });
      });
      overlay.querySelector('#as-cancel').addEventListener('click', () => { overlay.remove(); resolve({ tapIndex: -1 }); });
    });
  },

  /* ---------- Storage ---------- */
  storage: {
    get(key) {
      try { const v = localStorage.getItem('gtool_' + key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem('gtool_' + key, JSON.stringify(value)); } catch (e) { console.error('Storage set error:', e); }
    },
    remove(key) { localStorage.removeItem('gtool_' + key); }
  },

  /* ---------- 工具 ---------- */
  formatTime(ts) {
    const d = new Date(ts);
    const pad = n => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  formatRecordingDuration(sec) {
    const totalSec = Math.floor(sec);
    const tenth = Math.floor((sec - totalSec) * 10);
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${m}:${s}.${tenth}`;
  },

  generateId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 8);
  },

  /* ---------- 文件选择（替代wx.chooseMessageFile） ---------- */
  chooseFile(accept, callback) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    input.onchange = (e) => {
      const files = [];
      for (const f of e.target.files) files.push(f);
      callback(files);
    };
    input.click();
  },

  chooseImage(callback) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async (e) => {
      const results = [];
      for (const f of e.target.files) {
        const dataUrl = await this.readFileAsDataURL(f);
        results.push({ name: f.name, dataUrl });
      }
      callback(results);
    };
    input.click();
  },

  chooseVideo(callback) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = async (e) => {
      const f = e.target.files[0];
      if (f) {
        const dataUrl = await this.readFileAsDataURL(f);
        callback({ name: f.name, dataUrl });
      }
    };
    input.click();
  },

  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }
};

// 启动
document.addEventListener('DOMContentLoaded', () => App.init());
