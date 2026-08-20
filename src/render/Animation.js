/**
 * 动画管理器
 * 管理逐帧动画，rAF 循环仅在有活跃动画时运行
 */
export class AnimationManager {
  constructor() {
    this.anims = new Map(); // "r,c" -> { type, startTime, duration }
    this.rafId = null;
    this.onUpdate = null; // 每帧回调，参数 (now)
  }

  /**
   * 弹出动画 (翻开豆子时)
   */
  addPop(row, col, delay = 0) {
    this.anims.set(`${row},${col}`, {
      type: 'pop',
      startTime: performance.now() + delay,
      duration: 280,
    });
    this._ensureRunning();
  }

  /**
   * 批量弹出 (flood fill 波浪效果)
   * @param {Array<{row, col, distance}>} cells
   */
  addPops(cells) {
    const base = performance.now();
    for (const c of cells) {
      this.anims.set(`${c.row},${c.col}`, {
        type: 'pop',
        startTime: base + c.distance * 35,
        duration: 280,
      });
    }
    this._ensureRunning();
  }

  /**
   * 爆炸动画 (踩雷时)
   */
  addExplode(row, col) {
    this.anims.set(`${row},${col}`, {
      type: 'explode',
      startTime: performance.now(),
      duration: 500,
    });
    this._ensureRunning();
  }

  /**
   * Bean Boom 脉冲 (正确旗引爆时，旗帜豆子放大弹跳)
   * @param {number} delay - 延迟（ms），用于级联阶梯效果
   */
  addBoom(row, col, delay = 0) {
    this.anims.set(`${row},${col}`, {
      type: 'boom',
      startTime: performance.now() + delay,
      duration: 450,
    });
    this._ensureRunning();
  }

  /**
   * 胜利庆祝动画 (所有豆子波浪弹跳)
   */
  addVictory(rows, cols) {
    const base = performance.now();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const dist = r + c;
        this.anims.set(`${r},${c}`, {
          type: 'victory',
          startTime: base + dist * 25,
          duration: 700,
        });
      }
    }
    this._ensureRunning();
  }

  /**
   * 获取某格的当前动画状态
   * @returns {{ type: string, t: number, scale: number, alpha: number } | null}
   */
  getAnim(row, col) {
    const anim = this.anims.get(`${row},${col}`);
    if (!anim) return null;

    const now = performance.now();
    const elapsed = now - anim.startTime;

    if (elapsed < 0) {
      // 延迟未到，显示 scale=0 (隐藏)
      return { type: anim.type, t: 0, scale: 0, alpha: 1 };
    }

    const t = elapsed / anim.duration;
    if (t >= 1) {
      this.anims.delete(`${row},${col}`);
      return null; // 动画结束
    }

    // 计算缓动后的 scale 和 alpha
    let scale = 1, alpha = 1;
    if (anim.type === 'pop') {
      // easeOutBack: 0 → 1 带回弹
      const c1 = 1.70158;
      const c3 = c1 + 1;
      scale = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    } else if (anim.type === 'explode') {
      scale = 1 + t * 0.6;
      alpha = 1 - t * 0.7;
    } else if (anim.type === 'boom') {
      // 先胀大再回弹的脉冲
      scale = 1 + Math.sin(t * Math.PI) * 0.5;
    } else if (anim.type === 'victory') {
      scale = 1 + Math.sin(t * Math.PI) * 0.18;
    }

    return { type: anim.type, t, scale, alpha };
  }

  _ensureRunning() {
    if (this.rafId) return;
    const loop = () => {
      const now = performance.now();
      // 清理已完成的动画
      for (const [key, anim] of this.anims) {
        if (now - anim.startTime >= anim.duration) {
          this.anims.delete(key);
        }
      }
      this.onUpdate?.(now);
      if (this.anims.size > 0) {
        this.rafId = requestAnimationFrame(loop);
      } else {
        this.rafId = null;
        // 最后渲染一帧确保状态干净
        this.onUpdate?.(now);
      }
    };
    this.rafId = requestAnimationFrame(loop);
  }

  clear() {
    this.anims.clear();
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  hasActive() {
    return this.anims.size > 0;
  }
}
