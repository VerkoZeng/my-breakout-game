/*! 围棋 — Web版 (Canvas渲染) */
const ChessGoModule = {
  BOARD_SIZE: 19, B: 1, W: 2,
  state: {
    board: [], currentTurn: 1, gameOver: false, statusText: '黑方执先',
    moveHistory: [], capturedBlack: 0, capturedWhite: 0, passCount: 0,
    lastMoveRow: -1, lastMoveCol: -1, lastMoveColor: 1,
    aiBlack: false, aiWhite: false, aiThinking: false, aiDifficulty: 0,
    showRules: false, showResult: false, finalScoreBlack: 0, finalScoreWhite: 0,
  },
  koBoardStr: null,

  init() {
    this.initGame();
    this.drawBoard();
    const canvas = document.getElementById('weiqi-canvas');
    if (!canvas) return;
    const adjust = () => {
      const w = Math.min(canvas.parentElement.clientWidth - 8, 500);
      canvas.width = w; canvas.height = w;
      canvas.style.width = w + 'px'; canvas.style.height = w + 'px';
      this.drawBoard();
    };
    adjust();
    window.addEventListener('resize', adjust);

    canvas.addEventListener('click', (e) => this.onClick(e));
    this.bindButtons();
  },

  bindButtons() {
    const map = {
      'weiqi-pass': 'onPass', 'weiqi-resign': 'onResign', 'weiqi-undo': 'onUndo', 'weiqi-restart': 'onRestart',
      'weiqi-ai-black': 'toggleAiBlack', 'weiqi-ai-white': 'toggleAiWhite',
      'weiqi-diff-down': () => this.changeDiff(-1), 'weiqi-diff-up': () => this.changeDiff(1),
    };
    for (const [id, action] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', typeof action === 'string' ? () => this[action]() : action);
    }
    const btnRules = document.getElementById('weiqi-rules-btn');
    if (btnRules) btnRules.addEventListener('click', () => this.toggleRules());
    const rulesClose = document.getElementById('weiqi-rules-close');
    if (rulesClose) rulesClose.addEventListener('click', () => this.toggleRules());
    const rulesOverlay = document.getElementById('weiqi-rules-overlay');
    if (rulesOverlay) rulesOverlay.addEventListener('click', () => this.toggleRules());
  },

  initGame() {
    this.state.board = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(0));
    this.koBoardStr = null;
    this.state.currentTurn = 1; this.state.gameOver = false; this.state.statusText = '黑方执先';
    this.state.moveHistory = []; this.state.capturedBlack = 0; this.state.capturedWhite = 0;
    this.state.passCount = 0; this.state.lastMoveRow = -1; this.state.lastMoveCol = -1;
    this.state.aiBlack = false; this.state.aiWhite = false;
    this.updateStatus();
    this.drawBoard();
  },

  getLayout() {
    const canvas = document.getElementById('weiqi-canvas');
    const cw = canvas.width;
    const grid = Math.floor(cw * 0.88 / (this.BOARD_SIZE - 1));
    const pad = Math.floor(grid * 1.15);
    const pieceSize = Math.floor(grid * 0.88);
    return { cw, grid, pad, pieceSize };
  },

  drawBoard() {
    const canvas = document.getElementById('weiqi-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { cw, grid, pad, pieceSize } = this.getLayout();
    ctx.clearRect(0, 0, cw, cw);
    ctx.fillStyle = '#e8c870';
    ctx.fillRect(0, 0, cw, cw);

    // 网格线
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < this.BOARD_SIZE; i++) {
      ctx.beginPath(); ctx.moveTo(pad, pad + i * grid); ctx.lineTo(pad + grid * (this.BOARD_SIZE - 1), pad + i * grid); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad + i * grid, pad); ctx.lineTo(pad + i * grid, pad + grid * (this.BOARD_SIZE - 1)); ctx.stroke();
    }

    // 星位
    const hoshi = [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];
    hoshi.forEach(([r, c]) => {
      ctx.beginPath();
      ctx.arc(pad + c * grid, pad + r * grid, grid * 0.15, 0, Math.PI * 2);
      ctx.fillStyle = '#333';
      ctx.fill();
    });

    // 棋子
    const board = this.state.board;
    for (let r = 0; r < this.BOARD_SIZE; r++) {
      for (let c = 0; c < this.BOARD_SIZE; c++) {
        if (board[r][c] === 0) continue;
        const cx = pad + c * grid, cy = pad + r * grid;
        ctx.beginPath();
        ctx.arc(cx, cy, pieceSize / 2, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(cx - pieceSize * 0.15, cy - pieceSize * 0.15, pieceSize * 0.05, cx, cy, pieceSize / 2);
        if (board[r][c] === 1) { gradient.addColorStop(0, '#555'); gradient.addColorStop(1, '#111'); }
        else { gradient.addColorStop(0, '#fff'); gradient.addColorStop(1, '#ccc'); }
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    // 最后落子标记
    if (this.state.lastMoveRow >= 0) {
      const cx = pad + this.state.lastMoveCol * grid, cy = pad + this.state.lastMoveRow * grid;
      ctx.beginPath();
      ctx.arc(cx, cy, pieceSize * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = this.state.lastMoveColor === 1 ? '#fff' : '#000';
      ctx.fill();
    }
  },

  onClick(e) {
    if (this.state.gameOver || this.state.aiThinking) return;
    const canvas = document.getElementById('weiqi-canvas');
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const x = (e.clientX - rect.left) * scale, y = (e.clientY - rect.top) * scale;
    const { grid, pad } = this.getLayout();
    const col = Math.round((x - pad) / grid), row = Math.round((y - pad) / grid);
    if (row < 0 || row >= this.BOARD_SIZE || col < 0 || col >= this.BOARD_SIZE) return;
    const dx = Math.abs(x - (pad + col * grid)), dy = Math.abs(y - (pad + row * grid));
    if (dx > grid * 0.4 || dy > grid * 0.4) return;
    this.tryPlace(row, col);
  },

  getNeighbors(row, col) {
    const n = [];
    if (row > 0) n.push({ row: row - 1, col });
    if (row < this.BOARD_SIZE - 1) n.push({ row: row + 1, col });
    if (col > 0) n.push({ row, col: col - 1 });
    if (col < this.BOARD_SIZE - 1) n.push({ row, col: col + 1 });
    return n;
  },

  getGroup(board, r, c) {
    if (board[r][c] === 0) return { stones: [], liberties: 0 };
    const color = board[r][c];
    const visited = new Set(), stones = [], liberties = new Set(), stack = [{ row: r, col: c }];
    visited.add(`${r},${c}`);
    while (stack.length > 0) {
      const { row, col } = stack.pop();
      stones.push({ row, col });
      for (const { row: nr, col: nc } of this.getNeighbors(row, col)) {
        const key = `${nr},${nc}`;
        if (board[nr][nc] === color && !visited.has(key)) { visited.add(key); stack.push({ row: nr, col: nc }); }
        else if (board[nr][nc] === 0) liberties.add(key);
      }
    }
    return { stones, liberties: liberties.size };
  },

  simulateMove(board, row, col, color) {
    const nb = board.map(r => [...r]);
    nb[row][col] = color;
    const opp = color === 1 ? 2 : 1;
    let captured = 0;
    for (const { row: nr, col: nc } of this.getNeighbors(row, col)) {
      if (nb[nr][nc] === opp) {
        const g = this.getGroup(nb, nr, nc);
        if (g.liberties === 0) { for (const s of g.stones) { nb[s.row][s.col] = 0; captured++; } }
      }
    }
    return { newBoard: nb, capturedCount: captured };
  },

  tryPlace(row, col) {
    const { board, currentTurn } = this.state;
    if (board[row][col] !== 0) return;
    const { newBoard, capturedCount } = this.simulateMove(board, row, col, currentTurn);
    const ownGroup = this.getGroup(newBoard, row, col);
    if (ownGroup.liberties === 0) { App.showToast('禁止自杀'); return; }
    if (capturedCount === 1 && this.koBoardStr !== null) {
      if (JSON.stringify(newBoard) === this.koBoardStr) { App.showToast('禁止打劫'); return; }
    }
    // Ko snapshot
    if (capturedCount === 1) this.koBoardStr = JSON.stringify(board);
    else this.koBoardStr = null;

    const historyItem = {
      board: board.map(r => [...r]), koBoardStr: this.koBoardStr,
      capturedBlack: this.state.capturedBlack, capturedWhite: this.state.capturedWhite,
      passCount: this.state.passCount, lastMoveRow: this.state.lastMoveRow,
      lastMoveCol: this.state.lastMoveCol, lastMoveColor: this.state.lastMoveColor,
    };

    let cb = this.state.capturedBlack, cw = this.state.capturedWhite;
    if (currentTurn === 1) cw += capturedCount; else cb += capturedCount;

    const newTurn = currentTurn === 1 ? 2 : 1;
    this.state.board = newBoard;
    this.state.currentTurn = newTurn;
    this.state.capturedBlack = cb;
    this.state.capturedWhite = cw;
    this.state.lastMoveRow = row;
    this.state.lastMoveCol = col;
    this.state.lastMoveColor = currentTurn;
    this.state.passCount = 0;
    this.state.moveHistory.push(historyItem);
    this.state.statusText = `${newTurn === 1 ? '黑' : '白'}方落子`;
    this.updateStatus();
    this.drawBoard();
    if (!this.state.gameOver) this.scheduleAiMove();
  },

  onPass() {
    if (this.state.gameOver) return;
    const { board, passCount, capturedBlack, capturedWhite } = this.state;
    const historyItem = {
      board: board.map(r => [...r]), koBoardStr: this.koBoardStr,
      capturedBlack, capturedWhite, passCount,
      lastMoveRow: this.state.lastMoveRow, lastMoveCol: this.state.lastMoveCol,
      lastMoveColor: this.state.lastMoveColor, isPass: true,
    };
    const newPass = passCount + 1;
    if (newPass >= 2) { this.endGame(); return; }
    this.koBoardStr = null;
    const newTurn = this.state.currentTurn === 1 ? 2 : 1;
    this.state.currentTurn = newTurn;
    this.state.passCount = newPass;
    this.state.moveHistory.push(historyItem);
    this.state.statusText = `${newTurn === 1 ? '黑' : '白'}方落子`;
    this.updateStatus();
    this.drawBoard();
    this.scheduleAiMove();
  },

  onResign() {
    if (this.state.gameOver) return;
    const winner = this.state.currentTurn === 1 ? '白方' : '黑方';
    this.state.gameOver = true;
    this.state.statusText = `${winner}胜（认输）`;
    this.updateStatus();
  },

  onUndo() {
    if (this.state.moveHistory.length === 0) return;
    const last = this.state.moveHistory.pop();
    this.koBoardStr = last.koBoardStr;
    const newTurn = this.state.currentTurn === 1 ? 2 : 1;
    this.state.board = last.board;
    this.state.currentTurn = newTurn;
    this.state.capturedBlack = last.capturedBlack;
    this.state.capturedWhite = last.capturedWhite;
    this.state.passCount = last.passCount;
    this.state.lastMoveRow = last.lastMoveRow;
    this.state.lastMoveCol = last.lastMoveCol;
    this.state.lastMoveColor = last.lastMoveColor;
    this.state.gameOver = false;
    this.state.statusText = `${newTurn === 1 ? '黑' : '白'}方落子`;
    this.updateStatus();
    this.drawBoard();
  },

  onRestart() { this.initGame(); },

  endGame() {
    const { board, capturedBlack, capturedWhite } = this.state;
    let tb = 0, tw = 0;
    const visited = new Set();
    // Flood fill for territory
    for (let r = 0; r < this.BOARD_SIZE; r++) {
      for (let c = 0; c < this.BOARD_SIZE; c++) {
        if (board[r][c] === 0 && !visited.has(`${r},${c}`)) {
          const region = [], borders = new Set(), queue = [{ row: r, col: c }];
          visited.add(`${r},${c}`);
          while (queue.length > 0) {
            const { row, col } = queue.shift();
            region.push({ row, col });
            for (const { row: nr, col: nc } of this.getNeighbors(row, col)) {
              const k = `${nr},${nc}`;
              if (board[nr][nc] === 0 && !visited.has(k)) { visited.add(k); queue.push({ row: nr, col: nc }); }
              else if (board[nr][nc] !== 0) borders.add(board[nr][nc]);
            }
          }
          if (borders.size === 1) { const c = [...borders][0]; if (c === 1) tb += region.length; else tw += region.length; }
        }
        if (board[r][c] === 1) tb++;
        else if (board[r][c] === 2) tw++;
      }
    }
    const komi = 7.5;
    const sb = tb, sw = tw + komi;
    let winner, result;
    if (sb > sw) { winner = '黑方'; result = `黑方胜 ${sb} : ${sw.toFixed(1)}`; }
    else { winner = '白方'; result = `白方胜 ${sw.toFixed(1)} : ${sb}`; }
    this.state.gameOver = true;
    this.state.statusText = result;
    this.state.finalScoreBlack = sb;
    this.state.finalScoreWhite = sw;
    this.state.showResult = true;
    this.updateStatus();
  },

  updateStatus() {
    const el = document.getElementById('weiqi-status');
    if (el) { el.textContent = this.state.statusText; el.className = 'game-status' + (this.state.aiThinking ? ' thinking' : ''); }
    document.querySelectorAll('#weiqi-captured-black, .weiqi-captured-black').forEach(e => e.textContent = `提子: ${this.state.capturedBlack}`);
    document.querySelectorAll('#weiqi-captured-white, .weiqi-captured-white').forEach(e => e.textContent = `提子: ${this.state.capturedWhite}`);
    const btnAb = document.getElementById('weiqi-ai-black');
    if (btnAb) btnAb.textContent = '黑方电脑' + (this.state.aiBlack ? ' ✓' : '');
    const btnAw = document.getElementById('weiqi-ai-white');
    if (btnAw) btnAw.textContent = '白方电脑' + (this.state.aiWhite ? ' ✓' : '');
    const diff = document.getElementById('weiqi-diff-display');
    if (diff) diff.textContent = ['简单','中等','困难'][this.state.aiDifficulty];
  },

  toggleAiBlack() { this.state.aiBlack = !this.state.aiBlack; this.updateStatus(); if (this.state.aiBlack && this.state.currentTurn === 1) this.scheduleAiMove(); },
  toggleAiWhite() { this.state.aiWhite = !this.state.aiWhite; this.updateStatus(); if (this.state.aiWhite && this.state.currentTurn === 2) this.scheduleAiMove(); },
  changeDiff(d) { this.state.aiDifficulty = Math.max(0, Math.min(2, this.state.aiDifficulty + d)); this.updateStatus(); },
  toggleRules() { this.state.showRules = !this.state.showRules; const p = document.getElementById('weiqi-rules-panel'); if (p) p.classList.toggle('show', this.state.showRules); },

  scheduleAiMove() {
    if (this._aiTimer) clearTimeout(this._aiTimer);
    this._aiTimer = setTimeout(() => this.triggerAiMove(), 100);
  },

  triggerAiMove() {
    if (this.state.gameOver || this.state.aiThinking) return;
    const { currentTurn, aiBlack, aiWhite } = this.state;
    if (!((currentTurn === 1 && aiBlack) || (currentTurn === 2 && aiWhite))) return;
    this.state.aiThinking = true;
    this.state.statusText = `${currentTurn === 1 ? '黑' : '白'}方思考中...`;
    this.updateStatus();
    setTimeout(() => {
      // Simple heuristic: find best move by evaluating adjacent positions
      let bestRow = -1, bestCol = -1, bestScore = -Infinity;
      const { board, currentTurn: ct } = this.state;
      const opp = ct === 1 ? 2 : 1;
      for (let r = 0; r < this.BOARD_SIZE; r++) {
        for (let c = 0; c < this.BOARD_SIZE; c++) {
          if (board[r][c] !== 0) continue;
          const { newBoard, capturedCount } = this.simulateMove(board, r, c, ct);
          const g = this.getGroup(newBoard, r, c);
          if (g.liberties === 0) continue;
          if (capturedCount === 1 && this.koBoardStr !== null && JSON.stringify(newBoard) === this.koBoardStr) continue;
          let score = capturedCount * 100 + g.liberties * 10;
          // Prefer center
          score -= Math.abs(r - 9) + Math.abs(c - 9);
          if (score > bestScore) { bestScore = score; bestRow = r; bestCol = c; }
        }
      }
      if (bestRow >= 0) { this.tryPlace(bestRow, bestCol); }
      else { this.onPass(); }
      this.state.aiThinking = false;
      if (!this.state.gameOver) this.updateStatus();
    }, 100);
  },
};
