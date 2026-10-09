// 字幕适配器：获取英文字幕轨道并解析为统一的词级/事件级 token 流 [{start, text}]
// YouTube 页面结构变化时只需要维护本模块
// 拉取策略：json3 → srv3 → srv1 三种格式 × 两种凭据，再回退后台代理（带 Cookie）
window.YSR = window.YSR || {};
YSR.captions = {
  async getTracks() {
    const pr = await YSR.bridge.call('GET_PLAYER_RESPONSE', {}, 10000);
    const tracks = pr && pr.captions && pr.captions.playerCaptionsTracklistRenderer &&
      pr.captions.playerCaptionsTracklistRenderer.captionTracks || [];
    return tracks;
  },

  // 优先英文人工字幕，其次英文自动字幕；都没有则尝试从其它轨道机器翻译成英文
  pickEnglishOrTranslatable(tracks) {
    const en = this.pickEnglish(tracks);
    if (en) return { ...en, translated: false };
    const candidates = (tracks || []).filter((t) => t.baseUrl);
    if (!candidates.length) return null;
    const manual = candidates.find((t) => t.kind !== 'asr');
    const track = manual || candidates[0];
    return { track, isASR: track.kind === 'asr', translated: true };
  },

  pickEnglish(tracks) {
    const en = (tracks || []).filter((t) => String(t.languageCode || '').toLowerCase().indexOf('en') === 0);
    const manual = en.find((t) => t.kind !== 'asr');
    const asr = en.find((t) => t.kind === 'asr');
    if (manual) return { track: manual, isASR: false };
    if (asr) return { track: asr, isASR: true };
    return null;
  },

  // 拉取字幕并统一为 token 流 [{start, text}]（ASR 为词级，人工字幕为行级）
  async fetchCues(baseUrl, useTlang) {
    const t0 = Date.now();
    if (baseUrl.indexOf('/') === 0) baseUrl = 'https://www.youtube.com' + baseUrl;
    const sep = baseUrl.indexOf('?') >= 0 ? '&' : '?';
    const tlang = useTlang ? '&tlang=en' : '';

    // 0) 快路径：播放器此前已自行加载过字幕，直接读缓存
    try {
      const st = await YSR.bridge.call('GET_TIMEDTEXT', {}, 3000);
      if (st.latest && st.latest.text) {
        const tokens = this.parseAny(st.latest.text);
        if (tokens.length) {
          console.info('[影子跟读] 字幕获取成功（播放器缓存，共 ' + tokens.length + ' 个片段，耗时 ' + (Date.now() - t0) + 'ms）');
          return tokens;
        }
      }
    } catch (e) {}

    const errors = [];
    // 1) 直接请求 timedtext（空响应/被限时视频会快速失败）
    const attempts = [
      { fmt: 'json3', creds: 'omit', kind: 'json' },
      { fmt: 'json3', creds: 'include', kind: 'json' },
      { fmt: 'srv3', creds: 'omit', kind: 'xml' },
      { fmt: 'srv1', creds: 'omit', kind: 'xml' }
    ];
    for (const a of attempts) {
      try {
        const text = await YSR.bridge.call('FETCH_TEXT', { url: baseUrl + tlang + sep + 'fmt=' + a.fmt, creds: a.creds }, 8000);
        const tokens = this.parseAny(text);
        if (tokens.length) {
          console.info('[影子跟读] 字幕获取成功（格式 ' + a.fmt + '，共 ' + tokens.length + ' 个片段，耗时 ' + (Date.now() - t0) + 'ms）');
          return tokens;
        }
        errors.push(a.fmt + '/' + a.creds + ': 空');
        console.warn('[影子跟读] 字幕尝试失败 -', a.fmt + '/' + a.creds, '返回为空');
      } catch (e) {
        errors.push(a.fmt + '/' + a.creds + ': ' + String((e && e.message) || e));
        console.warn('[影子跟读] 字幕尝试失败 -', a.fmt + '/' + a.creds, e);
      }
    }
    // 2) 后台代理（带 Cookie 完整会话）
    try {
      const text = await YSR.bridge.backgroundFetch(baseUrl + tlang + sep + 'fmt=json3');
      const tokens = this.parseAny(text);
      if (tokens.length) {
        console.info('[影子跟读] 字幕获取成功（后台代理，共 ' + tokens.length + ' 个片段，耗时 ' + (Date.now() - t0) + 'ms）');
        return tokens;
      }
      errors.push('后台代理: 空');
    } catch (e) {
      errors.push('后台代理: ' + String((e && e.message) || e));
    }
    // 3) 借播放器抓取（终极手段，视频字幕会短暂闪现）
    try {
      console.info('[影子跟读] 直接请求为空，借播放器抓取字幕数据…');
      const captured = await this.captureViaPlayer('en');
      if (captured && captured.length) {
        console.info('[影子跟读] 借播放器抓取字幕成功（共 ' + captured.length + ' 个片段，耗时 ' + (Date.now() - t0) + 'ms）');
        return captured;
      }
      errors.push('播放器抓取: 未捕获到数据');
    } catch (e) {
      errors.push('播放器抓取: ' + String((e && e.message) || e));
    }
    throw new Error('字幕接口全部尝试失败（' + errors.join('；') + '）');
  },

  // json3 → token 流：ASR 用词级时间戳（tOffsetMs），人工字幕退化为行级
  parseJson3Tokens(data) {
    const tokens = [];
    const events = (data.events || []).filter((e) => e.segs);
    for (const ev of events) {
      const base = (ev.tStartMs || 0) / 1000;
      const hasWordTiming = ev.segs.some((s) => typeof s.tOffsetMs === 'number');
      if (hasWordTiming) {
        let pending = null;
        for (const seg of ev.segs) {
          const raw = (seg.utf8 || '').replace(/\n/g, ' ');
          if (!raw.trim()) continue;
          const t = base + (typeof seg.tOffsetMs === 'number' ? seg.tOffsetMs / 1000 : 0);
          if (pending && Math.abs(pending.start - t) < 0.001) {
            pending.text += raw;
          } else {
            if (pending) tokens.push(pending);
            pending = { start: t, text: raw };
          }
        }
        if (pending) tokens.push(pending);
      } else {
        const t = (ev.segs.map((s) => s.utf8 || '').join('') || '')
          .replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
        if (t) tokens.push({ start: base, text: t });
      }
    }
    tokens.sort((a, b) => a.start - b.start);
    return tokens;
  },

  parseJson3(text) {
    const data = JSON.parse(text);
    const cues = [];
    for (const ev of (data.events || [])) {
      if (!ev.segs) continue;
      const t = (ev.segs.map((s) => s.utf8 || '').join('') || '')
        .replace(/\u200b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!t) continue;
      const start = (ev.tStartMs || 0) / 1000;
      const dur = ev.dDurationMs ? ev.dDurationMs / 1000 : 2.5;
      cues.push({ start, dur, text: t });
    }
    cues.sort((a, b) => a.start - b.start);
    return cues;
  },

  parseXml(text, fmt) {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    const cues = [];
    if (fmt === 'srv3') {
      for (const p of doc.getElementsByTagName('p')) {
        const t = Number(p.getAttribute('t') || 0);
        const d = Number(p.getAttribute('d') || 0);
        let s = '';
        for (const seg of p.getElementsByTagName('s')) s += (seg.textContent || '');
        s = s.replace(/\s+/g, ' ').trim();
        if (!s) continue;
        cues.push({ start: t / 1000, dur: d ? d / 1000 : 2.5, text: s });
      }
    } else {
      // srv1: start/dur 单位为秒，内容为 HTML 转义文本
      const ta = document.createElement('textarea');
      for (const el of doc.getElementsByTagName('text')) {
        const start = parseFloat(el.getAttribute('start') || '0');
        const dur = parseFloat(el.getAttribute('dur') || '2.5');
        ta.innerHTML = el.textContent || '';
        const s = String(ta.value || '').replace(/\s+/g, ' ').trim();
        if (!s) continue;
        cues.push({ start, dur, text: s });
      }
    }
    cues.sort((a, b) => a.start - b.start);
    return cues;
  },

  // 兼容 json3 / srv3 / srv1，统一输出 token 流
  parseAny(text) {
    try {
      const j = JSON.parse(text);
      if (j && j.events) {
        const tokens = this.parseJson3Tokens(j);
        if (tokens.length) return tokens;
        return this.parseJson3(text).map((c) => ({ start: c.start, text: c.text }));
      }
    } catch (e) {}
    if (String(text).indexOf('<') === 0) {
      try { const c1 = this.parseXml(text, 'srv3'); if (c1.length) return c1.map((x) => ({ start: x.start, text: x.text })); } catch (e) {}
      try { const c2 = this.parseXml(text, 'srv1'); if (c2.length) return c2.map((x) => ({ start: x.start, text: x.text })); } catch (e) {}
    }
    return [];
  },

  // 借播放器抓取：触发 CC 加载 → 拦截播放器自己的 timedtext 响应
  async captureViaPlayer(lang) {
    let vid = '';
    try { vid = new URLSearchParams(location.search).get('v') || ''; } catch (e) {}
    const trig = await YSR.bridge.call('TRIGGER_CC', { lang: lang || 'en' }, 6000);
    try {
      const deadline = Date.now() + 6000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 300));
        let st = null;
        try { st = await YSR.bridge.call('GET_TIMEDTEXT', {}, 4000); } catch (e) { continue; }
        const candidates = [];
        if (st.latest && st.latest.t >= trig.t0) candidates.push(st.latest);
        for (const en of (st.entries || [])) {
          if (vid && en.url && en.url.indexOf('v=' + vid) === -1) continue;
          candidates.push(en);
        }
        for (const c of candidates) {
          if (!c || !c.text) continue;
          const tokens = this.parseAny(c.text);
          if (tokens.length) return tokens;
        }
      }
      return null;
    } finally {
      // 无论成败都恢复播放器字幕原状
      try { await YSR.bridge.call('RESTORE_CC', { prev: trig.prev }, 4000); } catch (e) {}
    }
  }
};
