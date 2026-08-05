import { COLORS, CELL_SIZE, PEG_RADIUS, BEAD_RADIUS } from '../constants.js';

/**
 * 绘制拼豆板背景 (渐变底板 + 深度插孔点阵)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} rows
 * @param {number} cols
 * @param {number} cellSize
 * @param {number} pegRadius
 */
export function drawBoardBackground(ctx, rows, cols, cellSize = CELL_SIZE, pegRadius = PEG_RADIUS) {
  const w = cols * cellSize;
  const h = rows * cellSize;

  // 底板 - 垂直渐变
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, COLORS.BOARD_BG_TOP);
  grad.addColorStop(1, COLORS.BOARD_BG_BOTTOM);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // 插孔点阵 - 模拟真实孔洞 (外圈暗 + 中心深)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * cellSize + cellSize / 2;
      const cy = r * cellSize + cellSize / 2;

      ctx.beginPath();
      ctx.arc(cx, cy, pegRadius + 0.5, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.PEG_HOLE;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(pegRadius - 0.5, 0.5), 0, Math.PI * 2);
      ctx.fillStyle = COLORS.PEG_HOLE_INNER;
      ctx.fill();
    }
  }
}

/**
 * 绘制单个空白格 (已揭开 - 凹陷质感 + 淡入动画)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - 中心 X
 * @param {number} y - 中心 Y
 * @param {number} cellSize
 * @param {object|null} anim - 动画状态
 */
export function drawEmptyCell(ctx, x, y, cellSize = CELL_SIZE, anim) {
  const r = Math.max(8, cellSize * 0.42);
  let alpha = 1;
  if (anim) {
    alpha = anim.scale === 0 ? 0 : Math.min(1, anim.t * 1.5);
  }
  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  // 凹陷圆 - 径向渐变
  const grad = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, r);
  grad.addColorStop(0, COLORS.CELL_EMPTY);
  grad.addColorStop(0.7, COLORS.CELL_EMPTY);
  grad.addColorStop(1, COLORS.CELL_EMPTY_SHADOW);

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // 内边缘阴影线
  ctx.beginPath();
  ctx.arc(x, y, r - 0.5, Math.PI * 0.8, Math.PI * 2.2);
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}
