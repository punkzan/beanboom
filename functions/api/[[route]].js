/**
 * Bean Boom API — Cloudflare Pages Functions (Hono + KV)
 * 所有 /api/* 路由，与前端同域名自动部署。
 * 定期退款检查由独立 Cron Worker 处理（workers/）。
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

// === KV 键名常量 ===
const KV_KEYS = {
  challenges: 'challenges',
  participations: 'participations',
  users: 'users',
  paymentConfig: 'payment_config',
};

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

const paypalPayment = {
  async charge() { throw new Error('PayPal adapter not implemented'); },
  async refund() { throw new Error('PayPal refund not implemented'); },
};

async function getPayment(env) {
  const config = await kvGet(env, KV_KEYS.paymentConfig, {
    mode: 'mock', paypalClientId: '', paypalClientSecret: '', sandbox: true, currency: 'usd',
  });
  return config.mode === 'paypal' ? paypalPayment : mockPayment;
}

// === 创建 Hono App ===
const app = new Hono();

// 全局错误处理 — 捕获所有路由未处理的异常，返回 JSON 错误
app.onError((err, c) => {
  return new Response(
    JSON.stringify({ error: 'unhandled: ' + (err?.message || String(err)), stack: err?.stack }),
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
  const challenges = await kvGet(c.env, KV_KEYS.challenges, []);
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
    return new Response(JSON.stringify({ error: 'participate failed: ' + e.message, stack: e.stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
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

// -- 更新进度（游戏胜利） --
app.post('/api/progress', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { username, difficulty } = body;
  if (!username || !difficulty) {
    return c.json({ error: 'Missing username or difficulty' }, 400);
  }
  const parts = await kvGet(c.env, KV_KEYS.participations, []);
  const updated = [];
  for (const p of parts) {
    if (p.status === 'active' && p.username === username && p.difficulty === difficulty) {
      p.progress += 1;
      updated.push(p);
    }
  }
  if (updated.length) await kvPut(c.env, KV_KEYS.participations, parts);
  return c.json({ updated: updated.length, challenges: updated });
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

// -- 404 --
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// === Pages Functions 导出 ===
// Hono app.fetch 需要 (request, env, context)，而 Pages onRequest 传入的是 context 对象
export const onRequest = (ctx) => app.fetch(ctx.request, ctx.env, ctx);
