/*! 2048 数字游戏 — Web版 */
const G2048Module = {
  state: { board: [], score: 0, bestScore: 0, startX: 0, startY: 0, direction: null, pointerId: null },

  init() {
    this.state.bestScore = App.storage.get('g2048_best') || 0;
    this.reset();
    const el = document.getElementById('game2048-board');
    if (el) {
      // ★ 统一指针输入：PC 鼠标拖拽 + 移动端触摸滑动（Pointer Events 兼容两者）
      el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
      el.addEventListener('pointermove', (e) => this.onPointerMove(e));
      el.addEventListener('pointerup', (e) => this.onPointerUp(e));
      el.addEventListener('pointercancel', (e) => this.onPointerUp(e));
      // 防 PC 拖拽触发默认行为（选中文本/拖拽图片）
      el.addEventListener('dragstart', (e) => e.preventDefault());
    }
    document.addEventListener('keydown', (e) => {
      if (App.currentPage !== 'game2048') return;
      const dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      if (dirs[e.key]) { e.preventDefault(); this.handleMove(dirs[e.key]); }
    });
    const btnReset = document.getElementById('g2048-reset');
    if (btnReset) btnReset.addEventListener('click', () => this.reset());
  },

  reset() {
    this.state.board = Array(4).fill(null).map(() => Array(4).fill(0));
    this.state.score = 0;
    this.state.direction = null;
    this.state.pointerId = null;
    this.addRandomTile();
    this.addRandomTile();
    this.render();
  },

  render() {
    const el = document.getElementById('game2048-board');
    if (!el) return;
    const b = this.state.board;
    el.innerHTML = b.flat().map(v =>
      `<div class="game-2048-cell${v ? ' n' + v : ''}">${v || ''}</div>`
    ).join('');
    document.getElementById('g2048-score').textContent = this.state.score;
    document.getElementById('g2048-best').textContent = this.state.bestScore;
  },

  addRandomTile() {
    const b = this.state.board;
    const empty = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (b[r][c] === 0) empty.push({ r, c });
    if (empty.length > 0) {
      const cell = empty[Math.floor(Math.random() * empty.length)];
      b[cell.r][cell.c] = Math.random() < 0.9 ? 2 : 4;
    }
  },

  handleMove(dir) {
    const b = this.state.board.map(r => [...r]);
    const newScore = { v: this.state.score };

    // Always merge toward left
    const mergeLeft = (line) => {
      let arr = line.filter(v => v);
      for (let i = 0; i < arr.length - 1; i++) {
        if (arr[i] && arr[i] === arr[i + 1]) {
          arr[i] *= 2;
          newScore.v += arr[i];
          arr[i + 1] = 0;
          i++; // skip the merged cell
        }
      }
      arr = arr.filter(v => v);
      while (arr.length < 4) arr.push(0);
      return arr;
    };

    for (let i = 0; i < 4; i++) {
      switch (dir) {
        case 'left':
          b[i] = mergeLeft(b[i]);
          break;
        case 'right':
          b[i] = mergeLeft([...b[i]].reverse()).reverse();
          break;
        case 'up': {
          const col = [b[0][i], b[1][i], b[2][i], b[3][i]];
          const merged = mergeLeft(col);
          for (let j = 0; j < 4; j++) b[j][i] = merged[j];
          break;
        }
        case 'down': {
          const col = [b[3][i], b[2][i], b[1][i], b[0][i]];
          const merged = mergeLeft(col);
          for (let j = 0; j < 4; j++) b[3 - j][i] = merged[j];
          break;
        }
      }
    }

    const changed = JSON.stringify(b) !== JSON.stringify(this.state.board);
    if (changed) {
      this.state.board = b;
      this.state.score = newScore.v;
      this.addRandomTile();
      this.render();
      if (this.state.score > this.state.bestScore) {
        this.state.bestScore = this.state.score;
        App.storage.set('g2048_best', this.state.bestScore);
      }
      if (this.checkGameOver()) App.showToast('游戏结束！最高分: ' + this.state.bestScore, 3000);
    }
  },

  checkGameOver() {
    const b = this.state.board;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      if (b[r][c] === 0) return false;
      if (r > 0 && b[r][c] === b[r-1][c]) return false;
      if (c > 0 && b[r][c] === b[r][c-1]) return false;
    }
    return true;
  },

  /* ---------- 指针输入（PC 鼠标拖拽 + 移动端触摸滑动） ---------- */
  onPointerDown(e) {
    this.state.pointerId = e.pointerId;
    this.state.startX = e.clientX;
    this.state.startY = e.clientY;
    this.state.direction = null;
    // 捕获指针：拖出棋盘边界仍能跟踪
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    // 阻止 PC 拖拽选中文本等默认行为
    try { e.preventDefault(); } catch (err) { /* 忽略 */ }
  },
  onPointerMove(e) {
    if (e.pointerId !== this.state.pointerId) return;
    const dx = e.clientX - this.state.startX, dy = e.clientY - this.state.startY;
    if (Math.abs(dx) > Math.abs(dy)) this.state.direction = dx > 50 ? 'right' : dx < -50 ? 'left' : null;
    else this.state.direction = dy > 50 ? 'down' : dy < -50 ? 'up' : null;
  },
  onPointerUp(e) {
    if (e.pointerId !== this.state.pointerId) return;
    this.state.pointerId = null;
    if (this.state.direction) this.handleMove(this.state.direction);
    this.state.direction = null;
  },
};
