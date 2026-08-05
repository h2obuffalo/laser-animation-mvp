# Laser Animation MVP

A browser app that converts movement from a person, air dancer, or foreground object into simplified SVG frame sequences intended for LaserOS experimentation.

The source video stays in the browser. The app can use MediaPipe Pose Landmarker for a real person, or foreground colour/background separation for an air dancer or other prominent subject. It applies temporal smoothing, previews laser paths, and exports numbered SVG files in a ZIP archive.

## Run it

No install or build step is required.

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in a current Chrome, Edge, Firefox, or Safari browser. An internet connection is required while the app loads the MediaPipe WebAssembly files, pose model, and JSZip module from their CDNs.

## Tracking and representation modes

### Person pose

Uses MediaPipe human landmarks and exports a low-point skeleton. Use a fully visible person with deliberate movement.

### Foreground / air dancer silhouette

Finds the largest colourful foreground subject against the estimated border/background colour. It offers two representations:

- **Humanoid abstraction:** centreline, arms, base, and head.
- **Simplified subject outline:** a closed silhouette envelope that follows the subject's changing left and right edges.

The outline detail control limits each frame to 12-80 points. Start around 24-32 points for LaserCube testing and increase only when the added shape detail is useful.

This foreground mode can also work with a person or object when the camera is fixed and the subject is clearly separated from a relatively consistent background.

## Suggested test footage

Use a short clip with:

- one prominent subject;
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

Each frame uses a `0 0 1000 1000` viewBox, white strokes, rounded joins, no fill, and a transparent background. The manifest records the tracking mode and selected representation.

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
- semantic object recognition;
- optical-flow trails;
- colour animation;
- scanner timing or blanking simulation;
- arbitrary long-form video processing.
