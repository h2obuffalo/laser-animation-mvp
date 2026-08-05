import test from "node:test";
import assert from "node:assert/strict";
import {
  airDancerLandmarksToStrokes,
  extractAirDancerLandmarks,
  extractForegroundOutline,
} from "../src/air-dancer.js";
import {
  countPoints,
  landmarksToStrokes,
  mapLandmarkToViewBox,
  playbackFrameIndex,
  smoothLandmarks,
  svgForFrame,
} from "../src/laser.js";

function syntheticAirDancer() {
  const width = 80;
  const height = 120;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = 20;
    data[index * 4 + 1] = 20;
    data[index * 4 + 2] = 20;
    data[index * 4 + 3] = 255;
  }
  const paint = (x, y) => {
    const offset = (y * width + x) * 4;
    data[offset] = 240;
    data[offset + 1] = 35;
    data[offset + 2] = 25;
  };
  for (let y = 12; y < 110; y += 1) {
    const centre = 40 + Math.round(Math.sin(y / 13) * 4);
    for (let x = centre - 5; x <= centre + 5; x += 1) paint(x, y);
  }
  for (let x = 16; x <= 64; x += 1) {
    const y = 42 + Math.round(Math.abs(x - 40) * 0.18);
    for (let yy = y - 2; yy <= y + 2; yy += 1) paint(x, yy);
  }
  return { data, width, height };
}

test("maps a landscape video into a centred square viewBox", () => {
  const topLeft = mapLandmarkToViewBox({ x: 0, y: 0, visibility: 1 }, 1920, 1080);
  const bottomRight = mapLandmarkToViewBox({ x: 1, y: 1, visibility: 1 }, 1920, 1080);
  assert.equal(topLeft.x, 0);
  assert.equal(bottomRight.x, 1000);
  assert.ok(topLeft.y > 0);
  assert.ok(bottomRight.y < 1000);
  assert.equal(Math.round(topLeft.y + bottomRight.y), 1000);
});

test("smooths landmarks towards the new frame", () => {
  const previous = [{ x: 0, y: 0, visibility: 1 }];
  const current = [{ x: 100, y: 50, visibility: 0.9 }];
  assert.deepEqual(smoothLandmarks(previous, current, 0.75), [{ x: 25, y: 12.5, visibility: 0.9 }]);
});

test("splits chains where landmark visibility is too low", () => {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 10, y: 10, visibility: 1 }));
  landmarks[13] = { x: 10, y: 10, visibility: 0.1 };
  const strokes = landmarksToStrokes(landmarks, 0.5);
  assert.ok(strokes.length >= 3);
  assert.ok(strokes.every((stroke) => stroke.length >= 2));
});

test("generates LaserOS-friendly SVG polylines", () => {
  const strokes = [[{ x: 1.2345, y: 2.3456 }, { x: 3.4567, y: 4.5678 }]];
  const svg = svgForFrame(strokes, { frame: 7, timeSeconds: 0.5 });
  assert.match(svg, /viewBox="0 0 1000 1000"/);
  assert.match(svg, /data-frame="7"/);
  assert.match(svg, /points="1.23,2.35 3.46,4.57"/);
  assert.equal(countPoints(strokes), 2);
});

test("playback index stops exactly at the frame boundary", () => {
  assert.equal(playbackFrameIndex(0, 15, 630), 0);
  assert.equal(playbackFrameIndex(41999, 15, 630), 629);
  assert.equal(playbackFrameIndex(42000, 15, 630), null);
  assert.equal(playbackFrameIndex(0, 15, 0), null);
});

test("extracts a humanoid air-dancer figure from a coloured silhouette", () => {
  const landmarks = extractAirDancerLandmarks(syntheticAirDancer(), { sensitivity: 0.55 });
  assert.equal(landmarks.length, 10);
  const strokes = airDancerLandmarksToStrokes(landmarks);
  assert.equal(strokes.length, 4);
  assert.ok(countPoints(strokes) >= 17);
});

test("extracts a closed, point-limited outline from the tracked silhouette", () => {
  const outline = extractForegroundOutline(syntheticAirDancer(), {
    sensitivity: 0.55,
    pointCount: 32,
  });
  assert.equal(outline.length, 32);
  assert.deepEqual(outline[0], outline.at(-1));
  assert.ok(Math.min(...outline.map((point) => point.x)) < 350);
  assert.ok(Math.max(...outline.map((point) => point.x)) > 650);
  assert.equal(countPoints([outline]), 32);
});
