// AI 服务设置页：服务商预设、Key 填写、域名授权、连通性测试
const $ = (id) => document.getElementById(id);
const statusEl = $('status');

const PRESETS = {
  openai: { baseUrl: 'https://api.openai.com/v1', asrModel: 'whisper-1', llmModel: 'gpt-4o-mini' },
  zhipu: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', asrModel: '', llmModel: 'glm-4-flash' },
  siliconflow: { baseUrl: 'https://api.siliconflow.cn/v1', asrModel: 'FunAudioLLM/SenseVoiceSmall', llmModel: 'Qwen/Qwen2.5-7B-Instruct' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', asrModel: 'whisper-large-v3', llmModel: 'llama-3.3-70b-versatile' },
  custom: { baseUrl: '', asrModel: '', llmModel: '' }
};

function showStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = 'status ' + (cls || '');
}

function readForm() {
  return {
    baseUrl: $('baseUrl').value.trim().replace(/\/+$/, ''),
    apiKey: $('apiKey').value.trim(),
    asrModel: $('asrModel').value.trim(),
    llmModel: $('llmModel').value.trim(),
    asrSource: $('asrSource').value || 'builtin'
  };
}

function fillForm(cfg) {
  $('baseUrl').value = cfg.baseUrl || '';
  $('apiKey').value = cfg.apiKey || '';
  $('asrModel').value = cfg.asrModel || '';
  $('llmModel').value = cfg.llmModel || '';
}

async function ensurePermission(cfg) {
  let origin;
  try { origin = new URL(cfg.baseUrl).origin; }
  catch (e) { showStatus('Base URL 无效，请检查格式（如 https://api.openai.com/v1）', 'err'); return false; }
  const granted = await chrome.permissions.request({ origins: [origin + '/*'] });
  if (!granted) { showStatus('未授权 ' + origin + '，云端请求会被浏览器拦截，无法保存', 'err'); return false; }
  return true;
}

async function save() {
  const cfg = readForm();
  if (!cfg.baseUrl || !cfg.apiKey) { showStatus('请先填写 Base URL 与 API Key', 'err'); return false; }
  if (!(await ensurePermission(cfg))) return false;
  await chrome.storage.local.set({ aiConfig: cfg });
  showStatus('已保存并授权 ' + new URL(cfg.baseUrl).origin, 'ok');
  return true;
}

function callAI(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (resp) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!resp || !resp.ok) return reject(new Error((resp && resp.error) || '调用失败'));
      resolve(resp);
    });
  });
}

// 生成一段 0.4 秒 440Hz 蜂鸣 WAV，用于测试音频转写接口
function makeBeepWav() {
  const sr = 8000, dur = 0.4, n = Math.floor(sr * dur);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE');
  ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ws(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 440 * i / sr) * 0.6 * 32767, true);
  return new Blob([buf], { type: 'audio/wav' });
}

function toB64(blob) {
  return blob.arrayBuffer().then((ab) => {
    const u8 = new Uint8Array(ab);
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  });
}

$('preset').addEventListener('change', () => {
  const p = PRESETS[$('preset').value];
  if (p) fillForm(p);
});

$('toggleKey').addEventListener('click', () => {
  const k = $('apiKey');
  k.type = k.type === 'password' ? 'text' : 'password';
  $('toggleKey').textContent = k.type === 'password' ? '显示' : '隐藏';
});

$('save').addEventListener('click', () => save());

$('testLLM').addEventListener('click', async () => {
  showStatus('正在测试对话模型…');
  const ok = await save();
  if (!ok) return;
  try {
    await callAI({ type: 'YSR_AI', action: 'chat', messages: [{ role: 'user', content: '请只回复两个字母：OK' }], opts: { max_tokens: 8 } });
    showStatus('对话模型连接成功 ✓', 'ok');
  } catch (e) { showStatus('对话模型测试失败：' + e.message, 'err'); }
});

$('testASR').addEventListener('click', async () => {
  if ($('asrSource').value !== 'cloud') {
    showStatus('当前使用 Chrome 内置识别，无需测试；如需测试云端请先切换「语音识别来源」', '');
    return;
  }
  showStatus('正在测试语音识别接口…');
  const ok = await save();
  if (!ok) return;
  const cfg = readForm();
  if (!cfg.asrModel) { showStatus('语音识别模型为空（当前回退 Chrome 内置识别），无需测试', ''); return; }
  try {
    const b64 = await toB64(makeBeepWav());
    await callAI({ type: 'YSR_AI', action: 'transcribe', audioBase64: b64, mime: 'audio/wav', filename: 'test.wav' });
    showStatus('语音识别接口连接成功 ✓（蜂鸣音频不含语音，返回内容为空属正常）', 'ok');
  } catch (e) { showStatus('语音识别测试失败：' + e.message, 'err'); }
});

chrome.storage.local.get('aiConfig').then((o) => fillForm(o.aiConfig || {}));
