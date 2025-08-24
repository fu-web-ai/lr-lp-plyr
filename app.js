// --- URLパラメータ ---
const params = new URLSearchParams(location.search);
const videoId = (params.get('v') || '').trim();
let start = parseFloat(params.get('s'));
let end   = parseFloat(params.get('e'));
const textParam = (params.get('t') || '').trim();
const segId = (params.get('id') || '').trim();

// デフォルト/妥当化
if (Number.isNaN(start)) start = 0;
if (Number.isNaN(end) || end <= start) end = start + 3.0;

// UI参照
const hintEl   = document.getElementById('hint');
const subsEl   = document.getElementById('subs');
const playBtn  = document.getElementById('playBtn');
const speedBtn = document.getElementById('speedBtn');
const timeInfo = document.getElementById('timeInfo');
const startVal = document.getElementById('startVal');
const endVal   = document.getElementById('endVal');

// ヒント表示
if (!videoId) hintEl.hidden = false;

// 表示テキスト（初期値は?t=優先、後でJSONがあれば置換）
let displayText = textParam || '（字幕は?t=か、?id=でJSON参照）';
subsEl.textContent = displayText;

// mm:ss.s フォーマッタ
function fmtTime(x){
  const s = Math.max(0, x);
  const m = Math.floor(s/60);
  const r = s - m*60;
  const rs = (Math.round(r*10)/10).toFixed(1).padStart(4,'0');
  return `${m}:${rs}`;
}
function refreshReadouts(){
  startVal.textContent = fmtTime(start);
  endVal.textContent   = fmtTime(end);
}
refreshReadouts();

// URLフォーム
const form = document.getElementById('urlForm');
form.addEventListener('submit', (e) => {
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
  location.search = `?${q.toString()}`;
});

// --- JSON参照（?id=がある場合のみ） ---
async function tryLoadFromJson(){
  if (!segId) return;
  try {
    const res = await fetch('./data/segments.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('segments.json not found');
    const json = await res.json();
    const list = Array.isArray(json) ? json : [json];
    for (const item of list) {
      if (!item || item.video_id !== videoId || !Array.isArray(item.segments)) continue;
      const seg = item.segments.find(s => s.id === segId);
      if (seg) {
        if (typeof seg.start === 'number') start = seg.start;
        if (typeof seg.end === 'number')   end   = seg.end;
        if (seg.text) displayText = String(seg.text);
        subsEl.textContent = displayText;
        refreshReadouts();
        break;
      }
    }
  } catch (err) {
    console.warn('JSON load failed:', err);
  }
}
tryLoadFromJson();

// YT IFrame API注入
(function(){
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
})();

let player = null;
let loopTimer = null;

// 速度トグル（0.5 -> 0.75 -> 1 -> 0.5 ...）
const speeds = [0.5, 0.75, 1.0];
let speedIndex = 0;
function currentSpeed(){ return speeds[speedIndex % speeds.length]; }
function cycleSpeed(){ speedIndex = (speedIndex + 1) % speeds.length; return currentSpeed(); }

// API準備
window.onYouTubeIframeAPIReady = function() {
  if (!videoId) { playBtn.disabled = true; return; }
  player = new YT.Player('player', {
    videoId,
    playerVars: { modestbranding:1, rel:0, playsinline:1, controls:1 },
    events: { onReady, onStateChange }
  });
};

function onReady() {
  playBtn.disabled = false;

  // 再生
  playBtn.addEventListener('click', () => {
    player.seekTo(start, true);
    player.setPlaybackRate(currentSpeed());
    player.playVideo();
    startWatchdog();
  });

  // 速度トグル
  speedBtn.textContent = speeds[speedIndex] + 'x';
  speedBtn.addEventListener('click', () => {
    const spd = cycleSpeed();
    speedBtn.textContent = spd + 'x';
    if (player && player.getPlayerState() === YT.PlayerState.PLAYING) {
      player.setPlaybackRate(spd);
    }
  });

  // Start/End 微調整
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
      start = Math.max(0, start + delta);
      if (end <= start) end = start + 0.1;
    } else {
      end = Math.max(start + 0.1, end + delta);
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
  timeInfo.textContent = `Loop: ${fmtTime(start)} → ${fmtTime(end)} | Now: ${fmtTime(t)} | Speed: ${currentSpeed()}x`;
}
