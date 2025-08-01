/* MoveNet – full client JS (3-pane UI + badges + robust variant switching) */

/* ---------- DOM ---------- */
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const statsEl   = document.getElementById('stats');
const toastEl   = document.getElementById('toast');
const rawJsonEl = document.getElementById('rawJson');
const derivedEl = document.getElementById('derived');
const errEl     = document.getElementById('err');

const variantSel      = document.getElementById('variant');
const backendUrlInput = document.getElementById('backendUrl');
const useWebcamBtn    = document.getElementById('useWebcam');
const imageInput      = document.getElementById('imageInput');
const videoInput      = document.getElementById('videoInput');
const exportJsonBtn   = document.getElementById('exportJson');
const storeBtn        = document.getElementById('storeFrame');
const autoStoreChk    = document.getElementById('autoStore');
const storeStatusEl   = document.getElementById('storeStatus');

const variantBadge = document.getElementById('variantBadge');
const backendBadge = document.getElementById('backendBadge');

/* ---------- State ---------- */
let detector = null;
let running = false;
let fpsSamples = [];
let allDetections = [];
let autoTimer = null;
let webcamStream = null;

function setWebcamBtn(mode) {
  // mode: 'start' or 'stop'
  if (mode === 'stop') {
    useWebcamBtn.textContent = 'Stop Webcam';
    useWebcamBtn.classList.remove('btn-start');
    useWebcamBtn.classList.add('btn-stop');
  } else {
    useWebcamBtn.textContent = 'Start Webcam';
    useWebcamBtn.classList.remove('btn-stop');
    useWebcamBtn.classList.add('btn-start');
  }
}



/* ---------- Errors / Toasts ---------- */
function showError(e) {
  errEl.classList.remove('hidden');
  errEl.textContent = (e && e.stack) ? e.stack : String(e || 'Unknown error');
  console.error(e);
}
window.addEventListener('error', ev => showError(ev.error || ev.message));
window.addEventListener('unhandledrejection', ev => showError(ev.reason));
window.addEventListener('beforeunload', stopWebcam);


function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  setTimeout(() => (toastEl.hidden = true), 2200);
}

/* ---------- Badges & Variant helpers ---------- */
function variantNiceName(val) {
  if (val === 'SINGLEPOSE_THUNDER')  return 'SinglePose Thunder (TF.js)';
  if (val === 'MULTIPOSE_LIGHTNING') return 'MultiPose Lightning (TF.js)';
  return 'SinglePose Lightning (TF.js)';
}
function updateBadges() {
  variantBadge && (variantBadge.textContent = `Variant: ${variantNiceName(variantSel.value)}`);
  const url = (backendUrlInput.value || '').trim();
  backendBadge && (backendBadge.textContent = url ? `Backend: ${new URL(url).hostname}` : 'Backend: not set');
}
backendUrlInput?.addEventListener('input', updateBadges);

/* ---------- TF.js + detector ---------- */
async function ensureTfReady() {
  try {
    // Prefer WebGL; fall back to CPU.
    await tf.setBackend('webgl').catch(() => tf.setBackend('cpu'));
    await tf.ready();
  } catch (e) { showError(e); }
}

function mapModelType(v) {
  const t = poseDetection.movenet.modelType;
  if (v === 'SINGLEPOSE_THUNDER')  return t.SINGLEPOSE_THUNDER;
  if (v === 'MULTIPOSE_LIGHTNING') return t.MULTIPOSE_LIGHTNING;
  return t.SINGLEPOSE_LIGHTNING;
}

async function createDetector() {
  if (detector) return detector;
  await ensureTfReady();
  const modelType = mapModelType(variantSel.value);
  detector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    { modelType, enableSmoothing: true, multiPoseMaxDimension: 256, minPoseScore: 0.15 }
  );
  return detector;
}

async function restartDetector() {
  try { await detector?.dispose?.(); } catch (_) {}
  detector = null;
  await createDetector();
}

/* ---------- Render helpers ---------- */
function resizeCanvas(w, h) { canvas.width = w; canvas.height = h; }

function drawPoses(poses) {
  if (!video.paused && !video.ended && video.readyState >= 2) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }
  poses.forEach((p) => {
    (p.keypoints || []).forEach((k) => {
      if (k.score > 0.3) {
        ctx.beginPath();
        ctx.arc(k.x, k.y, 6, 0, Math.PI * 2); // larger dot
        ctx.fill();
      }
    });
  });

  // Overlay label: current variant
  ctx.save();
  ctx.font = '12px system-ui, sans-serif';
  const label = variantNiceName(variantSel.value).replace(' (TF.js)','');
  const text = `Variant: ${label}`;
  const pad = 6;
  const w = ctx.measureText(text).width + pad*2;
  const h = 22;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(8, 8, w, h);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 8 + pad, 8 + 15);
  ctx.restore();
}

function updateStats(start) {
  const dt  = performance.now() - start;
  const fps = 1000 / dt;
  fpsSamples.push(fps);
  if (fpsSamples.length > 30) fpsSamples.shift();
  const avgFps = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
  const mem = performance.memory ? (performance.memory.usedJSHeapSize/1e6).toFixed(1) + ' MB' : 'n/a';
  statsEl.textContent = `FPS: ${avgFps.toFixed(1)} | Frame latency: ${dt.toFixed(1)} ms | JS Heap: ${mem}`;
  return dt;
}

function pretty(obj) { rawJsonEl.textContent = JSON.stringify(obj || {}, null, 2); }

function renderDerived(obj) {
  if (!obj || !obj.poses) { derivedEl.innerHTML = '<p>Waiting for detections…</p>'; return; }
  const poses = obj.poses;
  let html = `<p><b>Poses:</b> ${poses.length}</p>`;
  if (obj.frameLatencyMs !== undefined) html += `<p><b>Frame latency:</b> ${obj.frameLatencyMs.toFixed(1)} ms</p>`;
  if (poses.length > 0) {
    const kp = poses[0].keypoints || [];
    const rows = kp.map((k, i) => {
      const name = k.name || `kp_${i}`;
      const sc = k.score !== undefined ? k.score.toFixed(2) : '–';
      const x  = k.x     !== undefined ? k.x.toFixed(1)     : '–';
      const y  = k.y     !== undefined ? k.y.toFixed(1)     : '–';
      return `<tr><td>${name}</td><td>${sc}</td><td>${x}</td><td>${y}</td></tr>`;
    }).join('');
    html += `<table class="kptable"><thead><tr><th>Keypoint</th><th>Score</th><th>X</th><th>Y</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  derivedEl.innerHTML = html;
}

/* ---------- Main loop ---------- */
async function loop() {
  if (!running) return;

  if (!detector) {            // guard: recreate after variant switch
    await createDetector();
  }

  const start = performance.now();
  let poses = [];
  try {
    poses = await detector.estimatePoses(video);
  } catch (e) {
    showError(e);
    running = false;          // stop loop on hard error
    return;
  }

  drawPoses(poses);
  const frameLatency = updateStats(start);

  const frame = { ts: Date.now(), poses, variant: variantSel.value, frameLatencyMs: frameLatency };
  allDetections.push(frame);
  pretty(frame);
  renderDerived(frame);

  requestAnimationFrame(loop);
}

/* ---------- Inputs ---------- */
function stopWebcam() {
  try {
    if (webcamStream) {
      webcamStream.getTracks().forEach(t => t.stop());
      webcamStream = null;
    }
  } catch (_) {}
  running = false;
  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  statsEl.textContent = '';
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; autoStoreChk.checked = false; }
  setWebcamBtn('start');
}

async function startWebcam() {
  try {
    if (!video.srcObject && !video.paused && !video.ended) video.pause();
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    webcamStream = stream;
    video.srcObject = stream;
    await video.play();
    await new Promise(res => { if (video.readyState >= 2) res(); else video.onloadedmetadata = () => res(); });
    resizeCanvas(video.videoWidth, video.videoHeight);
    await restartDetector();
    running = true;
    setWebcamBtn('stop');
    loop();
  } catch (e) {
    showToast('Webcam failed or blocked. Try image/video upload.');
    showError(e);
    setWebcamBtn('start');
  }
}

async function handleImage(file) {
  if (webcamStream) stopWebcam(); 
  const img = new Image();
  img.onload = async () => {
    resizeCanvas(img.width, img.height);
    ctx.drawImage(img, 0, 0);
    await restartDetector();
    const t0 = performance.now();
    const poses = await detector.estimatePoses(img);
    drawPoses(poses);
    const frameLatency = updateStats(t0);
    const frame = { ts: Date.now(), poses, variant: variantSel.value, frameLatencyMs: frameLatency };
    allDetections.push(frame);
    pretty(frame);
    renderDerived(frame);
  };
  img.src = URL.createObjectURL(file);
}

async function handleVideo(file) {
  if (webcamStream) stopWebcam(); 
  const url = URL.createObjectURL(file);
  video.src = url;
  await video.play();
  await new Promise((res) => { if (video.readyState >= 2) res(); else video.onloadedmetadata = () => res(); });
  resizeCanvas(video.videoWidth, video.videoHeight);
  await restartDetector();
  running = true;
  loop();
}

/* ---------- Backend POST (optional) ---------- */
function mapVariantToApi(v) {
  if (v === 'SINGLEPOSE_THUNDER')  return 'singlepose_thunder';
  if (v === 'MULTIPOSE_LIGHTNING') return 'multipose_lightning';
  return 'singlepose_lightning';
}

function sendCurrentFrame() {
  const url = (backendUrlInput.value || '').trim().replace(/\/$/, '');
  if (!url) { showToast('Set Backend URL first'); return; }

  canvas.toBlob(async (blob) => {
    if (!blob || blob.size < 100) { showToast('No frame to send yet'); return; }
    try {
      const fd = new FormData();
      fd.append('file', blob, 'frame.jpg');
      const variant = mapVariantToApi(variantSel.value);
      const res = await fetch(`${url}/predict?variant=${variant}&store=true`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      storeStatusEl.textContent = data.stored_at ? `Stored at: ${data.stored_at}` : 'Sent';
      showToast('Frame sent to backend');
    } catch (e) { showToast('Send failed (check URL/CORS/Port visibility)'); showError(e); }
  }, 'image/jpeg', 0.9);
}

/* ---------- Wire up ---------- */
useWebcamBtn.onclick = () => {
  if (webcamStream) stopWebcam();
  else startWebcam();
};
imageInput.onchange  = (e) => e.target.files?.[0] && handleImage(e.target.files[0]);
videoInput.onchange  = (e) => e.target.files?.[0] && handleVideo(e.target.files[0]);

exportJsonBtn.onclick = () => {
  const blob = new Blob([JSON.stringify(allDetections, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'detections.json';
  a.click();
};

storeBtn.onclick = sendCurrentFrame;
autoStoreChk.onchange = (e) => {
  if (e.target.checked) {
    autoTimer = setInterval(() => { if (running) sendCurrentFrame(); }, 5000);
    showToast('Auto-store ON');
  } else {
    clearInterval(autoTimer); autoTimer = null; showToast('Auto-store OFF');
  }
};

/* Variant change: pause, swap model, resume if webcam active */
variantSel.addEventListener('change', async () => {
  updateBadges();
  const wasRunning = running;
  running = false;
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  await restartDetector();
  // resume loop if webcam or a video is the current source
  const active = !!video.srcObject || (!video.paused && !video.ended);
  if (active && wasRunning !== false) {
    running = true;
    requestAnimationFrame(loop);
  }
});

/* ---------- Init ---------- */
updateBadges();
