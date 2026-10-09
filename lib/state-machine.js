// 训练状态机：逐句四阶段循环 + 完整跟读 + 暂停/广告/缓冲/拖动进度条处理
window.YSR = window.YSR || {};
(() => {
  const fmtT = (t) => { t = Math.max(0, Math.round(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const fmtDur = (t) => { t = Math.max(0, Math.round(t)); const m = Math.floor(t / 60); return m > 0 ? '约 ' + m + ' 分钟' : '约 ' + t + ' 秒'; };

  YSR.PracticeSession = class {
    constructor(o) {
      this.videoId = o.videoId;
      this.el = o.videoEl;
      this.settings = o.settings;
      this.segments = o.segments;
      this.sentences = o.sentences || [];
      this.ui = o.ui;
      this.hooks = o.hooks || {};
      this.store = YSR.store;

      this.i = 0;
      this.stage = 'idle';
      this.destroyed = false;
      this.finished = false;
      this._paused = false;
      this._adSeen = false;
      this._lastT = 0;
      this._waitingSeek = false;
      this._internalSeek = false;
      this._finishing = false;
      this._expectPlaying = false;

      this._bindSeek();
      this._watchTimer = setInterval(() => this._tick(), 150);
    }

    /* ---------- 基础工具 ---------- */
    seg(i = this.i) { return this.segments[i]; }
    range() {
      return {
        start: this.segments[0] ? this.segments[0].startTime : 0,
        end: this.segments.length ? this.segments[this.segments.length - 1].endTime : 0
      };
    }
    pauseSeconds(seg) {
      // 停顿 = 该组实际播放时长 × 停顿倍率（不设固定上下限，随句子长短自然伸缩）
      const dur = (seg.duration || 2) / (this.settings.rate || 1);
      return Math.max(0.5, dur * (this.settings.pauseMultiplier || 1.5));
    }
    _isAd() {
      const p = document.getElementById('movie_player');
      return !!(p && p.classList && p.classList.contains('ad-showing'));
    }
    _frozen() {
      return this._isAd() || (this.el && this.el.readyState < 3) || document.hidden ||
        !!(this.cd && this.cd.paused);
    }
    _ctl(kind) {
      const el = this.el;
      if (kind === 'play') {
        this._expectPlaying = true;
        this._playGraceUntil = performance.now() + 900;
        YSR.bridge.player.play().catch(() => { try { el.play(); } catch (e) {} });
      } else {
        this._expectPlaying = false;
        YSR.bridge.player.pause().catch(() => { try { el.pause(); } catch (e) {} });
      }
    }
    async _seek(t) {
      this._internalSeek = true;
      this._waitingSeek = true;
      try { await YSR.bridge.player.seek(t); }
      catch (e) { try { this.el.currentTime = t; } catch (e2) {} }
      setTimeout(() => { this._internalSeek = false; this._waitingSeek = false; }, 350);
    }
    _setRate() {
      const r = this.settings.rate || 1;
      YSR.bridge.player.rate(r).catch(() => { try { this.el.playbackRate = r; } catch (e) {} });
    }

    /* ---------- 入口 ---------- */
    start(i = 0) {
      this._sessionStart = performance.now();
      this.i = Math.min(Math.max(0, i), this.segments.length - 1);
      this._enter('blind');
    }

    _enter(stage) {
      if (this.destroyed) return;
      this.stage = stage;
      this._paused = false;
      this.ui.setPaused(false);
      this.store.track('segment_stage_enter', { stage, index: this.i });
      const s = this.seg();
      if (stage === 'blind') {
        this.ui.showMask('blind', { index: this.i, total: this.segments.length });
        this.ui.updateControls({ index: this.i, total: this.segments.length, paused: false });
        this._playSeg(s, () => this._speak('blindSpeak'));
      } else if (stage === 'sub') {
        this.ui.showMask('sub', { index: this.i, total: this.segments.length, text: s.text });
        this._playSeg(s, () => this._speak('subSpeak'));
      }
    }

    _playSeg(s, onEnd) {
      this._segStart = s.startTime;
      this._segEnd = s.endTime;
      this._onSegEnd = onEnd;
      this._setRate();
      this._seek(s.startTime).then(() => {
        this._playGraceUntil = performance.now() + 900;
        this._ctl('play');
      });
    }

    _speak(stage) {
      if (this.destroyed) return;
      this.stage = stage;
      this.store.track('segment_stage_enter', { stage, index: this.i });
      const s = this.seg();
      const total = this.pauseSeconds(s);
      this.ui.showMask(stage, { index: this.i, total: this.segments.length, text: s.text, countdown: total });
      this.ui.updateControls({ index: this.i, total: this.segments.length, paused: false });
      this.cd = YSR.createCountdown({ isFrozen: () => this._frozen() });
      this.cd.start(total, {
        onTick: (r) => this.ui.updateCountdown(r, total),
        onDone: () => {
          this.cd = null;
          if (this.destroyed) return;
          if (stage === 'blindSpeak') this._enter('sub');
          else this._nextSeg();
        }
      });
    }

    _nextSeg() {
      if (this.i + 1 < this.segments.length) { this.i++; this._enter('blind'); }
      else this._finishSentenceLoop();
    }

    _finishSentenceLoop() {
      this.stage = 'fullPrep';
      const r = this.range();
      const est = (r.end - r.start) / (this.settings.rate || 1);
      this.ui.showMask('fullPrep', {
        rangeText: fmtT(r.start) + ' – ' + fmtT(r.end),
        estimate: fmtDur(est)
      });
      this.ui.updateControls({ hidden: true, index: this.i, total: this.segments.length });
    }

    /* ---------- 完整跟读 ---------- */
    async startFull() {
      if (this.destroyed || this.stage === 'fullPlay' || this.stage === 'fullCountdown') return;
      this.stage = 'fullCountdown';
      let mic = false;
      try { await YSR.recorder.start(); mic = true; } catch (e) { mic = false; }
      this.micGranted = mic;
      this.store.track('microphone_permission_result', { granted: mic });
      if (mic && YSR.speech.available) YSR.speech.start();

      await this._countdown3();
      if (this.destroyed) return;

      const r = this.range();
      this._fullStart = performance.now();
      this._fullPausedAcc = 0;
      this._fullPauseAt = null;
      await this._seek(r.start);
      this._setRate();
      this._ctl('play');
      this.stage = 'fullPlay';
      this._paused = false;
      this._lastFullText = null;
      this.ui.showMask('fullPlay', {});
      this._syncFullText();
      this.ui.updateControls({ hidden: true, index: this.i, total: this.segments.length });
      this.store.track('full_shadowing_start', {});
    }

    _countdown3() {
      return new Promise((resolve) => {
        const step = (n) => {
          if (this.destroyed) return resolve();
          this.ui.showMask('fullCountdown', { countdown: Math.max(1, n) });
          if (n <= 1) { setTimeout(resolve, 800); return; }
          setTimeout(() => step(n - 1), 1000);
        };
        step(3);
      });
    }

    toggleFullText() {
      this.settings.fullShowText = (this.settings.fullShowText !== false) ? false : true;
      this.store.saveSettings(this.settings);
      this._syncFullText();
    }

    _syncFullText() {
      this.ui.showFullText(this.settings.fullShowText !== false);
    }

    async finishFull() {
      if (this._finishing || this.stage !== 'fullPlay') return;
      this._finishing = true;
      this.stage = 'processing';
      this._ctl('pause');
      this.ui.showFullText(false);
      this._lastFullText = null;
      this.ui.showMask('processing', {});
      this.ui.updateControls({ hidden: true, index: this.i, total: this.segments.length });

      const liveText = YSR.speech.stopText();
      let transcript = liveText || '';
      let asrSource = transcript ? 'live' : 'none';
      let audio = null;
      let blob = null;
      let recSec = 0;
      if (this.micGranted && YSR.recorder.isActive()) {
        const r = await YSR.recorder.stop();
        if (r) {
          blob = r.blob; recSec = r.durationSec;
          try { audio = await YSR.recorder.analyse(r.blob); } catch (e) { audio = null; }
          // 云端转写优先，失败回退 Chrome 内置实时识别结果
          try {
            const st = await YSR.ai.status();
            if (st.asr) {
              this.ui.toast('正在用云端模型转写录音…', 5000);
              const t = await YSR.ai.transcribeBlob(blob);
              if (t && t.trim()) { transcript = t.trim(); asrSource = 'cloud'; }
            }
          } catch (e) { this.ui.toast('云端转写失败，已改用本地识别结果', 3200); }
        }
      }

      const rg = this.range();
      const inRange = this.segments.filter((s) => s.startTime >= rg.start - 0.05 && s.endTime <= rg.end + 0.05);
      const result = YSR.feedback.analyze({ transcript, segments: inRange, audio, micDenied: !this.micGranted });
      result.sessionSec = (performance.now() - (this._sessionStart || performance.now())) / 1000;
      result.recSec = recSec;
      result.totalSegs = this.segments.length;
      result.doneSegs = this.segments.length;
      result.recordingBlob = blob;

      const inRangeSentences = this.sentences.filter((s) => s.end > rg.start - 0.05 && s.start < rg.end + 0.05);
      const missed = (result.perSeg || []).reduce((a, s) => a.concat(s.missing || []), []);
      result.asrSource = asrSource;
      let expressions = null;
      result.exprSource = 'rules';
      try { expressions = await YSR.ai.generateExpressions(inRangeSentences, missed, rg.end - rg.start); } catch (e) {}
      if (expressions && expressions.length) {
        result.exprSource = 'llm';
      } else {
        const ex = YSR.expressions.extract({
          sentences: inRangeSentences,
          missedWords: missed,
          rangeSeconds: rg.end - rg.start
        });
        expressions = ex.cards;
        result.missedRanked = ex.missedRanked;
      }
      result.expressions = expressions;
      // 未单独成卡的漏读词，折叠展示在结果页
      const shownWords = new Set((result.expressions || []).filter((c) => c.category === 'word').map((c) => String(c.expression).toLowerCase()));
      result.hiddenMissed = (result.missedRanked || missed)
        .map((w) => String(w).toLowerCase().replace(/[^a-z']/g, ''))
        .filter((w, i, arr) => w && w.length >= 3 && !shownWords.has(w) && arr.indexOf(w) === i)
        .slice(0, 8);

      this.finished = true;
      this.stage = 'result';
      this.store.track('full_shadowing_finish', {});
      this.store.track('feedback_generate_result', { ok: !result.micDenied });
      if (this.hooks.onComplete) this.hooks.onComplete(result);
    }

    /* ---------- 用户控制 ---------- */
    control(act) {
      if (this.destroyed || this.finished) return;
      if (act === 'pause') { this.store.track('practice_pause', { stage: this.stage }); this._togglePause(); }
      else if (act === 'prev') { if (this.i > 0) { this.i--; this._enter('blind'); } }
      else if (act === 'replay') { this.store.track('segment_replay', { index: this.i }); this._enter('blind'); }
      else if (act === 'next') {
        this.store.track('segment_skip', { index: this.i });
        if (this.cd) { const c = this.cd; this.cd = null; c.stop(); }
        this._nextSeg();
      }
    }

    space() {
      if (this.destroyed || this.finished) return;
      // 统一语义：Enter = 推进（跳过当前阶段）；空格归还给 YouTube 原生播放/暂停
      if (this.stage === 'blind') this.skipPlayback();                 // 跳过盲听 → 跟读停顿
      else if (this.stage === 'sub') this.skipToNextGroup();           // 跳过复听 → 下一组
      else if (this.stage === 'blindSpeak' || this.stage === 'subSpeak') { if (this.cd) this.cd.skip(); }
      else if (this.stage === 'fullPlay') this._togglePause();
    }

    // 空格跳过当前播放阶段，直接进入跟读停顿
    skipPlayback() {
      if (this.stage !== 'blind' && this.stage !== 'sub') return;
      this._ctl('pause');
      const cb = this._onSegEnd;
      this._onSegEnd = null;
      if (cb) cb();
    }

    // 跳过当前组剩余阶段，直接进入下一组
    skipToNextGroup() {
      if (this.stage !== 'sub') return;
      this._ctl('pause');
      if (this.cd) { const c = this.cd; this.cd = null; c.stop(); }
      this._onSegEnd = null;
      this._nextSeg();
    }

    async _togglePause() {
      if (this.stage === 'blind' || this.stage === 'sub') {
        if (this._paused) {
          this._paused = false; this._ctl('play');
          this.ui.setPaused(false);
          this.ui.updateControls({ index: this.i, total: this.segments.length, paused: false });
        } else {
          this._paused = true; this._ctl('pause');
          this.ui.setPaused(true);
          this.ui.updateControls({ index: this.i, total: this.segments.length, paused: true });
        }
      } else if (this.stage === 'blindSpeak' || this.stage === 'subSpeak') {
        if (!this.cd) return;
        if (this.cd.paused) { this.cd.resume(); this.ui.setPaused(false); }
        else { this.cd.pause(); this.ui.setPaused(true); }
      } else if (this.stage === 'fullPlay') {
        if (this._paused) {
          this._paused = false; this._ctl('play');
          YSR.recorder.resume(); YSR.speech.resume();
          if (this._fullPauseAt != null) { this._fullPausedAcc += performance.now() - this._fullPauseAt; this._fullPauseAt = null; }
          this.ui.setPaused(false);
        } else {
          this._paused = true; this._ctl('pause');
          YSR.recorder.pause(); YSR.speech.pause();
          this._fullPauseAt = performance.now();
          this.ui.setPaused(true);
        }
      }
    }

    /* ---------- 结果后跳转 ---------- */
    replaySegment(i) {
      const s = this.segments[i];
      if (!s) return;
      this._jumpTo(s.startTime);
      this.store.track('feedback_segment_play', { index: i });
    }
    gotoTime(t) { this._jumpTo(t); }
    _jumpTo(t) {
      this._internalSeek = true;
      YSR.bridge.player.seek(t).catch(() => { try { this.el.currentTime = t; } catch (e) {} });
      setTimeout(() => { this._internalSeek = false; }, 300);
      this._ctl('play');
    }

    /* ---------- 拖动进度条 ---------- */
    _bindSeek() {
      this._onSeeking = () => {
        if (this.destroyed || this.finished || this._internalSeek) return;
        const st = this.stage;
        if (['blind', 'sub', 'blindSpeak', 'subSpeak', 'fullPlay'].indexOf(st) < 0) return;
        this._ctl('pause');
        if (this.cd) this.cd.pause();
        if (st === 'fullPlay') { YSR.recorder.pause(); YSR.speech.pause(); }
        this.ui.showSeekPrompt();
        this.store.track('practice_seek', { stage: st });
      };
      this.el.addEventListener('seeking', this._onSeeking);
    }

    async seekStay() {
      if (this.destroyed) return;
      const t = this._lastT || (this.seg() ? this.seg().startTime : 0);
      if (this.stage === 'blind' || this.stage === 'sub') {
        await this._seek(t);
        this._ctl('play');
        this._paused = false; this.ui.setPaused(false);
      } else if (this.stage === 'blindSpeak' || this.stage === 'subSpeak') {
        if (this.cd) this.cd.resume();
        this.ui.setPaused(false);
      } else if (this.stage === 'fullPlay') {
        await this._seek(t);
        this._ctl('play');
        YSR.recorder.resume(); YSR.speech.resume();
        this._paused = false; this.ui.setPaused(false);
      }
    }

    async seekMove() {
      if (this.destroyed) return;
      const t = this.el.currentTime;
      if (this.stage === 'fullPlay') {
        this._ctl('play');
        YSR.recorder.resume(); YSR.speech.resume();
        this._paused = false; this.ui.setPaused(false);
        return;
      }
      const idx = this._segIndexAt(t);
      if (idx == null) {
        const r = this.range();
        if (t >= r.end) this._finishSentenceLoop();
        else { this.i = 0; this._enter('blind'); }
      } else {
        this.i = idx;
        this._enter('blind');
      }
    }
    _segIndexAt(t) {
      for (const s of this.segments) {
        if (t >= s.startTime - 0.05 && t < s.endTime) return s.index;
      }
      return null;
    }

    /* ---------- 广告 ---------- */
    _onAdStart() {
      this.ui.toast('广告播放中，练习稍后自动继续', 3000);
      if (this.stage === 'fullPlay') this._preAdT = this._lastT;
    }
    _onAdEnd() {
      if (this.destroyed) return;
      if (this.stage === 'blind' || this.stage === 'sub') {
        const t = this.el.currentTime;
        if (!(t >= this._segStart && t < this._segEnd - 0.1)) this._enter(this.stage);
      } else if (this.stage === 'fullPlay' && this._preAdT != null) {
        const p = this._preAdT;
        this._preAdT = null;
        this._seek(p).then(() => this._ctl('play'));
      }
    }

    /* ---------- 主循环 ---------- */
    _tick() {
      if (this.destroyed) return;
      const el = this.el;
      if (!el || !el.isConnected) return;
      this._lastT = el.currentTime;

      const ad = this._isAd();
      if (ad) { if (!this._adSeen) { this._adSeen = true; this._onAdStart(); } return; }
      if (this._adSeen) { this._adSeen = false; this._onAdEnd(); }
      if (this._waitingSeek) return;

      if ((this.stage === 'blindSpeak' || this.stage === 'subSpeak' || this.stage === 'processing' || this.stage === 'fullCountdown') && !el.paused && !this._isAd() && !this._waitingSeek) {
        // 跟读倒计时阶段视频必须保持暂停：原生空格误触发时自动压回去
        try { el.pause(); } catch (e) {}
      }

      const t = el.currentTime;
      if (this.stage === 'blind' || this.stage === 'sub') {
        const segDur = Math.max(0.1, this._segEnd - this._segStart);
        if (this._paused) {
          if (!el.paused) {
            this._paused = false; this.ui.setPaused(false);
            this.ui.updateControls({ index: this.i, total: this.segments.length, paused: false });
          }
        } else if (el.paused && this._expectPlaying && performance.now() > (this._playGraceUntil || 0)) {
          // 用户用 YouTube 自己的方式暂停了视频（我们发起的暂停有宽限期，不误判）
          this._paused = true; this.ui.setPaused(true);
          this.ui.updateControls({ index: this.i, total: this.segments.length, paused: true });
        } else {
          this.ui.updatePlaybackProgress((t - this._segStart) / segDur);
          if (t >= this._segEnd - 0.06) {
            this._ctl('pause');
            const cb = this._onSegEnd;
            this._onSegEnd = null;
            if (cb) cb();
          }
        }
      } else if (this.stage === 'fullPlay' && !this._paused) {
        const elapsed = (performance.now() - this._fullStart - (this._fullPausedAcc || 0)) / 1000;
        this.ui.updateFullTimer(elapsed);
        if (this.settings.fullShowText !== false) {
          const idx = this._segIndexAt(t);
          const cur = idx != null ? this.segments[idx] : null;
          if (cur && cur.text !== this._lastFullText) {
            this._lastFullText = cur.text;
            this.ui.updateFullText(cur.text, cur.index + 1, this.segments.length);
          }
        }
        const r = this.range();
        if (t >= r.end - 0.08) this.finishFull();
      }
    }

    currentTime() { return this._lastT || 0; }

    // 练习中修改设置：倍速立即应用；若处于暂停则恢复
    resumeFromSettings(newSettings) {
      if (newSettings) this.settings = newSettings;
      this._setRate();
      if (this._paused || (this.cd && this.cd.paused)) this._togglePause();
    }

    /* ---------- 销毁 ---------- */
    destroy(opts) {
      opts = opts || {};
      if (this.destroyed) return;
      this.destroyed = true;
      clearInterval(this._watchTimer);
      if (this.cd) { this.cd.stop(); this.cd = null; }
      try { this.el.removeEventListener('seeking', this._onSeeking); } catch (e) {}
      try { if (YSR.speech.available) YSR.speech.stopText(); } catch (e) {}
      if (YSR.recorder.isActive()) YSR.recorder.discard();
      try { this._ctl('pause'); } catch (e) {}
      this.ui.hideAll();
      if (!this.finished && opts.saveResume !== false) this.store.saveResume(this.videoId, { index: this.i, at: Date.now() });
      else this.store.clearResume(this.videoId);
    }
  };
})();
