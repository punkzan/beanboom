/**
 * 每日挑战（Daily Challenge）共享配置与种子计算
 *
 * 前端（main.js）与 Cloudflare Functions（functions/api）共用本模块，
 * 确保全球所有玩家、服务端重放验证用的种子/期数完全一致。
 *
 * 机制：按 UTC 日期生成 31 位固定种子 → 所有玩家当天玩同一张棋盘，次日刷新。
 */

// 第 1 期起始日（UTC）
export const DAILY_LAUNCH_UTC = '2026-08-28';

// 固定难度，保证单一全球榜
export const DAILY_DIFFICULTY = 'medium';

/** 当前 UTC 日期字符串（YYYY-MM-DD） */
export function utcDateStr() {
  return new Date().toISOString().slice(0, 10);
}

/** 日期字符串 → 31 位非负整数种子（djb2 变体，与 Game.mineSeed 取值域一致） */
export function dailySeedFor(dateStr) {
  let h = 5381;
  for (let i = 0; i < dateStr.length; i++) {
    h = ((h << 5) + h + dateStr.charCodeAt(i)) | 0;
  }
  return (h >>> 1) & 0x7fffffff;
}

/** 挑战期数 = 距起始日的天数 + 1 */
export function dailyNumberFor(dateStr) {
  const ms = Date.parse(dateStr + 'T00:00:00Z') - Date.parse(DAILY_LAUNCH_UTC + 'T00:00:00Z');
  return Math.floor(ms / 86400000) + 1;
}

/** 今日每日挑战配置（全球同局） */
export function dailyConfig() {
  const date = utcDateStr();
  return {
    date,
    difficulty: DAILY_DIFFICULTY,
    seed: dailySeedFor(date),
    number: dailyNumberFor(date),
  };
}
