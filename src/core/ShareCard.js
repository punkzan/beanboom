// ShareCard.js - Bean Boom 分享图生成引擎
// 使用 Canvas 2D 绘制 6 种场景的分享图，输出 PNG data URL
// 文案通过 i18n (t) 跟随当前语言
//
// 场景 1: 游客胜利  场景 2: 游客失败
// 场景 3: 注册用户胜利  场景 4: 注册用户失败
// 场景 5: 注册用户参加挑战  场景 6: 注册用户完成挑战

import { t } from '../i18n.js';
import { getCachedBackgroundImage } from './BackgroundImage.js';
import { QR_MATRIX, QR_SIZE } from './qr-matrix.js';

const C = {
  MINT:       '#5dcaa5',
  MINT_DARK:  '#1d9e75',
  WARM_GRAY:  '#5f5e5a',
  LIGHT_BG:   '#f1efe8',
  PURPLE:     '#7f77dd',
  PURPLE_DK:  '#534ab7',
  FOREST:     '#639922',
  FOREST_DK:  '#3b6d11',
  PINK:       '#d4537e',
  GOLD:       '#fac775',
  WHITE:      '#ffffff',
  BLACK:      '#1a1a1a',
  GRAY_TXT:   '#888780',
};

const DIFF_CL = {
  easy:   { fill:'#85b7eb', stroke:'#378add', light:'#e6f1fb', text:'#042c53' },
  medium: { fill:'#ef9f27', stroke:'#ba7517', light:'#faeeda', text:'#412402' },
  hard:   { fill:'#f0997b', stroke:'#d85a30', light:'#faece7', text:'#4a1b0c' },
};

// ---- helpers ----

function diffLabel(difficulty) {
  return t('game.diff.' + (difficulty || 'easy')) || '';
}

function periodLabel(period, customDays) {
  if (period === 'yearly') return t('challenge.period.365days');
  if (period === 'custom') return t('challenge.period.custom', customDays || 30);
  return t('challenge.period.30days');
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fmtSec(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

// hex 转 rgba 字符串
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---- section: background image (cover draw) ----

function drawBackgroundImage(ctx, W, H, overlayColor) {
  const bgImg = getCachedBackgroundImage();
  if (!bgImg || !bgImg.width) return false;

  try {
    // object-fit: cover 算法
    const imgRatio = bgImg.width / bgImg.height;
    const canvasRatio = W / H;
    let sx, sy, sw, sh;
    if (imgRatio > canvasRatio) {
      sh = bgImg.height;
      sw = sh * canvasRatio;
      sx = (bgImg.width - sw) / 2;
      sy = 0;
    } else {
      sw = bgImg.width;
      sh = sw / canvasRatio;
      sx = 0;
      sy = (bgImg.height - sh) / 2;
    }

    // 绘制图片（带滤镜增强炫酷感）
    ctx.save();
    ctx.filter = 'contrast(1.15) saturate(1.25) brightness(0.85)';
    ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, W, H);
    ctx.restore();

    // 叠加半透明场景色，保持色调统一
    ctx.fillStyle = hexToRgba(overlayColor, 0.72);
    ctx.fillRect(0, 0, W, H);

    return true;
  } catch (e) {
    // canvas 被污染或图片跨域 → 降级为纯色（已绘制）
    return false;
  }
}

// ---- section: slogan watermark (background) ----

function drawSloganWatermark(ctx, W, H) {
  const slogan = t('common.slogan');
  if (!slogan) return;

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-8 * Math.PI / 180);
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(slogan, 0, 0);
  ctx.restore();
}

// ---- section: header bar ----

function drawHeader(ctx, W, y, data) {
  const s = data.scenario;
  let bg, label;
  if (s === 1 || s === 3) { bg = C.MINT_DARK; label = t('share.header.win'); }
  else if (s === 2 || s === 4) { bg = C.WARM_GRAY; label = t('share.header.lose'); }
  else if (s === 5) { bg = C.PURPLE_DK; label = t('share.header.challenge'); }
  else { bg = C.FOREST_DK; label = t('share.header.completed'); }

  ctx.fillStyle = bg;
  roundRect(ctx, 30, y, W - 60, 52, 10);
  ctx.fill();

  ctx.fillStyle = C.WHITE;
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, W / 2, y + 26);
}

// ---- section: board image (scenarios 1-4) ----

function drawBoardArea(ctx, W, y, h, data) {
  const s = data.scenario;
  const isWin = (s === 1 || s === 3);
  const bgColor = isWin ? C.MINT : C.LIGHT_BG;

  ctx.fillStyle = bgColor;
  roundRect(ctx, 30, y, W - 60, h, 12);
  ctx.fill();

  if (data.boardCanvas) {
    try {
      drawCanvasContain(ctx, data.boardCanvas, 40, y + 8, W - 80, h - 16);
    } catch(e) {
      drawBoardPlaceholder(ctx, W, y, h, isWin);
    }
  } else {
    drawBoardPlaceholder(ctx, W, y, h, isWin);
  }
}

function drawCanvasContain(ctx, srcCanvas, x, y, w, h) {
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;
  if (!sw || !sh) return;
  const scale = Math.min(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(srcCanvas, dx, dy, dw, dh);
}

function drawBoardPlaceholder(ctx, W, y, h, isWin) {
  ctx.fillStyle = isWin ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.05)';
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isWin ? 'VICTORY' : 'BOOM!', W / 2, y + h / 2);
}

// ---- section: solid background (scenarios 5-6) ----

function drawSolidBg(ctx, W, y, h, color, data) {
  ctx.fillStyle = color;
  roundRect(ctx, 30, y, W - 60, h, 12);
  ctx.fill();
}

// ---- section: data cards ----

function drawDataCards(ctx, W, y, data, isReg) {
  const s = data.scenario;
  const isWin = (s === 1 || s === 3);
  const cardW = (W - 60 - 20) / 3;
  const cardH = 80;

  let cards;
  if (s <= 4) {
    cards = [
      { label: t('share.card.time'), value: fmtSec(data.timeSeconds || 0) },
      { label: t('share.card.mines'), value: String(data.mineCount || 0) },
      { label: s === 1 || s === 3 ? t('share.card.revealed') : t('share.card.progress'), value: `${data.revealedCount||0}/${data.totalSafeCells||0}` },
    ];
  } else if (s === 5) {
    cards = [
      { label: t('share.card.goal'), value: t('share.card.times', data.challenge?.targetCount || 0) },
      { label: t('share.card.period'), value: periodLabel(data.challenge?.period, data.challenge?.customDays) },
      { label: t('share.card.fee'), value: `$${data.challenge?.amount || 0}` },
    ];
  } else {
    const p = data.participation || {};
    cards = [
      { label: t('share.card.completed'), value: t('share.card.completedTimes', p.progress||0, p.targetCount||0) },
      { label: t('share.card.refund'), value: `$${p.amount || data.challenge?.amount || 0}` },
      { label: t('share.card.time'), value: t('share.card.days', data.challengeDays || 0) },
    ];
  }

  for (let i = 0; i < cards.length; i++) {
    const cx = 30 + i * (cardW + 10);
    ctx.fillStyle = isWin ? 'rgba(255,255,255,0.92)' : C.WHITE;
    if (s === 5) ctx.fillStyle = 'rgba(255,255,255,0.92)';
    if (s === 6) ctx.fillStyle = 'rgba(255,255,255,0.92)';
    roundRect(ctx, cx, y, cardW, cardH, 10);
    ctx.fill();

    ctx.fillStyle = C.GRAY_TXT;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(cards[i].label, cx + cardW/2, y + 12);

    ctx.fillStyle = C.BLACK;
    ctx.font = 'bold 22px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(cards[i].value, cx + cardW/2, y + 50);
  }
}

// ---- section: best scores panel (registered only) ----

function drawBestScores(ctx, W, y, data) {
  const bs = data.bestScores || {};
  const h = 80;
  const isDark = data.scenario === 3 || data.scenario === 5 || data.scenario === 6;

  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.7)';
  roundRect(ctx, 30, y, W - 60, h, 10);
  ctx.fill();
  if (!isDark) {
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    roundRect(ctx, 30, y, W - 60, h, 10);
    ctx.stroke();
  }

  const items = [
    { label: t('share.best.title.easy'), value: bs.easy != null ? fmtSec(bs.easy) : '—', color: DIFF_CL.easy.fill },
    { label: t('share.best.title.medium'), value: bs.medium != null ? fmtSec(bs.medium) : '—', color: DIFF_CL.medium.fill },
    { label: t('share.best.title.hard'), value: bs.hard != null ? fmtSec(bs.hard) : '—', color: DIFF_CL.hard.fill },
    { label: t('share.best.title.wins'), value: String(data.totalWins || 0), color: C.PURPLE },
    { label: t('share.best.title.completed'), value: String(data.challengesCompleted || 0), color: C.FOREST },
    { label: t('share.best.title.refunded'), value: `$${data.totalRefunded || 0}`, color: C.GOLD },
  ];

  const colW = (W - 60) / items.length;
  for (let i = 0; i < items.length; i++) {
    const cx = 30 + i * colW + colW / 2;
    if (items[i].color) {
      ctx.fillStyle = items[i].color;
      ctx.beginPath();
      ctx.arc(cx - 55, y + 24, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.7)' : C.GRAY_TXT;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(items[i].label, cx, y + 14);

    ctx.fillStyle = isDark ? C.WHITE : C.BLACK;
    ctx.font = 'bold 18px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(items[i].value, cx, y + 52);
  }
}

// ---- section: TOP3 ranking grid (registered only) ----

function drawTop3Grid(ctx, W, y, data) {
  const rankings = data.top3Rankings || {};
  const diffs = ['easy', 'medium', 'hard'];
  const periods = ['daily', 'monthly', 'yearly', 'all'];
  const h = 180;
  const isDark = data.scenario === 3 || data.scenario === 5 || data.scenario === 6;

  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.6)';
  roundRect(ctx, 30, y, W - 60, h, 10);
  ctx.fill();
  if (!isDark) {
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    roundRect(ctx, 30, y, W - 60, h, 10);
    ctx.stroke();
  }

  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.8)' : C.GRAY_TXT;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(t('share.top3.title'), 45, y + 8);

  const gridX = 45;
  const gridY = y + 28;
  const gridW = W - 90;
  const labelW = 50;
  const colW = (gridW - labelW) / 4;
  const rowH = (h - 36) / 3;

  // Column headers
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.6)' : C.GRAY_TXT;
  for (let j = 0; j < periods.length; j++) {
    ctx.fillText(t('lb.tab.' + periods[j]), gridX + labelW + j * colW + colW/2, gridY);
  }

  // Rows
  for (let i = 0; i < diffs.length; i++) {
    const diff = diffs[i];
    const rowY = gridY + 16 + i * rowH;
    const cl = DIFF_CL[diff];

    ctx.fillStyle = cl.fill;
    roundRect(ctx, gridX, rowY + 4, labelW - 8, rowH - 12, 6);
    ctx.fill();
    ctx.fillStyle = C.WHITE;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('game.diff.' + diff), gridX + (labelW - 8)/2, rowY + rowH/2);

    for (let j = 0; j < periods.length; j++) {
      const period = periods[j];
      const cellX = gridX + labelW + j * colW;
      const cellY = rowY + 2;
      const cellW = colW - 6;
      const cellH = rowH - 10;
      const key = `${diff}_${period}`;
      const r = rankings[key];

      if (r) {
        ctx.fillStyle = cl.light;
        roundRect(ctx, cellX, cellY, cellW, cellH, 6);
        ctx.fill();
        ctx.fillStyle = cl.text;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`#${r.rank}`, cellX + cellW/2, cellY + cellH/2 - 8);
        ctx.fillStyle = cl.stroke;
        ctx.font = '10px sans-serif';
        ctx.fillText(fmtSec(r.time), cellX + cellW/2, cellY + cellH/2 + 10);
      } else {
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
        roundRect(ctx, cellX, cellY, cellW, cellH, 6);
        ctx.fill();
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('share.top3.none'), cellX + cellW/2, cellY + cellH/2);
      }
    }
  }
}

// ---- section: share text / CTA ----

function drawShareText(ctx, W, y, h, data, isReg) {
  const s = data.scenario;
  let text;
  if (s === 1) text = t('share.text.scenario1');
  else if (s === 2) text = t('share.text.scenario2');
  else if (s === 3) text = t('share.text.scenario3');
  else if (s === 4) text = t('share.text.scenario4');
  else if (s === 5) text = t('share.text.scenario5');
  else text = t('share.text.scenario6');

  ctx.fillStyle = isReg ? C.WHITE : (s === 1 ? C.WHITE : C.WARM_GRAY);
  if (s === 2) ctx.fillStyle = C.WARM_GRAY;
  if (s === 4) ctx.fillStyle = C.WARM_GRAY;
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, y + h / 2);
}

// ---- section: brand bar ----

function drawBrandBar(ctx, W, y, h) {
  ctx.fillStyle = C.BLACK;
  roundRect(ctx, 30, y, W - 60, h, 12);
  ctx.fill();

  const cx = 60;
  const cy = y + h / 2;

  ctx.fillStyle = C.MINT;
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.BLACK;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BB', cx, cy);

  ctx.fillStyle = C.WHITE;
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Bean Boom', cx + 32, cy - 8);

  ctx.fillStyle = C.MINT;
  ctx.font = '13px sans-serif';
  ctx.fillText('beanboom.game', cx + 32, cy + 12);

  const qrSize = h - 20;
  const qrX = W - 30 - qrSize - 20;
  const qrY = y + 10;
  ctx.fillStyle = C.WHITE;
  roundRect(ctx, qrX, qrY, qrSize, qrSize, 6);
  ctx.fill();
  ctx.fillStyle = C.BLACK;
  const margin = Math.max(3, Math.floor(qrSize * 0.08));
  const drawSize = qrSize - margin * 2;
  const cellSz = drawSize / QR_SIZE;
  for (let r = 0; r < QR_SIZE; r++) {
    for (let c2 = 0; c2 < QR_SIZE; c2++) {
      if (QR_MATRIX[r][c2]) {
        ctx.fillRect(qrX + margin + c2 * cellSz, qrY + margin + r * cellSz, cellSz + 0.5, cellSz + 0.5);
      }
    }
  }
}

// ---- section: user identity bar ----

function drawUserBar(ctx, W, y, data) {
  const s = data.scenario;
  const isDark = s === 3 || s === 5 || s === 6;

  if (!data.username) return y;

  const avX = 50;
  const avY = y + 20;
  const avR = 16;
  ctx.fillStyle = C.PURPLE;
  ctx.beginPath();
  ctx.arc(avX, avY, avR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.WHITE;
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((data.username[0] || 'P').toUpperCase(), avX, avY);

  ctx.fillStyle = isDark ? C.WHITE : C.BLACK;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const dLabel = diffLabel(data.difficulty);
  ctx.fillText(t('share.userBar.diff', data.username, dLabel), avX + avR + 10, avY);

  if (data.wasBest && (s === 3)) {
    const bx = avX + avR + 10 + ctx.measureText(t('share.userBar.diff', data.username, dLabel)).width + 10;
    ctx.fillStyle = C.GOLD;
    roundRect(ctx, bx, avY - 10, 60, 20, 10);
    ctx.fill();
    ctx.fillStyle = C.BLACK;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('share.userBar.newRecord'), bx + 30, avY);
  }

  return y + 44;
}

// ---- section: challenge detail card (scenarios 5-6) ----

function drawChallengeCard(ctx, W, y, data) {
  const s = data.scenario;
  const ch = data.challenge || {};
  const p = data.participation || {};
  const h = s === 6 ? 180 : 140;

  ctx.fillStyle = C.WHITE;
  roundRect(ctx, 30, y, W - 60, h, 12);
  ctx.fill();

  ctx.fillStyle = C.BLACK;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(ch.name || t('share.card.challengeLabel'), 50, y + 14);

  let bx = 50;
  const by = y + 48;
  const diff = ch.difficulty || 'easy';
  const cl = DIFF_CL[diff] || DIFF_CL.easy;

  ctx.fillStyle = cl.light;
  roundRect(ctx, bx, by, 60, 22, 6);
  ctx.fill();
  ctx.fillStyle = cl.text;
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(diffLabel(diff), bx + 30, by + 11);
  bx += 70;

  const pLabel = periodLabel(ch.period, ch.customDays);
  ctx.fillStyle = '#f1efe8';
  roundRect(ctx, bx, by, 60, 22, 6);
  ctx.fill();
  ctx.fillStyle = C.WARM_GRAY;
  ctx.fillText(pLabel, bx + 30, by + 11);
  bx += 70;

  ctx.fillStyle = '#f1efe8';
  roundRect(ctx, bx, by, 80, 22, 6);
  ctx.fill();
  ctx.fillStyle = C.WARM_GRAY;
  ctx.fillText(t('share.card.target', ch.targetCount||0), bx + 40, by + 11);

  ctx.fillStyle = C.GOLD;
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`$${ch.amount || 0}`, W - 50, y + 14);
  ctx.fillStyle = C.GRAY_TXT;
  ctx.font = '11px sans-serif';
  ctx.fillText(t('share.card.challengeFee'), W - 50, y + 48);

  if (s === 6) {
    const pct = Math.min(100, ((p.progress||0) / (p.targetCount||1)) * 100);
    const barX = 50, barY = y + 84, barW = W - 100, barH = 14;
    ctx.fillStyle = '#f1efe8';
    roundRect(ctx, barX, barY, barW, barH, 7);
    ctx.fill();
    ctx.fillStyle = C.FOREST;
    roundRect(ctx, barX, barY, barW * pct / 100, barH, 7);
    ctx.fill();
    ctx.fillStyle = C.BLACK;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('share.card.done100', p.progress||0, p.targetCount||0), barX, y + 118);

    ctx.fillStyle = C.FOREST_DK;
    roundRect(ctx, W - 130, y + 104, 80, 28, 14);
    ctx.fill();
    ctx.fillStyle = C.GOLD;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('share.card.refundedAmt', p.amount||0), W - 90, y + 118);

    const txParts = [];
    if (p.refundTxId) txParts.push(t('share.card.refundTxLabel') + p.refundTxId);
    if (p.paymentTxId) txParts.push(t('share.card.payTxLabel') + p.paymentTxId);
    if (txParts.length) {
      ctx.fillStyle = C.GRAY_TXT;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(txParts.join('  |  '), 50, y + 145);
    }
  } else {
    ctx.fillStyle = C.GRAY_TXT;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(t('share.card.payTxLabel') + (p.paymentTxId || '—'), 50, y + 84);
    ctx.fillText(t('share.card.paidAndStarted', ch.amount||0), 50, y + 104);
  }

  return y + h;
}

// ---- main entry ----

export function generateShareCard(data) {
  const isReg = !!data.username;
  const W = 1080;
  const H = isReg ? 1180 : 1080;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const s = data.scenario;
  let fullBg;
  if (s === 1 || s === 3) fullBg = C.MINT;
  else if (s === 2 || s === 4) fullBg = C.LIGHT_BG;
  else if (s === 5) fullBg = C.PURPLE;
  else fullBg = C.FOREST;

  ctx.fillStyle = fullBg;
  ctx.fillRect(0, 0, W, H);

  // 尝试绘制每日背景图片（带场景色遮罩），失败则保持纯色
  drawBackgroundImage(ctx, W, H, fullBg);

  // 背景标语水印
  drawSloganWatermark(ctx, W, H);

  drawHeader(ctx, W, 20, data);

  let cursorY = 84;

  if (isReg) {
    cursorY = drawUserBar(ctx, W, cursorY, data) + 8;
  } else {
    ctx.fillStyle = s === 1 ? 'rgba(255,255,255,0.7)' : C.GRAY_TXT;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const dLabel = diffLabel(data.difficulty);
    ctx.fillText(t('share.userBar.anon', dLabel), W / 2, cursorY + 10);
    cursorY += 36;
  }

  if (s <= 4) {
    const boardH = isReg ? 380 : 420;
    drawBoardArea(ctx, W, cursorY, boardH, data);
    cursorY += boardH + 12;
  } else {
    const areaH = 200;
    drawSolidBg(ctx, W, cursorY, areaH, 'rgba(255,255,255,0.1)', data);
    cursorY = drawChallengeCard(ctx, W, cursorY + 10, data) + 12;
  }

  drawDataCards(ctx, W, cursorY, data, isReg);
  cursorY += 92;

  if (isReg) {
    drawBestScores(ctx, W, cursorY, data);
    cursorY += 90;
    drawTop3Grid(ctx, W, cursorY, data);
    cursorY += 192;
  }

  const textH = isReg ? 36 : 56;
  drawShareText(ctx, W, cursorY, textH, data, isReg);
  cursorY += textH + 8;

  const brandH = Math.min(120, H - cursorY - 20);
  drawBrandBar(ctx, W, cursorY, brandH);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    shareText: getShareText(data),
  };
}

function getShareText(data) {
  const s = data.scenario;
  const time = fmtSec(data.timeSeconds || 0);
  const diff = diffLabel(data.difficulty);
  const user = data.username || t('common.anonymousPlayer');
  const ch = data.challenge || {};
  const p = data.participation || {};

  if (s === 1) return t('share.txt.scenario1', diff, time);
  if (s === 2) return t('share.txt.scenario2');
  if (s === 3) return t('share.txt.scenario3', user, diff, time, data.mineCount||0);
  if (s === 4) return t('share.txt.scenario4', user, diff, data.revealedCount||0);
  if (s === 5) {
    const pKey = ch.period === 'yearly' ? t('challenge.period.yearly') : ch.period === 'custom' ? t('challenge.period.custom', ch.customDays||30) : t('challenge.period.monthly');
    return t('share.txt.scenario5', user, ch.amount||0, diff, pKey);
  }
  if (s === 6) {
    const pKey = ch.period === 'yearly' ? t('challenge.period.yearly') : ch.period === 'custom' ? t('challenge.period.custom', ch.customDays||30) : t('challenge.period.monthly');
    return t('share.txt.scenario6', user, p.amount||0, diff, p.progress||0, p.targetCount||0);
  }
  return t('share.txt.default');
}
