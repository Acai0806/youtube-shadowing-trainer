// AI 能力客户端：云端 ASR 转写 + LLM 表达卡生成（OpenAI 兼容协议）
// 实际网络请求由后台 service worker 代理；配置与 Key 存本地
window.YSR = window.YSR || {};
YSR.ai = (() => {
  function send(payload) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(payload, (resp) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!resp || !resp.ok) return reject(new Error((resp && resp.error) || 'AI 调用失败'));
          resolve(resp);
        });
      } catch (e) { reject(e); }
    });
  }

  async function getConfig() {
    try {
      const o = await chrome.storage.local.get('aiConfig');
      return o.aiConfig || {};
    } catch (e) { return {}; }
  }

  async function status() {
    const c = await getConfig();
    // 语音识别默认走 Chrome 内置；只有用户显式切换到云端时才启用云端 ASR
    const cloudAsr = !!(c.baseUrl && c.apiKey && c.asrModel && c.asrSource === 'cloud');
    return {
      llm: !!(c.baseUrl && c.apiKey && c.llmModel),
      asr: cloudAsr,
      asrSource: c.asrSource || 'builtin'
    };
  }

  function toB64(u8) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }

  // 上传录音到 /audio/transcriptions（上限约 20MB 原始音频）
  async function transcribeBlob(blob) {
    const u8 = new Uint8Array(await blob.arrayBuffer());
    if (u8.length > 20 * 1024 * 1024) throw new Error('录音过大，无法云端转写');
    const resp = await send({
      type: 'YSR_AI', action: 'transcribe',
      audioBase64: toB64(u8), mime: blob.type || 'audio/webm'
    });
    return resp.text || '';
  }

  async function chat(messages, opts) {
    const resp = await send({ type: 'YSR_AI', action: 'chat', messages, opts: opts || {} });
    return resp.text || '';
  }

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();

  function parseCards(text) {
    let t = String(text || '').trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```\s*$/, '')
      .trim();
    const m = t.match(/\{[\s\S]*\}/);
    if (m) t = m[0];
    try {
      const j = JSON.parse(t);
      return Array.isArray(j.cards) ? j.cards.filter((c) => c && c.expression) : [];
    } catch (e) { return []; }
  }

  function sampleSentences(sentences, max = 90) {
    if (sentences.length <= max) return sentences;
    const step = sentences.length / max;
    const out = [];
    for (let i = 0; i < max; i++) out.push(sentences[Math.floor(i * step)]);
    return out;
  }

  // LLM 表达卡生成；返回 null 表示未配置或失败（调用方回退规则引擎）
  async function generateExpressions(sentences, missedWords, rangeSeconds) {
    const cfg = await getConfig();
    if (!(cfg.baseUrl && cfg.apiKey && cfg.llmModel)) return null;
    const use = sampleSentences(sentences || []);
    if (!use.length) return null;
    const numbered = use.map((s, i) => (i + 1) + '. ' + s.text).join('\n').slice(0, 8000);
    const missed = (missedWords || []).slice(0, 20).join(', ');
    const prompt =
      '下面是一段 YouTube 视频的英文字幕（按句子编号）。请为影子跟读学习者挑选值得积累的表达，生成学习卡片。\n' +
      '筛选优先级（从高到低）：\n' +
      '1. 固定搭配与习语（collocation）：短语动词、习惯表达、地道搭配——最优先，至少 3 条\n' +
      '2. 可迁移句式结构（pattern）：能套用到其他话题的表达框架，2-3 条\n' +
      '3. 单词与短语（word）：只收录漏读词，或明显超出基础词汇的多义词/高级词汇；\n' +
      '   严禁收录 good、big、thing、people、really 这类基础词\n' +
      '总量 5-8 条，宁缺毋滥。\n' +
      '其他要求：\n' +
      '- 不选人名、地名、纯专业名词；同一表达不重复\n' +
      '- word 类 meaning 必须是简明中文释义\n' +
      '- pattern 类必须给 example（一个新例句）和 usageNote（可替换槽位说明）\n' +
      '- sourceSentence 必须逐字取自下面字幕中的原句，不要改写\n' +
      '只输出 JSON：{"cards":[{"category":"pattern|collocation|word","expression":"...","meaning":"中文释义","sourceSentence":"原句","usageNote":"一句话用法说明","example":"(pattern类必填)"}]}\n\n' +
      '字幕：\n' + numbered + '\n\n' +
      '漏读/可能读错的词：' + (missed || '（无）');

    const text = await chat(
      [
        { role: 'system', content: '你是英语学习助手，只输出 JSON，不要输出任何解释或多余文字。' },
        { role: 'user', content: prompt }
      ],
      { temperature: 0.3, max_tokens: 1800 }
    );
    const cards = parseCards(text);
    for (const c of cards) {
      c.category = ['pattern', 'collocation', 'word'].includes(c.category) ? c.category : 'word';
      c.meaning = c.meaning || '';
      c.usageNote = c.usageNote || '结合原句语境记忆';
      const nq = norm(c.sourceSentence);
      let s = use.find((x) => norm(x.text) === nq) ||
        use.find((x) => { const nx = norm(x.text); return nx && nq && (nx.indexOf(nq) >= 0 || nq.indexOf(nx) >= 0); });
      if (!s) {
        const head = nq.split(' ').slice(0, 4).join(' ');
        if (head) s = use.find((x) => norm(x.text).indexOf(head) >= 0);
      }
      c.timestamp = s ? s.start : null;
      c.key = c.category + '|' + String(c.expression || '').toLowerCase();
    }
    return cards.filter((c) => c.expression);
  }

  return { status, getConfig, transcribeBlob, chat, generateExpressions };
})();
