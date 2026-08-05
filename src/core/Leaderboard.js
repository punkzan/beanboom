// 全球排行榜数据层：基于 localStorage 存储各难度成绩历史，
// 支持日榜 / 月榜 / 年度榜 / 总榜 查询（单机本地记录）
import { t } from '../i18n.js';

const STORAGE_KEY = 'minesweeper-beads-records';
const LEGACY_KEY = 'minesweeper-beads-best'; // 旧的单条最佳记录
const LIMITS = { easy: 100, medium: 2000, hard: 100000 };  // 每难度最多保留且显示条数

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

/**
 * 添加一条胜利记录
 * @param {string} difficulty - easy | medium | hard
 * @param {number} seconds - 用时（秒）
 * @returns {boolean} 是否为新的最佳成绩（用时最短）
 */
export function addRecord(difficulty, seconds, name, region) {
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
 * 获取某难度最佳成绩（总榜第一名），无则 null
 */
export function getBestTime(difficulty) {
  const data = loadAll();
  const list = data[difficulty] || [];
  return list.length ? list[0].time : null;
}

/**
 * 获取某难度某时间窗口的成绩列表（已按用时升序，取前对应难度上限条）
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
 * 获取当年各难度年度第一名记录（用时最短），无记录则该项为 null
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
