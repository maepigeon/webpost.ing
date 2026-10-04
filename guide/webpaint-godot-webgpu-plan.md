# Plan: WebGPU in Godot's web export, for webpaint.ing (2026-10-03)

Status: a plan only. Mae decided webpaint.ing stays on Godot and said she will
ask for this later. Nothing here is started; no engine source or toolchain is
downloaded until she says so. Everything marked **[recheck]** is from memory
and must be confirmed by the research step before work begins.

## What the modification is

Godot 4 has two families of renderer. *Compatibility* talks to OpenGL / WebGL 2
directly; it is the only one the web export has. *Forward+* and *Mobile* talk
to an abstraction called `RenderingDevice`, which has one driver per graphics
API (Vulkan, Direct3D 12, Metal). Compute shaders exist only through
`RenderingDevice`.

So "WebGPU in Godot" means: **a new `RenderingDevice` driver for WebGPU, and a
web platform that can start the Mobile renderer on it.** Parts:

1. **The driver** (`drivers/webgpu/`): buffers, textures, samplers,
   framebuffers and render passes, render and compute pipelines, uniform sets
   as bind groups, command recording, the swap chain on the page's canvas.
   Written against the WebGPU C API that Emscripten provides **[recheck which
   binding is current]**.
2. **Shaders.** Godot compiles its shaders to SPIR-V; WebGPU takes WGSL. A
   translator (Tint, from Google's Dawn, or Naga) is needed, either inside the
   engine (bigger download) or run at export time so the browser only receives
   finished WGSL (smaller; fits Godot's export-time shader baking **[recheck]**).
3. **Gaps between what Godot assumes and what WebGPU allows:** no push
   constants (emulate with a small uniform buffer), limits on storage texture
   formats, four bind groups, and **reading pixels back is asynchronous** in
   WebGPU while several Godot calls expect an answer at once. The last one
   touches save and export in webpaint.ing and is the hardest single item.
4. **Web platform and build:** create the device and surface from the canvas,
   a build option, export-template and exporter changes, the JavaScript glue.
5. **A fallback.** Browsers without WebGPU still need the WebGL 2 build, so
   webpaint.ing ships two engine builds and the page picks one.

## How big

- New C++: roughly **10,000 to 20,000 lines** (the existing drivers are each
  several thousand lines **[recheck]**), plus a vendored translator if it runs
  in the browser.
- Touches `drivers/`, `platform/web/`, a little of `servers/rendering/`, the
  editor's web exporter, the SCons build, `thirdparty/`.
- It is a fork: every Godot release (4.6 → 4.7 …) means re-applying the patch
  series and rebuilding the export templates.
- For an experienced engine developer this is months. With workers it is a
  sequence of milestones, each provable, and it can stall on a hard one. No
  promise that the full Mobile renderer runs; the target is narrower (below).

## Milestones (each ends with something seen in a browser)

0. **Research.** What exists upstream or in community branches (a draft
   driver would change everything). Current WebGPU support in Chrome, Safari
   (Mac and iPad), Firefox, Android. Decide: build on someone's branch, or
   from the stock engine.
1. **Toolchain.** A container that builds *unmodified* Godot 4.6 web export
   templates from source; webpaint.ing runs on them exactly as today. Proves
   the pipeline before any change.
2. **Driver skeleton.** Device, surface, swap chain: the canvas clears to a
   colour through `RenderingDevice`.
3. **Shaders and 2D.** SPIR-V to WGSL; push-constant emulation; Godot's 2D
   canvas renderer draws the interface and a sprite.
4. **Compute.** A GDScript `RenderingDevice` compute shader runs in the
   browser and writes a texture that is shown. *This is the point of the
   whole exercise for webpaint.ing.*
5. **Read-back, resize, lost device, limits.** Save and export work.
6. **3D as far as reference models need** (the Mobile renderer's scene
   shaders are the largest translation risk).
7. **webpaint.ing uses it:** the GPU-operation interface gets compute
   implementations; the WebGL 2 build stays as the fallback; both measured.
8. **Upkeep:** the patch series kept small and rebased per release; offer it
   upstream if it is good enough.

Stop points: after 1 (cost known), after 4 (does compute pay for itself in
measured brush, fill and simulation speed?).

## Where to do it: the gaming PC, in a container

| | Mac (M2 Pro) | Gaming PC, Windows + Docker (WSL 2) | Gaming PC, Linux |
|---|---|---|---|
| Building the engine | Works; ties up the machine she works on | Fast (more cores), isolated, repeatable | Same, simplest toolchain |
| WebGPU in the browser for testing | Chrome and Safari both have it; Safari on a Mac is the closest thing to her iPad | Chrome on Windows is the most mature WebGPU (Direct3D 12) | Chrome's WebGPU on Linux has lagged **[recheck]** |
| Disk and clutter | 3–5 GB of source and toolchain on her Mac | Stays in the container and its volume | Same |

Recommendation: **build on the gaming PC in a Linux container; test in the
PC's own Chrome (real GPU); then check on the Mac in Safari and on the iPad.**
A container has no GPU, so the browser always runs on the host, not inside it.
Windows with Docker Desktop is fine for this; native Linux is not needed.

What that needs:
- On the PC: Docker Desktop (WSL 2 backend), Git, Chrome, and Claude Code
  running there as its own session, with the private `webpaint.ing`
  repository checked out. That session and the Mac one share work through
  git only.
- Keep the engine source in the container's volume or the WSL 2 filesystem,
  not on a Windows-drive bind mount (ten times slower to compile).
- The container: Python, SCons, the Emscripten SDK pinned to the version
  Godot 4.6 expects **[recheck]**, a script `build-templates.sh` that outputs
  export templates into a folder, and webpaint.ing's `export-engine.sh`
  pointed at them.
- Mae's yes for each download: Godot's source, the Emscripten SDK, the shader
  translator. Nothing else.
- Rebuilding "as needed" is then one command inside the container: a full
  build is tens of minutes, an incremental one a few.

## What stays true meanwhile

The six GPU features (stamping, compositing and blend modes, filters,
transform / warp / liquify, fill and selection, simulation brushes) are built
now as ordinary shader passes on WebGL 2, behind one interface, so they do not
wait for any of this and compute versions can replace them one at a time.
