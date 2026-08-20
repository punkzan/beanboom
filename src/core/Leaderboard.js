// 全球排行榜数据层：服务端 KV 存储（全局可见）+ localStorage 本地缓存降级
// 支持日榜 / 月榜 / 年度榜 / 总榜 查询
import { t } from '../i18n.js';

const STORAGE_KEY = 'minesweeper-beads-records';
const LEGACY_KEY = 'minesweeper-beads-best'; // 旧的单条最佳记录
const LIMITS = { easy: 100, medium: 2000, hard: 100000 };  // 前端每难度最多显示条数

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE)
  || 'http://localhost:3002/api';

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 今日 0 点
function startOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// 本月 1 日 0 点
function startOfMonth() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

// 本年 1 月 1 日 0 点
function startOfYear() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMonth(0, 1);
  return d.getTime();
}

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function saveAll(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// 一次性迁移旧的单条最佳记录，避免历史成绩丢失
function migrate() {
  if (localStorage.getItem(STORAGE_KEY)) return;
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}');
    const data = {};
    for (const diff of ['easy', 'medium', 'hard']) {
      if (typeof legacy[diff] === 'number') {
        data[diff] = [{ time: legacy[diff], timestamp: Date.now(), date: todayStr(), name: t('lb.historicalBest'), region: '' }];
      }
    }
    if (Object.keys(data).length) saveAll(data);
  } catch (e) {
    // 迁移失败忽略，不影响后续使用
  }
}
migrate();

// === 服务端 API 调用 ===

/**
 * 从服务端拉取全球排行榜数据并更新本地缓存
 */
export async function refreshRecords() {
  try {
    const res = await fetch(BASE + '/records');
    if (!res.ok) return;
    const data = await res.json();
    saveAll(data);
  } catch (e) {
    // 网络异常：保留 localStorage 缓存，不影响使用
  }
}

/**
 * 提交成绩到服务端，成功后自动刷新本地缓存
 * @param {string} difficulty
 * @param {number} seconds
 * @param {string} name
 * @param {string} region
 * @param {object|null} [gameLog] 对局日志（服务端重算验证）
 * @returns {Promise<boolean>} 是否为新的最佳成绩
 */
export async function postRecord(difficulty, seconds, name, region, gameLog = null) {
  try {
    const res = await fetch(BASE + '/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty, time: seconds, name: name || t('common.anonymous'), region: region || '', gameLog }),
    });
    if (!res.ok) {
      // 服务端失败时，至少保存到本地
      addRecordLocal(difficulty, seconds, name, region);
      return false;
    }
    const data = await res.json();
    if (data.records) {
      saveAll(data.records);
    }
    return data.wasBest || false;
  } catch (e) {
    // 网络异常：降级到本地存储
    return addRecordLocal(difficulty, seconds, name, region);
  }
}

// === 纯本地操作（降级/同步读取用） ===

/**
 * 添加一条胜利记录到本地（仅 localStroage，不调 API）
 */
export function addRecordLocal(difficulty, seconds, name, region) {
  const data = loadAll();
  const list = data[difficulty] || [];
  const wasBest = list.length === 0 || seconds < Math.min.apply(null, list.map(r => r.time));
  list.push({ time: seconds, timestamp: Date.now(), date: todayStr(), name: name || t('common.anonymous'), region: region || '' });
  list.sort((a, b) => a.time - b.time);
  data[difficulty] = list.slice(0, LIMITS[difficulty] || 100);
  saveAll(data);
  return wasBest;
}

/**
 * 添加一条胜利记录（兼容旧接口：先尝试服务端，失败时本地降级）
 * @param {object|null} [gameLog] 对局日志（服务端重算验证）
 */
export function addRecord(difficulty, seconds, name, region, gameLog = null) {
  // 立即本地存储（不等待网络），同时异步提交到服务端
  const wasBest = addRecordLocal(difficulty, seconds, name, region);
  postRecord(difficulty, seconds, name, region, gameLog).then(serverWasBest => {
    if (serverWasBest) {
      // 服务端确认是最佳成绩，刷新本地缓存同步服务端数据
      refreshRecords();
    }
  }).catch(() => {});
  return wasBest;
}

/**
 * 获取某难度最佳成绩（总榜第一名），无则 null（读本地缓存）
 */
export function getBestTime(difficulty) {
  const data = loadAll();
  const list = data[difficulty] || [];
  return list.length ? list[0].time : null;
}

/**
 * 获取某难度某时间窗口的成绩列表（已按用时升序，读本地缓存）
 * @param {string} difficulty - easy | medium | hard
 * @param {string} period - daily | monthly | yearly | all
 */
export function getRecords(difficulty, period = 'all') {
  const data = loadAll();
  const list = (data[difficulty] || []).slice();
  let filtered = list;
  if (period === 'daily') {
    filtered = list.filter(r => r.timestamp >= startOfDay());
  } else if (period === 'monthly') {
    filtered = list.filter(r => r.timestamp >= startOfMonth());
  } else if (period === 'yearly') {
    filtered = list.filter(r => r.timestamp >= startOfYear());
  }
  return filtered.slice(0, LIMITS[difficulty] || 100).map(r => ({ ...r, name: r.name || t('common.anonymous'), region: r.region || '' }));
}

/**
 * 获取当年各难度年度第一名记录（用时最短），无记录则该项为 null（读本地缓存）
 * @returns {{ easy: object|null, medium: object|null, hard: object|null }}
 */
export function getYearlyChampions() {
  const result = {};
  for (const diff of ['easy', 'medium', 'hard']) {
    const list = getRecords(diff, 'yearly');
    result[diff] = list.length ? list[0] : null;
  }
  return result;
}
