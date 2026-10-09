// 运行在页面主世界（MAIN world）：读取播放器数据、抓取字幕、控制播放
// 与内容脚本（隔离世界）通过 window.postMessage 桥接
(() => {
  if (window.__YSR_MAIN_BRIDGE__) return;
  window.__YSR_MAIN_BRIDGE__ = true;

  const REQ = '__ysr_req__';
  const RES = '__ysr_res__';
  let latestPR = null;

  const capture = (pr) => { if (pr && typeof pr === 'object' && pr.captions) latestPR = pr; };
  const probe = () => { try { if (window.ytInitialPlayerResponse) capture(window.ytInitialPlayerResponse); } catch (e) {} };
  probe();

  // 拦截播放器自己的字幕请求（带全部校验参数，是最可靠的字幕数据来源）
  const timedtextCache = new Map();
  window.__ysrLastTimedtext = null;
  const noteTimedtext = (url, text) => {
    try {
      if (!url || !text) return;
      if (String(url).indexOf('/api/timedtext') === -1) return;
      timedtextCache.set(String(url), text);
      window.__ysrLastTimedtext = { url: String(url), text, t: Date.now() };
    } catch (e) {}
  };

  // 拦截 SPA 导航时的 player 接口响应
  const _fetch = window.fetch;
  if (_fetch) {
    window.fetch = async function (...args) {
      const res = await _fetch.apply(this, args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
        if (url.includes('/youtubei/v1/player')) {
          res.clone().json().then(capture).catch(() => {});
        }
        if (url.indexOf('/api/timedtext') !== -1) {
          res.clone().text().then((t) => noteTimedtext(url, t)).catch(() => {});
        }
      } catch (e) {}
      return res;
    };
  }

  // 覆盖 XHR 路径的字幕请求
  try {
    const _xo = XMLHttpRequest.prototype.open;
    const _xs = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__ysrUrl = u; return _xo.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      const xhr = this;
      xhr.addEventListener('load', () => {
        try {
          const u = String(xhr.__ysrUrl || '');
          if (u.indexOf('/api/timedtext') !== -1) noteTimedtext(u, xhr.responseText);
        } catch (e) {}
      });
      return _xs.apply(this, arguments);
    };
  } catch (e) {}

  const player = () => document.getElementById('movie_player');

  function getPlayerResponse() {
    try {
      const p = player();
      if (p && typeof p.getPlayerResponse === 'function') {
        const pr = p.getPlayerResponse();
        if (pr) { capture(pr); return pr; }
      }
    } catch (e) {}
    return latestPR;
  }

  const handlers = {
    PING: () => ({ ok: true }),
    GET_PLAYER_RESPONSE: () => getPlayerResponse(),
    FETCH_TEXT: async ({ url, creds }) => {
      const res = await fetch(url, { credentials: creds || 'omit' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    },
    GET_TIMEDTEXT: () => {
      const entries = [];
      timedtextCache.forEach((text, url) => entries.push({ url, text }));
      return { latest: window.__ysrLastTimedtext || null, entries };
    },
    TRIGGER_CC: ({ lang }) => {
      const p = player();
      if (!p) throw new Error('player not ready');
      if (typeof p.loadModule !== 'function' || typeof p.setOption !== 'function') {
        throw new Error('player captions API unavailable');
      }
      const t0 = Date.now();
      let prev = null;
      try { if (typeof p.getOption === 'function') prev = p.getOption('captions', 'track'); } catch (e) {}
      try { p.loadModule('captions'); } catch (e) {}
      p.setOption('captions', 'track', { languageCode: lang || 'en' });
      return { t0, prev };
    },
    RESTORE_CC: ({ prev }) => {
      const p = player();
      try {
        if (prev && prev.languageCode) {
          p.setOption('captions', 'track', prev);
        } else {
          try { p.setOption('captions', 'track', {}); } catch (e2) {}
          try { if (typeof p.unloadModule === 'function') p.unloadModule('captions'); } catch (e3) {}
        }
      } catch (e) {}
      return {};
    },
    PLAYER_CMD: ({ action, value }) => {
      const p = player();
      if (!p) throw new Error('player not ready');
      switch (action) {
        case 'play': p.playVideo(); return {};
        case 'pause': p.pauseVideo(); return {};
        case 'seek': p.seekTo(Number(value), true); return {};
        case 'rate': p.setPlaybackRate(Number(value)); return {};
        case 'state':
          return {
            time: typeof p.getCurrentTime === 'function' ? p.getCurrentTime() : 0,
            duration: typeof p.getDuration === 'function' ? p.getDuration() : 0,
            rate: typeof p.getPlaybackRate === 'function' ? p.getPlaybackRate() : 1,
            ad: p.classList ? p.classList.contains('ad-showing') : false
          };
        default: throw new Error('unknown action ' + action);
      }
    }
  };

  window.addEventListener('message', async (e) => {
    const d = e.data;
    if (!d || d.__ysr !== REQ) return;
    let out;
    try {
      const fn = handlers[d.cmd];
      if (!fn) throw new Error('no handler: ' + d.cmd);
      const data = await fn(d.payload || {});
      out = { __ysr: RES, id: d.id, ok: true, data };
    } catch (err) {
      out = { __ysr: RES, id: d.id, ok: false, error: String((err && err.message) || err) };
    }
    try { window.postMessage(out, location.origin); } catch (e) {}
  });
})();
