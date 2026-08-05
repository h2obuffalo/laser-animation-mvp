# Laser Animation MVP v3

Browser-based air-dancer motion capture and retargeting for conservative LaserOS SVG experiments.

## Run

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`, load a local video, seek to a clear frame, drag a box around the intended air dancer, confirm the mask, then process and export.

The browser imports JSZip from a CDN. Video remains local.

## v3 pipeline

```text
video -> user-selected ROI -> bounded colour mask tracking -> reusable motion rig -> Magic air dancer puppet -> RGB SVG frames
```

The implementation uses a clearly labelled local ROI colour-model fallback, not SAM 2. It follows the previous box, reports missing/border-touch masks, and avoids selecting the largest component across the full frame.

SAM 2.1 was researched but not added because its official implementation requires Python 3.10+, PyTorch 2.5.1+, checkpoints, and normally a CUDA-capable local setup. The official video predictor supports box/point prompting followed by propagation, so it remains a suitable future optional backend rather than a hidden dependency.

## Output

```text
laser-animation/
  frames/frame_0000.svg
  frames/frame_0001.svg
  motion.json
  model.json
  manifest.json
```

`motion.json` is independent of rendering. The built-in model uses stable semantic joints, stable path ordering, two body edges, outlined arms, head/face, base, one flow line, coherent RGB palettes, and short deterministic head/hand trails.

## Laser constraints

Exports use a transparent background, no fills, no gradients, no JavaScript, rounded joins, and solid per-path RGB strokes. Preview opacity is not exported. Trails are removed first when the configured SVG point budget is exceeded, followed by decorative paths; body and arms are preserved last.

No current official LaserOS source located during this implementation provided a dependable numeric SVG control-point limit or a guarantee for opacity/gradient handling. The app therefore records this uncertainty in `manifest.json`, treats SVG vertices as different from scanner points, defaults to a conservative 240-vertex budget, and warns that interpolation, corner dwell, blanking, and colour changes can add scanner points. Validate every export in LaserOS at safe power before projection.

## Local checks

```bash
npm run check
npm test
```

## Known limitations

- Colour tracking works best with a distinct, evenly lit subject and fixed camera.
- Occlusion, severe colour changes, and a similarly coloured background can lose the mask.
- Arm extraction is deliberately approximate and tube-specific.
- The legacy person-pose implementation remains in the parent branch; the v3 UI labels it but does not process it.
- No direct LaserCube control, streaming, cloud upload, manual mask painting, or multi-object tracking.
