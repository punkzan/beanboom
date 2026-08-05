// 玩家账户数据层：注册 / 登录 / 登出，基于 localStorage 存账户，sessionStorage 存登录态
// 说明：纯前端本地账户，非密码学级安全——同设备多用户可被绕过，但足以标识玩家身份。
// 游戏不强制登录，游客也可游玩并手动输入名字入榜。

import { registerUser } from './ChallengeAPI.js';
import { t } from '../i18n.js';

const ACCOUNTS_KEY = 'minesweeper-beads-accounts';
const SESSION_KEY = 'minesweeper-beads-current-user';

// 轻量 hash（FNV-1a 变种 + 盐，迭代加强），与 SiteConfig 管理密码算法一致
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

function genSalt() {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

function loadAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function saveAccounts(data) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(data));
}

/**
 * 注册新账户
 * @returns {{ ok: boolean, error?: string, user?: { username: string, region: string } }}
 */
export function register(username, password, region, email) {
  const name = String(username || '').trim();
  if (!name) return { ok: false, error: t('auth.usernameRequired') };
  if (name.length > 16) return { ok: false, error: t('auth.usernameTooLong') };
  if (!password || password.length < 4) return { ok: false, error: t('auth.passwordTooShort') };
  const emailVal = String(email || '').trim();
  if (!emailVal) return { ok: false, error: t('auth.emailRequired') };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) return { ok: false, error: t('auth.emailInvalid') };
  const accounts = loadAccounts();
  if (accounts[name]) return { ok: false, error: t('auth.usernameTaken') };
  // 检查邮箱唯一性
  const emailLower = emailVal.toLowerCase();
  if (Object.values(accounts).some(a => (a.email || '').toLowerCase() === emailLower)) return { ok: false, error: t('auth.emailTaken') };
  const salt = genSalt();
  accounts[name] = {
    salt,
    hash: hashPwd(password, salt),
    region: String(region || '').trim().slice(0, 20),
    email: emailVal.slice(0, 80),
    createdAt: Date.now(),
  };
  saveAccounts(accounts);
  // 注册成功后自动登录
  sessionStorage.setItem(SESSION_KEY, name);
  // 向后端同步用户身份信息（不含密码），fire-and-forget
  registerUser({ username: name, region: accounts[name].region, email: accounts[name].email, createdAt: accounts[name].createdAt });
  return { ok: true, user: { username: name, region: accounts[name].region, email: accounts[name].email } };
}

/**
 * 登录
 * @returns {{ ok: boolean, error?: string, user?: { username: string, region: string } }}
 */
export function login(username, password) {
  const name = String(username || '').trim();
  if (!name) return { ok: false, error: t('auth.usernameRequired') };
  if (!password) return { ok: false, error: t('auth.passwordRequired') };
  const accounts = loadAccounts();
  const acc = accounts[name];
  if (!acc) return { ok: false, error: t('auth.userNotFound') };
  if (hashPwd(password, acc.salt) !== acc.hash) return { ok: false, error: t('auth.wrongPassword') };
  sessionStorage.setItem(SESSION_KEY, name);
  return { ok: true, user: { username: name, region: acc.region || '' } };
}

/** 登出 */
export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * 获取当前登录用户，未登录返回 null
 * @returns {{ username: string, region: string } | null}
 */
export function getCurrentUser() {
  const name = sessionStorage.getItem(SESSION_KEY);
  if (!name) return null;
  const accounts = loadAccounts();
  const acc = accounts[name];
  if (!acc) {
    // 账户已被删除，清理残留会话
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
  return { username: name, region: acc.region || '', email: acc.email || '', createdAt: acc.createdAt || null };
}
