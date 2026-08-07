/**
 * 将 server/data/ 下的本地 JSON 数据迁移到 Cloudflare KV
 * 用法：node scripts/migrate-to-kv.js
 * 要求：wrangler 已登录（npx wrangler whoami）
 */
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

const KV_KEYS = {
  challenges: 'challenges',
  participations: 'participations',
  users: 'users',
  paymentConfig: 'payment_config',
};

const files = [
  { key: KV_KEYS.challenges, file: 'server/data/challenges.json', defaultValue: [] },
  { key: KV_KEYS.participations, file: 'server/data/participations.json', defaultValue: [] },
  { key: KV_KEYS.users, file: 'server/data/users.json', defaultValue: [] },
  { key: KV_KEYS.paymentConfig, file: 'server/data/payment_config.json', defaultValue: { mode: 'mock', paypalClientId: '', paypalClientSecret: '', sandbox: true, currency: 'usd' } },
];

const bulk = files.map(({ key, file, defaultValue }) => {
  let data;
  try {
    data = JSON.parse(readFileSync(resolve(root, file), 'utf-8'));
  } catch (err) {
    console.warn(`⚠️ 读取 ${file} 失败，使用默认值：${err.message}`);
    data = defaultValue;
  }
  return { key, value: JSON.stringify(data) };
});

const bulkPath = resolve(root, '.tmp-kv-bulk.json');
writeFileSync(bulkPath, JSON.stringify(bulk, null, 2));

console.log('准备迁移以下 KV 键：');
bulk.forEach(({ key, value }) => {
  const parsed = JSON.parse(value);
  const label = Array.isArray(parsed) ? `${parsed.length} 条记录` : '配置对象';
  console.log(`  - ${key}: ${label}`);
});

try {
  const cmd = `npx wrangler kv bulk put "${bulkPath}" --binding BEAN_BOOM_KV --remote --preview false`;
  console.log(`\n执行：${cmd}\n`);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
  console.log('\n✅ KV 数据迁移完成');
} catch (err) {
  console.error('\n❌ 迁移失败', err.message);
  process.exit(1);
} finally {
  try {
    // 清理临时文件
    writeFileSync(bulkPath, '');
  } catch {}
}
