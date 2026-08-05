import test from "node:test";
import assert from "node:assert/strict";
import { countPoints, landmarksToStrokes, mapLandmarkToViewBox, smoothLandmarks, svgForFrame } from "../src/laser.js";

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
