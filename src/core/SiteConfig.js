// 网站配置数据层：基于 localStorage 管理 SEO、Google 广告、网站活动
// 管理后台(admin.html)写入，前端(index.html)读取

const STORAGE_KEY = 'minesweeper-beads-site-config';

// 默认配置
const DEFAULT_CONFIG = {
  seo: {
    title: 'Bean Boom - Free Online Minesweeper Game',
    description: 'Play Bean Boom, a free online minesweeper game with a unique bead art style. Three difficulty levels, a global leaderboard, and daily hot topics. Play instantly in your browser - no download needed.',
    keywords: 'bean boom,minesweeper,free minesweeper game,online minesweeper,bead art game,browser game',
  },
  ads: {
    enabled: false,
    adsenseClient: '',       // ca-pub-xxxxxxxxxxxxxxxx
    slots: {
      top: '',               // 顶部横幅广告 slot ID
      inline: '',            // 游戏与排行榜之间
      bottom: '',            // 底部横幅
    },
  },
  activities: [],  // [{ id, title, content, date, active, createdAt }]
  footerContent: {
    aboutTitle: '',
    aboutText: '',
    privacyTitle: '',
    privacyText: '',
    contactTitle: '',
    contactText: '',
    contactEmail: '',
  },
};

function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      seo: { ...DEFAULT_CONFIG.seo, ...(saved.seo || {}) },
      ads: {
        ...DEFAULT_CONFIG.ads,
        ...(saved.ads || {}),
        slots: { ...DEFAULT_CONFIG.ads.slots, ...((saved.ads || {}).slots || {}) },
      },
      activities: saved.activities || [],
      footerContent: { ...DEFAULT_CONFIG.footerContent, ...(saved.footerContent || {}) },
    };
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

function saveConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/** 获取完整配置（前端读取用） */
export function getConfig() {
  return loadConfig();
}

/** 保存完整配置（管理后台写入用） */
export function setConfig(config) {
  saveConfig(config);
}

// === SEO ===
export function getSeoConfig() {
  return loadConfig().seo;
}

export function setSeoConfig(seo) {
  const config = loadConfig();
  config.seo = { ...config.seo, ...seo };
  saveConfig(config);
}

// === 广告 ===
export function getAdsConfig() {
  return loadConfig().ads;
}

export function setAdsConfig(ads) {
  const config = loadConfig();
  config.ads = { ...config.ads, ...ads, slots: { ...config.ads.slots, ...(ads.slots || {}) } };
  saveConfig(config);
}

// === 网站活动 ===
export function getActivities(activeOnly = false) {
  const list = loadConfig().activities;
  const sorted = list.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  return activeOnly ? sorted.filter(a => a.active) : sorted;
}

export function addActivity(activity) {
  const config = loadConfig();
  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: activity.title || '未命名活动',
    content: activity.content || '',
    date: activity.date || new Date().toISOString().slice(0, 10),
    active: activity.active !== false,
    createdAt: activity.createdAt || Date.now(),
  };
  config.activities.unshift(item);
  saveConfig(config);
  return item;
}

export function updateActivity(id, patch) {
  const config = loadConfig();
  const idx = config.activities.findIndex(a => a.id === id);
  if (idx === -1) return false;
  config.activities[idx] = { ...config.activities[idx], ...patch };
  saveConfig(config);
  return true;
}

export function deleteActivity(id) {
  const config = loadConfig();
  config.activities = config.activities.filter(a => a.id !== id);
  saveConfig(config);
}

/** 获取最新 N 条已上线活动（按发布时间降序，createdAt 优先，旧数据回退到 date） */
export function getLatestActivities(count = 5) {
  const list = loadConfig().activities.filter(a => a.active);
  return list
    .slice()
    .sort((a, b) => {
      const ta = a.createdAt || new Date(a.date).getTime() || 0;
      const tb = b.createdAt || new Date(b.date).getTime() || 0;
      return tb - ta;
    })
    .slice(0, count);
}

// === 管理后台密码 ===
// 说明：纯前端本地门槛，非密码学级安全——任何人可清除 localStorage 绕过。
// 但能防止密码明文存储、阻止随意访问，作为访问控制足够。
const PWD_KEY = 'minesweeper-beads-admin-pwd';

// 轻量 hash（FNV-1a 变种 + 盐，迭代加强）。salt 由 toString(36) 生成，不含 ':'。
function hashPwd(pwd, salt) {
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0x1000193 >>> 0;
  const s = salt + ':' + pwd;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (s.charCodeAt(i) + 0x9e3779b9), 0x85ebca6b) >>> 0;
  }
  let out = '';
  for (let r = 0; r < 4; r++) {
    h1 = Math.imul(h1 ^ (h1 >>> 15), 0x2c1b3c6d) >>> 0;
    h2 = Math.imul(h2 ^ (h2 >>> 13), 0x27d4eb2f) >>> 0;
    h1 = (h1 + 0x9e3779b9) >>> 0;
    out += h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }
  return out;
}

/** 是否已设置管理密码 */
export function hasAdminPassword() {
  return !!localStorage.getItem(PWD_KEY);
}

/** 设置管理密码（hash + 随机盐存储） */
export function setAdminPassword(pwd) {
  const salt = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  localStorage.setItem(PWD_KEY, salt + ':' + hashPwd(pwd, salt));
}

/** 验证密码是否正确 */
export function verifyAdminPassword(pwd) {
  const stored = localStorage.getItem(PWD_KEY);
  if (!stored) return false;
  const idx = stored.indexOf(':');
  if (idx < 0) return false;
  const salt = stored.slice(0, idx);
  const hash = stored.slice(idx + 1);
  return hashPwd(pwd, salt) === hash;
}

/** 清除管理密码（重置，重新进入设置流程） */
export function clearAdminPassword() {
  localStorage.removeItem(PWD_KEY);
}

// === 底部内容（关于我们/隐私政策/联系我们） ===
// localStorage 版本（本地回退用）
export function getFooterContent() {
  return loadConfig().footerContent;
}

export function setFooterContent(content) {
  const config = loadConfig();
  config.footerContent = { ...config.footerContent, ...content };
  saveConfig(config);
}

// API 版本（服务端 KV 存储，全局生效）
async function apiRequest(endpoint, options = {}) {
  const res = await fetch(endpoint, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'API error');
  return data;
}

export async function fetchFooterContent() {
  try {
    return await apiRequest('/api/footer-content');
  } catch {
    // 回退到 localStorage
    return getFooterContent();
  }
}

export async function saveFooterContent(content) {
  try {
    return await apiRequest('/api/footer-content', { method: 'PUT', body: JSON.stringify(content) });
  } catch (e) {
    // 回退到 localStorage
    setFooterContent(content);
    throw e;
  }
}
