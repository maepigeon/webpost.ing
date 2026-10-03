# webpaint.ing — architecture

Status: proposal for Mae to decide on, 2026-10-03. Nothing is built. Written
from `webpaint-plan.md`, `animator-design.md`, `SSO-PLAN.md`, the webpost.ing
code map and deployment guide, a full read of her Drawing-app repository, and
the Godot 4.6 web export templates installed on her Mac (unpacked and read in
a scratch folder). No web search was available: facts about Godot and
browsers that were not checked against those files are marked **[recheck]**.
Facts marked **[verified]** were read from the code or files on 2026-10-03.

Constraints that shape everything: one maintainer, one 2 GB droplet shared
with webpost.ing, no transcoding or building on the server, a public
repository with no secrets in it.

---

## 1. Answers first

### Is "a Godot web client using WebSockets and HTTP, starting from Drawing-app" a good architecture?

**Yes in shape, no in protocol.** The shape (a static client, HTTP for
everything that is a request and an answer, one WebSocket per shared canvas
for live strokes, a small relay server) is the right one for one maintainer
and one small server, and it is exactly the shape Drawing-app already has.
What cannot be carried over is how Drawing-app synchronises. From its code:

- It is DoodlLab, a 2022 turn-based party game: plain JavaScript and jQuery in
  `Client/`, a Node server with `ws` as its only dependency in `Server/`
  (about 3,100 lines in all).
- The client sends **every raw pointer event and every tool change** as its
  own message (`startPosition`, `draw`, `finishedPosition`, `setColor`,
  `setBrushThickness`, `eraser`: `Client/canvas.js` 362-405, 445-494). The
  receiver runs the same functions against **one shared set of globals**
  (`painting`, `ctx`, `brush`, `eraser`: `canvas.js` 32-80). Two people
  drawing at once would share one pen position and one colour. It works only
  because the game lets one player draw per turn (`setDrawingEnabled`).
- The server is a blind relay: anything it does not recognise is sent to
  everyone (`Server/index.js` 200-202). It keeps no canvas state, no log and
  no order, so nobody can join late (joining during a game is refused,
  143-150) or reconnect; one disconnect ends the game for all (206-219).
  The sender's id comes from the client and is trusted. `JSON.parse` is not
  guarded (180): one malformed message stops the server.
- Undo is a **full PNG of the layer after every stroke**
  (`saveLayerMark` → `toDataURL`, `canvas.js` 221-224), in one history shared
  by everyone, never trimmed. Undoing a layer change calls functions that do
  not exist (`callRemoveLayerAll`, `callMoveLayerAll`: 295, 298), and the
  layer-select message is sent as `newPosition` but read as `layer`
  (187 against 60). Layers have no buttons in the page; the file header says
  "layers, needs work".
- The eraser paints white (413-415); export saves only the bottom layer
  (`download-buttons.js` 8-13); the socket address is a hard-coded `ws://`.

So: **keep the shape and the vocabulary, replace the protocol.** What carries
over and what does not is listed in 5.6.

### What I would change in her proposal

1. **Pen input and video encoding go through the web page, not through
   Godot.** Godot 4.6's web runtime reads only `evt.pressure` from
   `pointermove`: no tilt, no coalesced events (the in-between pen samples a
   browser collects per frame), and its touch handler passes no pressure at
   all **[verified in the 4.6 template]**. The page captures Pointer Events
   itself and hands the samples to the engine. Godot also has no video
   encoder on the web; the page encodes with WebCodecs from Godot's canvas.
2. **Strokes are self-contained events**, each with its own id, author, tool
   settings and points, applied through one function. Tool state is never
   broadcast. The server stamps author and order, keeps a log and snapshots.
3. **The page does all HTTP; Godot holds only the room WebSocket.** No cookie
   or secret of either site ever enters the engine.
4. **Single-threaded web export.** No cross-origin isolation headers, so
   pictures and embeds from webpost.ing keep working (2.6).
5. **A small separate server (Node), with its own database**, not a module of
   the webpost.ing server (2.4).
6. **Single-user first, on the same event model**, so shared canvases are an
   addition (5.7). Shared canvases come after animation, not before.

### The three biggest risks

1. **Pen feel and memory inside a 37 MB engine on iPad Safari.** One or two
   frames of lag are built in (the engine draws on the browser's frame
   clock); Safari kills tabs that use too much memory, without warning, and
   the engine's own heap takes part of the budget. Phase 0 measures both
   before anything else is built. If pen feel fails with the page-side input
   path, the fallback is the native-web canvas of `animator-design.md` with
   Godot kept for 3D reference only.
2. **Scope.** A paint program, an animation timeline, comic tools, shared
   canvases, 3D reference, shaders, scripts and video export are several
   products. The phases in section 11 each ship something usable; shared
   canvases and scripts are late on purpose.
3. **Godot as a user interface.** Everything inside the canvas has no DOM: no
   screen reader, weak text entry on phones, the house look must be rebuilt
   as a Godot theme, and ordinary DOM tests see nothing. The answer here is a
   firm split (text and forms in HTML, drawing surfaces and tool panels in
   Godot), one token file feeding both, and a test bridge (section 13).

Also to watch: moving large binary data out of the engine (2.3), and disk and
bandwidth on the droplet once video uploads are open to others.

---

## 2. System shape

```
 browser tab: https://webpaint.ing
 ┌─────────────────────────────────────────────────────────────────────┐
 │ web shell (HTML, React + Vite, app font, design tokens)             │
 │  sign-in state, library, top bar, dialogs with text, publish,       │
 │  pen capture, project files (OPFS), video encode (WebCodecs)        │
 │        ▲ bridge: JSON messages + pointer batches + byte hand-off    │
 │        ▼                                                            │
 │ Godot 4.6 engine in one <canvas> (single-threaded, WebGL 2)         │
 │  canvas, brushes, layers, tool panels, timeline, onion skin,        │
 │  3D reference, shaders, playback, room socket                       │
 └───────┬───────────────────────────────┬─────────────────────────────┘
         │ HTTPS  /api /auth /media       │ WSS  /ws/rooms/{id}
 ┌───────▼───────────────────────────────▼─────────────────────────────┐
 │ nginx (one droplet, two server blocks)                              │
 │  webpost.ing → /srv/webposting/html, 127.0.0.1:8080 (Spring, as now)│
 │  webpaint.ing → /srv/webpaint/html,  127.0.0.1:8790 (webpaint svc)  │
 └───────┬───────────────────────────────┬─────────────────────────────┘
         │                               │ loopback only: /internal/...
 ┌───────▼────────────┐          ┌───────▼─────────────────────────────┐
 │ webpaint service   │◄────────►│ webpost.ing server (accounts live   │
 │ Node, ≤ 192 MB     │  shared  │ here; mints sign-in codes, takes    │
 │ DB "webpaint"      │  secret  │ "post to webpost.ing")              │
 │ /srv/webpaint/data │          │ DB webposting, /srv/webposting/...  │
 └────────────────────┘          └─────────────────────────────────────┘
```

### 2.1 What the page does and what Godot does

Rule: **if it has a text field or a link, it is HTML; if it is touched while
drawing, it is Godot.**

| Web shell (HTML) | Godot engine |
|---|---|
| Sign-in state, account menu, navigation between sites | The canvas: brushes, eraser, fill, selection, transform |
| Library: my works, series, chapters; the comic reader | Layers panel, colour picker, tool rail, tool options |
| Top bar: work title, save state, Undo/Redo, Publish, Export | Timeline and filmstrip, onion skin, playback |
| Every dialog with typing: new canvas, publish, export settings, lettering text entry, room invite | Panels and balloons on the page, 3D reference viewport, shader layers |
| Pointer capture for pen and touch (2.2) | Applying events to the document, undo, rendering |
| Project files on the device (OPFS), uploads, downloads | The room WebSocket (`WebSocketPeer`) |
| Video and image encoding, muxing | Rendering export frames to the canvas on request |
| Error pages (no WebGL 2, out of memory, offline) | |

The engine never calls the site's API and never sees a cookie. The standalone
desktop build swaps the web shell's jobs for native ones behind the same
interface (`Host`, 10.1): file dialogs, native files, native pen input.

### 2.2 Pen input path

The shell listens on the Godot canvas element for `pointerdown`, `move`,
`up`, `cancel` with `touch-action: none`, reads `getCoalescedEvents()`,
`pressure`, `tiltX/Y`, `twist`, `pointerType`, and once per animation frame
(before the engine's frame) sends one batch. Godot's own input still drives
its buttons and panels; the drawing tool takes its samples only from the
batch when running on the web, and from Godot's native tablet input in the
desktop build. Once a pen has been seen, fingers pan and zoom and never draw
(a switch in settings turns finger drawing back on).

### 2.3 The bridge

Godot's `JavaScriptBridge` converts only null, booleans, numbers and strings
(other values arrive as slow proxy objects); `JavaScriptBridge.eval` can
return bytes but needs `unsafe-eval` in the page's security policy; the
engine object has `copyToFS(path, bytes)` for page-to-engine files
**[all verified in the 4.6 runtime]**. So the contract uses three channels:

1. **Messages**: JSON strings, both ways. Every message has `v` (protocol
   version, 1) and `type`; a request carries `id` and its answer carries
   `re` with the same value. Unknown types are ignored and logged.
   `window.webpaintHost.post(json)` is engine to page;
   `window.webpaintHost.toEngine(json)` (a callback Godot registers) is page
   to engine.
2. **Pointer batches**: one string per frame through
   `webpaintHost.pointers(str)`, parsed with `split_floats`. Each sample is
   `phase,pointerId,kind,x,y,pressure,tiltX,tiltY,twist,tMs` (phase 0 down,
   1 move, 2 up, 3 cancel; kind 0 mouse, 1 pen, 2 touch; x and y in canvas
   backing pixels), samples joined by `;`.
3. **Bytes**: page to engine by `engine.copyToFS("/tmp/wp/in/<n>", bytes)`
   then a message naming the handle (the engine reads the file and deletes
   it). Engine to page as base64 inside a message, at most 1 MB per message.
   Frames for video never use this: the page reads the canvas itself (6.6).
   A faster engine-to-page path is a phase 0 question **[recheck]**.

Example messages (page → engine):

```json
{"v":1,"id":"1","type":"hello","caps":{"webcodecs":["avc","vp9"],"opfs":true,"pen":true},
 "limits":{"maxCanvasPx":4194304,"maxLayers":24,"maxFrames":2400},
 "user":{"id":7,"name":"mae"},"tokens":"3fa1c2"}
{"v":1,"id":"2","type":"doc.open","work":"w_9f2","snapshot":{"handle":3},"journal":{"handle":4}}
{"v":1,"id":"3","type":"doc.new","kind":"animation","width":1920,"height":1080,"fps":12}
{"v":1,"re":"t1","type":"text.result","text":"What was that?!"}
{"v":1,"id":"11","type":"export.start","format":"mp4-avc","width":1920,"height":1080,"fps":12,"range":[0,71]}
{"v":1,"type":"export.next","frame":13}
{"v":1,"id":"20","type":"room.join","url":"wss://webpaint.ing/ws/rooms/r_81","ticket":"…"}
```

Engine → page:

```json
{"v":1,"type":"ready","engine":"4.6","protocol":1}
{"v":1,"type":"op.append","work":"w_9f2","ops":[{"id":"7-88","type":"stroke","…":"…"}]}
{"v":1,"type":"tiles.put","work":"w_9f2","cel":"c_12","rev":31,"tiles":[{"x":0,"y":1,"png64":"…"}]}
{"v":1,"type":"saved","work":"w_9f2","rev":31}
{"v":1,"id":"t1","type":"text.request","purpose":"balloon","value":"","rect":[412,300,220,64]}
{"v":1,"type":"export.frame","re":"11","frame":12}
{"v":1,"type":"export.done","re":"11","frames":72}
{"v":1,"type":"publish.request","kind":"image","work":"w_9f2"}
{"v":1,"type":"error","code":"quota_canvas","message":"Canvas is larger than this device can hold."}
```

The message list lives in the new repository as `protocol/bridge.md` with
fixture files that the shell tests and the engine tests both load, so the two
sides cannot drift.

### 2.4 Server: a small separate service

**Decision: a separate Node service** (`webpaint.service`), built on Node's
own `http`, the `ws` package and `pg`, with no native add-ons.

| Question | Separate Node service (chosen) | Inside the webpost.ing Spring server | A second Java service |
|---|---|---|---|
| Memory | 60-120 MB; capped with `--max-old-space-size=128` and systemd `MemoryMax=192M` | 0 extra, but rooms and uploads share the 640 MB heap with the site | 180-300 MB **[recheck]** |
| Deploys | Its own release; never restarts webpost.ing | Every webpaint release signs everyone out of webpost.ing (sessions are in memory) | Its own |
| "Application data separate" | Own database, own files, own backup | Same database and process | Own |
| Fit | A WebSocket relay is what Node is good at; Drawing-app's server is already Node + `ws`; protocol code is shared with the shell and the tests | Different repository from the client it serves | No shared code with the shell |
| Cost | Node runtime installed once on the droplet (the README says not to install Node there; that rule is about building, and nothing is built or `npm install`ed on the server: `node_modules` ships in the release) | Couples two products | A second JVM on 2 GB |

Memory budget on the droplet: system and nginx about 150 MB; PostgreSQL about
250 MB; webpost.ing JVM up to about 900 MB (640 MB heap plus metaspace,
`server-start.sh`); webpaint service 192 MB cap; the rest is file cache. It
fits without a resize as long as the service stays a relay and never touches
pixels.

The service does: sign-in callback and sessions, works and series metadata,
chunked uploads with header checks, access checks for media, the room relay,
and the calls to webpost.ing. It never decodes images or video and never
runs Godot.

### 2.5 Storage layout

- **Database**: a separate PostgreSQL database `webpaint` with its own role,
  in the same PostgreSQL instance, reached over the local socket without a
  password as webpost.ing does. Numbered migrations run at start, same rules
  as `MIGRATIONS.md`. Tables (sketch): `accounts` (keyed by the webpost.ing
  user id; name, role snapshot, allowance), `sessions`, `works`, `files`,
  `upload_sessions`, `series`, `chapters`, `pages`, `releases`, `rooms`,
  `room_members`.
- **Files**: `/srv/webpaint/data/` owned by the service user:
  `public/` (published images, videos, posters: served by nginx),
  `private/` (subscriber-only and unpublished: served only after a check),
  `projects/` (uploaded project files, later), `rooms/<id>/` (logs and
  snapshots), `tmp/` (uploads in progress). Rows hold relative paths.
- **On the device**: OPFS for project data, IndexedDB for the project list
  (4.5).
- **Backups**: `pg_dump webpaint` and `/srv/webpaint/data` join the same
  nightly job that webpost.ing still needs (DEPLOYMENT.md section 6).

### 2.6 nginx, and cross-origin isolation

**Single-threaded export, no isolation headers.** Godot's threaded web build
needs `SharedArrayBuffer`, which needs `Cross-Origin-Opener-Policy:
same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Those headers
would block images and video loaded from webpost.ing unless that site adds
its own headers, and cut the link to pop-up windows. The single-threaded
build (in Godot since 4.3) needs none of that. What it costs: audio mixing
shares the main thread **[recheck: sample playback mode on web in 4.6]** and
nothing in the engine can run in the background. The heavy work that would
want threads (video encoding) is done by the browser's own encoder, which is
already off the main thread. Both builds' templates are installed on her Mac,
so this can be revisited by re-exporting.

Download size **[verified]**: `godot.wasm` for 4.6 single-threaded is
37.7 MB, 9.4 MB with gzip -9, 7.4 MB with brotli; `godot.js` is 316 KB.
Serve it pre-compressed with a content-hashed name and a one-year cache, and
let the service worker keep it, so the cost is paid once per release.

Snippet for Mae (paths are examples; hers are in `deploy.env`):

```nginx
server {
    listen 443 ssl;
    server_name webpaint.ing;
    ssl_certificate     /etc/letsencrypt/live/webpaint.ing/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/webpaint.ing/privkey.pem;
    root /srv/webpaint/html;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://webpost.ing; media-src 'self' blob:; connect-src 'self' wss://webpaint.ing; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;

    location / { try_files $uri $uri/ /index.html; }

    location /engine/ {                      # hashed names: godot.<hash>.wasm(.gz)
        gzip_static on;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        add_header X-Content-Type-Options "nosniff" always;
    }
    location = /sw.js { add_header Cache-Control "no-cache"; }

    location /api/  { proxy_pass http://127.0.0.1:8790; client_max_body_size 8m;
                      proxy_set_header Host $host;
                      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                      proxy_set_header X-Forwarded-Proto $scheme; }
    location /auth/ { proxy_pass http://127.0.0.1:8790; proxy_set_header Host $host;
                      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
    location /ws/   { proxy_pass http://127.0.0.1:8790; proxy_http_version 1.1;
                      proxy_set_header Upgrade $http_upgrade;
                      proxy_set_header Connection "upgrade";
                      proxy_set_header Host $host;
                      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                      proxy_read_timeout 75s; }
    location /media/ { proxy_pass http://127.0.0.1:8790; }   # checks access, answers X-Accel-Redirect
    location /_files/ { internal; alias /srv/webpaint/data/; }  # ranges, sendfile
    location /internal/ { return 404; }
}
server { listen 443 ssl; server_name www.webpaint.ing; return 301 https://webpaint.ing$request_uri;
         ssl_certificate /etc/letsencrypt/live/webpaint.ing/fullchain.pem;
         ssl_certificate_key /etc/letsencrypt/live/webpaint.ing/privkey.pem; }
server { listen 80; server_name webpaint.ing www.webpaint.ing; return 301 https://webpaint.ing$request_uri; }
```

The service keeps the path as given (no prefix stripping), so `/internal/`
can never be reached through `/api/`. **[recheck]** on the droplet:
`application/wasm` is in nginx's `mime.types`, `gzip_static` is compiled in,
and whether the engine runs under `'wasm-unsafe-eval'` without
`'unsafe-eval'` (phase 0 tests this with the policy in report-only mode).
On webpost.ing, the policy in DEPLOYMENT.md section 8 gains
`https://webpaint.ing` in `img-src` and `media-src` when embeds ship.

---

## 3. One account on two domains

Cookies cannot be shared between `webpost.ing` and `webpaint.ing`, and
third-party cookies are blocked in Safari. So webpaint.ing has **its own
session cookie**, created only after webpost.ing vouches for the browser with
a one-time code. webpaint.ing never shows a password field. When Google,
Apple or Microsoft sign-in lands on webpost.ing (SSO-PLAN.md), webpaint.ing
gets it with no change.

### 3.1 The hand-off

```
browser                webpaint service                 webpost.ing server
  │ GET /auth/start?return=/w/9f2 │                           │
  │──────────────────────────────►│ makes state + verifier,   │
  │ 302 + cookie wp_login         │ stores both in a 5-minute │
  │◄──────────────────────────────│ HttpOnly cookie           │
  │ GET https://webpost.ing/api/sso/authorize?client=webpaint&state=S&challenge=C
  │──────────────────────────────────────────────────────────►│ signed in? (its own cookies)
  │                               │                           │ no → its login page, then back here
  │ 302 https://webpaint.ing/auth/callback?code=K&state=S     │ yes → one-time code K: 60 s, single use,
  │◄──────────────────────────────────────────────────────────│ tied to user, client and C
  │ GET /auth/callback?code=K&state=S (+ cookie wp_login)     │
  │──────────────────────────────►│ state matches cookie?     │
  │                               │ POST 127.0.0.1 /internal/sso/redeem
  │                               │ {code K, verifier V} + shared secret
  │                               │──────────────────────────►│ secret ok, K unused and fresh,
  │                               │ {userId, username, role}  │ SHA-256(V) = C → burn K
  │                               │◄──────────────────────────│
  │ 302 /w/9f2 + cookie wp_session│ upsert account, new session
  │◄──────────────────────────────│
```

### 3.2 Endpoints

**webpost.ing** (a new `SsoBridgeController`; built in that repository as a
phase 1 package, with tests):

| Endpoint | Who can call | Does |
|---|---|---|
| `GET /api/sso/authorize?client&state&challenge` | A browser, top-level navigation | If signed in and not frozen or locked: mint code, redirect to the **configured** callback for that client (never a URL from the request). If not signed in: the login page with `next` set to this same URL (the login page accepts `next` only when it starts with `/api/sso/authorize`). Rate-limited per network. Codes live in memory, like sessions. |
| `POST /internal/sso/redeem` | The webpaint service, on loopback | Checks the shared secret (constant-time), the code (unused, under 60 s, right client) and the verifier. Returns `{userId, username, role, emailVerified}`. A second use of a code is refused and logged. |
| `GET /internal/sso/users/{id}` | Same | `{exists, role, frozen, locked}` for re-checks. |
| `GET /internal/subscriptions/check?creator&viewer` | Same | Whether the viewer may see the creator's subscriber content (7.4). |
| `POST /internal/integrations/webpaint/posts` | Same | Creates or updates a post for a user (section 8). |

Every `/internal/` route requires the secret, refuses any request that
carries `X-Forwarded-For` (nginx always adds it, so such a request came from
outside), and nginx gets `location /api/internal/ { return 404; }` as a third
layer. **[recheck]** how production nginx maps `/api/` (the README sample
strips the prefix, which is why the header check matters).

**webpaint service**:

| Endpoint | Does |
|---|---|
| `GET /auth/start?return=` | Sets `wp_login` (state, verifier, return path limited to local paths), redirects to webpost.ing. |
| `GET /auth/callback?code&state` | Checks state, redeems, creates the session, clears `wp_login`, redirects. Sends `Referrer-Policy: no-referrer`. |
| `POST /auth/signout` | Ends this webpaint session only. |
| `GET /api/me` | `{id, name, role, allowance}` or 401. |
| `POST /internal/accounts/{id}/sessions/end` | Called by webpost.ing (best effort) on password change, freeze, lock, delete, "sign out everywhere". |
| `POST /internal/accounts/{id}/delete` | Called on account deletion: removes that user's webpaint data. |

**Session**: `wp_session`, 32 random bytes, `HttpOnly; Secure; SameSite=Lax;
Path=/`; only its SHA-256 is stored, in the `sessions` table (so a webpaint
restart signs nobody out). Idle expiry 14 days, absolute 30 days. Every 15
minutes of use the service re-checks the account with webpost.ing; a frozen,
locked or deleted account loses its sessions. State-changing requests are
checked for `Origin` (the same defence as webpost.ing's `OriginCheckFilter`).

The shared secret is `SSO_WEBPAINT_SECRET` in both `deploy.env` files, 32
random bytes, readable by root and each service's group only.

### 3.3 Threat model

| Threat | Defence |
|---|---|
| The code leaks (history, logs, referrer) | Single use, 60 seconds, useless without the verifier held in the starting browser's HttpOnly cookie and without the shared secret; the callback redirects at once and sends no referrer. |
| Signing someone in as another person (login CSRF, session fixation) | `state` must match the `wp_login` cookie set in the same browser; a new session token is issued at every callback. |
| Open redirect or code sent to another site | The callback URL is configured per client on webpost.ing, never taken from the request; `return` accepts only local paths. |
| Replay | Codes are burned on first redeem; a second attempt is logged as a security event. |
| Someone on the internet calling `/internal/` | Secret, forwarded-header refusal, nginx 404, and on webpaint a path nginx never proxies. |
| A stolen webpaint cookie | HttpOnly and Secure; hash stored; ended by sign-out, by "sign out everywhere" on webpost.ing, and by expiry. |
| A frozen or deleted account still drawing | Refused at authorize; re-check every 15 minutes; push from webpost.ing. |
| The secret leaks | It only allows redeeming codes and the narrow internal routes, only from the droplet itself. Rotate by changing both files and restarting both services. |
| Cross-site WebSocket use | The upgrade checks `Origin`; the room also needs a ticket (5.2). |
| The engine or a user script reaching account powers | The engine holds no credential; scripts run only for their author (6.5). |

Not chosen: a shared login in an iframe (needs third-party cookies); signed
tokens passed in the URL (cannot be revoked, and add key handling for no
gain when both servers share a loopback); reading webpost.ing's database
from webpaint (couples the two schemas).

---

## 4. Drawing core

### 4.1 Document model

```
Work    { id, kind: illustration | animation | comic, title, sheets[] }
Sheet   { id, width, height, background, layers[] (bottom to top), timeline? }
          illustration: 1 sheet · animation: 1 sheet with a timeline · comic: 1 sheet per page
Layer   { id, kind: raster | panels | text | reference3d | audio | effect,
          name, opacity, blend, visible, locked, clipToPanels, cels[] }
Cel     { id, start, length }      a raster layer on a still sheet has exactly one cel
          pixels: sparse 256×256 RGBA8 tiles; empty tiles are not stored
Op      { id: "<actor>-<n>", by, seq, type, …targets, …payload }
```

**Nothing changes the document except `Document.apply(op)`.** Tools build ops;
they never touch layers or pixels directly. Op types: `stroke`, `fill`,
`paste`, `transform`, `layer.add / remove / move / set`, `cel.add / remove /
move / hold`, `sheet.add / remove / move`, `key.set / remove`, `text.set`,
`panel.set`, `undo`, `redo`. An op aimed at something that no longer exists
does nothing. Ids are made by the client (`actor` is the user's number in the
room, or 0 alone), so an op can be named before the server has seen it.

A **stroke op** carries all it needs to be drawn again anywhere:

```json
{"id":"7-88","type":"stroke","layer":"l2","cel":"c9",
 "tool":{"brush":"round","mode":"paint","size":18,"color":"#1c1c1cff","opacity":0.9,
         "hardness":0.8,"spacing":0.12,"sizeByPressure":0.7,"opacityByPressure":0.0,"seed":40213},
 "pts":[1220,860,180, 6,2,14, 5,3,9]}
```

`pts` are the **already smoothed** samples as integers: x and y in sixteenths
of a pixel in sheet space (as Drawing-app sends positions in canvas space,
not screen space), pressure 0-255; the first triple is absolute, the rest are
differences. Smoothing happens once, at input, so replay never depends on
timing.

### 4.2 Brush engine in Godot

- **On the GPU.** The active cel is a render target. A stroke is drawn as
  stamps (instanced quads with a brush shader) into a separate **stroke
  buffer**, shown live over the cel, and merged into the cel at pen-up with
  the stroke's opacity (so overlapping stamps do not build up unevenly) or
  with an erase blend (true transparency, not white paint).
- **Pressure**: to size and to opacity through a per-brush curve; a mouse
  counts as 0.5 (as in Drawing-app). Tilt is recorded in the samples from the
  first version even if no brush uses it yet.
- **Smoothing**: a pulled-string stabiliser with a strength setting, then
  curve resampling at `max(1 px, size × spacing)`.
- **Pixel brush**: integer positions and sizes, straight pixel lines between
  samples, no soft edge, no opacity from pressure; the canvas is shown with
  nearest-neighbour filtering at 100% and above. Same pipeline, a different
  shader, so pixels stay pixels.
- **Fill, selection, transform**: fill as a CPU flood on the read-back cel
  (small and rare), then one `fill` op holding the mask as run-lengths.
- **Memory**: only the cels of the current frame and its onion neighbours
  are textures; other cels are kept as compressed tiles and loaded on demand
  with a least-recently-used cap. Starting caps (to tune in phase 0): 2048 ×
  2048 on phones and tablets, 4096 × 4096 on desktop, 24 layers, 2400 frames.
- A C++ brush core (GDExtension) is not planned: it needs the larger
  dynamic-link web templates and a matching Emscripten toolchain to maintain.
  Her Mac has both, so it remains an escape hatch.

### 4.3 Undo

One mechanism for one user and for many: **checkpoints and replay.** Each
active cel keeps a GPU copy of itself every 20 strokes (three kept). Undo
appends an `undo` op naming the target op; the cel is rebuilt from the
nearest earlier checkpoint by replaying the ops after it, skipping undone
ones. Redo is an op too. Layer and timeline ops undo by their inverse.
Replaying up to 20 strokes is a frame or two on the GPU **[recheck in phase
0]**. Depth: 50 steps per user. This replaces Drawing-app's full-layer PNG
per stroke, which cannot be bounded and cannot be made per-user.

### 4.4 Autosave: a journal and snapshots

The same idea is used on the device, in undo and on the server: **pixels at a
known point, plus the ops since.**

- Every op goes to the page within 250 ms (`op.append`) and is appended to
  the work's journal file. Ops are small, so nothing is lost if the tab dies.
- Pixels follow lazily: 2 seconds after the last stroke, on
  `visibilitychange`, and every 30 ops, the engine reads back the changed
  cels and sends only changed tiles (`tiles.put`). The shell writes them
  under new names, then replaces the manifest, then trims the journal, so a
  crash mid-save leaves the previous revision whole. Three revisions kept.
- Opening a work: load tiles, replay the journal's remaining ops.

### 4.5 Storage on the device, and the file format

- OPFS for tiles, journals and media; IndexedDB for the list of works and
  small settings; `navigator.storage.persist()` requested on first save.
  Safari can evict site data, so the save status says "On this device" and
  the menu offers "Save a copy" (downloads the project file).
- Godot's own `user://` storage is not used on the web: it keeps every file
  in memory and would load every project at start.
- **Project file `.webpaint`** (a zip; supersedes `.webpanim` in
  animator-design.md):

  ```
  manifest.json   { "format":"webpaint", "version":1, "app":"0.1.0" }
  work.json       the document tree of 4.1 (no pixels)
  cels/<celId>/<tx>_<ty>.png      256×256 tiles, lossless
  journal.jsonl   ops since the tiles were written (may be empty)
  audio/…  models/…  fonts/…  scripts/…  thumb.webp
  ```

  `version` is an integer; the loader migrates older versions and refuses
  newer ones with a clear message; unknown fields survive a save.

---

## 5. Multi-user

### 5.1 Model

A **room** is a live session on one work. The server is an **ordered relay
with a log and snapshots**: it gives every op a sequence number, appends it
to the room's log, and sends it to everyone. It checks sizes, types and
rates; it never draws.

### 5.2 Joining

The page asks `POST /api/rooms/{id}/ticket` (cookie session; must be a
member) and gets a single-use ticket valid for 30 seconds. It passes the
socket URL and ticket to the engine (`room.join`). The engine connects and
sends the ticket as its first message, not in the URL, so it is never
logged. The server answers with the member list, the newest snapshot's
address and the ops after it. The page downloads the snapshot over HTTP and
hands it to the engine.

### 5.3 Messages

```json
→ {"t":"hello","ticket":"…","have":1500}
← {"t":"welcome","you":3,"seq":1543,"members":[{"n":1,"name":"mae"},{"n":3,"name":"ren"}],
   "snapshot":{"seq":1500,"url":"/api/rooms/r_81/snapshots/1500"},"ops":[ … 1501-1543 … ]}

→ {"t":"s.begin","sid":"3-88","layer":"l2","cel":"c9","tool":{ … }}     live stroke, relayed with "by":3
→ {"t":"s.pts","sid":"3-88","p":[1220,860,180,6,2,14]}                  every 50 ms while drawing
→ {"t":"s.end","sid":"3-88"}
← {"t":"s.commit","sid":"3-88","by":3,"seq":1544}                       to everyone, sender included

→ {"t":"op","op":{"id":"3-89","type":"layer.add","after":"l2","name":"ink"}}
← {"t":"op","seq":1545,"by":3,"op":{ … }}
→ {"t":"op","op":{"id":"3-90","type":"undo","target":"3-88"}}
→ {"t":"cursor","x":812,"y":440}                                         at most 10 a second, not logged
← {"t":"snap.please","seq":2000}     ← {"t":"error","code":"rate"}       ping every 30 s
```

The server gathers a stroke's points as they pass and writes the whole
stroke to the log as one op when it ends, so the log holds only finished
things. A stroke is capped at 5,000 points; the client starts a new one
beyond that.

### 5.4 Conflict rule and undo

- **Server order is the truth.** A live stroke is shown on a per-person
  buffer above its layer the moment its points arrive (including your own).
  It joins the layer when its `s.commit` arrives, in sequence order, so every
  client blends overlapping strokes in the same order.
- Structural ops apply in sequence order; an op whose target is gone does
  nothing, and its author's client says so quietly.
- **Undo is per person**: an `undo` op names one of your own ops. Everyone
  rebuilds the affected cel from a checkpoint, skipping it (4.3). Other
  people's later strokes stay.
- Rendering differences between graphics chips are below what the eye sees;
  the pixel brush uses whole numbers and is exact. Anyone who joins or
  reconnects starts from the same snapshot.

### 5.5 Snapshots and limits

The server cannot draw, so **a client makes the snapshot**: every 500 ops or
2 MB of log the server asks the longest-connected editor (`snap.please`);
that client saves its state at exactly that sequence number as a `.webpaint`
file and uploads it over HTTP. Rooms are for invited people, so a snapshot
from an editor is trusted; the owner can restore an older one.

Limits for this droplet (starting values): 8 people in a room; 25 rooms open
at once; messages at most 16 KB and 60 a second per connection; log at most
20 MB before the room becomes read-only until a snapshot arrives; a room
closes 10 minutes after the last person leaves, keeping its newest snapshot
and log on disk (counted against the owner's allowance). A person drawing
sends 2-4 KB a second; a full room costs the server about 30 KB a second and
a few megabytes of memory.

Roles: owner, editor, viewer. Joining needs a signed-in account and an
invitation link from the owner.

### 5.6 What is carried from Drawing-app

| Kept | Changed | Dropped |
|---|---|---|
| The shape: static client, small `ws` relay, JSON messages with a type and a sender | The server stamps the sender and the order; it logs and snapshots | Trusting the client's `userId`; relaying unknown messages; one global room |
| "The same function handles my input and a remote message" (`callXAll` / `interpretCommand`) → `Document.apply(op)` | Remote and local strokes each have their own state, not shared globals | Broadcasting brush colour, size and eraser as shared state |
| A stroke as begin, points, end; positions in canvas pixels; pressure from Pointer Events; mouse as 0.5 | Points are smoothed, quantised and batched; the stroke carries its tool | One `lineTo` per mouse event |
| Layers as separate surfaces, with create, remove and move as messages and as undo entries | Layers have ids, not positions, so two people's layer changes cannot hit the wrong layer | One DOM canvas per layer; 1024 × 1024 fixed |
| Separate channels for canvas and for "game control" messages | Rooms, tickets, roles | No late join; a disconnect ending the session; hard-coded `ws://` |
| Taking turns | Becomes an optional room mode later ("one pen at a time"), and the game itself (prompts, story, votes) could return as a room type | Undo as full PNGs in one shared history |

### 5.7 Single-user first

Alone, the engine is its own authority: it numbers ops itself and writes them
to the local journal. In a room, the only differences are who assigns `seq`
and where the journal goes. Tools, undo, save and rendering are the same code.
Phase 1 must hold to two rules for this to stay true: **tools emit ops and
nothing else changes the document**, and **replaying a stroke op gives the
same pixels as drawing it live** (a test in phase 1 checks both).

---

## 6. Animation

### 6.1 Timeline model

Time is counted in frames at the work's frame rate. A timeline has
**tracks**, one per layer, top to bottom as in the layers panel:

- **Drawing track**: cels, each with `start` and `length`. A length above 1
  is a **hold**. Gaps are empty.
- **Motion** on a layer or a group: keyframes for position, scale, rotation,
  opacity. A key is `{frame, value, ease}`, ease being hold, linear or a
  curve.
- **Audio track**: clips with file, offset, trim and gain.
- **Reference track**: a 3D model with camera keys (6.4).
- **Effect track**: a shader with keyed settings (6.5).

Two views of the same data: a **filmstrip** (one row of frames for the active
layer; the default on phones and for flipbook work) and the **full timeline**
(all tracks). **Onion skin**: 0 to 3 frames each side, tinted, fading, for
the active layer or for all.

### 6.2 Playback

Playback steps whole frames. With audio, the audio clock leads and video
follows it; without, a time accumulator. The engine keeps a window of cels
loaded ahead of the playhead; when a work is too large for memory, playback
uses a cached flat preview at reduced size, built once and thrown away on
edit.

### 6.3 Audio

Import MP3, OGG or WAV (page file picker, bytes to the engine and to the
project). The engine plays it (Godot can build MP3, Ogg and WAV streams from
bytes at run time **[recheck on web 4.6]**), so the desktop build behaves the
same. Waveform peaks are computed once in the page (`decodeAudioData`) and
sent to the engine. For export the page decodes and encodes the audio itself.
Microphone recording is later.

### 6.4 3D reference models

A `reference3d` layer shows a model in its own viewport over or under the
drawing: orbit, pan, zoom, a few lighting and flat-shading presets, opacity,
and camera keys on the timeline. Models: a built-in mannequin and simple
shapes; glTF binary files loaded at run time (`GLTFDocument`, **[recheck on
web]**), at most 20 MB and about 200,000 triangles, textures reduced to
1024 px. Reference layers are left out of exports unless switched on. Posing
a skeleton is later. This is a self-contained layer kind and can be pulled
forward to any phase after 1.

### 6.5 Shaders and scripts

- **Shaders**: an effect layer applies a Godot `canvas_item` shader to what
  is below it or to one layer. A built-in set first (colour adjust, pixelate,
  halftone, outline, glow, wobble, scanlines), each with named settings that
  can be keyed. Then "write your own" in an HTML code field; the engine
  compiles it at run time. The web export runs the Compatibility renderer
  (WebGL 2) **[recheck for 4.6]**, so shaders must stay within it.
- **Scripts, safely.** A script someone else wrote, running in your tab, can
  call the page and act as you on webpaint.ing. So:
  1. **Expressions** on any keyable setting (for example
     `sin(frame * 0.3) * 20`): evaluated by a small evaluator given only the
     frame number, time and the layer's own values. Safe to share once that
     evaluator is audited **[recheck: what Godot's `Expression` can reach]**.
  2. **GDScript behaviours** on a layer (`_frame(n)` returns transforms or
     draws): **local only.** They run only on the device and account that
     wrote them, are stored in the project, are never sent through rooms,
     and never run on the server.
  3. Opening a project that contains scripts or custom shaders you did not
     write asks first, and the default is no; without them those layers show
     their last baked frames.
  4. What is published is always baked pixels. Viewers never run anything.
  Sharing scripts needs a sandbox and a review step: not designed, not
  promised.

### 6.6 Export, in the browser

The page encodes; Godot only draws.

1. The shell sends `export.start`. The engine switches to export mode: the
   canvas takes the export size, only the composition is drawn, and the shell
   covers it with a progress panel.
2. For each frame the engine sets the time, draws, and posts `export.frame`
   from its after-draw callback. In that same browser task the shell makes a
   `VideoFrame` from the canvas and gives it to a WebCodecs `VideoEncoder`.
   When the encoder's queue is short, the shell sends `export.next`. It is
   not real time: a slow device takes longer, never drops frames.
3. Audio is mixed by the page (`OfflineAudioContext`) and encoded with
   `AudioEncoder`. A small JavaScript muxer writes the file.

Formats: **MP4 with H.264 and AAC** (default; plays everywhere), **WebM with
VP9 or AV1 and Opus**, GIF and APNG for short loops, PNG sequence as a zip,
PNG or WebP for stills and comic pages. Starting limits as in
animator-design.md: 60 seconds, 1920 × 1080, 50 MB. The stopped prototype in
`client/src/animator/engine/` (`exporter.js`, `zip.js`, `storage.js`, with
tests) is plain JavaScript and is the starting point for these shell modules.

What Godot's web export cannot do here: it has no video encoder, its Movie
Maker mode is a desktop feature **[recheck]**, and it cannot call WebCodecs
except through the page. Where WebCodecs is missing, the fallback is
`MediaRecorder` on `canvas.captureStream()`: real time only, with less
control over quality. **[recheck]** per browser in phase 0: `VideoEncoder`
codecs on Safari (macOS and iPadOS), Firefox and Android Chrome; AAC in
`AudioEncoder`; that a `VideoFrame` taken from the WebGL canvas in the
after-draw callback is never blank.

The server never transcodes. It checks container headers only (codec, size,
duration, dimensions) as animator-design.md section 5 sets out, stores the
file on disk, and nginx serves it with range requests.

---

## 7. Comics and manga

### 7.1 Making pages

A comic work has one sheet per page. Added layer kinds:

- **Panels layer**: panel frames as shapes with a gutter setting, made by
  cutting the page (drag a line across a panel to split it) or from
  templates (four-panel strip, grids, manga page with bleed and safe-area
  guides). Drawing layers can clip to panels.
- **Text layer**: balloons (shape, tail, text). Text is typed in an HTML
  field over the canvas and drawn by the engine in a lettering font.
  Vertical text for manga **[recheck: Godot's text server on web]**; the
  fallback stacks characters. Fonts: a small bundled set with open licences
  (each needs Mae's yes and a licence check before download).

**Reading direction** is a setting of the series: left-to-right,
right-to-left, or vertical scroll. It sets the page strip's direction in the
editor, panel numbering, and how the reader turns pages and pairs spreads.

### 7.2 Series, chapters, pages

```
series   { id, owner, slug, title, about, direction, cover, visibility }
chapters { id, series, number, title }
pages    { id, chapter, position, file, width, height, release }
releases { id, owner, kind: pages | wip, series?, chapter?, work?, note,
           subscribers_at, public_at (null = subscribers only), post_id }
```

Reader pages on webpaint.ing: `/{username}/{series}` and
`/{username}/{series}/{chapter}`.

### 7.3 Batch publishing

"Publish pages" in the editor: pick pages (default: all changed since the
last release), choose the chapter and the audience, press once.

1. The shell exports each page flat (PNG or WebP) and uploads them to
   `POST /api/releases/{id}/files`, resumable, in order.
2. `POST /api/releases/{id}/commit` puts all pages into the chapter **in one
   database transaction**: readers see none or all, in order.
3. The service tells webpost.ing once: one post (or one update to the
   series' post), one notification to followers ("12 new pages"), not twelve.

### 7.4 Subscribers first, and animation WIPs

A release has two times: when subscribers see it and when everyone does
(`public_at` empty means subscribers only). Media of a subscriber-only
release lives under `private/` and is served only after the service asks
webpost.ing `/internal/subscriptions/check` (answer cached for 5 minutes).
webpost.ing has a Subscribers section but no subscriptions behind it, so
**today that check is true only for the owner**: a "subscribers" release is
private until subscriptions exist, and needs no change here when they do. A
timer in the service makes a release public at `public_at` and tells
webpost.ing to move its post.

An **animation WIP** is a release of kind `wip`: an exported clip or still
and a note, attached to a work, with the same audience and times. One
button in the animation editor: "Share WIP".

On webpost.ing a release becomes one post in the matching section
(`subscribers` or `profile`) holding a `webpaint` block (section 8).

---

## 8. The link with webpost.ing

**Both directions** (her sentence could mean either; this is the default
until she says otherwise):

- **From webpaint.ing: "Post to webpost.ing".** In the publish dialog the
  work is exported and stored on webpaint.ing; then the service calls
  webpost.ing to create a post for that user containing a `webpaint` block.
  The dialog shows the new post's link.
- **From webpost.ing: "Draw in webpaint".** A button in the post editor
  opens `https://webpaint.ing/new?return=<post id>`; publishing there adds
  the block to that draft and returns. An existing `webpaint` block has
  "Edit in webpaint" for its owner.

**The API** is server to server on loopback, with the shared secret:

```
POST /internal/integrations/webpaint/posts
{ "userId": 7, "postId": null, "title": "Chapter 3", "summary": "12 new pages",
  "section": "profile", "published": true,
  "block": { "type": "webpaint", "kind": "image | video | comic | wip",
             "ref": "w_9f2", "width": 1920, "height": 1080, "durationMs": 6000 } }
→ { "postId": 412, "url": "https://webpost.ing/mae/chapter-3" }
```

webpost.ing treats this exactly as a post from that user: the same
validators, daily post limit and notifications. The block is a new node type
(`WebpaintNode.jsx`, a `case "webpaint"` in `PostContentValidator` and
`PostTextExtractor`, following the "add a block type" recipe). It stores only
`kind`, `ref` and sizes; the address is built from `ref`, never stored as
free text. In a post it shows the image, or a poster with a play button that
uses the pop-up player, or a comic's cover with "Read", which opens the
reader on webpaint.ing.

**Media stays on webpaint.ing** ("application data separate"): webpost.ing
loads it from `https://webpaint.ing/media/…` (its security policy gains that
origin for images and media). Subscriber-only media cannot rely on the
webpaint cookie from inside a webpost.ing page, so for those webpost.ing's
server, which knows the viewer, asks the webpaint service for a link that
expires in 10 minutes and is signed with the shared secret.

**Allowance**: webpaint.ing has its own storage allowance per account,
separate from webpost.ing's 50 MB. The service refuses uploads when the disk
has less than 5 GB free.

---

## 9. UI and UX

### 9.1 Layouts

**Desktop** (1100 px and wider): the canvas takes all the space left over.

```
┌ HTML bar: ‹ webpaint · title · saved    Undo Redo      Export · Publish · account ┐
├──┬ tool options: size ── opacity ── smoothing ─────────────────────────────┬──────┤
│▣ │                                                                         │Colour│
│▣ │                                                                         ├──────┤
│▣ │                              canvas                                     │Layers│
│▣ │                                                                         │      │
│▣ │                                                                         ├──────┤
│▣ │                                                                         │Ref 3D│
├──┴─────────────────────────────────────────────────────────────────────────┴──────┤
│ ▶ ◀▶  12 fps   timeline: tracks × frames (drag its top edge; folds to a filmstrip)│
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Tablet with pen** (600 to 1100 px): nothing is docked. A tool rail on one
side (a switch moves it for left-handed use), with two tall sliders for size
and opacity under the thumb of the other hand. Colour, layers and reference
open as panels from rail buttons and close when the pen touches the canvas.
The timeline is one filmstrip row that pulls up into the full timeline. Two
fingers pan, zoom and (optionally) rotate the view; two-finger tap is undo,
three-finger tap is redo; fingers do not draw once a pen has been seen.

**Phone** (under 600 px): the canvas fills the screen. One bottom row of five
(brush, eraser, colour, layers, more); a size slider on the left edge; the
filmstrip sits above the bottom row in animation works; panels are bottom
sheets (solid, not glass). The HTML bar shrinks to back, title and Publish;
the rest goes in "more". Phones are for sketching, reviewing and publishing,
not for the full timeline.

### 9.2 Design language shared with webpost.ing

- **Grayscale chrome.** Colour appears only in the artwork, the colour
  picker and meaning (danger). Flat fills, raised edges from light and dark
  inset lines, no gradients, no blur, no glass.
- **Tool panels are the grid editor's family** (DESIGN-RULES "Always" 5):
  dark panels of pixel buttons, pixel text, the same 8 × 8 icon table as
  `PixelIcon.jsx`, white means "on", sections fold one at a time, steppers
  and dropdowns of the grid kind. These live in Godot, built from the shared
  tokens (13.3).
- **The app font is for HTML.** Everything in the shell uses `--app-font`;
  everything in Godot panels is pixel text. No third family.
- **Springy controls**: a press sinks a button by its edge and it springs
  back on the shared easing curve; durations come from the tokens.
- **Plain words, no floating notes, no helper paragraphs, no emojis.** Icon
  buttons have a hover label that also shows on long-press.
- Touch targets at least 40 px. The artwork is never rotated by the app's
  layout (rotating the *view* while drawing is a tool, off by default).

### 9.3 The five interactions that must feel right first

1. **Pen down to ink.** No missed first dot, no stray marks from a palm, a
   pressure curve that feels like a pencil, smoothing that does not lag the
   tip. Measured in phase 0.
2. **Pan and zoom.** Pinch, space-drag and wheel, anchored under the fingers
   or cursor, never drawing by accident.
3. **Undo and redo.** Instant, by key, by button and by two-finger tap;
   always exactly one step.
4. **Flipping frames.** Dragging along the filmstrip and the `,` `.` keys
   show each frame without a hitch, with onion skin following.
5. **Colour and size without leaving the drawing.** Hold to pick a colour
   from the canvas, a size slider under the thumb, `[` and `]`.

---

## 10. Repository and delivery

### 10.1 Layout of the new repository (`webpaint`)

```
engine/               Godot 4.6 project
  project.godot  export_presets.cfg
  core/               document, ops, apply, undo, journal (no nodes; headless tests)
  brush/              stamps, smoothing, pixel brush, shaders, stroke buffer
  ui/                 panels, tool rail, timeline, layout; ui/theme/ built from tokens
  host/               Host interface: host_web.gd (bridge), host_native.gd (desktop)
  net/                room client
  tests/              run with: Godot --headless --path engine -s tests/run.gd
shell/                Vite + React (same stack as webpost.ing's client)
  src/bridge/ pen/ store/ export/ pages/ components/ styles/   public/engine/ (export output, not in git)
server/               Node service: src/http/ auth/ works/ uploads/ rooms/ db/migrations/  test/
protocol/             bridge.md, room.md, JSON fixtures used by engine, shell and server tests
design/               tokens.json, icons.json  (the one source; see 13.3)
tools/                export-engine.sh, run-local.sh, release.sh, install-release.sh,
                      gen-tokens.mjs, check-tokens.mjs, server/first-install.sh, visual/, smoke/
config/               deploy.env.example, release.env.example
guide/                ARCHITECTURE.md (this file), WORKING-HERE.md, DESIGN-RULES.md, briefs/
.claude/agents/       implementer, integrator, visual-tester, design-guardian, screen-checker, …
```

### 10.2 Build and export on her Mac

1. `tools/gen-tokens.mjs` writes the shell's `tokens.css` and the engine's
   `tokens.gd` from `design/tokens.json`.
2. `tools/export-engine.sh`:
   `"/Applications/Godot-4-6.app/Contents/MacOS/Godot" --headless --path engine --export-release "Web" ../shell/public/engine/index.html`
   with a preset that has thread support off, then renames the outputs with
   a content hash and writes `.gz` copies. (Godot is not on the PATH; the
   script takes the path from `GODOT` with that default. Preset option names
   **[recheck]**.)
3. Tests: engine headless tests, `shell` vitest, `server` tests against a
   local `webpaint_test` database, `tools/check-tokens.mjs`.
4. `vite build` for the shell.

### 10.3 Releasing

The same approach as webpost.ing (`tools/release.sh` → `install-release.sh`):
test and build on the Mac, pack `html/` and `server/` (with `node_modules`)
into one archive, upload to `~/incoming`, install with sudo: dump the
`webpaint` database, swap the web root and server folder by rename, restart
`webpaint.service`, wait for `GET /api/health`, roll back by itself if it
does not answer. Settings in the server's own `deploy.env` and her local
`release.env`; nothing about the server in the repository. Nothing is built,
tested or installed with npm on the droplet. A release never changes nginx.

### 10.4 What Mae does herself, in order

| When | What |
|---|---|
| Now | Answer section 12. Create an empty GitHub repository (the GitHub CLI is not installed on this Mac, so on github.com) and say its name. |
| End of phase 0 (a static page exists) | GoDaddy DNS: `A` record for `@` to the droplet's address, `CNAME` for `www` to `webpaint.ing`, remove parking records. On the droplet with sudo: `mkdir /srv/webpaint/html`, the nginx block of 2.6 (static parts only at first), then `certbot --nginx -d webpaint.ing -d www.webpaint.ing`. Check `https://webpaint.ing` loads. Then try the spike on her iPad. |
| Before the first phase 1 release | On the droplet, once, with the provided `tools/server/first-install.sh` (run with sudo; she reads it first): install the Node runtime, create the `webpaint` database and role, the service user, `/srv/webpaint/data`, the systemd unit, `deploy.env`. Put the same `SSO_WEBPAINT_SECRET` in both `deploy.env` files. Deploy the webpost.ing release that adds the SSO bridge. Add the `/api/`, `/auth/`, `/media/` locations to nginx. |
| Before phase 3 (rooms) | Add the `/ws/` location. |
| Before video uploads are open to other people | Look at the droplet's disk and monthly transfer; decide on a storage volume or a resize (question 9). |
| Whenever she chooses | Approve downloads: lettering fonts, a muxer library. |

---

## 11. Phases and work packages

| Phase | Ships | De-risks |
|---|---|---|
| **0. Spike** (one session) | The repository skeleton and a test page: Godot 4.6 single-threaded export in the shell, a pressure brush on a 2048 px canvas fed by the page's pen path (with a switch to Godot's own input to compare), a layer-allocation test, a bridge throughput test, a 5-second WebCodecs export from the canvas, the test bridge, the token generator. A results note with numbers from her Mac, and from her iPad once the page is on the domain. | Risk 1 (pen feel, memory), the export path, bytes across the bridge, the security policy, and whether Godot can wear the house look. Decides go, adjust, or fall back. |
| **1. Paint** | webpaint.ing live: sign in with the webpost.ing account, draw (round brush, pixel brush, eraser, fill, colour picker), layers, undo, autosave on the device, project file save and open, PNG export, publish an image, "Post to webpost.ing". | The hand-off, the release pipeline, the op model, the Godot theme, the first three interactions. |
| **2. Animate** | Frames and cels, filmstrip, onion skin, playback, holds; export MP4, WebM, GIF; resumable video upload with header checks; "Share WIP"; video block on webpost.ing. | Memory with many cels, export on every browser, interaction 4, bandwidth. |
| **3. Rooms** | Shared canvases: invite, live strokes, per-person undo, snapshots, reconnect. | That phase 1's rules held; server load. |
| **4. Comics** | Pages, panels, lettering, series and chapters, the reader, batch publishing, subscriber-first releases. | Text in the engine; the release flow; the Subscribers link. |
| **5. Timeline depth** | Full timeline: motion keys and easing, audio tracks with waveforms, 3D reference layers, effect layers with the built-in shaders, expressions. | Timeline on touch; audio sync in export. |
| **6. Power tools** | Custom shaders, local GDScript behaviours, desktop builds, project files stored on the server. | Sandboxing questions; signing desktop apps. |

### 11.1 Phase 0 work packages (disjoint files; can start when the repository exists)

The contracts the packages build against are sections 2.2, 2.3 and 13 of
this document; nobody waits for anybody.

| Package | Files it owns | Does |
|---|---|---|
| **P0-A skeleton** | `README.md`, `.gitignore`, `config/**`, `guide/**`, `.claude/agents/**` | Repository skeleton. Copies this document to `guide/ARCHITECTURE.md`; copies `guide/DESIGN-RULES.md` and the agent definitions from webpost.ing (`visual-tester`, `design-guardian`, `implementer`, `integrator`, `screen-checker`, `ui-reviewer`, `senior-engineer`, `auditor`, `design-reviewer`) and edits their paths, ports and test commands for this repository; writes `guide/WORKING-HERE.md` and `guide/briefs/README.md`. |
| **P0-B tokens** | `design/**`, `tools/gen-tokens.mjs`, `tools/check-tokens.mjs`, `shell/src/styles/tokens.css` (generated), `engine/ui/theme/**` | `tokens.json` from webpost.ing's `tokens.css` values, `icons.json` from `PixelIcon.jsx`'s table and the 5 × 7 pixel font; the generator; a Godot theme builder; one sample dark panel with pixel buttons. |
| **P0-C engine spike** | `engine/project.godot`, `engine/export_presets.cfg`, `engine/spike/**`, `engine/brush/**` | The canvas scene, GPU stamp brush with pressure and smoothing, stroke buffer, pixel brush, the layer-allocation test, frame-by-frame export mode. |
| **P0-D engine host** | `engine/host/**`, `protocol/**` | `host_web.gd` (messages, pointer batches, bytes in and out), `host_native.gd` stub, the test bridge on the engine side (section 13), `protocol/bridge.md` and fixtures. |
| **P0-E shell** | `shell/**` except `shell/src/styles/tokens.css` and `shell/src/export/**` | Vite project, the page that loads the engine, `bridge/`, `pen/` capture, the test bridge on the page side, a results panel that shows measurements, the service worker, the strict security policy in report-only mode. |
| **P0-F export spike** | `shell/src/export/**` | Canvas to `VideoFrame` to `VideoEncoder` to a muxer, with the `MediaRecorder` fallback, starting from `client/src/animator/engine/exporter.js` and `zip.js` in webpost.ing. |
| **P0-G tools** | `tools/export-engine.sh`, `tools/run-local.sh`, `tools/visual/**`, `tools/smoke/**` | The export script, a local run script, the first recorded flow (draw three strokes, undo one) with baselines, using the test bridge. |
| **P0-H results** (after the others) | `guide/phase0-results.md` | Integrator: builds, runs everything, records the numbers (download size, time to first stroke, samples per second, stroke latency, layers before failure, bridge megabytes per second, export time, which browsers encode what), lists every **[recheck]** in this document as confirmed or wrong, and recommends go, adjust or fall back. |

### 11.2 Phase 1 work packages

| Package | Files it owns |
|---|---|
| **1-A document core** | `engine/core/**`, `engine/tests/core/**`: document, ops, `apply`, undo by checkpoint and replay, journal; the replay-equals-live test. |
| **1-B brushes** | `engine/brush/**`, `engine/tests/brush/**`: round and pixel brushes, eraser, fill, colour pick. |
| **1-C engine UI** | `engine/ui/**` except `ui/theme/` generated files: tool rail, tool options, colour picker, layers panel, the three layouts. |
| **1-D host and storage** | `engine/host/**`: save and load through the host, tiles out, snapshot in. |
| **1-E pen and bridge** | `shell/src/pen/**`, `shell/src/bridge/**` and their tests. |
| **1-F device store** | `shell/src/store/**`: OPFS works, journal, revisions, `.webpaint` zip in and out; tests. |
| **1-G shell pages** | `shell/src/pages/**`, `shell/src/components/**`: top bar, library, new-canvas and publish dialogs, signed-out state. |
| **1-H auth** | `server/src/auth/**`, `server/src/db/**`, `server/test/auth/**`: migrations, sessions, start and callback, re-check, internal routes. |
| **1-I works and uploads** | `server/src/http/**`, `server/src/works/**`, `server/src/uploads/**`, `server/src/index.js`, tests: router, health, origin check, works, image upload, media access, the call to webpost.ing. |
| **1-J webpost.ing side** (in the webpost.ing repository, its own batch) | New: `SsoBridgeController.java`, `WebpaintIntegrationController.java`, `WebpaintNode.jsx`, tests. Insertions for the integrator: `PostContentValidator`, `PostTextExtractor`, `Editor.jsx`, `Viewer.jsx`, the login page's `next`, `evictSession`'s push, `config/deploy.env.example`. |
| **1-K release** | `tools/release.sh`, `tools/install-release.sh`, `tools/server/**`, `config/**`, `guide/DEPLOYMENT.md`. |
| **1-L watching** | `tools/visual/**`, `tools/smoke/**`: flows and baselines for draw, undo, layers, save and reopen, sign-in, publish; then a `design-guardian` pass before hand-over. |

---

## 12. Open questions for Mae

Each can be answered in a line. The default is what happens if she does not.

1. **A Node runtime on the droplet** for the webpaint service (running only,
   never building)? Default: yes. Otherwise a second Java service, about
   150 MB more memory.
2. **Repository name and visibility?** Default: `webpaint`, public like
   webpost.ing.
3. **Which way does the "direct upload" button go?** Default: both ("Post to
   webpost.ing" in webpaint, "Draw in webpaint" in the post editor).
4. **Which devices first?** Default: desktop with a drawing tablet and iPad
   with Pencil; phones for sketching and publishing.
5. **Largest canvas?** Default: 4096 px on desktop, 2048 px on tablets and
   phones, adjusted by what phase 0 measures.
6. **Who may sign in to webpaint.ing at first?** Default: only you until
   phase 1 is finished, then every webpost.ing account.
7. **Storage per account on webpaint.ing?** Default: 250 MB, separate from
   webpost.ing's; video at most 60 seconds and 50 MB; you can raise it per
   person.
8. **After animation: shared canvases, then comics?** Default: yes, in that
   order. Say if comics should come first.
9. **Resize the droplet?** Default: no. Add a storage volume before video
   uploads open to others, after checking disk and monthly transfer.
10. **Subscriber-only releases are private to you until subscriptions exist
    on webpost.ing. Acceptable?** Default: yes.
11. **Scripts run only for the person who wrote them, never shared.**
    Default: yes.
12. **Rooms: invited, signed-in people only, at most 8.** Default: yes.
13. **A desktop app within the first year?** Default: no, but the code keeps
    the native path compiling.
14. **May a small open-source muxer library and open-licence lettering fonts
    be downloaded when their phase comes** (each named, with its licence,
    before the download)? Default: ask again then.
15. **`www.webpaint.ing` redirects to `webpaint.ing`.** Default: yes.

---

## 13. Testing by watching: the test bridge and the design rules

The `visual-tester` and `design-guardian` agents are used on both sites. The
Godot canvas has no DOM, so the page-engine contract includes a **test
bridge** that makes recorded flows repeatable and gives the reviewers facts
to check.

### 13.1 Test bridge

Present only in a test build: the engine is exported with a second preset
("Web test", feature tag `test`) and the shell exposes `window.webpaintTest`
only when built in test mode. Production builds contain neither. Each call
returns a promise; underneath they are ordinary bridge messages of type
`test.*`.

| Call | Does |
|---|---|
| `reset({seed, size})` | **Deterministic mode**: one clock that only `step` advances (all animation, playback, springs and autosave timers read it), noise and jitter seeded, cursor blink off, spring animations end at once, device pixel ratio 1, canvas at the given size, smoothing using the samples' own timestamps. |
| `load(name or document)` | Loads a known document from `protocol/fixtures/` (for example `two-layers-256`) with no journal. |
| `setTool({tool, size, color, opacity, smoothing})` | Sets tool and colour without touching the panels. |
| `pointer(samples)` | Feeds pen samples with pressure and tilt through the same path as real input (Playwright's mouse has no pressure). Real pointer moves at known coordinates still work and are what a flow uses to test the input path itself. |
| `step(frames)` | Advances the clock. |
| `rendered()` | Resolves after the next frame has been drawn, with its frame number, so a screenshot is never taken mid-draw. |
| `query("document")` | Layers, cels, op count, undo depth, selected tool and frame. |
| `query("pixels", cel)` | A hash of the cel's pixels (for exact checks such as the pixel brush and replay-equals-live). |
| `query("ui")` | Every named control in the engine: name, rectangle in page pixels, visible, pressed, its text, text size and colours. This is what lets a script click "tool.eraser" and lets `design-guardian` measure touch targets, contrast and spacing without a DOM. |

Flows live in `tools/visual/` in the webpaint repository, with their own
baselines. Baselines are recorded in headless Chromium (software rendering,
so the same picture on any machine **[recheck the flags]**) in deterministic
mode, at 1300 × 850 and 390 × 844, with the small per-pixel tolerance the
agent already uses. The engine's headless tests cover the document and op
logic with no browser at all.

### 13.2 How the design rules apply to a Godot UI

`guide/DESIGN-RULES.md` is copied into the new repository unchanged, with a
short added section for the engine:

- Rule "one font for the app": the HTML shell uses the app font; Godot panels
  use pixel text only (they are tool panels, "Always" rule 5).
- In engine code the guardian looks for: colours, sizes or font sizes written
  as literals outside the generated token file; theme overrides with literal
  values; blur or screen-reading shaders under `ui/`; rotation on artwork or
  panels; emojis in strings; controls smaller than the touch-target token;
  wording that differs from the shell's names for the same action.
- On screen it uses `query("ui")` plus screenshots at both widths, on a light
  and a dark artwork.

### 13.3 One source for tokens

`design/tokens.json` holds the grayscale palette, edges and shadows as
numbers, radii, control sizes (touch target, rail width, panel padding, tile
size), motion (durations and the spring curve), and the font names;
`design/icons.json` holds the 8 × 8 icons and the pixel font. Its values
start as a copy of webpost.ing's `client/src/styles/tokens.css` and
`PixelIcon.jsx`, with the commit they were taken from recorded in the file.

`tools/gen-tokens.mjs` writes both `shell/src/styles/tokens.css` and
`engine/ui/theme/tokens.gd` (each headed "generated, do not edit"), and the
engine builds its Godot theme from that file at start. `tools/check-tokens.mjs`
runs in the test step and in `release.sh` and fails if either generated file
is stale or edited by hand, so the shell and the engine cannot drift. A
second script compares `tokens.json` with a sibling webpost.ing checkout and
prints the differences, so the two sites drift only on purpose.

---

## 14. To recheck (collected)

Phase 0 confirms or corrects each of these in `guide/phase0-results.md`:

- Godot 4.6 web: Compatibility renderer only; audio behaviour in the
  single-threaded build; low-processor mode (redraw only on change) on web;
  run-time loading of glTF, MP3, Ogg and custom shader code in an exported
  web build; the text server's vertical layout; Movie Maker mode on web;
  export preset option names for the command line.
- The engine under a policy with `'wasm-unsafe-eval'` and without
  `'unsafe-eval'`.
- A faster way to move bytes from the engine to the page than base64.
- `VideoFrame` from the engine's canvas inside the after-draw callback;
  WebCodecs video and audio codecs per browser; the `MediaRecorder` fallback.
- iPad Safari: memory ceiling with the engine loaded, Pencil samples per
  second through the page path, canvas size limits.
- Undo by replay: time to replay 20 strokes at 2048 px on a tablet.
- What Godot's `Expression` can reach when given no base object.
- On the droplet: nginx `gzip_static` and `application/wasm`; how `/api/` is
  mapped to the webpost.ing server; disk size and monthly transfer.
- Memory of a small JVM service, only if question 1 is answered no.
- Headless Chromium flags for stable WebGL screenshots.
