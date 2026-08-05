/*!
 * AISearchEngine — 共享AI引擎 (Web版)
 * Alpha-Beta (PVS) + 置换表 + 历史启发 + 静态搜索 + 迭代加深
 */
const AISearchEngine = (function() {
  function buildEngine(cfg) {
    const INF = cfg.INF;
    const FLIP = cfg.FLIP;
    const ZOBRIST_SIDE = cfg.ZOBRIST_SIDE;
    const EVAL_SIDE = cfg.EVAL_SIDE;
    const V = cfg.V;
    const SQ = cfg.SQ;
    const SQ_COLS = cfg.SQ_COLS;
    const TT_MAX_SIZE = cfg.TT_MAX_SIZE;

    let hardDeadline = 0;
    const HISTORY_SIZE = SQ * SQ;
    const historyTable = new Int32Array(HISTORY_SIZE);

    function historyIdx(fc, fr, tc, tr) {
      return (fr * SQ_COLS + fc) * SQ + (tr * SQ_COLS + tc);
    }

    const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;

    function storeTT(tt, key, depth, score, flag, bestMove) {
      if (tt.size >= TT_MAX_SIZE) {
        const entries = [...tt.entries()];
        const toRemove = entries.length >> 1;
        for (let i = 0; i < toRemove; i++) tt.delete(entries[i][0]);
      }
      tt.set(key, { depth, score, flag, bestMove });
    }

    function probeTT(tt, key, depth, alpha, beta) {
      const entry = tt.get(key);
      if (!entry || entry.depth < depth) return null;
      if (entry.flag === TT_EXACT) return entry;
      if (entry.flag === TT_LOWER && entry.score >= beta) return entry;
      if (entry.flag === TT_UPPER && entry.score <= alpha) return entry;
      return null;
    }

    function clearHistory() { historyTable.fill(0); }

    function sortMoves(moves, game, ttBestMove, ply) {
      const scores = new Int32Array(moves.length);
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        let s = 0;
        if (ttBestMove && m.fc === ttBestMove.fc && m.fr === ttBestMove.fr &&
            m.tc === ttBestMove.tc && m.tr === ttBestMove.tr) {
          s = 100000000;
        } else if (m.capture) {
          s = 100000 + V[Math.abs(m.capture)] * 100 - V[Math.abs(m.piece)];
        } else {
          if (game.killers[ply * 2] && m.fc === game.killers[ply * 2].fc &&
              m.fr === game.killers[ply * 2].fr && m.tc === game.killers[ply * 2].tc &&
              m.tr === game.killers[ply * 2].tr) s = 90000;
          else if (game.killers[ply * 2 + 1] && m.fc === game.killers[ply * 2 + 1].fc &&
                   m.fr === game.killers[ply * 2 + 1].fr && m.tc === game.killers[ply * 2 + 1].tc &&
                   m.tr === game.killers[ply * 2 + 1].tr) s = 80000;
          else s = historyTable[historyIdx(m.fc, m.fr, m.tc, m.tr)];
        }
        scores[i] = s;
      }
      for (let i = 1; i < moves.length; i++) {
        const key = moves[i], ks = scores[i];
        let j = i - 1;
        while (j >= 0 && scores[j] < ks) { moves[j + 1] = moves[j]; scores[j + 1] = scores[j]; j--; }
        moves[j + 1] = key; scores[j + 1] = ks;
      }
    }

    function sortCaptures(moves) {
      const scores = new Int32Array(moves.length);
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        scores[i] = m.capture ? V[Math.abs(m.capture)] * 100 - V[Math.abs(m.piece)] : 0;
      }
      for (let i = 1; i < moves.length; i++) {
        const key = moves[i], ks = scores[i];
        let j = i - 1;
        while (j >= 0 && scores[j] < ks) { moves[j + 1] = moves[j]; scores[j + 1] = scores[j]; j--; }
        moves[j + 1] = key; scores[j + 1] = ks;
      }
    }

    function alphaBeta(game, depth, alpha, beta, startTime, timeLimit, useCheckExt) {
      if (Date.now() > hardDeadline) {
        const evalScore = game.evaluate();
        return game.side === EVAL_SIDE ? evalScore : -evalScore;
      }
      const key = game.key, ply = game.ply;
      const ttHit = probeTT(game.tt, key, depth, alpha, beta);
      if (ttHit) return ttHit.score;
      if (depth === 0) {
        if (useCheckExt && game.isInCheck(game.side) && ply < 60) depth = 1;
        else return quiescence(game, alpha, beta);
      }
      if (depth >= 3 && !game.isInCheck(game.side)) {
        game.key ^= ZOBRIST_SIDE;
        game.side = FLIP(game.side);
        const nullScore = -alphaBeta(game, depth - 1 - 2, -beta, -beta + 1, startTime, timeLimit, useCheckExt);
        game.side = FLIP(game.side);
        game.key ^= ZOBRIST_SIDE;
        if (nullScore >= beta) return beta;
      }
      let moves = game.generateMoves(false);
      if (moves.length === 0) {
        if (game.isInCheck(game.side)) return -INF + ply;
        return 0;
      }
      const ttEntry = game.tt.get(key);
      const ttBestMove = ttEntry ? ttEntry.bestMove : null;
      sortMoves(moves, game, ttBestMove, ply);
      let bestMove = null, bestScore = -INF, searchedMoves = 0, truncated = false;
      const elapsed = Date.now() - startTime;
      if (elapsed > timeLimit) {
        if (alpha > -INF + 1000) return alpha;
        const evalScore = game.evaluate();
        return game.side === EVAL_SIDE ? evalScore : -evalScore;
      }
      for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        game.makeMove(move);
        const inCheck = game.isInCheck(FLIP(game.side));
        if (inCheck) { game.unmakeMove(move); continue; }
        let score;
        if (searchedMoves === 0) {
          score = -alphaBeta(game, depth - 1, -beta, -alpha, startTime, timeLimit, useCheckExt);
        } else {
          score = -alphaBeta(game, depth - 1, -alpha - 1, -alpha, startTime, timeLimit, useCheckExt);
          if (score > alpha && score < beta) {
            score = -alphaBeta(game, depth - 1, -beta, -alpha, startTime, timeLimit, useCheckExt);
          }
        }
        game.unmakeMove(move);
        if (score > bestScore) { bestScore = score; bestMove = move; }
        if (score > alpha) alpha = score;
        if (alpha >= beta) {
          if (!move.capture) {
            historyTable[historyIdx(move.fc, move.fr, move.tc, move.tr)] += depth * depth;
            if (ply < 20 && depth > 1) {
              game.killers[ply * 2 + 1] = game.killers[ply * 2];
              game.killers[ply * 2] = move;
            }
          }
          break;
        }
        searchedMoves++;
        if ((searchedMoves & 3) === 0 && Date.now() > hardDeadline) { truncated = true; break; }
      }
      if (!truncated) {
        let flag = TT_EXACT;
        if (bestScore <= -INF + 100) flag = TT_UPPER;
        else if (bestScore >= beta) flag = TT_LOWER;
        else if (searchedMoves < moves.length) flag = TT_UPPER;
        storeTT(game.tt, key, depth, bestScore, flag, bestMove);
      }
      return bestScore;
    }

    function quiescence(game, alpha, beta) {
      const rawEval = game.evaluate();
      const standPat = game.side === EVAL_SIDE ? rawEval : -rawEval;
      const inCheck = game.isInCheck(game.side);
      if (!inCheck && standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;
      let moves;
      if (inCheck) moves = game.generateMoves(false);
      else moves = game.generateMoves(true);
      if (moves.length === 0) return alpha;
      if (inCheck) sortMoves(moves, game, null, game.ply);
      else sortCaptures(moves);
      for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        if (Date.now() > hardDeadline) break;
        if (!inCheck && move.capture) {
          if (standPat + V[Math.abs(move.capture)] + 100 <= alpha) continue;
        }
        game.makeMove(move);
        const moverChecked = game.isInCheck(FLIP(game.side));
        if (moverChecked) { game.unmakeMove(move); continue; }
        const score = -quiescence(game, -beta, -alpha);
        game.unmakeMove(move);
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      }
      return alpha;
    }

    function iterativeDeepening(game, maxDepth, diffConfig) {
      const startTime = Date.now();
      const timeLimit = diffConfig.timeLimit;
      hardDeadline = startTime + timeLimit - 200;
      const useCheckExt = diffConfig.checkExt;
      const noise = diffConfig.noise;
      let bestMove = null;
      clearHistory();
      let moves = game.generateMoves(false);
      if (moves.length === 0) return null;
      const complexity = game.computeComplexity(moves.length);
      let targetDepth = maxDepth;
      if (complexity > 0.7) targetDepth = Math.max(2, targetDepth - 1);
      targetDepth = Math.max(1, targetDepth);
      const ttEntry = game.tt.get(game.key);
      sortMoves(moves, game, ttEntry ? ttEntry.bestMove : null, 0);
      let prevDepthScore = -INF;
      for (let d = 1; d <= targetDepth; d++) {
        let alpha = -INF, beta = INF;
        let currentBest = null, currentScore = -INF, allSearched = true;
        if (d >= 3 && bestMove && prevDepthScore > -INF + 1000) {
          alpha = prevDepthScore - 150; beta = prevDepthScore + 150;
        }
        for (let i = 0; i < moves.length; i++) {
          const move = moves[i];
          game.makeMove(move);
          const inCheck = game.isInCheck(FLIP(game.side));
          if (inCheck) { game.unmakeMove(move); continue; }
          let score;
          if (i === 0) {
            score = -alphaBeta(game, d - 1, -beta, -alpha, startTime, timeLimit, useCheckExt);
          } else {
            score = -alphaBeta(game, d - 1, -alpha - 1, -alpha, startTime, timeLimit, useCheckExt);
            if (score > alpha && score < beta) {
              score = -alphaBeta(game, d - 1, -beta, -alpha, startTime, timeLimit, useCheckExt);
            }
          }
          game.unmakeMove(move);
          if (noise > 0 && d === 1) {
            score += (Math.random() * 2 - 1) * (noise * (moves.length - i) / moves.length);
          }
          if (score > currentScore) { currentScore = score; currentBest = move; }
          if (score > alpha) alpha = score;
          const timeFactor = d <= 2 ? 0.90 : 0.80;
          if (Date.now() - startTime > timeLimit * timeFactor) { allSearched = false; break; }
        }
        if (currentBest) bestMove = currentBest;
        if (currentScore > -INF + 100) prevDepthScore = currentScore;
        if (!allSearched) break;
      }
      return bestMove;
    }

    return { TT_EXACT, TT_LOWER, TT_UPPER, storeTT, probeTT, clearHistory, sortMoves, sortCaptures, alphaBeta, quiescence, iterativeDeepening };
  }
  return { buildEngine };
})();
