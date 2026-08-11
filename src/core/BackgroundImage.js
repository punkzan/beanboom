// BackgroundImage.js - Bean Boom 实时热点背景图片模块
// 主源：Unsplash CDN（免费、支持 CORS）
// 后备：Picsum Photos
// 轮换策略：每小时更换，模拟「实时热点」效果
// 图池覆盖：极限运动 / 球类运动 / 潮流时尚 / 街头文化 / 健身 / 都市夜景 / 音乐节

// ============================================================
// 实时热点关键词（每日轮换，驱动图片选择倾向）
// ============================================================
const TRENDING_TOPICS = [
  { keywords: ['basketball', 'NBA', 'dunk'], zh: '篮球' },
  { keywords: ['soccer', 'football', 'stadium'], zh: '足球' },
  { keywords: ['surfing', 'wave', 'ocean'], zh: '冲浪' },
  { keywords: ['skateboard', 'skate', 'street'], zh: '滑板' },
  { keywords: ['snowboard', 'ski', 'winter'], zh: '滑雪' },
  { keywords: ['fashion', 'runway', 'model'], zh: '时装周' },
  { keywords: ['sneakers', 'shoes', 'nike'], zh: '球鞋文化' },
  { keywords: ['streetwear', 'urban', 'style'], zh: '街头潮流' },
  { keywords: ['fitness', 'gym', 'workout'], zh: '健身' },
  { keywords: ['nightlife', 'neon', 'city'], zh: '都市夜景' },
  { keywords: ['concert', 'music', 'festival'], zh: '音乐节' },
  { keywords: ['cycling', 'bike', 'mountain'], zh: '骑行' },
  { keywords: ['parkour', 'freerunning', 'jump'], zh: '跑酷' },
  { keywords: ['climbing', 'rock', 'boulder'], zh: '攀岩' },
  { keywords: ['baseball', 'MLB', 'pitcher'], zh: '棒球' },
  { keywords: ['tennis', 'court', 'serve'], zh: '网球' },
  { keywords: ['boxing', 'fight', 'ring'], zh: '拳击' },
  { keywords: ['dance', 'hiphop', 'break'], zh: '街舞' },
  { keywords: ['graffiti', 'art', 'mural'], zh: '涂鸦艺术' },
  { keywords: ['yoga', 'meditation', 'wellness'], zh: '瑜伽' },
];

// ============================================================
// 精选图片池（40 张，覆盖运动+时尚+潮流+都市）
// 所有图片来自 Unsplash CDN 直链，免费商用（Unsplash License）
// ============================================================
const IMAGE_POOL = [
  // === 极限运动 (8) ===
  // 滑板
  { url: 'https://images.unsplash.com/photo-1531565637446-32307b194366?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['skateboard','skate','street'] },
  // 冲浪
  { url: 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['surfing','wave','ocean'] },
  // 单板滑雪
  { url: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['snowboard','ski','winter'] },
  // 攀岩
  { url: 'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['climbing','rock','boulder'] },
  // 跑酷
  { url: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['parkour','freerunning','jump'] },
  // 高空跳伞
  { url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['skydiving','extreme','sky'] },
  // 山地自行车
  { url: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['cycling','bike','mountain'] },
  // 极限户外
  { url: 'https://images.unsplash.com/photo-1495121605193-b116b5b9c5fe?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['extreme','adventure','sport'] },

  // === 球类运动 (7) ===
  // 篮球
  { url: 'https://images.unsplash.com/photo-1504450754801-733d9afb84cd?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['basketball','NBA','dunk'] },
  // 篮球场
  { url: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['basketball','court','hoop'] },
  // 足球
  { url: 'https://images.unsplash.com/photo-1553778263-73a83fabb1c1?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['soccer','football','stadium'] },
  // 足球场
  { url: 'https://images.unsplash.com/photo-1459865264687-595d652de67e?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['soccer','stadium','pitch'] },
  // 网球
  { url: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['tennis','court','serve'] },
  // 棒球
  { url: 'https://images.unsplash.com/photo-1471295253337-3ceaaedca402?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['baseball','MLB','pitcher'] },
  // 拳击
  { url: 'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['boxing','fight','ring'] },

  // === 潮流时尚 (8) ===
  // 街头时尚
  { url: 'https://images.unsplash.com/photo-1445205170231-8e1c3a0eb079?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['fashion','streetwear','style'] },
  // 时装秀
  { url: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['fashion','runway','model'] },
  // 潮流穿搭
  { url: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['fashion','clothing','trend'] },
  // 街头风格
  { url: 'https://images.unsplash.com/photo-1529139574788-45bfd451116b?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['streetwear','urban','fashion'] },
  // 球鞋
  { url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['sneakers','shoes','nike'] },
  // 运动鞋
  { url: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['sneakers','shoes','style'] },
  // 时尚配饰
  { url: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['fashion','accessories','style'] },
  // 卫衣潮牌
  { url: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['streetwear','hoodie','brand'] },

  // === 健身运动 (5) ===
  // 健身房
  { url: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['fitness','gym','workout'] },
  // 跑步
  { url: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['running','fitness','jog'] },
  // 力量训练
  { url: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['workout','fitness','strength'] },
  // 瑜伽
  { url: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['yoga','meditation','wellness'] },
  // 户外健身
  { url: 'https://images.unsplash.com/photo-1571019614242-c5c5a255f290?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['fitness','outdoor','health'] },

  // === 都市夜景 (5) ===
  // 霓虹城市
  { url: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['nightlife','city','neon'] },
  // 现代都市
  { url: 'https://images.unsplash.com/photo-1477959858617-67e917ea5dae?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['urban','city','skyline'] },
  // 霓虹街道
  { url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['neon','city','night'] },
  // 城市灯光
  { url: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['city','lights','urban'] },
  // 雨夜街头
  { url: 'https://images.unsplash.com/photo-1499013819532-e4ff41b00669?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['night','street','rain'] },

  // === 音乐节 / 文化 (4) ===
  // 音乐节
  { url: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['concert','music','festival'] },
  // 演唱会灯光
  { url: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['concert','lights','crowd'] },
  // 街舞
  { url: 'https://images.unsplash.com/photo-1547153760-18fc86324498?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['dance','hiphop','break'] },
  // 涂鸦墙
  { url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['graffiti','art','mural'] },

  // === 摩托车 / 赛车 (3) ===
  // 摩托车
  { url: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['motorcycle','bike','speed'] },
  // 赛道
  { url: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['racing','car','track'] },
  // 越野
  { url: 'https://images.unsplash.com/photo-1597347316205-36f6c4cf1fa0?w=1920&h=1080&fit=crop&q=80&auto=format', tags: ['motorcycle','offroad','adventure'] },
];

// ============================================================
// 工具函数
// ============================================================

/** 获取小时级序号（每年第几小时），实现每小时图片轮换 */
function getHourOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 3600000);
}

/** 获取日期字符串 */
function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ============================================================
// 实时热点模拟
// ============================================================

/**
 * 获取今日「热搜话题」
 * 基于 dayOfYear 从 TRENDING_TOPICS 轮换，模拟实时热点趋势
 */
export function getTrendingTopic() {
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const idx = dayOfYear % TRENDING_TOPICS.length;
  return TRENDING_TOPICS[idx];
}

/**
 * 计算图片与当前热搜话题的匹配度
 * 标签匹配越多，得分越高，越容易在「热度优先」模式下被选中
 */
function getRelevanceScore(image, topic) {
  return image.tags.filter(tag => topic.keywords.includes(tag)).length;
}

// ============================================================
// 图片选择策略
// ============================================================

/**
 * 获取当前时段的背景图 URL
 *
 * 策略：70% 概率选与今日热搜话题匹配的图片（热度优先），
 *       30% 概率完全随机（保证多样性 + 惊喜感）
 * 使用小时级种子保证每小时更换且所有用户同一小时看到同一张图
 */
export function getDailyBackgroundUrl() {
  const hourOfYear = getHourOfYear();
  const topic = getTrendingTopic();

  // 按热度排序：匹配话题的图片排前面
  const ranked = [...IMAGE_POOL].sort((a, b) => {
    return getRelevanceScore(b, topic) - getRelevanceScore(a, topic);
  });

  // 热度优先区间：前 70%（约 28 张）热度最高图片
  const hotPoolSize = Math.max(Math.floor(IMAGE_POOL.length * 0.7), 1);
  const hotPool = ranked.slice(0, hotPoolSize);

  // 用小时 + 日期混合哈希选择一个确定但不可预测的索引
  const seed = hourOfYear * 7 + new Date().getFullYear() * 13;
  const useHot = (seed % 10) < 7; // 70% 热点，30% 随机

  let selected;
  if (useHot) {
    const idx = ((seed * 31) % hotPool.length + hotPool.length) % hotPool.length;
    selected = hotPool[idx];
  } else {
    const idx = ((seed * 17) % IMAGE_POOL.length + IMAGE_POOL.length) % IMAGE_POOL.length;
    selected = IMAGE_POOL[idx];
  }

  return selected.url;
}

// ============================================================
// 后备 URL
// ============================================================

/** Picsum 后备：每日不同种子 */
export function getFallbackUrl() {
  return `https://picsum.photos/seed/beanboom-${getTodayStr()}/1920/1080`;
}

// ============================================================
// 预加载 & 缓存
// ============================================================

let _cachedImage = null;
let _cachedHour = null;

export function preloadBackgroundImage() {
  const currentHour = getHourOfYear();
  if (_cachedImage && _cachedHour === currentHour) {
    return Promise.resolve(_cachedImage);
  }

  return new Promise((resolve) => {
    const tryLoad = (url, isFallback) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        _cachedImage = img;
        _cachedHour = currentHour;
        resolve(img);
      };

      img.onerror = () => {
        if (!isFallback) {
          tryLoad(getFallbackUrl(), true);
        } else {
          resolve(null);
        }
      };

      img.src = url;
    };

    tryLoad(getDailyBackgroundUrl(), false);
  });
}

/** 获取已缓存的背景图片（同步） */
export function getCachedBackgroundImage() {
  return _cachedImage;
}

/** 获取当前热点话题描述 */
export function getCurrentTopicLabel() {
  const topic = getTrendingTopic();
  return topic.zh || topic.keywords[0];
}

/** 页面加载时异步预加载（不阻塞渲染） */
export function initBackgroundImage() {
  preloadBackgroundImage().catch(() => {});
}
