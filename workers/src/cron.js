/**
 * Bean Boom Cron Worker — 定期检查付费挑战到期 & 退款
 * 通过 Cloudflare Cron Triggers 每分钟触发
 * 与 Pages Functions 共享同一个 BEAN_BOOM_KV 命名空间
 */

// === 工具函数 ===
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

const mockPayment = {
  async refund(transactionId, amount) {
    return { id: 'mock_refund_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), status: 'succeeded' };
  },
};

async function checkExpirations(env) {
  const parts = await kvGet(env, 'participations', []);
  let changed = false;

  for (const p of parts) {
    if (p.status !== 'active') continue;
    if (p.expiresAt > Date.now()) continue;

    if (p.progress >= p.targetCount) {
      try {
        const refund = await mockPayment.refund(p.paymentTxId, p.amount);
        p.status = 'refunded';
        p.refundedAt = Date.now();
        p.refundTxId = refund.id;
        console.log(`[Cron 退款] ${p.username} 达成目标，已退款 $${p.amount}`);
      } catch (err) {
        console.error(`[Cron 退款失败] ${p.username}: ${err.message}`);
      }
    } else {
      p.status = 'expired';
      console.log(`[Cron 到期] ${p.username} 未达成（${p.progress}/${p.targetCount}），不退款`);
    }
    changed = true;
  }

  if (changed) await kvPut(env, 'participations', parts);
}

export default {
  async fetch(request, env) {
    // 健康检查端点
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      const parts = await kvGet(env, 'participations', []);
      const activeCount = parts.filter(p => p.status === 'active').length;
      const resolvedCount = parts.filter(p => p.status === 'expired' || p.status === 'refunded').length;

      const body = JSON.stringify({
        ok: true,
        worker: 'bean-boom-cron',
        time: Date.now(),
        participations: parts.length,
        active: activeCount,
        resolved: resolvedCount,
      });

      return new Response(body, {
        headers: { 'Content-Type': 'application/json;charset=utf-8' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkExpirations(env));
  },
};
