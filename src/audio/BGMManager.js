/**
 * BGM 背景音乐管理器
 * 使用 HTML5 Audio 播放预下载的 chiptune/8-bit 循环曲目
 *
 * 曲目来源：
 * - Maskedsound 8-bit Action Music Pack（itch.io，需手动下载）
 * - soundimage.org chiptunes（Eric Matyas，已集成）
 *
 * 场景-BGM 对应：
 *   idle/menu → arcade-heroes（英雄出场主题）
 *   easy     → up-the-ladder（平台跳跃）
 *   medium   → arcade-puzzler（专注解谜）
 *   hard     → sunny-80s（快节奏80年代街机）
 *   won      → Web Audio API 合成的小号胜利号角（~3s）
 *   lost     → Web Audio API 合成的炸弹爆炸声
 */

const SCENE_BGM = {
  menu:   'arcade-heroes',
  easy:   'up-the-ladder',
  medium: 'arcade-puzzler',
  hard:   'sunny-80s',
};

const FADE_MS = 300;

export class BGMManager {
  constructor() {
    this._audio = null;        // 当前循环 BGM <audio>
    this._currentScene = null;
    this._muted = false;
    this._enabled = true;      // 总开关
    this._loadQueue = {};
    this._fadeTimer = null;    // 当前淡入淡出定时器
    this._audioCtx = null;     // Web Audio API 上下文（合成爆炸/号角）
  }

  /** 懒初始化 AudioContext（需要用户交互后才能创建） */
  _getAudioCtx() {
    if (!this._audioCtx) {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // 某些浏览器会在长时间无交互后暂停 AudioContext
    if (this._audioCtx.state === 'suspended') {
      this._audioCtx.resume();
    }
    return this._audioCtx;
  }

  /** 取消所有进行中的渐变 */
  _cancelFade() {
    if (this._fadeTimer) {
      clearInterval(this._fadeTimer);
      this._fadeTimer = null;
    }
  }

  /** 是否静音 */
  setMuted(m) { this._muted = m; this._applyMute(); }
  isMuted() { return this._muted; }

  /** 总开关（关闭则停止所有 BGM） */
  setEnabled(e) {
    this._enabled = e;
    if (!e) this.stop();
  }
  isEnabled() { return this._enabled; }

  _applyMute() {
    if (this._audio) this._audio.muted = this._muted;
  }

  /** 获取或创建指定场景的 Audio 元素 */
  _getAudio(scene) {
    const key = SCENE_BGM[scene];
    if (!key) return null;
    if (!this._loadQueue[key]) {
      const audio = new Audio(`/audio/${key}.mp3`);
      audio.preload = 'auto';
      audio.muted = this._muted;
      this._loadQueue[key] = audio;
    }
    return this._loadQueue[key];
  }

  /**
   * 切换到指定场景的 BGM
   * @param {string} scene - 'menu'|'easy'|'medium'|'hard'|'won'|'lost'
   */
  switchTo(scene) {
    if (!this._enabled) return;
    if (scene === this._currentScene) return;

    // lost: 炸弹爆炸声（Web Audio API 合成）
    if (scene === 'lost') {
      if (this._audio && !this._audio.paused) {
        this._audio.volume = 0;
        this._audio.pause();
        this._audio.currentTime = 0;
      }
      this._playExplosion();
      this._currentScene = scene;
      return;
    }

    // won: 胜利号角（Web Audio API 合成）
    if (scene === 'won') {
      if (this._audio && !this._audio.paused) {
        this._audio.volume = 0;
        this._audio.pause();
        this._audio.currentTime = 0;
      }
      this._playTrumpetFanfare();
      this._currentScene = scene;
      return;
    }

    this._crossFadeTo(scene);
    this._currentScene = scene;
  }

  /** 淡出当前 → 停止 → 淡入新曲目（串行，不重叠） */
  _crossFadeTo(scene) {
    const old = this._audio;
    const next = this._getAudio(scene);
    if (!next) return;

    // 同一个 track，什么都不做
    if (old === next && old && !old.paused) return;

    // 取消之前的渐变
    this._cancelFade();

    // 步骤 1: 如果有旧曲目在放，先淡出再开始新的
    if (old && !old.paused) {
      const startVol = old.volume;
      const steps = 8;
      const stepMs = FADE_MS / steps;
      let step = 0;

      this._fadeTimer = setInterval(() => {
        step++;
        old.volume = Math.max(0, startVol * (1 - step / steps));
        if (step >= steps) {
          clearInterval(this._fadeTimer);
          this._fadeTimer = null;
          old.pause();
          old.currentTime = 0;
          // 步骤 2: 旧曲目彻底停掉后，再开始新曲目
          this._startScene(next);
        }
      }, stepMs);
    } else {
      // 没有旧曲目，直接开始
      if (old) { old.pause(); old.currentTime = 0; }
      this._startScene(next);
    }

    this._audio = next;
  }

  /** 启动新场景 BGM（带淡入） */
  _startScene(audio) {
    this._cancelFade();
    audio.volume = 0;
    audio.loop = true;
    audio.currentTime = 0;
    audio.play().catch(() => {});

    let step = 0;
    const steps = 10;
    const stepMs = FADE_MS / steps;
    this._fadeTimer = setInterval(() => {
      step++;
      audio.volume = Math.min(1, step / steps);
      if (step >= steps) {
        clearInterval(this._fadeTimer);
        this._fadeTimer = null;
      }
    }, stepMs);
  }

  /** 合成小号胜利号角（Web Audio API，~3s） */
  _playTrumpetFanfare() {
    if (this._muted) return;

    try {
      const ctx = this._getAudioCtx();
      const now = ctx.currentTime;

      // ---- 主音量包络：快起 → 保持 → 渐弱 ----
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0, now);
      masterGain.gain.linearRampToValueAtTime(0.65, now + 0.03);
      masterGain.gain.setValueAtTime(0.65, now + 2.6);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 3.0);
      masterGain.connect(ctx.destination);

      // ---- 铜管滤波器（低通 + 谐振，模拟号角音色） ----
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2400, now);
      filter.Q.setValueAtTime(6, now);
      filter.connect(masterGain);

      // ---- 主旋律振荡器（锯齿波，音色明亮） ----
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';

      // 胜利号角: G4 → C5 → E5 → G5 → C6（上行大三和弦 + 八度）
      const t = now;
      osc.frequency.setValueAtTime(392, t);         // G4  0.00 → 0.20 短促引子
      osc.frequency.setValueAtTime(523, t + 0.20);  // C5  0.20 → 0.45
      osc.frequency.setValueAtTime(659, t + 0.45);  // E5  0.45 → 1.10 首次停留
      osc.frequency.setValueAtTime(784, t + 1.10);  // G5  1.10 → 1.80
      osc.frequency.setValueAtTime(1047, t + 1.80); // C6  1.80 → 2.80 最终辉煌

      osc.connect(filter);
      osc.start(now);
      osc.stop(now + 3.0);

      // ---- 低八度和声（方波，增加厚重感） ----
      const osc2 = ctx.createOscillator();
      osc2.type = 'square';
      const osc2Gain = ctx.createGain();
      osc2Gain.gain.setValueAtTime(0.18, now);
      osc2Gain.gain.exponentialRampToValueAtTime(0.001, now + 3.0);
      osc2Gain.connect(filter);

      osc2.frequency.setValueAtTime(196, t);         // G3
      osc2.frequency.setValueAtTime(262, t + 0.20);  // C4
      osc2.frequency.setValueAtTime(330, t + 0.45);  // E4
      osc2.frequency.setValueAtTime(392, t + 1.10);  // G4
      osc2.frequency.setValueAtTime(523, t + 1.80);  // C5

      osc2.connect(osc2Gain);
      osc2.start(now);
      osc2.stop(now + 3.0);

      // ---- 轻微颤音（模拟小号手吹奏颤音） ----
      const vibrato = ctx.createOscillator();
      vibrato.type = 'sine';
      vibrato.frequency.setValueAtTime(5.5, now);
      const vibratoGain = ctx.createGain();
      vibratoGain.gain.setValueAtTime(4, now);       // ±4Hz 微颤
      vibratoGain.gain.linearRampToValueAtTime(6, now + 2.0); // 结尾颤音加大
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);

      vibrato.start(now);
      vibrato.stop(now + 3.0);

      // ---- 号角结束后回到菜单 BGM ----
      setTimeout(() => {
        this._currentScene = null;
        this.switchTo('menu');
      }, 3200);
    } catch (e) {
      // AudioContext 尚未创建，静默失败
    }
  }

  /** 合成炸弹爆炸声（Web Audio API，震撼低音 ~2.8s） */
  _playExplosion() {
    if (this._muted) return;

    try {
      const ctx = this._getAudioCtx();
      const now = ctx.currentTime;

      // ========== 总输出限幅，防止爆音 ==========
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-6, now);
      limiter.knee.setValueAtTime(0, now);
      limiter.ratio.setValueAtTime(20, now);
      limiter.attack.setValueAtTime(0.003, now);
      limiter.release.setValueAtTime(0.25, now);
      limiter.connect(ctx.destination);

      // ========== Layer 1: 超低频冲击波（瞬间 punch） ==========
      const punchGain = ctx.createGain();
      punchGain.gain.setValueAtTime(1.2, now);
      punchGain.gain.exponentialRampToValueAtTime(0.6, now + 0.08);
      punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      punchGain.connect(limiter);

      const punchOsc = ctx.createOscillator();
      punchOsc.type = 'sine';
      punchOsc.frequency.setValueAtTime(50, now);
      punchOsc.frequency.exponentialRampToValueAtTime(18, now + 0.5);
      punchOsc.connect(punchGain);
      punchOsc.start(now);
      punchOsc.stop(now + 0.6);

      // ========== Layer 2: 主爆炸体（厚重低频，2.2s 长衰减） ==========
      const bodyGain = ctx.createGain();
      bodyGain.gain.setValueAtTime(0.01, now);
      bodyGain.gain.linearRampToValueAtTime(1.0, now + 0.02);
      bodyGain.gain.setValueAtTime(0.85, now + 0.3);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 2.2);
      bodyGain.connect(limiter);

      const bodyOsc = ctx.createOscillator();
      bodyOsc.type = 'sine';
      bodyOsc.frequency.setValueAtTime(90, now);
      bodyOsc.frequency.exponentialRampToValueAtTime(12, now + 2.0);
      bodyOsc.connect(bodyGain);
      bodyOsc.start(now);
      bodyOsc.stop(now + 2.3);

      // ========== Layer 3: 中频轰鸣（三角形波，增加粗糙感） ==========
      const roarGain = ctx.createGain();
      roarGain.gain.setValueAtTime(0.01, now);
      roarGain.gain.linearRampToValueAtTime(0.55, now + 0.03);
      roarGain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
      roarGain.connect(limiter);

      const roarOsc = ctx.createOscillator();
      roarOsc.type = 'triangle';
      roarOsc.frequency.setValueAtTime(140, now);
      roarOsc.frequency.exponentialRampToValueAtTime(25, now + 1.4);
      roarOsc.connect(roarGain);
      roarOsc.start(now);
      roarOsc.stop(now + 1.7);

      // ========== Layer 4: 深棕噪声持续轰鸣（模拟大地震动） ==========
      const bufferSize = ctx.sampleRate * 2.5;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);

      // 生成棕噪声：每样本累加随机值（积分白噪声 = 低频增强 6dB/octave）
      let brown = 0;
      for (let i = 0; i < bufferSize; i++) {
        brown += (Math.random() * 2 - 1) * 0.02;
        brown = Math.max(-1, Math.min(1, brown));
        noiseData[i] = brown * 0.7;
      }

      const rumbleNoise = ctx.createBufferSource();
      rumbleNoise.buffer = noiseBuffer;

      const rumbleGain = ctx.createGain();
      rumbleGain.gain.setValueAtTime(0.01, now);
      rumbleGain.gain.linearRampToValueAtTime(0.4, now + 0.05);
      rumbleGain.gain.setValueAtTime(0.3, now + 0.4);
      rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
      rumbleGain.connect(limiter);

      const rumbleFilter = ctx.createBiquadFilter();
      rumbleFilter.type = 'lowpass';
      rumbleFilter.frequency.setValueAtTime(200, now);
      rumbleFilter.frequency.exponentialRampToValueAtTime(60, now + 2.0);
      rumbleFilter.connect(rumbleGain);

      rumbleNoise.connect(rumbleFilter);
      rumbleNoise.start(now);
      rumbleNoise.stop(now + 2.5);

      // ========== Layer 5: 碎石飞溅（短促中高频噪声，音量压低） ==========
      const debrisGain = ctx.createGain();
      debrisGain.gain.setValueAtTime(0.18, now);
      debrisGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      debrisGain.connect(limiter);

      const debrisFilter = ctx.createBiquadFilter();
      debrisFilter.type = 'bandpass';
      debrisFilter.frequency.setValueAtTime(1500, now);
      debrisFilter.frequency.exponentialRampToValueAtTime(4000, now + 0.1);
      debrisFilter.frequency.exponentialRampToValueAtTime(600, now + 0.5);
      debrisFilter.Q.setValueAtTime(1.5, now);
      debrisFilter.connect(debrisGain);

      const debrisBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const debrisData = debrisBuf.getChannelData(0);
      for (let i = 0; i < debrisData.length; i++) {
        debrisData[i] = Math.random() * 2 - 1;
      }

      const debrisNoise = ctx.createBufferSource();
      debrisNoise.buffer = debrisBuf;
      debrisNoise.connect(debrisFilter);
      debrisNoise.start(now);
      debrisNoise.stop(now + 0.5);

      // ========== Layer 6: 第一次余震（0.35s 延迟） ==========
      const aft1Gain = ctx.createGain();
      aft1Gain.gain.setValueAtTime(0, now);
      aft1Gain.gain.linearRampToValueAtTime(0.5, now + 0.37);
      aft1Gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
      aft1Gain.connect(limiter);

      const aft1Osc = ctx.createOscillator();
      aft1Osc.type = 'sawtooth';
      aft1Osc.frequency.setValueAtTime(70, now + 0.35);
      aft1Osc.frequency.exponentialRampToValueAtTime(20, now + 1.2);

      const aft1Filter = ctx.createBiquadFilter();
      aft1Filter.type = 'lowpass';
      aft1Filter.frequency.setValueAtTime(400, now + 0.35);
      aft1Filter.frequency.exponentialRampToValueAtTime(80, now + 1.2);

      aft1Osc.connect(aft1Filter);
      aft1Filter.connect(aft1Gain);
      aft1Osc.start(now + 0.35);
      aft1Osc.stop(now + 1.4);

      // ========== Layer 7: 第二次余震（0.8s 延迟，更弱） ==========
      const aft2Gain = ctx.createGain();
      aft2Gain.gain.setValueAtTime(0, now);
      aft2Gain.gain.linearRampToValueAtTime(0.28, now + 0.83);
      aft2Gain.gain.exponentialRampToValueAtTime(0.001, now + 1.9);
      aft2Gain.connect(limiter);

      const aft2Osc = ctx.createOscillator();
      aft2Osc.type = 'triangle';
      aft2Osc.frequency.setValueAtTime(55, now + 0.8);
      aft2Osc.frequency.exponentialRampToValueAtTime(18, now + 1.7);

      const aft2Filter = ctx.createBiquadFilter();
      aft2Filter.type = 'lowpass';
      aft2Filter.frequency.setValueAtTime(250, now + 0.8);
      aft2Filter.frequency.exponentialRampToValueAtTime(50, now + 1.7);

      aft2Osc.connect(aft2Filter);
      aft2Filter.connect(aft2Gain);
      aft2Osc.start(now + 0.8);
      aft2Osc.stop(now + 1.9);

      // ---- 爆炸结束后回到菜单 BGM ----
      setTimeout(() => {
        this._currentScene = null;
        this.switchTo('menu');
      }, 3000);
    } catch (e) {
      // AudioContext 尚未创建或浏览器限制，静默失败
    }
  }

  /** 停止所有音乐 */
  stop() {
    this._cancelFade();
    this._currentScene = null;
    if (this._audio) {
      this._audio.pause();
      this._audio.currentTime = 0;
      this._audio = null;
    }
  }
}
