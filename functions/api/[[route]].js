/**
 * Bean Boom API — Cloudflare Pages Functions (Hono + KV)
 * 所有 /api/* 路由，与前端同域名自动部署。
 * 定期退款检查由独立 Cron Worker 处理（workers/）。
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { replayGame, metricAchieved } from '../lib/replay.js';

// === KV 键名常量 ===
const KV_KEYS = {
  challenges: 'challenges',
  participations: 'participations',
  users: 'users',
  paymentConfig: 'payment_config',
  footerContent: 'footer_content',
  friendLinks: 'friend_links',
  records: 'records',           // 经典模式：用时排行榜
  scoreRecords: 'score_records', // 彩蛋模式：得分排行榜
  ttRecords: 'tt_records',      // 时间挑战：每日总用时榜（仅存当日数据）
};

// 排行榜各难度存储上限
const RECORD_LIMITS = { easy: 500, medium: 1000, hard: 2000 };

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// === 工具函数 ===
function genId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// === KV 读写辅助（带默认值） ===
async function kvGet(env, key, defaultValue) {
  try {
    const raw = await env.BEAN_BOOM_KV.get(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

async function kvPut(env, key, data) {
  await env.BEAN_BOOM_KV.put(key, JSON.stringify(data));
}

// === 支付适配层 ===
const mockPayment = {
  async charge(amount, userId, challengeId) {
    return { id: 'mock_pay_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), status: 'succeeded' };
  },
  async refund(transactionId, amount) {
    return { id: 'mock_refund_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), status: 'succeeded' };
  },
};

// PayPal 适配器 — 闭包捕获 env 和配置，支持 createOrder / captureOrder / refund
function makePaypalAdapter(config) {
  const baseUrl = config.sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  let _token = null, _tokenExpires = 0;

  async function getAccessToken() {
    if (_token && Date.now() < _tokenExpires) return _token;
    const auth = btoa(config.paypalClientId + ':' + config.paypalClientSecret);
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

async function getPayment(env) {
  const config = await kvGet(env, KV_KEYS.paymentConfig, {
    mode: 'mock', paypalClientId: '', paypalClientSecret: '', sandbox: true, currency: 'usd',
  });
  if (config.mode === 'paypal') {
    return makePaypalAdapter(config);
  }
  return { mode: 'mock', ...mockPayment };
}

// === 创建 Hono App ===
const app = new Hono();

// 全局错误处理 — 避免 Cloudflare 默认返回纯文本 500，让前端能显示具体错误信息
app.onError((err, c) => {
  return new Response(
    JSON.stringify({ error: err.message || 'Internal Server Error', stack: err.stack }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
});

// CORS — 对所有 /api/* 路由开放
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

// ==================== API 路由 ====================

// -- 健康检查 --
app.get('/api/health', (c) => c.json({ ok: true, time: Date.now() }));

// -- 获取挑战列表 --
app.get('/api/challenges', async (c) => {
  const all = await kvGet(c.env, KV_KEYS.challenges, []);
  const activeOnly = c.req.query('active') !== 'false';
  return c.json(activeOnly ? all.filter(ch => ch.active) : all);
});

// -- 创建挑战 --
app.post('/api/challenges', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.name || !body.difficulty || !body.period || !body.targetCount) {
    return c.json({ error: 'Missing required fields' }, 400);
  }
  // 挑战指标：仅 wins（挑战归属经典模式，按胜利次数计；score/rank 为彩蛋指标已废弃）
  // 存量数据若含 score/rank，metricAchieved 仍按原逻辑判定，保持兼容
  const metric = 'wins';
  const metricValue = null;
  const challenges = await kvGet(c.env, KV_KEYS.challenges, []);
  const item = {
    id: genId('ch'),
    name: String(body.name).slice(0, 50),
    difficulty: body.difficulty,
    period: body.period,
    customDays: body.period === 'custom' ? (parseInt(body.customDays) || 30) : null,
    targetCount: parseInt(body.targetCount) || 1,
    metric,
    metricValue,
    amount: parseFloat(body.amount) || 0,
    currency: 'usd',
    active: body.active !== false,
    createdAt: Date.now(),
  };
  challenges.push(item);
  await kvPut(c.env, KV_KEYS.challenges, challenges);
  return c.json(item);
});

// -- 更新挑战 --
app.put('/api/challenges/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const challenges = await kvGet(c.env, KV_KEYS.challenges, []);
  const idx = challenges.findIndex(ch => ch.id === id);
  if (idx === -1) return c.json({ error: 'Challenge not found' }, 404);
  challenges[idx] = { ...challenges[idx], ...body, id };
  await kvPut(c.env, KV_KEYS.challenges, challenges);
  return c.json(challenges[idx]);
});

// -- 删除挑战 --
app.delete('/api/challenges/:id', async (c) => {
  const id = c.req.param('id');
  let challenges = await kvGet(c.env, KV_KEYS.challenges, []);
  challenges = challenges.filter(ch => ch.id !== id);
  await kvPut(c.env, KV_KEYS.challenges, challenges);
  return c.json({ ok: true });
});

// -- 参加挑战 --
app.post('/api/participate', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { challengeId, username } = body;
  if (!challengeId || !username) {
    return c.json({ error: 'Missing challengeId or username' }, 400);
  }
  try {
    const challenges = await kvGet(c.env, KV_KEYS.challenges, []);
    const challenge = challenges.find(ch => ch.id === challengeId);
    if (!challenge || !challenge.active) {
      return c.json({ error: 'Challenge not found or inactive' }, 404);
    }
    const parts = await kvGet(c.env, KV_KEYS.participations, []);
    const existing = parts.find(
      p => p.challengeId === challengeId && p.username === username && p.status === 'active'
    );
    if (existing) {
      return c.json({ error: 'Already participated in this challenge' }, 409);
    }

    const pay = await getPayment(c.env);

    // PayPal 模式：创建订单 → 返回 approve URL，用户到 PayPal 审批后再回调 capture
    if (pay.mode === 'paypal') {
      const origin = new URL(c.req.url).origin;
      const returnUrl = `${origin}/?pp_return=1`;
      const cancelUrl = `${origin}/?pp_cancel=1`;
      const orderResult = await pay.createOrder(
        challenge.amount, challenge.name, challenge.currency, returnUrl, cancelUrl
      );
      return c.json({
        needsPaypalApproval: true,
        approveUrl: orderResult.approveUrl,
        orderId: orderResult.orderId,
      });
    }

    // Mock 模式：立即模拟扣款
    const payResult = await pay.charge(challenge.amount, username, challengeId);
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
    await kvPut(c.env, KV_KEYS.participations, parts);
    return c.json(participation);
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || 'Join challenge failed', stack: e.stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// -- PayPal 支付回调：审批完成后 capture 支付 + 创建参与记录 --
app.post('/api/paypal/capture', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { orderId, challengeId, username } = body;
  if (!orderId || !challengeId || !username) {
    return c.json({ error: 'Missing orderId, challengeId, or username' }, 400);
  }
  try {
    const pay = await getPayment(c.env);
    if (pay.mode !== 'paypal') {
      return c.json({ error: 'PayPal mode not enabled' }, 400);
    }
    const captureResult = await pay.captureOrder(orderId);
    if (!captureResult.captureId) {
      return c.json({ error: 'Payment capture failed: no capture returned' }, 500);
    }
    const challenges = await kvGet(c.env, KV_KEYS.challenges, []);
    const challenge = challenges.find(ch => ch.id === challengeId);
    if (!challenge) return c.json({ error: 'Challenge not found' }, 404);
    const parts = await kvGet(c.env, KV_KEYS.participations, []);
    const existing = parts.find(
      p => p.challengeId === challengeId && p.username === username && p.status === 'active'
    );
    if (existing) return c.json({ error: 'Already participated' }, 409);
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
    await kvPut(c.env, KV_KEYS.participations, parts);
    return c.json(participation);
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || 'PayPal capture failed', stack: e.stack }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
});

// -- 获取我的挑战列表 --
app.get('/api/my-challenges', async (c) => {
  const username = c.req.query('username');
  if (!username) return c.json({ error: 'Missing username' }, 400);
  const parts = await kvGet(c.env, KV_KEYS.participations, []);
  const mine = parts.filter(p => p.username === username);
  const order = { active: 0, refunded: 1, expired: 2 };
  mine.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || b.joinedAt - a.joinedAt);
  return c.json(mine);
});

// -- 更新进度（游戏胜利，服务端重放验证） --
app.post('/api/progress', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { username, difficulty, gameLog } = body;
  if (!username || !difficulty) {
    return c.json({ error: 'Missing username or difficulty' }, 400);
  }
  // 付费挑战归属经典模式：仅接受经典模式对局日志
  if (gameLog && gameLog.mode === 'egg') {
    return c.json({ error: 'Invalid game log: classic mode required' }, 400);
  }
  // 反作弊：重放对局日志验证，服务端重算结果为唯一真相
  const replay = replayGame(gameLog);
  if (!replay.ok) {
    return c.json({ error: 'Invalid game log', reason: replay.reason }, 400);
  }
  if (!replay.won) {
    return c.json({ error: 'Game verification failed: not a win' }, 403);
  }

  const challenges = await kvGet(c.env, KV_KEYS.challenges, []);
  const parts = await kvGet(c.env, KV_KEYS.participations, []);
  const pay = await getPayment(c.env);
  const updated = [];
  let completed = 0;
  for (const p of parts) {
    if (p.status === 'active' && p.username === username && p.difficulty === difficulty) {
      // 挑战指标判定（wins / score / rank），未达标不计进度
      const ch = challenges.find(x => x.id === p.challengeId);
      if (!metricAchieved(ch || {}, replay)) continue;
      p.progress += 1;
      updated.push(p);
      // 达成目标 → 立即退款，允许用户再次参加
      if (p.progress >= p.targetCount) {
        try {
          const refund = await pay.refund(p.paymentTxId, p.amount);
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
  if (updated.length) await kvPut(c.env, KV_KEYS.participations, parts);
  return c.json({ updated: updated.length, completed, challenges: updated, score: replay.score, rank: replay.rank });
});

// -- 用户注册同步 --
app.post('/api/users', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = String(body.username || '').trim();
  if (!username) return c.json({ error: 'Missing username' }, 400);
  const users = await kvGet(c.env, KV_KEYS.users, []);
  const existing = users.find(u => u.username === username);
  if (existing) {
    existing.region = String(body.region || '').slice(0, 20) || existing.region;
    existing.email = String(body.email || '').trim().slice(0, 80) || existing.email;
    await kvPut(c.env, KV_KEYS.users, users);
    return c.json(existing);
  }
  const user = {
    id: genId('usr'),
    username,
    region: String(body.region || '').trim().slice(0, 20),
    email: String(body.email || '').trim().slice(0, 80),
    createdAt: body.createdAt || Date.now(),
  };
  users.push(user);
  await kvPut(c.env, KV_KEYS.users, users);
  return c.json(user);
});

// -- 获取所有用户（管理后台） --
app.get('/api/users', async (c) => {
  const users = await kvGet(c.env, KV_KEYS.users, []);
  const parts = await kvGet(c.env, KV_KEYS.participations, []);
  const knownNames = new Set(users.map(u => u.username));
  const orphanNames = [...new Set(parts.map(p => p.username).filter(n => !knownNames.has(n)))];
  for (const name of orphanNames) {
    users.push({ id: null, username: name, region: '', createdAt: null, unsynced: true });
  }
  users.sort((a, b) => {
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return b.createdAt - a.createdAt;
  });
  const result = users.map(u => ({
    ...u,
    participations: parts
      .filter(p => p.username === u.username)
      .sort((a, b) => b.joinedAt - a.joinedAt),
  }));
  return c.json(result);
});

// -- 支付平台参数 --
app.get('/api/payment-config', async (c) => {
  const config = await kvGet(c.env, KV_KEYS.paymentConfig, {
    mode: 'mock', paypalClientId: '', paypalClientSecret: '', sandbox: true, currency: 'usd',
  });
  return c.json(config);
});

app.put('/api/payment-config', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const updated = {
    mode: body.mode === 'paypal' ? 'paypal' : 'mock',
    paypalClientId: String(body.paypalClientId || '').slice(0, 200),
    paypalClientSecret: String(body.paypalClientSecret || '').slice(0, 200),
    sandbox: body.sandbox !== false,
    currency: String(body.currency || 'usd').slice(0, 10),
  };
  await kvPut(c.env, KV_KEYS.paymentConfig, updated);
  return c.json(updated);
});

// -- 底部内容（关于我们/隐私政策/联系我们） --
const DEFAULT_FOOTER = {
  aboutTitle: '', aboutText: '',
  privacyTitle: '', privacyText: '',
  contactTitle: '', contactText: '', contactEmail: '',
};

app.get('/api/footer-content', async (c) => {
  const content = await kvGet(c.env, KV_KEYS.footerContent, DEFAULT_FOOTER);
  return c.json(content);
});

app.put('/api/footer-content', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const updated = {
    aboutTitle: String(body.aboutTitle || '').slice(0, 200),
    aboutText: String(body.aboutText || '').slice(0, 2000),
    privacyTitle: String(body.privacyTitle || '').slice(0, 200),
    privacyText: String(body.privacyText || '').slice(0, 2000),
    contactTitle: String(body.contactTitle || '').slice(0, 200),
    contactText: String(body.contactText || '').slice(0, 1000),
    contactEmail: String(body.contactEmail || '').slice(0, 200),
  };
  await kvPut(c.env, KV_KEYS.footerContent, updated);
  return c.json(updated);
});

// -- 全球排行榜：获取所有难度成绩 --
app.get('/api/records', async (c) => {
  const records = await kvGet(c.env, KV_KEYS.records, { easy: [], medium: [], hard: [] });
  return c.json(records);
});

// -- 全球排行榜：提交成绩（服务端重放验证） --
app.post('/api/records', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { difficulty, time, name, region, gameLog } = body;
  if (!difficulty || typeof time !== 'number' || time <= 0 || !name) {
    return c.json({ error: 'Missing or invalid fields (difficulty, time, name required)' }, 400);
  }
  const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : null;
  if (!diff) return c.json({ error: 'Invalid difficulty' }, 400);

  // 用时榜归属经典模式：拒绝彩蛋模式日志（连锁爆破可加速通关，对经典榜不公平）
  if (gameLog && gameLog.mode === 'egg') {
    return c.json({ error: 'Invalid game log: classic mode required' }, 400);
  }

  // 反作弊：重放验证胜利 + 时长一致（±3s 容差覆盖计时器与日志取整误差）
  const replay = replayGame(gameLog);
  if (!replay.ok) {
    return c.json({ error: 'Invalid game log', reason: replay.reason }, 400);
  }
  if (!replay.won) {
    return c.json({ error: 'Game verification failed: not a win' }, 403);
  }
  if (Math.abs(time - replay.durationSeconds) > 3) {
    return c.json({ error: 'Game verification failed: time mismatch' }, 403);
  }

  // 反垃圾：同一名字+同一难度+同一成绩 5 秒内重复提交忽略
  const records = await kvGet(c.env, KV_KEYS.records, { easy: [], medium: [], hard: [] });
  const list = records[diff] || [];
  const now = Date.now();
  const dup = list.find(r =>
    r.name === name && r.time === time && (now - r.timestamp) < 5000
  );
  if (dup) {
    // 重复提交：直接返回当前成绩列表
    return c.json({ wasBest: false, duplicated: true, records });
  }

  const wasBest = list.length === 0 || time < Math.min.apply(null, list.map(r => r.time));
  const record = {
    time,
    timestamp: now,
    date: todayStr(),
    name: String(name).slice(0, 12),
    region: String(region || '').slice(0, 20),
  };
  list.push(record);
  list.sort((a, b) => a.time - b.time);
  records[diff] = list.slice(0, RECORD_LIMITS[diff] || 500);

  await kvPut(c.env, KV_KEYS.records, records);
  return c.json({ wasBest, records });
});

// -- 彩蛋模式得分排行榜：获取所有难度成绩 --
app.get('/api/score-records', async (c) => {
  const records = await kvGet(c.env, KV_KEYS.scoreRecords, { easy: [], medium: [], hard: [] });
  return c.json(records);
});

// -- 彩蛋模式得分排行榜：提交得分（服务端重放验证，重算分数为唯一真相） --
app.post('/api/score-records', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { difficulty, name, region, gameLog } = body;
  if (!difficulty || !name) {
    return c.json({ error: 'Missing or invalid fields (difficulty, name required)' }, 400);
  }
  const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : null;
  if (!diff) return c.json({ error: 'Invalid difficulty' }, 400);

  // 彩蛋得分榜仅接受彩蛋模式日志（classic 模式无计分玩法）
  if (!gameLog || gameLog.mode !== 'egg') {
    return c.json({ error: 'Invalid game log: egg mode required' }, 400);
  }

  // 反作弊：重放验证胜利；分数以服务端重算为准（settle 的时间乘数对取整敏感，
  // 客户端与服务端时长可能差 1s，故不比对客户端提交的分数）
  const replay = replayGame(gameLog);
  if (!replay.ok) {
    return c.json({ error: 'Invalid game log', reason: replay.reason }, 400);
  }
  if (!replay.won) {
    return c.json({ error: 'Game verification failed: not a win' }, 403);
  }
  const score = replay.score;
  if (typeof score !== 'number' || score <= 0) {
    return c.json({ error: 'Game verification failed: invalid score' }, 403);
  }

  const records = await kvGet(c.env, KV_KEYS.scoreRecords, { easy: [], medium: [], hard: [] });
  const list = records[diff] || [];
  const now = Date.now();
  // 反垃圾：同一名字+同一难度+同一分数 5 秒内重复提交忽略
  const dup = list.find(r => r.name === name && r.score === score && (now - r.timestamp) < 5000);
  if (dup) {
    return c.json({ wasBest: false, duplicated: true, records });
  }

  const wasBest = list.length === 0 || score > Math.max.apply(null, list.map(r => r.score));
  const record = {
    score: Math.round(score),
    timestamp: now,
    date: todayStr(),
    name: String(name).slice(0, 12),
    region: String(region || '').slice(0, 20),
  };
  list.push(record);
  list.sort((a, b) => b.score - a.score);
  records[diff] = list.slice(0, RECORD_LIMITS[diff] || 500);

  await kvPut(c.env, KV_KEYS.scoreRecords, records);
  return c.json({ wasBest, records });
});

// -- 时间挑战日榜：获取今日成绩（两关总用时升序） --
app.get('/api/tt-records', async (c) => {
  const all = await kvGet(c.env, KV_KEYS.ttRecords, []);
  const today = todayStr();
  return c.json(all.filter(r => r.date === today).sort((a, b) => a.time - b.time).slice(0, 100));
});

// -- 时间挑战日榜：提交两关总用时（每名玩家每日一条，取更好成绩） --
// 注：时间挑战为客户端倒计时且日志仅覆盖单关，不做服务端重放验证（低风险，上限 60+120s）
app.post('/api/tt-records', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { time, name, region } = body;
  if (typeof time !== 'number' || time <= 0 || time > 300 || !name) {
    return c.json({ error: 'Missing or invalid fields (time, name required)' }, 400);
  }
  const cleanName = String(name).slice(0, 12);
  const all = await kvGet(c.env, KV_KEYS.ttRecords, []);
  const today = todayStr();
  const list = all.filter(r => r.date === today);
  // 同名同日只保留更好成绩；顺带丢弃非当日数据（KV 自清理）
  const mine = list.find(r => r.name === cleanName);
  if (mine) {
    if (time >= mine.time) {
      return c.json({ records: list.sort((a, b) => a.time - b.time).slice(0, 100) });
    }
    mine.time = time;
    mine.timestamp = Date.now();
    mine.region = String(region || '').slice(0, 20);
  } else {
    list.push({ time, timestamp: Date.now(), date: today, name: cleanName, region: String(region || '').slice(0, 20) });
  }
  list.sort((a, b) => a.time - b.time);
  const trimmed = list.slice(0, 200);
  await kvPut(c.env, KV_KEYS.ttRecords, trimmed);
  return c.json({ records: trimmed.slice(0, 100) });
});

// -- 友情链接 --
app.get('/api/friend-links', async (c) => {
  const all = await kvGet(c.env, KV_KEYS.friendLinks, []);
  const showAll = c.req.query('all') === 'true';
  const list = showAll ? all : all.filter(l => l.active);
  list.sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.createdAt - b.createdAt);
  return c.json(list);
});

app.post('/api/friend-links', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const url = String(body.url || '').trim();
  if (!name || !url) return c.json({ error: 'Missing name or url' }, 400);
  const links = await kvGet(c.env, KV_KEYS.friendLinks, []);
  const item = {
    id: genId('fl'),
    name: name.slice(0, 100),
    url: url.slice(0, 500),
    sort: parseInt(body.sort) || 0,
    active: body.active !== false,
    createdAt: Date.now(),
  };
  links.push(item);
  await kvPut(c.env, KV_KEYS.friendLinks, links);
  return c.json(item);
});

app.put('/api/friend-links/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const links = await kvGet(c.env, KV_KEYS.friendLinks, []);
  const idx = links.findIndex(l => l.id === id);
  if (idx === -1) return c.json({ error: 'Friend link not found' }, 404);
  const patch = {};
  if (body.name !== undefined) patch.name = String(body.name).trim().slice(0, 100);
  if (body.url !== undefined) patch.url = String(body.url).trim().slice(0, 500);
  if (body.sort !== undefined) patch.sort = parseInt(body.sort) || 0;
  if (body.active !== undefined) patch.active = !!body.active;
  links[idx] = { ...links[idx], ...patch, id };
  await kvPut(c.env, KV_KEYS.friendLinks, links);
  return c.json(links[idx]);
});

app.delete('/api/friend-links/:id', async (c) => {
  const id = c.req.param('id');
  let links = await kvGet(c.env, KV_KEYS.friendLinks, []);
  links = links.filter(l => l.id !== id);
  await kvPut(c.env, KV_KEYS.friendLinks, links);
  return c.json({ ok: true });
});

// -- 404 --
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// === Pages Functions 导出 ===
// Hono app.fetch 需要 (request, env, context)，而 Pages onRequest 传入的是 context 对象
export const onRequest = (ctx) => app.fetch(ctx.request, ctx.env, ctx);
