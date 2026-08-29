/**
 * 高光回放录制器（P4）
 *
 * 彩蛋模式下用 MediaRecorder 滚动录制棋盘 canvas（合成画布叠加站点水印），
 * 触发 FEVER 或大连锁时自动定格最近 ~10 秒，生成可导出的 MP4/WebM。
 *
 * 设计要点：
 * - MediaRecorder 必须在事件发生前就开始录制，因此用 timeslice 分片 + 滚动缓冲。
 *   缓冲采用「周期重启」策略：每 KEEP_MS 重启录制器并丢弃旧分片，保证缓冲
 *   始终是同一段连续录制（头部分片天然保留）。跨段裁剪/拼接会丢 WebM EBML
 *   头或 MP4 init segment，导致导出文件无法播放
 * - 水印不能画在游戏 canvas 上（会破坏正常渲染），用合成画布每帧
 *   drawImage 复制游戏画面后叠加水印文字，录制合成画布的流
 * - 触发后延迟 4s 定格（TAIL_MS），让级联爆破动画与胜利纸屑播完，
 *   成片时长 = 触发时缓冲余量(0~KEEP_MS) + 4s
 * - 定格后自动重启滚动录制，后续更高光可覆盖成片
 */

const KEEP_MS = 12000;   // 录制器重启周期 = 成片最大缓冲（触发时机不定，成片 4~16s，平均约 10s）
const TAIL_MS = 4000;    // 触发后补录尾巴，让连锁动画播完
const TIMESLICE_MS = 500; // MediaRecorder 分片间隔
const VIDEO_BITS_PER_SECOND = 6000000;

// 优先 MP4（TikTok/短视频平台友好），不支持的浏览器降级 WebM
const MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.42E01E"',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

function pickMime() {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined') return null;
  for (const m of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch (e) { /* 忽略个别浏览器的抛错 */ }
  }
  return null;
}

export class HighlightRecorder {
  /**
   * @param {HTMLCanvasElement} sourceCanvas 被录制的游戏 canvas
   * @param {string} watermark 水印文字（站点链接）
   */
  constructor(sourceCanvas, watermark = 'bb.superzan.net') {
    this.source = sourceCanvas;
    this.watermark = watermark;
    this.compositor = document.createElement('canvas');
    this.ctx = this.compositor.getContext('2d');
    this.recorder = null;
    this.stream = null;
    this.chunks = [];        // Blob[] 当前录制会话的分片
    this.cycleTimer = null;  // 周期重启定时器（限制缓冲长度）
    this.rafId = null;
    this.finalizeTimer = null;
    this.highlight = null;  // { blob, mime, ext } 定格后的成片
    this.onFinalized = null; // 成片就绪回调（结算面板显示导出按钮用）
    this.mime = pickMime();
    // 容器级 MIME（去掉 codecs 参数），用于 Blob/File type，播放器兼容性更好
    this.containerType = this.mime ? this.mime.split(';')[0] : null;
  }

  static supported() {
    return pickMime() !== null;
  }

  get active() {
    return !!this.recorder;
  }

  /** 开始（或继续）滚动录制；不支持 MediaRecorder 时静默 no-op */
  start() {
    if (this.recorder || !this.mime || !this.source.width) return;
    this._fit();
    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      this._fit();
      this.ctx.drawImage(this.source, 0, 0);
      this._drawWatermark();
    };
    this.rafId = requestAnimationFrame(loop);
    this.chunks = [];
    try {
      this.stream = this.compositor.captureStream(30);
      this.recorder = new MediaRecorder(this.stream, {
        mimeType: this.mime,
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
      });
    } catch (e) {
      this._stopLoop();
      this._stopStream();
      this.recorder = null;
      return;
    }
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(TIMESLICE_MS);
    // 周期重启：缓冲超过 KEEP_MS 就丢弃重来，保证分片连续（含头部）且时长有界
    this.cycleTimer = setTimeout(() => {
      this.cycleTimer = null;
      if (this.finalizeTimer || !this.recorder) return; // 定格中不重启
      this.stop();
      this.start();
    }, KEEP_MS);
  }

  /** 停止录制并丢弃缓冲（离开彩蛋模式 / 重开新局时调用） */
  stop() {
    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }
    if (this.finalizeTimer) {
      clearTimeout(this.finalizeTimer);
      this.finalizeTimer = null;
    }
    this._stopLoop();
    if (this.recorder) {
      const rec = this.recorder;
      this.recorder = null;
      rec.ondataavailable = null;
      rec.onstop = null;
      try { if (rec.state !== 'inactive') rec.stop(); } catch (e) { /* 忽略 */ }
    }
    this._stopStream();
    this.chunks = [];
  }

  /** 丢弃已定格的成片（新一局开始时调用） */
  clearHighlight() {
    this.highlight = null;
  }

  hasBlob() {
    return !!this.highlight;
  }

  getBlobInfo() {
    return this.highlight;
  }

  /**
   * 高光触发：安排 TAIL_MS 后定格最近窗口为成片（重复调用防抖）。
   * 调用方：FEVER 激活 或 连锁 ≥ 10。
   */
  trigger() {
    if (!this.recorder || this.finalizeTimer) return;
    this.finalizeTimer = setTimeout(() => {
      this.finalizeTimer = null;
      this._finalize();
    }, TAIL_MS);
  }

  // === 内部实现 ===

  _finalize() {
    if (!this.recorder) return;
    const rec = this.recorder;
    const chunks = this.chunks;
    const mime = this.mime;
    this.recorder = null;
    this.chunks = [];
    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }
    this._stopLoop();
    // stop() 冲刷的最后一片分片也要进入本次成片
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      if (chunks.length) {
        this.highlight = {
          blob: new Blob(chunks, { type: this.containerType }),
          mime,
          ext: mime.includes('mp4') ? 'mp4' : 'webm',
        };
        if (this.onFinalized) this.onFinalized(this.highlight);
      }
      this._stopStream();
      this.start(); // 继续滚动录制，后续高光可覆盖
    };
    rec.onstop = done;
    try {
      rec.stop();
    } catch (e) {
      done();
    }
  }

  /** 合成画布尺寸跟随源画布（响应式/难度切换时自动适配） */
  _fit() {
    if (this.compositor.width !== this.source.width || this.compositor.height !== this.source.height) {
      this.compositor.width = this.source.width;
      this.compositor.height = this.source.height;
    }
  }

  /** 右下角水印：白字 + 深色描边，任意棋盘底色上都可读 */
  _drawWatermark() {
    const w = this.compositor.width;
    const h = this.compositor.height;
    if (!w || !h) return;
    const fs = Math.max(16, Math.round(w * 0.028));
    this.ctx.font = '700 ' + fs + "px system-ui, -apple-system, 'Segoe UI', sans-serif";
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'bottom';
    const x = w - fs * 0.7;
    const y = h - fs * 0.6;
    this.ctx.lineWidth = Math.max(2, fs * 0.14);
    this.ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    this.ctx.strokeText(this.watermark, x, y);
    this.ctx.fillStyle = 'rgba(255,255,255,0.92)';
    this.ctx.fillText(this.watermark, x, y);
  }

  _stopLoop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  _stopStream() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        try { track.stop(); } catch (e) { /* 忽略 */ }
      });
      this.stream = null;
    }
  }
}
