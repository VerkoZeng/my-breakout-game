/*!
 * Chinese Chess AI — Web版
 * 基于共享 AISearchEngine
 */
const GxaingqiAI = (function() {
  const P = { EMPTY: 0, KING: 1, ADVISOR: 2, BISHOP: 3, KNIGHT: 4, ROOK: 5, CANNON: 6, PAWN: 7 };
  const RED = 1, BLACK = -1, FLIP = s => s === RED ? BLACK : RED;
  const SQ = 90, IDX = (c, r) => r * 9 + c;
  const IN_BOARD = (c, r) => c >= 0 && c < 9 && r >= 0 && r < 10;
  const IN_PALACE = (c, r, side) => c >= 3 && c <= 5 && (side === RED ? r >= 0 && r <= 2 : r >= 7 && r <= 9);
  const INF = 99999;
  const V = [0, 10000, 120, 120, 270, 600, 285, 50];

  function buildPST(src) { const arr = new Int8Array(90); for (let i = 0; i < 90; i++) arr[i] = src[i] || 0; return arr; }
  function getPST(pst, pieceVal, r, c) { return pieceVal > 0 ? pst[(9 - r) * 9 + c] : pst[r * 9 + c]; }

  const RAW_ROOK = [6,10,14,20,24,20,14,10,6,4,8,12,18,22,18,12,8,4,2,6,10,16,20,16,10,6,2,0,4,8,14,18,14,8,4,0,2,6,12,18,22,18,12,6,2,2,6,12,18,22,18,12,6,2,0,4,8,14,18,14,8,4,0,-2,0,4,8,12,8,4,0,-2,-4,-2,0,4,8,4,0,-2,-4,-8,-6,-4,2,6,2,-4,-6,-8];
  const RAW_KNIGHT = [0,-4,2,6,8,6,2,-4,0,2,6,10,14,16,14,10,6,2,4,10,16,22,26,22,16,10,4,2,8,18,26,30,26,18,8,2,0,6,14,22,28,22,14,6,0,0,6,12,18,24,18,12,6,0,2,8,16,22,26,22,16,8,2,4,8,14,18,22,18,14,8,4,2,4,8,12,14,12,8,4,2,0,-2,2,4,6,4,2,-2,0];
  const RAW_CANNON = [0,0,4,8,12,8,4,0,0,0,2,6,12,16,12,6,2,0,0,0,4,10,14,10,4,0,0,-2,2,8,16,20,16,8,2,-2,2,4,10,18,24,18,10,4,2,2,4,10,18,24,18,10,4,2,-2,2,8,16,20,16,8,2,-2,0,0,4,10,14,10,4,0,0,0,2,6,12,16,12,6,2,0,0,0,4,8,12,8,4,0,0];
  const RAW_PAWN = [0,4,12,28,40,28,12,4,0,0,2,10,24,36,24,10,2,0,0,0,8,20,30,20,8,0,0,0,0,6,16,26,16,6,0,0,0,0,4,12,20,12,4,0,0,0,0,2,6,10,6,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];

  const PST_ROOK = buildPST(RAW_ROOK), PST_KNIGHT = buildPST(RAW_KNIGHT), PST_CANNON = buildPST(RAW_CANNON), PST_PAWN = buildPST(RAW_PAWN);
  const DIFFICULTY = {
    1: { maxDepth: 2, timeLimit: 3000, noise: 30, useQS: true, checkExt: true },
    2: { maxDepth: 5, timeLimit: 4000, noise: 0, useQS: true, checkExt: true },
    3: { maxDepth: 8, timeLimit: 6000, noise: 0, useQS: true, checkExt: true },
    4: { maxDepth: 11, timeLimit: 7000, noise: 0, useQS: true, checkExt: true },
    5: { maxDepth: 15, timeLimit: 9000, noise: 0, useQS: true, checkExt: true },
  };
  let currentDifficulty = 3;

  const ZOBRIST_PIECE = new Int32Array(SQ * 15);
  const ZOBRIST_SIDE = (Math.random() * 0x100000000) | 0;
  let zobristInit = false;
  function initZobrist() { if (zobristInit) return; for (let i = 0; i < SQ * 15; i++) ZOBRIST_PIECE[i] = (Math.random() * 0x100000000) | 0; zobristInit = true; }
  function zobristKey(sq, piece) { return ZOBRIST_PIECE[sq * 15 + (piece + 7)]; }

  const eng = AISearchEngine.buildEngine({ INF, FLIP, ZOBRIST_SIDE, EVAL_SIDE: RED, V, SQ: 90, SQ_COLS: 9, TT_MAX_SIZE: 120000 });

  function makeMoveObj(fc, fr, tc, tr, piece, capture) { return { fc, fr, tc, tr, piece, capture, moved: false }; }

  class Chess {
    constructor(fen) {
      this.squares = new Int8Array(SQ);
      this.pieceList = { [RED]: [], [BLACK]: [] };
      this.kingPos = { [RED]: null, [BLACK]: null };
      this.side = RED; this.ply = 0; this.moveStack = []; this.key = 0; this.killers = []; this.tt = new Map();
      initZobrist();
      if (fen) this.load(fen);
    }
    load(fen) {
      this.squares.fill(0); this.pieceList[RED] = []; this.pieceList[BLACK] = [];
      this.kingPos[RED] = null; this.kingPos[BLACK] = null;
      this.moveStack = []; this.key = 0; this.ply = 0;
      const parts = fen.split(' '), rows = parts[0].split('/');
      for (let r = 0; r < 10; r++) {
        let row = rows[r], c = 0;
        for (let ch of row) {
          if (ch >= '1' && ch <= '9') { c += parseInt(ch); continue; }
          let side = ch === ch.toUpperCase() ? RED : BLACK;
          let type = { 'K': 1, 'A': 2, 'B': 3, 'N': 4, 'R': 5, 'C': 6, 'P': 7 }[ch.toUpperCase()] || 0;
          if (type) {
            const piece = side * type, sq = IDX(c, 9 - r);
            this.squares[sq] = piece;
            const entry = { type, c, r: 9 - r, side };
            this.pieceList[side].push(entry);
            if (type === P.KING) this.kingPos[side] = entry;
            this.key ^= zobristKey(sq, piece);
          }
          c++;
        }
      }
      this.side = parts[1] === 'w' ? RED : BLACK;
      if (this.side === BLACK) this.key ^= ZOBRIST_SIDE;
    }
    getPiece(c, r) { return this.squares[IDX(c, r)]; }
    setPiece(c, r, v) { this.squares[IDX(c, r)] = v; }
    sameSide(p1, p2) { return (p1 > 0 && p2 > 0) || (p1 < 0 && p2 < 0); }
    pieceSide(p) { return p > 0 ? RED : BLACK; }

    generateMoves(capturesOnly) {
      const moves = [], side = this.side, list = this.pieceList[side];
      for (let pi = 0; pi < list.length; pi++) {
        const { type, c, r } = list[pi], pieceVal = side * type;
        switch (type) {
          case P.KING: this._genKingMoves(moves, c, r, pieceVal, side, capturesOnly); break;
          case P.ADVISOR: this._genAdvisorMoves(moves, c, r, pieceVal, side, capturesOnly); break;
          case P.BISHOP: this._genBishopMoves(moves, c, r, pieceVal, side, capturesOnly); break;
          case P.KNIGHT: this._genKnightMoves(moves, c, r, pieceVal, capturesOnly); break;
          case P.ROOK: this._genRookCannonMoves(moves, c, r, pieceVal, true, capturesOnly); break;
          case P.CANNON: this._genRookCannonMoves(moves, c, r, pieceVal, false, capturesOnly); break;
          case P.PAWN: this._genPawnMoves(moves, c, r, pieceVal, side, capturesOnly); break;
        }
      }
      return moves;
    }
    _tryAddMove(moves, fc, fr, tc, tr, piece, capturesOnly) {
      const target = this.squares[IDX(tc, tr)];
      if (target === 0) { if (!capturesOnly) moves.push(makeMoveObj(fc, fr, tc, tr, piece, 0)); }
      else if (!this.sameSide(piece, target)) moves.push(makeMoveObj(fc, fr, tc, tr, piece, target));
    }
    _genKingMoves(moves, c, r, p, side, co) { for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nc = c + dc, nr = r + dr; if (IN_PALACE(nc, nr, side)) this._tryAddMove(moves, c, r, nc, nr, p, co); } }
    _genAdvisorMoves(moves, c, r, p, side, co) { for (const [dc, dr] of [[1,1],[1,-1],[-1,1],[-1,-1]]) { const nc = c + dc, nr = r + dr; if (IN_PALACE(nc, nr, side)) this._tryAddMove(moves, c, r, nc, nr, p, co); } }
    _genBishopMoves(moves, c, r, p, side, co) {
      const dirs = [[2,2],[2,-2],[-2,2],[-2,-2]], eyes = [[1,1],[1,-1],[-1,1],[-1,-1]];
      const limit = side === RED ? [0, 4] : [5, 9];
      for (let i = 0; i < 4; i++) {
        const ec = c + eyes[i][0], er = r + eyes[i][1];
        if (!IN_BOARD(ec, er) || this.squares[IDX(ec, er)] !== 0) continue;
        const nc = c + dirs[i][0], nr = r + dirs[i][1];
        if (IN_BOARD(nc, nr) && nr >= limit[0] && nr <= limit[1]) this._tryAddMove(moves, c, r, nc, nr, p, co);
      }
    }
    _genKnightMoves(moves, c, r, p, co) {
      const offsets = [[1,0,2,1],[1,0,2,-1],[-1,0,-2,1],[-1,0,-2,-1],[0,1,1,2],[0,1,-1,2],[0,-1,1,-2],[0,-1,-1,-2]];
      for (const [lc, lr, dc, dr] of offsets) {
        const legC = c + lc, legR = r + lr;
        if (!IN_BOARD(legC, legR) || this.squares[IDX(legC, legR)] !== 0) continue;
        const nc = c + dc, nr = r + dr;
        if (IN_BOARD(nc, nr)) this._tryAddMove(moves, c, r, nc, nr, p, co);
      }
    }
    _genRookCannonMoves(moves, c, r, p, isRook, co) {
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        let nc = c + dc, nr = r + dr;
        while (IN_BOARD(nc, nr)) {
          const t = this.squares[IDX(nc, nr)];
          if (t === 0) { if (!co) moves.push(makeMoveObj(c, r, nc, nr, p, 0)); }
          else {
            if (isRook) { if (!this.sameSide(p, t)) moves.push(makeMoveObj(c, r, nc, nr, p, t)); }
            else { let jc = nc + dc, jr = nr + dr; while (IN_BOARD(jc, jr)) { const jt = this.squares[IDX(jc, jr)]; if (jt !== 0) { if (!this.sameSide(p, jt)) moves.push(makeMoveObj(c, r, jc, jr, p, jt)); break; } jc += dc; jr += dr; } }
            break;
          }
          nc += dc; nr += dr;
        }
      }
    }
    _genPawnMoves(moves, c, r, p, side, co) {
      const forward = side === RED ? 1 : -1, nr = r + forward;
      if (IN_BOARD(c, nr)) this._tryAddMove(moves, c, r, c, nr, p, co);
      const crossed = (side === RED && r >= 5) || (side === BLACK && r <= 4);
      if (crossed) { if (c > 0) this._tryAddMove(moves, c, r, c - 1, r, p, co); if (c < 8) this._tryAddMove(moves, c, r, c + 1, r, p, co); }
    }

    makeMove(move) {
      const { fc, fr, tc, tr, piece, capture } = move;
      const fromSq = IDX(fc, fr), toSq = IDX(tc, tr);
      const side = this.pieceSide(piece), opp = FLIP(side);
      move.moved = true; move._wasCapture = capture !== 0; move._fromKey = this.key;
      this.squares[toSq] = piece; this.squares[fromSq] = 0;
      this.key ^= zobristKey(fromSq, piece); this.key ^= zobristKey(toSq, piece);
      if (capture) this.key ^= zobristKey(toSq, capture);
      this.key ^= ZOBRIST_SIDE;
      const list = this.pieceList[side]; let pe = null;
      for (let i = 0; i < list.length; i++) { if (list[i].c === fc && list[i].r === fr && list[i].type === Math.abs(piece)) { pe = list[i]; move._fromIdx = i; break; } }
      if (pe) { pe.c = tc; pe.r = tr; }
      if (capture) { const oppList = this.pieceList[opp]; const capType = Math.abs(capture); for (let i = 0; i < oppList.length; i++) { if (oppList[i].c === tc && oppList[i].r === tr && oppList[i].type === capType) { move._capIdx = i; oppList.splice(i, 1); break; } } }
      if (Math.abs(piece) === P.KING) { this.kingPos[side].c = tc; this.kingPos[side].r = tr; }
      this.side = opp; this.ply++; this.moveStack.push(move);
    }
    unmakeMove(move) {
      const { fc, fr, tc, tr, piece, capture } = move;
      const fromSq = IDX(fc, fr), toSq = IDX(tc, tr), side = this.pieceSide(piece), opp = FLIP(side);
      this.squares[fromSq] = piece; this.squares[toSq] = capture || 0;
      this.key = move._fromKey;
      const list = this.pieceList[side];
      if (move._fromIdx !== undefined && move._fromIdx < list.length) { list[move._fromIdx].c = fc; list[move._fromIdx].r = fr; }
      if (capture && move._capIdx !== undefined) { const oppList = this.pieceList[opp]; oppList.splice(move._capIdx, 0, { type: Math.abs(capture), c: tc, r: tr, side: opp }); }
      if (Math.abs(piece) === P.KING) { this.kingPos[side].c = fc; this.kingPos[side].r = fr; }
      this.side = side; this.ply--; this.moveStack.pop(); move.moved = false;
    }
    isInCheck(side) { const king = this.kingPos[side]; if (!king) return true; return this.isSquareAttacked(king.c, king.r, FLIP(side)); }
    isSquareAttacked(tc, tr, bySide) {
      const oppList = this.pieceList[bySide];
      for (let i = 0; i < oppList.length; i++) { const { type, c, r } = oppList[i]; if (this._pieceCanAttack(c, r, type, bySide * type, tc, tr)) return true; }
      const myKing = this.kingPos[bySide];
      if (myKing && myKing.c === tc) { const r1 = Math.min(myKing.r, tr), r2 = Math.max(myKing.r, tr); let blocked = false; for (let rr = r1 + 1; rr < r2; rr++) { if (this.squares[IDX(tc, rr)] !== 0) { blocked = true; break; } } if (!blocked) return true; }
      return false;
    }
    _pieceCanAttack(fc, fr, type, p, tc, tr) {
      const dc = tc - fc, dr = tr - fr, adc = Math.abs(dc), adr = Math.abs(dr), side = this.pieceSide(p);
      switch (type) {
        case P.KING: return IN_PALACE(tc, tr, side) && adc + adr === 1;
        case P.ADVISOR: return IN_PALACE(tc, tr, side) && adc === 1 && adr === 1;
        case P.BISHOP: return adc === 2 && adr === 2 && this.squares[IDX(fc + dc / 2, fr + dr / 2)] === 0 && (side === RED ? tr <= 4 : tr >= 5);
        case P.KNIGHT: { if ((adc === 2 && adr === 1) || (adc === 1 && adr === 2)) { let lc, lr; if (adc === 2) { lc = fc + (dc > 0 ? 1 : -1); lr = fr; } else { lr = fr + (dr > 0 ? 1 : -1); lc = fc; } return this.squares[IDX(lc, lr)] === 0; } return false; }
        case P.ROOK: return (dc === 0 || dr === 0) && this._lineIsClear(fc, fr, tc, tr);
        case P.CANNON: { if (dc !== 0 && dr !== 0) return false; const cnt = this._countBetween(fc, fr, tc, tr); const target = this.squares[IDX(tc, tr)]; if (target === 0) return cnt === 0; return cnt === 1; }
        case P.PAWN: { const forward = side === RED ? 1 : -1; if (dc === 0 && dr === forward) return true; if ((side === RED ? fr >= 5 : fr <= 4) && dr === 0 && adc === 1) return true; return false; }
      }
      return false;
    }
    _lineIsClear(fc, fr, tc, tr) { if (fc === tc) { for (let r = Math.min(fr, tr) + 1; r < Math.max(fr, tr); r++) if (this.squares[IDX(fc, r)] !== 0) return false; return true; } for (let c = Math.min(fc, tc) + 1; c < Math.max(fc, tc); c++) if (this.squares[IDX(c, fr)] !== 0) return false; return true; }
    _countBetween(fc, fr, tc, tr) { let cnt = 0; if (fc === tc) { for (let r = Math.min(fr, tr) + 1; r < Math.max(fr, tr); r++) if (this.squares[IDX(fc, r)] !== 0) cnt++; } else { for (let c = Math.min(fc, tc) + 1; c < Math.max(fc, tc); c++) if (this.squares[IDX(c, fr)] !== 0) cnt++; } return cnt; }

    evaluate() {
      let score = 0; const oppSideOf = s => s === RED ? BLACK : RED;
      let totalNonPawn = 0;
      for (const side of [RED, BLACK]) { const list = this.pieceList[side]; for (let i = 0; i < list.length; i++) { const t = list[i].type; if (t !== P.KING && t !== P.PAWN) totalNonPawn += V[t]; } }
      const BASE_MATERIAL = 5580;
      const phase = Math.min(100, Math.max(0, Math.floor(100 * (1 - totalNonPawn / BASE_MATERIAL))));
      const isEndgame = phase >= 70, isOpening = phase < 15;
      for (const side of [RED, BLACK]) {
        const list = this.pieceList[side], sign = side === RED ? 1 : -1, oppSide = oppSideOf(side), king = this.kingPos[side];
        const pawnCols = []; let advisorCount = 0, bishopCount = 0;
        for (let i = 0; i < list.length; i++) {
          const { type, c, r } = list[i], pieceVal = side * type;
          let val = V[type];
          if (type === P.CANNON) val += Math.floor(40 * (100 - phase) / 100);
          if (type === P.KNIGHT) val += Math.floor(20 * phase / 100);
          if (type === P.ROOK) val += getPST(PST_ROOK, pieceVal, r, c);
          else if (type === P.KNIGHT) val += getPST(PST_KNIGHT, pieceVal, r, c);
          else if (type === P.CANNON) val += getPST(PST_CANNON, pieceVal, r, c);
          else if (type === P.PAWN) { val += getPST(PST_PAWN, pieceVal, r, c); pawnCols.push(c); }
          if (type === P.KING && king && !isEndgame) { let defenders = 0; for (let j = 0; j < list.length; j++) { const ot = list[j].type; if ((ot === P.ADVISOR || ot === P.BISHOP) && Math.abs(list[j].c - c) <= 2 && Math.abs(list[j].r - r) <= 2) defenders++; } const saFactor = isOpening ? 1.4 : 1.0; if (defenders < 2) val -= Math.floor((3 - defenders) * 25 * saFactor); }
          if (type >= P.KNIGHT && type !== P.KING) { const attacked = this.isSquareAttacked(c, r, oppSide); if (attacked) { const defended = this.isSquareAttacked(c, r, side); if (!defended) val -= Math.floor(V[type] * 0.40); else val -= Math.floor(V[type] * 0.12); } }
          if (type === P.ADVISOR) advisorCount++; if (type === P.BISHOP) bishopCount++;
          score += sign * val;
        }
        if (advisorCount >= 2) score += sign * 20; if (bishopCount >= 2) score += sign * 20;
        if (pawnCols.length >= 2) { pawnCols.sort((a, b) => a - b); let connected = 0; for (let i = 1; i < pawnCols.length; i++) { if (pawnCols[i] - pawnCols[i - 1] <= 1) connected++; } score += sign * connected * 10; }
        if (isEndgame && king) { const centerC = Math.abs(king.c - 4), idealR = side === RED ? 1 : 8; score += sign * Math.floor((5 - centerC - Math.abs(king.r - idealR)) * 6); }
      }
      return score;
    }
    computeComplexity(moveCount) { const totalPieces = this.pieceList[RED].length + this.pieceList[BLACK].length; const inCheck = this.isInCheck(this.side) ? 1 : 0; const pieceRatio = totalPieces / 32, moveRatio = Math.min(moveCount / 50, 1); return moveRatio * 0.55 + pieceRatio * 0.30 + inCheck * 0.15; }
  }

  function boardToFen(board, currentTurn) {
    const fenChar = { red: { K: 'K', A: 'A', B: 'B', N: 'N', R: 'R', C: 'C', P: 'P' }, black: { K: 'k', A: 'a', B: 'b', N: 'n', R: 'r', C: 'c', P: 'p' } };
    const rows = [];
    for (let r = 0; r < 10; r++) { let row = '', empty = 0; for (let c = 0; c < 9; c++) { const p = board[r][c]; if (p === null) empty++; else { if (empty) { row += empty; empty = 0; } row += fenChar[p.color][p.type]; } } if (empty) row += empty; rows.push(row); }
    return rows.join('/') + ' ' + (currentTurn === 'red' ? 'w' : 'b') + ' - - 0 1';
  }

  function getBestMove(board, currentTurn, depth, difficulty) {
    if (depth === undefined) depth = 4;
    if (difficulty !== undefined) setDifficulty(difficulty);
    const diffConfig = DIFFICULTY[currentDifficulty];
    const fen = boardToFen(board, currentTurn);
    const game = new Chess(fen);
    try {
      const effectiveDepth = Math.min(depth, diffConfig.maxDepth);
      const move = eng.iterativeDeepening(game, effectiveDepth, diffConfig);
      if (!move) return null;
      return { from: { row: 9 - move.fr, col: move.fc }, to: { row: 9 - move.tr, col: move.tc } };
    } catch (e) { console.error('AI search error:', e); return null; }
  }

  function setDifficulty(level) { currentDifficulty = Math.max(1, Math.min(5, level)); }
  return { getBestMove, setDifficulty };
})();
