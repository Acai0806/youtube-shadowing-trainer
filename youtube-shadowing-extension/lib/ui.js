// 全部页面内 UI：启动面板、浮动框（遮罩/字幕/录音）、控制条、结果面板
// 渲染在播放器容器内的 Shadow DOM 中，全屏/剧场模式自动跟随
window.YSR = window.YSR || {};
(() => {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmtT = (t) => { t = Math.max(0, Math.round(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const fmtDur = (t) => { t = Math.max(0, Math.round(t)); const m = Math.floor(t / 60), s = t % 60; return m > 0 ? m + ' 分 ' + s + ' 秒' : s + ' 秒'; };

  const SVG = {
    prev: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6L18 6v12z"/></svg>',
    next: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z"/></svg>',
    replay: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 5V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg>',
    lock: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M17 9V7A5 5 0 0 0 7 7v2H5v12h14V9zM9 7a3 3 0 0 1 6 0v2H9zm3 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>',
    unlock: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 3a5 5 0 0 0-5 5h2a3 3 0 0 1 6 0v3H5v10h14V11h-2V8a5 5 0 0 0-5-5z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.8z"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 12 5 5L20 7"/></svg>'
  };

  class UI {
    constructor() {
      this.handlers = {};
      this.maskPct = null;
      this.editing = false;
      this.miniMode = false;
      this.maskStage = null;
      this._ro = null;
      this.dead = false;
    }
    on(ev, fn) { this.handlers[ev] = fn; return this; }
    emit(ev, ...a) { const f = this.handlers[ev]; if (f) f(...a); }

    ensureMounted() {
      // 扩展重载后旧上下文会失效：检测并自我清理，避免旧浮层复活
      try {
        chrome.runtime.getManifest();
      } catch (e) {
        this.dead = true;
        try { if (this.host) this.host.remove(); } catch (e2) {}
        return null;
      }
      if (this.dead) return null;
      let p = document.querySelector('#movie_player');
      if (!p) {
        const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
        if (v) p = v.closest('.html5-video-player') || v.parentElement;
      }
      if (!p) return null;
      this.player = p;
      if (!this.host || this.host.parentElement !== p) {
        if (this.host) this.host.remove();
        this.host = document.createElement('div');
        this.host.className = 'ysr-host';
        // 宿主元素关键样式用内联方式写入（Shadow 内部类选择器作用不到宿主）
        this.host.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:90;';
        this.shadow = this.host.attachShadow({ mode: 'open' });
        const st = document.createElement('style');
        st.textContent = YSR.STYLES;
        this.shadow.appendChild(st);
        this.root = document.createElement('div');
        this.root.className = 'ysr-root';
        this.shadow.appendChild(this.root);
        p.appendChild(this.host);
        this._bindGlobal();
      }
      return p;
    }

    _bindGlobal() {
      if (this._ro) this._ro.disconnect();
      this._ro = new ResizeObserver(() => this._layoutMask());
      if (this.player) this._ro.observe(this.player);
      document.addEventListener('fullscreenchange', () => setTimeout(() => this._layoutMask(), 60));
    }

    get W() { return this.root ? this.root.clientWidth : 640; }
    get H() { return this.root ? this.root.clientHeight : 360; }

    _clear(el) { if (el && el.parentElement) el.parentElement.removeChild(el); return null; }

    /* ============ 启动面板 ============ */
    hidePanel() { this.panel = this._clear(this.panel); }

    showLauncher(m) {
      const p = this.ensureMounted();
      if (!p || !this.root) { console.error('[影子跟读] 播放器容器未找到，无法显示面板'); return; }
      this.hidePanel();
      const P = document.createElement('div');
      P.className = 'ysr-panel';
      P.dataset.role = 'launcher';
      this.panel = P;
      this.root.appendChild(P);
      this._renderLauncher(P, m);
    }

    // 就地更新设置面板：不重建 DOM，避免每次修改都闪烁
    updateLauncher(m) {
      const P = this.panel;
      if (!P || !P.dataset || P.dataset.role !== 'launcher' || m.phase !== 'ready') {
        this.showLauncher(m);
        return;
      }
      const st = m.settings;
      P.querySelectorAll('.ysr-seg [data-act]').forEach((b) => {
        const act = b.dataset.act;
        if (act === 'rate') b.classList.toggle('on', String(st.rate) === String(b.dataset.v));
        else if (act === 'pauseMultiplier') b.classList.toggle('on', String(st.pauseMultiplier) === String(b.dataset.v));
        else if (act === 'grouping') b.classList.toggle('on', String(st.grouping) === String(b.dataset.v));
        else if (act === 'rangeMode') b.classList.toggle('on', String(st.rangeMode) === String(b.dataset.v));
      });
      const rangeInputs = P.querySelector('[data-role="rangeInputs"]');
      if (rangeInputs) {
        rangeInputs.style.display = st.rangeMode === 'custom' ? '' : 'none';
        rangeInputs.querySelectorAll('input').forEach((b) => {
          if (document.activeElement === b) return; // 正在编辑时不覆盖
          if (b.dataset.act === 'rangeStart') b.value = fmtT(st.rangeStart || 0);
          if (b.dataset.act === 'rangeEnd') b.value = fmtT(st.rangeEnd || 0);
        });
      }
      const pv = P.querySelector('[data-role="preview"]');
      if (pv) pv.innerHTML = m.preview.map((s, i) =>
        '<div class="pv"><span class="n">' + (i + 1) + '</span><span class="tx">' + esc(s.text) + '</span>' +
        '<span class="tm">' + fmtT(s.startTime) + '</span></div>').join('');
      const est = P.querySelector('[data-role="estimate"]');
      if (est) est.textContent = '共 ' + m.total + ' 组 · 预计总时长约 ' + Math.max(1, Math.round(m.estimateSec / 60)) + ' 分钟';
      const note = P.querySelector('[data-role="practiceNote"]');
      if (note) note.textContent = m.structuralDirty
        ? '范围 / 分组已修改：应用后将按新片段从当前位置继续。'
        : '练习已暂停 · 倍速与停顿修改即时生效。';
      const resumeBtn = P.querySelector('[data-act="resumePractice"]');
      if (resumeBtn) resumeBtn.textContent = m.structuralDirty ? '应用并重新开始' : '继续练习';
    }

    _renderLauncher(P, m) {
      let html = '<div class="p-head"><span class="logo"></span><span class="t">影子跟读</span>' +
        '<button class="ysr-btn small ghost x" data-act="close">收起</button></div>';

      if (m.phase === 'detecting') {
        const steps = ['检测视频与字幕', '读取英文字幕', '切分训练片段'];
        html += '<div class="ysr-steps">' + steps.map((s, i) =>
          '<div class="ysr-step ' + (i < m.step ? 'done' : i === m.step ? 'active' : '') + '">' +
          '<span class="dot"></span><span>' + s + '</span></div>').join('') + '</div>' +
          (m.vid ? '<div class="ysr-est" style="margin-top:10px">正在识别视频 ' + esc(m.vid) + '</div>' : '');
      }

      if (m.phase === 'error') {
        html += '<div class="ysr-err"><div class="et">' + esc(m.error.title) + '</div>' +
          '<div class="ed">' + esc(m.error.detail) + '</div>' +
          '<button class="ysr-btn pri" data-act="retry">重试</button></div>';
      }

      if (m.phase === 'ready') {
        const st = m.settings;
        if (m.hasResume) {
          html += '<div class="ysr-row"><button class="ysr-btn small" data-act="resume">继续上次练习 · 第 ' +
            (m.hasResume.index + 1) + ' 组</button></div>';
        }
        const seg = (act, val, cur, label) =>
          '<button data-act="' + act + '" data-v="' + val + '" class="' + (String(cur) === String(val) ? 'on' : '') + '">' + label + '</button>';
        html += '<div class="ysr-sec"><div class="s-t">练习设置</div>' +
          '<div class="ysr-row"><span class="lb">范围</span><span class="ysr-seg">' +
          seg('rangeMode', 'full', st.rangeMode, '完整视频') + seg('rangeMode', 'custom', st.rangeMode, '自定义') + '</span>' +
          '<span data-role="rangeInputs" style="' + (st.rangeMode === 'custom' ? '' : 'display:none') + '">' +
          '<input class="ysr-input" data-act="rangeStart" value="' + esc(fmtT(st.rangeStart || 0)) + '" placeholder="0:00">' +
          '<span class="muted">至</span>' +
          '<input class="ysr-input" data-act="rangeEnd" value="' + esc(fmtT(st.rangeEnd || 0)) + '" placeholder="结束">' +
          '</span></div>' +
          '<div class="ysr-row"><span class="lb">分组</span><span class="ysr-seg">' +
          seg('grouping', '1', st.grouping, '一句一组') + seg('grouping', '2', st.grouping, '两句一组') + '</span></div>' +
          '<div class="ysr-row"><span class="lb">倍速</span><span class="ysr-seg">' +
          ['0.75', '1', '1.25'].map((r) => seg('rate', r, st.rate, r + 'x')).join('') + '</span></div>' +
          '<div class="ysr-row"><span class="lb">停顿</span><span class="ysr-seg">' +
          ['1.25', '1.5', '1.75', '2'].map((r) => seg('pauseMultiplier', r, st.pauseMultiplier, r + 'x')).join('') + '</span></div>' +
          (m.isASR ? '<div class="ysr-note">当前为自动生成字幕，切句与文本可能有误差，属正常现象。</div>' : '') +
          (m.translated ? '<div class="ysr-note">视频无原生英文轨道，当前使用 YouTube 机器翻译的英文字幕，文本质量取决于翻译效果。</div>' : '') +
          '</div>';

        html += '<div class="ysr-sec"><div class="s-t">片段预览（前 3 组）</div><div class="ysr-preview" data-role="preview">' +
          m.preview.map((s, i) =>
            '<div class="pv"><span class="n">' + (i + 1) + '</span><span class="tx">' + esc(s.text) + '</span>' +
            '<span class="tm">' + fmtT(s.startTime) + '</span></div>').join('') +
          '</div><div class="ysr-est" data-role="estimate">共 ' + m.total + ' 组 · 预计总时长约 ' + Math.max(1, Math.round(m.estimateSec / 60)) + ' 分钟</div></div>';

        if (m.aiStatus && !m.aiStatus.llm) {
          html += '<div class="ysr-note">未配置云端 AI：语音反馈将使用 Chrome 内置识别，表达卡为规则版。可点下方「AI 设置」接入 OpenAI 兼容接口。</div>';
        }

        if (m.practice) {
          html += '<div class="ysr-note" data-role="practiceNote">' +
            (m.structuralDirty ? '范围 / 分组已修改：应用后将按新片段从当前位置继续。' : '练习已暂停 · 倍速与停顿修改即时生效。') + '</div>';
          html += '<div class="ysr-foot"><button class="ysr-btn pri" data-act="resumePractice">' +
            (m.structuralDirty ? '应用并重新开始' : '继续练习') + '</button>' +
            '<span class="spacer"></span><span class="muted" style="font-size:11.5px;color:var(--tx2)">练习暂停中</span></div>';
        } else {
          html += '<div class="ysr-foot"><button class="ysr-btn pri" data-act="start">调整遮罩并开始</button>' +
            '<button class="ysr-btn small ghost" data-act="openAiSettings">AI 设置</button>' +
            '<span class="spacer"></span><span class="muted" style="font-size:11.5px;color:var(--tx2)">' + (m.vid ? '视频 ' + esc(m.vid) + ' · ' : '') + '下一步可拖动遮罩</span></div>';
        }
      }

      if (m.phase === 'adjust') {
        html += '<div style="font-weight:700;margin-bottom:4px">调整字幕遮罩</div>' +
          '<div style="font-size:12.5px;color:var(--tx2);margin-bottom:12px">拖动遮罩改变位置，拖四角圆点缩放，让它正好盖住视频字幕区域。</div>' +
          '<div class="ysr-foot"><button class="ysr-btn pri" data-act="fix">固定位置并开始</button>' +
          '<button class="ysr-btn ghost" data-act="backToSettings">返回设置</button>' +
          '<button class="ysr-btn ghost" data-act="useDefault">使用默认位置</button></div>';
      }

      P.innerHTML = html;

      // 事件绑定
      P.querySelectorAll('[data-act]').forEach((b) => {
        const act = b.dataset.act;
        if (b.tagName === 'INPUT') {
          if (b.type === 'checkbox') {
            b.addEventListener('change', () => this.emit('settings', { hardSubtitle: b.checked }));
          } else {
            b.addEventListener('change', () => this.emit('settings', { [act]: b.value }));
          }
        } else {
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            if (act === 'rangeMode' || act === 'grouping' || act === 'rate' || act === 'pauseMultiplier') {
              this.emit('settings', { [act]: b.dataset.v });
            } else {
              this.emit(act);
            }
          });
        }
      });
    }

    /* ============ 浮动框 ============ */
    setMaskPct(pct) {
      this.maskPct = pct && pct.w ? { ...pct } : { x: 15, y: 58, w: 70, h: 30 };
      if (this.mask) this._layoutMask();
    }
    getMaskPct() { return this.maskPct ? { ...this.maskPct } : null; }

    showMask(stage, data) {
      this.ensureMounted();
      this.maskStage = stage;
      this.miniMode = (stage === 'fullPlay');
      this._clear(this.seekEl);
      this.seekEl = null;
      this._clear(this.mask);
      if (stage === 'off') { this.mask = null; return; }
      const M = document.createElement('div');
      M.className = 'ysr-mask mask-' + stage;
      this.mask = M;
      this.root.appendChild(M);
      this._layoutMask();
      this._renderMaskContent(stage, data || {});
      this._bindMaskDrag();
    }

    _layoutMask() {
      const M = this.mask;
      if (!M || !this.root) return;
      if (this.miniMode) {
        M.style.cssText = 'left:50%;bottom:84px;top:auto;transform:translateX(-50%);width:auto;min-width:200px;height:54px;';
        this._layoutFullText();
        return;
      }
      const pct = this.maskPct || { x: 15, y: 58, w: 70, h: 30 };
      const w = Math.min(pct.w, 100);
      const h = Math.min(pct.h, 100);
      const x = Math.min(Math.max(pct.x, 0), 100 - w);
      const y = Math.min(Math.max(pct.y, 0), 100 - h);
      M.style.cssText = 'left:' + x + '%;top:' + y + '%;width:' + w + '%;height:' + h + '%;';
      this._fitSubcard();
      this._layoutControls();
    }

    // 完整跟读的跟随文本板
    showFullText(on) {
      if (!on) {
        this._clear(this.fullTextEl);
        this.fullTextEl = null;
        this._setFullTextBtn(false);
        return;
      }
      this.ensureMounted();
      if (!this.root || this.fullTextEl) { if (this.fullTextEl) this._setFullTextBtn(true); return; }
      const F = document.createElement('div');
      F.className = 'ysr-fulltext';
      F.innerHTML = '<div class="ft-label">完整跟读</div><div class="ft-text">准备开始…</div>';
      this.root.appendChild(F);
      this.fullTextEl = F;
      this._layoutFullText();
      this._setFullTextBtn(true);
    }

    _layoutFullText() {
      const F = this.fullTextEl;
      if (!F || !this.root) return;
      const pct = this.maskPct || { x: 15, y: 52, w: 70, h: 30 };
      const x = Math.min(Math.max(pct.x, 1), 99);
      const y = Math.min(Math.max(pct.y, 1), 58);
      const w = Math.min(pct.w, 96);
      F.style.left = x + '%';
      F.style.top = y + '%';
      F.style.width = w + '%';
      F.style.maxHeight = '38%';
      this._fitFullText();
    }

    updateFullText(text, idx, total) {
      if (!this.fullTextEl) return;
      const lbl = this.fullTextEl.querySelector('.ft-label');
      const tx = this.fullTextEl.querySelector('.ft-text');
      if (lbl) lbl.textContent = '完整跟读 · 第 ' + idx + ' / ' + total + ' 句';
      if (tx && text != null && tx.textContent !== text) {
        tx.textContent = text;
        tx.scrollTop = 0;
        this._fitFullText();
      }
    }

    _fitFullText() {
      if (!this.fullTextEl) return;
      const tx = this.fullTextEl.querySelector('.ft-text');
      if (!tx) return;
      let size = 19;
      tx.style.fontSize = size + 'px';
      let guard = 0;
      while (tx.scrollHeight > tx.clientHeight + 1 && size > 13 && guard < 12) {
        size -= 1;
        tx.style.fontSize = size + 'px';
        guard++;
      }
    }

    _setFullTextBtn(on) {
      if (!this.mask) return;
      const b = this.mask.querySelector('[data-act="toggleFullText"]');
      if (b) b.textContent = on ? '隐藏文本' : '显示文本';
    }

    // 字幕卡字号自适应：从 26px 逐级缩到 13px，仍溢出才允许滚动
    _fitSubcard() {
      if (!this.mask) return;
      const card = this.mask.querySelector('.m-subcard');
      if (!card) return;
      card.classList.remove('f2');
      let size = 26;
      card.style.fontSize = size + 'px';
      let guard = 0;
      while (card.scrollHeight > card.clientHeight + 1 && size > 13 && guard < 24) {
        size -= 1;
        card.style.fontSize = size + 'px';
        guard++;
      }
      if (card.scrollHeight > card.clientHeight + 1) card.classList.add('f2');
    }

    // 控制条紧贴遮罩下方；下方放不下则贴遮罩上方
    _layoutControls() {
      const C = this.controls;
      if (!C || !this.root) return;
      const rootRect = this.root.getBoundingClientRect();
      if (!rootRect.height) return;
      let mTop = rootRect.height * 0.58, mBottom = mTop + rootRect.height * 0.3;
      if (this.mask) {
        const r = this.mask.getBoundingClientRect();
        mTop = r.top - rootRect.top;
        mBottom = r.bottom - rootRect.top;
      }
      const ch = C.offsetHeight || 46;
      const gap = 10;
      let top = mBottom + gap;
      if (top + ch > rootRect.height - 6) {
        top = mTop - gap - ch;
        if (top < 6) top = 6;
      }
      C.style.top = top + 'px';
      C.style.bottom = 'auto';
    }

    _renderMaskContent(stage, d) {
      const M = this.mask;
      let body = '<div class="m-body">';
      if (stage === 'edit') {
        body += '<div class="m-hint">拖动整体移动 · 拖四角圆点缩放<br>盖住视频自带字幕区域即可</div>';
      }
      if (stage === 'blind') {
        body += '<div class="m-label">盲听 · 第 ' + (d.index + 1) + ' / ' + d.total + ' 组</div>' +
          '<div class="m-title">先听一遍</div>' +
          '<div class="m-bar"><i style="width:0%"></i></div>' +
          '<div class="m-hint">Enter 跳过播放 · 直接跟读</div>';
      }
      if (stage === 'blindSpeak') {
        body += '<div class="m-label">第 ' + (d.index + 1) + ' / ' + d.total + ' 组</div>' +
          '<div class="m-title">轮到你了</div><div class="m-count">-</div>' +
          '<div class="m-bar"><i style="width:100%"></i></div>' +
          '<div class="m-hint">按 Enter 进入下一组</div>';
      }
      if (stage === 'sub') {
        // 字幕阶段只保留正文 + 底部细进度条，把空间留给字幕
        body += '<div class="m-subcard">' + esc(d.text) + '</div>' +
          '<div class="m-bar slim"><i style="width:0%"></i></div>' +
          '<div class="m-hint">Enter 跳到下一组 · 直接跟读</div>';
      }
      if (stage === 'subSpeak') {
        body += '<div class="m-subcard">' + esc(d.text) + '</div>' +
          '<div class="m-hint">按 Enter 进入下一组 · 剩余 <span class="m-sec">-</span> 秒</div>';
      }
      if (stage === 'fullPrep') {
        body += '<div class="m-fullprep">' +
          '<div class="fp-title">完整跟读</div>' +
          '<div class="fp-row">练习范围 ' + esc(d.rangeText) + ' · 约 ' + esc(d.estimate) + '</div>' +
          '<div class="fp-row">建议佩戴耳机，避免原声被录进麦克风</div>' +
          '<div class="fp-btns"><button class="ysr-btn pri" data-act="startFull">' + SVG.mic + '开始完整跟读</button>' +
          '<button class="ysr-btn ghost" data-act="exit">结束练习</button></div></div>';
      }
      if (stage === 'fullCountdown') {
        body += '<div class="m-label">即将开始 · 请准备</div><div class="m-count">' + Math.ceil(d.countdown) + '</div>';
      }
      if (stage === 'fullPlay') {
        body += '<div class="m-fullpill"><span class="recdot"></span><span class="rec-time">0:00</span>' +
          '<button class="ysr-btn small ghost" data-act="toggleFullText">隐藏文本</button>' +
          '<button class="ysr-iconbtn" data-act="togglePause" title="暂停/继续">' + SVG.pause + '</button>' +
          '<button class="ysr-btn pri small" data-act="finishFull">我读完了</button></div>';
      }
      if (stage === 'processing') {
        body += '<div class="m-spinner"></div><div class="m-label">正在分析录音…</div>';
      }
      body += '</div>';

      // 锁定按钮（编辑态/练习态通用）
      body += '<button class="m-lock" data-act="lockToggle" title="' + (this.editing ? '锁定位置' : '调整位置') + '">' +
        (this.editing ? SVG.lock : SVG.unlock) + '</button>';
      // 编辑条
      body += '<div class="m-editbar"><span class="hint">拖动移动 · 四角缩放</span>' +
        '<button class="ysr-btn small pri" data-act="fix">固定位置</button></div>';
      // 四角缩放点
      body += '<span class="hd nw" data-hd="nw"></span><span class="hd ne" data-hd="ne"></span>' +
        '<span class="hd sw" data-hd="sw"></span><span class="hd se" data-hd="se"></span>';

      M.innerHTML = body;
      M.classList.toggle('editing', this.editing || stage === 'edit');
      if (stage === 'edit') this.editing = true;

      // 字幕卡自适应字号：逐级缩小直到完整展示，仍放不下才滚动
      if (M.querySelector('.m-subcard')) requestAnimationFrame(() => this._fitSubcard());

      M.querySelectorAll('[data-act]').forEach((b) => {
        b.addEventListener('click', (e) => { e.stopPropagation(); this.emit(b.dataset.act); });
      });
      M.querySelectorAll('.hd').forEach((hdEl) => {
        hdEl.addEventListener('pointerdown', (e) => this._startResize(e, hdEl.dataset.hd));
      });
    }

    _bindMaskDrag() {
      const M = this.mask;
      if (!M) return;
      // 整个遮罩体在解锁/调整态都可拖动（按钮、锁定钮、缩放点除外）；完整跟读胶囊条也可拖
      M.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.ysr-btn') || e.target.closest('.m-lock') || e.target.closest('.hd') || e.target.closest('.ysr-iconbtn')) return;
        if (!this.editing && !this.miniMode) return;
        this._startDrag(e);
      });
    }

    _startDrag(e) {
      if (!this.mask || this.miniMode) { /* mini 也可拖动 */ }
      const M = this.mask;
      const startPx = { x: e.clientX, y: e.clientY };
      const rect = M.getBoundingClientRect();
      const host = this.root.getBoundingClientRect();
      const startY = rect.top - host.top;
      const startX = rect.left - host.left;
      const move = (ev) => {
        const dx = ev.clientX - startPx.x;
        const dy = ev.clientY - startPx.y;
        const nx = Math.min(Math.max(startX + dx, 0), Math.max(0, host.width - rect.width));
        const ny = Math.min(Math.max(startY + dy, 0), Math.max(0, host.height - rect.height));
        M.style.left = nx + 'px';
        M.style.top = ny + 'px';
        M.style.right = 'auto';
        M.style.bottom = 'auto';
        M.style.transform = 'none';
        this._layoutControls();
        this._dragPx = { x: nx, y: ny, w: rect.width, h: rect.height };
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (this._dragPx && this.root) {
          const W = this.W || 640, H = this.H || 360;
          const p = this._dragPx;
          this.maskPct = {
            x: p.x / W * 100, y: p.y / H * 100,
            w: p.w / W * 100, h: p.h / H * 100
          };
          this.emit('maskMoved', { ...this.maskPct });
          this._fitSubcard();
        }
        this._dragPx = null;
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }

    _startResize(e, dir) {
      e.stopPropagation();
      const M = this.mask;
      const startPx = { x: e.clientX, y: e.clientY };
      const host = this.root.getBoundingClientRect();
      const rect = M.getBoundingClientRect();
      const s = { x: rect.left - host.left, y: rect.top - host.top, w: rect.width, h: rect.height };
      const minW = 120, minH = 56;
      const move = (ev) => {
        const dx = ev.clientX - startPx.x;
        const dy = ev.clientY - startPx.y;
        let { x, y, w, h } = s;
        if (dir === 'nw' || dir === 'sw') {
          const nx = Math.min(Math.max(s.x + dx, 0), s.x + s.w - minW);
          w = s.w + (s.x - nx); x = nx;
        } else {
          w = Math.min(Math.max(s.w + dx, minW), host.width - s.x);
        }
        if (dir === 'nw' || dir === 'ne') {
          const ny = Math.min(Math.max(s.y + dy, 0), s.y + s.h - minH);
          h = s.h + (s.y - ny); y = ny;
        } else {
          h = Math.min(Math.max(s.h + dy, minH), host.height - s.y);
        }
        M.style.left = x + 'px'; M.style.top = y + 'px';
        M.style.width = w + 'px'; M.style.height = h + 'px';
        M.style.right = 'auto'; M.style.bottom = 'auto'; M.style.transform = 'none';
        this._layoutControls();
        this._dragPx = { x, y, w, h };
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (this._dragPx && this.root) {
          const W = this.W || 640, H = this.H || 360;
          const p = this._dragPx;
          this.maskPct = { x: p.x / W * 100, y: p.y / H * 100, w: p.w / W * 100, h: p.h / H * 100 };
          this.emit('maskMoved', { ...this.maskPct });
          this._fitSubcard();
        }
        this._dragPx = null;
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }

    setEditing(v) {
      this.editing = v;
      if (!this.mask) return;
      this.mask.classList.toggle('editing', v);
      const lock = this.mask.querySelector('.m-lock');
      if (lock) {
        lock.innerHTML = v ? SVG.lock : SVG.unlock;
        lock.title = v ? '锁定位置' : '调整位置';
      }
    }

    updateCountdown(rem, total) {
      if (!this.mask) return;
      const c = this.mask.querySelector('.m-count');
      if (c) c.textContent = rem.toFixed(1);
      this.mask.querySelectorAll('.m-sec').forEach((el) => { el.textContent = rem.toFixed(1); });
      const i = this.mask.querySelector('.m-bar i');
      if (i) i.style.width = (total > 0 ? rem / total * 100 : 0) + '%';
    }

    updatePlaybackProgress(p) {
      if (!this.mask) return;
      const i = this.mask.querySelector('.m-bar i');
      if (i) i.style.width = Math.min(100, Math.max(0, p * 100)) + '%';
    }

    updateFullTimer(sec) {
      if (!this.mask) return;
      const t = this.mask.querySelector('.rec-time');
      if (t) t.textContent = fmtT(sec);
    }

    setPaused(v) {
      if (!this.mask) return;
      let tag = this.mask.querySelector('.paused-tag');
      if (v && !tag) {
        tag = document.createElement('div');
        tag.className = 'paused-tag';
        tag.textContent = '已暂停 · 空格或按钮继续';
        this.mask.appendChild(tag);
      }
      if (!v && tag) tag.remove();
      const pb = this.mask.querySelector('[data-act="togglePause"]');
      if (pb) pb.innerHTML = v ? SVG.play : SVG.pause;
      const cb = this.controls && this.controls.querySelector('[data-act="pause"]');
      if (cb) cb.innerHTML = v ? SVG.play : SVG.pause;
    }

    /* ============ 控制条 ============ */
    showControls(d) {
      this.ensureMounted();
      this._clear(this.controls);
      const C = document.createElement('div');
      C.className = 'ysr-controls';
      C.innerHTML =
        '<button class="ysr-iconbtn" data-act="prev" title="上一组">' + SVG.prev + '</button>' +
        '<button class="ysr-iconbtn" data-act="replay" title="重来一次">' + SVG.replay + '</button>' +
        '<button class="ysr-iconbtn" data-act="pause" title="暂停/继续">' + (d.paused ? SVG.play : SVG.pause) + '</button>' +
        '<button class="ysr-iconbtn" data-act="next" title="下一组">' + SVG.next + '</button>' +
        '<button class="ysr-iconbtn" data-act="settings" title="练习设置">' + SVG.settings + '</button>' +
        '<span class="prog"></span>' +
        '<button class="ysr-btn small ghost" data-act="exit">退出</button>';
      C.querySelectorAll('[data-act]').forEach((b) => {
        b.addEventListener('click', (e) => { e.stopPropagation(); this.emit('ctl', b.dataset.act); });
      });
      this.controls = C;
      this.root.appendChild(C);
      this.updateControls(d);
      this._layoutControls();
    }

    updateControls(d) {
      if (!this.controls) return;
      this.controls.classList.toggle('full-hidden', !!d.hidden);
      const pr = this.controls.querySelector('.prog');
      if (pr && d.total) pr.textContent = '第 ' + (d.index + 1) + ' / ' + d.total + ' 组';
      const prev = this.controls.querySelector('[data-act="prev"]');
      if (prev) prev.disabled = d.index <= 0;
      const pb = this.controls.querySelector('[data-act="pause"]');
      if (pb) pb.innerHTML = d.paused ? SVG.play : SVG.pause;
    }

    hideControls() { this.controls = this._clear(this.controls); }

    /* ============ 提示 ============ */
    toast(msg, ms = 2400) {
      this.ensureMounted();
      const T = document.createElement('div');
      T.className = 'ysr-toast';
      T.textContent = msg;
      this.root.appendChild(T);
      setTimeout(() => this._clear(T), ms);
    }

    showSeekPrompt() {
      if (!this.mask || this.seekEl) return;
      const S = document.createElement('div');
      S.className = 'seek-prompt';
      S.innerHTML = '<span>检测到你拖动了进度条</span>' +
        '<button class="ysr-btn small pri" data-act="seekMove">从新位置继续</button>' +
        '<button class="ysr-btn small ghost" data-act="seekStay">回到刚才位置</button>';
      S.querySelectorAll('[data-act]').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const act = b.dataset.act;
          this._clear(S); this.seekEl = null;
          this.emit(act);
        });
      });
      this.seekEl = S;
      this.mask.appendChild(S);
    }

    showConfirm() {
      this.ensureMounted();
      if (this.confirmEl) return;
      const C = document.createElement('div');
      C.className = 'ysr-confirm';
      C.innerHTML = '<div class="ct">确定要退出练习吗？</div>' +
        '<div class="cd">已完成的进度会保存，本次视频中可以继续。</div>' +
        '<div class="ysr-foot"><button class="ysr-btn pri" data-act="stay">继续练习</button>' +
        '<button class="ysr-btn ghost" data-act="quit">退出练习</button></div>';
      C.querySelectorAll('[data-act]').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const v = b.dataset.act === 'quit';
          this._clear(C); this.confirmEl = null;
          this.emit('exitChoice', v);
        });
      });
      this.confirmEl = C;
      this.root.appendChild(C);
    }

    /* ============ 结果面板 ============ */
    showResult(res, ctx) {
      this.ensureMounted();
      this.hidePanel();
      const P = document.createElement('div');
      P.className = 'ysr-panel result';
      this.panel = P;

      const CATN = { pattern: '句式结构', collocation: '固定搭配', word: '单词与短语' };
      let html = '<div class="p-head"><span class="logo"></span><span class="t">练习结果</span>' +
        '<button class="ysr-btn small ghost x" data-act="closeResult">关闭</button></div>';

      html += '<div class="ysr-metrics">' +
        '<div class="ysr-metric"><b>' + fmtDur(res.sessionSec || 0) + '</b><span>训练总时长</span></div>' +
        '<div class="ysr-metric"><b>' + (res.doneSegs || 0) + '/' + (res.totalSegs || 0) + '</b><span>完成片段</span></div>' +
        '<div class="ysr-metric"><b>' + fmtDur(res.recSec || 0) + '</b><span>完整跟读时长</span></div></div>';

      if (res.micDenied) {
        html += '<div class="ysr-sec"><span class="ysr-tag warn">未授权麦克风</span>' +
          '<div class="ysr-note">本次未生成语音反馈。下次完整跟读时授权麦克风即可获得漏读与节奏分析。</div></div>';
      } else if (res.transcriptEmpty) {
        html += '<div class="ysr-sec"><span class="ysr-tag warn">识别结果为空</span>' +
          '<div class="ysr-note">语音识别没有拿到内容，可能环境太吵或识别服务不可用。表达积累不受影响。</div></div>';
      } else {
        if (res.priority && res.priority.length) {
          html += '<div class="ysr-sec"><div class="s-t">优先重练（点击跳转播放原声）</div><div class="ysr-chips">' +
            res.priority.map((s) =>
              '<button class="ysr-chip" data-seg="' + s.index + '"><span class="cn">第 ' + (s.index + 1) + ' 组</span>' +
              '<span class="cx">覆盖 ' + Math.round(s.coverage * 100) + '%' +
              (s.missing && s.missing.length ? ' · 可能漏读：' + esc(s.missing.slice(0, 4).join('、')) : '') + '</span>' +
              '<span class="cc">' + fmtT(s.startTime) + '</span></button>').join('') + '</div></div>';
        }
        html += '<div class="ysr-sec"><div class="s-t">节奏反馈</div>' +
          '<div class="ysr-wpm">' +
          '<div class="wrow"><span style="width:76px">你的语速</span><span class="wbar"><i class="u" style="width:' +
          Math.min(100, (res.userWPM || 0) / 2.4) + '%"></i></span><span>' + (res.userWPM || '-') + ' WPM</span></div>' +
          '<div class="wrow"><span style="width:76px">原声语速</span><span class="wbar"><i class="o" style="width:' +
          Math.min(100, (res.origWPM || 0) / 2.4) + '%"></i></span><span>' + (res.origWPM || '-') + ' WPM</span></div></div>' +
          (res.pauseCount ? '<div class="ysr-note">检测到 ' + res.pauseCount + ' 次较长停顿，最长 ' + (res.longestPause || 0).toFixed(1) + ' 秒。</div>' : '') +
          '<div class="ysr-sugg">' + (res.suggestions || []).map((s) => '<div class="sg"><i></i><span>' + esc(s) + '</span></div>').join('') + '</div></div>';
      }

      if (res.recordingURL) {
        html += '<div class="ysr-sec"><button class="ysr-btn small ghost" data-act="playRecording">播放我的录音</button></div>';
      }

      html += '<div class="ysr-sec"><div class="s-t">表达积累（' + (res.expressions || []).length + '）' +
        (res.exprSource === 'llm' ? ' <span class="ysr-tag word">LLM 生成</span>' :
          (res.exprSource === 'rules' ? ' <span class="ysr-tag">规则提取</span>' : '')) +
        '</div><div class="ysr-exp">';
      if (!res.expressions || !res.expressions.length) {
        html += '<div class="ysr-exp-empty">本次片段没有提取到高价值表达。</div>';
      } else {
        for (const c of res.expressions) {
          html += '<div class="card"><div class="r1"><span class="ysr-tag ' + c.category + '">' + CATN[c.category] + '</span>' +
            '<span class="expr">' + esc(c.expression) + '</span>' +
            '<span class="act">' +
            '<button class="mini star" data-key="' + esc(c.key) + '" title="收藏">' + SVG.star + '</button>' +
            '<button class="mini master" data-key="' + esc(c.key) + '" title="标记已掌握">' + SVG.check + '</button></span></div>' +
            (c.meaning ? '<div class="mn">' + esc(c.meaning) + (c.pos ? ' · ' + esc(c.pos) : '') + '</div>' : '') +
            '<div class="src">原句：<b>' + esc(c.sourceSentence) + '</b></div>' +
            '<div class="nt">' + esc(c.usageNote || '') + (c.timestamp != null ? ' <button class="ysr-goto" data-t="' + c.timestamp + '">▶ ' + fmtT(c.timestamp) + ' 原声</button>' : '') + '</div>' +
            (c.example ? '<div class="ex">例：' + esc(c.example) + '</div>' : '') +
            '</div>';
        }
      }
      html += '<div class="ysr-note">' +
        (res.hiddenMissed && res.hiddenMissed.length
          ? '另有 ' + res.hiddenMissed.length + ' 个漏读词未单独成卡：' + esc(res.hiddenMissed.join('、'))
          : '漏读词已全部包含在上方卡片中。') + '</div></div>';

      html += '<div class="ysr-foot"><button class="ysr-btn pri" data-act="restart">再练一次</button>' +
        '<button class="ysr-btn ghost" data-act="closeResult">关闭</button></div>';

      P.innerHTML = html;
      this.root.appendChild(P);

      P.querySelectorAll('[data-act]').forEach((b) => {
        b.addEventListener('click', (e) => { e.stopPropagation(); this.emit(b.dataset.act); });
      });
      P.querySelectorAll('[data-seg]').forEach((b) => {
        b.addEventListener('click', (e) => { e.stopPropagation(); this.emit('replaySeg', Number(b.dataset.seg)); });
      });
      P.querySelectorAll('[data-t]').forEach((b) => {
        b.addEventListener('click', (e) => { e.stopPropagation(); this.emit('goto', Number(b.dataset.t)); });
      });
      P.querySelectorAll('.mini.star').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const card = (res.expressions || []).find((c) => c.key === b.dataset.key);
          if (!card) return;
          this.emit('saveToggle', card, b);
        });
      });
      P.querySelectorAll('.mini.master').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          b.classList.toggle('on');
          const card = (res.expressions || []).find((c) => c.key === b.dataset.key);
          if (card) this.emit('masterToggle', card);
        });
      });
    }

    markSaved(key, saved) {
      if (!this.panel) return;
      const b = this.panel.querySelector('.mini.star[data-key="' + key.replace(/"/g, '\\"') + '"]');
      if (b) b.classList.toggle('on', saved);
    }

    hideAll() {
      this.hidePanel();
      this.showMask('off');
      this.hideControls();
      this.showFullText(false);
    }
  }

  YSR.UI = UI;
})();
