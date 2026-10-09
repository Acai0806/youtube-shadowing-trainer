// 本地存储：设置、遮罩位置、练习记录、收藏表达、本地埋点（不上传）
window.YSR = window.YSR || {};
YSR.store = (() => {
  const DEFAULT_SETTINGS = {
    rangeMode: 'full',      // full | custom
    rangeStart: 0,
    rangeEnd: null,
    grouping: '1',          // '1' 一句一组 | '2' 两句一组
    rate: 1,                // 0.75 | 1 | 1.25
    pauseMultiplier: 1.5,   // 1.25 | 1.5 | 1.75 | 2.0（停顿 = 组时长 × 倍率）
    fullShowText: true,     // 完整跟读时显示跟随文本
    hardSubtitle: false
  };

  const get = async (k, dflt) => {
    try { const o = await chrome.storage.local.get(k); return (k in o) ? o[k] : dflt; }
    catch (e) { return dflt; }
  };
  const set = (k, v) => chrome.storage.local.set({ [k]: v }).catch(() => {});

  return {
    DEFAULT_SETTINGS,
    getSettings: async () => ({ ...DEFAULT_SETTINGS, ...(await get('settings', {})) }),
    saveSettings: (s) => set('settings', s),

    getMask: async (videoId) => (await get('mask:' + videoId, null)) || (await get('maskLast', null)),
    saveMask: (videoId, m) => { set('mask:' + videoId, m); set('maskLast', m); },

    getResume: (vid) => get('resume:' + vid, null),
    saveResume: (vid, r) => set('resume:' + vid, r),
    clearResume: (vid) => chrome.storage.local.remove('resume:' + vid).catch(() => {}),

    getSavedExpressions: () => get('savedExpressions', []),
    toggleSaved: async (card) => {
      const list = await get('savedExpressions', []);
      const i = list.findIndex((e) => e.key === card.key);
      if (i >= 0) list.splice(i, 1); else list.push({ ...card, savedAt: Date.now() });
      await set('savedExpressions', list);
      return i < 0; // true = 已收藏
    },

    pushRecord: async (r) => {
      const list = await get('records', []);
      list.push({ ...r, at: Date.now() });
      await set('records', list.slice(-50));
    },

    // 本地埋点（仅存本地，不联网上传）
    track: async (name, data) => {
      try {
        const list = await get('events', []);
        list.push({ name, t: Date.now(), ...(data || {}) });
        await set('events', list.slice(-500));
      } catch (e) {}
    }
  };
})();
