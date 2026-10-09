// 内容脚本主编排：启动检测、设置、遮罩流程、会话生命周期、快捷键与页面切换
(() => {
  const FLAG = '__YSR_CONTENT_INIT__';

  function init() {
  const S = {
    open: false,
    pick: null,
    sentences: [],
    segments: [],
    settings: null,
    resume: null,
    session: null,
    blobURL: null,
    readyModel: null,
    audio: null,
    practiceOpen: false,
    structuralSnapshot: '',
    structuralDirty: false
  };

  const ui = new YSR.UI();

  const videoId = () => {
    try { return new URLSearchParams(location.search).get('v') || 'unknown'; }
    catch (e) { return 'unknown'; }
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const parseTime = (v) => {
    if (v == null) return null;
    const s = String(v).trim();
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    const m = s.match(/^(\d+):([0-5]?\d)(:\d+)?$/);
    if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3].slice(1), 10) : 0);
    const f = parseFloat(s);
    return isNaN(f) ? null : f;
  };

  /* ---------- 检测与设置 ---------- */
  function rebuild() {
    const out = YSR.segments.finalize(videoId(), S.sentences, S.settings);
    S.segments = out.segments;
  }

  function buildReadyModel() {
    return {
      phase: 'ready',
      settings: S.settings,
      preview: YSR.segments.preview(S.segments),
      estimateSec: YSR.segments.estimateSeconds(S.segments, S.settings),
      total: S.segments.length,
      isASR: S.pick && S.pick.isASR,
      translated: S.pick && S.pick.translated,
      hasResume: S.resume,
      practice: S.practiceOpen,
      structuralDirty: S.structuralDirty,
      aiStatus: S.aiStatus || { llm: false, asr: false }
    };
  }

  function renderReady() {
    S.readyModel = buildReadyModel();
    ui.showLauncher(S.readyModel);
  }

  function applySettings(patch) {
    const st = S.settings;
    if (!st) return;
    ['rangeMode', 'grouping', 'rate', 'pauseMultiplier', 'hardSubtitle'].forEach((k) => {
      if (k in patch) st[k] = patch[k];
    });
    if ('minPause' in patch) {
      const v = parseTime(patch.minPause);
      if (v != null) st.minPause = Math.max(0.5, v);
    }
    if ('maxPause' in patch) {
      const v = parseTime(patch.maxPause);
      if (v != null) st.maxPause = Math.max(0.5, v);
    }
    if ('rangeStart' in patch) {
      const v = parseTime(patch.rangeStart);
      if (v != null) st.rangeStart = Math.max(0, v);
    }
    if ('rangeEnd' in patch) {
      const v = parseTime(patch.rangeEnd);
      if (v != null) st.rangeEnd = Math.max(0, v);
    }
    rebuild();
    YSR.store.saveSettings(st);
    if (S.practiceOpen) {
      const snap = JSON.stringify([st.rangeMode, st.rangeStart, st.rangeEnd, st.grouping]);
      S.structuralDirty = snap !== S.structuralSnapshot;
    }
    S.readyModel = buildReadyModel();
    ui.updateLauncher(S.readyModel);
  }

  /* ---------- 练习中的设置 ---------- */
  function indexAtTime(t) {
    for (const s of S.segments) {
      if (t >= s.startTime - 0.05 && t < s.endTime) return s.index;
    }
    for (const s of S.segments) {
      if (s.startTime >= t) return s.index;
    }
    return S.segments.length ? S.segments[S.segments.length - 1].index : 0;
  }

  function openPracticeSettings() {
    const s = S.session;
    if (!s || s.finished) return;
    s.control('pause'); // 自动暂停（幂等：已暂停则无操作）
    S.practiceOpen = true;
    S.structuralSnapshot = JSON.stringify([S.settings.rangeMode, S.settings.rangeStart, S.settings.rangeEnd, S.settings.grouping]);
    S.structuralDirty = false;
    renderReady();
  }

  async function openLauncher() {
    const p = ui.ensureMounted();
    console.info('[影子跟读] 打开面板', { playerFound: !!p, path: location.pathname });
    S.open = true;
    // 强制清空上一个视频的分析结果，保证每次打开都是全新检测
    S.pick = null;
    S.sentences = [];
    S.segments = [];
    S.resume = null;
    S.readyModel = null;
    if (!p) {
      ui.showLauncher({ phase: 'error', error: { title: '播放器未就绪', detail: '请刷新页面后再试。' } });
      return;
    }
    if (!location.pathname.startsWith('/watch')) {
      ui.showLauncher({ phase: 'error', error: { title: '请在视频页使用', detail: '打开任意 YouTube 视频页（地址含 /watch）后再点击插件图标。' } });
      return;
    }
    ui.showLauncher({ phase: 'detecting', step: 0 });
    YSR.store.track('extension_open', { videoId: videoId() });
    try {
      const tracks = await YSR.captions.getTracks();
      const trackInfo = tracks.map((t) => (t.languageCode || '?') + (t.kind === 'asr' ? '(自动)' : '(人工)')).join(', ');
      console.info('[影子跟读] 可用字幕轨道:', trackInfo || '无');
      const pick = YSR.captions.pickEnglishOrTranslatable(tracks);
      if (!pick) {
        YSR.store.track('video_detect_result', { ok: false, reason: 'no_en_subtitle', tracks: trackInfo });
        ui.showLauncher({ phase: 'error', error: { title: '未找到可用的英文字幕', detail: '检测到的轨道：' + (trackInfo || '无') + '。当前仅支持带英文 CC 字幕的视频。' } });
        return;
      }
      S.pick = pick;
      ui.showLauncher({ phase: 'detecting', step: 1, isASR: pick.isASR, translated: pick.translated });
      const tokens = await YSR.captions.fetchCues(pick.track.baseUrl, pick.translated);
      const sentences = YSR.segments.dedupe(YSR.segments.buildSentences(tokens));
      if (!sentences.length) throw new Error('字幕解析结果为空');
      S.sentences = sentences;
      ui.showLauncher({ phase: 'detecting', step: 2, isASR: pick.isASR });

      S.settings = await YSR.store.getSettings();
      S.resume = await YSR.store.getResume(videoId());
      try { S.aiStatus = await YSR.ai.status(); } catch (e) { S.aiStatus = { llm: false, asr: false }; }
      rebuild();
      YSR.store.track('subtitle_detect_result', {
        ok: true, isASR: pick.isASR, sentences: sentences.length, groups: S.segments.length
      });
      console.info('[影子跟读] 字幕检测完成', { groups: S.segments.length });
      renderReady();
    } catch (e) {
      const reason = String((e && e.message) || e);
      YSR.store.track('video_detect_result', { ok: false, reason });
      console.warn('[影子跟读] 字幕读取失败:', reason);
      ui.showLauncher({ phase: 'error', error: { title: '字幕读取失败', detail: reason + '。可点「重试」再试一次；持续失败建议更换视频。' } });
    }
  }

  /* ---------- 遮罩与开始 ---------- */
  async function enterAdjust() {
    const saved = await YSR.store.getMask(videoId());
    ui.setMaskPct(saved);
    ui.showMask('edit', {});
    ui.showLauncher({ phase: 'adjust' });
  }

  function fixAndStart() {
    ui.setEditing(false);
    const pct = ui.getMaskPct();
    if (pct) YSR.store.saveMask(videoId(), pct);
    ui.hidePanel();
    startPractice(0);
  }

  function startPractice(index = 0) {
    if (!S.segments || !S.segments.length) return;
    S.open = false;
    S.practiceOpen = false;
    S.structuralDirty = false;
    ui.hidePanel();
    const vEl = document.querySelector('#movie_player video');
    if (!vEl) { ui.toast('未找到视频元素，请刷新页面'); return; }
    if (S.session) S.session.destroy();
    S.session = new YSR.PracticeSession({
      videoId: videoId(),
      videoEl: vEl,
      settings: { ...S.settings },
      segments: S.segments,
      sentences: S.sentences,
      ui,
      hooks: { onComplete: showResult }
    });
    ui.showControls({ index, total: S.segments.length, paused: false });
    YSR.store.clearResume(videoId());
    YSR.store.track('practice_start', { videoId: videoId(), groups: S.segments.length });
    S.session.start(index);
  }

  /* ---------- 结果 ---------- */
  function showResult(result) {
    if (result.recordingBlob) {
      if (S.blobURL) { try { URL.revokeObjectURL(S.blobURL); } catch (e) {} }
      S.blobURL = URL.createObjectURL(result.recordingBlob);
    }
    result.recordingURL = !!S.blobURL;
    ui.showMask('off');
    ui.hideControls();
    ui.showResult(result);
    YSR.store.pushRecord({
      videoId: videoId(),
      doneSegs: result.doneSegs,
      totalSegs: result.totalSegs,
      recSec: result.recSec
    });
  }

  function playRecording() {
    if (!S.blobURL) return;
    try {
      if (S.audio) { S.audio.pause(); }
      S.audio = new Audio(S.blobURL);
      S.audio.play();
    } catch (e) { ui.toast('录音播放失败'); }
  }

  /* ---------- 事件接线 ---------- */
  ui.on('close', () => { S.open = false; ui.hidePanel(); ui.showMask('off'); });
  ui.on('openAiSettings', () => {
    try { chrome.runtime.sendMessage({ type: 'YSR_OPEN_OPTIONS' }, () => void chrome.runtime.lastError); } catch (e) {}
  });
  ui.on('retry', () => openLauncher());
  ui.on('settings', (patch) => applySettings(patch));
  ui.on('resume', () => { if (S.resume) startPractice(S.resume.index); });
  ui.on('start', () => enterAdjust());
  ui.on('useDefault', () => { ui.setMaskPct(null); });
  ui.on('fix', () => fixAndStart());
  ui.on('maskMoved', (pct) => { YSR.store.saveMask(videoId(), pct); });
  ui.on('lockToggle', () => { ui.setEditing(!ui.editing); });
  ui.on('ctl', (act) => {
    const s = S.session;
    if (!s) return;
    if (act === 'exit') { ui.showConfirm(); return; }
    if (act === 'settings') { openPracticeSettings(); return; }
    s.control(act);
  });
  ui.on('backToSettings', () => { ui.showMask('off'); S.open = true; renderReady(); });
  ui.on('resumePractice', () => {
    S.practiceOpen = false;
    ui.hidePanel();
    const s = S.session;
    if (!s || s.finished) return;
    if (S.structuralDirty) {
      const t = s.currentTime();
      const idx = indexAtTime(t);
      s.destroy({ saveResume: false });
      S.session = null;
      S.structuralDirty = false;
      startPractice(idx);
      ui.toast('已按新设置继续练习');
    } else {
      S.structuralDirty = false;
      s.resumeFromSettings({ ...S.settings });
    }
  });
  ui.on('exitChoice', (quit) => {
    if (!quit) return;
    S.practiceOpen = false;
    S.structuralDirty = false;
    if (S.session) { S.session.destroy(); S.session = null; }
    S.open = true;
    if (S.readyModel) ui.showLauncher(S.readyModel);
  });
  ui.on('startFull', () => S.session && S.session.startFull());
  ui.on('finishFull', () => S.session && S.session.finishFull());
  ui.on('seekStay', () => S.session && S.session.seekStay());
  ui.on('seekMove', () => S.session && S.session.seekMove());
  ui.on('toggleFullText', () => S.session && S.session.toggleFullText());
  ui.on('playRecording', () => playRecording());
  ui.on('replaySeg', (i) => S.session && S.session.replaySegment(i));
  ui.on('goto', (t) => {
    if (S.session) S.session.gotoTime(t);
    else {
      YSR.bridge.player.seek(t).catch(() => {});
      YSR.bridge.player.play().catch(() => {});
    }
  });
  ui.on('saveToggle', async (card, btn) => {
    const saved = await YSR.store.toggleSaved(card);
    ui.markSaved(card.key, saved);
    YSR.store.track(saved ? 'expression_save' : 'expression_unsave', { key: card.key });
  });
  ui.on('masterToggle', () => { /* MVP：仅界面状态，1.1 接入复习 */ });
  ui.on('restart', () => { ui.hidePanel(); startPractice(0); });
  ui.on('closeResult', () => { ui.hidePanel(); S.open = false; });

  /* ---------- 工具栏图标 ---------- */
  chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
    if (m && m.type === 'YSR_PING') { sendResponse({ ok: true }); return; }
    if (m && m.type === 'YSR_TOGGLE_LAUNCHER') {
      console.info('[影子跟读] 收到图标点击');
      if (S.session) { ui.toast('练习进行中 · 需要退出请用控制条'); return; }
      if (S.open) { S.open = false; ui.hidePanel(); ui.showMask('off'); }
      else openLauncher().catch((e) => console.error('[影子跟读] 面板打开失败', e));
    }
  });

  /* ---------- 快捷键：Enter = 推进；空格仅在完整跟读中拦截 ---------- */
  window.addEventListener('keydown', (e) => {
    if (!S.session) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      S.session.space();
    } else if (e.code === 'Space' && S.session.stage === 'fullPlay') {
      // 完整跟读中：空格拦截为暂停/继续录音，避免视频与录音状态脱同步
      e.preventDefault();
      e.stopPropagation();
      S.session.space();
    }
  }, true);

  /* ---------- 页面切换 / 卸载 ---------- */
  function softReset() {
    if (S.session) { S.session.destroy(); S.session = null; }
    S.open = false;
    S.pick = null;
    S.sentences = [];
    S.segments = [];
    S.resume = null;
    S.readyModel = null;
    if (S.blobURL) { try { URL.revokeObjectURL(S.blobURL); } catch (e) {} S.blobURL = null; }
    ui.hideAll();
  }

  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) { lastHref = location.href; softReset(); }
  }, 600);
  document.addEventListener('yt-navigate-finish', () => {
    if (S.session || S.open) softReset();
  });
  window.addEventListener('pagehide', () => {
    if (S.session) { S.session.destroy(); S.session = null; }
  });

  /* ---------- 挂载看门狗 ---------- */
  setInterval(() => {
    if (ui.mask || ui.panel || ui.controls) ui.ensureMounted();
  }, 1500);
  }

  /* ---------- 启动引导：处理扩展重载后的重复注入 ---------- */
  function startInit() {
    window[FLAG] = '1';
    try { document.querySelectorAll('.ysr-host').forEach((h) => h.remove()); } catch (e) {}
    init();
    console.info('[影子跟读] 内容脚本已加载');
  }
  if (!window[FLAG]) { startInit(); return; }

  // 已注入过：探测旧脚本是否仍存活（扩展重载后旧上下文会失效，此时需重新初始化）
  let decided = false;
  try {
    chrome.runtime.sendMessage({ type: 'YSR_PROBE_SELF' }, (resp) => {
      if (decided) return;
      decided = true;
      if (!resp || !resp.ok) startInit();
    });
    setTimeout(() => { if (!decided) { decided = true; startInit(); } }, 250);
  } catch (e) {
    if (!decided) { decided = true; startInit(); }
  }
})();
