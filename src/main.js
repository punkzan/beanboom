import { Game } from './core/Game.js';
import { Timer } from './core/Timer.js';
import { Renderer } from './render/Renderer.js';
import { AnimationManager } from './render/Animation.js';
import { InputHandler } from './input/InputHandler.js';
import { SoundManager } from './audio/SoundManager.js';
import { BGMManager } from './audio/BGMManager.js';
import { DIFFICULTIES } from './constants.js';
import { addRecord, getBestTime, getRecords, getYearlyChampions } from './core/Leaderboard.js';
import { getSeoConfig, getAdsConfig, getActivities, getLatestActivities, getFooterContent } from './core/SiteConfig.js';
import { register, login, logout, getCurrentUser } from './core/Auth.js';
import { getChallenges, participate, getMyChallenges, updateProgress } from './core/ChallengeAPI.js';
import { generateShareCard } from './core/ShareCard.js';
import { t, scanI18n, getLang, setLang, onLangChange } from './i18n.js';

let game = new Game('easy');
const canvas = document.getElementById('game-canvas');
let renderer = new Renderer(canvas, 'easy');
const animManager = new AnimationManager();
const soundManager = new SoundManager();
const bgmManager = new BGMManager();

animManager.onUpdate = () => {
  renderer.render(game.grid, animManager);
};

// DOM 元素
const mineCountEl = document.getElementById('mine-count');
const timerEl = document.getElementById('timer');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySubtitle = document.getElementById('overlay-subtitle');
const overlayBest = document.getElementById('overlay-best');
const overlayRestart = document.getElementById('overlay-restart');
const overlayNameInput = document.getElementById('overlay-name-input');
const overlayRegionInput = document.getElementById('overlay-region-input');
const overlayInputs = document.getElementById('overlay-inputs');
const hintText = document.getElementById('hint-text');
const modeRevealBtn = document.getElementById('mode-reveal');
const modeFlagBtn = document.getElementById('mode-flag');
const soundBtn = document.getElementById('sound-btn');
const diffBtns = document.querySelectorAll('.diff-btn');

const timer = new Timer((display) => {
  timerEl.textContent = display;
});

// 检测移动端
const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (isTouchDevice) {
  hintText.textContent = t('game.touchHint');
}

// === 最佳成绩管理（委托 Leaderboard 数据层）===
function formatSeconds(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function formatDateTime(ts) {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 根据当前语言生成本地化的挑战名称
function getChallengePeriodLabel(period, customDays) {
  if (period === 'yearly') return t('challenge.period.yearly');
  if (period === 'custom') return t('challenge.period.custom', customDays || 30);
  return t('challenge.period.monthly');
}

function getLocalizedChallengeName(c) {
  const diff = t('game.diff.' + c.difficulty) || c.difficulty;
  const period = getChallengePeriodLabel(c.period, c.customDays);
  return t('challenge.cardName', c.amount, diff, period);
}

// === UI 更新 ===
function updateUI() {
  mineCountEl.textContent = game.getRemainingMines();

  if (game.gameState === 'won') {
    timer.stop();
    bgmManager.switchTo('won');
    const seconds = Math.floor(timer.elapsed / 1000);
    const best = getBestTime(game.difficulty);

    overlayTitle.textContent = t('game.won');
    overlayTitle.className = 'overlay-title win';
    overlaySubtitle.textContent = t('game.timeUsed', formatSeconds(seconds));
    overlayInputs.style.display = '';
    const _user = getCurrentUser();
    overlayNameInput.value = _user ? _user.username : '';
    overlayRegionInput.value = _user ? (_user.region || '') : '';
    overlayRestart.textContent = t('game.submit');
    overlayRestart.disabled = false;
    overlayShareBtn.style.display = '';
    if (best !== null) {
      overlayBest.textContent = t('game.currentBest', formatSeconds(best));
    } else {
      overlayBest.textContent = t('game.firstWin');
    }
    setTimeout(() => {
      if (game.gameState === 'won') overlay.classList.add('visible');
    }, 1800);
  } else if (game.gameState === 'lost') {
    timer.stop();
    bgmManager.switchTo('lost');
    overlayTitle.textContent = t('game.hitMine');
    overlayTitle.className = 'overlay-title lose';
    overlaySubtitle.textContent = t('game.tryAgain');
    overlayBest.textContent = '';
    overlayInputs.style.display = 'none';
    overlayRestart.textContent = t('game.playAgain');
    overlayRestart.disabled = false;
    overlayShareBtn.style.display = '';
    setTimeout(() => {
      if (game.gameState === 'lost') overlay.classList.add('visible');
    }, 1600);
  }
}

// === 玩家账户（注册 / 登录） ===
const navUser = document.getElementById('nav-user');
const authModal = document.getElementById('auth-modal');
const authModalTitle = document.getElementById('auth-modal-title');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const authRegion = document.getElementById('auth-region');
const authEmail = document.getElementById('auth-email');
const authError = document.getElementById('auth-error');
const authSubmit = document.getElementById('auth-submit');
const authSwitch = document.getElementById('auth-switch');
const authClose = document.getElementById('auth-close');

let authMode = 'register';

function renderNavUser() {
  const user = getCurrentUser();
  if (user) {
    navUser.innerHTML = `<span class="nav-user-info"><span class="nav-username" title="${escapeHtml(user.username)}">${escapeHtml(user.username)}</span><button class="nav-logout-btn" id="nav-logout-btn">${t('nav.logout')}</button></span>`;
    document.getElementById('nav-logout-btn').addEventListener('click', () => {
      logout();
      renderNavUser();
    });
  } else {
    navUser.innerHTML = `<button class="nav-btn nav-auth-btn" id="nav-login-btn">${t('nav.login')}</button><button class="nav-btn nav-auth-btn" id="nav-register-btn">${t('nav.register')}</button>`;
    document.getElementById('nav-login-btn').addEventListener('click', () => openAuth('login'));
    document.getElementById('nav-register-btn').addEventListener('click', () => openAuth('register'));
  }
  renderChallengeSection();
}

function openAuth(mode) {
  authMode = mode;
  authError.textContent = '';
  authUsername.value = '';
  authPassword.value = '';
  authRegion.value = '';
  authEmail.value = '';
  if (mode === 'register') {
    authModalTitle.textContent = t('auth.registerTitle');
    authSubmit.textContent = t('auth.submitRegister');
    authSwitch.textContent = t('auth.switchToLogin');
    authRegion.style.display = '';
    authEmail.style.display = '';
  } else {
    authModalTitle.textContent = t('auth.loginTitle');
    authSubmit.textContent = t('auth.submitLogin');
    authSwitch.textContent = t('auth.switchToRegister');
    authRegion.style.display = 'none';
    authEmail.style.display = 'none';
  }
  authModal.classList.add('visible');
  setTimeout(() => authUsername.focus(), 50);
}

function closeAuth() {
  authModal.classList.remove('visible');
}

authClose.addEventListener('click', closeAuth);
authModal.addEventListener('click', (e) => { if (e.target === authModal) closeAuth(); });
authSwitch.addEventListener('click', () => openAuth(authMode === 'register' ? 'login' : 'register'));
authSubmit.addEventListener('click', () => {
  authError.textContent = '';
  const res = authMode === 'register'
    ? register(authUsername.value, authPassword.value, authRegion.value, authEmail.value)
    : login(authUsername.value, authPassword.value);
  if (res.ok) {
    closeAuth();
    renderNavUser();
  } else {
    authError.textContent = res.error;
  }
});
authUsername.addEventListener('keydown', (e) => { if (e.key === 'Enter') authPassword.focus(); });
authPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') (authMode === 'register' ? authRegion : authSubmit).focus(); });
authRegion.addEventListener('keydown', (e) => { if (e.key === 'Enter') authEmail.focus(); });
authEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') authSubmit.click(); });

// === 分享图 ===
const overlayShareBtn = document.getElementById('overlay-share-btn');
const shareModal = document.getElementById('share-modal');
const sharePreviewImg = document.getElementById('share-preview-img');
const shareTextBox = document.getElementById('share-text-box');
const shareDownloadBtn = document.getElementById('share-download-btn');
const shareCopyBtn = document.getElementById('share-copy-btn');
const shareCloseBtn = document.getElementById('share-close');

let lastShareDataUrl = null;
let lastShareText = '';
let lastChallengeShareData = null; // 缓存最近参加/完成的挑战数据

// 获取用户在某榜单的最佳排名
function getUserBestRank(difficulty, period, username) {
  const records = getRecords(difficulty, period);
  for (let i = 0; i < records.length; i++) {
    if (records[i].name === username) {
      return { rank: i + 1, time: records[i].time };
    }
  }
  return null;
}

// 收集注册用户成绩数据
function collectUserStats(username) {
  const bestScores = {
    easy: getBestTime('easy'),
    medium: getBestTime('medium'),
    hard: getBestTime('hard'),
  };
  let totalWins = 0;
  for (const d of ['easy', 'medium', 'hard']) {
    totalWins += getRecords(d, 'all').filter(r => r.name === username).length;
  }
  const top3Rankings = {};
  for (const d of ['easy', 'medium', 'hard']) {
    for (const p of ['daily', 'monthly', 'yearly', 'all']) {
      const r = getUserBestRank(d, p, username);
      if (r) top3Rankings[`${d}_${p}`] = r;
    }
  }
  return { bestScores, totalWins, top3Rankings };
}

// 收集游戏结局分享数据 (场景 1-4)
function collectGameData() {
  const user = getCurrentUser();
  const seconds = Math.floor(timer.elapsed / 1000);
  const diff = game.difficulty;
  const config = DIFFICULTIES[diff];
  const totalSafeCells = config.rows * config.cols - config.mines;
  const isWin = game.gameState === 'won';
  const scenario = user
    ? (isWin ? 3 : 4)
    : (isWin ? 1 : 2);

  const data = {
    scenario,
    difficulty: diff,
    timeSeconds: seconds,
    mineCount: config.mines,
    revealedCount: game.revealedCount,
    totalSafeCells,
    wasBest: false,
    boardCanvas: canvas,
    username: user ? user.username : null,
  };

  if (user) {
    const stats = collectUserStats(user.username);
    Object.assign(data, stats);
    // Check if this was a new best
    const best = getBestTime(diff);
    data.wasBest = best !== null && seconds <= best;
    // 挑战完成数和累计退款
    data.challengesCompleted = myChallengesCache.filter(p => p.status === 'refunded').length;
    data.totalRefunded = myChallengesCache
      .filter(p => p.status === 'refunded')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
  }

  return data;
}

// 收集挑战分享数据 (场景 5-6)
function collectChallengeData(scenario, challenge, participation) {
  const user = getCurrentUser();
  const data = {
    scenario,
    username: user ? user.username : null,
    difficulty: challenge.difficulty,
    challenge,
    participation,
  };

  if (user) {
    const stats = collectUserStats(user.username);
    Object.assign(data, stats);
    // 挑战完成数和累计退款
    data.challengesCompleted = myChallengesCache.filter(p => p.status === 'refunded').length;
    data.totalRefunded = myChallengesCache
      .filter(p => p.status === 'refunded')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
  }

  return data;
}

// 生成并显示分享图
function showShareCard(data) {
  try {
    const result = generateShareCard(data);
    lastShareDataUrl = result.dataUrl;
    lastShareText = result.shareText;
    sharePreviewImg.src = result.dataUrl;
    shareTextBox.textContent = result.shareText;
    shareModal.classList.add('visible');
  } catch (e) {
    console.error('Share card generation failed:', e);
    alert(t('challenge.shareGenerateFail'));
  }
}

overlayShareBtn.addEventListener('click', () => {
  const data = collectGameData();
  showShareCard(data);
});

shareCloseBtn.addEventListener('click', () => {
  shareModal.classList.remove('visible');
});
shareModal.addEventListener('click', (e) => {
  if (e.target === shareModal) shareModal.classList.remove('visible');
});

shareDownloadBtn.addEventListener('click', () => {
  if (!lastShareDataUrl) return;
  const a = document.createElement('a');
  a.href = lastShareDataUrl;
  a.download = 'bean-boom-share.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

shareCopyBtn.addEventListener('click', () => {
  if (!lastShareText) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(lastShareText).then(() => {
      shareCopyBtn.textContent = t('common.copySuccess');
      setTimeout(() => { shareCopyBtn.textContent = t('share.copy'); }, 2000);
    }).catch(() => {
      fallbackCopyText(lastShareText);
    });
  } else {
    fallbackCopyText(lastShareText);
  }
});

function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); shareCopyBtn.textContent = t('common.copySuccess'); setTimeout(() => { shareCopyBtn.textContent = t('share.copy'); }, 2000); } catch(e) {}
  document.body.removeChild(ta);
}

// === 付费挑战 ===
const challengeSection = document.getElementById('challenge-section');
const challengeLoginHint = document.getElementById('challenge-login-hint');
const challengeTabs = document.getElementById('challenge-tabs');
const challengeList = document.getElementById('challenge-list');
const myChallengesEl = document.getElementById('my-challenges');

let currentChTab = 'available';
let challengesCache = [];
let myChallengesCache = [];

function renderChallengeSection() {
  const user = getCurrentUser();
  challengeLoginHint.style.display = user ? 'none' : '';
  challengeTabs.style.display = '';
  challengeList.style.display = currentChTab === 'available' ? '' : 'none';
  myChallengesEl.style.display = currentChTab === 'mine' ? '' : 'none';
  loadChallenges();
  loadMyChallenges();
}

async function loadChallenges() {
  const res = await getChallenges();
  const daysOf = c => c.period === 'yearly' ? 365 : c.period === 'custom' ? (c.customDays || 30) : 30;
  challengesCache = res.ok ? [...res.data].sort((a, b) => a.amount - b.amount || daysOf(a) - daysOf(b)) : [];
  renderChallengeList();
}

function renderChallengeList() {
  if (!challengesCache.length) {
    challengeList.innerHTML = '<div class="ch-empty">' + t('challenge.empty') + '</div>';
    return;
  }
  challengeList.innerHTML = challengesCache.map(c => {
    const diffLabel = t('game.diff.' + c.difficulty) || c.difficulty;
    const periodLabel = getChallengePeriodLabel(c.period, c.customDays);
    const displayName = getLocalizedChallengeName(c);
    return `<div class="ch-card">
      <div class="ch-card-info">
        <div class="ch-card-name">${escapeHtml(displayName)}</div>
        <div class="ch-card-meta">
          <span class="ch-badge ch-badge-${c.difficulty}">${diffLabel}</span>
          <span class="ch-badge ch-badge-period">${periodLabel}</span>
          <span class="ch-badge ch-badge-target">${t('challenge.goal', c.targetCount)}</span>
        </div>
      </div>
      <div class="ch-card-right">
        <div>
          <span class="ch-card-amount">$${c.amount}</span>
          <span class="ch-card-amount-label">${t('challenge.fee')}</span>
        </div>
        <button class="ch-join-btn" data-ch-id="${c.id}">${t('challenge.join')}</button>
      </div>
    </div>`;
  }).join('');
}

async function loadMyChallenges() {
  const user = getCurrentUser();
  if (!user) {
    myChallengesEl.innerHTML = '<div class="ch-empty">' + t('challenge.loginToView') + '</div>';
    return;
  }
  const res = await getMyChallenges(user.username);
  if (!res.ok) return;
  myChallengesCache = res.data;
  renderMyChallenges(res.data);
}

function renderMyChallenges(list) {
  const user = getCurrentUser();
  const dateLocale = getLang() === 'en' ? 'en-US' : 'zh-CN';
  const regDate = user && user.createdAt
    ? new Date(user.createdAt).toLocaleString(dateLocale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';
  const userInfoHtml = user
    ? `<div class="mc-user-info">
        <span class="mc-user-name">${escapeHtml(user.username)}</span>
        <span class="mc-user-region">${escapeHtml(user.region || '—')}</span>
        <span class="mc-user-reg">${t('challenge.registeredAt', regDate)}</span>
      </div>`
    : '';

  if (!list.length) {
    myChallengesEl.innerHTML = userInfoHtml + '<div class="ch-empty">' + t('challenge.noRecords') + '</div>';
    return;
  }

  const fmtDate = (ts) => {
    const d = new Date(ts);
    return d.toLocaleString(dateLocale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };
  const fmtRemaining = (ts) => {
    const ms = ts - Date.now();
    if (ms <= 0) return t('challenge.expiredNoRefund');
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    if (days > 0) return t('challenge.remaining', days, hours);
    const mins = Math.floor((ms % 3600000) / 60000);
    return t('challenge.remainingHours', hours, mins);
  };

  myChallengesEl.innerHTML = userInfoHtml + list.map(p => {
    const diffLabel = t('game.diff.' + p.difficulty) || p.difficulty;
    const displayName = getLocalizedChallengeName(p);
    const statusMap = {
      active: { label: t('challenge.status.active'), cls: 'mc-status-active' },
      refunded: { label: t('challenge.status.refunded'), cls: 'mc-status-refunded' },
      expired: { label: t('challenge.status.expired'), cls: 'mc-status-expired' },
    };
    const st = statusMap[p.status] || statusMap.expired;
    const pct = Math.min(100, (p.progress / p.targetCount) * 100);
    const expStr = fmtDate(p.expiresAt);
    if (p.status === 'active') {
      return `<div class="mc-item">
        <div class="mc-item-header">
          <span class="mc-item-name">${escapeHtml(displayName)} <span class="ch-badge ch-badge-${p.difficulty}">${diffLabel}</span></span>
          <span class="mc-status ${st.cls}">${st.label}</span>
        </div>
        <div class="mc-progress-bar"><div class="mc-progress-fill" style="width:${pct}%"></div></div>
        <div class="mc-progress-text"><span>${t('challenge.progress', p.progress, p.targetCount)}</span><span>$${p.amount}</span></div>
        <div class="mc-deadline">${t('challenge.deadline', expStr, fmtRemaining(p.expiresAt))}</div>
      </div>`;
    }
    const refundDetail = p.status === 'refunded'
      ? `<div class="mc-refund-box mc-refund-done">
           <div class="mc-refund-row"><span>${t('challenge.refundAmount')}</span><span class="mc-refund-amount">$${p.amount}</span></div>
           <div class="mc-refund-row"><span>${t('challenge.refundTime')}</span><span>${p.refundedAt ? fmtDate(p.refundedAt) : '—'}</span></div>
           <div class="mc-refund-row"><span>${t('challenge.refundTxId')}</span><span class="mc-refund-tx">${p.refundTxId || '—'}</span></div>
           <div class="mc-refund-row"><span>${t('challenge.paymentTxId')}</span><span class="mc-refund-tx">${p.paymentTxId || '—'}</span></div>
         </div>
         <button class="share-trigger-btn mc-share-btn" data-pt-idx="${list.indexOf(p)}">${t('challenge.shareDone')}</button>`
      : `<div class="mc-refund-box mc-refund-none">
           <div class="mc-refund-row"><span>${t('challenge.refundStatus')}</span><span>${t('challenge.refundDenied')}</span></div>
           <div class="mc-refund-row"><span>${t('challenge.refundReason')}</span><span>${t('challenge.noRefundReason', p.progress, p.targetCount)}</span></div>
           <div class="mc-refund-row"><span>${t('challenge.paymentTxId')}</span><span class="mc-refund-tx">${p.paymentTxId || '—'}</span></div>
         </div>`;
    return `<div class="mc-item">
      <div class="mc-item-header">
        <span class="mc-item-name">${escapeHtml(displayName)} <span class="ch-badge ch-badge-${p.difficulty}">${diffLabel}</span></span>
        <span class="mc-status ${st.cls}">${st.label}</span>
      </div>
      <div class="mc-progress-bar"><div class="mc-progress-fill" style="width:${pct}%"></div></div>
      <div class="mc-progress-text"><span>${t('challenge.progress', p.progress, p.targetCount)}</span><span>$${p.amount}</span></div>
      <div class="mc-deadline">${t('challenge.deadlineSimple', expStr)}</div>
      ${refundDetail}
    </div>`;
  }).join('');
}

challengeTabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.ch-tab');
  if (!tab) return;
  currentChTab = tab.dataset.chTab;
  document.querySelectorAll('.ch-tab').forEach(t => t.classList.toggle('active', t === tab));
  challengeList.style.display = currentChTab === 'available' ? '' : 'none';
  myChallengesEl.style.display = currentChTab === 'mine' ? '' : 'none';
  if (currentChTab === 'mine') loadMyChallenges();
});

// 分享挑战完成 (场景 6) 事件委托
myChallengesEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.mc-share-btn');
  if (!btn) return;
  const idx = parseInt(btn.dataset.ptIdx);
  const p = myChallengesCache[idx];
  if (!p) return;
  const ch = challengesCache.find(c => c.id == p.challengeId)
    || { name: p.challengeName, difficulty: p.difficulty, amount: p.amount, targetCount: p.targetCount, period: p.period, customDays: p.customDays };
  const days = p.refundedAt ? Math.ceil((p.refundedAt - p.joinedAt) / 86400000) : 0;
  const shareData = collectChallengeData(6, ch, { ...p, targetCount: p.targetCount });
  shareData.challengeDays = days;
  showShareCard(shareData);
});

challengeList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.ch-join-btn');
  if (!btn) return;
  const user = getCurrentUser();
  if (!user) {
    openAuth('register');
    return;
  }
  btn.disabled = true;
  btn.textContent = t('common.loading');
  const res = await participate(btn.dataset.chId, user.username);
  if (res.ok) {
    btn.textContent = t('challenge.joined');
    // 缓存挑战数据用于分享 (res.data 直接是 participation 对象)
    const ch = challengesCache.find(c => c.id == btn.dataset.chId);
    if (ch) {
      const shareData = collectChallengeData(5, ch, res.data);
      lastChallengeShareData = shareData;
      btn.insertAdjacentHTML('afterend', '<button class="share-trigger-btn ch-share-btn" id="ch-share-join-btn">' + t('challenge.share') + '</button>');
      document.getElementById('ch-share-join-btn')?.addEventListener('click', () => {
        showShareCard(lastChallengeShareData);
      });
    }
    loadMyChallenges();
  } else {
    btn.disabled = false;
    btn.textContent = t('challenge.join');
    alert(res.error);
  }
});

setInterval(() => { if (getCurrentUser() && currentChTab === 'mine') loadMyChallenges(); }, 30000);

renderNavUser();

// === 重新开始（当前难度） ===
function restart() {
  animManager.clear();
  game.init();
  timer.reset();
  renderer.render(game.grid);
  mineCountEl.textContent = game.getRemainingMines();
  timerEl.textContent = '00:00';
  overlay.classList.remove('visible');
  overlayShareBtn.style.display = 'none';
  bgmManager.switchTo(game.difficulty);
}

// === 切换难度 ===
function changeDifficulty(diff) {
  animManager.clear();
  game.setDifficulty(diff);
  renderer.setDifficulty(diff);
  timer.reset();
  renderer.render(game.grid);
  mineCountEl.textContent = game.getRemainingMines();
  timerEl.textContent = '00:00';
  overlay.classList.remove('visible');
  bgmManager.switchTo(diff);

  // 更新难度按钮高亮
  diffBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diff === diff);
  });

  // 重置标记模式
  inputHandler.setFlagMode(false);
  modeRevealBtn.classList.add('active');
  modeFlagBtn.classList.remove('active');
}

// === 输入处理 ===
const inputHandler = new InputHandler(
  canvas, renderer, game, animManager,
  () => {
    if (game.gameState === 'playing' && !timer.intervalId) {
      timer.start();
    }
    updateUI();
  },
  soundManager
);

// === 事件绑定 ===

// 难度切换
diffBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    changeDifficulty(btn.dataset.diff);
  });
});

// 标记模式切换
function setMode(mode) {
  if (mode === 'flag') {
    inputHandler.setFlagMode(true);
    modeRevealBtn.classList.remove('active');
    modeFlagBtn.classList.add('active');
  } else {
    inputHandler.setFlagMode(false);
    modeRevealBtn.classList.add('active');
    modeFlagBtn.classList.remove('active');
  }
}

modeRevealBtn.addEventListener('click', () => setMode('reveal'));
modeFlagBtn.addEventListener('click', () => setMode('flag'));

// 音效开关
soundBtn.addEventListener('click', () => {
  const muted = !soundManager.isMuted();
  soundManager.setMuted(muted);
  bgmManager.setMuted(muted);
  soundBtn.textContent = muted ? '🔇' : '🔊';
});

// 窗口尺寸变化
let resizeTimer = null;
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderer.resize();
    renderer.render(game.grid, animManager);
  }, 150);
});

// 初次渲染
renderer.render(game.grid);
mineCountEl.textContent = game.getRemainingMines();

// 按钮事件
document.getElementById('restart-btn').addEventListener('click', restart);
overlayRestart.addEventListener('click', () => {
  if (game.gameState === 'won') {
    const name = overlayNameInput.value.trim() || t('common.anonymous');
    const region = overlayRegionInput.value.trim() || '';
    const seconds = Math.floor(timer.elapsed / 1000);
    const wasBest = addRecord(game.difficulty, seconds, name, region);
    renderLeaderboard();
    renderYearlyChampions();
    // 更新付费挑战进度
    const _cu = getCurrentUser();
    if (_cu) updateProgress(_cu.username, game.difficulty).then(r => {
      if (r.ok && r.data.updated > 0) loadMyChallenges();
    });
    if (wasBest) {
      overlayRestart.textContent = t('game.newRecord');
      overlayRestart.disabled = true;
      setTimeout(restart, 900);
    } else {
      restart();
    }
  } else {
    restart();
  }
});

// === 全球排行榜（内联，游戏下方） ===
const lbTriggerBtn = document.getElementById('lb-trigger-btn');
const lbInline = document.getElementById('lb-inline');
const lbDiffTabs = document.getElementById('lb-diff-tabs');
const lbPeriodTabs = document.getElementById('lb-period-tabs');
const lbScrollTrack = document.getElementById('lb-scroll-track');
const lbYearlyChampions = document.getElementById('lb-yearly-champions');

let currentLbDiff = 'easy';
let currentLbPeriod = 'daily';

// 各难度对应的榜单时间维度
const LB_PERIODS = {
  easy: ['daily'],
  medium: ['daily', 'monthly'],
  hard: ['monthly', 'yearly', 'all'],
};
const LB_DEFAULT_PERIOD = {
  easy: 'daily',
  medium: 'daily',
  hard: 'monthly',
};

function renderLeaderboard() {
  // 难度 tab 高亮
  lbDiffTabs.querySelectorAll('.lb-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lbDiff === currentLbDiff);
  });
  // 按难度显示对应的榜单时间维度，隐藏不相关的 tab
  const periods = LB_PERIODS[currentLbDiff] || ['all'];
  lbPeriodTabs.classList.remove('hidden');
  lbPeriodTabs.querySelectorAll('.lb-tab').forEach(btn => {
    const visible = periods.includes(btn.dataset.lbPeriod);
    btn.style.display = visible ? '' : 'none';
    btn.classList.toggle('active', visible && btn.dataset.lbPeriod === currentLbPeriod);
  });
  const records = getRecords(currentLbDiff, currentLbPeriod);
  if (!records.length) {
    lbScrollTrack.innerHTML = '<div class="lb-empty">' + t('lb.empty') + '</div>';
    return;
  }
  const rowsHtml = records.map((r, i) => {
    const rank = i + 1;
    const rankText = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : String(rank);
    return `<div class="lb-row${rank === 1 ? ' lb-row-top' : ''}">
      <span class="lb-rank">${rankText}</span>
      <span class="lb-name">${escapeHtml(r.name)}</span>
      <span class="lb-region">${escapeHtml(r.region || '—')}</span>
      <span class="lb-time">${formatSeconds(r.time)}</span>
      <span class="lb-date">${formatDateTime(r.timestamp)}</span>
    </div>`;
  }).join('');
  lbScrollTrack.innerHTML = rowsHtml;
}

// 当年年度榜首：三难度年度第一名汇总，跟随记录随时更新
function renderYearlyChampions() {
  const champs = getYearlyChampions();
  lbYearlyChampions.querySelectorAll('.lb-yc-card').forEach(card => {
    const diff = card.dataset.ycDiff;
    const r = champs[diff];
    const diffLabel = t('game.diff.' + diff);
    if (r) {
      card.innerHTML = `
        <span class="lb-yc-diff">${t('lb.yearlyChamp', diffLabel)}</span>
        <span class="lb-yc-name">${escapeHtml(r.name)}</span>
        <span class="lb-yc-region">${escapeHtml(r.region || '—')}</span>
        <span class="lb-yc-time">${formatSeconds(r.time)}</span>
        <span class="lb-yc-date">${formatDateTime(r.timestamp)}</span>`;
    } else {
      card.innerHTML = `
        <span class="lb-yc-diff">${t('lb.yearlyChamp', diffLabel)}</span>
        <span class="lb-yc-empty">${t('lb.noRecord')}</span>`;
    }
  });
}

// 🏆 按钮滚动到全球排行榜
lbTriggerBtn.addEventListener('click', () => {
  currentLbDiff = game.difficulty;
  currentLbPeriod = LB_DEFAULT_PERIOD[game.difficulty];
  renderLeaderboard();
  lbInline.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
lbDiffTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.lb-tab');
  if (!btn) return;
  currentLbDiff = btn.dataset.lbDiff;
  // 切换难度后，若当前时间维度不在新难度列表中，重置为该难度默认
  if (!LB_PERIODS[currentLbDiff].includes(currentLbPeriod)) {
    currentLbPeriod = LB_DEFAULT_PERIOD[currentLbDiff];
  }
  renderLeaderboard();
});
lbPeriodTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.lb-tab');
  if (!btn) return;
  currentLbPeriod = btn.dataset.lbPeriod;
  renderLeaderboard();
});

// 初始渲染全球排行榜
renderLeaderboard();
renderYearlyChampions();

// === 网站配置：SEO / 广告位 / 网站活动 ===

// 应用 SEO 配置到 head
function applySeoConfig() {
  const seo = getSeoConfig();
  if (seo.title) document.getElementById('page-title').textContent = seo.title;
  if (seo.description) document.getElementById('meta-description').setAttribute('content', seo.description);
  if (seo.keywords) document.getElementById('meta-keywords').setAttribute('content', seo.keywords);
}

// 渲染 Google 广告位
function renderAdSlots() {
  const ads = getAdsConfig();
  const slots = document.querySelectorAll('.ad-slot');
  if (!ads.enabled || !ads.adsenseClient) {
    // 未启用广告：完全隐藏广告位
    slots.forEach(el => {
      el.classList.remove('has-ad');
      el.style.display = 'none';
      el.innerHTML = '';
    });
    return;
  }
  // 注入 AdSense 脚本（仅一次）
  if (!document.getElementById('adsense-script')) {
    const script = document.createElement('script');
    script.id = 'adsense-script';
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ads.adsenseClient}`;
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);
  }
  // 每个广告位注入对应的 ins 标签
  slots.forEach(el => {
    const pos = el.dataset.adPos;
    const slotId = ads.slots[pos];
    if (slotId) {
      el.style.display = '';
      el.classList.add('has-ad');
      el.innerHTML = `<ins class="adsbygoogle" style="display:block;width:100%" data-ad-client="${ads.adsenseClient}" data-ad-slot="${slotId}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    } else {
      // 该位置未配置 Slot ID：隐藏
      el.classList.remove('has-ad');
      el.style.display = 'none';
      el.innerHTML = '';
    }
  });
}

// 渲染网站活动
function renderActivities() {
  const container = document.getElementById('activities-content');
  const list = getActivities(true);  // 仅显示已上线
  if (!list.length) {
    container.innerHTML = '<p class="activity-empty">' + t('activity.empty') + '</p>';
    return;
  }
  container.innerHTML = list.map(a => `
    <div class="activity-item">
      <span class="activity-date">${escapeHtml(a.date)}</span>
      <div class="activity-title">${escapeHtml(a.title)}</div>
      <div class="activity-content">${escapeHtml(a.content)}</div>
    </div>
  `).join('');
}

// 渲染顶端活动通知（最新5条已上线活动）
function renderActivityNotices() {
  const container = document.getElementById('activity-notices');
  const list = getLatestActivities(5);
  if (!list.length) {
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  container.innerHTML = list.map((a, i) => {
    const isNew = i === 0;
    return `<div class="notice-item${isNew ? ' notice-new' : ''}">
      <span class="notice-badge">${isNew ? t('common.new') : t('common.notice')}</span>
      <span class="notice-date">${escapeHtml(a.date)}</span>
      <span class="notice-title">${escapeHtml(a.title)}</span>
      ${a.content ? `<span class="notice-content">${escapeHtml(a.content)}</span>` : ''}
    </div>`;
  }).join('');
}

// 渲染底部内容（关于我们/隐私政策/联系我们）
function renderFooterContent() {
  const fc = getFooterContent();
  const fields = [
    { id: 'footer-about', titleKey: 'footer.aboutTitle', textKey: 'footer.aboutText', titleVal: fc.aboutTitle, textVal: fc.aboutText },
    { id: 'footer-privacy', titleKey: 'footer.privacyTitle', textKey: 'footer.privacyText', titleVal: fc.privacyTitle, textVal: fc.privacyText },
    { id: 'footer-contact', titleKey: 'footer.contactTitle', textKey: 'footer.contactText', titleVal: fc.contactTitle, textVal: fc.contactText },
  ];
  fields.forEach(f => {
    const el = document.getElementById(f.id);
    if (!el) return;
    const h3 = el.querySelector('.footer-title');
    const p = el.querySelector('p');
    if (h3) h3.textContent = f.titleVal || t(f.titleKey);
    if (p) p.textContent = f.textVal || t(f.textKey);
  });
  // 邮箱
  const contactEl = document.getElementById('footer-contact');
  if (contactEl) {
    const emailP = contactEl.querySelectorAll('p')[1];
    if (emailP) {
      emailP.textContent = fc.contactEmail ? t('footer.emailPrefix') + fc.contactEmail : t('footer.email');
    }
  }
}

// 顶部导航跳转
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = document.getElementById('footer-' + btn.dataset.nav);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
});

// 初始化网站配置
applySeoConfig();
renderAdSlots();
renderActivities();
renderActivityNotices();
renderFooterContent();

// === i18n 初始化 ===
scanI18n();

// 语言切换按钮
document.getElementById('nav-lang-btn').addEventListener('click', () => {
  const next = getLang() === 'zh' ? 'en' : 'zh';
  setLang(next);
});

// 语言变更时刷新所有动态内容
onLangChange((lang) => {
  // 更新 HTML lang 属性
  document.getElementById('html-root').setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en-US');
  // 重新扫描静态文本
  scanI18n();
  // 重新渲染动态内容
  renderNavUser();
  renderChallengeSection();
  renderLeaderboard();
  renderYearlyChampions();
  renderActivities();
  renderActivityNotices();
  applySeoConfig();
  renderFooterContent();
  // 更新触摸设备提示
  if (isTouchDevice) hintText.textContent = t('game.touchHint');
  // 更新游戏状态中的 overlay 文本（如果可见）
  if (overlay.classList.contains('visible')) updateUI();
  // 更新 SEO meta
  document.title = t('common.siteTitle');
});

// BGM：等待首次用户交互后启动菜单背景音乐（浏览器 autoplay 策略）
let _bgmStarted = false;
function _tryStartBGM() {
  if (_bgmStarted) return;
  _bgmStarted = true;
  bgmManager.switchTo('menu');
  document.removeEventListener('click', _tryStartBGM);
  document.removeEventListener('keydown', _tryStartBGM);
  document.removeEventListener('touchstart', _tryStartBGM);
}
document.addEventListener('click', _tryStartBGM);
document.addEventListener('keydown', _tryStartBGM);
document.addEventListener('touchstart', _tryStartBGM);
