/**
 * Web Audio 音效管理器
 * 用 OscillatorNode 生成音效，无需外部音频文件
 */
export class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  /** 懒初始化 AudioContext（需要用户交互后才能创建） */
  _ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  setMuted(muted) {
    this.muted = muted;
  }

  isMuted() {
    return this.muted;
  }

  /**
   * 播放一个简单的正弦波音
   * @param {number} freq - 频率 Hz
   * @param {number} duration - 持续秒
   * @param {string} type - 波形: sine/square/triangle/sawtooth
   * @param {number} volume - 0~1
   */
  _beep(freq, duration, type = 'sine', volume = 0.15) {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  /** 翻开豆子 - 短促 blip（Phase 4：combo 升调，每连击 +1 半音，封顶 +12） */
  playReveal(combo = 0) {
    const semis = Math.min(12, Math.max(0, Math.floor(combo)));
    const freq = 660 * Math.pow(1.0595, semis); // 12-ET 半音步进
    this._beep(freq, 0.08, 'sine', 0.12);
  }

  /** 标记旗帜 - 清脆 click */
  playFlag() {
    this._beep(880, 0.06, 'triangle', 0.10);
  }

  /** 取消标记 - 低一音 */
  playUnflag() {
    this._beep(550, 0.06, 'triangle', 0.10);
  }

  /** 爆炸 - 低频噪声 + 下滑 */
  playExplode() {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;

    // 低频方波下滑模拟爆炸
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);

    // 叠加一层噪声
    const bufferSize = ctx.sampleRate * 0.3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.15;
    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start();
  }

  /** Bean Boom 引爆 - 上扬轰鸣 + 短噪声（与踩雷的下沉爆炸声区分）
   *  @param {number} pitchStep - 级联升调步进（0=基础音, 1/2/3...=每次级联升半音） */
  playBoom(pitchStep = 0) {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;

    const pitchMult = Math.pow(1.0595, pitchStep); // 半音步进（12-ET）
    const baseFreq = 120 * pitchMult;
    const peakFreq = 360 * pitchMult;

    // 低频上滑：从沉闷到明亮，营造"引爆得利"的正反馈
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(peakFreq, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);

    // 叠加短促噪声"啪"
    const bufferSize = Math.floor(ctx.sampleRate * 0.1);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.1;
    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start();
  }

  /** 胜利 - 上行琶音 */
  playWin() {
    if (this.muted) return;
    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      setTimeout(() => this._beep(freq, 0.15, 'sine', 0.15), i * 100);
    });
  }
}
