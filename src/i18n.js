// i18n 核心引擎 — 多语言翻译、语言检测与切换
// 零外部依赖，纯 ES 模块

import { zh } from './i18n/zh.js';
import { en } from './i18n/en.js';

const LOCALES = { zh, en };
const STORAGE_KEY = 'beanboom_lang';

// 语言变更回调列表
const listeners = [];

let currentLang = detectLang();

/** 检测当前语言: URL 参数 > localStorage（用户手动切换）> 默认 en
 *  注意：不根据浏览器语言自动切换，保证面向全球英文用户的默认体验，
 *  且与页面 lang="en-US" 声明一致（SEO 友好）。 */
function detectLang() {
  // 1. URL 参数 ?lang=en / ?lang=zh（显式指定）
  const urlParam = new URLSearchParams(window.location.search).get('lang');
  if (urlParam && LOCALES[urlParam]) return urlParam;

  // 2. 用户手动选择过的语言（仅由语言切换按钮写入）
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LOCALES[stored]) return stored;
  } catch (_) {}

  // 3. 默认英文
  return 'en';
}

/** 获取翻译。支持模板插值：t('key', arg1, arg2) → 键值为函数时调用函数(...args) */
export function t(key, ...args) {
  const table = LOCALES[currentLang];
  if (!table) return key;

  const val = table[key];
  if (val === undefined || val === null) {
    // 回退到中文
    const zhVal = LOCALES.zh[key];
    if (zhVal !== undefined && zhVal !== null) {
      return typeof zhVal === 'function' ? zhVal(...args) : zhVal;
    }
    return key;
  }

  return typeof val === 'function' ? val(...args) : val;
}

/** 切换语言 */
export function setLang(lang) {
  if (!LOCALES[lang] || lang === currentLang) return;
  currentLang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
  // 通知所有监听者
  listeners.forEach(fn => { try { fn(lang); } catch (_) {} });
}

/** 获取当前语言代码 */
export function getLang() {
  return currentLang;
}

/** 注册语言变更回调 */
export function onLangChange(fn) {
  listeners.push(fn);
  // 返回取消注册函数
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

/** 扫描 DOM 中所有 [data-i18n] 元素并替换文本内容 */
export function scanI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const text = t(key);
    if (text && typeof text === 'string') el.textContent = text;
  });

  // 处理 placeholder
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (!key) return;
    const text = t(key);
    if (text && typeof text === 'string') el.placeholder = text;
  });

  // 处理 title 属性
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (!key) return;
    const text = t(key);
    if (text && typeof text === 'string') el.title = text;
  });
}

// 导出语言包 map 供直接使用（ShareCard 等需要更细粒度控制）
export { LOCALES };
