// 付费挑战后端服务器 — Node.js 原生 http，无外部依赖
// 端口 3002，JSON 文件存储，支付适配层（mock），定时自动退款
// 启动: node server/app.js

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3002;
const DATA_DIR = path.join(__dirname, 'data');
const CHALLENGES_FILE = path.join(DATA_DIR, 'challenges.json');
const PARTICIPATIONS_FILE = path.join(DATA_DIR, 'participations.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PAYMENT_CONFIG_FILE = path.join(DATA_DIR, 'payment_config.json');

// 确保数据目录和文件存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(CHALLENGES_FILE)) fs.writeFileSync(CHALLENGES_FILE, '[]');
if (!fs.existsSync(PARTICIPATIONS_FILE)) fs.writeFileSync(PARTICIPATIONS_FILE, '[]');
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(PAYMENT_CONFIG_FILE)) fs.writeFileSync(PAYMENT_CONFIG_FILE, JSON.stringify({ mode: 'mock', paypalClientId: '', paypalClientSecret: '', sandbox: true, currency: 'usd' }, null, 2));

// === 数据读写 ===
function loadData(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return []; }
}
function saveData(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getChallenges() { return loadData(CHALLENGES_FILE); }
function saveChallenges(d) { saveData(CHALLENGES_FILE, d); }
function getParticipations() { return loadData(PARTICIPATIONS_FILE); }
function saveParticipations(d) { saveData(PARTICIPATIONS_FILE, d); }
function getUsers() { return loadData(USERS_FILE); }
function saveUsers(d) { saveData(USERS_FILE, d); }
function getPaymentConfig() {
  try { return JSON.parse(fs.readFileSync(PAYMENT_CONFIG_FILE, 'utf-8')); }
  catch { return { mode: 'mock', paypalClientId: '', paypalClientSecret: '', sandbox: true, currency: 'usd' }; }
}
function savePaymentConfig(d) { saveData(PAYMENT_CONFIG_FILE, d); }

// === 支付适配层 ===
// mock 模式：模拟支付和退款，不涉及真实资金
// PayPal 适配层（待启用），通过管理后台 payment_config.json 切换模式

const mockPayment = {
  async charge(amount, userId, challengeId) {
    return { id: 'mock_pay_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), status: 'succeeded' };
  },
  async refund(transactionId, amount) {
    return { id: 'mock_refund_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), status: 'succeeded' };
  },
};

// PayPal 适配层（后续启用时实现）
const paypalPayment = {
  async charge(amount, userId, challengeId) {
    // TODO: 创建 PayPal Order，返回 approve URL
    // const order = await fetch('https://api-m.paypal.com/v2/checkout/orders', {...})
    throw new Error('PayPal 适配层尚未实现');
  },
  async refund(captureId, amount) {
    // TODO: POST https://api-m.paypal.com/v2/payments/captures/{captureId}/refund
    throw new Error('PayPal 退款尚未实现');
  },
};

const payment = {
  charge(amount, userId, challengeId) {
    const adapter = getPaymentConfig().mode === 'paypal' ? paypalPayment : mockPayment;
    return adapter.charge(amount, userId, challengeId);
  },
  refund(transactionId, amount) {
    const adapter = getPaymentConfig().mode === 'paypal' ? paypalPayment : mockPayment;
    return adapter.refund(transactionId, amount);
  },
};

// === 工具 ===
function genId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function sendJSON(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { resolve({}); }
    });
  });
}

// === 定时退款检查（每 60 秒） ===
function checkExpirations() {
  const now = Date.now();
  const parts = getParticipations();
  let changed = false;
  for (const p of parts) {
    if (p.status !== 'active') continue;
    if (p.expiresAt > now) continue;
    // 到期
    if (p.progress >= p.targetCount) {
      // 达成目标 → 自动退款
      payment.refund(p.paymentTxId, p.amount).then(refund => {
        p.status = 'refunded';
        p.refundedAt = Date.now();
        p.refundTxId = refund.id;
        saveParticipations(parts);
        console.log(`[退款] ${p.username} 挑战"${p.challengeName}" 达成目标，已退款 $${p.amount}`);
      }).catch(err => {
        console.error(`[退款失败] ${p.username}: ${err.message}`);
      });
    } else {
      // 未达成 → 不退
      p.status = 'expired';
      console.log(`[到期] ${p.username} 挑战"${p.challengeName}" 未达成（${p.progress}/${p.targetCount}），不退款`);
    }
    changed = true;
  }
  if (changed) saveParticipations(parts);
}

setInterval(checkExpirations, 60000);

// === API 路由 ===
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method;

  // 健康检查
  if (pathname === '/api/health' && method === 'GET') {
    sendJSON(res, 200, { ok: true, time: Date.now() });
    return;
  }

  // === 挑战 CRUD ===
  // 获取所有启用的挑战（前端用）
  if (pathname === '/api/challenges' && method === 'GET') {
    const all = getChallenges();
    // 非管理端只返回 active 的
    const activeOnly = url.searchParams.get('active') !== 'false';
    const list = activeOnly ? all.filter(c => c.active) : all;
    sendJSON(res, 200, list);
    return;
  }

  // 创建挑战（管理后台）
  if (pathname === '/api/challenges' && method === 'POST') {
    const body = await readBody(req);
    if (!body.name || !body.difficulty || !body.period || !body.targetCount) {
      sendJSON(res, 400, { error: '缺少必填字段' });
      return;
    }
    const challenges = getChallenges();
    const item = {
      id: genId('ch'),
      name: String(body.name).slice(0, 50),
      difficulty: body.difficulty,
      period: body.period,
      customDays: body.period === 'custom' ? (parseInt(body.customDays) || 30) : null,
      targetCount: parseInt(body.targetCount) || 1,
      amount: parseFloat(body.amount) || 0,
      currency: 'usd',
      active: body.active !== false,
      createdAt: Date.now(),
    };
    challenges.push(item);
    saveChallenges(challenges);
    sendJSON(res, 200, item);
    return;
  }

  // 更新挑战
  if (pathname.startsWith('/api/challenges/') && method === 'PUT') {
    const id = pathname.split('/').pop();
    const body = await readBody(req);
    const challenges = getChallenges();
    const idx = challenges.findIndex(c => c.id === id);
    if (idx === -1) { sendJSON(res, 404, { error: '挑战不存在' }); return; }
    challenges[idx] = { ...challenges[idx], ...body, id };
    saveChallenges(challenges);
    sendJSON(res, 200, challenges[idx]);
    return;
  }

  // 删除挑战
  if (pathname.startsWith('/api/challenges/') && method === 'DELETE') {
    const id = pathname.split('/').pop();
    let challenges = getChallenges();
    challenges = challenges.filter(c => c.id !== id);
    saveChallenges(challenges);
    sendJSON(res, 200, { ok: true });
    return;
  }

  // === 参加挑战 ===
  if (pathname === '/api/participate' && method === 'POST') {
    const body = await readBody(req);
    const { challengeId, username } = body;
    if (!challengeId || !username) {
      sendJSON(res, 400, { error: '缺少挑战ID或用户名' });
      return;
    }
    const challenges = getChallenges();
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge || !challenge.active) {
      sendJSON(res, 404, { error: '挑战不存在或已下线' });
      return;
    }
    // 检查是否已参加且仍 active
    const parts = getParticipations();
    const existing = parts.find(p => p.challengeId === challengeId && p.username === username && p.status === 'active');
    if (existing) {
      sendJSON(res, 409, { error: '你已参加此挑战，请先完成或到期后再试' });
      return;
    }
    // 模拟支付
    const payResult = await payment.charge(challenge.amount, username, challengeId);
    const now = Date.now();
    const durationMs = challenge.period === 'yearly' ? 365 * 86400000
      : challenge.period === 'custom' ? (challenge.customDays || 30) * 86400000
      : 30 * 86400000;
    const participation = {
      id: genId('pt'),
      challengeId: challenge.id,
      challengeName: challenge.name,
      username,
      difficulty: challenge.difficulty,
      period: challenge.period,
      customDays: challenge.customDays || null,
      targetCount: challenge.targetCount,
      amount: challenge.amount,
      currency: challenge.currency,
      paymentTxId: payResult.id,
      status: 'active',
      progress: 0,
      joinedAt: now,
      expiresAt: now + durationMs,
      refundedAt: null,
      refundTxId: null,
    };
    parts.push(participation);
    saveParticipations(parts);
    sendJSON(res, 200, participation);
    return;
  }

  // === 获取我的挑战 ===
  if (pathname === '/api/my-challenges' && method === 'GET') {
    const username = url.searchParams.get('username');
    if (!username) { sendJSON(res, 400, { error: '缺少用户名' }); return; }
    const parts = getParticipations().filter(p => p.username === username);
    // 按状态排序：active → refunded → expired
    const order = { active: 0, refunded: 1, expired: 2 };
    parts.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || b.joinedAt - a.joinedAt);
    sendJSON(res, 200, parts);
    return;
  }

  // === 更新进度（游戏胜利时） ===
  if (pathname === '/api/progress' && method === 'POST') {
    const body = await readBody(req);
    const { username, difficulty } = body;
    if (!username || !difficulty) {
      sendJSON(res, 400, { error: '缺少用户名或难度' });
      return;
    }
    const parts = getParticipations();
    let updated = [];
    let completed = 0;
    for (const p of parts) {
      if (p.status === 'active' && p.username === username && p.difficulty === difficulty) {
        p.progress += 1;
        updated.push(p);
        // 达成目标 → 立即退款，允许用户再次参加
        if (p.progress >= p.targetCount) {
          try {
            const refund = await payment.refund(p.paymentTxId, p.amount);
            p.status = 'refunded';
            p.refundedAt = Date.now();
            p.refundTxId = refund.id;
            completed++;
          } catch (err) {
            // 退款失败不阻断进度更新，Cron Worker 到期时会重试
          }
        }
      }
    }
    if (updated.length) saveParticipations(parts);
    sendJSON(res, 200, { updated: updated.length, completed, challenges: updated });
    return;
  }

  // === 用户注册同步（前端注册成功后调用，仅存身份信息，不含密码） ===
  if (pathname === '/api/users' && method === 'POST') {
    const body = await readBody(req);
    const username = String(body.username || '').trim();
    if (!username) { sendJSON(res, 400, { error: '缺少用户名' }); return; }
    const users = getUsers();
    const existing = users.find(u => u.username === username);
    if (existing) {
      // 已存在则更新 region 和 email（可能用户之前注册时后端没启动）
      existing.region = String(body.region || '').slice(0, 20) || existing.region;
      existing.email = String(body.email || '').trim().slice(0, 80) || existing.email;
      saveUsers(users);
      sendJSON(res, 200, existing);
      return;
    }
    const user = {
      id: genId('usr'),
      username,
      region: String(body.region || '').trim().slice(0, 20),
      email: String(body.email || '').trim().slice(0, 80),
      createdAt: body.createdAt || Date.now(),
    };
    users.push(user);
    saveUsers(users);
    sendJSON(res, 200, user);
    return;
  }

  // === 获取所有用户（含挑战参与记录，管理后台用） ===
  if (pathname === '/api/users' && method === 'GET') {
    const users = getUsers();
    const parts = getParticipations();
    // 也收集 participations 中存在但 users.json 中没有的用户（历史数据）
    const knownNames = new Set(users.map(u => u.username));
    const orphanNames = [...new Set(parts.map(p => p.username).filter(n => !knownNames.has(n)))];
    for (const name of orphanNames) {
      users.push({ id: null, username: name, region: '', createdAt: null, unsynced: true });
    }
    // 按 createdAt 降序排列（null 排最后）
    users.sort((a, b) => {
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return b.createdAt - a.createdAt;
    });
    // 关联参与记录
    const result = users.map(u => ({
      ...u,
      participations: parts
        .filter(p => p.username === u.username)
        .sort((a, b) => b.joinedAt - a.joinedAt),
    }));
    sendJSON(res, 200, result);
    return;
  }

  // === 支付平台参数（管理后台用） ===
  if (pathname === '/api/payment-config' && method === 'GET') {
    sendJSON(res, 200, getPaymentConfig());
    return;
  }

  if (pathname === '/api/payment-config' && method === 'PUT') {
    const body = await readBody(req);
    const current = getPaymentConfig();
    const updated = {
      mode: body.mode === 'paypal' ? 'paypal' : 'mock',
      paypalClientId: String(body.paypalClientId || '').slice(0, 200),
      paypalClientSecret: String(body.paypalClientSecret || '').slice(0, 200),
      sandbox: body.sandbox !== false,
      currency: String(body.currency || 'usd').slice(0, 10),
    };
    savePaymentConfig(updated);
    sendJSON(res, 200, updated);
    return;
  }

  // 404
  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`付费挑战后端运行中: http://localhost:${PORT}`);
  console.log(`支付模式: ${getPaymentConfig().mode === 'paypal' ? 'PayPal' : 'Mock（模拟）'}`);
  // 启动时立即检查一次到期
  checkExpirations();
});
