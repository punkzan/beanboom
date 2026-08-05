// ShareCard.js - Bean Boom 分享图生成引擎
// 使用 Canvas 2D 绘制 6 种场景的分享图，输出 PNG data URL
//
// 场景 1: 游客胜利  场景 2: 游客失败
// 场景 3: 注册用户胜利  场景 4: 注册用户失败
// 场景 5: 注册用户参加挑战  场景 6: 注册用户完成挑战

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
const DIFF_LB = { easy:'简单', medium:'中等', hard:'困难' };
const PERIOD_LB = { daily:'日榜', monthly:'月榜', yearly:'年榜', all:'总榜' };

// ---- helpers ----

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

function fmtDateShort(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ---- section: header bar ----

function drawHeader(ctx, W, y, data) {
  const s = data.scenario;
  let bg, label;
  if (s === 1 || s === 3) { bg = C.MINT_DARK; label = 'Bean Boom · 胜利时刻'; }
  else if (s === 2 || s === 4) { bg = C.WARM_GRAY; label = 'Bean Boom · 战绩记录'; }
  else if (s === 5) { bg = C.PURPLE_DK; label = 'Bean Boom · 付费挑战'; }
  else { bg = C.FOREST_DK; label = 'Bean Boom · 挑战完成'; }

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

  // Background area
  ctx.fillStyle = bgColor;
  roundRect(ctx, 30, y, W - 60, h, 12);
  ctx.fill();

  // Draw board screenshot from canvas element
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
  const cardW = (W - 60 - 20) / 3; // 3 cards with 10px gaps
  const cardH = 80;

  let cards;
  if (s <= 4) {
    // Game result cards
    cards = [
      { label: '用时', value: fmtSec(data.timeSeconds || 0) },
      { label: '雷数', value: String(data.mineCount || 0) },
      { label: s === 1 || s === 3 ? '翻格' : '进度', value: s === 1 || s === 3 ? `${data.revealedCount||0}/${data.totalSafeCells||0}` : `${data.revealedCount||0}/${data.totalSafeCells||0}` },
    ];
  } else if (s === 5) {
    // Challenge join cards
    cards = [
      { label: '目标', value: `${data.challenge?.targetCount || 0}次` },
      { label: '周期', value: data.challenge?.period === 'yearly' ? '365天' : data.challenge?.period === 'custom' ? `${data.challenge?.customDays||30}天` : '30天' },
      { label: '费用', value: `$${data.challenge?.amount || 0}` },
    ];
  } else {
    // Challenge complete cards
    const p = data.participation || {};
    cards = [
      { label: '完成', value: `${p.progress||0}/${p.targetCount||0}次` },
      { label: '退款', value: `$${p.amount || data.challenge?.amount || 0}` },
      { label: '用时', value: `${data.challengeDays || 0}天` },
    ];
  }

  for (let i = 0; i < cards.length; i++) {
    const cx = 30 + i * (cardW + 10);
    // Card bg
    ctx.fillStyle = isWin ? 'rgba(255,255,255,0.92)' : C.WHITE;
    if (s === 5) ctx.fillStyle = 'rgba(255,255,255,0.92)';
    if (s === 6) ctx.fillStyle = 'rgba(255,255,255,0.92)';
    roundRect(ctx, cx, y, cardW, cardH, 10);
    ctx.fill();

    // Label
    ctx.fillStyle = C.GRAY_TXT;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(cards[i].label, cx + cardW/2, y + 12);

    // Value
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
    { label: '简单最佳', value: bs.easy != null ? fmtSec(bs.easy) : '—', color: DIFF_CL.easy.fill },
    { label: '中等最佳', value: bs.medium != null ? fmtSec(bs.medium) : '—', color: DIFF_CL.medium.fill },
    { label: '困难最佳', value: bs.hard != null ? fmtSec(bs.hard) : '—', color: DIFF_CL.hard.fill },
    { label: '总胜场', value: String(data.totalWins || 0), color: C.PURPLE },
    { label: '挑战完成', value: String(data.challengesCompleted || 0), color: C.FOREST },
    { label: '累计退款', value: `$${data.totalRefunded || 0}`, color: C.GOLD },
  ];

  const colW = (W - 60) / items.length;
  for (let i = 0; i < items.length; i++) {
    const cx = 30 + i * colW + colW / 2;
    // Color dot for all items
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

  // Panel bg
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.6)';
  roundRect(ctx, 30, y, W - 60, h, 10);
  ctx.fill();
  if (!isDark) {
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    roundRect(ctx, 30, y, W - 60, h, 10);
    ctx.stroke();
  }

  // Title
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.8)' : C.GRAY_TXT;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('排行榜最佳名次', 45, y + 8);

  // Layout
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
    ctx.fillText(PERIOD_LB[periods[j]], gridX + labelW + j * colW + colW/2, gridY);
  }

  // Rows
  for (let i = 0; i < diffs.length; i++) {
    const diff = diffs[i];
    const rowY = gridY + 16 + i * rowH;
    const cl = DIFF_CL[diff];

    // Row label
    ctx.fillStyle = cl.fill;
    roundRect(ctx, gridX, rowY + 4, labelW - 8, rowH - 12, 6);
    ctx.fill();
    ctx.fillStyle = C.WHITE;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(DIFF_LB[diff], gridX + (labelW - 8)/2, rowY + rowH/2);

    // Cells
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
        // Rank
        ctx.fillStyle = cl.text;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`#${r.rank}`, cellX + cellW/2, cellY + cellH/2 - 8);
        // Time
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
        ctx.fillText('—', cellX + cellW/2, cellY + cellH/2);
      }
    }
  }
}

// ---- section: share text / CTA ----

function drawShareText(ctx, W, y, h, data, isReg) {
  const s = data.scenario;
  let text;
  if (s === 1) text = '注册后可记录成绩，挑战全球排行榜！';
  else if (s === 2) text = '差一点就成功了！注册后可查看历史战绩';
  else if (s === 3) text = '来 Bean Boom 挑战我的成绩！';
  else if (s === 4) text = '翻了一半就踩雷了...谁来教教我';
  else if (s === 5) text = '达成目标全额退款！一起来挑战吧';
  else text = '我做到了，全额退款已到账！你也来挑战吧';

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
  // Background
  ctx.fillStyle = C.BLACK;
  roundRect(ctx, 30, y, W - 60, h, 12);
  ctx.fill();

  const cx = 60;
  const cy = y + h / 2;

  // Logo circle
  ctx.fillStyle = C.MINT;
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.BLACK;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BB', cx, cy);

  // Brand name
  ctx.fillStyle = C.WHITE;
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Bean Boom', cx + 32, cy - 8);

  // URL
  ctx.fillStyle = C.MINT;
  ctx.font = '13px sans-serif';
  ctx.fillText('beanboom.game', cx + 32, cy + 12);

  // QR placeholder
  const qrSize = h - 20;
  const qrX = W - 30 - qrSize - 20;
  const qrY = y + 10;
  ctx.fillStyle = C.WHITE;
  roundRect(ctx, qrX, qrY, qrSize, qrSize, 6);
  ctx.fill();
  // Decorative QR pattern
  ctx.fillStyle = C.BLACK;
  const cellSz = qrSize / 7;
  const pattern = [
    [1,1,1,0,1,0,1],
    [1,0,1,1,0,1,1],
    [1,1,0,1,1,0,0],
    [0,1,1,0,1,1,0],
    [1,0,1,1,0,0,1],
    [0,1,0,0,1,1,1],
    [1,1,1,0,1,1,0],
  ];
  for (let r = 0; r < 7; r++) {
    for (let c2 = 0; c2 < 7; c2++) {
      if (pattern[r][c2]) {
        ctx.fillRect(qrX + c2 * cellSz + 2, qrY + r * cellSz + 2, cellSz - 4, cellSz - 4);
      }
    }
  }
}

// ---- section: user identity bar ----

function drawUserBar(ctx, W, y, data) {
  const s = data.scenario;
  const isDark = s === 3 || s === 5 || s === 6;

  if (!data.username) return y; // no bar for guests

  // Avatar circle
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

  // Username + info
  ctx.fillStyle = isDark ? C.WHITE : C.BLACK;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const diffLabel = DIFF_LB[data.difficulty] || '';
  ctx.fillText(`${data.username} · ${diffLabel}难度`, avX + avR + 10, avY);

  // New record badge
  if (data.wasBest && (s === 3)) {
    const bx = avX + avR + 10 + ctx.measureText(`${data.username} · ${diffLabel}难度`).width + 10;
    ctx.fillStyle = C.GOLD;
    roundRect(ctx, bx, avY - 10, 60, 20, 10);
    ctx.fill();
    ctx.fillStyle = C.BLACK;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('新纪录', bx + 30, avY);
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

  // Challenge name
  ctx.fillStyle = C.BLACK;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(ch.name || '挑战', 50, y + 14);

  // Badges
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
  ctx.fillText(DIFF_LB[diff] || '', bx + 30, by + 11);
  bx += 70;

  const periodLabel = ch.period === 'yearly' ? '365天' : ch.period === 'custom' ? `${ch.customDays||30}天` : '30天';
  ctx.fillStyle = '#f1efe8';
  roundRect(ctx, bx, by, 60, 22, 6);
  ctx.fill();
  ctx.fillStyle = C.WARM_GRAY;
  ctx.fillText(periodLabel, bx + 30, by + 11);
  bx += 70;

  ctx.fillStyle = '#f1efe8';
  roundRect(ctx, bx, by, 80, 22, 6);
  ctx.fill();
  ctx.fillStyle = C.WARM_GRAY;
  ctx.fillText(`目标${ch.targetCount||0}次`, bx + 40, by + 11);

  // Amount
  ctx.fillStyle = C.GOLD;
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`$${ch.amount || 0}`, W - 50, y + 14);
  ctx.fillStyle = C.GRAY_TXT;
  ctx.font = '11px sans-serif';
  ctx.fillText('挑战费用', W - 50, y + 48);

  // Progress bar (scenario 6) or payment tx (scenario 5)
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
    ctx.fillText(`${p.progress||0}/${p.targetCount||0} 次 · 100%完成`, barX, y + 118);

    // Refund badge (aligned with progress text on same row)
    ctx.fillStyle = C.FOREST_DK;
    roundRect(ctx, W - 130, y + 104, 80, 28, 14);
    ctx.fill();
    ctx.fillStyle = C.GOLD;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`$${p.amount||0} 已退`, W - 90, y + 118);

    // TX IDs (merged into one line)
    ctx.fillStyle = C.GRAY_TXT;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const txParts = [];
    if (p.refundTxId) txParts.push(`退款单号: ${p.refundTxId}`);
    if (p.paymentTxId) txParts.push(`支付单号: ${p.paymentTxId}`);
    if (txParts.length) ctx.fillText(txParts.join('  |  '), 50, y + 145);
  } else {
    // Scenario 5: payment info
    ctx.fillStyle = C.GRAY_TXT;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`支付单号: ${p.paymentTxId || '—'}`, 50, y + 84);
    ctx.fillText(`已支付 $${ch.amount||0} · 挑战已开始`, 50, y + 104);
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

  // Full background
  const s = data.scenario;
  let fullBg;
  if (s === 1 || s === 3) fullBg = C.MINT;
  else if (s === 2 || s === 4) fullBg = C.LIGHT_BG;
  else if (s === 5) fullBg = C.PURPLE;
  else fullBg = C.FOREST;

  ctx.fillStyle = fullBg;
  ctx.fillRect(0, 0, W, H);

  // Header
  drawHeader(ctx, W, 20, data);

  let cursorY = 84;

  if (isReg) {
    cursorY = drawUserBar(ctx, W, cursorY, data) + 8;
  } else {
    // Guest label
    ctx.fillStyle = s === 1 ? 'rgba(255,255,255,0.7)' : C.GRAY_TXT;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`匿名玩家 · ${DIFF_LB[data.difficulty]||''}难度`, W / 2, cursorY + 10);
    cursorY += 36;
  }

  if (s <= 4) {
    // Board screenshot area
    const boardH = isReg ? 380 : 420;
    drawBoardArea(ctx, W, cursorY, boardH, data);
    cursorY += boardH + 12;
  } else {
    // Solid color area with challenge card
    const areaH = 200;
    drawSolidBg(ctx, W, cursorY, areaH, 'rgba(255,255,255,0.1)', data);
    cursorY = drawChallengeCard(ctx, W, cursorY + 10, data) + 12;
  }

  // Data cards
  drawDataCards(ctx, W, cursorY, data, isReg);
  cursorY += 92;

  // Best scores + TOP3 (registered only)
  if (isReg) {
    drawBestScores(ctx, W, cursorY, data);
    cursorY += 90;
    drawTop3Grid(ctx, W, cursorY, data);
    cursorY += 192;
  }

  // Share text
  const textH = isReg ? 36 : 56;
  drawShareText(ctx, W, cursorY, textH, data, isReg);
  cursorY += textH + 8;

  // Brand bar
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
  const diff = DIFF_LB[data.difficulty] || '';
  const user = data.username || '匿名玩家';
  const ch = data.challenge || {};
  const p = data.participation || {};

  if (s === 1) return `我在 Bean Boom 赢了${diff}难度！用时${time}。注册就能记录成绩，快来挑战我吧！`;
  if (s === 2) return `在 Bean Boom 踩雷了...就差一点！注册后就能记录战绩，不服来战！`;
  if (s === 3) return `${user} 在 Bean Boom ${diff}难度创了新纪录！${time}清除${data.mineCount||0}颗雷。你能更快吗？`;
  if (s === 4) return `${user} 在 Bean Boom ${diff}难度踩雷了...翻了${data.revealedCount||0}格就阵亡。谁敢来挑战？`;
  if (s === 5) return `${user} 加入了$${ch.amount||0}${diff}${ch.period==='yearly'?'年度':ch.period==='custom'?`${ch.customDays||30}天`:'月度'}挑战！达成目标全额退款。你敢来吗？`;
  if (s === 6) return `${user} 完成了$${ch.amount||0}${diff}挑战！${p.progress||0}/${p.targetCount||0}次达标，$${p.amount||0}已全额退还。零成本挑战，快来参加！`;
  return 'Bean Boom - 经典扫雷网页游戏';
}
