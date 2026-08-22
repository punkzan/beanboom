import { Game } from './core/Game.js';
import { Timer } from './core/Timer.js';
import { Renderer } from './render/Renderer.js';
import { AnimationManager } from './render/Animation.js';
import { ParticleSystem } from './render/Particles.js';
import { InputHandler } from './input/InputHandler.js';
import { SoundManager } from './audio/SoundManager.js';
import { BGMManager } from './audio/BGMManager.js';
import { DIFFICULTIES } from './constants.js';
import { addRecord, getBestTime, getRecords, getYearlyChampions, refreshRecords, addScoreRecord, getScoreRecords, getBestScore, refreshScoreRecords } from './core/Leaderboard.js';
import { getSeoConfig, getAdsConfig, getActivities, getLatestActivities, fetchFooterContent, fetchFriendLinks } from './core/SiteConfig.js';
import { register, login, logout, getCurrentUser } from './core/Auth.js';
import { getChallenges, participate, getMyChallenges, updateProgress, capturePaypalPayment } from './core/ChallengeAPI.js';
import { generateShareCard } from './core/ShareCard.js';
import { ScoreSystem } from './core/ScoreSystem.js';
import { GameLog } from './core/GameLog.js';
import { getDailyBackgroundUrl, getFallbackUrl, preloadBackgroundImage, initBackgroundImage } from './core/BackgroundImage.js';
import { t, scanI18n, getLang, setLang, onLangChange } from './i18n.js';

// 门户构建开关（CrazyGames 等平台）：VITE_PORTAL=1 时禁用广告、付费挑战、登录
const PORTAL = import.meta.env.VITE_PORTAL === '1';

// === 双模式（彩蛋 / 经典）===
// 彩蛋模式：连锁爆破 + 计分 + FEVER，按得分排行（日/月/总榜），无付费挑战
// 经典模式：纯净扫雷，按用时排行（日/月/年榜），含付费挑战
// 模式来源优先级：URL ?mode= 参数（着陆页 CTA）> localStorage > 默认 egg
const urlMode = new URLSearchParams(window.location.search).get('mode');
let gameMode;
if (urlMode === 'classic' || urlMode === 'egg') {
  gameMode = urlMode;
  localStorage.setItem('bb-game-mode', urlMode);
} else {
  gameMode = localStorage.getItem('bb-game-mode') === 'classic' ? 'classic' : 'egg';
}

let game = new Game('easy', gameMode);
const canvas = document.getElementById('game-canvas');
let renderer = new Renderer(canvas, 'easy');
const animManager = new AnimationManager();
const soundManager = new SoundManager();
const bgmManager = new BGMManager();

// === Phase 4：粒子系统（挂在 Renderer 上层，由 animManager 的 rAF 循环统一驱动）===
const particles = new ParticleSystem();
renderer.setParticles(particles);
animManager.register(particles); // update + hasActive + clear

animManager.onUpdate = () => {
  renderer.render(game.grid, animManager);
};

// DOM 元素
const mineCountEl = document.getElementById('mine-count');
const timerEl = document.getElementById('timer');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySubtitle = document.getElementById('overlay-subtitle');
const overlayScore = document.getElementById('overlay-score');
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

// === 计分系统（概念 D：连击 / 模式评分）===
const scoreSystem = new ScoreSystem();
// === 对局日志（服务端重算反作弊）===
const gameLog = new GameLog();
gameLog.start('easy', game.mineSeed, gameMode);
const scoreDisplayEl = document.getElementById('score-display');
const comboItemEl = document.getElementById('combo-item');
const comboDisplayEl = document.getElementById('combo-display');
const boardWrapper = document.querySelector('.board-wrapper');

const MILESTONE_TEXT = { nice: 'Nice!', great: 'Great!', amazing: 'Amazing!', fever: 'BEAN FEVER!' };
const LABEL_TEXT = { greatOpening: 'Great Opening!', perfectChord: 'Perfect Chord!', beanBoom: 'Bean Boom!' };
function showFloatText(text, pos, cls) {
  if (!pos || !boardWrapper) return;
  const rect = canvas.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'fly-text' + (cls ? ' ' + cls : '');
  el.textContent = text;
  el.style.left = (rect.left + pos.col * renderer.cellSize + renderer.cellSize / 2) + 'px';
  el.style.top = (rect.top + pos.row * renderer.cellSize) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

function showBoardLabel(text, isFever) {
  const rect = canvas.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'fly-label' + (isFever ? ' fever' : '');
  el.textContent = text;
  el.style.left = (rect.left + rect.width / 2) + 'px';
  el.style.top = (rect.top + rect.height * 0.28) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function refreshComboUI() {
  const active = game.gameState === 'playing' && scoreSystem.displayCombo() > 0;
  const fever = scoreSystem.displayFever();
  // 用 visibility 切换保留占位，避免状态栏宽度变化导致棋盘卡片「呼吸」
  comboItemEl.style.visibility = active ? 'visible' : 'hidden';
  if (active) {
    comboDisplayEl.textContent = '×' + scoreSystem.displayMultiplier().toFixed(1);
    comboItemEl.classList.toggle('hot', scoreSystem.displayCombo() >= 5);
    comboItemEl.classList.toggle('fever', fever);
  } else {
    comboItemEl.classList.remove('hot', 'fever');
  }
  // FEVER 棋盘发光
  if (boardWrapper) boardWrapper.classList.toggle('fever', fever);
  // 同步 FEVER 状态到 Game（blast 半径 +1）
  game.feverActive = fever;
}
setInterval(refreshComboUI, 500);

// === 分数 count-up 动画（Phase 4：替代直接跳变）===
let scoreAnimRaf = null;
let displayedScore = 0;
function animateScoreTo(target) {
  if (scoreAnimRaf) cancelAnimationFrame(scoreAnimRaf);
  const from = displayedScore;
  if (from === target) {
    scoreDisplayEl.textContent = target.toLocaleString();
    return;
  }
  const start = performance.now();
  const dur = Math.min(600, 220 + Math.abs(target - from) * 1.5);
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    displayedScore = Math.round(from + (target - from) * eased);
    scoreDisplayEl.textContent = displayedScore.toLocaleString();
    scoreAnimRaf = t < 1 ? requestAnimationFrame(step) : null;
  };
  scoreAnimRaf = requestAnimationFrame(step);
}

function handleScoreEvent({ type, cells, pos, cascadeCount = 0 }) {
  // 计分玩法仅彩蛋模式；经典模式无计分/连击/FEVER
  if (gameMode !== 'egg') return;
  const res = scoreSystem.onReveal(cells, type);
  if (res.gained > 0) {
    animateScoreTo(Math.floor(scoreSystem.rawScore));
    const cls = type === 'boom' ? (cascadeCount > 0 ? 'boom cascade' : 'boom') : '';
    showFloatText('+' + res.gained, pos, cls);
  }
  // 标签优先级：里程碑 > 级联 > 事件标签
  if (res.milestone) {
    showBoardLabel(MILESTONE_TEXT[res.milestone], res.milestone === 'fever');
    // Phase 4：里程碑火花迸发（FEVER 激活为大爆发 + 冲击波）
    const cx = renderer.cssWidth / 2;
    const cy = renderer.cssHeight * 0.3;
    if (res.milestone === 'fever') {
      particles.burstSparks(cx, cy, {
        count: 30,
        speed: 210,
        colors: ['#ff6b4a', '#ffd93d', '#ff9f43', '#fff3b0'],
        life: 700,
      });
      particles.spawnRing(cx, cy, {
        radius: renderer.cssWidth * 0.35,
        color: '#ff6b4a',
        life: 500,
      });
    } else {
      particles.burstSparks(cx, cy, { count: 12, speed: 130 });
    }
    animManager.wake();
  } else if (cascadeCount > 0) {
    showBoardLabel('CASCADE ×' + (cascadeCount + 1) + '!', true);
  } else if (res.label) {
    showBoardLabel(LABEL_TEXT[res.label], false);
  }
  // FEVER 激活时同步状态到 Game（blast 半径 +1）
  if (res.feverActivated) {
    game.feverActive = true;
    if (boardWrapper) boardWrapper.classList.add('fever');
  }
  refreshComboUI();
}

function resetScoreUI() {
  scoreSystem.reset();
  if (scoreAnimRaf) {
    cancelAnimationFrame(scoreAnimRaf);
    scoreAnimRaf = null;
  }
  displayedScore = 0;
  scoreDisplayEl.textContent = '0';
  comboItemEl.style.visibility = 'hidden';
  comboItemEl.classList.remove('hot', 'fever');
  if (boardWrapper) boardWrapper.classList.remove('fever');
  game.feverActive = false;
  overlayScore.textContent = '';
}

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

// === 背景标语渲染（多行重复 + 错位排列）===
const SLOGAN_OFFSETS = [0, 0.8, 1.5, 2, 3.5, 4.2, 5.5, 6.5, 8]; // em

function renderSlogan() {
  const container = document.getElementById('bg-slogan');
  if (!container) return;
  const sloganText = t('common.slogan');
  if (!sloganText) return;

  const separator = '\u2003\u2003'; // 两个全角空格
  const unit = sloganText + separator;

  // 通过临时元素测量单个重复单元的宽高，从而根据视口动态计算需要多少行/重复
  let phraseWidth = 0;
  let rowHeight = 0;
  const probe = document.createElement('span');
  probe.className = 'bg-slogan-row';
  probe.style.visibility = 'hidden';
  probe.style.position = 'absolute';
  probe.style.whiteSpace = 'nowrap';
  probe.style.pointerEvents = 'none';
  probe.textContent = unit;
  document.body.appendChild(probe);
  phraseWidth = probe.offsetWidth || 1;
  rowHeight = probe.offsetHeight || 1;
  document.body.removeChild(probe);

  const vw = window.innerWidth || 1920;
  const vh = window.innerHeight || 1080;

  // 容器是 200% 视口，需要内容完全填满；多给一些余量防止出现白边
  const reps = Math.max(6, Math.min(50, Math.ceil((vw * 2.5) / phraseWidth) + 3));
  const rows = Math.max(20, Math.min(120, Math.ceil((vh * 2.2) / rowHeight) + 5));

  const repeatedText = unit.repeat(reps);
  let html = '';
  for (let i = 0; i < rows; i++) {
    const offset = SLOGAN_OFFSETS[i % SLOGAN_OFFSETS.length];
    html += `<span class="bg-slogan-row" style="padding-left:${offset}em">${repeatedText}</span>`;
  }
  container.innerHTML = html;
}

// === UI 更新 ===
function updateUI() {
  mineCountEl.textContent = game.getRemainingMines();

  if (game.gameState === 'won') {
    timer.stop();
    bgmManager.switchTo('won');
    const seconds = Math.floor(timer.elapsed / 1000);

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

    if (gameMode === 'egg') {
      // 彩蛋模式：得分结算 + 历史最高分
      const settlement = scoreSystem.settle(game.difficulty, seconds, game.playerCorrectFlags || 0);
      overlayScore.textContent = t('game.scoreSummary', settlement.finalScore.toLocaleString(), settlement.rank);
      const bestScore = getBestScore(game.difficulty);
      overlayBest.textContent = bestScore !== null
        ? t('game.currentBest', bestScore.toLocaleString())
        : t('game.firstWin');
    } else {
      // 经典模式：无计分，展示历史最佳用时
      overlayScore.textContent = '';
      const best = getBestTime(game.difficulty);
      overlayBest.textContent = best !== null
        ? t('game.currentBest', formatSeconds(best))
        : t('game.firstWin');
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
    overlayScore.textContent = '';
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
  if (PORTAL) {
    // 门户构建：不显示登录/注册入口（平台不允许外部登录）
    navUser.innerHTML = '';
    return;
  }
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
let lastShareScore = null; // 缓存最近分享的战绩（用于生成 /share 深链 + 动态 OG）

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
    // 缓存战绩参数：win 场景才带时间（失败局分享纯品牌链接）
    const win = data.scenario === 1 || data.scenario === 3 || data.scenario === 6;
    lastShareScore = data.timeSeconds > 0 && win
      ? { diff: data.difficulty, time: data.timeSeconds, name: data.username || '', win: true }
      : { diff: data.difficulty, time: data.timeSeconds > 0 ? data.timeSeconds : null, name: data.username || '', win };
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
      shareCopyBtn.textContent = t('common.copySuccess');
      setTimeout(() => { shareCopyBtn.textContent = t('share.copy'); }, 2000);
    });
  } else {
    fallbackCopyText(lastShareText);
    shareCopyBtn.textContent = t('common.copySuccess');
    setTimeout(() => { shareCopyBtn.textContent = t('share.copy'); }, 2000);
  }
});

// === 社交平台一键分享 ===
const SITE_URL = 'https://bb.superzan.net/';

function buildShareUrl(platform) {
  const utm = `utm_source=${platform}&utm_medium=share&utm_campaign=score`;
  // 有战绩时生成 /share 深链：社交平台抓取时展示动态 OG 战绩卡
  if (lastShareScore) {
    const p = new URLSearchParams({ utm_source: platform, utm_medium: 'share', utm_campaign: 'score' });
    if (lastShareScore.time) p.set('time', String(lastShareScore.time));
    if (lastShareScore.name) p.set('name', lastShareScore.name);
    if (lastShareScore.diff) p.set('diff', lastShareScore.diff);
    p.set('w', lastShareScore.win ? '1' : '0');
    return `${SITE_URL}share?${p.toString()}`;
  }
  return `${SITE_URL}?${utm}`;
}

// 构建 OG 图公开 URL（Pinterest media 参数需要）
function buildOgImageUrl() {
  if (!lastShareScore) return null;
  const p = new URLSearchParams();
  if (lastShareScore.time) p.set('time', String(lastShareScore.time));
  if (lastShareScore.name) p.set('name', lastShareScore.name);
  if (lastShareScore.diff) p.set('diff', lastShareScore.diff);
  p.set('w', lastShareScore.win ? '1' : '0');
  return `${SITE_URL}og?${p.toString()}`;
}

// Reddit 专用标题：简短有力，含难度+时间+品牌名
function getRedditTitle() {
  if (lastShareScore && lastShareScore.win && lastShareScore.time) {
    const diffLabel = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }[lastShareScore.diff] || 'Easy';
    const m = Math.floor(lastShareScore.time / 60);
    const s = lastShareScore.time % 60;
    const timeStr = `${m}:${String(s).padStart(2, '0')}`;
    const namePart = lastShareScore.name ? `${lastShareScore.name} · ` : '';
    return `${namePart}${diffLabel} mode cleared in ${timeStr} — Bean Boom Minesweeper`;
  }
  return lastShareText || 'Bean Boom — Free Online Minesweeper';
}

function trackShare(method) {
  try {
    if (typeof gtag === 'function') gtag('event', 'share', { method });
  } catch (e) { /* GA 未加载时忽略 */ }
}

const PLATFORM_INTENTS = {
  twitter: (text, url, ogImage) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  reddit: (text, url, ogImage) => `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(getRedditTitle())}`,
  facebook: (text, url, ogImage) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  whatsapp: (text, url, ogImage) => `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`,
  telegram: (text, url, ogImage) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  bluesky: (text, url, ogImage) => `https://bsky.app/intent/compose?text=${encodeURIComponent(text + ' ' + url)}`,
  pinterest: (text, url, ogImage) => `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&media=${encodeURIComponent(ogImage || url)}&description=${encodeURIComponent(text)}`,
};

// Toast 提示
const shareToast = document.getElementById('share-toast');
let toastTimer = null;
function showToast(msg) {
  if (!shareToast) return;
  shareToast.textContent = msg;
  shareToast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => shareToast.classList.remove('visible'), 2500);
}

const PLATFORM_LABELS = {
  twitter: 'X', reddit: 'Reddit', facebook: 'Facebook',
  whatsapp: 'WhatsApp', telegram: 'Telegram', bluesky: 'Bluesky', pinterest: 'Pinterest',
};

// 移动端：系统分享面板（可携带战绩 PNG）
async function shareViaNative() {
  trackShare('native');
  if (!navigator.share) return;
  try {
    if (lastShareDataUrl) {
      const blob = await (await fetch(lastShareDataUrl)).blob();
      const file = new File([blob], 'bean-boom.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: lastShareText + ' ' + buildShareUrl('native'), title: 'Bean Boom' });
        return;
      }
    }
    await navigator.share({ text: lastShareText + ' ' + buildShareUrl('native'), title: 'Bean Boom' });
  } catch (e) { /* 用户取消或分享失败，静默 */ }
}

document.querySelectorAll('.share-platform-btn').forEach(btn => {
  const platform = btn.dataset.sharePlatform;
  // 不支持 Web Share API 的环境隐藏系统分享按钮
  if (platform === 'native' && !navigator.share) {
    btn.style.display = 'none';
    return;
  }
  btn.addEventListener('click', () => {
    if (platform === 'native') {
      shareViaNative();
      return;
    }
    trackShare(platform);
    const intent = PLATFORM_INTENTS[platform];
    if (intent) {
      const shareUrl = buildShareUrl(platform);
      const ogImage = buildOgImageUrl();
      // 必须在用户点击的同步调用栈内打开，避免被弹窗拦截
      window.open(intent(lastShareText, shareUrl, ogImage), '_blank', 'noopener,width=680,height=580');
      showToast(t('share.toast.opened', PLATFORM_LABELS[platform] || platform));
    }
  });
});

// Copy Link 按钮
const shareCopyLinkBtn = document.getElementById('share-copy-link-btn');
if (shareCopyLinkBtn) {
  shareCopyLinkBtn.addEventListener('click', () => {
    const link = buildShareUrl('copy');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(() => {
        shareCopyLinkBtn.textContent = t('common.copySuccess');
        showToast(t('share.copyLinkSuccess'));
        setTimeout(() => { shareCopyLinkBtn.textContent = t('share.copyLink'); }, 2000);
      }).catch(() => {
        fallbackCopyText(link);
        shareCopyLinkBtn.textContent = t('common.copySuccess');
        setTimeout(() => { shareCopyLinkBtn.textContent = t('share.copyLink'); }, 2000);
      });
    } else {
      fallbackCopyText(link);
      shareCopyLinkBtn.textContent = t('common.copySuccess');
      setTimeout(() => { shareCopyLinkBtn.textContent = t('share.copyLink'); }, 2000);
    }
  });
}

function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch(e) {}
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
  if (PORTAL || gameMode !== 'classic') {
    // 门户构建：隐藏付费挑战区（真实支付不被平台允许）
    // 彩蛋模式：无付费挑战模块（挑战归属经典模式）
    challengeSection.style.display = 'none';
    return;
  }
  challengeSection.style.display = '';
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

/** 挑战目标文案（按指标类型：wins / score / rank） */
function challengeGoalText(c) {
  const metric = c.metric || 'wins';
  if (metric === 'score') return t('challenge.goalScore', c.metricValue);
  if (metric === 'rank') return t('challenge.goalRank', c.metricValue);
  return t('challenge.goal', c.targetCount);
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
          <span class="ch-badge ch-badge-target">${challengeGoalText(c)}</span>
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
    // PayPal 模式：需要跳转到 PayPal 审批
    if (res.data.needsPaypalApproval) {
      sessionStorage.setItem('pp_pending', JSON.stringify({
        orderId: res.data.orderId,
        chId: btn.dataset.chId,
        username: user.username,
      }));
      window.location.href = res.data.approveUrl;
      return;
    }
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
  resetScoreUI();
  gameLog.start(game.difficulty, game.mineSeed, gameMode);
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
  resetScoreUI();
  gameLog.start(diff, game.mineSeed, gameMode);
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

// === 切换游戏模式（彩蛋 / 经典） ===
const gmodeEggBtn = document.getElementById('gmode-egg');
const gmodeClassicBtn = document.getElementById('gmode-classic');
const scoreCounterEl = document.querySelector('.score-counter');

/** 模式相关的 UI 显隐（计分面板 / 挑战区 / 榜单 / 年度冠军） */
function applyModeUI() {
  const isEgg = gameMode === 'egg';
  gmodeEggBtn.classList.toggle('active', isEgg);
  gmodeClassicBtn.classList.toggle('active', !isEgg);
  // 计分面板与连击指示仅彩蛋模式
  if (scoreCounterEl) scoreCounterEl.style.display = isEgg ? '' : 'none';
  if (comboItemEl) comboItemEl.style.display = isEgg ? '' : 'none';
  renderChallengeSection();
  renderLeaderboard();
  renderYearlyChampions();
}

function setGameMode(mode) {
  if (gameMode === mode) return;
  gameMode = mode;
  localStorage.setItem('bb-game-mode', mode);
  // 模式挂在 Game 实例上（init 不重置 mode），切换后重开一局
  game.mode = mode;
  restart();
  applyModeUI();
}

gmodeEggBtn.addEventListener('click', () => setGameMode('egg'));
gmodeClassicBtn.addEventListener('click', () => setGameMode('classic'));

// === 输入处理 ===
const inputHandler = new InputHandler(
  canvas, renderer, game, animManager,
  (action) => {
    if (game.gameState === 'playing' && !timer.intervalId) {
      timer.start();
    }
    if (action && action.scoreEvent) {
      handleScoreEvent(action.scoreEvent);
    }
    updateUI();
  },
  soundManager,
  gameLog,
  // flag 前同步 FEVER（确定性判定，服务端重放一致）
  () => { game.feverActive = scoreSystem.isFever && !scoreSystem.comboExpired(); },
  // Phase 4：reveal 音效升调取当前连击数
  () => scoreSystem.displayCombo(),
  // Phase 4：粒子系统
  particles
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
// 注意：初始 applyModeUI() 在 initLeaderboard 中调用——
// 它依赖下方 lb* DOM 常量与 LB_PERIODS（const 暂时性死区，提前调用会抛
// ReferenceError 中断脚本，导致提交按钮等后续监听器全部失效）

// 按钮事件
document.getElementById('restart-btn').addEventListener('click', restart);
overlayRestart.addEventListener('click', () => {
  if (game.gameState === 'won') {
    const name = overlayNameInput.value.trim() || t('common.anonymous');
    const region = overlayRegionInput.value.trim() || '';
    const seconds = Math.floor(timer.elapsed / 1000);
    const logData = gameLog.export();
    let wasBest;
    if (gameMode === 'egg') {
      // 彩蛋模式：提交得分榜（服务端重放验证分数）
      const settlement = scoreSystem.settle(game.difficulty, seconds, game.playerCorrectFlags || 0);
      wasBest = addScoreRecord(game.difficulty, settlement.finalScore, name, region, logData);
    } else {
      // 经典模式：提交用时榜 + 更新付费挑战进度（服务端重放验证）
      wasBest = addRecord(game.difficulty, seconds, name, region, logData);
      const _cu = getCurrentUser();
      if (_cu) updateProgress(_cu.username, game.difficulty, logData).then(r => {
        if (r.ok && r.data.updated > 0) {
          loadMyChallenges();
          // 有挑战完成 → 刷新挑战列表，允许用户再次参加
          if (r.data.completed > 0) renderChallengeList();
        }
      });
    }
    renderLeaderboard();
    renderYearlyChampions();
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

// 各难度对应的榜单时间维度（按模式区分，全难度统一）
// 经典模式：用时榜（日/月/年/总）；彩蛋模式：得分榜（日/月/总）
const LB_PERIODS_CLASSIC = { easy: ['daily', 'monthly', 'yearly', 'all'], medium: ['daily', 'monthly', 'yearly', 'all'], hard: ['daily', 'monthly', 'yearly', 'all'] };
const LB_PERIODS_EGG = { easy: ['daily', 'monthly', 'all'], medium: ['daily', 'monthly', 'all'], hard: ['daily', 'monthly', 'all'] };
const LB_PERIODS = { classic: LB_PERIODS_CLASSIC, egg: LB_PERIODS_EGG };
const LB_DEFAULT_PERIOD = { classic: { easy: 'daily', medium: 'daily', hard: 'daily' }, egg: { easy: 'daily', medium: 'daily', hard: 'daily' } };

function renderLeaderboard() {
  // 难度 tab 高亮
  lbDiffTabs.querySelectorAll('.lb-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lbDiff === currentLbDiff);
  });
  // 按模式+难度显示对应的榜单时间维度，隐藏不相关的 tab
  const periods = (LB_PERIODS[gameMode] || LB_PERIODS_EGG)[currentLbDiff] || ['all'];
  if (!periods.includes(currentLbPeriod)) {
    currentLbPeriod = (LB_DEFAULT_PERIOD[gameMode] || LB_DEFAULT_PERIOD.egg)[currentLbDiff] || 'daily';
  }
  lbPeriodTabs.classList.remove('hidden');
  lbPeriodTabs.querySelectorAll('.lb-tab').forEach(btn => {
    const visible = periods.includes(btn.dataset.lbPeriod);
    btn.style.display = visible ? '' : 'none';
    btn.classList.toggle('active', visible && btn.dataset.lbPeriod === currentLbPeriod);
  });
  const records = gameMode === 'egg'
    ? getScoreRecords(currentLbDiff, currentLbPeriod)
    : getRecords(currentLbDiff, currentLbPeriod);
  if (!records.length) {
    lbScrollTrack.innerHTML = '<div class="lb-empty">' + t('lb.empty') + '</div>';
    return;
  }
  const metricHtml = gameMode === 'egg'
    ? (r) => `<span class="lb-time">⭐ ${Number(r.score).toLocaleString()}</span>`
    : (r) => `<span class="lb-time">${formatSeconds(r.time)}</span>`;
  const rowsHtml = records.map((r, i) => {
    const rank = i + 1;
    const rankText = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : String(rank);
    return `<div class="lb-row${rank === 1 ? ' lb-row-top' : ''}">
      <span class="lb-rank">${rankText}</span>
      <span class="lb-name">${escapeHtml(r.name)}</span>
      <span class="lb-region">${escapeHtml(r.region || '—')}</span>
      ${metricHtml(r)}
      <span class="lb-date">${formatDateTime(r.timestamp)}</span>
    </div>`;
  }).join('');
  lbScrollTrack.innerHTML = rowsHtml;
}

// 当年年度榜首：三难度年度第一名汇总，跟随记录随时更新（仅经典模式用时榜）
function renderYearlyChampions() {
  // 彩蛋模式得分榜无年度维度
  lbYearlyChampions.style.display = gameMode === 'classic' ? '' : 'none';
  if (gameMode !== 'classic') return;
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
  currentLbPeriod = (LB_DEFAULT_PERIOD[gameMode] || LB_DEFAULT_PERIOD.egg)[game.difficulty] || 'daily';
  renderLeaderboard();
  lbInline.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
lbDiffTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.lb-tab');
  if (!btn) return;
  currentLbDiff = btn.dataset.lbDiff;
  // 切换难度后，若当前时间维度不在新列表中，重置为默认（renderLeaderboard 内兜底）
  if (!(LB_PERIODS[gameMode] || LB_PERIODS_EGG)[currentLbDiff].includes(currentLbPeriod)) {
    currentLbPeriod = (LB_DEFAULT_PERIOD[gameMode] || LB_DEFAULT_PERIOD.egg)[currentLbDiff];
  }
  renderLeaderboard();
});
lbPeriodTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.lb-tab');
  if (!btn) return;
  currentLbPeriod = btn.dataset.lbPeriod;
  renderLeaderboard();
});

// 初始渲染全球排行榜（先从服务端拉取全局数据，再渲染；双模式两套榜单都拉）
(async function initLeaderboard() {
  // 应用初始模式 UI（localStorage 恢复的模式）——须在全部 lb*/LB_PERIODS 常量声明之后执行
  applyModeUI();
  await Promise.all([refreshRecords(), refreshScoreRecords()]);
  renderLeaderboard();
  renderYearlyChampions();
})();

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
  if (PORTAL || !ads.enabled || !ads.adsenseClient) {
    // 未启用广告（或门户构建）：完全隐藏广告位
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

// 渲染底部内容（关于我们/隐私政策/联系我们）——从服务端 KV 获取，全局生效
async function renderFooterContent() {
  const fc = await fetchFooterContent();
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

// === i18n 初始化 ===（必须在 renderFooterContent 之前，否则 scanI18n 会覆盖动态内容）
scanI18n();

// 底部内容（依赖 scanI18n 之后执行，使用管理后台保存的自定义文案）
renderFooterContent();

// 友情链接（从服务端 KV 获取，全局生效）
renderFriendLinks();

async function renderFriendLinks() {
  const links = await fetchFriendLinks();
  const container = document.getElementById('friend-links-list');
  const wrapper = document.getElementById('footer-friend-links');
  if (!container || !wrapper) return;
  if (!links.length) {
    wrapper.style.display = 'none';
    return;
  }
  wrapper.style.display = '';
  container.innerHTML = links.map(l =>
    `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener nofollow">${escapeHtml(l.name)}</a>`
  ).join('');
}

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
  // 重新渲染背景标语
  renderSlogan();
  // 重新渲染动态内容
  renderNavUser();
  renderChallengeSection();
  renderLeaderboard();
  renderYearlyChampions();
  renderActivities();
  renderActivityNotices();
  applySeoConfig();
  renderFooterContent();
  renderFriendLinks();
  // 更新触摸设备提示
  if (isTouchDevice) hintText.textContent = t('game.touchHint');
  // 更新游戏状态中的 overlay 文本（如果可见）
  if (overlay.classList.contains('visible')) updateUI();
  // 更新 SEO meta
  document.title = t('common.siteTitle');
});

// === 每日背景图片 ===
(function initDailyBackground() {
  const bgLayer = document.getElementById('bg-image-layer');
  if (!bgLayer) return;

  const primaryUrl = getDailyBackgroundUrl();
  const fallbackUrl = getFallbackUrl();

  // 尝试加载主图（Unsplash 精选极限运动）
  const trySetBg = (url, isFallback) => {
    const testImg = new Image();
    testImg.onload = () => {
      bgLayer.style.backgroundImage = `url("${url}")`;
      bgLayer.classList.add('loaded');
    };
    testImg.onerror = () => {
      if (!isFallback) {
        // Unsplash 失败 → 尝试 Picsum 后备
        trySetBg(fallbackUrl, true);
      }
      // 全部失败 → 保持默认纯色背景（body 的 background）
    };
    testImg.src = url;
  };

  trySetBg(primaryUrl, false);

  // 同时预加载（带 crossOrigin）供分享卡 canvas 使用
  initBackgroundImage();
  // 渲染背景标语
  renderSlogan();
})();

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

// === PayPal 支付回调处理 ===
(async function handlePaypalReturn() {
  const qs = window.location.search;
  // 用户取消 PayPal 支付
  if (qs.includes('pp_cancel=1')) {
    sessionStorage.removeItem('pp_pending');
    window.history.replaceState(null, '', window.location.pathname);
    return;
  }
  // 用户从 PayPal 审批返回
  if (!qs.includes('pp_return=1')) return;
  const urlParams = new URLSearchParams(qs);
  const token = urlParams.get('token'); // PayPal 在 return_url 后追加的 order ID
  const pendingRaw = sessionStorage.getItem('pp_pending');
  sessionStorage.removeItem('pp_pending');
  if (!pendingRaw || !token) {
    alert('PayPal 回调数据缺失，支付未完成');
    window.history.replaceState(null, '', window.location.pathname);
    return;
  }
  let pending;
  try { pending = JSON.parse(pendingRaw); } catch { pending = null; }
  if (!pending || pending.orderId !== token) {
    alert('PayPal 订单不匹配，支付未完成');
    window.history.replaceState(null, '', window.location.pathname);
    return;
  }
  const res = await capturePaypalPayment(token, pending.chId, pending.username);
  if (res.ok) {
    alert(t('challenge.joined') || 'Challenge joined!');
    renderChallengeList();
    loadMyChallenges();
  } else {
    alert('PayPal 支付捕获失败: ' + (res.error || 'unknown'));
  }
  window.history.replaceState(null, '', window.location.pathname);
})();
