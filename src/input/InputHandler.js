export class InputHandler {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Renderer} renderer
   * @param {Game} game
   * @param {AnimationManager} animManager
   * @param {function} onAction - 每次操作后的回调
   * @param {SoundManager|null} soundManager - 音效管理器
   */
  constructor(canvas, renderer, game, animManager, onAction, soundManager = null) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.game = game;
    this.animManager = animManager;
    this.onAction = onAction;
    this.soundManager = soundManager;
    this.flagMode = false; // 标记模式：开启后点击 = 标记
    this.touchData = null; // 触摸状态数据
    this.lastTouchTime = 0;
    this.bindEvents();
  }

  /**
   * 切换标记模式
   */
  setFlagMode(enabled) {
    this.flagMode = enabled;
  }

  bindEvents() {
    // === 桌面端 ===
    this.canvas.addEventListener('click', (e) => {
      // 触摸事件已经处理过了，跳过
      if (this._touchConsumed) {
        this._touchConsumed = false;
        return;
      }
      e.preventDefault();
      if (this.game.gameState === 'won' || this.game.gameState === 'lost') return;
      const pos = this.renderer.screenToGrid(e.clientX, e.clientY);
      if (!pos) return;
      this._handleTap(pos);
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.game.gameState === 'won' || this.game.gameState === 'lost') return;
      const pos = this.renderer.screenToGrid(e.clientX, e.clientY);
      if (!pos) return;
      this._handleFlagToggle(pos);
    });

    this.canvas.addEventListener('dblclick', (e) => {
      e.preventDefault();
      if (this.game.gameState === 'won' || this.game.gameState === 'lost') return;
      const pos = this.renderer.screenToGrid(e.clientX, e.clientY);
      if (!pos) return;
      this.chord(pos.row, pos.col);
    });

    // === 移动端触摸 ===
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.game.gameState === 'won' || this.game.gameState === 'lost') return;
      const touch = e.touches[0];
      const pos = this.renderer.screenToGrid(touch.clientX, touch.clientY);
      if (!pos) return;

      this.touchData = {
        startX: touch.clientX,
        startY: touch.clientY,
        pos: pos,
        longPressTriggered: false,
        moved: false,
      };

      // 长按检测 (500ms)
      this.longPressTimer = setTimeout(() => {
        if (this.touchData && !this.touchData.moved) {
          this.touchData.longPressTriggered = true;
          // 长按 = 标记
          this._handleFlagToggle(this.touchData.pos);
          // 触觉反馈
          if (navigator.vibrate) navigator.vibrate(30);
        }
      }, 500);
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (!this.touchData) return;
      const touch = e.touches[0];
      const dx = touch.clientX - this.touchData.startX;
      const dy = touch.clientY - this.touchData.startY;
      // 移动超过 10px 取消长按
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        this.touchData.moved = true;
        clearTimeout(this.longPressTimer);
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      clearTimeout(this.longPressTimer);
      if (!this.touchData) return;

      const td = this.touchData;
      this.touchData = null;

      // 长按已触发或手指移动了 → 不再处理 tap
      if (td.longPressTriggered || td.moved) {
        this._touchConsumed = true; // 阻止后续的 click 事件
        return;
      }

      // 短 tap
      this._touchConsumed = true;
      this._handleTap(td.pos);

      // 触觉反馈
      if (navigator.vibrate) navigator.vibrate(15);
    }, { passive: false });

    // 阻止触摸时的默认菜单
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * 处理 tap 操作 (根据 flagMode 决定翻开还是标记)
   */
  _handleTap(pos) {
    const cell = this.game.getCell(pos.row, pos.col);
    if (!cell) return;

    // 标记模式下：tap = 标记
    // 或已翻开的数字格：tap = chord
    if (this.flagMode && !cell.isRevealed) {
      this._handleFlagToggle(pos);
    } else if (cell.isRevealed && cell.neighborCount > 0) {
      // 已翻开的数字格 → chord
      this.chord(pos.row, pos.col);
    } else {
      // 正常翻开
      const result = this.game.reveal(pos.row, pos.col);
      this._handleRevealResult(result, pos);
    }
  }

  /**
   * 处理翻开结果，触发对应动画
   * @param {string} eventType - 计分事件类型：reveal（普通揭开）/ chord（和弦快速展开）
   */
  _handleRevealResult(result, pos, eventType = 'reveal') {
    if (result.exploded) {
      this.animManager.addExplode(pos.row, pos.col);
      if (this.soundManager) this.soundManager.playExplode();
      result.mineCells.forEach((m, i) => {
        this.animManager.addPop(m.row, m.col, 120 + i * 55);
      });
    } else if (result.revealedCells.length > 0) {
      this.animManager.addPops(result.revealedCells);
      if (this.soundManager) this.soundManager.playReveal();
    }

    if (result.won) {
      this.animManager.addVictory(this.game.rows, this.game.cols);
      if (this.soundManager) this.soundManager.playWin();
    }

    this.renderer.render(this.game.grid, this.animManager);
    if (!result.exploded && result.revealedCells.length > 0) {
      // 携带计分事件（揭开格数 + 位置）回调
      this.onAction({ scoreEvent: { type: eventType, cells: result.revealedCells.length, pos } });
    } else {
      this.onAction();
    }
  }

  /**
   * 统一处理插旗/拔旗（右键、长按、标记模式 tap 共用）
   * 正确旗会触发 Bean Boom（概念 A）
   */
  _handleFlagToggle(pos) {
    const result = this.game.toggleFlag(pos.row, pos.col);
    if (!result) return;

    if (this.soundManager) {
      if (!result.flagged) this.soundManager.playUnflag();
      else if (!result.boom) this.soundManager.playFlag();
    }

    if (result.boom) {
      this._handleBoomResult(result.boom, pos);
    } else {
      this.renderer.render(this.game.grid, this.animManager);
      this.onAction();
    }
  }

  /**
   * 处理 Bean Boom 结果：中心脉冲 + 径向波纹揭格 + 计分事件
   * @param {{tier: number, revealedCells: Array, won: boolean}} boom
   */
  _handleBoomResult(boom, pos) {
    this.animManager.addBoom(pos.row, pos.col);
    if (boom.revealedCells.length > 0) {
      this.animManager.addPops(boom.revealedCells);
      if (this.soundManager) this.soundManager.playBoom();
    }
    if (boom.won) {
      this.animManager.addVictory(this.game.rows, this.game.cols);
      if (this.soundManager) this.soundManager.playWin();
    }

    this.renderer.render(this.game.grid, this.animManager);
    if (boom.revealedCells.length > 0) {
      // 携带计分事件（boom 类型）回调
      this.onAction({ scoreEvent: { type: 'boom', cells: boom.revealedCells.length, pos, tier: boom.tier } });
    } else {
      this.onAction();
    }
  }

  /**
   * 快速展开: 如果数字格周围的旗子数等于数字, 翻开周围所有未标记的格子
   */
  chord(row, col) {
    const cell = this.game.getCell(row, col);
    if (!cell || !cell.isRevealed || cell.neighborCount === 0) return;

    const neighbors = this.game.getNeighbors(row, col);
    const flagCount = neighbors.filter(n => n.isFlagged).length;

    if (flagCount !== cell.neighborCount) return;

    let allRevealed = [];
    let exploded = false;
    let explodedPos = null;
    let mineCells = [];
    let won = false;

    for (const n of neighbors) {
      if (!n.isFlagged && !n.isRevealed) {
        const result = this.game.reveal(n.row, n.col);
        if (result.exploded) {
          exploded = true;
          explodedPos = { row: n.row, col: n.col };
          mineCells = result.mineCells;
        } else {
          allRevealed = allRevealed.concat(result.revealedCells);
          if (result.won) won = true;
        }
      }
    }

    this._handleRevealResult({
      exploded,
      revealedCells: allRevealed,
      won,
      mineCells,
    }, explodedPos || { row, col }, 'chord');
  }
}
