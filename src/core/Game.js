import { DIFFICULTIES, CELL_STATE } from '../constants.js';

/** mulberry32 seeded PRNG — 服务端重放用相同种子重建相同地雷布局 */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Game {
  constructor(difficulty = 'easy') {
    this.difficulty = difficulty;
    this.gameState = 'ready'; // ready | playing | won | lost
    this.mineCount = 0;
    this.flagCount = 0;
    this.revealedCount = 0;
    this.minesPlaced = false;
    this.init();
  }

  /** 切换难度并重新初始化 */
  setDifficulty(difficulty) {
    this.difficulty = difficulty;
    this.init();
  }

  init() {
    const config = DIFFICULTIES[this.difficulty];
    this.rows = config.rows;
    this.cols = config.cols;
    this.mineCount = config.mines;
    this.flagCount = 0;
    this.revealedCount = 0;
    this.gameState = 'ready';
    this.minesPlaced = false;
    this.playerCorrectFlags = 0; // 胜利时玩家自己插上的正确旗数（结算加分用）
    this.boomCount = 0; // Bean Boom 已引爆次数（决定连锁阶梯 Tier 1-4）
    this.feverActive = false; // FEVER 模式（Phase 3：A/D 联动，blast 半径 +1）
    this.mineSeed = (Math.random() * 0x7fffffff) | 0; // 地雷布局种子（服务端重放验证用）

    this.grid = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        row.push({
          row: r,
          col: c,
          isMine: false,
          isRevealed: false,
          isFlagged: false,
          isExploded: false,
          isWrongFlag: false,
          neighborCount: 0,
          state: CELL_STATE.HIDDEN,
        });
      }
      this.grid.push(row);
    }
  }

  getCell(row, col) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      return null;
    }
    return this.grid[row][col];
  }

  getNeighbors(row, col) {
    const neighbors = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const cell = this.getCell(row + dr, col + dc);
        if (cell) neighbors.push(cell);
      }
    }
    return neighbors;
  }

  getRemainingMines() {
    return this.mineCount - this.flagCount;
  }

  /**
   * 放置地雷，排除首次点击位置及其周围 8 格
   */
  placeMines(excludeRow, excludeCol) {
    const excludeSet = new Set();
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        excludeSet.add(`${excludeRow + dr},${excludeCol + dc}`);
      }
    }

    const available = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (!excludeSet.has(`${r},${c}`)) {
          available.push(this.grid[r][c]);
        }
      }
    }

    const count = Math.min(this.mineCount, available.length);
    const rng = mulberry32(this.mineSeed);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(rng() * available.length);
      available[idx].isMine = true;
      available.splice(idx, 1);
    }

    this.calculateNeighborCounts();
    this.minesPlaced = true;
  }

  calculateNeighborCounts() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (cell.isMine) continue;
        const neighbors = this.getNeighbors(r, c);
        cell.neighborCount = neighbors.filter(n => n.isMine).length;
      }
    }
  }

  /**
   * 揭开单元格
   * @returns {{ exploded: boolean, revealedCells: Array<{row,col,distance}>, won: boolean, mineCells: Array<{row,col}> }}
   */
  reveal(row, col) {
    if (this.gameState === 'won' || this.gameState === 'lost')
      return { exploded: false, revealedCells: [], won: false, mineCells: [] };

    const cell = this.getCell(row, col);
    if (!cell || cell.isRevealed || cell.isFlagged)
      return { exploded: false, revealedCells: [], won: false, mineCells: [] };

    // 首次点击 - 放置地雷
    if (!this.minesPlaced) {
      this.placeMines(row, col);
      this.gameState = 'playing';
    }

    // 踩雷
    if (cell.isMine) {
      cell.isRevealed = true;
      cell.isExploded = true;
      this.gameState = 'lost';
      const mineCells = this.revealAllMines();
      return { exploded: true, revealedCells: [{ row, col, distance: 0 }], won: false, mineCells };
    }

    // 递归展开
    const revealedCells = this.floodFill(row, col);
    this.checkWin();
    return { exploded: false, revealedCells, won: this.gameState === 'won', mineCells: [] };
  }

  /**
   * 递归展开空白区域 (迭代式 flood fill)
   * @returns {Array<{row, col, distance}>} 新翻开的单元格列表
   */
  floodFill(row, col) {
    const stack = [[row, col, 0]];
    const revealed = [];
    while (stack.length > 0) {
      const [r, c, dist] = stack.pop();
      const cell = this.getCell(r, c);
      if (!cell || cell.isRevealed || cell.isFlagged || cell.isMine) continue;

      cell.isRevealed = true;
      this.revealedCount++;
      revealed.push({ row: r, col: c, distance: dist });

      if (cell.neighborCount === 0) {
        const neighbors = this.getNeighbors(r, c);
        for (const n of neighbors) {
          if (!n.isRevealed && !n.isFlagged && !n.isMine) {
            stack.push([n.row, n.col, dist + 1]);
          }
        }
      }
    }
    return revealed;
  }

  /**
   * 标记/取消标记
   * @returns {{flagged: boolean, boom: {tier: number, revealedCells: Array, cascadeChain: Array, cascadeCount: number, won: boolean} | null} | null}
   *   正确标记地雷时返回 boom（Bean Boom 连锁爆破 + 级联，概念 A · Phase 2-3）
   */
  toggleFlag(row, col) {
    if (this.gameState === 'won' || this.gameState === 'lost') return null;
    const cell = this.getCell(row, col);
    if (!cell || cell.isRevealed) return null;

    cell.isFlagged = !cell.isFlagged;
    this.flagCount += cell.isFlagged ? 1 : -1;

    // 正确标记地雷且未曾引爆过 → 触发 Bean Boom
    if (cell.isFlagged && cell.isMine && !cell.hasBoomed) {
      return { flagged: true, boom: this._beanBoom(cell) };
    }
    return { flagged: cell.isFlagged, boom: null };
  }

  /**
   * Bean Boom 连锁爆破（概念 A + Phase 3 级联 + FEVER）：
   *
   * - 以被正确标记的地雷为中心，揭开切比雪夫半径内的安全格（不做 flood-fill）
   * - 阶梯：第 n 次引爆半径 = min(n, 4)；FEVER 时半径 +1（上限 5）
   * - 级联（Phase 3）：爆破半径内的其他已旗标地雷也自动引爆，形成连锁链
   *   每次 cascade 递增 boomCount（阶梯持续攀升），hasBoomed 守卫仅阻止手动拔旗重触
   * @returns {{tier: number, revealedCells: Array, cascadeChain: Array, cascadeCount: number, won: boolean}}
   */
  _beanBoom(center) {
    const cascadeChain = [];
    const processed = new Set();
    const queue = [center];
    let allRevealedCells = [];

    while (queue.length > 0) {
      const mine = queue.shift();
      const key = `${mine.row},${mine.col}`;
      if (processed.has(key)) continue;
      processed.add(key);

      mine.hasBoomed = true;
      this.boomCount++;
      const tier = Math.min(this.boomCount, 4);
      const radius = tier + (this.feverActive ? 1 : 0);

      const revealedCells = [];
      const cascadeTargets = [];

      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const cell = this.getCell(mine.row + dr, mine.col + dc);
          if (!cell || cell === mine) continue;

          // 爆破半径内的其他已旗标地雷 → 级联目标
          if (cell.isMine && cell.isFlagged) {
            const ck = `${cell.row},${cell.col}`;
            if (!processed.has(ck)) cascadeTargets.push(cell);
            continue;
          }
          if (cell.isMine || cell.isRevealed || cell.isFlagged) continue;

          cell.isRevealed = true;
          this.revealedCount++;
          revealedCells.push({
            row: cell.row,
            col: cell.col,
            distance: Math.max(Math.abs(dr), Math.abs(dc)),
          });
        }
      }

      // 级联阶梯延迟：每级 cascade 的揭格动画延后，形成扩散波纹
      const cascadeIndex = cascadeChain.length;
      for (const c of revealedCells) {
        c.distance += cascadeIndex * 4;
      }

      cascadeChain.push({
        center: { row: mine.row, col: mine.col },
        tier, radius,
        revealedCells,
      });
      allRevealedCells = allRevealedCells.concat(revealedCells);
      queue.push(...cascadeTargets);
    }

    this.checkWin();
    return {
      tier: cascadeChain[0].tier,
      revealedCells: allRevealedCells,
      cascadeChain,
      cascadeCount: cascadeChain.length - 1,
      won: this.gameState === 'won',
    };
  }

  /**
   * 游戏失败时翻开所有地雷，标记错误旗子
   * @returns {Array<{row, col}>} 翻开的地雷列表
   */
  revealAllMines() {
    const mines = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (cell.isMine && !cell.isFlagged) {
          cell.isRevealed = true;
          mines.push({ row: r, col: c });
        }
        if (cell.isFlagged && !cell.isMine) {
          cell.isWrongFlag = true;
        }
      }
    }
    return mines;
  }

  /**
   * 检查是否胜利 (所有非雷格已翻开)
   */
  checkWin() {
    const totalCells = this.rows * this.cols;
    const safeCells = totalCells - this.mineCount;
    if (this.revealedCount >= safeCells) {
      this.gameState = 'won';
      // 先记录玩家自己插上的正确旗数（先于自动补旗，供结算加分）
      this.playerCorrectFlags = 0;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const cell = this.grid[r][c];
          if (cell.isMine && cell.isFlagged) this.playerCorrectFlags++;
        }
      }
      // 自动标记所有未标记的地雷
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const cell = this.grid[r][c];
          if (cell.isMine && !cell.isFlagged) {
            cell.isFlagged = true;
            this.flagCount++;
          }
        }
      }
    }
  }
}
