/**
 * 轻量级 Canvas 粒子系统（Phase 4 动效打磨）
 * 四种粒子类型：
 *   - spark    小火花：快速扩散 + 淡出（boom 引爆 / combo 里程碑）
 *   - debris   爆炸碎片：带重力下落（踩雷时）
 *   - ring     冲击波环：径向扩张圆环（Bean Boom 爆心）
 *   - confetti 纸屑：旋转飘落（胜利庆祝）
 *
 * 粒子坐标系与棋盘渲染坐标系一致（CSS 像素，左上原点），
 * 由 Renderer 在棋盘绘制完成后调用 render(ctx) 绘制。
 */
export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.maxParticles = 500; // 性能上限：超出时丢弃最旧的
  }

  /**
   * 生成一簇火花（快速扩散的小圆点）
   * @param {number} x - 中心 X（棋盘坐标）
   * @param {number} y - 中心 Y
   * @param {object} [opts]
   * @param {number} [opts.count=14] 数量
   * @param {string[]} [opts.colors] 候选颜色池
   * @param {number} [opts.speed=140] 初始径向速度 px/s
   * @param {number} [opts.life=500] 生命周期 ms
   * @param {number} [opts.size=3] 粒子半径 px
   */
  burstSparks(x, y, opts = {}) {
    const count = opts.count ?? 14;
    const colors = opts.colors ?? ['#ffd93d', '#ff6b4a', '#fff3b0'];
    const speed = opts.speed ?? 140;
    const life = opts.life ?? 500;
    const size = opts.size ?? 3;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this._add({
        type: 'spark',
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        gravity: 60,
        drag: 0.985,
        life: life * (0.6 + Math.random() * 0.6),
        maxLife: life,
        size: size * (0.6 + Math.random() * 0.7),
        color: colors[(Math.random() * colors.length) | 0],
      });
    }
  }

  /**
   * 生成爆炸碎片（小方块带重力下落）
   * @param {number} x
   * @param {number} y
   * @param {object} [opts]
   * @param {number} [opts.count=18] 数量
   * @param {string[]} [opts.colors] 候选颜色池
   * @param {number} [opts.speed=220] 初始径向速度 px/s
   */
  burstDebris(x, y, opts = {}) {
    const count = opts.count ?? 18;
    const colors = opts.colors ?? ['#3a3a3a', '#e24b4a', '#6a6a6a', '#8a1a1a'];
    const speed = opts.speed ?? 220;
    for (let i = 0; i < count; i++) {
      // 向上偏置的抛射角，更像炸开
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6;
      const v = speed * (0.4 + Math.random() * 0.9);
      this._add({
        type: 'debris',
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v - 60,
        gravity: 900,
        drag: 0.99,
        life: 900 * (0.7 + Math.random() * 0.5),
        maxLife: 900,
        size: 2 + Math.random() * 3.5,
        color: colors[(Math.random() * colors.length) | 0],
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 14,
      });
    }
  }

  /**
   * 生成冲击波环（径向扩张的圆环描边）
   * @param {number} x
   * @param {number} y
   * @param {object} [opts]
   * @param {number} [opts.radius=90] 最大扩张半径 px
   * @param {string} [opts.color='#ffd93d'] 环颜色
   * @param {number} [opts.life=450] 生命周期 ms
   * @param {number} [opts.thickness=4] 初始线宽 px
   */
  spawnRing(x, y, opts = {}) {
    this._add({
      type: 'ring',
      x, y,
      vx: 0, vy: 0,
      gravity: 0, drag: 1,
      life: opts.life ?? 450,
      maxLife: opts.life ?? 450,
      size: opts.radius ?? 90,
      color: opts.color ?? '#ffd93d',
      thickness: opts.thickness ?? 4,
    });
  }

  /**
   * 生成纸屑（旋转飘落的彩色矩形，胜利庆祝）
   * @param {number} x - 生成中心 X
   * @param {number} y - 生成中心 Y
   * @param {object} [opts]
   * @param {number} [opts.count=30] 数量
   * @param {number} [opts.spread=120] 水平扩散范围 px
   */
  burstConfetti(x, y, opts = {}) {
    const count = opts.count ?? 30;
    const spread = opts.spread ?? 120;
    const colors = ['#f0997b', '#fac775', '#85b7eb', '#d4537e', '#7f77dd', '#5dcaa5', '#ef9f27'];
    for (let i = 0; i < count; i++) {
      this._add({
        type: 'confetti',
        x: x + (Math.random() - 0.5) * spread * 2,
        y: y + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 60,
        vy: 60 + Math.random() * 120,
        gravity: 160,
        drag: 0.995,
        life: 1600 + Math.random() * 800,
        maxLife: 2400,
        size: 3 + Math.random() * 4,
        color: colors[(Math.random() * colors.length) | 0],
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 10,
        sway: Math.random() * Math.PI * 2, // 水平摆动相位
      });
    }
  }

  _add(p) {
    if (this.particles.length >= this.maxParticles) {
      this.particles.shift(); // 超限时丢弃最旧的，保证帧率
    }
    this.particles.push(p);
  }

  /**
   * 更新所有粒子
   * @param {number} dt - 距上一帧的毫秒数
   */
  update(dt) {
    if (dt <= 0) return;
    const secs = Math.min(dt, 50) / 1000; // clamp 防止切后台回来 dt 过大
    const alive = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += (p.gravity || 0) * secs;
      if (p.drag && p.drag !== 1) {
        const d = Math.pow(p.drag, dt / 16.7);
        p.vx *= d;
        p.vy *= d;
      }
      if (p.type === 'confetti') {
        p.sway += secs * 6; // 左右摆动
        p.x += (p.vx + Math.sin(p.sway) * 40) * secs;
      } else {
        p.x += p.vx * secs;
      }
      p.y += p.vy * secs;
      if (p.vrot) p.rot += p.vrot * secs;
      alive.push(p);
    }
    this.particles = alive;
  }

  /** 绘制所有活跃粒子（在棋盘之上） */
  render(ctx) {
    for (const p of this.particles) {
      const t = 1 - p.life / p.maxLife; // 0 → 1 进度
      ctx.save();
      if (p.type === 'ring') {
        // 冲击波环：半径 easeOut 扩张，线宽与透明度衰减
        const eased = 1 - Math.pow(1 - t, 3);
        const r = Math.max(1, p.size * eased);
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.5, p.thickness * (1 - t));
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === 'confetti') {
        ctx.globalAlpha = Math.min(1, p.life / 600); // 结尾淡出
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size, p.size, p.size * 2);
      } else if (p.type === 'debris') {
        ctx.globalAlpha = Math.min(1, p.life / 400);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        // spark：小圆点淡出
        ctx.globalAlpha = 1 - t * t;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size * (1 - t * 0.5)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  hasActive() {
    return this.particles.length > 0;
  }

  clear() {
    this.particles.length = 0;
  }
}
