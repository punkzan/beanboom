// 颜色配置 - 拼豆风格
export const COLORS = {
  // 拼豆板
  BOARD_BG: '#d8d6cc',
  BOARD_BG_TOP: '#e2e0d6',
  BOARD_BG_BOTTOM: '#ccc9be',
  BOARD_STROKE: '#b4b2a9',
  PEG_HOLE: '#b8b6ad',
  PEG_HOLE_INNER: '#9a988f',

  // 未揭开豆子 - 薄荷绿
  BEAD_HIDDEN: '#5dcaa5',
  BEAD_HIDDEN_STROKE: '#1d9e75',
  BEAD_HIGHLIGHT: '#9fe1cb',

  // 揭开后空白格 (凹陷)
  CELL_EMPTY: '#e8e6dd',
  CELL_EMPTY_STROKE: '#cfcdc3',
  CELL_EMPTY_SHADOW: '#c8c5ba',

  // 数字豆子颜色 (1-8): fill, stroke, highlight, text
  NUMBER_COLORS: [
    { fill: '#85b7eb', stroke: '#378add', highlight: '#bcd8f5', text: '#042c53' },   // 1 - 浅蓝
    { fill: '#fac775', stroke: '#ba7517', highlight: '#fde2b5', text: '#412402' },  // 2 - 浅黄
    { fill: '#ef9f27', stroke: '#ba7517', highlight: '#f8cf85', text: '#412402' },  // 3 - 深黄
    { fill: '#f0997b', stroke: '#d85a30', highlight: '#f8c9b8', text: '#4a1b0c' },  // 4 - 橙色
    { fill: '#d4537e', stroke: '#993556', highlight: '#eca8c0', text: '#4b1528' },  // 5 - 粉红
    { fill: '#7f77dd', stroke: '#534ab7', highlight: '#b6b0f0', text: '#26215c' },  // 6 - 紫色
    { fill: '#888780', stroke: '#5f5e5a', highlight: '#bfbeb8', text: '#2c2c2a' },  // 7 - 灰色
    { fill: '#e24b4a', stroke: '#a32d2d', highlight: '#f2a5a4', text: '#501313' },  // 8 - 红色
  ],

  // 标记旗 - 粉色花朵
  FLAG_FILL: '#f4c0d1',
  FLAG_STROKE: '#d4537e',
  FLAG_HIGHLIGHT: '#fce0eb',
  FLAG_PATTERN: '#ffffff',
  FLAG_CENTER: '#d4537e',

  // 地雷 - 深色炸弹
  MINE_FILL: '#3a3a3a',
  MINE_STROKE: '#1a1a1a',
  MINE_HIGHLIGHT: '#6a6a6a',
  MINE_CENTER: '#1a1a1a',
  MINE_SPIKE: '#2a2a2a',
  MINE_GLOW: '#ff6b4a',

  // 爆炸的地雷 - 红黑
  MINE_EXPLODED_FILL: '#e24b4a',
  MINE_EXPLODED_STROKE: '#8a1a1a',
  MINE_EXPLODED_HIGHLIGHT: '#f5a5a4',
};

// 单元格尺寸
export const CELL_SIZE = 40;
export const BEAD_RADIUS = 17;
export const PEG_RADIUS = 2;

// 响应式配置
export const RESPONSIVE = {
  MAX_CELL: 40,      // 最大单元格尺寸（桌面）
  MIN_CELL: 22,      // 最小单元格尺寸（超小屏）
  SCREEN_PADDING: 80, // 屏幕两侧预留空间（容器padding+gap）
};

// 难度配置
export const DIFFICULTIES = {
  easy:   { rows: 9,  cols: 9,  mines: 10, label: '简单' },
  medium: { rows: 16, cols: 16, mines: 40, label: '中等' },
  hard:   { rows: 16, cols: 30, mines: 99, label: '困难' },
};

// 时间挑战模式（Time Attack）：连续闯关，倒计时归零未完成即失败
// 第 1 局：经典玩法 · 简单难度 · 30 秒；第 2 局：经典玩法 · 困难难度 · 120 秒
// 当天全部通关后锁定，次日 0 点（本地时间）重置
export const TIME_TRIAL_STAGES = [
  { difficulty: 'easy', countdown: 30 },
  { difficulty: 'hard', countdown: 120 },
];

// 单元格状态
export const CELL_STATE = {
  HIDDEN: 'hidden',
  REVEALED: 'revealed',
  FLAGGED: 'flagged',
};
