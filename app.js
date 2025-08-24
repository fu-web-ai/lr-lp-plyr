const params = new URLSearchParams(location.search);
const videoId = (params.get('v') || '').trim();
let start = parseFloat(params.get('s'));
let end   = parseFloat(params.get('e'));
const text = (params.get('t') || '').trim();

if (Number.isNaN(start)) start = 0;
if (Number.isNaN(end) || end <= start) end = start + 3.0;

const hintEl   = document.getElementById('hint');
const subsEl   = document.getElementById('subs');
const playBtn  = document.getElementById('playBtn');
const timeInfo = document.getElementById('timeInfo');

if (!videoId) {
  hintEl.hidden = false;
}

const form = document.getElementById('urlForm');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = form.elements['v'].value.trim();
  const s = form.elements['s'].value.trim();
  const ee = form.elements['e'].value.trim();
  const t = form.elements['t'].value.trim();
  const q = new URLSearchParams();
  if (v) q.set('v', v);
  if (s) q.set('s', s);
  if (ee) q.set('e', ee);
  if (t) q.set('t', t);
  location.search = `?${q.toString()}`;
});

subsEl.textContent = text || '（字幕は?t=テキスト で指定）';

(function injectYTAPI(){
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
})();

let player = null;
let loopTimer = null;

window.onYouTubeIframeAPIReady = function() {
  if (!videoId) {
    playBtn.disabled = true;
    return;
  }
  player = new YT.Player('player', {
    videoId,
    playerVars: {
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
      controls: 1
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange
    }
  });
};

function onPlayerReady() {
  playBtn.disabled = false;
  playBtn.addEventListener('click', () => {
    player.seekTo(start, true);
    player.playVideo();
    startLoopWatchdog();
  });
  updateTimeInfo(0);
}

function onPlayerStateChange(e) {}

function startLoopWatchdog() {
  stopLoopWatchdog();
  loopTimer = setInterval(() => {
    if (!player || typeof player.getCurrentTime !== 'function') return;
    const t = player.getCurrentTime();
    updateTimeInfo(t);
    if (t >= (end - 0.05)) {
      player.seekTo(start, true);
    }
  }, 100);
}

function stopLoopWatchdog() {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
}

function updateTimeInfo(t) {
  const fmt = (x) => (Math.round(x * 10) / 10).toFixed(1);
  timeInfo.textContent = `Loop: ${fmt(start)}s → ${fmt(end)}s　| Now: ${fmt(t)}s`;
}
