// 与页面主世界脚本的消息桥（Promise 化 + 超时）
window.YSR = window.YSR || {};
YSR.bridge = (() => {
  const REQ = '__ysr_req__';
  const RES = '__ysr_res__';
  let seq = 0;
  const pending = new Map();

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.__ysr !== RES) return;
    const p = pending.get(d.id);
    if (!p) return;
    pending.delete(d.id);
    if (d.ok) p.resolve(d.data); else p.reject(new Error(d.error || 'bridge error'));
  });

  function call(cmd, payload, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('bridge timeout: ' + cmd));
      }, timeoutMs);
      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); }
      });
      try {
        window.postMessage({ __ysr: REQ, id, cmd, payload: payload || {} }, location.origin);
      } catch (e) {
        clearTimeout(timer);
        pending.delete(id);
        reject(e);
      }
    });
  }

  // 后台代理请求（带 Cookie，用于字幕接口的回退；带 10 秒超时保护）
  function backgroundFetch(url) {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error('后台请求超时'));
      }, 10000);
      try {
        chrome.runtime.sendMessage({ type: 'YSR_FETCH_TEXT', url }, (resp) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!resp || !resp.ok) return reject(new Error((resp && resp.error) || '后台请求失败'));
          resolve(resp.text);
        });
      } catch (e) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  // 播放器控制便捷封装（失败时由调用方回退到 video 元素直控）
  const player = {
    play: () => call('PLAYER_CMD', { action: 'play' }, 4000),
    pause: () => call('PLAYER_CMD', { action: 'pause' }, 4000),
    seek: (t) => call('PLAYER_CMD', { action: 'seek', value: t }, 4000),
    rate: (r) => call('PLAYER_CMD', { action: 'rate', value: r }, 4000)
  };

  return { call, player, backgroundFetch };
})();
