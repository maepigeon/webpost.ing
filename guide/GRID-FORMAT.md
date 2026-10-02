# The grid format (v3)

A grid is the one picture format of the site: post blocks, wallpapers, card
stickers, the profile banner, the home page's text and (soon) sticker and
symbol packs are all grids. It is JSON; the client rebuilds it with
`normaliseGrid` (`TileGrid/tileGrid.js`) and the server with `GridValidator`,
and **the two must agree**: both keep exactly the fields below and drop the rest.

## Geometry

- A tile is 16 × 16 grid pixels; the editor draws each grid pixel 4 × 4.
- A tile holds either **two narrow characters** (two 8 × 16 slots) or **one wide
  character** (a 16 × 16 cell). Width is per tile, so both share a row.
- Text is stored two slots to a tile: slot `s` of row `r` is in tile column
  `s >> 1`. A tile listed in its layer's `wide` holds one wide character in its
  first slot (the second stays empty).
- Limits: 1–64 columns, 1–48 rows, 1–10 layers (the banner: 32 columns, 12 rows).

## Shape

```jsonc
{
  "v": 3,                       // format version
  "cols": 16, "rows": 6,
  "edges": "smooth" | "pixel",  // optional antialiasing; absent = original look
  "glyphs": { "★": "<hex>" },   // custom characters: 32 hex digits (8 wide) or 64 (16 wide)
  "links": [ { "href": "/mae" | "https://…", "tiles": ["r,c", …] } ],
  "ext": { "<namespace>": <json> },   // see Extensions
  "layers": [ /* bottom first */
    { "id": "a1", "kind": "pixel", "name": "Text", "visible": true,
      "paint": "data:image/png;base64,…" | null,   // painted pixels, grid-sized PNG
      "text": ["row 0 chars", …],                    // slots, trailing spaces trimmed
      "style": { "r,s": { "color": "#rrggbb", "font": "pixel" | "small" (Mini) | "smooth" | "xl" | "bold" | "italic" | "outline" | "serif" | "script" | "cute" | "comic" | "serifpx" | "sanspx" | "symbols" } },
      "wide": ["r,c", …],
      "ext": { … } },
    { "id": "b2", "kind": "photo", "src": "/uploads/…", "scale": 1, "x": 0, "y": 0 }
  ]
}
```

Anything not painted is transparent. A photo must be one of the app's own
uploads; paint must be a PNG data URL; link addresses must be `http(s)` or a
path on this site. Nothing else is kept: that is what makes grids safe to show.

## Extensions

`ext` (on a grid, or a layer) is how the format grows without a new validator
for each idea. `{ "<namespace>": <json> }`: namespaces are lowercase words
(`^[a-z][a-z0-9-]{0,23}$`), values plain JSON no deeper than 6, an ext at most
16,000 characters written out. It survives every load and save on both sides;
anything malformed is dropped. A feature owns its namespace (`sticker`,
`credit`, `anim`…) and must treat missing or odd data as "not there".
When a field needs the renderer's help or is worth validating strictly, promote
it from `ext` to a real field and bump the version.

## Versions

| v | Change |
|---|---|
| 1–2 | One width for the whole grid (`mode`: `full` or `half`); text one slot per character. |
| 3 | Width per tile (`wide`), text always two slots to a tile; `edges`, `links`, `ext`, the `small` font (shown as "Mini"). |

Older grids are upgraded on load, on the client and in `GridValidator`: a grid
with no `v` or `v < 3` and `mode` other than `half` becomes narrow text with a
`wide` tile per character, so it looks the same. A new version adds one step
to that upgrade; never rewrite stored grids in a migration.

## Where each piece lives

| Piece | File |
|---|---|
| Model, normalise, render | `client/.../TileGrid/tileGrid.js` |
| Editor | `TileGrid/TileGrid.jsx` |
| Pixel font, symbols | `tileFont.js`, `bitmapFonts.js` (serif, sans-serif, symbols), `symbols.js` (default pack "Basics"), `PixelText.jsx`, `GridButton.jsx` |
| Text laid out as a grid | `client/src/utils/gridText.js` |
| Server validation | `server/.../validator/GridValidator.java` |
