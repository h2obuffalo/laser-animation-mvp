export const VIEWBOX_SIZE = 1000;

const LANDMARK = Object.freeze({
  NOSE: 0,
  LEFT_EYE: 2,
  RIGHT_EYE: 5,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
});

export const LASER_CHAINS = Object.freeze([
  Object.freeze([
    LANDMARK.LEFT_WRIST,
    LANDMARK.LEFT_ELBOW,
    LANDMARK.LEFT_SHOULDER,
    LANDMARK.RIGHT_SHOULDER,
    LANDMARK.RIGHT_ELBOW,
    LANDMARK.RIGHT_WRIST,
  ]),
  Object.freeze([
    LANDMARK.LEFT_SHOULDER,
    LANDMARK.LEFT_HIP,
    LANDMARK.RIGHT_HIP,
    LANDMARK.RIGHT_SHOULDER,
    LANDMARK.LEFT_SHOULDER,
  ]),
  Object.freeze([
    LANDMARK.LEFT_ANKLE,
    LANDMARK.LEFT_KNEE,
    LANDMARK.LEFT_HIP,
    LANDMARK.RIGHT_HIP,
    LANDMARK.RIGHT_KNEE,
    LANDMARK.RIGHT_ANKLE,
  ]),
  Object.freeze([
    LANDMARK.LEFT_EAR,
    LANDMARK.LEFT_EYE,
    LANDMARK.NOSE,
    LANDMARK.RIGHT_EYE,
    LANDMARK.RIGHT_EAR,
  ]),
]);

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function mapLandmarkToViewBox(landmark, videoWidth, videoHeight) {
  if (!landmark || videoWidth <= 0 || videoHeight <= 0) return null;

  const aspect = videoWidth / videoHeight;
  let width = VIEWBOX_SIZE;
  let height = VIEWBOX_SIZE;
  let offsetX = 0;
  let offsetY = 0;

  if (aspect >= 1) {
    height = VIEWBOX_SIZE / aspect;
    offsetY = (VIEWBOX_SIZE - height) / 2;
  } else {
    width = VIEWBOX_SIZE * aspect;
    offsetX = (VIEWBOX_SIZE - width) / 2;
  }

  return {
    x: offsetX + clamp(landmark.x, 0, 1) * width,
    y: offsetY + clamp(landmark.y, 0, 1) * height,
    visibility: landmark.visibility ?? 1,
  };
}

export function smoothLandmarks(previous, current, smoothing) {
  const amount = clamp(smoothing, 0, 0.95);
  if (!previous) return current.map((point) => (point ? { ...point } : null));

  return current.map((point, index) => {
    const oldPoint = previous[index];
    if (!point) return oldPoint ? { ...oldPoint } : null;
    if (!oldPoint) return { ...point };
    return {
      x: oldPoint.x * amount + point.x * (1 - amount),
      y: oldPoint.y * amount + point.y * (1 - amount),
      visibility: point.visibility,
    };
  });
}

function splitVisibleChain(chain, landmarks, minimumVisibility) {
  const segments = [];
  let currentSegment = [];
  for (const index of chain) {
    const point = landmarks[index];
    if (point && point.visibility >= minimumVisibility) {
      currentSegment.push({ x: point.x, y: point.y });
      continue;
    }
    if (currentSegment.length >= 2) segments.push(currentSegment);
    currentSegment = [];
  }
  if (currentSegment.length >= 2) segments.push(currentSegment);
  return segments;
}

export function landmarksToStrokes(landmarks, minimumVisibility = 0.5) {
  if (!Array.isArray(landmarks) || landmarks.length === 0) return [];
  return LASER_CHAINS.flatMap((chain) => splitVisibleChain(chain, landmarks, minimumVisibility));
}

export function countPoints(strokes) {
  return strokes.reduce((total, stroke) => total + stroke.length, 0);
}

export function playbackFrameIndex(elapsedMilliseconds, framesPerSecond, frameCount) {
  if (!Number.isFinite(elapsedMilliseconds) || elapsedMilliseconds < 0 || !Number.isFinite(framesPerSecond) || framesPerSecond <= 0 || !Number.isInteger(frameCount) || frameCount <= 0) return null;
  const index = Math.floor((elapsedMilliseconds / 1000) * framesPerSecond);
  return index >= frameCount ? null : index;
}

function roundCoordinate(value) {
  return Number(value.toFixed(2));
}

export function svgForFrame(strokes, metadata = {}) {
  const polylines = strokes
    .filter((stroke) => stroke.length >= 2)
    .map((stroke) => {
      const points = stroke.map((point) => `${roundCoordinate(point.x)},${roundCoordinate(point.y)}`).join(" ");
      return `  <polyline points="${points}" />`;
    })
    .join("\n");
  const frame = Number.isFinite(metadata.frame) ? metadata.frame : 0;
  const timeSeconds = Number.isFinite(metadata.timeSeconds) ? metadata.timeSeconds : 0;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}" width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" data-frame="${frame}" data-time="${timeSeconds.toFixed(3)}">`,
    '  <g fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">',
    polylines,
    "  </g>",
    "</svg>",
    "",
  ].join("\n");
}
