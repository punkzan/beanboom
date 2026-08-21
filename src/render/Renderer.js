import { CELL_SIZE, BEAD_RADIUS, DIFFICULTIES, RESPONSIVE } from '../constants.js';
import { drawBoardBackground, drawEmptyCell } from './BoardRenderer.js';
import { drawBead } from './Bead.js';

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {string} difficulty
   */
  constructor(canvas, difficulty = 'easy') {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.difficulty = difficulty;
    this.particles = null; // ParticleSystem（Phase 4，可选）
    this.setupCanvas();
  }

  /** 挂载粒子系统（Phase 4 动效） */
  setParticles(particleSystem) {
    this.particles = particleSystem;
  }

  /** 切换难度并重新设置 canvas */
  setDifficulty(difficulty) {
    this.difficulty = difficulty;
    this.setupCanvas();
  }

  /**
   * 根据屏幕宽度计算合适的 cellSize
   */
  calcCellSize() {
    const config = DIFFICULTIES[this.difficulty];
    const availWidth = window.innerWidth - RESPONSIVE.SCREEN_PADDING;
    const availHeight = window.innerHeight - 200; // 减去顶部状态栏+padding
    const maxByWidth = Math.floor(availWidth / config.cols);
    const maxByHeight = Math.floor(availHeight / config.rows);
    let size = Math.min(maxByWidth, maxByHeight, RESPONSIVE.MAX_CELL);
    return Math.max(size, RESPONSIVE.MIN_CELL);
  }

  setupCanvas() {
    const config = DIFFICULTIES[this.difficulty];
    this.rows = config.rows;
    this.cols = config.cols;
    this.cellSize = this.calcCellSize();
    this.beadRadius = Math.max(8, Math.round(this.cellSize * 0.42));
    this.pegRadius = Math.max(1, Math.round(this.cellSize * 0.05));

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = this.cols * this.cellSize;
    const cssHeight = this.rows * this.cellSize;

    this.canvas.style.width = cssWidth + 'px';
    this.canvas.style.height = cssHeight + 'px';
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);

    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
  }

  /**
   * 窗口尺寸变化时重新设置 canvas
   */
  resize() {
    this.setupCanvas();
  }

  /**
   * 渲染整个棋盘
   * @param {Array<Array<object>>} grid
   * @param {AnimationManager|null} animManager - 动画管理器
   */
  render(grid, animManager) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    ctx.save();

    // 1. 画底板
    drawBoardBackground(ctx, this.rows, this.cols, this.cellSize, this.pegRadius);

    // 2. 画空白格 (先画，在豆子下面)
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = grid[r][c];
        if (cell.isRevealed && !cell.isMine && cell.neighborCount === 0) {
          const cx = c * this.cellSize + this.cellSize / 2;
          const cy = r * this.cellSize + this.cellSize / 2;
          const anim = animManager ? animManager.getAnim(r, c) : null;
          drawEmptyCell(ctx, cx, cy, this.cellSize, anim);
        }
      }
    }

    // 3. 画豆子
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = grid[r][c];
        if (cell.isRevealed && !cell.isMine && cell.neighborCount === 0) {
          continue; // 空白格已处理
        }
        const cx = c * this.cellSize + this.cellSize / 2;
        const cy = r * this.cellSize + this.cellSize / 2;
        const anim = animManager ? animManager.getAnim(r, c) : null;
        drawBead(ctx, cx, cy, cell, anim, this.cellSize, this.beadRadius);
      }
    }

    // 4. 画粒子（最上层，跟随震屏坐标系）
    if (this.particles) this.particles.render(ctx);

    ctx.restore();
  }

  /**
   * 将屏幕坐标转换为网格坐标
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{row: number, col: number} | null}
   */
  screenToGrid(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);

    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      return null;
    }
    return { row, col };
  }
}
