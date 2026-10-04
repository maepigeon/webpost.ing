# Animator (phase 1: flipbook)

A drawing and flip-book animation tool that runs in the browser and saves on
the device. Design and reasons: `guide/animator-design.md` (architecture B:
native web app, framework-free engine, React shell). The route is added by the
app: `/animator` lazy-loads the default export of `AnimatorPage.jsx`.

## What exists

`engine/` is plain JavaScript with no React. Everything except the canvas
drawing is unit-tested (`client/src/test/animator*.test.js`).

| File | What it does |
|---|---|
| `project.js` | The document: frames (with `hold`), layers, cels. Pure add / duplicate / delete / reorder / rename / opacity / fps / resize that return new state. Limits (4096 px, 60 fps, 24 layers, 2400 frames). Metadata in and out. |
| `history.js` | Undo and redo: patch entries (one cel's changed rectangle, before and after) and state entries (project shape before and after). Capped at 64 MB. |
| `session.js` | One object the UI subscribes to: project, selected frame and layer, history, strokes, fill. |
| `bitmap.js` | Cel bitmaps: `canvasBitmap` (the app) and `rawBitmap` (tests), same interface. |
| `brush.js` | Stamp spacing and interpolation, smoothing through curves, pressure to size and opacity, `Stroke` (round soft brush, hard pixel brush, eraser), bucket fill with tolerance. Strokes draw into a buffer and join the cel on pen-up, so opacity is even. |
| `compositor.js` | Layers with opacity, onion skin (0 to 3 each side, red before and blue after, fading), checkerboard, zoom and pan maths, eyedropper sampling, thumbnails. |
| `playback.js` | rAF player with a time accumulator, per-frame hold, loop on or off. |
| `storage.js` | IndexedDB projects (metadata plus one PNG per cel, only changed cels rewritten), debounced autosave (2 s) and save on page hide. Never throws: `{ ok, error }`. |
| `exporter.js` | WebM (or MP4 where the recorder makes it) via `MediaRecorder`, PNG of the current frame, project zip. |
| `zip.js` | A small zip writer (stored, no compression) so the zip export needs no dependency. |

`AnimatorPage.jsx` and `components/` are the interface: top bar (name, New, Open,
Size, Undo, Redo, Export, save status), left tools, right layers, bottom
filmstrip with transport. It reuses `GridButton`, `GridStepper`, `ColourPicker`
and `PixelIcon` from the grid editor. Keys: B brush, P pixel, E eraser, G fill,
I eyedropper, H move, `[` `]` size, `,` `.` frame, N new frame, Space play or
pause (hold Space and drag to move the view), Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z
redo. A pen is detected from Pointer Events; while a pen is in use, touch moves
and zooms instead of drawing. On phones the tool and layer panels are drawers.

## Deliberately not there yet

- Timeline tracks, clips, keyframes, easing, performing (phase 2).
- Audio tracks (phase 2).
- Upload to the site and the `animation` post block (see the contract below).
- 3D reference viewer (phase 3).
- MP4 through WebCodecs: `exporter.js` detects `VideoEncoder` and has a marked
  TODO (`exportMp4WebCodecs`). Video export today is real-time `MediaRecorder`,
  so a 6 s animation takes 6 s. Safari produces MP4 here; Chrome and Firefox WebM.
- GIF and APNG export, blend modes, selection and transform tools, custom brushes.
- Tiling and compressed layers: a cel is a full canvas, so 4096 px canvases cost
  64 MB per cel, plus a same-size stroke buffer. The New dialog warns above 2048.
- Project import (the zip can be exported, not yet opened again).
- Per-pointer-type brush curves, tilt, and predicted events.

## Contract for upload (from the design doc, section 4)

The animator is a module with a boundary: commands in, events out. It never
calls the site API and never sees cookies. The page owns auth, quotas and
uploads. Every message has `v: 1` and `type`; unknown types are ignored.

Page to animator:

```json
{ "v":1, "id":"7",  "type":"open", "project":{"source":"local","id":"p_9f2"} }
{ "v":1, "id":"10", "type":"requestSave" }
{ "v":1, "id":"11", "type":"requestExport", "format":"webm", "range":"all", "maxBytes":52428800 }
{ "v":1, "id":"12", "type":"setLimits", "maxCanvasPx":16777216, "maxLayers":24, "maxFrames":2400 }
{ "v":1, "id":"9",  "type":"theme", "tokens":{"bg":"#f2f2f2","fg":"#111","dark":false} }
```

Animator to page:

```json
{ "v":1, "type":"ready", "caps":{"recorder":"video/webm;codecs=vp9","webcodecs":true} }
{ "v":1, "type":"dirty", "dirty":true }
{ "v":1, "type":"saved", "id":"p_9f2", "rev":31 }
{ "v":1, "type":"exportProgress", "id":"11", "done":0.42 }
{ "v":1, "type":"exportDone", "id":"11", "file":"<Blob>", "mime":"video/webm", "durationMs":6400, "width":1080, "height":1920 }
{ "v":1, "type":"requestUpload", "kind":"video", "file":"<Blob>", "project":"<Blob|null>", "meta":{"title":"","fps":12} }
{ "v":1, "type":"error", "code":"quota_canvas", "message":"..." }
{ "v":1, "type":"close", "reason":"user" }
```

Upload flow: the animator emits `requestUpload`; the page shows its own dialog
(title, visibility, quota), calls the upload API with the user's cookie, and
replies `{ "type":"uploadResult", "ok":true, "url":"..." }`; the animator only
shows the result.

Where it fits in this code: `session.js` already has the state the page needs
(`getState().project`, `isDirty`, `revision`), `exporter.js` returns Blobs
(`recordVideo`, `exportFramePng`, `exportProjectZip`) and `storage.js` has the
project ids. A thin `bridge.js` that maps the messages above onto those calls
(`window.postMessage` for an iframe, or a plain callback object while the
animator is a route) is the missing piece. The server side (resumable chunks,
header verification, `Range` serving) is described in the design doc, sections
5 to 7.

## Needs a browser to check

Pen pressure and coalesced events on real hardware, drawing speed at 2048 px
and 4096 px, onion skin cost with large canvases, the export (recorder
availability, file plays elsewhere), drag and drop reordering with touch
(the move buttons are the touch route), IndexedDB behaviour in private windows.
