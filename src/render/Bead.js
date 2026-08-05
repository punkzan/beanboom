import { COLORS, BEAD_RADIUS } from '../constants.js';

/**
 * 绘制单颗拼豆 (径向渐变 3D 效果 + 动画支持)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - 中心 X 坐标
 * @param {number} y - 中心 Y 坐标
 * @param {object} cell - 单元格数据
 * @param {object|null} anim - 动画状态 { type, t, scale, alpha }
 * @param {number} cellSize - 单元格尺寸
 * @param {number} beadRadius - 豆子半径
 */
export function drawBead(ctx, x, y, cell, anim, cellSize, beadRadius) {
  const r = beadRadius || BEAD_RADIUS;
  const scaleK = r / BEAD_RADIUS; // 图案缩放系数

  if (cell.isRevealed && !cell.isMine && cell.neighborCount === 0) {
    return false;
  }

  let scale = 1, alpha = 1;
  if (anim) {
    scale = anim.scale;
    alpha = anim.alpha;
  }
  if (scale === 0) return false;

  // 确定颜色
  let fillColor, strokeColor, highlightColor, text, textColor;

  if (cell.isFlagged) {
    if (cell.isWrongFlag) {
      fillColor = '#b4b2a9';
      strokeColor = '#888780';
      highlightColor = '#d0cec5';
    } else {
      fillColor = COLORS.FLAG_FILL;
      strokeColor = COLORS.FLAG_STROKE;
      highlightColor = COLORS.FLAG_HIGHLIGHT;
    }
  } else if (cell.isRevealed && cell.isMine) {
    if (cell.isExploded) {
      fillColor = COLORS.MINE_EXPLODED_FILL;
      strokeColor = COLORS.MINE_EXPLODED_STROKE;
      highlightColor = COLORS.MINE_EXPLODED_HIGHLIGHT;
    } else {
      fillColor = COLORS.MINE_FILL;
      strokeColor = COLORS.MINE_STROKE;
      highlightColor = COLORS.MINE_HIGHLIGHT;
    }
  } else if (cell.isRevealed && cell.neighborCount > 0) {
    const idx = cell.neighborCount - 1;
    const nc = COLORS.NUMBER_COLORS[idx] || COLORS.NUMBER_COLORS[7];
    fillColor = nc.fill;
    strokeColor = nc.stroke;
    highlightColor = nc.highlight;
    text = String(cell.neighborCount);
    textColor = nc.text;
  } else {
    fillColor = COLORS.BEAD_HIDDEN;
    strokeColor = COLORS.BEAD_HIDDEN_STROKE;
    highlightColor = COLORS.BEAD_HIGHLIGHT;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (scale !== 1) ctx.scale(scale, scale);

  // === 豆子主体 - 径向渐变 ===
  const grad = ctx.createRadialGradient(
    -r * 0.3, -r * 0.35, r * 0.1,
    r * 0.15, r * 0.2, r * 1.1
  );
  grad.addColorStop(0, highlightColor);
  grad.addColorStop(0.45, fillColor);
  grad.addColorStop(1, strokeColor);

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // === 左上高光 ===
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.35, r * 0.38, r * 0.22, -0.5, 0, Math.PI * 2);
  const hlGrad = ctx.createRadialGradient(
    -r * 0.32, -r * 0.35, 0,
    -r * 0.32, -r * 0.35, r * 0.38
  );
  hlGrad.addColorStop(0, 'rgba(255,255,255,0.55)');
  hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hlGrad;
  ctx.fill();

  // === 底部暗影 ===
  ctx.beginPath();
  ctx.arc(0, 0, r - 1, 0.3, Math.PI - 0.3);
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // === 数字 ===
  if (text) {
    const fontSize = Math.round(15 * scaleK);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `700 ${fontSize}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 2 * scaleK);
    ctx.fillStyle = textColor;
    ctx.fillText(text, 0, 1 * scaleK);
  }

  // === 旗帜花朵 ===
  if (cell.isFlagged && !cell.isWrongFlag) {
    drawFlowerPattern(ctx, scaleK);
  }

  // === X 错误标记 ===
  if (cell.isWrongFlag) {
    drawXPattern(ctx, scaleK);
  }

  // === 地雷 ===
  if (cell.isRevealed && cell.isMine) {
    drawMinePattern(ctx, cell.isExploded, anim, scaleK);
  }

  ctx.restore();
  return true;
}

/**
 * 花朵图案 (白色渐变花瓣 + 粉色花心)
 */
function drawFlowerPattern(ctx, k = 1) {
  const petals = 5;
  const pr = 4.5 * k;
  const dist = 5 * k;

  for (let i = 0; i < petals; i++) {
    const angle = (i / petals) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(angle) * dist;
    const py = Math.sin(angle) * dist;
    const pgrad = ctx.createRadialGradient(px - k, py - k, 0, px, py, pr);
    pgrad.addColorStop(0, '#ffffff');
    pgrad.addColorStop(0.7, COLORS.FLAG_PATTERN);
    pgrad.addColorStop(1, 'rgba(255,255,255,0.6)');
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fillStyle = pgrad;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(0, 0, 3.2 * k, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.FLAG_CENTER;
  ctx.fill();
  ctx.strokeStyle = '#b83d68';
  ctx.lineWidth = 0.5 * k;
  ctx.stroke();
}

/**
 * X 图案 (错误标记)
 */
function drawXPattern(ctx, k = 1) {
  ctx.strokeStyle = '#5f5e5a';
  ctx.lineWidth = 2.8 * k;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6 * k, -6 * k);
  ctx.lineTo(6 * k, 6 * k);
  ctx.moveTo(6 * k, -6 * k);
  ctx.lineTo(-6 * k, 6 * k);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/**
 * 地雷图案 (炸弹球 + 尖刺 + 引信)
 */
function drawMinePattern(ctx, isExploded, anim, k = 1) {
  const bombR = 6 * k;

  // 爆炸发光
  if (isExploded) {
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 16 * k);
    glow.addColorStop(0, 'rgba(255,107,74,0.5)');
    glow.addColorStop(1, 'rgba(255,107,74,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 16 * k, 0, Math.PI * 2);
    ctx.fill();
  }

  // 尖刺
  ctx.strokeStyle = COLORS.MINE_SPIKE;
  ctx.lineWidth = 2.2 * k;
  ctx.lineCap = 'round';
  const spikes = 8;
  for (let i = 0; i < spikes; i++) {
    const angle = (i / spikes) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * (bombR - k), Math.sin(angle) * (bombR - k));
    ctx.lineTo(Math.cos(angle) * (bombR + 4 * k), Math.sin(angle) * (bombR + 4 * k));
    ctx.stroke();
  }
  ctx.lineCap = 'butt';

  // 炸弹球体
  const bgrad = ctx.createRadialGradient(-2 * k, -2 * k, 0, 0, 0, bombR);
  if (isExploded) {
    bgrad.addColorStop(0, '#ff8a7a');
    bgrad.addColorStop(0.6, '#e24b4a');
    bgrad.addColorStop(1, '#8a1a1a');
  } else {
    bgrad.addColorStop(0, '#6a6a6a');
    bgrad.addColorStop(0.5, '#3a3a3a');
    bgrad.addColorStop(1, '#1a1a1a');
  }
  ctx.beginPath();
  ctx.arc(0, 0, bombR, 0, Math.PI * 2);
  ctx.fillStyle = bgrad;
  ctx.fill();
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 0.8 * k;
  ctx.stroke();

  // 顶部高光
  ctx.beginPath();
  ctx.arc(-2 * k, -2.5 * k, 1.5 * k, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();

  // 爆炸碎片飞散
  if (isExploded && anim && anim.t > 0.1) {
    const fragCount = 8;
    const dist = anim.t * 20 * k;
    ctx.fillStyle = '#ff6b4a';
    for (let i = 0; i < fragCount; i++) {
      const angle = (i / fragCount) * Math.PI * 2 + anim.t * 2;
      const fx = Math.cos(angle) * dist;
      const fy = Math.sin(angle) * dist;
      const fr = 2.5 * k * (1 - anim.t * 0.5);
      ctx.beginPath();
      ctx.arc(fx, fy, fr, 0, Math.PI * 2);
      ctx.globalAlpha = (1 - anim.t) * 0.8;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
