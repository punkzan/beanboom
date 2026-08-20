/**
 * 反作弊重放器单测（Node 直接运行，ESM）
 *
 * 核心承诺：服务端 replayGame(日志) 与客户端（Game + ScoreSystem + 同步时钟）逐位一致。
 * 模拟客户端用「作弊求解器」（直接读 isMine）保证必胜，产出的日志即正常客户端日志。
 *
 * 运行：node test-anticheat.mjs
 */

import { Game } from './src/core/Game.js';
import { ScoreSystem } from './src/core/ScoreSystem.js';
import { replayGame, metricAchieved, RANK_ORDER } from './functions/lib/replay.js';

let passed = 0;
let failed = 0;

function assert(cond, name, detail = '') {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? '  [' + detail + ']' : ''}`);
  }
}

/**
 * 模拟一个诚实客户端打完一整局（镜像 InputHandler/main.js 的调用语义）：
 * step 推进模拟时钟 → record 记日志 → 调 Game API → onReveal 计分 → syncFever。
 * 求解器作弊读 isMine 只是为了保证必胜，调用顺序与真实客户端一致。
 */
function playClient(difficulty, seed) {
  const game = new Game(difficulty);
  game.mineSeed = seed;
  let t = 1000;
  const score = new ScoreSystem(() => t);
  const actions = [];
  const syncFever = () => {
    game.feverActive = score.isFever && !score.comboExpired();
  };

  const step = (ms) => { t += ms; };
  const record = (op, r, c) => actions.push({ op, r, c, t });

  // 首揭（中心，排除区保证安全）
  const rows = game.rows;
  const cols = game.cols;
  const r0 = Math.floor(rows / 2);
  const c0 = Math.floor(cols / 2);
  step(200);
  record('reveal', r0, c0);
  const first = game.reveal(r0, c0);
  if (first.exploded) throw new Error('first reveal exploded?!');
  if (first.revealedCells.length > 0) score.onReveal(first.revealedCells.length, 'reveal');
  syncFever();

  // 插 3 面旗（触发 Bean Boom 爆破 + 可能的 FEVER 路径）
  let flagged = 0;
  for (let r = 0; r < rows && flagged < 3; r++) {
    for (let c = 0; c < cols && flagged < 3; c++) {
      const cell = game.grid[r][c];
      if (cell.isMine && !cell.isFlagged) {
        step(150 + flagged * 120);
        syncFever();
        record('flag', r, c);
        const fr = game.toggleFlag(r, c);
        if (fr && fr.boom && fr.boom.revealedCells.length > 0) {
          score.onReveal(fr.boom.revealedCells.length, 'boom');
        }
        syncFever();
        flagged++;
      }
    }
  }

  // 翻开所有剩余安全格（扫描序，确定性）
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (game.gameState !== 'playing') break;
      const cell = game.grid[r][c];
      if (!cell.isMine && !cell.isRevealed && !cell.isFlagged) {
        step(120 + ((r + c) % 5) * 60);
        record('reveal', r, c);
        const rr = game.reveal(r, c);
        if (rr.exploded) throw new Error('solver hit a mine?!');
        if (rr.revealedCells.length > 0) score.onReveal(rr.revealedCells.length, 'reveal');
        syncFever();
      }
    }
  }

  const durationSeconds = Math.max(1, Math.floor((actions[actions.length - 1].t - actions[0].t) / 1000));
  const settlement = score.settle(difficulty, durationSeconds, game.playerCorrectFlags || 0);
  return {
    log: { difficulty, seed, actions },
    clientWon: game.gameState === 'won',
    settlement,
    durationSeconds,
    game,
  };
}

// ---------------------------------------------------------------------------
console.log('\n[1] 正常对局：重放与客户端逐位一致');
{
  const { log, clientWon, settlement, durationSeconds } = playClient('easy', 1234567);
  assert(clientWon, '客户端确实胜利');
  const rep = replayGame(log);
  assert(rep.ok, '重放结构合法', rep.reason);
  assert(rep.won === true, '重放判定胜利');
  assert(rep.score === settlement.finalScore,
    `得分逐位一致 (server=${rep.score} client=${settlement.finalScore})`);
  assert(rep.rank === settlement.rank, `段位一致 (server=${rep.rank} client=${settlement.rank})`);
  assert(rep.durationSeconds === durationSeconds,
    `时长一致 (server=${rep.durationSeconds}s client=${durationSeconds}s)`);
  globalThis.__validLog = log;
  globalThis.__validReplay = rep;
}

console.log('\n[2] 中等难度 + FEVER 路径');
{
  const { log, clientWon, settlement } = playClient('medium', 424242);
  assert(clientWon, '客户端胜利 (medium)');
  const rep = replayGame(log);
  assert(rep.ok && rep.won, '重放胜利 (medium)', rep.reason);
  assert(rep.score === settlement.finalScore, `得分一致 (server=${rep.score} client=${settlement.finalScore})`);
  assert(rep.rank === settlement.rank, `段位一致 (${rep.rank})`);
}

console.log('\n[3] 伪造胜利（日志不完整 / 空日志 / 缺字段）');
{
  const log = globalThis.__validLog;
  // 截断日志：只提交前 5 个操作就宣称胜利
  const truncated = { ...log, actions: log.actions.slice(0, 5) };
  const rep = replayGame(truncated);
  assert(rep.ok && rep.won === false, '截断日志不判胜 (won=' + rep.won + ')');
  // 空 actions
  const empty = { ...log, actions: [] };
  assert(replayGame(empty).ok === false, '空日志拒绝');
  // 缺 seed
  const noSeed = { difficulty: 'easy', actions: log.actions };
  assert(replayGame(noSeed).ok === false, '缺 seed 拒绝');
  // 非法难度
  assert(replayGame({ ...log, difficulty: 'impossible' }).ok === false, '非法难度拒绝');
  // 非法 seed
  assert(replayGame({ ...log, seed: -1 }).ok === false, '负 seed 拒绝');
  assert(replayGame({ ...log, seed: 1.5 }).ok === false, '非整数 seed 拒绝');
  assert(replayGame(null).ok === false, 'null 日志拒绝');
}

console.log('\n[4] 篡改操作（改坐标到地雷格 → 重放爆炸）');
{
  const { log, game } = playClient('easy', 777);
  // 找一个未被玩家插旗的地雷坐标（客户端只插了 3 面旗）
  const unflaggedMine = (() => {
    for (let r = 0; r < game.rows; r++)
      for (let c = 0; c < game.cols; c++) {
        const cell = game.grid[r][c];
        if (cell.isMine) return { r, c };
      }
    return null;
  })();
  // 找日志中段的一个 reveal 操作篡改它
  const idx = Math.min(10, log.actions.length - 1);
  const tampered = {
    ...log,
    actions: log.actions.map((a, i) =>
      i === idx ? { ...a, op: 'reveal', r: unflaggedMine.r, c: unflaggedMine.c } : a
    ),
  };
  const rep = replayGame(tampered);
  assert(rep.ok && rep.won === false, '篡改到地雷格被拒 (' + rep.reason + ')');
}

console.log('\n[5] 直接踩雷对局（两步爆炸）');
{
  // 用本地 Game 算出雷位，构造一个「首揭后立刻踩雷」的日志
  const g = new Game('easy');
  g.mineSeed = 999;
  g.reveal(4, 4); // 放雷（排除区，安全）
  const mine = (() => {
    for (let r = 0; r < g.rows; r++)
      for (let c = 0; c < g.cols; c++) if (g.grid[r][c].isMine) return { r, c };
  })();
  const rep = replayGame({
    difficulty: 'easy',
    seed: 999,
    actions: [
      { op: 'reveal', r: 4, c: 4, t: 1000 },
      { op: 'reveal', r: mine.r, c: mine.c, t: 1500 },
    ],
  });
  assert(rep.ok && rep.won === false && rep.reason === 'exploded', '踩雷日志 won=false exploded');
}

console.log('\n[6] 日志格式攻击（非单调时间 / 未知操作 / 超长）');
{
  const log = globalThis.__validLog;
  // 非单调时间：把第 3 个操作的时间戳改到未来之后
  const nonMono = {
    ...log,
    actions: log.actions.map((a, i) => (i === 2 ? { ...a, t: log.actions[log.actions.length - 1].t + 100 } : a)),
  };
  assert(replayGame(nonMono).ok === false, '非单调时间拒绝');
  // 未知操作
  const badOp = { ...log, actions: log.actions.map((a, i) => (i === 1 ? { ...a, op: 'nuke' } : a)) };
  assert(replayGame(badOp).ok === false, '未知操作拒绝');
  // 坐标非整数
  const badCoord = { ...log, actions: log.actions.map((a, i) => (i === 1 ? { ...a, r: 1.5 } : a)) };
  assert(replayGame(badCoord).ok === false, '非整数坐标拒绝');
  // 超长日志
  const huge = { ...log, actions: new Array(50001).fill({ op: 'reveal', r: 0, c: 0, t: 1 }) };
  assert(replayGame(huge).ok === false, '超长日志拒绝');
}

console.log('\n[7] metricAchieved 判定（挑战指标）');
{
  const rep = globalThis.__validReplay; // 真实重放结果
  const ch = (metric, metricValue) => ({ metric, metricValue });
  // wins 型：重放已验证胜利 → 恒计进度
  assert(metricAchieved(ch('wins', 3), rep) === true, 'wins 型计进度');
  assert(metricAchieved({}, rep) === true, '无 metric 字段默认 wins（向后兼容）');
  // score 型：服务端重算分数为准
  assert(metricAchieved(ch('score', rep.score), rep) === true, 'score 达标 (==)');
  assert(metricAchieved(ch('score', rep.score - 1), rep) === true, 'score 达标 (>)');
  assert(metricAchieved(ch('score', rep.score + 1), rep) === false, 'score 未达标');
  // rank 型：S>A>B>C，实际段位 ≤ 目标序值即达标
  const myRank = rep.rank;
  assert(metricAchieved(ch('rank', myRank), rep) === true, `rank 达标 (=${myRank})`);
  // 用合成重放结果覆盖完整段位矩阵
  const syn = (rank) => ({ won: true, score: 0, rank });
  assert(metricAchieved(ch('rank', 'S'), syn('S')) === true, 'rank S 达 S');
  assert(metricAchieved(ch('rank', 'A'), syn('S')) === true, 'rank S 达 A（超出目标）');
  assert(metricAchieved(ch('rank', 'S'), syn('A')) === false, 'rank A 不达 S');
  assert(metricAchieved(ch('rank', 'A'), syn('B')) === false, 'rank B 不达 A');
  assert(metricAchieved(ch('rank', 'B'), syn('C')) === false, 'rank C 不达 B');
  console.log(`        (本局重算 score=${rep.score} rank=${rep.rank})`);
}

// ---------------------------------------------------------------------------
console.log(`\n结果: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
