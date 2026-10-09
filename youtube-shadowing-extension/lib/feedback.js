// 实时语音识别（Chrome 内置）+ 录音转写与字幕对齐分析
// 低置信结果一律使用“可能”措辞，不做权威评分
window.YSR = window.YSR || {};

// 实时识别生命周期：与录音同时进行，收集最终转写片段
YSR.speech = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const available = !!SR;
  let rec = null;
  let finals = [];
  let active = false;
  let suspended = false;

  function onEnd() {
    if (active && !suspended) { try { rec.start(); } catch (e) {} }
  }

  function start() {
    if (!available) return false;
    try {
      finals = [];
      rec = new SR();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = false;
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finals.push(e.results[i][0].transcript);
        }
      };
      rec.onerror = () => {};
      rec.onend = onEnd;
      suspended = false;
      active = true;
      rec.start();
      return true;
    } catch (e) { return false; }
  }
  function pause() { if (active && rec) { suspended = true; try { rec.stop(); } catch (e) {} } }
  function resume() { if (active && rec && suspended) { suspended = false; try { rec.start(); } catch (e) {} } }
  function stopText() {
    active = false; suspended = false;
    try { if (rec) rec.stop(); } catch (e) {}
    return finals.join(' ');
  }
  return { available, start, pause, resume, stopText };
})();

// 对齐与反馈生成
YSR.feedback = {
  normalize(text) {
    return String(text || '').toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/[^a-z' ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },
  words(text) { const t = this.normalize(text); return t ? t.split(' ') : []; },

  // 宽松相等：精确或编辑距离 ≤1（容忍识别误差）
  eq(a, b) {
    if (a === b) return true;
    if (a.length < 4 || b.length < 4) return false;
    if (Math.abs(a.length - b.length) > 1) return false;
    let diff = 0, i = 0, j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      diff++;
      if (diff > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else { i++; j++; }
    }
    if (i < a.length || j < b.length) diff++;
    return diff <= 1;
  },

  analyze({ transcript, segments, audio, micDenied }) {
    if (micDenied) return { micDenied: true, perSeg: [], priority: [], suggestions: [] };

    const T = this.words(transcript || '');
    let p = 0;
    const perSeg = [];
    for (const s of segments) {
      const W = this.words(s.text);
      let matched = 0;
      const missing = [];
      for (const w of W) {
        let found = -1;
        for (let k = 0; k <= 6; k++) {
          if (p + k < T.length && this.eq(T[p + k], w)) { found = p + k; break; }
        }
        if (found >= 0) { p = found + 1; matched++; }
        else missing.push(w);
      }
      perSeg.push({
        index: s.index, segmentId: s.segmentId, startTime: s.startTime, text: s.text,
        total: W.length, matched, missing,
        coverage: W.length ? matched / W.length : 1
      });
    }

    const totW = perSeg.reduce((m, s) => m + s.total, 0);
    const totM = perSeg.reduce((m, s) => m + s.matched, 0);
    const overall = totW ? totM / totW : 0;
    const speechDur = segments.reduce((m, s) => m + (s.duration || 0), 0);
    const origWPM = speechDur > 0 ? Math.round(totW / speechDur * 60) : 0;
    const voicedSec = audio ? audio.voicedSec : 0;
    const userWPM = voicedSec > 2 ? Math.round(T.length / voicedSec * 60) : 0;

    const priority = perSeg
      .filter((s) => s.coverage < 0.9 && s.total > 0)
      .sort((a, b) => a.coverage - b.coverage)
      .slice(0, 3);

    const suggestions = [];
    if (userWPM && origWPM) {
      const d = (userWPM - origWPM) / origWPM;
      if (d > 0.18) suggestions.push('你的语速约 ' + userWPM + ' WPM，比原声（约 ' + origWPM + ' WPM）明显偏快，试着放慢并读清词尾。');
      else if (d < -0.18) suggestions.push('你的语速约 ' + userWPM + ' WPM，比原声（约 ' + origWPM + ' WPM）偏慢，注意跟上原声节奏。');
      else suggestions.push('语速与原声接近，节奏控制得不错。');
    }
    if (audio && audio.silenceCount >= 4) {
      suggestions.push('检测到 ' + audio.silenceCount + ' 次较长停顿（最长 ' + audio.longestSilence.toFixed(1) + ' 秒），试着按组连读，减少中途停顿。');
    }
    if (priority.length) {
      suggestions.push('建议优先重练第 ' + priority.map((s) => s.index + 1).join('、') + ' 组，可能存在漏读。');
    }
    if (!suggestions.length) suggestions.push('整体节奏不错，保持这个练习频率。');

    return {
      micDenied: false,
      transcriptEmpty: T.length === 0,
      perSeg,
      overall,
      origWPM,
      userWPM,
      pauseCount: audio ? audio.silenceCount : 0,
      longestPause: audio ? audio.longestSilence : 0,
      priority,
      suggestions
    };
  }
};
