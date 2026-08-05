/**
 * Bean Boom — 首次部署时将本地 server/data/ JSON 文件迁移到 Cloudflare KV
 * 使用方式: node workers/scripts/migrate-to-kv.js
 * 需先设置环境变量: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, KV_NAMESPACE_ID
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'server', 'data');

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const NAMESPACE_ID = process.env.KV_NAMESPACE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!ACCOUNT_ID || !NAMESPACE_ID || !API_TOKEN) {
  console.error('请设置环境变量: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, KV_NAMESPACE_ID');
  process.exit(1);
}

const BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}`;
const HEADERS = { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' };

async function kvPut(key, value) {
  const res = await fetch(`${BASE_URL}/values/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: HEADERS,
    body: value,
  });
  const json = await res.json();
  if (!json.success) throw new Error(`写入 ${key} 失败: ${JSON.stringify(json.errors)}`);
  console.log(`  ✅ ${key}`);
}

async function migrate() {
  console.log('开始迁移数据到 Cloudflare KV...\n');

  const files = {
    challenges: readFileSync(join(DATA_DIR, 'challenges.json'), 'utf-8'),
    participations: readFileSync(join(DATA_DIR, 'participations.json'), 'utf-8'),
    users: readFileSync(join(DATA_DIR, 'users.json'), 'utf-8'),
    payment_config: readFileSync(join(DATA_DIR, 'payment_config.json'), 'utf-8'),
  };

  for (const [key, value] of Object.entries(files)) {
    await kvPut(key, value);
  }

  console.log('\n迁移完成！');
}

migrate().catch(err => { console.error(err); process.exit(1); });
