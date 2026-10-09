// 可冻结倒计时：缓冲、广告、标签页休眠或用户暂停时停止走秒
window.YSR = window.YSR || {};
YSR.createCountdown = ({ isFrozen } = {}) => {
  let remaining = 0, total = 0;
  let timer = null, last = 0, paused = false, stopped = false;
  let onTick = null, onDone = null;

  const tick = () => {
    if (paused || stopped) return;
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    if (isFrozen && isFrozen()) return; // 冻结期间不计时
    remaining -= dt;
    if (remaining <= 0) {
      remaining = 0;
      if (onTick) onTick(0);
      const cb = onDone;
      api.stop();
      if (cb) cb();
    } else {
      if (onTick) onTick(remaining);
    }
  };

  const api = {
    start(sec, cb = {}) {
      total = sec; remaining = sec;
      onTick = cb.onTick || null; onDone = cb.onDone || null;
      paused = false; stopped = false;
      last = performance.now();
      if (timer) clearInterval(timer);
      timer = setInterval(tick, 200);
      if (onTick) onTick(remaining);
    },
    skip() { if (!stopped && remaining > 0) { const cb = onDone; api.stop(); if (cb) cb(); } },
    pause() { paused = true; },
    resume() { if (!paused) return; paused = false; last = performance.now(); },
    stop() { stopped = true; if (timer) { clearInterval(timer); timer = null; } },
    get remaining() { return remaining; },
    get total() { return total; },
    get paused() { return paused; },
    get running() { return !!timer; }
  };
  return api;
};
