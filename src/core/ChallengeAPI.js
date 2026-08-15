// 付费挑战前端 API 客户端 — 封装后端 API 调用
import { t } from '../i18n.js';

// VITE_API_BASE 由 Vite 构建时从 .env 注入，开发时回退到 localhost
const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE)
  || 'http://localhost:3002/api';

async function request(path, options = {}) {
  try {
    const fetchOpts = { ...options };
    if (fetchOpts.body) {
      fetchOpts.headers = { 'Content-Type': 'application/json', ...(fetchOpts.headers || {}) };
    }
    const res = await fetch(BASE + path, fetchOpts);
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || t('common.requestFailed') };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: t('common.serverError') };
  }
}

/** 获取所有启用的挑战 */
export function getChallenges() {
  return request('/challenges');
}

/** 获取所有挑战（含未上线，管理后台用） */
export function getAllChallenges() {
  return request('/challenges?active=false');
}

/** 创建挑战 */
export function createChallenge(challenge) {
  return request('/challenges', {
    method: 'POST',
    body: JSON.stringify(challenge),
  });
}

/** 更新挑战 */
export function updateChallenge(id, patch) {
  return request('/challenges/' + id, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

/** 删除挑战 */
export function deleteChallenge(id) {
  return request('/challenges/' + id, {
    method: 'DELETE',
  });
}

/** 参加挑战（含模拟支付） */
export function participate(challengeId, username) {
  return request('/participate', {
    method: 'POST',
    body: JSON.stringify({ challengeId, username }),
  });
}

/** 获取我的挑战列表 */
export function getMyChallenges(username) {
  return request('/my-challenges?username=' + encodeURIComponent(username));
}

/** 游戏胜利时更新进度 */
export function updateProgress(username, difficulty) {
  return request('/progress', {
    method: 'POST',
    body: JSON.stringify({ username, difficulty }),
  });
}

/** 注册成功后向后端同步用户信息（不含密码） */
export function registerUser(info) {
  return request('/users', {
    method: 'POST',
    body: JSON.stringify(info),
  });
}

/** 获取所有用户及其挑战参与记录（管理后台用） */
export function getUsers() {
  return request('/users');
}

/** 获取支付平台参数（管理后台用） */
export function getPaymentConfig() {
  return request('/payment-config');
}

/** 更新支付平台参数（管理后台用） */
export function updatePaymentConfig(config) {
  return request('/payment-config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

/** PayPal 支付捕获：从 PayPal 审批返回后调此接口完成支付并创建参与记录 */
export function capturePaypalPayment(orderId, challengeId, username) {
  return request('/paypal/capture', {
    method: 'POST',
    body: JSON.stringify({ orderId, challengeId, username }),
  });
}

// === 友情链接（管理后台 CRUD） ===

/** 获取所有友情链接（含未上线，管理后台用） */
export function getFriendLinks() {
  return request('/friend-links?all=true');
}

/** 添加友情链接 */
export function addFriendLink(link) {
  return request('/friend-links', {
    method: 'POST',
    body: JSON.stringify(link),
  });
}

/** 更新友情链接 */
export function updateFriendLink(id, patch) {
  return request('/friend-links/' + id, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

/** 删除友情链接 */
export function deleteFriendLink(id) {
  return request('/friend-links/' + id, {
    method: 'DELETE',
  });
}
