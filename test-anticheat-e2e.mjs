/**
 * 端到端反作弊测试：本地 server（端口 3199）的 /api/progress 与 /api/records
 *
 * 用作弊求解器生成合法胜利日志（客户端模拟），验证：
 * - 有效日志通过，响应带服务端重算的 score/rank
 * - 截断日志（伪造胜利）403
 * - 时长不符（伪造排行榜成绩）403
 *
 * 运行前需先启动: PORT=3199 node server/app.js
 */

import { Game } from './src/core/Game.js';
import { ScoreSystem } from './src/core/ScoreSystem.js';

const BASE = 'http://localhost:3199';

/** 与 test-anticheat.mjs 相同的作弊求解器客户端（easy 必胜） */
function playWinningGame(difficulty, seed) {
  const game = new Game(difficulty);
  game.mineSeed = seed;
  let t = 1000;
  const score = new ScoreSystem(() => t);
  const actions = [];
  const syncFever = () => { game.feverActive = score.isFever && !score.comboExpired(); };
  const step = (ms) => { t += ms; };
  const record = (op, r, c) => actions.push({ op, r, c, t });

  step(200);
  record('reveal', Math.floor(game.rows / 2), Math.floor(game.cols / 2));
  const first = game.reveal(Math.floor(game.rows / 2), Math.floor(game.cols / 2));
  if (first.revealedCells.length > 0) score.onReveal(first.revealedCells.length, 'reveal');
  syncFever();

  let flagged = 0;
  for (let r = 0; r < game.rows && flagged < 3; r++) {
    for (let c = 0; c < game.cols && flagged < 3; c++) {
      const cell = game.grid[r][c];
      if (cell.isMine && !cell.isFlagged) {
        step(150 + flagged * 120);
        syncFever();
        record('flag', r, c);
        const fr = game.toggleFlag(r, c);
        if (fr && fr.boom && fr.boom.revealedCells.length > 0) score.onReveal(fr.boom.revealedCells.length, 'boom');
        syncFever();
        flagged++;
      }
    }
  }
  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      if (game.gameState !== 'playing') break;
      const cell = game.grid[r][c];
      if (!cell.isMine && !cell.isRevealed && !cell.isFlagged) {
        step(120 + ((r + c) % 5) * 60);
        record('reveal', r, c);
        const rr = game.reveal(r, c);
        if (rr.revealedCells.length > 0) score.onReveal(rr.revealedCells.length, 'reveal');
        syncFever();
      }
    }
  }
  const durationSeconds = Math.max(1, Math.floor((actions[actions.length - 1].t - actions[0].t) / 1000));
  return { log: { difficulty, seed, actions }, durationSeconds, won: game.gameState === 'won' };
}

let passed = 0, failed = 0;
function assert(cond, name, detail = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? '  [' + detail + ']' : ''}`); }
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

console.log('\n[A] /api/progress 反作弊');
{
  const { log, won } = playWinningGame('easy', 555001);
  assert(won, '模拟客户端胜利');

  // 1. 有效日志 → 200，无参与则 updated:0，但返回重算 score/rank
  const ok = await post('/api/progress', { username: 'e2e-user', difficulty: 'easy', gameLog: log });
  assert(ok.status === 200 && typeof ok.data.score === 'number' && typeof ok.data.rank === 'string',
    `有效日志通过 (score=${ok.data.score} rank=${ok.data.rank})`, JSON.stringify(ok.data));

  // 2. 截断日志（伪造胜利）→ 403
  const cheat = await post('/api/progress', {
    username: 'e2e-cheater', difficulty: 'easy',
    gameLog: { ...log, actions: log.actions.slice(0, 4) },
  });
  assert(cheat.status === 403, `截断日志 403 (${cheat.data.error})`);

  // 3. 伪造 score 字段无效：请求体根本不带 score，服务端只认重算值
  const forged = await post('/api/progress', {
    username: 'e2e-cheater', difficulty: 'easy', score: 999999, gameLog: log,
  });
  assert(forged.status === 200 && forged.data.score !== 999999,
    `伪造 score 字段被忽略 (重算=${forged.data.score})`);
}

console.log('\n[B] /api/records 反作弊');
{
  const { log, durationSeconds } = playWinningGame('easy', 555002);
  const name = 'e2e-' + Date.now();

  // 1. 时长一致 → 接受
  const ok = await post('/api/records', { difficulty: 'easy', time: durationSeconds, name, region: 'CN', gameLog: log });
  assert(ok.status === 200, `有效成绩提交 200 (${JSON.stringify(ok.data).slice(0, 60)})`);

  // 2. 伪造时长（谎报 5 秒速通）→ 403
  const lie = await post('/api/records', { difficulty: 'easy', time: 5, name: name + '-lie', region: 'CN', gameLog: log });
  assert(lie.status === 403 && lie.data.error.includes('时长'), `谎报时长 403 (${lie.data.error})`);

  // 3. 无日志 → 400
  const noLog = await post('/api/records', { difficulty: 'easy', time: durationSeconds, name: name + '-nolog', region: 'CN' });
  assert(noLog.status === 400, `无日志 400 (${noLog.data.error})`);
}

console.log(`\n结果: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
