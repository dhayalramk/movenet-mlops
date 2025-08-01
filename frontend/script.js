const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statsEl = document.getElementById('stats');
const toastEl = document.getElementById('toast');

const variantSel = document.getElementById('variant');
const backendUrlInput = document.getElementById('backendUrl');
const useWebcamBtn = document.getElementById('useWebcam');
const imageInput = document.getElementById('imageInput');
const videoInput = document.getElementById('videoInput');
const exportJsonBtn = document.getElementById('exportJson');

let detector = null;
let running = false;
let fpsSamples = [];
let allDetections = [];

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  setTimeout(() => (toastEl.hidden = true), 3000);
}

function mapModelType(v) {
  const t = poseDetection.movenet.modelType;
  if (v === 'SINGLEPOSE_THUNDER') return t.SINGLEPOSE_THUNDER;
  if (v === 'MULTIPOSE_LIGHTNING') return t.MULTIPOSE_LIGHTNING;
  return t.SINGLEPOSE_LIGHTNING;
}

async function createDetector() {
  const modelType = mapModelType(variantSel.value);
  detector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    {
      modelType,
      enableSmoothing: true,
      multiPoseMaxDimension: 256,
      minPoseScore: 0.15
    }
  );
}

function resizeCanvas(w, h) {
  canvas.width = w;
  canvas.height = h;
}

function drawPoses(poses) {
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  poses.forEach(p => {
    p.keypoints.forEach(k => {
      if (k.score > 0.3) {
        ctx.beginPath();
        ctx.arc(k.x, k.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  });
}

function updateStats(start) {
  const dt = performance.now() - start;
  const fps = 1000 / dt;
  fpsSamples.push(fps);
  if (fpsSamples.length > 30) fpsSamples.shift();
  const avgFps = fpsSamples.reduce((a,b)=>a+b,0)/fpsSamples.length;
  const mem = performance.memory ? (performance.memory.usedJSHeapSize/1e6).toFixed(1) + ' MB' : 'n/a';
  statsEl.textContent = `FPS: ${avgFps.toFixed(1)} | Frame latency: ${dt.toFixed(1)} ms | JS Heap: ${mem}`;
}

async function loop() {
  if (!running) return;
  const start = performance.now();
  const poses = await detector.estimatePoses(video);
  drawPoses(poses);
  allDetections.push({ ts: Date.now(), poses });
  updateStats(start);
  requestAnimationFrame(loop);
}

async function startWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await video.play();
    resizeCanvas(video.videoWidth, video.videoHeight);
    await createDetector();
    running = true;
    loop();
  } catch (e) {
    showToast('Webcam failed or blocked. Try image/video upload.');
  }
}

async function handleImage(file) {
  const img = new Image();
  img.onload = async () => {
    resizeCanvas(img.width, img.height);
    ctx.drawImage(img, 0, 0);
    await createDetector();
    const t0 = performance.now();
    const poses = await detector.estimatePoses(img);
    drawPoses(poses);
    updateStats(t0);
    allDetections.push({ ts: Date.now(), poses });
  };
  img.src = URL.createObjectURL(file);
}

async function handleVideo(file) {
  const url = URL.createObjectURL(file);
  video.src = url;
  await video.play();
  resizeCanvas(video.videoWidth, video.videoHeight);
  await createDetector();
  running = true;
  loop();
}

exportJsonBtn.onclick = () => {
  const blob = new Blob([JSON.stringify(allDetections, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'detections.json';
  a.click();
};

useWebcamBtn.onclick = startWebcam;
imageInput.onchange = (e) => e.target.files[0] && handleImage(e.target.files[0]);
videoInput.onchange = (e) => e.target.files[0] && handleVideo(e.target.files[0]);