import { getConfig, setConfig, getActivities, addActivity, updateActivity, deleteActivity, hasAdminPassword, setAdminPassword, verifyAdminPassword, getFooterContent, setFooterContent } from './core/SiteConfig.js';
import { getAllChallenges, createChallenge, updateChallenge, deleteChallenge, getUsers, getPaymentConfig, updatePaymentConfig } from './core/ChallengeAPI.js';
import { t, scanI18n, getLang, setLang, onLangChange } from './i18n.js';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDate(d) {
  return d || '—';
}

// === 书签切换 ===
const sidebar = document.getElementById('admin-sidebar');
sidebar.addEventListener('click', (e) => {
  const tab = e.target.closest('.admin-tab');
  if (!tab) return;
  const name = tab.dataset.tab;
  sidebar.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b === tab));
  document.querySelectorAll('.admin-content .admin-card').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.tabPanel === name);
  });
});

// === SEO ===
function loadSeoForm() {
  const config = getConfig();
  document.getElementById('seo-title').value = config.seo.title || '';
  document.getElementById('seo-description').value = config.seo.description || '';
  document.getElementById('seo-keywords').value = config.seo.keywords || '';
}

document.getElementById('save-seo').addEventListener('click', () => {
  const seo = {
    title: document.getElementById('seo-title').value.trim(),
    description: document.getElementById('seo-description').value.trim(),
    keywords: document.getElementById('seo-keywords').value.trim(),
  };
  setConfig({ ...getConfig(), seo });
  flash('save-seo', t('common.saved'));
});

// === 广告 ===
function loadAdsForm() {
  const config = getConfig();
  document.getElementById('ads-enabled').checked = config.ads.enabled;
  document.getElementById('ads-client').value = config.ads.adsenseClient || '';
  document.getElementById('ads-slot-top').value = config.ads.slots.top || '';
  document.getElementById('ads-slot-inline').value = config.ads.slots.inline || '';
  document.getElementById('ads-slot-bottom').value = config.ads.slots.bottom || '';
}

document.getElementById('save-ads').addEventListener('click', () => {
  const ads = {
    enabled: document.getElementById('ads-enabled').checked,
    adsenseClient: document.getElementById('ads-client').value.trim(),
    slots: {
      top: document.getElementById('ads-slot-top').value.trim(),
      inline: document.getElementById('ads-slot-inline').value.trim(),
      bottom: document.getElementById('ads-slot-bottom').value.trim(),
    },
  };
  setConfig({ ...getConfig(), ads });
  flash('save-ads', t('common.saved'));
});

// === 活动 ===
function loadActivityList() {
  const list = getActivities();
  const container = document.getElementById('act-list');
  if (!list.length) {
    container.innerHTML = '<p class="admin-act-empty">' + t('admin.act.none') + '</p>';
    return;
  }
  container.innerHTML = list.map(a => `
    <div class="admin-act-item">
      <div class="admin-act-info">
        <span class="admin-act-status ${a.active ? 'on' : 'off'}">${a.active ? t('activity.online') : t('activity.offline')}</span>
        <span class="admin-act-date">${formatDate(a.date)}</span>
        <span class="admin-act-t">${escapeHtml(a.title)}</span>
      </div>
      <div class="admin-act-text">${escapeHtml(a.content)}</div>
      <div class="admin-act-ops">
        <button class="admin-act-toggle" data-id="${a.id}" data-active="${!a.active}">
          ${a.active ? t('activity.goOffline') : t('activity.goOnline')}
        </button>
        <button class="admin-act-del" data-id="${a.id}">${t('common.delete')}</button>
      </div>
    </div>
  `).join('');
}

document.getElementById('add-activity').addEventListener('click', () => {
  const title = document.getElementById('act-title').value.trim();
  const content = document.getElementById('act-content').value.trim();
  if (!title) { flash('add-activity', t('admin.act.titleRequired')); return; }
  addActivity({
    title,
    content,
    date: document.getElementById('act-date').value || new Date().toISOString().slice(0, 10),
    active: document.getElementById('act-active').checked,
  });
  resetActForm();
  loadActivityList();
  flash('add-activity', t('admin.act.added'));
});

document.getElementById('reset-act-form').addEventListener('click', resetActForm);

function resetActForm() {
  document.getElementById('act-title').value = '';
  document.getElementById('act-content').value = '';
  document.getElementById('act-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('act-active').checked = true;
}

document.getElementById('act-list').addEventListener('click', async (e) => {
  const toggleBtn = e.target.closest('.admin-act-toggle');
  const delBtn = e.target.closest('.admin-act-del');
  if (toggleBtn) {
    updateActivity(toggleBtn.dataset.id, { active: toggleBtn.dataset.active === 'true' });
    loadActivityList();
  } else if (delBtn) {
    if (delBtn.dataset.confirming === '1') {
      delBtn.textContent = t('admin.act.deleting');
      delBtn.disabled = true;
      deleteActivity(delBtn.dataset.id);
      loadActivityList();
    } else {
      delBtn.dataset.confirming = '1';
      delBtn.textContent = t('admin.act.confirmDelete');
      delBtn.style.color = '#e53935';
      setTimeout(() => {
        if (delBtn.dataset.confirming === '1') {
          delBtn.dataset.confirming = '';
          delBtn.textContent = t('common.delete');
          delBtn.style.color = '';
        }
      }, 3000);
    }
  }
});

// === 付费挑战 ===
function getPeriodLabel(period, customDays) {
  if (period === 'custom') return t('challenge.period.custom', customDays || 0);
  return t('challenge.period.' + period) || period;
}

function autoChallengeName() {
  const amount = parseFloat(document.getElementById('ch-amount').value) || 0;
  const diff = t('game.diff.' + document.getElementById('ch-difficulty').value) || '';
  const periodVal = document.getElementById('ch-period').value;
  const period = getPeriodLabel(periodVal, document.getElementById('ch-custom-days').value);
  document.getElementById('ch-name').value = t('admin.ch.autoName', amount, diff, period);
}

document.getElementById('ch-difficulty').addEventListener('change', autoChallengeName);
document.getElementById('ch-period').addEventListener('change', () => {
  document.getElementById('ch-custom-days-field').style.display =
    document.getElementById('ch-period').value === 'custom' ? '' : 'none';
  autoChallengeName();
});
document.getElementById('ch-custom-days').addEventListener('input', autoChallengeName);
document.getElementById('ch-amount').addEventListener('input', autoChallengeName);

async function loadChallengeList() {
  const res = await getAllChallenges();
  const list = res.ok ? res.data : [];
  const container = document.getElementById('ch-list');
  if (!list.length) {
    container.innerHTML = '<p class="admin-act-empty">' + t('admin.ch.none') + '</p>';
    return;
  }
  container.innerHTML = list.map(c => `
    <div class="admin-act-item">
      <div class="admin-act-info">
        <span class="admin-act-status ${c.active ? 'on' : 'off'}">${c.active ? t('activity.online') : t('activity.offline')}</span>
        <span class="admin-act-date">$${c.amount}</span>
        <span class="admin-act-t">${escapeHtml(c.name)}</span>
      </div>
      <div class="admin-act-text">${t('game.diff.' + c.difficulty) || c.difficulty} · ${getPeriodLabel(c.period, c.customDays)} · ${t('admin.ch.goal', c.targetCount)}</div>
      <div class="admin-act-ops">
        <button class="admin-act-toggle" data-ch-id="${c.id}" data-ch-active="${!c.active}">
          ${c.active ? t('activity.goOffline') : t('activity.goOnline')}
        </button>
        <button class="admin-act-del" data-ch-id="${c.id}">${t('common.delete')}</button>
      </div>
    </div>
  `).join('');
}

document.getElementById('add-challenge').addEventListener('click', async () => {
  const name = document.getElementById('ch-name').value.trim();
  if (!name) { flash('add-challenge', t('admin.ch.nameRequired')); return; }
  const challenge = {
    name,
    difficulty: document.getElementById('ch-difficulty').value,
    period: document.getElementById('ch-period').value,
    targetCount: parseInt(document.getElementById('ch-target').value) || 1,
    amount: parseFloat(document.getElementById('ch-amount').value) || 0,
    active: document.getElementById('ch-active').checked,
  };
  if (challenge.period === 'custom') {
    challenge.customDays = parseInt(document.getElementById('ch-custom-days').value) || 30;
  }
  const res = await createChallenge(challenge);
  if (res.ok) {
    resetChForm();
    loadChallengeList();
    flash('add-challenge', t('admin.ch.added'));
  } else {
    flash('add-challenge', res.error || t('admin.ch.addFailed'));
  }
});

document.getElementById('reset-ch-form').addEventListener('click', resetChForm);

function resetChForm() {
  document.getElementById('ch-difficulty').value = 'easy';
  document.getElementById('ch-period').value = 'monthly';
  document.getElementById('ch-custom-days').value = '15';
  document.getElementById('ch-custom-days-field').style.display = 'none';
  document.getElementById('ch-target').value = '10';
  document.getElementById('ch-amount').value = '5.00';
  document.getElementById('ch-active').checked = true;
  autoChallengeName();
}

document.getElementById('ch-list').addEventListener('click', async (e) => {
  const toggleBtn = e.target.closest('.admin-act-toggle');
  const delBtn = e.target.closest('.admin-act-del');
  if (toggleBtn) {
    const res = await updateChallenge(toggleBtn.dataset.chId, { active: toggleBtn.dataset.chActive === 'true' });
    if (res.ok) loadChallengeList();
  } else if (delBtn) {
    if (delBtn.dataset.confirming === '1') {
      // 第二次点击：执行删除
      delBtn.textContent = t('admin.ch.deleting');
      delBtn.disabled = true;
      const res = await deleteChallenge(delBtn.dataset.chId);
      if (res.ok) {
        loadChallengeList();
      } else {
        delBtn.disabled = false;
        delBtn.textContent = res.error || t('admin.ch.deleteFailed');
        delBtn.style.color = '#e53935';
        setTimeout(() => { delBtn.textContent = t('common.delete'); delBtn.style.color = ''; delBtn.dataset.confirming = ''; }, 2000);
      }
    } else {
      // 第一次点击：进入确认状态
      delBtn.dataset.confirming = '1';
      delBtn.textContent = t('admin.ch.confirmDelete');
      delBtn.style.color = '#e53935';
      setTimeout(() => {
        if (delBtn.dataset.confirming === '1') {
          delBtn.dataset.confirming = '';
          delBtn.textContent = t('common.delete');
          delBtn.style.color = '';
        }
      }, 3000);
    }
  }
});

// === 用户管理 ===
async function loadUserList() {
  const res = await getUsers();
  const list = res.ok ? res.data : [];
  const container = document.getElementById('user-list');
  if (!list.length) {
    container.innerHTML = '<p class="admin-act-empty">' + t('admin.user.none') + '</p>';
    return;
  }
  const diffLabel = { easy: '简单', medium: '中等', hard: '困难' };
  const statusLabel = { active: t('challenge.status.active'), refunded: t('challenge.status.refunded'), expired: t('challenge.status.expiredLabel') };
  const statusClass = { active: 'on', refunded: 'refunded', expired: 'off' };
  const fmtDT = (ts) => ts ? new Date(ts).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtRemain = (ts) => {
    const ms = ts - Date.now();
    if (ms <= 0) return t('challenge.expiredNoRefund');
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    if (days > 0) return t('challenge.remaining', days, hours);
    return t('challenge.remainingHours', hours, 0);
  };
  container.innerHTML = list.map(u => {
    const parts = u.participations || [];
    const partsHtml = parts.length ? parts.map(p => {
      const pct = Math.min(100, (p.progress / p.targetCount) * 100);
      const stLabel = statusLabel[p.status] || p.status;
      const stCls = statusClass[p.status] || 'off';
      let detailHtml = '';
      if (p.status === 'active') {
        detailHtml = `
          <div class="admin-pt-detail">
            <div class="admin-pt-progress-bar"><div class="admin-pt-progress-fill" style="width:${pct}%"></div></div>
            <div class="admin-pt-row"><span>${t('admin.user.progress')}</span><span>${t('admin.user.times', p.progress, p.targetCount)}</span></div>
            <div class="admin-pt-row"><span>${t('admin.user.deadline')}</span><span>${fmtDT(p.expiresAt)}（${fmtRemain(p.expiresAt)}）</span></div>
            <div class="admin-pt-row"><span>${t('admin.user.paymentTxId')}</span><span class="admin-pt-tx">${p.paymentTxId || '—'}</span></div>
          </div>`;
      } else if (p.status === 'refunded') {
        detailHtml = `
          <div class="admin-pt-detail admin-pt-detail-refunded">
            <div class="admin-pt-progress-bar"><div class="admin-pt-progress-fill" style="width:${pct}%"></div></div>
            <div class="admin-pt-row"><span>${t('admin.user.progress')}</span><span>${t('admin.user.times', p.progress, p.targetCount)}</span></div>
            <div class="admin-pt-row"><span>${t('admin.user.refundAmount')}</span><span class="admin-pt-refund-amt">$${p.amount}</span></div>
            <div class="admin-pt-row"><span>${t('admin.user.refundTime')}</span><span>${fmtDT(p.refundedAt)}</span></div>
            <div class="admin-pt-row"><span>${t('admin.user.refundTxId')}</span><span class="admin-pt-tx">${p.refundTxId || '—'}</span></div>
            <div class="admin-pt-row"><span>${t('admin.user.paymentTxId')}</span><span class="admin-pt-tx">${p.paymentTxId || '—'}</span></div>
          </div>`;
      } else {
        detailHtml = `
          <div class="admin-pt-detail admin-pt-detail-expired">
            <div class="admin-pt-progress-bar"><div class="admin-pt-progress-fill" style="width:${pct}%"></div></div>
            <div class="admin-pt-row"><span>${t('admin.user.progress')}</span><span>${t('admin.user.times', p.progress, p.targetCount)}</span></div>
            <div class="admin-pt-row"><span>${t('admin.user.refundStatus')}</span><span>${t('admin.user.refundDenied')}</span></div>
            <div class="admin-pt-row"><span>${t('admin.user.reason')}</span><span>${t('admin.user.notAchieved')}</span></div>
            <div class="admin-pt-row"><span>${t('admin.user.paymentTxId')}</span><span class="admin-pt-tx">${p.paymentTxId || '—'}</span></div>
          </div>`;
      }
      return `
      <div class="admin-user-pt">
        <div class="admin-user-pt-head">
          <span class="admin-pt-status ${stCls}">${stLabel}</span>
          <span class="admin-pt-name">${escapeHtml(p.challengeName || '—')}</span>
          <span class="admin-pt-amount">$${p.amount}</span>
        </div>
        ${detailHtml}
      </div>`;
    }).join('') : '<span class="admin-user-nopt">' + t('admin.user.noChallenge') + '</span>';
    const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    return `
      <div class="admin-user-item">
        <div class="admin-user-head">
          <span class="admin-user-name">${escapeHtml(u.username)}</span>
          ${u.unsynced ? '<span class="admin-user-badge">' + t('admin.user.notSynced') + '</span>' : ''}
          <span class="admin-user-region">${escapeHtml(u.region || '—')}</span>
          <span class="admin-user-email">${escapeHtml(u.email || '—')}</span>
          <span class="admin-user-date">${dateStr}</span>
        </div>
        <div class="admin-user-pts">${partsHtml}</div>
      </div>
    `;
  }).join('');
}

// === 支付参数 ===
async function loadPaymentForm() {
  const res = await getPaymentConfig();
  const cfg = res.ok ? res.data : { mode: 'mock', paypalClientId: '', paypalClientSecret: '', sandbox: true, currency: 'usd' };
  document.getElementById('pay-mode').value = cfg.mode || 'mock';
  document.getElementById('pay-client-id').value = cfg.paypalClientId || '';
  document.getElementById('pay-client-secret').value = cfg.paypalClientSecret || '';
  document.getElementById('pay-sandbox').checked = cfg.sandbox !== false;
  document.getElementById('pay-currency').value = cfg.currency || 'usd';
}

document.getElementById('save-payment').addEventListener('click', async () => {
  const config = {
    mode: document.getElementById('pay-mode').value,
    paypalClientId: document.getElementById('pay-client-id').value.trim(),
    paypalClientSecret: document.getElementById('pay-client-secret').value.trim(),
    sandbox: document.getElementById('pay-sandbox').checked,
    currency: document.getElementById('pay-currency').value,
  };
  const res = await updatePaymentConfig(config);
  if (res.ok) flash('save-payment', t('common.saved'));
  else flash('save-payment', res.error || t('admin.pay.saveFailed'));
});

// === 底部内容管理 ===
function loadContentForm() {
  const fc = getFooterContent();
  document.getElementById('content-about-title').value = fc.aboutTitle || '';
  document.getElementById('content-about-text').value = fc.aboutText || '';
  document.getElementById('content-privacy-title').value = fc.privacyTitle || '';
  document.getElementById('content-privacy-text').value = fc.privacyText || '';
  document.getElementById('content-contact-title').value = fc.contactTitle || '';
  document.getElementById('content-contact-text').value = fc.contactText || '';
  document.getElementById('content-contact-email').value = fc.contactEmail || '';
}

document.getElementById('save-content').addEventListener('click', () => {
  setFooterContent({
    aboutTitle: document.getElementById('content-about-title').value.trim(),
    aboutText: document.getElementById('content-about-text').value.trim(),
    privacyTitle: document.getElementById('content-privacy-title').value.trim(),
    privacyText: document.getElementById('content-privacy-text').value.trim(),
    contactTitle: document.getElementById('content-contact-title').value.trim(),
    contactText: document.getElementById('content-contact-text').value.trim(),
    contactEmail: document.getElementById('content-contact-email').value.trim(),
  });
  flash('save-content', t('common.saved'));
});

// === 工具 ===
function flash(btnId, text) {
  const btn = document.getElementById(btnId);
  const original = btn.textContent;
  btn.textContent = text;
  btn.classList.add('flashed');
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('flashed');
  }, 1200);
}

// === 鉴权 ===
const SESSION_KEY = 'minesweeper-beads-admin-session';
const authEl = document.getElementById('admin-auth');
const authTitle = document.getElementById('auth-title');
const authHint = document.getElementById('auth-hint');
const authPwd = document.getElementById('auth-pwd');
const authPwd2 = document.getElementById('auth-pwd2');
const authSubmit = document.getElementById('auth-submit');
const authErr = document.getElementById('auth-err');

let authMode = 'login'; // 'login' | 'setup'

function showAuth(mode) {
  authMode = mode;
  authEl.style.display = '';
  if (mode === 'setup') {
    authTitle.textContent = t('admin.auth.setupTitle');
    authHint.textContent = t('admin.auth.setupHint');
    authPwd.placeholder = t('admin.auth.setupPlaceholder');
    authPwd2.style.display = '';
    authSubmit.textContent = t('admin.auth.setupSubmit');
  } else {
    authTitle.textContent = t('admin.auth.loginTitle');
    authHint.textContent = t('admin.auth.loginHint');
    authPwd.placeholder = t('admin.auth.loginPlaceholder');
    authPwd2.style.display = 'none';
    authSubmit.textContent = t('admin.auth.loginSubmit');
  }
  authPwd.value = '';
  authPwd2.value = '';
  authErr.textContent = '';
  authPwd.focus();
}

function hideAuth() {
  authEl.style.display = 'none';
}

function handleAuthSubmit() {
  authErr.textContent = '';
  const pwd = authPwd.value;
  if (!pwd) { authErr.textContent = t('admin.auth.pswdRequired'); return; }
  if (authMode === 'setup') {
    if (pwd.length < 4) { authErr.textContent = t('admin.auth.pswdTooShort'); return; }
    if (pwd !== authPwd2.value) { authErr.textContent = t('admin.auth.pswdMismatch'); return; }
    setAdminPassword(pwd);
    sessionStorage.setItem(SESSION_KEY, '1');
    hideAuth();
    initAdmin();
  } else {
    if (verifyAdminPassword(pwd)) {
      sessionStorage.setItem(SESSION_KEY, '1');
      hideAuth();
      initAdmin();
    } else {
      authErr.textContent = t('admin.auth.wrongPswd');
      authPwd.value = '';
      authPwd.focus();
    }
  }
}

authSubmit.addEventListener('click', handleAuthSubmit);
authPwd.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAuthSubmit(); });
authPwd2.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAuthSubmit(); });

document.getElementById('admin-logout').addEventListener('click', () => {
  sessionStorage.removeItem(SESSION_KEY);
  showAuth('login');
});

// 初始化
function initAdmin() {
  loadSeoForm();
  loadAdsForm();
  resetActForm();
  loadActivityList();
  resetChForm();
  loadChallengeList();
  loadUserList();
  loadPaymentForm();
  loadContentForm();
}

if (!hasAdminPassword()) {
  showAuth('setup');
} else if (sessionStorage.getItem(SESSION_KEY) !== '1') {
  showAuth('login');
} else {
  initAdmin();
}

// === i18n 初始化 ===
scanI18n();

// 语言变更时刷新所有动态内容
onLangChange((lang) => {
  document.getElementById('html-root').setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en-US');
  scanI18n();
  // 如果已登录，刷新动态面板
  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    loadActivityList();
    loadChallengeList();
    loadUserList();
    autoChallengeName();
  }
});
