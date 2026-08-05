import { clamp, mapLandmarkToViewBox } from "./laser.js";

const LANDMARK = Object.freeze({
  TOP: 0,
  NECK: 1,
  SHOULDER: 2,
  LEFT_HAND: 3,
  RIGHT_HAND: 4,
  MID_BODY: 5,
  LOWER_BODY: 6,
  BASE: 7,
  LEFT_FOOT: 8,
  RIGHT_FOOT: 9,
});

function pixelScore(data, offset, background) {
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum;
  const colourDistance = Math.hypot(
    red - background.red,
    green - background.green,
    blue - background.blue,
  ) / 441.673;
  return saturation * 0.58 + colourDistance * 0.72;
}

function estimateBorderColour(data, width, height) {
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  const border = Math.max(1, Math.round(Math.min(width, height) * 0.04));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= border && x < width - border && y >= border && y < height - border) continue;
      const offset = (y * width + x) * 4;
      red += data[offset];
      green += data[offset + 1];
      blue += data[offset + 2];
      count += 1;
    }
  }

  return { red: red / count, green: green / count, blue: blue / count };
}

function buildMask(imageData, sensitivity) {
  const { data, width, height } = imageData;
  const background = estimateBorderColour(data, width, height);
  const threshold = 0.72 - clamp(sensitivity, 0, 1) * 0.48;
  const mask = new Uint8Array(width * height);

  for (let index = 0; index < mask.length; index += 1) {
    if (data[index * 4 + 3] < 64) continue;
    if (pixelScore(data, index * 4, background) >= threshold) mask[index] = 1;
  }

  return mask;
}

function dilate(mask, width, height) {
  const output = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          output[(y + offsetY) * width + x + offsetX] = 1;
        }
      }
    }
  }
  return output;
}

function largestVerticalComponent(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let best = null;

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let read = 0;
    let write = 0;
    let area = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let borderTouches = 0;
    const pixels = [];
    queue[write++] = start;
    visited[start] = 1;

    while (read < write) {
      const index = queue[read++];
      const x = index % width;
      const y = Math.floor(index / width);
      pixels.push(index);
      area += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) borderTouches += 1;

      const neighbours = [index - 1, index + 1, index - width, index + width];
      for (const neighbour of neighbours) {
        if (neighbour < 0 || neighbour >= mask.length || visited[neighbour] || !mask[neighbour]) continue;
        const neighbourX = neighbour % width;
        if (Math.abs(neighbourX - x) > 1) continue;
        visited[neighbour] = 1;
        queue[write++] = neighbour;
      }
    }

    const verticalSpan = maxY - minY + 1;
    const horizontalSpan = maxX - minX + 1;
    if (area < 24 || verticalSpan < height * 0.16) continue;
    const borderPenalty = 1 + borderTouches / Math.max(1, area) * 8;
    const shapeBonus = 0.6 + verticalSpan / Math.max(1, horizontalSpan);
    const score = area * verticalSpan * shapeBonus / borderPenalty;
    if (!best || score > best.score) {
      best = { pixels, area, minX, maxX, minY, maxY, verticalSpan, horizontalSpan, score };
    }
  }

  return best;
}

function xAtBand(componentMask, width, height, targetY, radius) {
  let weightedX = 0;
  let count = 0;
  const startY = Math.max(0, Math.floor(targetY - radius));
  const endY = Math.min(height - 1, Math.ceil(targetY + radius));
  for (let y = startY; y <= endY; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!componentMask[y * width + x]) continue;
      weightedX += x;
      count += 1;
    }
  }
  return count ? weightedX / count : null;
}

function centrelineAtY(centres, y) {
  let nearest = centres[0];
  for (const centre of centres) {
    if (Math.abs(centre.y - y) < Math.abs(nearest.y - y)) nearest = centre;
  }
  return nearest.x;
}

function extremity(component, componentMask, width, centres, direction) {
  const shoulderY = centres[2].y;
  const lowerLimit = component.minY + component.verticalSpan * 0.68;
  let best = null;
  for (const index of component.pixels) {
    const x = index % width;
    const y = Math.floor(index / width);
    if (!componentMask[index] || y < component.minY + component.verticalSpan * 0.08 || y > lowerLimit) continue;
    const centreX = centrelineAtY(centres, y);
    const horizontalDistance = direction < 0 ? centreX - x : x - centreX;
    if (horizontalDistance <= 0) continue;
    const verticalPenalty = Math.abs(y - shoulderY) * 0.12;
    const score = horizontalDistance - verticalPenalty;
    if (!best || score > best.score) best = { x, y, score, distance: horizontalDistance };
  }
  return best;
}

function toViewBox(point, width, height, visibility = 1) {
  return mapLandmarkToViewBox({
    x: point.x / Math.max(1, width - 1),
    y: point.y / Math.max(1, height - 1),
    visibility,
  }, width, height);
}

export function extractAirDancerLandmarks(imageData, options = {}) {
  if (!imageData || !imageData.data || imageData.width <= 0 || imageData.height <= 0) return null;
  const sensitivity = clamp(options.sensitivity ?? 0.55, 0, 1);
  const { width, height } = imageData;
  const mask = dilate(buildMask(imageData, sensitivity), width, height);
  const component = largestVerticalComponent(mask, width, height);
  if (!component) return null;

  const componentMask = new Uint8Array(mask.length);
  for (const index of component.pixels) componentMask[index] = 1;
  const fractions = [0.03, 0.16, 0.3, 0.5, 0.7, 0.92];
  const radius = Math.max(1, Math.round(component.verticalSpan * 0.035));
  const centres = fractions.map((fraction) => {
    const y = component.minY + component.verticalSpan * fraction;
    const x = xAtBand(componentMask, width, height, y, radius);
    return { x: x ?? (component.minX + component.maxX) / 2, y };
  });

  const left = extremity(component, componentMask, width, centres, -1);
  const right = extremity(component, componentMask, width, centres, 1);
  const shoulder = centres[2];
  const minimumArmReach = Math.max(2, component.horizontalSpan * 0.13);
  const leftHand = left && left.distance >= minimumArmReach ? left : shoulder;
  const rightHand = right && right.distance >= minimumArmReach ? right : shoulder;
  const baseHalfWidth = Math.max(2, component.horizontalSpan * 0.12);
  const base = centres[5];
  const confidence = clamp(
    component.area / Math.max(1, width * height * 0.08),
    0.25,
    1,
  );

  const points = [
    centres[0],
    centres[1],
    shoulder,
    leftHand,
    rightHand,
    centres[3],
    centres[4],
    base,
    { x: base.x - baseHalfWidth, y: component.maxY },
    { x: base.x + baseHalfWidth, y: component.maxY },
  ];

  return points.map((point) => toViewBox(point, width, height, confidence));
}

export function airDancerLandmarksToStrokes(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 10) return [];
  const body = [
    landmarks[LANDMARK.TOP],
    landmarks[LANDMARK.NECK],
    landmarks[LANDMARK.SHOULDER],
    landmarks[LANDMARK.MID_BODY],
    landmarks[LANDMARK.LOWER_BODY],
    landmarks[LANDMARK.BASE],
  ];
  const arms = [
    landmarks[LANDMARK.LEFT_HAND],
    landmarks[LANDMARK.SHOULDER],
    landmarks[LANDMARK.RIGHT_HAND],
  ];
  const legs = [
    landmarks[LANDMARK.LEFT_FOOT],
    landmarks[LANDMARK.BASE],
    landmarks[LANDMARK.RIGHT_FOOT],
  ];
  const head = landmarks[LANDMARK.TOP];
  const neck = landmarks[LANDMARK.NECK];
  const radius = Math.max(10, Math.min(38, Math.hypot(head.x - neck.x, head.y - neck.y) * 0.34));
  const headLoop = [
    { x: head.x - radius, y: head.y },
    { x: head.x, y: head.y - radius },
    { x: head.x + radius, y: head.y },
    { x: head.x, y: head.y + radius },
    { x: head.x - radius, y: head.y },
  ];
  return [body, arms, legs, headLoop].filter((stroke) => stroke.every(Boolean));
}
