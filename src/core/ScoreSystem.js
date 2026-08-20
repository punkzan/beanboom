/**
 * 计分系统（概念 D：连击 / 模式评分）
 *
 * - 计分事件：普通揭开 10×s/格、Opening 惊喜 格数×20×s、Chord 揭格×15×s（≥4格翻倍）、
 *   Bean Boom 揭格×25×s（概念 A · Phase 2，爆炸即 combo 引擎）
 * - 连击：每次安全揭开 +1，两次揭开间隔 > 3s 清零；倍率 s(k) = 1 + 0.1×min(k,20)
 * - FEVER（概念 A/D 联动 · Phase 3）：连击 k≥20 激活，倍率上限提升至 4.0（cap k=30），
 *   同时赋予 blast 半径 +1（由 Game.js 读取 feverActive 实现）
 * - 结算：FinalScore = floor(Σ事件分 × T) × 难度系数，T = clamp(par_time/实际用时, 1, 2)
 *   另加 玩家正确 flag 数 × 50（胜利时）
 * - 段位：S/A/B/C 按难度阈值
 */

export const SCORE_CONFIG = {
  COMBO_WINDOW_MS: 3000,
  PAR_TIME: { easy: 60, medium: 240, hard: 600 }, // 秒
  DIFF_COEF: { easy: 0.6, medium: 1.0, hard: 1.6 },
  RANK_THRESHOLDS: {
    easy:   { S: 4000,  A: 2000, B: 800 },
    medium: { S: 12000, A: 6000, B: 2500 },
    hard:   { S: 30000, A: 15000, B: 6000 },
  },
};

// 里程碑：连击数 → 演出标签
const COMBO_MILESTONES = { 5: 'nice', 10: 'great', 15: 'amazing', 20: 'fever' };
const MILESTONE_KEYS_DESC = [20, 15, 10, 5];

export class ScoreSystem {
  constructor() {
    this.reset();
  }

  reset() {
    this.rawScore = 0;       // Σ事件分（未乘结算倍率）
    this.combo = 0;          // 连击计数 k
    this.maxCombo = 0;
    this.lastRevealAt = 0;   // 上次揭开时间戳（ms）
    this.firstRevealDone = false;
    this.shownMilestones = new Set();
    this.isFever = false;    // FEVER 模式（Phase 3：A/D 联动）
  }

  /** 当前连击倍率 s(k)。FEVER 时上限提升至 4.0（cap k=30） */
  multiplier() {
    const cap = this.isFever ? 30 : 20;
    return 1 + 0.1 * Math.min(this.combo, cap);
  }

  /** 连击窗口是否已超时 */
  comboExpired() {
    return this.lastRevealAt > 0 && performance.now() - this.lastRevealAt > SCORE_CONFIG.COMBO_WINDOW_MS;
  }

  /** UI 展示用的连击数（超时视为 0） */
  displayCombo() {
    return this.comboExpired() ? 0 : this.combo;
  }

  displayMultiplier() {
    const dc = this.displayCombo();
    if (dc === 0) return 1.0;
    const cap = this.isFever ? 30 : 20;
    return 1 + 0.1 * Math.min(dc, cap);
  }

  /** FEVER 是否当前生效（连击未过期时） */
  displayFever() {
    return this.isFever && !this.comboExpired();
  }

  /**
   * 揭开事件计分
   * @param {number} cells 本次揭开的格数
   * @param {'reveal'|'chord'|'boom'} type 事件类型
   * @returns {{ gained: number, milestone?: string, label?: 'greatOpening'|'perfectChord'|'beanBoom', feverActivated?: boolean }}
   */
  onReveal(cells, type = 'reveal') {
    if (cells <= 0) return { gained: 0 };
    const now = performance.now();

    // 连击窗口超时 → 清零（含 FEVER）
    if (this.lastRevealAt && now - this.lastRevealAt > SCORE_CONFIG.COMBO_WINDOW_MS) {
      this.combo = 0;
      this.isFever = false;
    }
    this.lastRevealAt = now;

    // Opening 惊喜：首揭 flood-fill ≥ 8 格
    let eventType = type;
    let label = null;
    if (!this.firstRevealDone) {
      this.firstRevealDone = true;
      if (cells >= 8) {
        eventType = 'opening';
        label = 'greatOpening';
      }
    }

    // 连击计数：每次安全揭开 +1
    this.combo += cells;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    // FEVER 激活（A/D 联动 · Phase 3）：k≥20 时进入 FEVER，倍率上限 3.0→4.0
    let feverActivated = false;
    if (this.combo >= 20 && !this.isFever) {
      this.isFever = true;
      feverActivated = true;
    }

    const s = this.multiplier();

    let gained = 0;
    if (eventType === 'opening') {
      gained = Math.round(cells * 20 * s);
    } else if (eventType === 'chord') {
      gained = Math.round(cells * 15 * s * (cells >= 4 ? 2 : 1));
      if (cells >= 4) label = 'perfectChord';
    } else if (eventType === 'boom') {
      // Bean Boom：全事件最高单价，揭格 ≥5 时弹出标签
      gained = Math.round(cells * 25 * s);
      if (cells >= 5) label = 'beanBoom';
    } else {
      gained = Math.round(cells * 10 * s);
    }
    this.rawScore += gained;

    // 里程碑演出（跨过阈值时触发一次，取最高档）
    let milestone = null;
    for (const k of MILESTONE_KEYS_DESC) {
      if (this.combo >= k && !this.shownMilestones.has(k)) {
        this.shownMilestones.add(k);
        if (!milestone) milestone = COMBO_MILESTONES[k];
      }
    }

    return { gained, milestone, label, feverActivated };
  }

  /**
   * 胜利结算（纯计算，不修改状态）
   * @param {string} difficulty
   * @param {number} elapsedSeconds 实际用时（秒）
   * @param {number} playerCorrectFlags 玩家自己插上的正确旗数
   * @returns {{ finalScore: number, timeMultiplier: number, rank: string }}
   */
  settle(difficulty, elapsedSeconds, playerCorrectFlags) {
    const total = this.rawScore + playerCorrectFlags * 50;
    const par = SCORE_CONFIG.PAR_TIME[difficulty] || 60;
    const T = Math.min(2, Math.max(1, par / Math.max(1, elapsedSeconds)));
    const coef = SCORE_CONFIG.DIFF_COEF[difficulty] || 1;
    const finalScore = Math.floor(Math.floor(total * T) * coef);
    return {
      finalScore,
      timeMultiplier: T,
      rank: this.rank(difficulty, finalScore),
    };
  }

  rank(difficulty, finalScore) {
    const th = SCORE_CONFIG.RANK_THRESHOLDS[difficulty];
    if (!th) return 'C';
    if (finalScore >= th.S) return 'S';
    if (finalScore >= th.A) return 'A';
    if (finalScore >= th.B) return 'B';
    return 'C';
  }
}
