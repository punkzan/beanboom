export class Timer {
  constructor(onTick) {
    this.onTick = onTick;
    this.startTime = 0;
    this.elapsed = 0;
    this.intervalId = null;
  }

  start() {
    if (this.intervalId) return;
    this.startTime = Date.now() - this.elapsed;
    this.intervalId = setInterval(() => {
      this.elapsed = Date.now() - this.startTime;
      this.onTick(this.getDisplayTime());
    }, 1000);
    this.onTick(this.getDisplayTime());
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  reset() {
    this.stop();
    this.elapsed = 0;
    this.startTime = 0;
  }

  getDisplayTime() {
    const seconds = Math.floor(this.elapsed / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}
