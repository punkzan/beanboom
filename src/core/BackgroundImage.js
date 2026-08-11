// BackgroundImage.js - Bean Boom 每日背景图片模块
// 精选极限运动/炫酷图片，每日自动轮换
// 主源：Unsplash CDN（免费、支持 CORS）
// 后备：Picsum Photos（稳定可靠、支持 CORS）

// ---- 精选极限运动图片列表（Unsplash CDN 直链，免费商用） ----
const EXTREME_SPORTS_IMAGES = [
  // 滑板
  'https://images.unsplash.com/photo-1531565637446-32307b194366?w=1920&h=1080&fit=crop&q=80&auto=format',
  // 冲浪
  'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=1920&h=1080&fit=crop&q=80&auto=format',
  // 单板滑雪
  'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=1920&h=1080&fit=crop&q=80&auto=format',
  // 攀岩
  'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=1920&h=1080&fit=crop&q=80&auto=format',
  // 跑酷
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1920&h=1080&fit=crop&q=80&auto=format',
  // 山地自行车
  'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=1920&h=1080&fit=crop&q=80&auto=format',
  // 冬季运动
  'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=1920&h=1080&fit=crop&q=80&auto=format',
  // 徒步
  'https://images.unsplash.com/photo-1486915309851-b0cc1f8a0084?w=1920&h=1080&fit=crop&q=80&auto=format',
  // 高空跳伞
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1920&h=1080&fit=crop&q=80&auto=format',
  // 海浪
  'https://images.unsplash.com/photo-1518481612222-68bbe828ecd1?w=1920&h=1080&fit=crop&q=80&auto=format',
  // 摩托车
  'https://images.unsplash.com/photo-1597347316205-36f6c4cf1fa0?w=1920&h=1080&fit=crop&q=80&auto=format',
  // 户外运动
  'https://images.unsplash.com/photo-1534799556718-5b1d3e0b6e03?w=1920&h=1080&fit=crop&q=80&auto=format',
  // BMX
  'https://images.unsplash.com/photo-1551582045-6ec9c11d8697?w=1920&h=1080&fit=crop&q=80&auto=format',
  // 极限运动
  'https://images.unsplash.com/photo-1495121605193-b116b5b9c5fe?w=1920&h=1080&fit=crop&q=80&auto=format',
  // 滑雪
  'https://images.unsplash.com/photo-1554072675-93db7c74fca5?w=1920&h=1080&fit=crop&q=80&auto=format',
];

// ---- 获取一年中的第几天 ----
function getDayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  return Math.floor(diff / 86400000);
}

// ---- 获取今天的日期字符串 ----
function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- 获取今日背景图 URL（Unsplash 精选） ----
export function getDailyBackgroundUrl() {
  const dayOfYear = getDayOfYear();
  const index = dayOfYear % EXTREME_SPORTS_IMAGES.length;
  return EXTREME_SPORTS_IMAGES[index];
}

// ---- 获取 Picsum 后备 URL（每日不同种子） ----
export function getFallbackUrl() {
  return `https://picsum.photos/seed/beanboom-${getTodayStr()}/1920/1080`;
}

// ---- 预加载背景图片并缓存（供 canvas 使用） ----
let _cachedImage = null;
let _cachedDate = null;

export function preloadBackgroundImage() {
  const today = getTodayStr();
  if (_cachedImage && _cachedDate === today) {
    return Promise.resolve(_cachedImage);
  }

  return new Promise((resolve) => {
    const tryLoad = (url, isFallback) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        _cachedImage = img;
        _cachedDate = today;
        resolve(img);
      };

      img.onerror = () => {
        if (!isFallback) {
          // Unsplash 失败 → 尝试 Picsum 后备
          tryLoad(getFallbackUrl(), true);
        } else {
          // 全部失败 → 返回 null，调用方使用纯色降级
          resolve(null);
        }
      };

      img.src = url;
    };

    tryLoad(getDailyBackgroundUrl(), false);
  });
}

// ---- 获取已缓存的背景图片（同步，供 ShareCard 使用） ----
export function getCachedBackgroundImage() {
  return _cachedImage;
}

// ---- 在页面加载时预加载（不阻塞渲染） ----
export function initBackgroundImage() {
  // 异步预加载，不阻塞页面
  preloadBackgroundImage().catch(() => {});
}
