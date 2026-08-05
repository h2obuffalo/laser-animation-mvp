# Laser Animation MVP

A small browser app that converts a single-person video into a simplified SVG frame sequence intended for LaserOS experimentation.

The MVP keeps the source video in the browser. It uses MediaPipe Pose Landmarker to track a body, applies temporal smoothing, turns selected landmarks into a small set of continuous laser paths, previews the result, and exports numbered SVG files in a ZIP archive.

## Run it

No install or build step is required.

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in a current Chrome, Edge, Firefox, or Safari browser. An internet connection is required while the app loads the MediaPipe WebAssembly files, pose model, and JSZip module from their CDNs.

## Suggested test footage

Use a short clip with:

- one person;
- the full body visible;
- a fixed camera;
- clear lighting and background separation;
- deliberate, readable movement;
- no rapid cuts.

The MVP processes up to the first 30 seconds. Ten seconds is a useful first test.

## Output

The downloaded archive contains:

```text
laser-animation/
  frame_0000.svg
  frame_0001.svg
  ...
  manifest.json
```

Each frame uses a `0 0 1000 1000` viewBox, white strokes, rounded joins, and no fills. The current body renderer normally stays well below 30 source points per frame before any scanner interpolation performed by LaserOS.

## Checks

```bash
npm run check
npm test
```

The app itself has no npm dependencies. Node is used only for syntax checks and tests of the path-generation functions.

## Scope and safety

This is an offline authoring prototype. It does not connect to LaserCube hardware or emit real-time laser commands. Inspect imported frames in LaserOS and validate scan quality before using a projector.

LaserCube devices are Class 4 lasers. Use a controlled terminated projection area, prevent direct or reflected audience exposure, and follow the projector and LaserOS safety guidance.

## Deliberate non-goals

- direct projector control;
- multi-person tracking;
- automatic silhouette tracing;
- optical-flow trails;
- colour animation;
- scanner timing or blanking simulation;
- arbitrary long-form video processing.
