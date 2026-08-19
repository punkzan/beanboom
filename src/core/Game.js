import { DIFFICULTIES, CELL_STATE } from '../constants.js';

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
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * available.length);
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
   */
  toggleFlag(row, col) {
    if (this.gameState === 'won' || this.gameState === 'lost') return;
    const cell = this.getCell(row, col);
    if (!cell || cell.isRevealed) return;

    cell.isFlagged = !cell.isFlagged;
    this.flagCount += cell.isFlagged ? 1 : -1;
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
