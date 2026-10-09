// 录音与音频分析：仅在完整跟读阶段使用；录音默认不持久化
window.YSR = window.YSR || {};
YSR.recorder = (() => {
  let stream = null;
  let rec = null;
  let chunks = [];
  let startedAt = 0;

  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    });
    chunks = [];
    rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(1000);
    startedAt = performance.now();
    return true;
  }

  function pause() { try { if (rec && rec.state === 'recording') rec.pause(); } catch (e) {} }
  function resume() { try { if (rec && rec.state === 'paused') rec.resume(); } catch (e) {} }
  function isActive() { return !!rec; }

  function stop() {
    return new Promise((resolve) => {
      if (!rec) { resolve(null); return; }
      const r = rec, s = stream, cs = chunks;
      r.onstop = () => {
        const blob = new Blob(cs, { type: r.mimeType || 'audio/webm' });
        const dur = (performance.now() - startedAt) / 1000;
        try { s.getTracks().forEach((t) => t.stop()); } catch (e) {}
        stream = null; rec = null; chunks = [];
        resolve({ blob, durationSec: dur });
      };
      try { if (r.state === 'paused') r.resume(); } catch (e) {}
      try { r.stop(); } catch (e) { resolve(null); }
    });
  }

  function discard() {
    try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (e) {}
    try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    stream = null; rec = null; chunks = [];
  }

  // 能量包络分析：有效说话时长、停顿次数、最长停顿
  async function analyse(blob) {
    const buf = await blob.arrayBuffer();
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const audio = await ctx.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const sr = audio.sampleRate;
    const winSec = 0.05;
    const win = Math.max(1, Math.floor(sr * winSec));
    const env = [];
    for (let i = 0; i < data.length; i += win) {
      let sum = 0;
      const end = Math.min(i + win, data.length);
      for (let j = i; j < end; j++) sum += data[j] * data[j];
      env.push(Math.sqrt(sum / (end - i)));
    }
    const sorted = [...env].sort((a, b) => a - b);
    const floorP = sorted[Math.floor(sorted.length * 0.2)] || 0;
    const thresh = Math.max(0.006, floorP * 1.8);
    const voiced = env.map((v) => v > thresh);

    const silences = [];
    let sStart = null;
    let seenVoice = false;
    for (let i = 0; i < voiced.length; i++) {
      if (!voiced[i]) {
        if (sStart == null) sStart = i * winSec;
      } else {
        if (sStart != null) {
          const dur = i * winSec - sStart;
          if (seenVoice && dur >= 1.2) silences.push({ start: sStart, dur });
          sStart = null;
        }
        seenVoice = true;
      }
    }
    if (sStart != null && seenVoice) {
      const dur = voiced.length * winSec - sStart;
      if (dur >= 1.2) silences.push({ start: sStart, dur });
    }
    const voicedSec = voiced.filter(Boolean).length * winSec;
    try { ctx.close(); } catch (e) {}
    return {
      voicedSec,
      silenceCount: silences.length,
      longestSilence: silences.reduce((m, s) => Math.max(m, s.dur), 0),
      silences
    };
  }

  return { start, stop, pause, resume, discard, isActive, analyse };
})();
