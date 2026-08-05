/*! 国际象棋 — Web版 (Canvas渲染 + 图标) */
const ChessIntlModule = {
  state: {
    board: [], currentTurn: 'white', gameOver: false, statusText: '白方走棋',
    selectedPiece: null, validMoves: [], moveHistory: [],
    aiWhite: false, aiBlack: false, aiThinking: false, aiDifficulty: 0,
    showRules: false, capturedWhite: [], capturedBlack: [], inCheck: false,
  },
  PIECE_MAP: { w: { K:5, Q:4, R:3, B:2, N:1, P:0 }, b: { K:11, Q:10, R:9, B:8, N:7, P:6 } },
  /*PIECE_ICONS: {
    wP:'img/icon61_Ggjxq.png',wN:'img/icon41_Ggjxq.png',wB:'img/icon31_Ggjxq.png',wR:'img/icon21_Ggjxq.png',wQ:'img/icon11_Ggjxq.png',wK:'img/icon51_Ggjxq.png',
    bP:'img/icon62_Ggjxq.png',bN:'img/icon42_Ggjxq.png',bB:'img/icon32_Ggjxq.png',bR:'img/icon22_Ggjxq.png',bQ:'img/icon12_Ggjxq.png',bK:'img/icon52_Ggjxq.png',
  },*/
  PIECE_ICONS: {
    wP:'♙',wN:'♘',wB:'♗',wR:'♔',wQ:'♕',wK:'♖',
    bP:'♟',bN:'♞',bB:'♝',bR:'♚',bQ:'♛',bK:'♜',
  },
  init() {
    this.initGame();
    this.drawBoard();
    const canvas = document.getElementById('intlchess-canvas');
    if (!canvas) return;
    const adjust = () => {
      const w = Math.min(canvas.parentElement.clientWidth - 8, 480);
      canvas.width = w; canvas.height = w;
      canvas.style.width = w + 'px'; canvas.style.height = w + 'px';
      this.drawBoard();
    };
    adjust();
    window.addEventListener('resize', adjust);
    canvas.addEventListener('click', (e) => this.onClick(e));
    this.bindButtons();
    this.loadIcons();
  },

  bindButtons() {
    const map = {
      'intlchess-undo': 'onUndo', 'intlchess-restart': 'onRestart',
      'intlchess-ai-white': 'toggleAiWhite', 'intlchess-ai-black': 'toggleAiBlack',
      'intlchess-diff-down': () => this.changeDiff(-1), 'intlchess-diff-up': () => this.changeDiff(1),
    };
    for (const [id, action] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', typeof action === 'string' ? () => this[action]() : action);
    }
    const btnR = document.getElementById('intlchess-rules-btn');
    if (btnR) btnR.addEventListener('click', () => this.toggleRules());
    const rClose = document.getElementById('intlchess-rules-close');
    if (rClose) rClose.addEventListener('click', () => this.toggleRules());
    const rOverlay = document.getElementById('intlchess-rules-overlay');
    if (rOverlay) rOverlay.addEventListener('click', () => this.toggleRules());
  },

  loadIcons() {
    this._loadedIcons = {};
    for (const [key, src] of Object.entries(this.PIECE_ICONS)) {
      const img = new Image();
      img.src = src;
      img.onload = () => { this._loadedIcons[key] = img; this.drawBoard(); };
      img.onerror = () => { this._loadedIcons[key] = null; };
    }
  },

  initGame() {
    const b = Array(8).fill(null).map(() => Array(8).fill(null));
    const backRow = ['R','N','B','Q','K','B','N','R'];
    for (let c = 0; c < 8; c++) { b[7][c] = { type: backRow[c], color: 'white' }; b[0][c] = { type: backRow[c], color: 'black' }; }
    for (let c = 0; c < 8; c++) { b[6][c] = { type: 'P', color: 'white' }; b[1][c] = { type: 'P', color: 'black' }; }
    this.state.board = b;
    this.state.currentTurn = 'white';
    this.state.gameOver = false;
    this.state.statusText = '白方走棋';
    this.state.selectedPiece = null;
    this.state.validMoves = [];
    this.state.moveHistory = [];
    this.state.capturedWhite = [];
    this.state.capturedBlack = [];
    this.state.inCheck = false;
    // Track castling rights
    this._castling = { wK: true, wQ: true, bK: true, bQ: true };
    this._enPassant = null;
    this.updateStatus();
    this.drawBoard();
  },

  getLayout() {
    const canvas = document.getElementById('intlchess-canvas');
    const cw = canvas.width;
    const grid = Math.floor(cw * 0.88 / 8);
    const pad = Math.floor(cw * 0.06);
    const pieceSize = Math.floor(grid * 0.85);
    return { cw, grid, pad, pieceSize };
  },

  drawBoard() {
    const canvas = document.getElementById('intlchess-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { cw, grid, pad } = this.getLayout();
    ctx.clearRect(0, 0, cw, cw);

    // Board squares
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#f0d9b5' : '#b58863';
        ctx.fillRect(pad + c * grid, pad + r * grid, grid, grid);
      }
    }

    // Valid moves
    const moves = this.state.validMoves;
    if (moves.length > 0) {
      moves.forEach(m => {
        const cx = pad + m.col * grid + grid / 2, cy = pad + m.row * grid + grid / 2;
        const b = this.state.board[m.row][m.col];
        ctx.beginPath();
        ctx.arc(cx, cy, grid * (b ? 0.42 : 0.18), 0, Math.PI * 2);
        ctx.fillStyle = b ? 'rgba(255,0,0,0.3)' : 'rgba(7,193,96,0.4)';
        ctx.fill();
      });
    }

    // Selected highlight
    if (this.state.selectedPiece) {
      const { row, col } = this.state.selectedPiece;
      ctx.fillStyle = 'rgba(7,193,96,0.5)';
      ctx.fillRect(pad + col * grid, pad + row * grid, grid, grid);
    }

    // Pieces
    const pieceSize = Math.floor(grid * 0.85);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.state.board[r][c];
        if (!p) continue;
        const cx = pad + c * grid + grid / 2, cy = pad + r * grid + grid / 2;
        const key = p.color[0] + p.type;
        const img = this._loadedIcons && this._loadedIcons[key];
        if (img) {
          ctx.drawImage(img, cx - pieceSize / 2, cy - pieceSize / 2, pieceSize, pieceSize);
        } else {
          // Fallback: text
          const syms = { K:{w:'♔',b:'♚'}, Q:{w:'♕',b:'♛'}, R:{w:'♖',b:'♜'}, B:{w:'♗',b:'♝'}, N:{w:'♘',b:'♞'}, P:{w:'♙',b:'♟'} };
          ctx.font = `${pieceSize}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = p.color === 'white' ? '#fff' : '#000';
          ctx.fillText(syms[p.type][p.color[0]], cx, cy);
        }
      }
    }
  },

  onClick(e) {
    if (this.state.gameOver || this.state.aiThinking) return;
    const canvas = document.getElementById('intlchess-canvas');
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const x = (e.clientX - rect.left) * scale, y = (e.clientY - rect.top) * scale;
    const { grid, pad } = this.getLayout();
    const col = Math.floor((x - pad) / grid), row = Math.floor((y - pad) / grid);
    if (row < 0 || row > 7 || col < 0 || col > 7) {
      this.state.selectedPiece = null; this.state.validMoves = []; this.drawBoard(); return;
    }

    const b = this.state.board;
    if (this.state.selectedPiece) {
      const isValid = this.state.validMoves.some(m => m.row === row && m.col === col);
      if (isValid) { this.doMove(this.state.selectedPiece.row, this.state.selectedPiece.col, row, col); return; }
      const target = b[row][col];
      if (target && target.color === this.state.currentTurn) {
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
    const piece = b[row][col];
    if (piece && piece.color === this.state.currentTurn) {
      const moves = this.getValidMoves(row, col);
      this.state.selectedPiece = { row, col };
      this.state.validMoves = moves;
    }
    this.drawBoard();
  },

  getValidMoves(r, c) {
    const { board, currentTurn } = this.state;
    const piece = board[r][c];
    if (!piece || piece.color !== currentTurn) return [];
    const raw = this.getRawMoves(board, r, c, piece);
    // Filter: move must not leave own king in check
    return raw.filter(m => {
      const temp = board.map(row => [...row]);
      temp[m.row][m.col] = temp[r][c];
      temp[r][c] = null;
      return !this.isInCheck(temp, currentTurn);
    });
  },

  getRawMoves(board, r, c, piece, skipCastling) {
    const moves = [];
    const { type, color } = piece;
    const opp = color === 'white' ? 'black' : 'white';
    const add = (tr, tc) => { if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) { const t = board[tr][tc]; if (!t || t.color !== color) moves.push({ row: tr, col: tc }); } };
    const slide = (dr, dc) => { for (let nr = r + dr, nc = c + dc; nr >= 0 && nr < 8 && nc >= 0 && nc < 8; nr += dr, nc += dc) { const t = board[nr][nc]; if (!t) moves.push({ row: nr, col: nc }); else { if (t.color !== color) moves.push({ row: nr, col: nc }); break; } } };

    switch (type) {
      case 'P': {
        const dir = color === 'white' ? -1 : 1, startR = color === 'white' ? 6 : 1;
        // Forward
        if (r + dir >= 0 && r + dir < 8 && !board[r + dir][c]) {
          moves.push({ row: r + dir, col: c });
          if (r === startR && !board[r + 2 * dir][c]) moves.push({ row: r + 2 * dir, col: c });
        }
        // Captures
        for (const dc of [-1, 1]) {
          const nc = c + dc;
          if (nc >= 0 && nc < 8) {
            const t = board[r + dir][nc];
            if (t && t.color !== color) moves.push({ row: r + dir, col: nc });
            // En passant
            if (this._enPassant && this._enPassant.row === r + dir && this._enPassant.col === nc) moves.push({ row: r + dir, col: nc });
          }
        }
        break;
      }
      case 'N': for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) add(r + dr, c + dc); break;
      case 'B': for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) slide(dr, dc); break;
      case 'R': for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) slide(dr, dc); break;
      case 'Q': for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]) slide(dr, dc); break;
      case 'K': {
        for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) add(r + dr, c + dc);
        // Castling (skip when checking square attacks to prevent recursion)
        if (!skipCastling && !this.isInCheck(board, color)) {
          const row = color === 'white' ? 7 : 0;
          if (r === row && c === 4) {
            if (this._castling[color[0] + 'K'] && !board[row][5] && !board[row][6] && board[row][7] && board[row][7].type === 'R') {
              if (!this.isSquareAttacked(board, row, 5, opp) && !this.isSquareAttacked(board, row, 6, opp))
                moves.push({ row, col: 6 });
            }
            if (this._castling[color[0] + 'Q'] && !board[row][3] && !board[row][2] && !board[row][1] && board[row][0] && board[row][0].type === 'R') {
              if (!this.isSquareAttacked(board, row, 3, opp) && !this.isSquareAttacked(board, row, 2, opp))
                moves.push({ row, col: 2 });
            }
          }
        }
        break;
      }
    }
    return moves;
  },

  isInCheck(board, color) {
    const kingPos = this.findKing(board, color);
    if (!kingPos) return true;
    const opp = color === 'white' ? 'black' : 'white';
    return this.isSquareAttacked(board, kingPos.row, kingPos.col, opp);
  },

  findKing(board, color) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++)
      if (board[r][c] && board[r][c].type === 'K' && board[r][c].color === color) return { row: r, col: c };
    return null;
  },

  isSquareAttacked(board, tr, tc, byColor) {
    // Check if any piece of byColor attacks (tr, tc)
    // skipCastling=true prevents infinite recursion through isInCheck
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === byColor) {
        const raw = this.getRawMoves(board, r, c, p, true);
        if (raw.some(m => m.row === tr && m.col === tc)) return true;
      }
    }
    return false;
  },

  doMove(fr, fc, tr, tc) {
    const board = this.state.board.map(r => [...r]);
    const piece = board[fr][fc], captured = board[tr][tc];
    const color = piece.color;
    const savedCastling = { ...this._castling };
    const savedEnPassant = this._enPassant;

    // Handle castling (move rook)
    if (piece.type === 'K' && Math.abs(tc - fc) === 2) {
      if (tc > fc) { board[fr][5] = board[fr][7]; board[fr][7] = null; }
      else { board[fr][3] = board[fr][0]; board[fr][0] = null; }
    }

    // Handle en passant capture
    let epCapture = null;
    if (piece.type === 'P' && this._enPassant && tr === this._enPassant.row && tc === this._enPassant.col) {
      epCapture = board[fr][tc];
      board[fr][tc] = null;
    }

    // Update castling rights
    if (piece.type === 'K') { this._castling[color[0] + 'K'] = false; this._castling[color[0] + 'Q'] = false; }
    if (piece.type === 'R') {
      if (fc === 0 && fr === 7) this._castling.wQ = false;
      if (fc === 7 && fr === 7) this._castling.wK = false;
      if (fc === 0 && fr === 0) this._castling.bQ = false;
      if (fc === 7 && fr === 0) this._castling.bK = false;
    }

    // Update en passant
    this._enPassant = null;
    if (piece.type === 'P' && Math.abs(tr - fr) === 2) {
      this._enPassant = { row: (fr + tr) / 2, col: fc };
    }

    // Save original piece type for history (before promotion)
    const originalType = piece.type;
    const wasPromotion = (piece.type === 'P' && (tr === 0 || tr === 7));

    // Promotion
    if (wasPromotion) piece.type = 'Q';

    // Execute move
    board[tr][tc] = piece;
    board[fr][fc] = null;

    const actualCaptured = captured || epCapture;
    if (actualCaptured) {
      if (color === 'white') this.state.capturedBlack.push(actualCaptured);
      else this.state.capturedWhite.push(actualCaptured);
    }

    const nextTurn = color === 'white' ? 'black' : 'white';
    const inCheck = this.isInCheck(board, nextTurn);
    let hasLegal = false;
    for (let r = 0; r < 8 && !hasLegal; r++) for (let c = 0; c < 8 && !hasLegal; c++)
      if (board[r][c] && board[r][c].color === nextTurn) {
        const raw = this.getRawMoves(board, r, c, board[r][c]);
        if (raw.some(m => { const t = board.map(r2 => [...r2]); t[m.row][m.col] = t[r][c]; t[r][c] = null; return !this.isInCheck(t, nextTurn); })) hasLegal = true;
      }

    let gameOver = false, statusText = '';
    if (!hasLegal) {
      gameOver = true;
      statusText = inCheck ? `${color === 'white' ? '白' : '黑'}方胜！将杀！` : '平局！逼和！';
    } else if (inCheck) {
      statusText = `${nextTurn === 'white' ? '白' : '黑'}方被将军！`;
    } else {
      statusText = `${nextTurn === 'white' ? '白' : '黑'}方走棋`;
    }

    // Save history with original piece type
    this.state.moveHistory.push({
      from: { row: fr, col: fc }, to: { row: tr, col: tc },
      piece: { type: originalType, color: color },
      captured: actualCaptured ? JSON.parse(JSON.stringify(actualCaptured)) : null,
      castling: savedCastling, enPassant: savedEnPassant,
      wasPromotion: wasPromotion,
    });

    this.state.board = board;
    this.state.currentTurn = nextTurn;
    this.state.gameOver = gameOver;
    this.state.statusText = statusText;
    this.state.selectedPiece = null;
    this.state.validMoves = [];
    this.state.inCheck = inCheck;
    this.updateStatus();
    this.drawBoard();
    this.renderCaptured();
    if (!gameOver) this.scheduleAiMove();
  },

  onUndo() {
    if (this.state.moveHistory.length === 0) return;
    const last = this.state.moveHistory.pop();
    const board = this.state.board.map(r => [...r]);
    // Restore piece with original type (before promotion)
    board[last.from.row][last.from.col] = last.piece;
    board[last.to.row][last.to.col] = last.captured;
    // Handle castling undo
    if (last.piece.type === 'K' && Math.abs(last.to.col - last.from.col) === 2) {
      if (last.to.col > last.from.col) { board[last.from.row][7] = board[last.from.row][5]; board[last.from.row][5] = null; }
      else { board[last.from.row][0] = board[last.from.row][3]; board[last.from.row][3] = null; }
    }
    this._castling = last.castling;
    this._enPassant = last.enPassant;
    if (last.captured) {
      if (last.piece.color === 'white') this.state.capturedBlack.pop();
      else this.state.capturedWhite.pop();
    }
    this.state.board = board;
    this.state.currentTurn = this.state.currentTurn === 'white' ? 'black' : 'white';
    this.state.gameOver = false;
    this.state.statusText = `${this.state.currentTurn === 'white' ? '白' : '黑'}方走棋`;
    this.state.selectedPiece = null;
    this.state.validMoves = [];
    this.updateStatus();
    this.drawBoard();
    this.renderCaptured();
  },

  onRestart() { this.initGame(); },

  renderCaptured() {
    const iconKey = (p) => p.color[0] + p.type;
    const renderList = (pieces, containerId) => {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = pieces.map(p => {
        const img = this._loadedIcons && this._loadedIcons[iconKey(p)];
        return img ? `<img src="${img.src}" style="width:20px;height:20px;display:inline-block;" />` : '';
      }).join('');
    };
    renderList(this.state.capturedWhite, 'intlchess-captured-white');
    renderList(this.state.capturedBlack, 'intlchess-captured-black');
  },

  updateStatus() {
    const el = document.getElementById('intlchess-status');
    if (el) { el.textContent = this.state.statusText; el.className = 'game-status' + (this.state.aiThinking ? ' thinking' : ''); }
    const bw = document.getElementById('intlchess-ai-white');
    if (bw) bw.textContent = '白方电脑' + (this.state.aiWhite ? ' ✓' : '');
    const bb = document.getElementById('intlchess-ai-black');
    if (bb) bb.textContent = '黑方电脑' + (this.state.aiBlack ? ' ✓' : '');
    const diff = document.getElementById('intlchess-diff-display');
    if (diff) diff.textContent = ['简单','中等','困难'][this.state.aiDifficulty];
  },

  toggleAiWhite() { this.state.aiWhite = !this.state.aiWhite; this.updateStatus(); if (this.state.aiWhite && this.state.currentTurn === 'white') this.scheduleAiMove(); },
  toggleAiBlack() { this.state.aiBlack = !this.state.aiBlack; this.updateStatus(); if (this.state.aiBlack && this.state.currentTurn === 'black') this.scheduleAiMove(); },
  changeDiff(d) { this.state.aiDifficulty = Math.max(0, Math.min(2, this.state.aiDifficulty + d)); this.updateStatus(); },
  toggleRules() { this.state.showRules = !this.state.showRules; const p = document.getElementById('intlchess-rules-panel'); if (p) p.classList.toggle('show', this.state.showRules); },

  scheduleAiMove() {
    if (this._aiTimer) clearTimeout(this._aiTimer);
    this._aiTimer = setTimeout(() => this.triggerAiMove(), 100);
  },

  triggerAiMove() {
    if (this.state.gameOver || this.state.aiThinking) return;
    const { currentTurn, aiWhite, aiBlack } = this.state;
    if (!((currentTurn === 'white' && aiWhite) || (currentTurn === 'black' && aiBlack))) return;
    this.state.aiThinking = true;
    this.state.statusText = `${currentTurn === 'white' ? '白' : '黑'}方思考中...`;
    this.updateStatus();
    setTimeout(() => {
      // Simple heuristic AI
      const { board } = this.state;
      let allMoves = [];
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        if (board[r][c] && board[r][c].color === currentTurn) {
          const raw = this.getRawMoves(board, r, c, board[r][c]);
          const valid = raw.filter(m => {
            const t = board.map(r2 => [...r2]);
            t[m.row][m.col] = t[r][c];
            t[r][c] = null;
            return !this.isInCheck(t, currentTurn);
          });
          allMoves.push(...valid.map(m => ({ from: { row: r, col: c }, to: m, captured: board[m.row][m.col] })));
        }
      }
      if (allMoves.length === 0) { this.state.aiThinking = false; return; }
      // Score moves: prefer captures, prefer center, add noise
      const values = { P:1, N:3, B:3, R:5, Q:9, K:100 };
      allMoves.sort((a, b) => {
        let sa = (a.captured ? values[a.captured.type] || 0 : 0) - Math.abs(a.to.row - 3.5) - Math.abs(a.to.col - 3.5) + Math.random() * 2;
        let sb = (b.captured ? values[b.captured.type] || 0 : 0) - Math.abs(b.to.row - 3.5) - Math.abs(b.to.col - 3.5) + Math.random() * 2;
        return sb - sa;
      });
      // Depending on difficulty, choose from top N
      const topN = this.state.aiDifficulty === 0 ? 8 : this.state.aiDifficulty === 1 ? 4 : 1;
      const chosen = allMoves[Math.floor(Math.random() * Math.min(topN, allMoves.length))];
      this.doMove(chosen.from.row, chosen.from.col, chosen.to.row, chosen.to.col);
      this.state.aiThinking = false;
      if (!this.state.gameOver) this.updateStatus();
    }, 100);
  },
};
