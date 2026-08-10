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
const FOOTER_CONTENT_FILE = path.join(DATA_DIR, 'footer_content.json');
const RECORDS_FILE = path.join(DATA_DIR, 'records.json');

// 确保数据目录和文件存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(CHALLENGES_FILE)) fs.writeFileSync(CHALLENGES_FILE, '[]');
if (!fs.existsSync(PARTICIPATIONS_FILE)) fs.writeFileSync(PARTICIPATIONS_FILE, '[]');
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(PAYMENT_CONFIG_FILE)) fs.writeFileSync(PAYMENT_CONFIG_FILE, JSON.stringify({ mode: 'mock', paypalClientId: '', paypalClientSecret: '', sandbox: true, currency: 'usd' }, null, 2));
if (!fs.existsSync(FOOTER_CONTENT_FILE)) fs.writeFileSync(FOOTER_CONTENT_FILE, JSON.stringify({ aboutTitle: '', aboutText: '', privacyTitle: '', privacyText: '', contactTitle: '', contactText: '', contactEmail: '' }, null, 2));
if (!fs.existsSync(RECORDS_FILE)) fs.writeFileSync(RECORDS_FILE, JSON.stringify({ easy: [], medium: [], hard: [] }, null, 2));

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
function getFooterContent() { return loadData(FOOTER_CONTENT_FILE); }
function saveFooterContent(d) { saveData(FOOTER_CONTENT_FILE, d); }
function getRecords() { return loadData(RECORDS_FILE); }
function saveRecords(d) { saveData(RECORDS_FILE, d); }
const RECORD_LIMITS = { easy: 500, medium: 1000, hard: 2000 };
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// === 支付适配层 ===
// mock 模式：模拟支付和退款，不涉及真实资金
// PayPal 模式：接入 PayPal Orders API v2，沙箱/正式环境通过 payment_config.json 切换

const mockPayment = {
  async charge(amount, userId, challengeId) {
    return { id: 'mock_pay_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), status: 'succeeded' };
  },
  async refund(transactionId, amount) {
    return { id: 'mock_refund_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), status: 'succeeded' };
  },
};

function makePaypalAdapter(config) {
  const baseUrl = config.sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  let _token = null, _tokenExpires = 0;

  async function getAccessToken() {
    if (_token && Date.now() < _tokenExpires) return _token;
    const auth = Buffer.from(config.paypalClientId + ':' + config.paypalClientSecret).toString('base64');
    const res = await fetch(baseUrl + '/v1/oauth2/token', {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) throw new Error('PayPal auth failed: ' + (data.error_description || res.status));
    _token = data.access_token;
    _tokenExpires = Date.now() + (data.expires_in - 60) * 1000;
    return _token;
  }

  return {
    mode: 'paypal',
    async createOrder(amount, description, currency, returnUrl, cancelUrl) {
      const token = await getAccessToken();
      const cc = (currency || 'usd').toUpperCase();
      const res = await fetch(baseUrl + '/v2/checkout/orders', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            amount: { currency_code: cc, value: String(amount) },
            description: String(description || '').slice(0, 127),
          }],
          application_context: { return_url: returnUrl, cancel_url: cancelUrl },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error('PayPal create order failed: ' + (data.message || res.status));
      const approveLink = data.links?.find(l => l.rel === 'approve')?.href;
      return { orderId: data.id, approveUrl: approveLink, status: data.status };
    },
    async captureOrder(orderId) {
      const token = await getAccessToken();
      const res = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error('PayPal capture failed: ' + (data.message || res.status));
      const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
      return { captureId: capture?.id, status: data.status };
    },
    async refund(captureId, amount, currency) {
      const token = await getAccessToken();
      const cc = (currency || 'usd').toUpperCase();
      const body = amount ? JSON.stringify({ amount: { currency_code: cc, value: String(amount) } }) : null;
      const res = await fetch(`${baseUrl}/v2/payments/captures/${captureId}/refund`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error('PayPal refund failed: ' + (data.message || res.status));
      return { id: data.id, status: data.status };
    },
  };
}

function getPaypalAdapter() {
  return makePaypalAdapter(getPaymentConfig());
}

const payment = {
  mode() { return getPaymentConfig().mode === 'paypal' ? 'paypal' : 'mock'; },
  adapter() {
    return getPaymentConfig().mode === 'paypal' ? getPaypalAdapter() : mockPayment;
  },
  async charge(amount, userId, challengeId) {
    const ad = this.adapter();
    return ad.charge(amount, userId, challengeId);
  },
  async refund(transactionId, amount, currency) {
    const ad = this.adapter();
    return ad.refund(transactionId, amount, currency);
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

    // PayPal 模式：创建订单 → 返回 approve URL
    if (payment.mode() === 'paypal') {
      const origin = req.headers.origin || `http://localhost:${PORT}`;
      const returnUrl = `${origin}/?pp_return=1`;
      const cancelUrl = `${origin}/?pp_cancel=1`;
      const paypal = getPaypalAdapter();
      const orderResult = await paypal.createOrder(
        challenge.amount, challenge.name, challenge.currency, returnUrl, cancelUrl
      );
      sendJSON(res, 200, {
        needsPaypalApproval: true,
        approveUrl: orderResult.approveUrl,
        orderId: orderResult.orderId,
      });
      return;
    }

    // Mock 模式：模拟支付
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

  // === PayPal 支付回调：capture 支付 + 创建参与记录 ===
  if (pathname === '/api/paypal/capture' && method === 'POST') {
    const body = await readBody(req);
    const { orderId, challengeId, username } = body;
    if (!orderId || !challengeId || !username) {
      sendJSON(res, 400, { error: '缺少 orderId / challengeId / username' });
      return;
    }
    if (payment.mode() !== 'paypal') {
      sendJSON(res, 400, { error: '当前未启用 PayPal 模式' });
      return;
    }
    try {
      const paypal = getPaypalAdapter();
      const captureResult = await paypal.captureOrder(orderId);
      if (!captureResult.captureId) {
        sendJSON(res, 500, { error: 'PayPal capture 失败：未返回 capture ID' });
        return;
      }
      const challenges = getChallenges();
      const challenge = challenges.find(c => c.id === challengeId);
      if (!challenge) { sendJSON(res, 404, { error: '挑战不存在' }); return; }
      const parts = getParticipations();
      const existing = parts.find(p => p.challengeId === challengeId && p.username === username && p.status === 'active');
      if (existing) { sendJSON(res, 409, { error: '已参加此挑战' }); return; }
      const now = Date.now();
      const durationMs = challenge.period === 'yearly' ? 365 * 86400000
        : challenge.period === 'custom' ? (challenge.customDays || 30) * 86400000
        : 30 * 86400000;
      const participation = {
        id: genId('pt'), challengeId: challenge.id, challengeName: challenge.name,
        username, difficulty: challenge.difficulty, period: challenge.period,
        customDays: challenge.customDays || null, targetCount: challenge.targetCount,
        amount: challenge.amount, currency: challenge.currency,
        paymentTxId: captureResult.captureId,
        status: 'active', progress: 0,
        joinedAt: now, expiresAt: now + durationMs,
        refundedAt: null, refundTxId: null,
      };
      parts.push(participation);
      saveParticipations(parts);
      sendJSON(res, 200, participation);
    } catch (e) {
      sendJSON(res, 500, { error: e.message || 'PayPal capture failed' });
    }
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

  // === 底部内容（关于我们/隐私政策/联系我们） ===
  if (pathname === '/api/footer-content' && method === 'GET') {
    sendJSON(res, 200, getFooterContent());
    return;
  }

  if (pathname === '/api/footer-content' && method === 'PUT') {
    const body = await readBody(req);
    const updated = {
      aboutTitle: String(body.aboutTitle || '').slice(0, 200),
      aboutText: String(body.aboutText || '').slice(0, 2000),
      privacyTitle: String(body.privacyTitle || '').slice(0, 200),
      privacyText: String(body.privacyText || '').slice(0, 2000),
      contactTitle: String(body.contactTitle || '').slice(0, 200),
      contactText: String(body.contactText || '').slice(0, 1000),
      contactEmail: String(body.contactEmail || '').slice(0, 200),
    };
    saveFooterContent(updated);
    sendJSON(res, 200, updated);
    return;
  }

  // === 全球排行榜：获取所有难度成绩 ===
  if (pathname === '/api/records' && method === 'GET') {
    sendJSON(res, 200, getRecords());
    return;
  }

  // === 全球排行榜：提交成绩 ===
  if (pathname === '/api/records' && method === 'POST') {
    const body = await readBody(req);
    const { difficulty, time, name, region } = body;
    if (!difficulty || typeof time !== 'number' || time <= 0 || !name) {
      sendJSON(res, 400, { error: '缺少必填字段（difficulty, time, name）' });
      return;
    }
    const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : null;
    if (!diff) { sendJSON(res, 400, { error: '无效的难度' }); return; }

    const records = getRecords();
    const list = records[diff] || [];
    const now = Date.now();
    // 反垃圾：同名同难度同成绩 5 秒内重复
    const dup = list.find(r => r.name === name && r.time === time && (now - r.timestamp) < 5000);
    if (dup) {
      sendJSON(res, 200, { wasBest: false, duplicated: true, records });
      return;
    }

    const wasBest = list.length === 0 || time < Math.min.apply(null, list.map(r => r.time));
    const record = {
      time, timestamp: now, date: todayStr(),
      name: String(name).slice(0, 12),
      region: String(region || '').slice(0, 20),
    };
    list.push(record);
    list.sort((a, b) => a.time - b.time);
    records[diff] = list.slice(0, RECORD_LIMITS[diff] || 500);
    saveRecords(records);
    sendJSON(res, 200, { wasBest, records });
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
