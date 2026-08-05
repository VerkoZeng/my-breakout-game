/*! 中国象棋 — Web版 (Canvas渲染) */
const ChessChineseModule = {
  state: {
    board: [], currentTurn: 'red', gameOver: false, statusText: '红方走棋',
    selectedPiece: null, validMoves: [], moveHistory: [],
    aiRed: false, aiBlack: false, aiThinking: false, aiDifficulty: 0,
    showRules: false, boardLeft: 0, boardTop: 0,
  },
  boardLeft: 0, boardTop: 0,
  PIECE_NAMES: { red: { K:'帅',A:'仕',B:'相',N:'马',R:'车',C:'炮',P:'兵' }, black: { K:'将',A:'士',B:'象',N:'马',R:'车',C:'炮',P:'卒' } },

  init() {
    this.initGame();
    this.drawBoard();
    this.bindEvents();
  },

  bindEvents() {
    const canvas = document.getElementById('chess-canvas');
    if (!canvas) return;
    const adjustSize = () => {
      const w = Math.min(canvas.parentElement.clientWidth - 8, 500);
      canvas.width = w;
      canvas.height = w * 1.15;
      canvas.style.width = w + 'px';
      canvas.style.height = (w * 1.15) + 'px';
      this.drawBoard();
    };
    adjustSize();
    window.addEventListener('resize', adjustSize);

    canvas.addEventListener('click', (e) => this.onCanvasClick(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // 按钮
    const btnUndo = document.getElementById('chess-undo');
    if (btnUndo) btnUndo.addEventListener('click', () => this.onUndo());
    const btnRestart = document.getElementById('chess-restart');
    if (btnRestart) btnRestart.addEventListener('click', () => this.onRestart());
    const btnRules = document.getElementById('chess-rules-btn');
    if (btnRules) btnRules.addEventListener('click', () => this.toggleRules());
    const rulesClose = document.getElementById('chess-rules-close');
    if (rulesClose) rulesClose.addEventListener('click', () => this.toggleRules());
    const rulesOverlay = document.getElementById('chess-rules-overlay');
    if (rulesOverlay) rulesOverlay.addEventListener('click', () => this.toggleRules());

    // AI
    const btnAiRed = document.getElementById('chess-ai-red');
    if (btnAiRed) btnAiRed.addEventListener('click', () => this.toggleAiRed());
    const btnAiBlack = document.getElementById('chess-ai-black');
    if (btnAiBlack) btnAiBlack.addEventListener('click', () => this.toggleAiBlack());
    const btnDiffDown = document.getElementById('chess-diff-down');
    if (btnDiffDown) btnDiffDown.addEventListener('click', () => this.changeDifficulty(-1));
    const btnDiffUp = document.getElementById('chess-diff-up');
    if (btnDiffUp) btnDiffUp.addEventListener('click', () => this.changeDifficulty(1));
  },

  initGame() {
    const b = Array(10).fill(null).map(() => Array(9).fill(null));
    // 黑方 (row 0-3)
    b[0][0]={type:'R',color:'black'};b[0][1]={type:'N',color:'black'};b[0][2]={type:'B',color:'black'};b[0][3]={type:'A',color:'black'};b[0][4]={type:'K',color:'black'};b[0][5]={type:'A',color:'black'};b[0][6]={type:'B',color:'black'};b[0][7]={type:'N',color:'black'};b[0][8]={type:'R',color:'black'};
    b[2][1]={type:'C',color:'black'};b[2][7]={type:'C',color:'black'};
    b[3][0]={type:'P',color:'black'};b[3][2]={type:'P',color:'black'};b[3][4]={type:'P',color:'black'};b[3][6]={type:'P',color:'black'};b[3][8]={type:'P',color:'black'};
    // 红方 (row 6-9)
    b[9][0]={type:'R',color:'red'};b[9][1]={type:'N',color:'red'};b[9][2]={type:'B',color:'red'};b[9][3]={type:'A',color:'red'};b[9][4]={type:'K',color:'red'};b[9][5]={type:'A',color:'red'};b[9][6]={type:'B',color:'red'};b[9][7]={type:'N',color:'red'};b[9][8]={type:'R',color:'red'};
    b[7][1]={type:'C',color:'red'};b[7][7]={type:'C',color:'red'};
    b[6][0]={type:'P',color:'red'};b[6][2]={type:'P',color:'red'};b[6][4]={type:'P',color:'red'};b[6][6]={type:'P',color:'red'};b[6][8]={type:'P',color:'red'};

    this.state.board = b;
    this.state.currentTurn = 'red';
    this.state.gameOver = false;
    this.state.statusText = '红方走棋';
    this.state.selectedPiece = null;
    this.state.validMoves = [];
    this.state.moveHistory = [];
    this.updateStatus();
    this.drawBoard();
  },

  getLayout() {
    const canvas = document.getElementById('chess-canvas');
    const cw = canvas.width, ch = canvas.height;
    const grid = Math.floor(cw * 0.92 / 9);
    const pad = Math.floor(grid * 0.55);
    return { cw, ch, grid, pad, pieceSize: Math.floor(grid * 0.88) };
  },

  drawBoard() {
    const canvas = document.getElementById('chess-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { cw, ch, grid, pad, pieceSize } = this.getLayout();
    ctx.clearRect(0, 0, cw, ch);

    // 背景
    ctx.fillStyle = '#f0d9a0';
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = '#e8c870';
    ctx.fillRect(pad, pad, grid * 8, grid * 9);

    // 网格线
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let r = 0; r < 10; r++) { ctx.beginPath(); ctx.moveTo(pad, pad + r * grid); ctx.lineTo(pad + grid * 8, pad + r * grid); ctx.stroke(); }
    // 垂直线 - 边线
    for (let c of [0, 8]) { ctx.beginPath(); ctx.moveTo(pad + c * grid, pad); ctx.lineTo(pad + c * grid, pad + grid * 9); ctx.stroke(); }
    // 垂直线 - 内线（上半）
    for (let c = 1; c <= 7; c++) { ctx.beginPath(); ctx.moveTo(pad + c * grid, pad); ctx.lineTo(pad + c * grid, pad + grid * 4); ctx.stroke(); }
    // 垂直线 - 内线（下半）
    for (let c = 1; c <= 7; c++) { ctx.beginPath(); ctx.moveTo(pad + c * grid, pad + grid * 5); ctx.lineTo(pad + c * grid, pad + grid * 9); ctx.stroke(); }

    // 九宫对角线
    ctx.strokeStyle = '#333';
    [[3,0,5,2],[5,0,3,2],[3,7,5,9],[5,7,3,9]].forEach(([c1,r1,c2,r2]) => {
      ctx.beginPath(); ctx.moveTo(pad + c1 * grid, pad + r1 * grid); ctx.lineTo(pad + c2 * grid, pad + r2 * grid); ctx.stroke();
    });

    // 楚河汉界
    ctx.fillStyle = '#333';
    ctx.font = `${Math.floor(grid * 0.6)}px serif`;
    ctx.textAlign = 'center';
    ctx.fillText('楚  河', pad + grid * 2.25, pad + grid * 4.65);
    ctx.fillText('汉  界', pad + grid * 5.75, pad + grid * 4.65);

    // 合法走法提示
    const moves = this.state.validMoves;
    if (moves.length > 0) {
      ctx.fillStyle = 'rgba(7,193,96,0.5)';
      moves.forEach(m => {
        ctx.beginPath();
        ctx.arc(pad + m.col * grid, pad + m.row * grid, grid * 0.2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 棋子
    const board = this.state.board;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = board[r][c];
        if (!p) continue;
        const cx = pad + c * grid, cy = pad + r * grid;
        const isSel = this.state.selectedPiece && this.state.selectedPiece.row === r && this.state.selectedPiece.col === c;

        // 棋子圆形
        ctx.beginPath();
        ctx.arc(cx, cy, pieceSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = isSel ? '#d4f5e0' : '#fef8e7';
        ctx.fill();
        ctx.strokeStyle = p.color === 'red' ? '#d4380d' : '#333';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 文字
        ctx.fillStyle = p.color === 'red' ? '#d4380d' : '#333';
        ctx.font = `bold ${Math.floor(pieceSize * 0.5)}px "PingFang SC","Microsoft YaHei",sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.PIECE_NAMES[p.color][p.type], cx, cy);
      }
    }

    // 选中高亮
    if (this.state.selectedPiece) {
      const { row, col } = this.state.selectedPiece;
      ctx.beginPath();
      ctx.arc(pad + col * grid, pad + row * grid, pieceSize / 2 + 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#07c160';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  },

  onCanvasClick(e) {
    if (this.state.gameOver || this.state.aiThinking) return;
    const canvas = document.getElementById('chess-canvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX, y = (e.clientY - rect.top) * scaleY;
    const { grid, pad } = this.getLayout();

    const col = Math.round((x - pad) / grid);
    const row = Math.round((y - pad) / grid);

    if (row < 0 || row > 9 || col < 0 || col > 8) {
      this.state.selectedPiece = null;
      this.state.validMoves = [];
      this.drawBoard();
      return;
    }

    const b = this.state.board;
    const board = b, currentTurn = this.state.currentTurn;

    if (this.state.selectedPiece) {
      const isValid = this.state.validMoves.some(m => m.row === row && m.col === col);
      if (isValid) {
        this.doMove(this.state.selectedPiece.row, this.state.selectedPiece.col, row, col);
        return;
      }
      const target = board[row][col];
      if (target && target.color === currentTurn) {
        const moves = this.getValidMoves(row, col);
        this.state.selectedPiece = { row, col };
        this.state.validMoves = moves;
        this.drawBoard();
        return;
      }
      this.state.selectedPiece = null;
      this.state.validMoves = [];
      this.drawBoard();
      return;
    }

    const piece = board[row][col];
    if (piece && piece.color === currentTurn) {
      const moves = this.getValidMoves(row, col);
      this.state.selectedPiece = { row, col };
      this.state.validMoves = moves;
    }
    this.drawBoard();
  },

  // ===== 走法生成 =====
  getValidMoves(row, col) {
    const { board } = this.state;
    const piece = board[row][col];
    if (!piece) return [];
    const raw = this.getRawMoves(board, row, col, piece);
    return raw.filter(m => this.isMoveSafe(board, row, col, m.row, m.col, piece.color)).map(m => ({ row: m.row, col: m.col }));
  },

  getRawMoves(board, row, col, piece) {
    const moves = [];
    const { type, color } = piece;
    switch (type) {
      case 'K': this.genKing(board, row, col, color, moves); break;
      case 'A': this.genAdvisor(board, row, col, color, moves); break;
      case 'B': this.genElephant(board, row, col, color, moves); break;
      case 'N': this.genHorse(board, row, col, moves, piece.color); break;
      case 'R': this.genChariot(board, row, col, color, moves); break;
      case 'C': this.genCannon(board, row, col, color, moves); break;
      case 'P': this.genSoldier(board, row, col, color, moves); break;
    }
    return moves;
  },

  isMoveSafe(board, fr, fc, tr, tc, color) {
    const temp = board.map(r => [...r]);
    temp[tr][tc] = temp[fr][fc];
    temp[fr][fc] = null;
    return !this.isInCheck(temp, color);
  },

  genKing(board, row, col, color, moves) {
    const minR = color === 'red' ? 7 : 0, maxR = color === 'red' ? 9 : 2;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = row + dr, nc = col + dc;
      if (nr >= minR && nr <= maxR && nc >= 3 && nc <= 5) {
        const t = board[nr][nc];
        if (!t || t.color !== color) moves.push({ row: nr, col: nc });
      }
    }
  },

  genAdvisor(board, row, col, color, moves) {
    const minR = color === 'red' ? 7 : 0, maxR = color === 'red' ? 9 : 2;
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      const nr = row + dr, nc = col + dc;
      if (nr >= minR && nr <= maxR && nc >= 3 && nc <= 5) {
        const t = board[nr][nc];
        if (!t || t.color !== color) moves.push({ row: nr, col: nc });
      }
    }
  },

  genElephant(board, row, col, color, moves) {
    const dirs = [[-2,-2],[-2,2],[2,-2],[2,2]], eyes = [[-1,-1],[-1,1],[1,-1],[1,1]];
    const minR = color === 'red' ? 5 : 0, maxR = color === 'red' ? 9 : 4;
    for (let i = 0; i < 4; i++) {
      const [dr, dc] = dirs[i], [er, ec] = eyes[i];
      const nr = row + dr, nc = col + dc, eyeR = row + er, eyeC = col + ec;
      if (nr >= minR && nr <= maxR && nc >= 0 && nc <= 8 && !board[eyeR][eyeC]) {
        const t = board[nr][nc];
        if (!t || t.color !== color) moves.push({ row: nr, col: nc });
      }
    }
  },

  genHorse(board, row, col, moves, color) {
    const h = [[-2,-1,-1,0],[-2,1,-1,0],[2,-1,1,0],[2,1,1,0],[-1,-2,0,-1],[-1,2,0,1],[1,-2,0,-1],[1,2,0,1]];
    for (const [dr, dc, lr, lc] of h) {
      const nr = row + dr, nc = col + dc;
      if (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8 && !board[row + lr][col + lc]) {
        const t = board[nr][nc];
        if (!t || t.color !== color) moves.push({ row: nr, col: nc });
      }
    }
  },

  genChariot(board, row, col, color, moves) {
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let nr = row + dr, nc = col + dc;
      while (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8) {
        const t = board[nr][nc];
        if (!t) moves.push({ row: nr, col: nc });
        else { if (t.color !== color) moves.push({ row: nr, col: nc }); break; }
        nr += dr; nc += dc;
      }
    }
  },

  genCannon(board, row, col, color, moves) {
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let nr = row + dr, nc = col + dc, hasPlatform = false;
      while (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8) {
        const t = board[nr][nc];
        if (!hasPlatform) { if (!t) moves.push({ row: nr, col: nc }); else hasPlatform = true; }
        else { if (t) { if (t.color !== color) moves.push({ row: nr, col: nc }); break; } }
        nr += dr; nc += dc;
      }
    }
  },

  genSoldier(board, row, col, color, moves) {
    const forward = color === 'red' ? -1 : 1;
    const crossed = color === 'red' ? row <= 4 : row >= 5;
    const nr = row + forward;
    if (nr >= 0 && nr <= 9) { const t = board[nr][col]; if (!t || t.color !== color) moves.push({ row: nr, col }); }
    if (crossed) {
      for (const dc of [-1, 1]) {
        const nc = col + dc;
        if (nc >= 0 && nc <= 8) { const t = board[row][nc]; if (!t || t.color !== color) moves.push({ row, col: nc }); }
      }
    }
  },

  isInCheck(board, color) {
    const kingPos = this.findKing(board, color);
    if (!kingPos) return true;
    const { row: kr, col: kc } = kingPos;
    const opp = color === 'red' ? 'black' : 'red';
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      if (board[r][c] && board[r][c].color === opp) {
        const raw = this.getRawMoves(board, r, c, board[r][c]);
        if (raw.some(m => m.row === kr && m.col === kc)) return true;
      }
    }
    return this.isFlyingGeneral(board);
  },

  findKing(board, color) {
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++)
      if (board[r][c] && board[r][c].type === 'K' && board[r][c].color === color) return { row: r, col: c };
    return null;
  },

  isFlyingGeneral(board) {
    const rk = this.findKing(board, 'red'), bk = this.findKing(board, 'black');
    if (!rk || !bk || rk.col !== bk.col) return false;
    for (let r = Math.min(rk.row, bk.row) + 1; r < Math.max(rk.row, bk.row); r++)
      if (board[r][rk.col]) return false;
    return true;
  },

  hasAnyLegalMove(board, color) {
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      if (board[r][c] && board[r][c].color === color) {
        const raw = this.getRawMoves(board, r, c, board[r][c]);
        if (raw.some(m => this.isMoveSafe(board, r, c, m.row, m.col, color))) return true;
      }
    }
    return false;
  },

  doMove(fr, fc, tr, tc) {
    const board = this.state.board.map(r => [...r]);
    const piece = board[fr][fc], captured = board[tr][tc];
    board[tr][tc] = piece;
    board[fr][fc] = null;
    const nextTurn = this.state.currentTurn === 'red' ? 'black' : 'red';
    const inCheck = this.isInCheck(board, nextTurn);
    const hasLegal = this.hasAnyLegalMove(board, nextTurn);
    let gameOver = false, statusText = '';

    if (!hasLegal) {
      gameOver = true;
      statusText = inCheck ? (this.state.currentTurn === 'red' ? '红方胜！将杀！' : '黑方胜！将杀！') : (this.state.currentTurn === 'red' ? '红方胜！困毙！' : '黑方胜！困毙！');
    } else if (inCheck) {
      statusText = nextTurn === 'red' ? '黑将红方！' : '红将黑方！';
    } else {
      statusText = nextTurn === 'red' ? '红方走棋' : '黑方走棋';
    }

    this.state.moveHistory.push({ from: { row: fr, col: fc }, to: { row: tr, col: tc }, piece: { ...piece }, captured: captured ? { ...captured } : null });
    this.state.board = board;
    this.state.currentTurn = nextTurn;
    this.state.gameOver = gameOver;
    this.state.statusText = statusText;
    this.state.selectedPiece = null;
    this.state.validMoves = [];
    this.updateStatus();
    this.drawBoard();

    if (!gameOver) this.scheduleAiMove();
  },

  onUndo() {
    const h = this.state.moveHistory;
    if (h.length === 0) return;
    const last = h.pop();
    const board = this.state.board.map(r => [...r]);
    board[last.from.row][last.from.col] = last.piece;
    board[last.to.row][last.to.col] = last.captured;
    this.state.board = board;
    this.state.currentTurn = this.state.currentTurn === 'red' ? 'black' : 'red';
    this.state.gameOver = false;
    this.state.statusText = this.state.currentTurn === 'red' ? '红方走棋' : '黑方走棋';
    this.state.selectedPiece = null;
    this.state.validMoves = [];
    this.updateStatus();
    this.drawBoard();
  },

  onRestart() { this.initGame(); },

  updateStatus() {
    const el = document.getElementById('chess-status');
    if (el) {
      el.textContent = this.state.statusText;
      el.className = 'game-status' + (this.state.aiThinking ? ' thinking' : '');
    }
    const btnAiRed = document.getElementById('chess-ai-red');
    const btnAiBlack = document.getElementById('chess-ai-black');
    if (btnAiRed) btnAiRed.textContent = '红方电脑' + (this.state.aiRed ? ' ✓' : '');
    if (btnAiBlack) btnAiBlack.textContent = '黑方电脑' + (this.state.aiBlack ? ' ✓' : '');
    const diffEl = document.getElementById('chess-diff-display');
    if (diffEl) diffEl.textContent = ['简单','中等','困难'][this.state.aiDifficulty];
  },

  // ===== AI =====
  toggleAiRed() { this.state.aiRed = !this.state.aiRed; this.updateStatus(); if (this.state.aiRed && this.state.currentTurn === 'red') this.scheduleAiMove(); },
  toggleAiBlack() { this.state.aiBlack = !this.state.aiBlack; this.updateStatus(); if (this.state.aiBlack && this.state.currentTurn === 'black') this.scheduleAiMove(); },
  changeDifficulty(delta) { this.state.aiDifficulty = Math.max(0, Math.min(2, this.state.aiDifficulty + delta)); this.updateStatus(); },

  scheduleAiMove() {
    if (this._aiTimer) clearTimeout(this._aiTimer);
    this._aiTimer = setTimeout(() => this.triggerAiMove(), 100);
  },

  triggerAiMove() {
    if (this.state.gameOver || this.state.aiThinking) return;
    const { currentTurn, aiRed, aiBlack } = this.state;
    const isAi = (currentTurn === 'red' && aiRed) || (currentTurn === 'black' && aiBlack);
    if (!isAi) return;

    this.state.aiThinking = true;
    this.state.statusText = currentTurn === 'red' ? '红方思考中...' : '黑方思考中...';
    this.updateStatus();

    setTimeout(() => {
      try {
        const result = GxaingqiAI.getBestMove(this.state.board, currentTurn, 4, this.state.aiDifficulty + 3);
        if (result) {
          this.doMove(result.from.row, result.from.col, result.to.row, result.to.col);
        } else if (!this.state.gameOver) {
          this.state.statusText = '无子可走';
          this.updateStatus();
        }
      } catch (e) {
        console.error('AI error:', e);
        App.showToast('AI搜索超时');
      }
      this.state.aiThinking = false;
      if (!this.state.gameOver) this.updateStatus();
    }, 50);
  },

  // ===== 规则弹窗 =====
  toggleRules() {
    this.state.showRules = !this.state.showRules;
    const panel = document.getElementById('chess-rules-panel');
    if (panel) panel.classList.toggle('show', this.state.showRules);
  },
};
