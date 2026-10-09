// 后台服务：工具栏点击、内容脚本自动注入、AI 设置页入口、云端 ASR / LLM 代理
const CONTENT_FILES = [
  'lib/store.js',
  'lib/bridge.js',
  'lib/captions.js',
  'lib/segments.js',
  'lib/clock.js',
  'lib/recorder.js',
  'lib/feedback.js',
  'lib/ai.js',
  'lib/expressions.js',
  'lib/styles.js',
  'lib/ui.js',
  'lib/state-machine.js',
  'content.js'
];

// 先探测内容脚本是否已在页面里；不在则程序化注入（覆盖安装后未刷新的旧标签页）
async function ensureInjected(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'YSR_PING' });
    return true;
  } catch (e) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['main-world.js'], world: 'MAIN' });
      await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
      await chrome.tabs.sendMessage(tabId, { type: 'YSR_PING' });
      return true;
    } catch (e2) {
      return false;
    }
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id || !tab.url || !/^https:\/\/([^/]*\.)?youtube\.com\//.test(tab.url)) {
    console.info('[影子跟读][后台] 忽略非 YouTube 页面的点击:', tab && tab.url);
    return;
  }
  console.info('[影子跟读][后台] 图标点击:', tab.url);
  const ok = await ensureInjected(tab.id);
  console.info('[影子跟读][后台] 注入探测结果:', ok);
  if (!ok) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'YSR_TOGGLE_LAUNCHER' });
    console.info('[影子跟读][后台] 已发送打开指令');
  } catch (e) {
    console.error('[影子跟读][后台] 发送指令失败', e);
  }
});

async function getAIConfig() {
  const o = await chrome.storage.local.get('aiConfig');
  return o.aiConfig || {};
}

async function handleAI(msg) {
  const cfg = await getAIConfig();
  const base = (cfg.baseUrl || '').replace(/\/+$/, '');
  if (!base || !cfg.apiKey) return { ok: false, error: '尚未配置 AI 服务，请打开插件的「AI 设置」页填写并保存' };

  try {
    if (msg.action === 'chat') {
      const res = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: '***' + cfg.apiKey },
        body: JSON.stringify({ model: cfg.llmModel, messages: msg.messages, ...(msg.opts || {}) })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: 'HTTP ' + res.status + ' ' + ((j.error && j.error.message) || '') };
      const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
      return { ok: true, text };
    }

    if (msg.action === 'transcribe') {
      if (!cfg.asrModel) return { ok: false, error: '未配置语音识别模型，请到 AI 设置页填写' };
      const bin = atob(msg.audioBase64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const fd = new FormData();
      fd.append('file', new Blob([u8], { type: msg.mime || 'audio/webm' }), msg.filename || 'audio.webm');
      fd.append('model', cfg.asrModel);
      fd.append('response_format', 'json');
      fd.append('language', 'en');
      const res = await fetch(base + '/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: '***' + cfg.apiKey },
        body: fd
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: 'HTTP ' + res.status + ' ' + ((j.error && j.error.message) || '') };
      return { ok: true, text: j.text || '' };
    }

    return { ok: false, error: 'unknown action: ' + msg.action };
  } catch (e) {
    return { ok: false, error: '网络请求失败（可能未授权该域名，请到 AI 设置页重新保存）: ' + String((e && e.message) || e) };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'YSR_OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return;
  }
  if (msg && msg.type === 'YSR_PROBE_SELF') {
    // 探测发送方标签页的旧内容脚本是否仍存活
    (async () => {
      try {
        if (!sender || !sender.tab || !sender.tab.id) { sendResponse({ ok: false }); return; }
        await chrome.tabs.sendMessage(sender.tab.id, { type: 'YSR_PING' });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false });
      }
    })();
    return true;
  }
  if (msg && msg.type === 'YSR_FETCH_TEXT') {
    (async () => {
      try {
        const res = await fetch(msg.url, { credentials: 'include' });
        if (!res.ok) { sendResponse({ ok: false, error: 'HTTP ' + res.status }); return; }
        sendResponse({ ok: true, text: await res.text() });
      } catch (e) {
        sendResponse({ ok: false, error: String((e && e.message) || e) });
      }
    })();
    return true; // 异步响应
  }
  if (msg && msg.type === 'YSR_AI') {
    handleAI(msg).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true; // 异步响应
  }
});
