/**
 * 计分系统（设计文档概念 D：连击 / 模式评分 · Phase 1）
 *
 * - 计分事件：普通揭开 10×s/格、Opening 惊喜 格数×20×s、Chord 揭格×15×s（≥4格翻倍）
 * - 连击：每次安全揭开 +1，两次揭开间隔 > 3s 清零；倍率 s(k) = 1 + 0.1×min(k,20)
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
  }

  /** 当前连击倍率 s(k) */
  multiplier() {
    return 1 + 0.1 * Math.min(this.combo, 20);
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
    return 1 + 0.1 * Math.min(this.displayCombo(), 20);
  }

  /**
   * 揭开事件计分
   * @param {number} cells 本次揭开的格数
   * @param {'reveal'|'chord'} type 事件类型
   * @returns {{ gained: number, milestone?: string, label?: 'greatOpening'|'perfectChord' }}
   */
  onReveal(cells, type = 'reveal') {
    if (cells <= 0) return { gained: 0 };
    const now = performance.now();

    // 连击窗口超时 → 清零
    if (this.lastRevealAt && now - this.lastRevealAt > SCORE_CONFIG.COMBO_WINDOW_MS) {
      this.combo = 0;
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
    const s = this.multiplier();

    let gained = 0;
    if (eventType === 'opening') {
      gained = Math.round(cells * 20 * s);
    } else if (eventType === 'chord') {
      gained = Math.round(cells * 15 * s * (cells >= 4 ? 2 : 1));
      if (cells >= 4) label = 'perfectChord';
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

    return { gained, milestone, label };
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
