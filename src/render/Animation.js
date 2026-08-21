/**
 * 动画管理器
 * 管理逐帧动画，rAF 循环仅在有活跃动画时运行
 * Phase 4：支持注册依赖系统（粒子 / 震屏），共享同一条 rAF 循环
 */
export class AnimationManager {
  constructor() {
    this.anims = new Map(); // "r,c" -> { type, startTime, duration }
    this.rafId = null;
    this.onUpdate = null; // 每帧回调，参数 (now)
    this.dependencies = []; // [{ update(dt), hasActive(), clear() }]
    this.lastFrameTime = null;
  }

  /**
   * 注册依赖系统（粒子、震屏等），统一由本管理器的 rAF 循环驱动
   * @param {{ update: function, hasActive: function, clear?: function }} dep
   */
  register(dep) {
    if (!this.dependencies.includes(dep)) this.dependencies.push(dep);
  }

  /** 外部触发动画/粒子时唤醒渲染循环 */
  wake() {
    this._ensureRunning();
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
      const dt = this.lastFrameTime == null ? 16.7 : now - this.lastFrameTime;
      this.lastFrameTime = now;
      // 清理已完成的动画
      for (const [key, anim] of this.anims) {
        if (now - anim.startTime >= anim.duration) {
          this.anims.delete(key);
        }
      }
      // Phase 4：更新依赖系统（粒子等）
      for (const dep of this.dependencies) {
        dep.update?.(dt);
      }
      this.onUpdate?.(now);
      const depsActive = this.dependencies.some((d) => d.hasActive?.());
      if (this.anims.size > 0 || depsActive) {
        this.rafId = requestAnimationFrame(loop);
      } else {
        this.rafId = null;
        this.lastFrameTime = null;
        // 最后渲染一帧确保状态干净
        this.onUpdate?.(now);
      }
    };
    this.lastFrameTime = null;
    this.rafId = requestAnimationFrame(loop);
  }

  clear() {
    this.anims.clear();
    for (const dep of this.dependencies) {
      dep.clear?.();
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
      this.lastFrameTime = null;
    }
  }

  hasActive() {
    return this.anims.size > 0 || this.dependencies.some((d) => d.hasActive?.());
  }
}
