// 句子重组与分组:把零散字幕 cue 合并成完整句,再按一句/两句一组生成训练片段
window.YSR = window.YSR || {};
YSR.segments = {
  isNoise(t) {
    return /^(\[?(music|applause|laughter|applause & laughter|音樂|音乐)\]?\s*|♪+|\(♪\))$/i.test(t.trim());
  },

  // 纯填充词（不进练习文本）
  FILLERS: new Set(['um', 'uh', 'erm', 'hmm', 'mm', 'mmm', 'umm', 'uhh', 'uh-huh', 'mm-hmm', 'huh']),
  isFiller(t) {
    const w = String(t).toLowerCase().replace(/[^a-z'-]/g, '').trim();
    return this.FILLERS.has(w);
  },

  // 由 token 流构建句子：有标点按标点；无标点（ASR）按词间停顿 + 连接词边界 + 长度平衡。
  // 只看 token 起始时刻，因此滚动式 ASR 时间轴（事件时长互相重叠）不会干扰停顿判断
  buildSentences(tokens) {
    const CONNECTORS = new Set(('and,but,so,or,because,if,when,while,although,however,then,also,actually,well,after,before,until,since,though,meanwhile,anyway,basically,eventually,suddenly,finally').split(','));
    const firstWord = (t) => { const m = String(t).toLowerCase().match(/[a-z']+/); return m ? m[0] : ''; };
    const wc = (t) => t.split(/\s+/).filter(Boolean).length;
    const out = [];
    let buf = null;
    let punctSeen = false;

    const flush = (endAt) => {
      if (buf && buf.text.trim()) {
        buf.end = endAt != null ? endAt : Math.max(buf.start + 1.5, buf.end || buf.start + 2);
        out.push({ start: buf.start, end: buf.end, text: buf.text.trim() });
      }
      buf = null; punctSeen = false;
    };

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const next = tokens[i + 1];
      if (this.isNoise(t.text) || this.isFiller(t.text)) continue;

      if (!buf) buf = { start: t.start, end: t.start, text: '', words: 0 };
      const piece = t.text.trim();
      if (piece) {
        const needsSpace = buf.text && !/\s$/.test(buf.text) && !/^[,.!?…;:'’”]/.test(piece);
        buf.text += (needsSpace ? ' ' : '') + piece;
        buf.words += wc(piece);
        if (/[.!?…]/.test(buf.text)) punctSeen = true;
      }

      if (!next) { flush(t.start + 2.0); continue; }

      // 词级 token：起始间隔即真实节奏；行级 token：用结束时间求真实间隙
      const tEnd = (t.end != null) ? t.end : t.start;
      const gap = next.start - tEnd;
      const endPunct = /[.!?…]["'’”）\]]?$/i.test(buf.text.trim());
      const tooLong = buf.text.length > 160 || buf.words > 45;
      const connector = CONNECTORS.has(firstWord(next.text));

      if (endPunct && gap > 0.1) flush(next.start);
      else if (tooLong) flush(next.start);
      else if (!punctSeen && gap > 0.9) flush(next.start);
      else if (!punctSeen && connector && buf.words >= 5 && gap > 0.35) flush(next.start);
      else if (!punctSeen && buf.words >= 14 && gap > 0.55) flush(next.start);
      else if (!punctSeen && buf.words >= 25 && gap > 0.5) flush(next.start);
      else if (gap > 2.2) flush(next.start);
      else buf.end = next.start;
    }
    flush(null);
    return this.mergeFragments(out);
  },

  // 碎片合并：少于 4 个实义词的组并入邻居，直到没有碎片
  mergeFragments(sents) {
    const wc = (t) => t.split(/\s+/).filter(Boolean).length;
    const MIN_WORDS = 4;
    let arr = sents.slice();
    let changed = true;
    let guard = 0;
    while (changed && guard < 50) {
      changed = false;
      guard++;
      for (let i = 0; i < arr.length; i++) {
        if (wc(arr[i].text) >= MIN_WORDS) continue;
        const prev = arr[i - 1];
        const next = arr[i + 1];
        const startsWithConnector = /^(and|but|so|or|because|if|when|while|although|however|then|also|well)\b/i.test(arr[i].text);
        let j = -1;
        if (startsWithConnector && next) j = i + 1;          // 连接词碎片归入下一句
        else if (prev && wc(prev.text) <= 20) j = i - 1;      // 优先并入上一句
        else if (next) j = i + 1;
        else if (prev) j = i - 1;
        if (j === -1) continue;
        const a = arr[Math.min(i, j)], b = arr[Math.max(i, j)];
        const merged = {
          start: a.start,
          end: b.end,
          text: (a.text + ' ' + b.text).replace(/\s+/g, ' ').trim()
        };
        arr.splice(Math.min(i, j), 2, merged);
        changed = true;
        break;
      }
    }
    return arr;
  },

  // 过滤连续重复字幕
  dedupe(sentences) {
    const out = [];
    for (const s of sentences) {
      const p = out[out.length - 1];
      if (p && p.text.toLowerCase() === s.text.toLowerCase()) { p.end = s.end; continue; }
      out.push(s);
    }
    return out;
  },

  mk(s, groupSize) {
    return {
      startTime: +s.start.toFixed(3),
      endTime: +s.end.toFixed(3),
      text: s.text.trim(),
      groupSize,
      duration: Math.max(0.6, s.end - s.start)
    };
  },

  // mode: '1' 一句一组 | '2' 两句一组(不跨越明显停顿)
  group(sentences, mode) {
    const segs = [];
    if (String(mode) !== '2') {
      for (const s of sentences) segs.push(this.mk(s, 1));
      return segs;
    }
    for (let i = 0; i < sentences.length; i++) {
      const a = sentences[i];
      const b = sentences[i + 1];
      if (b && (b.start - a.end) <= 2.0 && (b.end - a.start) <= 24) {
        segs.push(this.mk({ start: a.start, end: b.end, text: a.text + ' ' + b.text }, 2));
        i++;
      } else {
        segs.push(this.mk(a, 1));
      }
    }
    return segs;
  },

  // 按练习范围裁剪句子并生成带 ID 的片段
  finalize(videoId, sentences, settings) {
    const start = settings.rangeMode === 'custom' ? (settings.rangeStart || 0) : 0;
    const end = settings.rangeMode === 'custom' && settings.rangeEnd != null
      ? settings.rangeEnd
      : (sentences.length ? sentences[sentences.length - 1].end : 0);
    const inRange = sentences.filter((s) => s.end > start + 0.01 && s.start < end - 0.01);
    const segs = this.group(inRange, settings.grouping);
    const realStart = segs.length ? segs[0].startTime : start;
    const realEnd = segs.length ? segs[segs.length - 1].endTime : end;
    return {
      segments: segs.map((s, i) => ({ videoId, segmentId: videoId + '-' + i, index: i, ...s })),
      range: { start: realStart, end: realEnd }
    };
  },

  preview(segs, n = 3) { return segs.slice(0, n); },

  // 预计总训练时长:每组两遍播放 + 两段停顿(停顿 = 组时长 × 倍率)
  estimateSeconds(segs, settings) {
    const rate = settings.rate || 1;
    const pm = settings.pauseMultiplier || 1.5;
    let t = 0;
    for (const s of segs) {
      const dur = s.duration / rate;
      const pause = dur * pm;
      t += dur * 2 + pause * 2;
    }
    return Math.round(t);
  }
};
