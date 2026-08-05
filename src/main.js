import { FilesetResolver, PoseLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm";
import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
import { VIEWBOX_SIZE, countPoints, landmarksToStrokes, mapLandmarkToViewBox, smoothLandmarks, svgForFrame } from "./laser.js";

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MAX_DURATION_SECONDS = 30;

const elements = Object.fromEntries([
  "modelStatus", "videoInput", "sourceVideo", "processButton", "playButton",
  "downloadButton", "fpsInput", "fpsValue", "smoothingInput", "smoothingValue",
  "visibilityInput", "visibilityValue", "progressBar", "progressText", "videoMeta",
  "frameMeta", "laserCanvas",
].map((id) => [id, document.querySelector(`#${id}`)]));
const context = elements.laserCanvas.getContext("2d");
const state = { poseLandmarker: null, videoUrl: null, frames: [], processing: false, playbackHandle: null, playbackStartedAt: 0 };

function setStatus(text, type = "ready") {
  elements.modelStatus.textContent = text;
  elements.modelStatus.dataset.state = type;
}

function setProgress(value, text) {
  elements.progressBar.value = value;
  elements.progressText.textContent = text;
}

function drawEmptyPreview(message) {
  context.clearRect(0, 0, VIEWBOX_SIZE, VIEWBOX_SIZE);
  context.fillStyle = "#05070a";
  context.fillRect(0, 0, VIEWBOX_SIZE, VIEWBOX_SIZE);
  context.fillStyle = "#6f7c87";
  context.font = "36px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText(message, VIEWBOX_SIZE / 2, VIEWBOX_SIZE / 2);
}

function drawFrame(frame) {
  context.clearRect(0, 0, VIEWBOX_SIZE, VIEWBOX_SIZE);
  context.fillStyle = "#020406";
  context.fillRect(0, 0, VIEWBOX_SIZE, VIEWBOX_SIZE);
  context.strokeStyle = "#f3fff8";
  context.shadowColor = "#7dffb2";
  context.shadowBlur = 18;
  context.lineWidth = 5;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const stroke of frame.strokes) {
    if (stroke.length < 2) continue;
    context.beginPath();
    context.moveTo(stroke[0].x, stroke[0].y);
    for (const point of stroke.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
  }
  context.shadowBlur = 0;
}

function stopPlayback() {
  if (state.playbackHandle !== null) cancelAnimationFrame(state.playbackHandle);
  state.playbackHandle = null;
  elements.playButton.textContent = "Play result";
}

function resetOutput() {
  state.frames = [];
  stopPlayback();
  elements.playButton.disabled = true;
  elements.downloadButton.disabled = true;
  elements.frameMeta.textContent = "No frames generated";
  drawEmptyPreview("Process a video to generate laser paths");
}

function updateControlLabels() {
  elements.fpsValue.value = `${elements.fpsInput.value} fps`;
  elements.smoothingValue.value = `${elements.smoothingInput.value}%`;
  elements.visibilityValue.value = `${elements.visibilityInput.value}%`;
}

function waitForEvent(target, eventName) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener("error", onError);
    };
    const onEvent = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error(`Video failed while waiting for ${eventName}.`)); };
    target.addEventListener(eventName, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

async function seekVideo(timeSeconds) {
  const video = elements.sourceVideo;
  const clampedTime = Math.min(Math.max(timeSeconds, 0), video.duration);
  if (Math.abs(video.currentTime - clampedTime) < 0.001) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return;
  }
  const seeked = waitForEvent(video, "seeked");
  video.currentTime = clampedTime;
  await seeked;
}

async function createPoseLandmarker(delegate) {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

async function initialiseModel() {
  try {
    state.poseLandmarker = await createPoseLandmarker("GPU");
    setStatus("Pose model ready (GPU)");
  } catch (gpuError) {
    console.warn("GPU initialisation failed; falling back to CPU.", gpuError);
    try {
      state.poseLandmarker = await createPoseLandmarker("CPU");
      setStatus("Pose model ready (CPU)");
    } catch (cpuError) {
      console.error(cpuError);
      setStatus("Pose model failed to load", "error");
      setProgress(0, "Check the browser console and internet connection.");
    }
  }
  updateProcessButton();
}

function updateProcessButton() {
  const videoReady = elements.sourceVideo.readyState >= HTMLMediaElement.HAVE_METADATA;
  elements.processButton.disabled = !state.poseLandmarker || !videoReady || state.processing;
}

async function handleVideoSelection(event) {
  const [file] = event.target.files;
  if (!file) return;
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = URL.createObjectURL(file);
  elements.sourceVideo.src = state.videoUrl;
  resetOutput();
  setProgress(0, "Loading video metadata...");
  if (elements.sourceVideo.readyState < HTMLMediaElement.HAVE_METADATA) await waitForEvent(elements.sourceVideo, "loadedmetadata");
  const duration = elements.sourceVideo.duration;
  elements.videoMeta.textContent = `${duration.toFixed(1)} s | ${elements.sourceVideo.videoWidth} x ${elements.sourceVideo.videoHeight}`;
  setProgress(0, duration > MAX_DURATION_SECONDS ? `This MVP processes the first ${MAX_DURATION_SECONDS} seconds.` : "Ready to process.");
  updateProcessButton();
}

function mappedPose(result, video) {
  const pose = result.landmarks?.[0];
  return pose ? pose.map((landmark) => mapLandmarkToViewBox(landmark, video.videoWidth, video.videoHeight)) : null;
}

async function processVideo() {
  if (!state.poseLandmarker || state.processing) return;
  const video = elements.sourceVideo;
  const fps = Number(elements.fpsInput.value);
  const smoothing = Number(elements.smoothingInput.value) / 100;
  const minimumVisibility = Number(elements.visibilityInput.value) / 100;
  const duration = Math.min(video.duration, MAX_DURATION_SECONDS);
  const frameCount = Math.max(1, Math.floor(duration * fps));
  const originalTime = video.currentTime;
  const frames = [];
  let previousLandmarks = null;

  state.processing = true;
  resetOutput();
  updateProcessButton();
  elements.videoInput.disabled = true;
  try {
    video.pause();
    for (let index = 0; index < frameCount; index += 1) {
      const timeSeconds = index / fps;
      await seekVideo(timeSeconds);
      const result = state.poseLandmarker.detectForVideo(video, timeSeconds * 1000);
      const currentLandmarks = mappedPose(result, video);
      let strokes = [];
      if (currentLandmarks) {
        const smoothed = smoothLandmarks(previousLandmarks, currentLandmarks, smoothing);
        previousLandmarks = smoothed;
        strokes = landmarksToStrokes(smoothed, minimumVisibility);
      }
      frames.push({ index, timeSeconds, strokes, pointCount: countPoints(strokes) });
      if (index === 0 || index % 3 === 0 || index === frameCount - 1) {
        drawFrame(frames[index]);
        setProgress((index + 1) / frameCount, `Processing frame ${index + 1} of ${frameCount}...`);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
    state.frames = frames;
    const detectedFrames = frames.filter((frame) => frame.strokes.length > 0).length;
    const maxPoints = Math.max(...frames.map((frame) => frame.pointCount));
    elements.frameMeta.textContent = `${frames.length} frames | max ${maxPoints} points`;
    elements.playButton.disabled = false;
    elements.downloadButton.disabled = detectedFrames === 0;
    drawFrame(frames[0]);
    setProgress(1, `Complete: pose paths found in ${detectedFrames} of ${frames.length} frames.`);
  } catch (error) {
    console.error(error);
    setProgress(0, `Processing failed: ${error.message}`);
  } finally {
    state.processing = false;
    elements.videoInput.disabled = false;
    updateProcessButton();
    await seekVideo(Math.min(originalTime, video.duration));
  }
}

function playbackTick(now) {
  const frameIndex = Math.floor(((now - state.playbackStartedAt) / 1000) * Number(elements.fpsInput.value));
  if (frameIndex >= state.frames.length) {
    stopPlayback();
    drawFrame(state.frames[0]);
    return;
  }
  drawFrame(state.frames[frameIndex]);
  elements.frameMeta.textContent = `Frame ${frameIndex + 1} / ${state.frames.length} | ${state.frames[frameIndex].pointCount} points`;
  state.playbackHandle = requestAnimationFrame(playbackTick);
}

function togglePlayback() {
  if (state.playbackHandle !== null) return stopPlayback();
  if (state.frames.length === 0) return;
  state.playbackStartedAt = performance.now();
  elements.playButton.textContent = "Stop playback";
  state.playbackHandle = requestAnimationFrame(playbackTick);
}

async function downloadZip() {
  if (state.frames.length === 0) return;
  elements.downloadButton.disabled = true;
  setProgress(0, "Building SVG archive...");
  try {
    const zip = new JSZip();
    const folder = zip.folder("laser-animation");
    state.frames.forEach((frame) => {
      const fileName = `frame_${String(frame.index).padStart(4, "0")}.svg`;
      folder.file(fileName, svgForFrame(frame.strokes, { frame: frame.index, timeSeconds: frame.timeSeconds }));
    });
    folder.file("manifest.json", JSON.stringify({
      format: "laser-animation-mvp/v1",
      frameRate: Number(elements.fpsInput.value),
      frameCount: state.frames.length,
      viewBox: [0, 0, VIEWBOX_SIZE, VIEWBOX_SIZE],
      generatedAt: new Date().toISOString(),
      note: "Preview and validate these frames in LaserOS before projector use.",
    }, null, 2));
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" }, (metadata) => setProgress(metadata.percent / 100, `Building archive: ${metadata.percent.toFixed(0)}%`));
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "laser-animation-svg-frames.zip";
    anchor.click();
    URL.revokeObjectURL(url);
    setProgress(1, "SVG archive downloaded.");
  } catch (error) {
    console.error(error);
    setProgress(0, `Export failed: ${error.message}`);
  } finally {
    elements.downloadButton.disabled = false;
  }
}

elements.videoInput.addEventListener("change", handleVideoSelection);
elements.processButton.addEventListener("click", processVideo);
elements.playButton.addEventListener("click", togglePlayback);
elements.downloadButton.addEventListener("click", downloadZip);
for (const input of [elements.fpsInput, elements.smoothingInput, elements.visibilityInput]) input.addEventListener("input", updateControlLabels);
elements.sourceVideo.addEventListener("loadedmetadata", updateProcessButton);
window.addEventListener("beforeunload", () => {
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.poseLandmarker?.close();
});

updateControlLabels();
drawEmptyPreview("Laser preview");
initialiseModel();
