const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function normaliseBox(box, width, height) {
  const left = Math.floor(Math.min(box.x1, box.x2));
  const right = Math.ceil(Math.max(box.x1, box.x2));
  const top = Math.floor(Math.min(box.y1, box.y2));
  const bottom = Math.ceil(Math.max(box.y1, box.y2));
  const x1 = clamp(left, 0, width - 1);
  const y1 = clamp(top, 0, height - 1);
  return {
    x1,
    y1,
    x2: clamp(right, x1 + 1, width),
    y2: clamp(bottom, y1 + 1, height),
  };
}

export function learnColourModel(imageData, box) {
  const bounded = normaliseBox(box, imageData.width, imageData.height);
  let red = 0;
  let green = 0;
  let blue = 0;
  let samples = 0;

  for (let y = bounded.y1; y < bounded.y2; y += 2) {
    for (let x = bounded.x1; x < bounded.x2; x += 2) {
      const index = (y * imageData.width + x) * 4;
      red += imageData.data[index];
      green += imageData.data[index + 1];
      blue += imageData.data[index + 2];
      samples += 1;
    }
  }

  return {
    red: red / samples,
    green: green / samples,
    blue: blue / samples,
    tolerance: 72,
  };
}

export function trackSelectedSubject(imageData, model, previousBox) {
  const { width, height, data } = imageData;
  const bounded = normaliseBox(previousBox, width, height);
  const padX = Math.round((bounded.x2 - bounded.x1) * 0.45);
  const padY = Math.round((bounded.y2 - bounded.y1) * 0.25);
  const search = normaliseBox({
    x1: bounded.x1 - padX,
    y1: bounded.y1 - padY,
    x2: bounded.x2 + padX,
    y2: bounded.y2 + padY,
  }, width, height);
  const mask = new Uint8Array(width * height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let matched = 0;

  for (let y = search.y1; y < search.y2; y += 1) {
    for (let x = search.x1; x < search.x2; x += 1) {
      const index = (y * width + x) * 4;
      const distance = Math.hypot(
        data[index] - model.red,
        data[index + 1] - model.green,
        data[index + 2] - model.blue,
      );
      if (distance <= model.tolerance) {
        mask[y * width + x] = 1;
        matched += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (matched < 20) {
    return { mask, box: bounded, confidence: 0, reason: 'missing-mask' };
  }

  const touchesBorder = minX <= 1 || minY <= 1 || maxX >= width - 2 || maxY >= height - 2;
  const box = { x1: minX, y1: minY, x2: maxX + 1, y2: maxY + 1 };
  return {
    mask,
    box,
    confidence: touchesBorder
      ? 0.35
      : clamp(matched / ((bounded.x2 - bounded.x1) * (bounded.y2 - bounded.y1)), 0, 1),
    reason: touchesBorder ? 'border-touch' : null,
  };
}
