# Animator — design and plan

Status: proposal, 2026-10-03. Nothing is built. The backlog puts this last, so
this document is for deciding, not for starting.

No web search was available while writing. Facts about Godot, browsers and
codecs below are from memory (knowledge to mid-2026). Items marked **[recheck]**
should be confirmed before any money or weeks are spent.

---

## 1. Straight answers

**Is all this doable?** Yes, in stages. A flipbook animator with onion skin,
layers, pressure brushes and an MP4/WebM export is a few weeks of work. A full
"Procreate Dreams" clone (performing, timeline with every kind of track, video
import) is months for one person. Ship the small part first.

**Can Godot show HTML?** No. Godot's web export draws everything into one
`<canvas>`. It cannot put DOM or HTML inside the engine. HTML can sit around the
canvas or on top of it (absolutely positioned), and the page and the engine talk
through `JavaScriptBridge` (Godot side) and a small JS object (page side). So
"the app is a canvas with HTML chrome around it" works. "HTML inside the app"
does not. Since the animator does not need HTML or grids inside it, this is
fine.

**Is "AI compression" realistic?** Not now. Learned video codecs exist in
research, but they need a GPU and have no fast, standard browser decoders. A
viewer's phone cannot play them. Use ordinary codecs:

| Role | Codec / container | Why |
|---|---|---|
| Preferred | AV1 or VP9 in WebM | Small files, royalty-free. AV1 hardware decode is common on recent phones and Macs; software decode otherwise. |
| Fallback | H.264 in MP4 | Plays everywhere, and Safari can always make it. |

Encode in the browser with **WebCodecs** (`VideoEncoder`) and mux with a small
JS/WASM muxer. Where WebCodecs lacks a codec (older Safari, Firefox gaps),
fall back to **ffmpeg.wasm** (slow, large, single thread unless cross-origin
isolated). Support changes fast. **[recheck]** `VideoEncoder` for AV1/VP9/H.264
on Safari (iOS and macOS), Firefox and Android Chrome.

What "AI" can honestly mean later, as optional client-side tools, never in the
delivery path: frame interpolation, upscaling, in-betweening suggestions,
background removal. Small ONNX/WebGPU models, run on the user's device.

**"WebAssembly for decoding and encoding."** Browsers already decode video
natively and fast, through `<video>` and WebCodecs. WASM decoders are only worth
it for formats the browser lacks. WASM is useful for encoding fallback, muxing
and GIF/APNG writing.

---

## 2. What Procreate Dreams does, and what we do

| Feature | v1 | Later | Out of scope |
|---|---|---|---|
| Frame-by-frame flipbook, any frame rate | yes | | |
| Onion skin (before/after, tint, count) | yes | | |
| Playback: play/loop/scrub, fps setting, frame step | yes | | |
| Raster brushes with pressure, eraser, fill, colour picker | yes | | |
| Layers, opacity, visibility, reorder | yes | | |
| Blend modes (multiply, screen, add, overlay) | yes | | |
| Undo/redo | yes | | |
| Any canvas size (to a cap, see 4.3) | yes | | |
| Export MP4/WebM, GIF, APNG, PNG sequence | yes | | |
| Timeline with tracks (clips, trim, hold frames, move) | | yes (phase 2) | |
| Keyframed transform and opacity on a clip | | yes (phase 2) | |
| Audio tracks, waveform, sync | | yes (phase 2) | |
| Text clips | | yes | |
| Tilt, brush engine with custom brushes, smudge | | yes | |
| Selection, lasso, transform, flip | | yes | |
| Performing (record drag/rotate/scale live as motion) | | yes (after keyframes) | |
| Video import as a clip (frames extracted to layers) | | yes | |
| Easing curves, motion paths, parent/child | | yes | |
| 3D reference model viewer | | yes (phase 3) | |
| Mesh/puppet warp, particles, effects stack | | | out |
| Vector drawing, multi-user live editing | | | out |
| Cloud sync of projects between devices | | | out (upload only) |

---

## 3. Two architectures

(A) Godot 4 exported to Web (WASM) and desktop, embedded in the site.
(B) Native web app (Canvas2D/WebGL, later WebGPU, `OffscreenCanvas`, WebCodecs,
Pointer Events) inside the React client. A Godot or desktop wrapper comes later.

| Question | A: Godot web | B: native web |
|---|---|---|
| Download size | Web export is roughly 25-40 MB uncompressed, about 6-10 MB over brotli, for the engine alone **[recheck]**; custom builds with unused modules stripped can be smaller, but then you maintain an engine build. | A drawing app in JS is 200-800 KB plus a muxer. three.js (later) adds about 150 KB gzipped, lazy-loaded. |
| Phone load time | Several seconds on mobile; WASM compile, then project load. Cached after the first visit. | Under a second after the first load. |
| Threads / COOP+COEP | Godot 4.3+ has a single-threaded web export that needs no special headers. Threaded export needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (or `credentialless`) **[recheck]**. These headers would break third-party embeds without CORP, some font and image hosts, and OAuth popups (COOP severs `window.opener`). The single-threaded export avoids all that but is slower for heavy work. Serve the animator from its own path or subdomain with its own headers. | None needed. ffmpeg.wasm fallback wants cross-origin isolation for threads, but works single-threaded; again isolate only the animator route. |
| Pen pressure / tilt | Godot web gets `InputEventMouseMotion.pressure/tilt` from pointer events, but support has been uneven and Safari/iPad Pencil is the weak spot **[recheck]**; coalesced events (smooth fast strokes) are not exposed, so strokes look polygonal at speed. | Pointer Events give `pressure`, `tiltX/Y`, `getCoalescedEvents()` and `getPredictedEvents()`. Apple Pencil works in Safari. Best available in a browser. |
| Latency | Engine frame loop only (60 Hz) and canvas composite. Pen lag is felt. | `desynchronized` canvas hint and direct drawing on pointer events give the lowest the web allows. |
| iPad Safari memory | WASM heap plus textures. Heap growth is capped by Safari and tabs get killed without warning above roughly 1-1.5 GB total **[recheck]**. Engine overhead eats part of it. | Same Safari limit, but no engine heap. Canvas area limit exists too (about 16.7 M pixels per canvas on iOS) **[recheck]**. A 4K layer is 33 MB of RGBA; 20 layers is 660 MB. Use tiles, compressed layer storage and a layer cap either way. |
| 3D reference models | Trivial: import glTF, orbit camera. | three.js `GLTFLoader` in an overlay canvas: a day or two. |
| Same look as the site | Hard. Godot themes reproduce colours and spacing, but fonts, focus rings, text input, IME, accessibility and the grayscale springy controls must be rebuilt in Godot. Native text editing in Godot web is clunky on mobile. | Free. Same CSS, same components, same tokens. |
| Offline / standalone | Excellent: same project, desktop builds for macOS/Windows/Linux. Standalone is "just export again". | Installable PWA works offline in the browser. A desktop app means Tauri or Electron wrapping the same code; no engine to ship. |
| Code shared web vs standalone | About 95%, one codebase in GDScript. Only the bridge layer differs. | About 90% if you use Tauri/Electron. A true Godot standalone would be a rewrite, so you would not do one. |
| Solo effort with AI help | Learning Godot UI, custom brush rendering and export (Godot has no WebCodecs; the page encodes, so you still write a JS export path), plus the bridge. Medium. | Painting, timeline UI and export all in a language already used here. Medium; fewer unknowns. The brush/layer engine is the real work in both. |
| Testing | Hard to test in CI (no DOM; screenshots only). | Normal Vitest/Playwright. |

**Recommendation: B.** Build it as a native web app in the React client, as its
own lazy-loaded route, with the painting engine written as a framework-free
module (`animator-core`) that does not import React. Reasons: pen input is the
heart of this tool and the browser exposes it best; the site's design language
and tests come free; load size is small on phones; and the owner already works
in this stack. Godot's strengths (3D, standalone) are the least important parts
of v1.

**Honest cost of leaving Godot:** "also a standalone Godot 4 app" is not met by
B. The standalone version is a Tauri wrapper around the same code (about a week
once the web app is stable), not a Godot app.

**What would change it to A:**
- You decide Godot-the-engine itself matters (you want to learn it or reuse the
  project for games), not just "an animator".
- Phase 0 shows Pointer Events plus Canvas2D cannot reach acceptable pen feel
  or speed at your canvas sizes, and a Godot prototype does. (Unlikely; web
  painting apps such as Photopea and Excalidraw prove the web side.)
- 3D (rigged reference, posable) becomes a core feature, not a viewer.
- The standalone app becomes the main product and the web version the demo.

**How the contract maps to A.** The protocol in section 4 is engine-agnostic.
If A is chosen, the page implements the same messages and Godot's
`JavaScriptBridge` sends and receives the same JSON. Keeping the contract
clean is what keeps this decision reversible.

---

## 4. Integration contract ("hooks back and forth")

### 4.1 Principles
- The animator is a **module with an explicit boundary**: it gets commands and
  emits events. It never calls the site's API, never sees cookies or tokens.
  The page does uploads, auth, quotas. (Same in A: nothing secret enters the
  engine.)
- Versioned: every message has `v` (protocol version) and `type`. Unknown types
  are ignored and logged.
- Page-to-animator calls return a Promise (B) or arrive as a reply message
  with the same `id` (A, and the iframe form below).
- One animator instance per tab. Embedded in an iframe on its own origin path
  (`/animator/`) so it can have its own headers and a strict CSP; messages go
  through `postMessage` with origin checks.

### 4.2 Messages

Page to animator:
```json
{ "v":1, "id":"7", "type":"open",   "project":{"source":"local","id":"p_9f2"} }
{ "v":1, "id":"8", "type":"open",   "project":{"source":"blob","blob":"<Blob/ArrayBuffer transferred>"} }
{ "v":1, "id":"9", "type":"theme",  "tokens":{"bg":"#f2f2f2","fg":"#111","accent":"#555","radius":"10px","font":"system-ui","dark":false} }
{ "v":1, "id":"10","type":"requestSave" }
{ "v":1, "id":"11","type":"requestExport","format":"webm-av1","range":"all","maxBytes":52428800 }
{ "v":1, "id":"12","type":"setLimits","maxCanvasPx":16777216,"maxLayers":24,"maxFrames":2400 }
```

Animator to page:
```json
{ "v":1, "type":"ready", "caps":{"webcodecs":["av1","vp9","avc"],"pressure":true,"opfs":true} }
{ "v":1, "type":"dirty", "dirty":true }
{ "v":1, "type":"saved", "id":"p_9f2", "bytes":4210000, "rev":31 }
{ "v":1, "type":"exportProgress", "id":"11", "done":0.42 }
{ "v":1, "type":"exportDone", "id":"11", "file":"<Blob>", "mime":"video/webm; codecs=av1", "durationMs":6400, "width":1080, "height":1920, "poster":"<Blob>" }
{ "v":1, "type":"requestUpload", "kind":"video", "file":"<Blob>", "project":"<Blob|null>", "meta":{"title":"","fps":12} }
{ "v":1, "type":"error", "code":"quota_canvas", "message":"Canvas is larger than this device can hold." }
{ "v":1, "type":"close", "reason":"user" }
```

Flow for upload: the animator emits `requestUpload`. The page shows its own
dialog (title, visibility, quota bar from the existing storage endpoint), calls
the upload API with the user's cookie, reports back `{type:"uploadResult", ok, url}`.
The animator only shows the result.

### 4.3 Projects and storage on the device
- **Where:** OPFS (`navigator.storage.getDirectory()`) for frame data, with
  IndexedDB for the project list and small metadata; IndexedDB alone as the
  fallback where OPFS is unavailable. Ask `navigator.storage.persist()`.
  Safari may evict unused site data, so say plainly in the UI: "Export a
  project file to keep a copy."
- **Project file** (`.webpanim`, a zip): 
  ```
  manifest.json          { "format":"webpanim", "version":1, "app":"0.1.0",
                           "width":1080,"height":1920,"fps":12,
                           "layers":[{"id","name","blend","opacity","frames":[{"t":0,"len":1,"file":"frames/L1/0000.webp"}]}],
                           "tracks":[...], "audio":[{"file":"audio/a1.mp3","offsetMs":0}] }
  frames/<layer>/NNNN.webp   lossless WebP (PNG as fallback), tiled 512x512 for big canvases
  audio/…
  thumb.webp
  ```
  Rules: `version` is an integer; the loader migrates old versions and refuses
  newer ones with a clear message; unknown manifest fields are preserved on
  save; frames not changed since last save are not rewritten (unchanged
  files keep their names).
- **Autosave:** debounce about 2 s after the last stroke and on `visibilitychange`.
  Write to a new revision folder, then flip a pointer, so a crash mid-write
  leaves the previous revision intact. Keep the last 3 revisions. The repo
  already has an autosave helper in the client (`client/src/utils/autosave.js`);
  reuse its conventions rather than inventing another.
- **Limits** (starting values, tune in phase 0): canvas up to 4096x4096 and
  no more than about 16.7 M pixels (phones: lower, detected at runtime);
  24 layers; 2400 frames. "Any size canvas" means any size up to the device's
  measured limit, never unbounded.

---

## 5. Server side (one 2 GB VPS)

- **No transcoding on the server, ever.** ffmpeg on a 2 GB box shared with
  Postgres and the JVM would stall the site. The browser encodes; the server
  stores the finished file.
- **Upload:** resumable chunks (for example 2-4 MB parts, `PUT` with
  `Content-Range`, or tus-style). A phone on a bad network must be able to
  resume. Server assembles into a temp file, then moves it into place.
- **Verification without decoding:** parse headers only. For MP4: `ftyp`, `moov`,
  `mvhd` duration, `tkhd` size, `stsd` codec (`avc1`/`av01`). For WebM: EBML
  header, Segment info duration, Tracks codec id (`V_AV1`/`V_VP9`), pixel width
  and height. Reject: unknown container or codec, duration over limit,
  dimensions over limit, size over limit, declared size not matching bytes,
  `moov` after more than a bounded offset (we want fast-start, `moov` first).
  Write the parser as a small bounded class, with tests using real fixture files
  and hostile ones (huge declared box sizes, truncated files).
- **Limits to start:** 60 s, 1920x1080 equivalent (about 2.1 M pixels per frame
  area, so portrait fits too), 50 MB per video, 20 Mbit/s average. The project
  file is optional, 100 MB. Both reuse the existing per-user allowance
  (`role_limits.max_storage_bytes`, `uploads.size_bytes`): a video is an
  `uploads` row with a filename prefix `video/`, a project file is `project/`.
  At 50 MB default allowance that is one or two videos, so the allowance may
  need to be raised for a user who animates; make video count against the same
  number, but let admin raise it per user.
- **Serving:** the existing upload download path is not enough for video:
  it must support `Range` and `206`. Easiest and cheapest on this VPS: write
  videos to disk (not a Postgres bytea) and let nginx serve them with
  `X-Accel-Redirect` from an internal location after Spring checks access.
  nginx handles ranges, caching and `sendfile` for free. Check how current
  uploads are stored first; if they are in the database, videos should still
  go to disk, with the row holding the path. Serve with
  `Content-Type` from the verified container, `X-Content-Type-Options: nosniff`,
  `Cache-Control: public, max-age=31536000, immutable` on content-hashed URLs.
- **Posters and thumbnails:** made in the browser at export (first or chosen
  frame, WebP, 640 px wide) and uploaded with the video. Server only checks
  that it is a valid small image, using the existing image-decoding limits.
- **"Convert to an ordinary video file":** that is the export button. It is
  client-side by design: MP4 (H.264) and WebM (AV1/VP9) from WebCodecs, GIF and
  APNG for short loops (cap 10 s and 480 px wide, otherwise warn), PNG
  sequence zip. A downloaded file never touches the server.
- **Bandwidth:** video is the first feature where bandwidth matters. 50 MB
  files watched a few hundred times is tens of GB. Check the VPS transfer
  allowance before opening uploads; consider a per-video lower default (20 MB)
  and a CDN later.
- **Moderation:** videos add a new place for abuse. Reuse the freeze and
  delete tools in admin; a report button is a follow-up.

---

## 6. Data model sketch (later migrations)

```sql
CREATE TABLE animations (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          VARCHAR(120) NOT NULL DEFAULT '',
  video_upload   INTEGER REFERENCES uploads(id) ON DELETE SET NULL,   -- the playable file
  poster_upload  INTEGER REFERENCES uploads(id) ON DELETE SET NULL,
  project_upload INTEGER REFERENCES uploads(id) ON DELETE SET NULL,   -- optional .webpanim
  container      VARCHAR(8)  NOT NULL,   -- 'webm' | 'mp4'
  codec          VARCHAR(8)  NOT NULL,   -- 'av1' | 'vp9' | 'avc'
  width          INTEGER NOT NULL,
  height         INTEGER NOT NULL,
  duration_ms    INTEGER NOT NULL,
  fps            SMALLINT NOT NULL,
  has_audio      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE upload_sessions (          -- resumable uploads in progress
  id UUID PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(10) NOT NULL, declared_bytes BIGINT NOT NULL, received_bytes BIGINT NOT NULL DEFAULT 0,
  temp_path TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
```
A post references an animation by id inside its content; no `post_animations`
table needed except to find "which posts use this" when deleting (follow the
existing `post_uploads` pattern).

## 7. API sketch

| Endpoint | Purpose |
|---|---|
| `POST /api/animations/uploads` | Start an upload: kind, size, mime. Checks quota first. Returns upload id and chunk size. |
| `PUT /api/animations/uploads/{id}` | Send a chunk with `Content-Range`. `HEAD` returns bytes received so far (resume). |
| `POST /api/animations/uploads/{id}/complete` | Verify, create `uploads` + `animations` rows. Returns animation id. |
| `GET /api/animations/{id}` | Metadata (title, size, duration, owner). |
| `GET /media/animation/{id}.{webm\|mp4}` | Video, `Range`-capable, via `X-Accel-Redirect`. |
| `GET /media/animation/{id}/poster` | Poster. |
| `PATCH /api/animations/{id}` / `DELETE` | Rename; delete frees allowance. |
| `GET /api/users/{u}/animations` | List for the owner's gallery. |

All write calls use the existing cookie session and the existing rate limiters.

## 8. In a post

A new block type next to image, audio and grid: `animation`, holding
`{ "animationId": 42, "loop": true, "autoplay": false }`. In the viewer it shows
the poster with a play button. Playing uses the **pop-up player already being
built for audio** (backlog B), so one player component handles audio and
video: pause, play, close (closing stops it), plus loop and mute. Loops of a few
seconds may play inline, muted, `playsinline`. A block whose animation was
deleted shows "removed", not a broken box. Check/verify in the Lexical editor
as a decorator node like `ImageNode.jsx`.

---

## 9. Phased plan

Sizes assume one developer with AI help, working part-time.

| Phase | Goal | Ships | Size | Risks |
|---|---|---|---|---|
| 0. Spike | Remove the three scary unknowns | Throwaway page, not shipped: (1) draw with Apple Pencil/pen on a 4K canvas via Pointer Events and measure latency and stroke quality; (2) allocate 10-20 layers at 4K on an iPad and an old iPhone, find the crash line; (3) encode 5 s of frames to MP4/WebM with WebCodecs on Safari, Chrome, Firefox and check playback elsewhere. Also: how are current uploads stored; nginx range test. | 3-5 days | If (1) is poor, reconsider A. If (2) fails, lower caps and tile. If (3) fails on Safari, ffmpeg.wasm becomes mandatory (big, slow). |
| 1. Minimal flipbook | Draw, flip, play, export, upload | Canvas up to cap, brush/eraser with pressure, layers (opacity, visibility, blend modes), frames strip, onion skin, play/loop/fps, undo, local save in OPFS, export MP4/WebM/GIF, upload with resumable chunks and header verification, `animation` post block with pop-up player. | 4-6 weeks | Brush feel; memory; upload verification bugs; storage eviction on iOS. |
| 2. Timeline | Clips, tracks, motion, sound | Timeline with tracks, clip hold/trim/move, keyframes (position, scale, rotation, opacity) with easing, audio tracks, text clips, project file import/export, performing (record a drag as keyframes). | 6-10 weeks | Timeline UI on touch is hard; audio sync drift in export; scope creep toward a full Dreams clone. |
| 3. Reference and standalone | 3D reference and offline | three.js glTF viewer as a reference panel (never exported), PWA offline mode, Tauri desktop wrapper (macOS first). Decide on Godot only if reasons in section 3 appeared. | 3-5 weeks | glTF size and memory on phones; app-store/signing costs for desktop. |

## 10. Open questions for Mae

1. Is the animator for you and friends (small), or for open sign-ups? It changes quotas and bandwidth.
2. Does it have to be Godot, or is "standalone" (a Tauri wrapper of the web app) good enough?
3. Which devices matter most: iPad with Pencil, desktop with a tablet, or phones?
4. Maximum canvas you really want: 4K, or is 2048 px enough for v1?
5. Maximum video length and size you will pay bandwidth for (suggest 60 s, 50 MB)?
6. Raise the default 50 MB storage allowance for animators, or a separate video allowance?
7. Should projects (editable source) be uploadable and downloadable by other users (remix), or kept private to the author?
8. Is audio from your own MP3 uploads enough, or do you need recording from the microphone?
9. Is GIF/APNG export needed in v1, or only MP4/WebM?
10. Do you want a public gallery of animations, or only posts?
