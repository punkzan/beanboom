/**
 * 对局日志（服务端重算反作弊用）
 *
 * 记录地雷种子 + 完整操作序列 + performance 时基时间戳。
 * 胜利时随进度/排行榜提交，服务端用相同核心逻辑重放重算，验证胜利与指标。
 *
 * 操作语义与 InputHandler 的已解析动作一一对应：
 * - reveal: game.reveal(r, c)
 * - flag:   game.toggleFlag(r, c)
 * - chord:  InputHandler.chord 语义（数字格周围旗数=数字时展开邻居）
 */

export class GameLog {
  constructor() {
    this.reset();
  }

  /** 新开局：记录难度、游戏模式与地雷种子（Game.init 时已生成） */
  start(difficulty, seed, mode = 'egg') {
    this.difficulty = difficulty;
    this.seed = seed;
    this.mode = mode; // 'egg' | 'classic'（服务端重放按模式重建 Game）
    this.startT = performance.now();
    this.actions = [];
  }

  /** 记录一次操作，t 为 performance 时基时间戳 */
  record(op, row, col) {
    this.actions.push({ op, r: row, c: col, t: performance.now() });
  }

  /** 导出提交给服务端的日志（紧凑字段名） */
  export() {
    return {
      difficulty: this.difficulty,
      seed: this.seed,
      mode: this.mode || 'egg',
      actions: this.actions,
    };
  }

  reset() {
    this.difficulty = null;
    this.seed = null;
    this.startT = 0;
    this.actions = [];
  }
}
