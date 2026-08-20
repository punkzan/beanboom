/**
 * 服务端重放器（反作弊核心）
 *
 * 用客户端提交的对局日志（地雷种子 + 操作序列 + 时间戳）重建棋盘并逐操作重放，
 * 与客户端共用同一套 Game/ScoreSystem 核心逻辑，重算结果为唯一真相：
 * - 验证游戏确实以胜利结束（伪造胜利直接拒绝）
 * - 重算最终得分与段位（篡改得分无效，挑战指标以服务端值为准）
 * - 重算对局时长（排行榜时间校验）
 */

import { Game } from '../../src/core/Game.js';
import { ScoreSystem } from '../../src/core/ScoreSystem.js';

const MAX_ACTIONS = 50000;

/**
 * 重放一局游戏
 * @param {object} log { difficulty, seed, actions: [{op, r, c, t}] }
 * @returns {{ok: boolean, reason?: string, won?: boolean, durationSeconds?: number, score?: number, rank?: string, actionCount?: number}}
 */
export function replayGame(log) {
  if (!log || typeof log !== 'object') return { ok: false, reason: 'missing log' };
  const { difficulty, seed, actions } = log;
  if (!['easy', 'medium', 'hard'].includes(difficulty)) return { ok: false, reason: 'invalid difficulty' };
  if (!Number.isInteger(seed) || seed < 0 || seed > 0x7fffffff) return { ok: false, reason: 'invalid seed' };
  if (!Array.isArray(actions) || actions.length === 0) return { ok: false, reason: 'empty actions' };
  if (actions.length > MAX_ACTIONS) return { ok: false, reason: 'too many actions' };

  const game = new Game(difficulty);
  game.mineSeed = seed;

  // 重放时钟：ScoreSystem 的连击窗口判定用日志时间戳（与客户端同记一次 performance 时基）
  let curT = 0;
  const score = new ScoreSystem(() => curT);

  // FEVER 同步（与 InputHandler flag 前钩子语义一致）
  const syncFever = () => {
    game.feverActive = score.isFever && !score.comboExpired();
  };

  let firstT = null;
  let lastT = null;

  for (const a of actions) {
    if (!a || typeof a.op !== 'string' || !Number.isInteger(a.r) || !Number.isInteger(a.c)) {
      return { ok: false, reason: 'invalid action' };
    }
    if (typeof a.t !== 'number' || !isFinite(a.t)) return { ok: false, reason: 'invalid action time' };
    if (lastT !== null && a.t < lastT) return { ok: false, reason: 'non-monotonic time' };
    curT = a.t;
    if (firstT === null) firstT = a.t;
    lastT = a.t;

    if (a.op === 'reveal') {
      const result = game.reveal(a.r, a.c);
      if (result.exploded) return { ok: true, won: false, reason: 'exploded' };
      if (result.revealedCells.length > 0) {
        score.onReveal(result.revealedCells.length, 'reveal');
        syncFever();
      }
    } else if (a.op === 'flag') {
      syncFever();
      const result = game.toggleFlag(a.r, a.c);
      if (result && result.boom) {
        if (result.boom.revealedCells.length > 0) {
          score.onReveal(result.boom.revealedCells.length, 'boom');
          syncFever();
        }
      }
    } else if (a.op === 'chord') {
      // chord 语义（镜像 InputHandler.chord：旗数=数字时展开周围未旗格）
      const cell = game.getCell(a.r, a.c);
      if (!cell || !cell.isRevealed || cell.neighborCount === 0) continue;
      const neighbors = game.getNeighbors(a.r, a.c);
      const flagCount = neighbors.filter(n => n.isFlagged).length;
      if (flagCount !== cell.neighborCount) continue;
      let allRevealed = 0;
      let exploded = false;
      for (const n of neighbors) {
        if (!n.isFlagged && !n.isRevealed) {
          const result = game.reveal(n.row, n.col);
          if (result.exploded) { exploded = true; break; }
          allRevealed += result.revealedCells.length;
        }
      }
      if (exploded) return { ok: true, won: false, reason: 'exploded' };
      if (allRevealed > 0) {
        score.onReveal(allRevealed, 'chord');
        syncFever();
      }
    } else {
      return { ok: false, reason: 'unknown op: ' + a.op };
    }
  }

  const durationMs = firstT !== null && lastT !== null ? lastT - firstT : 0;
  const durationSeconds = Math.max(1, Math.floor(durationMs / 1000));
  const settlement = score.settle(difficulty, durationSeconds, game.playerCorrectFlags || 0);
  return {
    ok: true,
    won: game.gameState === 'won',
    durationSeconds,
    score: settlement.finalScore,
    rank: settlement.rank,
    actionCount: actions.length,
  };
}

/** 段位等级（S 最高），用于 rank 型挑战判定 */
export const RANK_ORDER = { S: 0, A: 1, B: 2, C: 3 };

/**
 * 按挑战 metric 判定本局是否计入进度
 * @param {{metric?: string, metricValue?: number|string}} challenge
 * @param {{won: boolean, score: number, rank: string}} replay
 */
export function metricAchieved(challenge, replay) {
  const metric = challenge.metric || 'wins';
  if (metric === 'score') {
    const target = Number(challenge.metricValue) || 0;
    return replay.score >= target;
  }
  if (metric === 'rank') {
    const target = RANK_ORDER[challenge.metricValue] ?? 9;
    const actual = RANK_ORDER[replay.rank] ?? 9;
    return actual <= target;
  }
  return true; // wins 型：重放已验证胜利
}
