import test from 'node:test';
import assert from 'node:assert/strict';
import {
  learnColourModel,
  normaliseBox,
  trackSelectedSubject,
} from '../src/subject-tracker.js';

function imageWithSubject(width = 24, height = 24) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const subject = x >= 6 && x < 14 && y >= 6 && y < 14;
      data[index] = subject ? 230 : 18;
      data[index + 1] = subject ? 65 : 20;
      data[index + 2] = subject ? 35 : 24;
      data[index + 3] = 255;
    }
  }
  return { width, height, data };
}

test('fractional canvas box is converted to integer pixel bounds', () => {
  assert.deepEqual(
    normaliseBox({ x1: 6.2, y1: 6.4, x2: 13.8, y2: 13.6 }, 24, 24),
    { x1: 6, y1: 6, x2: 14, y2: 14 },
  );
});

test('fractional subject selection produces a usable colour model and mask', () => {
  const image = imageWithSubject();
  const box = { x1: 6.2, y1: 6.4, x2: 13.8, y2: 13.6 };
  const model = learnColourModel(image, box);

  assert.ok(Number.isFinite(model.red));
  assert.ok(Number.isFinite(model.green));
  assert.ok(Number.isFinite(model.blue));

  const tracked = trackSelectedSubject(image, model, box);
  assert.ok(tracked.confidence > 0);
  assert.ok(tracked.mask.some(Boolean));
});
