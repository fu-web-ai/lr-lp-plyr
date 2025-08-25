// URLパラメータ
const params = new URLSearchParams(location.search);
const videoId = (params.get('v') || '').trim();
let start = parseFloat(params.get('s'));
let end   = parseFloat(params.get('e'));
const textParam = (params.get('t') || '').trim();
const segId = (params.get('id') || '').trim();
const isDev = params.get('dev') === '1';

// デフォルト
if (Number.isNaN(start)) start = 0;
if (Number.isNaN(end) || end <= start) end = start + 3.0;

// UI参照
const form     = document.getElementById('urlForm');
const subsEl   = document.getElementById('subs');
const playBtn  = document.getElementById('playBtn');
const stopBtn  = document.getElementById('stopBtn');
const speedBtn = document.getElementById('speedBtn');
const timeInfo = document.getElementById('timeInfo');
const startVal = document.getElementById('startVal');
const endVal   = document.getElementById('endVal');
const startReadout = document.getElementById('startReadout');
const endReadout   = document.getElementById('endReadout');

// devフォーム表示切替
if (form) form.hidden = !isDev;

// 初期字幕（?t 優先、のちにJSONで上書きされ得る）
let displayText = textParam || '（字幕は?t= または ?id= で指定）';
if (subsEl) subsEl.textContent = displayText;

// mm:ss.s 表示（分は常に0）
function fmtTime(x) {
  const s = Math.max(0, Math.min(59.9, x));
  const rs = (Math.round(s * 10) / 10).toFixed(1).padStart(4,'0');
  return `0:${rs}`;
}
function refreshReadouts() {
  if (startVal) startVal.textContent = fmtTime(start);
  if (endVal)   endVal.textContent   = fmtTime(end);
}
refreshReadouts();

// 直接入力（0:00〜0:59.9）
function promptSeconds(current) {
  let s = prompt('秒を入力（0〜59.9）', (Math.round(current*10)/10).toFixed(1));
  if (s === null) return null;
  s = s.replace(',', '.');
  const v = parseFloat(s);
  if (Number.isNaN(v)) return null;
  return Math.max(0, Math.min(59.9, v));
}
if (startReadout) startReadout.addEventListener('click', () => {
  const v = promptSeconds(start); if (v === null) return;
  start = v; if (end <= start) end = Math.min(59.9, start + 0.1); refreshReadouts();
});
if (endReadout) endReadout.addEventListener('click', () => {
  const v = promptSeconds(end); if (v === null) return;
  end = Math.max(start + 0.1, Math.min(59.9, v)); refreshReadouts();
});

// devフォーム submit
if (form) form.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = form.elements['v'].value.trim();
  const s = form.elements['s'].value.trim();
  const ee= form.elements['e'].value.trim();
  const t = form.elements['t'].value.trim();
  const id= form.elements['id'].value.trim();
  const q = new URLSearchParams();
  if (v) q.set('v', v);
  if (s) q.set('s', s);
  if (ee) q.set('e', ee);
  if (t) q.set('t', t);
  if (id) q.set('id', id);
  q.set('dev', '1');
  location.search = `?${q.toString()}`;
});

// JSON参照（?id= があるときだけ）
async function tryLoadFromJson(){
  if (!segId || !videoId) return;
  try {
    const res = await fetch('./data/segments.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('segments.json not found');
    const json = await res.json();
    const list = Array.isArray(json) ? json : [json];
    for (const item of list) {
      if (!item || item.video_id !== videoId || !Array.isArray(item.segments)) continue;
      const seg = item.segments.find(s => s.id === segId);
      if (seg) {
        if (typeof seg.start === 'number') start = Math.max(0, Math.min(59.9, seg.start));
        if (typeof seg.end === 'number')   end   = Math.max(start + 0.1, Math.min(59.9, seg.end));
        if (seg.text) displayText = String(seg.text);
        if (subsEl) subsEl.textContent = displayText;
        refreshReadouts();
        break;
      }
    }
  } catch (err) {
    console.warn('JSON load failed:', err);
  }
}
tryLoadFromJson();

// YouTube IFrame API を注入
(function(){
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
})();

let player = null;
let loopTimer = null;

// 速度トグル（0.5→0.75→1→…）
const speeds = [0.5, 0.75, 1.0];
let speedIndex = 0;
function currentSpeed(){ return speeds[speedIndex % speeds.length]; }
function cycleSpeed(){ speedIndex = (speedIndex + 1) % speeds.length; return currentSpeed(); }

// API準備完了時に呼ばれるコールバック
window.onYouTubeIframeAPIReady = function() {
  if (!videoId) { if (playBtn) playBtn.disabled = true; if (stopBtn) stopBtn.disabled = true; return; }
  player = new YT.Player('player', {
    videoId,
    playerVars: { modestbranding:1, rel:0, playsinline:1, controls:1 },
    events: { onReady, onStateChange }
  });
};

function onReady() {
  if (playBtn) playBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = false;

  if (playBtn) playBtn.addEventListener('click', () => {
    player.seekTo(start, true);
    player.setPlaybackRate(currentSpeed());
    player.playVideo();
    startWatchdog();
  });

  if (stopBtn) stopBtn.addEventListener('click', () => {
    player.stopVideo();
    stopWatchdog();
  });

  if (speedBtn) {
    speedBtn.textContent = currentSpeed() + 'x';
    speedBtn.addEventListener('click', () => {
      const spd = cycleSpeed();
      speedBtn.textContent = spd + 'x';
      if (player && player.getPlayerState() === YT.PlayerState.PLAYING) {
        player.setPlaybackRate(spd);
      }
    });
  }

  // 微調整ボタンの結線
  bumpHook('start-dec-05', -0.5, 'start');
  bumpHook('start-dec-01', -0.1, 'start');
  bumpHook('start-inc-01', +0.1, 'start');
  bumpHook('start-inc-05', +0.5, 'start');
  bumpHook('end-dec-05',   -0.5, 'end');
  bumpHook('end-dec-01',   -0.1, 'end');
  bumpHook('end-inc-01',   +0.1, 'end');
  bumpHook('end-inc-05',   +0.5, 'end');

  updateTimeInfo(0);
}
function onStateChange(_) {}

function bumpHook(role, delta, which){
  const el = document.querySelector(`[data-role="${role}"]`);
  if (!el) return;
  const apply = () => {
    if (which === 'start') {
      start = Math.max(0, Math.min(59.9, start + delta));
      if (end <= start) end = Math.min(59.9, start + 0.1);
    } else {
      end = Math.max(start + 0.1, Math.min(59.9, end + delta));
    }
    refreshReadouts();
  };
  let tid=null;
  const run=()=>apply();
  el.addEventListener('click', run);
  el.addEventListener('mousedown', ()=>{ tid=setInterval(run, 120); });
  el.addEventListener('mouseup',   ()=>{ clearInterval(tid); tid=null; });
  el.addEventListener('mouseleave',()=>{ clearInterval(tid); tid=null; });
  el.addEventListener('touchstart',()=>{ tid=setInterval(run, 120); });
  el.addEventListener('touchend',  ()=>{ clearInterval(tid); tid=null; });
}

function startWatchdog(){
  stopWatchdog();
  loopTimer = setInterval(() => {
    if (!player || typeof player.getCurrentTime !== 'function') return;
    const t = player.getCurrentTime();
    updateTimeInfo(t);
    if (t >= (end - 0.05)) player.seekTo(start, true);
  }, 100);
}
function stopWatchdog(){ if (loopTimer){ clearInterval(loopTimer); loopTimer=null; } }

function updateTimeInfo(t){
  if (!timeInfo) return;
  timeInfo.textContent = `Loop: ${fmtTime(start)} → ${fmtTime(end)} | Now: ${fmtTime(t)} | Speed: ${currentSpeed()}x`;
}
