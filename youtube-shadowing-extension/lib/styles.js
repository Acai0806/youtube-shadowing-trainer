// 浮动层样式（注入 Shadow DOM，不污染 YouTube 页面）
// 视觉方向：YouTube 深色原生风 —— 深灰面板、红色点缀、Roboto 字族
window.YSR = window.YSR || {};
YSR.STYLES = `
:host { all: initial; display: block; position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; z-index: 90; }
.ysr-host { position: absolute; inset: 0; pointer-events: none; z-index: 90; }
.ysr-root { position: absolute; inset: 0; pointer-events: none; overflow: hidden;
  font-family: "Roboto", "Segoe UI", "Microsoft YaHei", Arial, sans-serif;
  --bg: #0f0f0f; --bg2: #1c1c1c; --bg3: #272727;
  --line: rgba(255,255,255,.14); --tx: #f1f1f1; --tx2: #aaaaaa;
  --red: #f0333d; --red-hover: #ff4450; --ok: #2dba4e;
  color: var(--tx); font-size: 14px; line-height: 1.5;
  * { box-sizing: border-box; } }
.ysr-root * { box-sizing: border-box; }

@keyframes ysr-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes ysr-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes ysr-spin { to { transform: rotate(360deg); } }

/* ---------- 通用控件 ---------- */
.ysr-btn { pointer-events: auto; display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 999px; border: 1px solid transparent;
  background: var(--bg3); color: var(--tx); font: 500 13px/1 inherit; cursor: pointer;
  user-select: none; transition: background .15s, transform .05s; white-space: nowrap; }
.ysr-btn:hover { background: #3f3f3f; }
.ysr-btn:active { transform: scale(.97); }
.ysr-btn:disabled { opacity: .4; cursor: default; }
.ysr-btn.pri { background: var(--red); color: #fff; }
.ysr-btn.pri:hover { background: var(--red-hover); }
.ysr-btn.ghost { background: transparent; border-color: var(--line); }
.ysr-btn.ghost:hover { background: rgba(255,255,255,.08); }
.ysr-btn.small { padding: 5px 10px; font-size: 12px; }
.ysr-btn svg { flex: none; }

.ysr-iconbtn { pointer-events: auto; width: 34px; height: 34px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--bg3); color: var(--tx); cursor: pointer; border: none;
  transition: background .15s; }
.ysr-iconbtn:hover { background: #3f3f3f; }
.ysr-iconbtn:disabled { opacity: .35; cursor: default; }

.ysr-tag { display: inline-block; padding: 2px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 500; border: 1px solid var(--line); color: var(--tx2); }
.ysr-tag.pattern { color: #ffd24d; border-color: rgba(255,210,77,.4); }
.ysr-tag.collocation { color: #5ec9ff; border-color: rgba(94,201,255,.4); }
.ysr-tag.word { color: #7ee787; border-color: rgba(126,231,135,.4); }
.ysr-tag.warn { color: #ff9c9c; border-color: rgba(255,156,156,.4); }

/* ---------- 启动面板 / 结果面板 ---------- */
.ysr-panel { pointer-events: auto; position: absolute; left: 50%; top: 8%;
  transform: translateX(-50%); width: min(440px, 92%); max-height: 84%; z-index: 8;
  overflow-y: auto; background: rgba(15,15,15,.96); border: 1px solid var(--line);
  border-radius: 16px; box-shadow: 0 16px 48px rgba(0,0,0,.55);
  padding: 18px; animation: ysr-fade .18s ease; }
.ysr-panel::-webkit-scrollbar { width: 6px; }
.ysr-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,.2); border-radius: 3px; }

.ysr-panel .p-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.ysr-panel .p-head .logo { width: 10px; height: 10px; border-radius: 50%; background: var(--red); }
.ysr-panel .p-head .t { font-weight: 700; font-size: 15px; }
.ysr-panel .p-head .x { margin-left: auto; }

.ysr-steps { display: flex; flex-direction: column; gap: 10px; padding: 8px 2px; }
.ysr-step { display: flex; align-items: center; gap: 10px; color: var(--tx2); font-size: 13px; }
.ysr-step .dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.2); flex: none; }
.ysr-step.done { color: var(--tx); }
.ysr-step.done .dot { background: var(--ok); }
.ysr-step.active { color: var(--tx); }
.ysr-step.active .dot { background: var(--red); animation: ysr-pulse 1.2s infinite; }

.ysr-err { padding: 6px 2px 2px; }
.ysr-err .et { font-weight: 700; font-size: 15px; margin-bottom: 6px; }
.ysr-err .ed { color: var(--tx2); font-size: 13px; margin-bottom: 14px; }

.ysr-sec { margin-top: 14px; }
.ysr-sec .s-t { font-size: 12px; color: var(--tx2); margin-bottom: 8px; font-weight: 500; }
.ysr-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.ysr-row .lb { width: 64px; flex: none; font-size: 12.5px; color: var(--tx2); }

.ysr-seg { display: inline-flex; background: var(--bg2); border: 1px solid var(--line);
  border-radius: 999px; padding: 2px; pointer-events: auto; }
.ysr-seg button { border: none; background: transparent; color: var(--tx2);
  padding: 5px 12px; border-radius: 999px; font: 500 12px/1 inherit; cursor: pointer; }
.ysr-seg button.on { background: var(--bg3); color: var(--tx); }
.ysr-seg button:hover:not(.on) { color: var(--tx); }

.ysr-input { pointer-events: auto; background: var(--bg2); border: 1px solid var(--line);
  color: var(--tx); border-radius: 8px; padding: 6px 10px; font: 500 13px/1.2 inherit;
  width: 74px; }
.ysr-input:focus { outline: none; border-color: rgba(255,255,255,.4); }
.ysr-check { pointer-events: auto; display: inline-flex; align-items: center; gap: 6px;
  font-size: 12.5px; color: var(--tx2); cursor: pointer; user-select: none; }
.ysr-check input { accent-color: var(--red); }

.ysr-preview { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.ysr-preview .pv { display: flex; gap: 10px; padding: 8px 12px; font-size: 12.5px;
  border-bottom: 1px solid rgba(255,255,255,.07); align-items: baseline; }
.ysr-preview .pv:last-child { border-bottom: none; }
.ysr-preview .pv .n { color: var(--tx2); flex: none; width: 30px; }
.ysr-preview .pv .tx { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ysr-preview .pv .tm { color: var(--tx2); flex: none; font-variant-numeric: tabular-nums; }

.ysr-est { font-size: 12.5px; color: var(--tx2); margin-top: 10px; }
.ysr-note { font-size: 11.5px; color: var(--tx2); background: var(--bg2);
  border-radius: 8px; padding: 7px 10px; margin-top: 10px; }

.ysr-foot { display: flex; gap: 8px; margin-top: 16px; align-items: center; }
.ysr-foot .spacer { flex: 1; }

/* ---------- 浮动框（遮罩 / 字幕 / 录音） ---------- */
.ysr-mask { pointer-events: auto; position: absolute; z-index: 4; border-radius: 12px;
  min-width: 160px; min-height: 64px; animation: ysr-fade .18s ease; }
.ysr-mask .m-body { position: absolute; inset: 0; border-radius: 12px; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; text-align: center; }
.ysr-mask.editing .m-body { outline: 1.5px dashed rgba(255,255,255,.65); outline-offset: -2px; }
.ysr-mask.editing .m-editbar { display: flex; }
.ysr-mask:not(.editing) .m-editbar { display: none; }
.ysr-mask .m-lock { position: absolute; top: 6px; right: 6px; width: 26px; height: 26px;
  border-radius: 50%; background: rgba(15,15,15,.72); color: var(--tx2); border: 1px solid var(--line);
  display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0;
  transition: opacity .15s; pointer-events: auto; }
.ysr-mask:hover .m-lock { opacity: 1; }
.ysr-mask.editing .m-lock { opacity: 1; }

.m-editbar { position: absolute; top: -38px; left: 50%; transform: translateX(-50%);
  background: rgba(15,15,15,.95); border: 1px solid var(--line); border-radius: 10px;
  padding: 5px 8px; gap: 8px; align-items: center; white-space: nowrap; z-index: 5; }
.m-editbar .hint { font-size: 12px; color: var(--tx2); }

.hd { position: absolute; width: 12px; height: 12px; border-radius: 50%;
  background: #fff; border: 2px solid var(--red); display: none; z-index: 6; }
.ysr-mask.editing .hd { display: block; }
.hd.nw { top: -6px; left: -6px; cursor: nwse-resize; }
.hd.ne { top: -6px; right: -6px; cursor: nesw-resize; }
.hd.sw { bottom: -6px; left: -6px; cursor: nesw-resize; }
.hd.se { bottom: -6px; right: -6px; cursor: nwse-resize; }

.m-label { font-size: 12px; color: var(--tx2); letter-spacing: .04em; }
.m-title { font-size: 20px; font-weight: 700; }
.m-count { font-size: 46px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.1; }
.m-bar { width: 62%; height: 4px; border-radius: 2px; background: rgba(255,255,255,.18); overflow: hidden; }
.m-bar i { display: block; height: 100%; background: var(--red); border-radius: 2px;
  transition: width .2s linear; }
.m-bar.slim { width: 38%; height: 3px; }
.m-hint .m-sec { color: var(--red); font-weight: 600; }
.m-hint { font-size: 11.5px; color: var(--tx2); }

/* 练习态一律全不透明，确保盖住视频自带字幕；仅调整态半透明透视 */
.mask-blind .m-body, .mask-blindSpeak .m-body, .mask-sub .m-body, .mask-subSpeak .m-body,
.mask-processing .m-body, .mask-fullPrep .m-body, .mask-fullCountdown .m-body { background: #0f0f0f; }
.mask-edit .m-body { background: rgba(15,15,15,.5); }
.mask-fullPlay .m-body { background: rgba(15,15,15,.9); border-radius: 999px; }

.m-subcard { max-width: 94%; max-height: 94%; overflow: hidden; padding: 12px 22px;
  font-weight: 700; font-size: 26px; line-height: 1.4; color: #fff;
  text-shadow: 0 1px 6px rgba(0,0,0,.8); word-break: break-word; }
.m-subcard.f2 { overflow-y: auto; }

.m-fullpill { display: flex; align-items: center; gap: 12px; padding: 0 16px; height: 100%; }
.recdot { width: 10px; height: 10px; border-radius: 50%; background: var(--red);
  animation: ysr-pulse 1.4s infinite; flex: none; }
.rec-time { font-variant-numeric: tabular-nums; font-weight: 700; font-size: 15px; }

.m-spinner { width: 26px; height: 26px; border-radius: 50%;
  border: 3px solid rgba(255,255,255,.18); border-top-color: var(--red);
  animation: ysr-spin .9s linear infinite; }

.m-fullprep { display: flex; flex-direction: column; gap: 8px; align-items: center; padding: 10px 20px; }
.m-fullprep .fp-title { font-size: 18px; font-weight: 700; }
.m-fullprep .fp-row { font-size: 12.5px; color: var(--tx2); }
.m-fullprep .fp-btns { display: flex; gap: 8px; margin-top: 6px; }

.paused-tag { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%);
  background: rgba(15,15,15,.85); border: 1px solid var(--line); color: var(--tx2);
  font-size: 11.5px; padding: 4px 12px; border-radius: 999px; white-space: nowrap; }

.seek-prompt { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%);
  background: rgba(15,15,15,.95); border: 1px solid var(--line); border-radius: 12px;
  padding: 10px 12px; display: flex; align-items: center; gap: 10px; white-space: nowrap;
  font-size: 12.5px; animation: ysr-fade .18s ease; }

.ysr-fulltext { pointer-events: auto; position: absolute; z-index: 4; border-radius: 12px;
  background: #0f0f0f; border: 1px solid var(--line); display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px; padding: 12px 20px; overflow: hidden;
  animation: ysr-fade .18s ease; }
.ysr-fulltext .ft-label { font-size: 11px; color: var(--tx2); }
.ysr-fulltext .ft-text { font-weight: 700; font-size: 19px; line-height: 1.45; color: #fff;
  text-align: center; width: 100%; overflow-y: auto; }

/* ---------- 控制条 ---------- */
.ysr-controls { pointer-events: auto; position: absolute; left: 50%; bottom: 70px;
  transform: translateX(-50%); z-index: 5; display: flex; align-items: center; gap: 6px;
  background: rgba(15,15,15,.92); border: 1px solid var(--line); border-radius: 999px;
  padding: 6px 10px; animation: ysr-fade .18s ease; }
.ysr-controls .prog { font-size: 12px; color: var(--tx2); padding: 0 8px;
  font-variant-numeric: tabular-nums; white-space: nowrap; }
.ysr-controls.full-hidden { display: none; }

/* ---------- 确认框 / Toast ---------- */
.ysr-confirm { pointer-events: auto; position: absolute; left: 50%; top: 50%;
  transform: translate(-50%,-50%); background: rgba(15,15,15,.97); z-index: 9;
  border: 1px solid var(--line); border-radius: 14px; padding: 18px; width: min(340px, 86%);
  box-shadow: 0 16px 48px rgba(0,0,0,.55); animation: ysr-fade .18s ease; }
.ysr-confirm .ct { font-weight: 700; margin-bottom: 6px; }
.ysr-confirm .cd { font-size: 12.5px; color: var(--tx2); margin-bottom: 14px; }

.ysr-toast { pointer-events: none; position: absolute; left: 50%; top: 12%;
  transform: translateX(-50%); background: rgba(15,15,15,.92); border: 1px solid var(--line);
  color: var(--tx); font-size: 12.5px; padding: 8px 16px; border-radius: 999px;
  animation: ysr-fade .18s ease; white-space: nowrap; z-index: 10; }

/* ---------- 结果面板 ---------- */
.ysr-panel.result { width: min(540px, 94%); }
.ysr-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ysr-metric { background: var(--bg2); border: 1px solid rgba(255,255,255,.07);
  border-radius: 10px; padding: 10px; text-align: center; }
.ysr-metric b { display: block; font-size: 18px; font-weight: 700; }
.ysr-metric span { font-size: 11px; color: var(--tx2); }

.ysr-chips { display: flex; flex-direction: column; gap: 6px; }
.ysr-chip { pointer-events: auto; display: flex; align-items: center; gap: 8px;
  background: var(--bg2); border: 1px solid rgba(255,255,255,.07); border-radius: 10px;
  padding: 8px 12px; cursor: pointer; font-size: 12.5px; text-align: left; color: var(--tx);
  transition: background .15s; }
.ysr-chip:hover { background: var(--bg3); }
.ysr-chip .cn { color: var(--red); font-weight: 700; flex: none; }
.ysr-chip .cx { color: var(--tx2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.ysr-chip .cc { color: var(--tx2); flex: none; font-variant-numeric: tabular-nums; }

.ysr-wpm { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
.ysr-wpm .wrow { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--tx2); }
.ysr-wpm .wbar { flex: 1; height: 6px; border-radius: 3px; background: rgba(255,255,255,.12); overflow: hidden; }
.ysr-wpm .wbar i { display: block; height: 100%; border-radius: 3px; }
.ysr-wpm .wbar i.u { background: var(--red); }
.ysr-wpm .wbar i.o { background: rgba(255,255,255,.45); }

.ysr-sugg { display: flex; flex-direction: column; gap: 6px; }
.ysr-sugg .sg { display: flex; gap: 8px; font-size: 12.5px; color: var(--tx); align-items: baseline; }
.ysr-sugg .sg i { width: 6px; height: 6px; border-radius: 50%; background: var(--red); flex: none; transform: translateY(-2px); }

.ysr-exp { display: flex; flex-direction: column; gap: 8px; }
.ysr-exp .card { border: 1px solid rgba(255,255,255,.09); border-radius: 10px; padding: 10px 12px; }
.ysr-exp .card .r1 { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.ysr-exp .card .expr { font-weight: 700; font-size: 13.5px; }
.ysr-exp .card .act { margin-left: auto; display: flex; gap: 4px; }
.ysr-exp .card .mini { pointer-events: auto; width: 26px; height: 26px; border-radius: 50%;
  border: 1px solid var(--line); background: transparent; color: var(--tx2); cursor: pointer;
  display: flex; align-items: center; justify-content: center; font-size: 13px; }
.ysr-exp .card .mini:hover { color: var(--tx); background: var(--bg3); }
.ysr-exp .card .mini.on { color: #ffd24d; border-color: rgba(255,210,77,.5); }
.ysr-exp .card .mini.master.on { color: #7ee787; border-color: rgba(126,231,135,.5); }
.ysr-exp .card .mn { font-size: 12.5px; margin-bottom: 3px; }
.ysr-exp .card .src { font-size: 12px; color: var(--tx2); font-style: italic; }
.ysr-exp .card .src b { font-style: normal; color: rgba(255,255,255,.75); font-weight: 500; }
.ysr-exp .card .nt { font-size: 11.5px; color: var(--tx2); margin-top: 3px; }
.ysr-exp .card .ex { font-size: 11.5px; color: var(--tx2); margin-top: 3px; border-left: 2px solid var(--line); padding-left: 8px; }
.ysr-exp-empty { font-size: 12.5px; color: var(--tx2); padding: 8px 2px; }

.ysr-goto { pointer-events: auto; background: none; border: none; color: #5ec9ff;
  font: 500 11.5px/1 inherit; cursor: pointer; padding: 0; }
.ysr-goto:hover { text-decoration: underline; }

.ysr-muted { color: var(--tx2); }
`;
