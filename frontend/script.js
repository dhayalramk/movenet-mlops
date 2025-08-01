const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
  return new Promise((resolve) => {
    video.onloadedmetadata = () => resolve(video);
  });
}

async function runPoseDetection() {
  await setupCamera();
  const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
  });

  const detect = async () => {
    const poses = await detector.estimatePoses(video);
    ctx.drawImage(video, 0, 0);
    if (poses.length > 0) {
      poses[0].keypoints.forEach((k) => {
        if (k.score > 0.3) {
          ctx.beginPath();
          ctx.arc(k.x, k.y, 5, 0, 2 * Math.PI);
          ctx.fillStyle = 'red';
          ctx.fill();
        }
      });
    }
    requestAnimationFrame(detect);
  };
  detect();
}

runPoseDetection();
