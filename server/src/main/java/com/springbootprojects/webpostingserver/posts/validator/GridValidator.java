package com.springbootprojects.webpostingserver.posts.validator;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Validates a tile grid — the pixel-art format used by post blocks, wallpapers
 * and page themes — and rebuilds it from known fields only.
 *
 * Mirrors normaliseGrid() in client/src/.../TileGrid/tileGrid.js. Anything a
 * grid can make a browser load is pinned down here: paint is a PNG data URL and
 * nothing else, and a photo is one of the app's own uploads, so a stored grid
 * can never point a reader's browser at an arbitrary URL.
 */
public final class GridValidator {

    private GridValidator() {}

    static final ObjectMapper MAPPER = new ObjectMapper();

    private static final Pattern PNG = Pattern.compile("^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$");
    private static final Pattern UPLOAD = Pattern.compile("^/uploads/[A-Za-z0-9._-]{1,200}$");
    private static final Pattern HEX = Pattern.compile("^#[0-9a-fA-F]{6}$");
    private static final Pattern GLYPH = Pattern.compile("^([0-9a-f]{32}|[0-9a-f]{64})$");
    private static final Pattern SLOT = Pattern.compile("^\\d{1,3},\\d{1,3}$");
    // A link from tiles: a path on this site or a web address, nothing that runs.
    private static final Pattern LINK = Pattern.compile("^(/(?!/)\\S*|https?://[^\\s/$.?#]\\S*)$", Pattern.CASE_INSENSITIVE);
    private static final int MAX_LINKS = 64;
    // Font ids a character's style may name; keep in step with FONT_NAMES in tileGrid.js.
    private static final Set<String> FONTS = Set.of("pixel", "small", "smooth", "xl", "bold", "italic", "outline");
    // `ext`: data this validator doesn't know about, kept as it came (see
    // tileGrid.js): { "<namespace>": <JSON> }, plain JSON only, bounded.
    private static final Pattern EXT_NAMESPACE = Pattern.compile("^[a-z][a-z0-9-]{0,23}$");
    private static final int EXT_MAX_CHARS = 16000;
    private static final int EXT_MAX_DEPTH = 6;
    private static final Pattern LAYER_ID = Pattern.compile("^[A-Za-z0-9]{1,32}$");
    private static final int MAX_LAYERS = 10;
    private static final int MAX_PAINT_CHARS = 700_000;

    public static class InvalidGridException extends Exception {
        public InvalidGridException(String message) { super(message); }
    }

    /**
     * Rebuilds a grid from known fields. Sizes are clamped to the given limits,
     * which are smaller for a wallpaper tile or a sticker than for a post.
     */
    public static ObjectNode normalise(JsonNode in, int maxCols, int maxRows) throws InvalidGridException {
        if (in == null || !in.isObject()) throw new InvalidGridException("A grid must be an object.");
        ObjectNode out = MAPPER.createObjectNode();
        int cols = clampInt(in.path("cols"), 1, maxCols, Math.min(16, maxCols));
        int rows = clampInt(in.path("rows"), 1, maxRows, Math.min(6, maxRows));
        // v3 sets each tile's width on its own: text is kept two slots to a
        // tile, and a layer's "wide" tiles hold one full-width character. A
        // grid from before (no v, or v < 3) was all one width, its "mode";
        // a full-width one is upgraded so each character keeps its tile.
        boolean legacyFull = in.path("v").asInt(0) < 3 && !"half".equals(in.path("mode").asText());
        out.put("v", 3);
        out.put("cols", cols);
        out.put("rows", rows);
        // How photos and smooth text are drawn: "smooth" (antialiased) or "pixel"
        // (snapped to the grid's pixels). Absent keeps the original look.
        String edges = in.path("edges").asText();
        if ("smooth".equals(edges) || "pixel".equals(edges)) out.put("edges", edges);

        out.set("glyphs", cleanGlyphs(in.path("glyphs"), 256));

        ArrayNode links = cleanLinks(in.path("links"), rows, cols);
        if (!links.isEmpty()) out.set("links", links);
        ObjectNode ext = cleanExt(in.path("ext"));
        if (ext != null) out.set("ext", ext);

        ArrayNode layers = out.putArray("layers");
        JsonNode inLayers = in.path("layers");
        Set<String> ids = new HashSet<>();
        if (inLayers.isArray()) {
            for (JsonNode l : inLayers) {
                if (layers.size() >= MAX_LAYERS) break;
                ObjectNode layer = normaliseLayer(l, rows, cols, legacyFull);
                if (layer == null) continue;
                String id = layer.path("id").asText();
                if (!ids.add(id)) continue;
                layers.add(layer);
            }
        }
        if (layers.isEmpty()) throw new InvalidGridException("A grid needs at least one layer.");
        return out;
    }

    /**
     * Custom characters: one character each, mapped to an 8×16 or 16×16
     * bitmap as hex. Anything else is dropped. Shared with pixel font libraries.
     */
    /** The well-formed namespaces of an ext, or null if none remain or it is too large. */
    static ObjectNode cleanExt(JsonNode in) {
        if (in == null || !in.isObject()) return null;
        ObjectNode out = MAPPER.createObjectNode();
        for (Iterator<Map.Entry<String, JsonNode>> it = in.fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> e = it.next();
            if (EXT_NAMESPACE.matcher(e.getKey()).matches() && plainJson(e.getValue(), 0)) out.set(e.getKey(), e.getValue());
        }
        if (out.isEmpty()) return null;
        return out.toString().length() <= EXT_MAX_CHARS ? out : null;
    }

    private static boolean plainJson(JsonNode v, int depth) {
        if (depth > EXT_MAX_DEPTH) return false;
        if (v.isContainerNode()) {
            for (JsonNode child : v) if (!plainJson(child, depth + 1)) return false;
            return true;
        }
        return v.isValueNode() && !v.isBinary() && !v.isPojo();
    }

    /** Each link's address and tiles; a tile belongs to one link at most. */
    static ArrayNode cleanLinks(JsonNode in, int rows, int cols) {
        ArrayNode out = MAPPER.createArrayNode();
        if (!in.isArray()) return out;
        Set<String> taken = new HashSet<>();
        for (JsonNode link : in) {
            if (out.size() >= MAX_LINKS) break;
            String href = link.path("href").asText("").trim();
            if (href.length() > 500 || !LINK.matcher(href).matches()) continue;
            ArrayNode tiles = MAPPER.createArrayNode();
            for (JsonNode t : link.path("tiles")) {
                String key = t.asText("");
                if (!SLOT.matcher(key).matches() || taken.contains(key)) continue;
                String[] rc = key.split(",");
                if (Integer.parseInt(rc[0]) >= rows || Integer.parseInt(rc[1]) >= cols) continue;
                taken.add(key);
                tiles.add(key);
            }
            if (tiles.isEmpty()) continue;
            ObjectNode clean = out.addObject();
            clean.put("href", href);
            clean.set("tiles", tiles);
        }
        return out;
    }

    public static ObjectNode cleanGlyphs(JsonNode in, int max) {
        ObjectNode glyphs = MAPPER.createObjectNode();
        if (in == null || !in.isObject()) return glyphs;
        for (Iterator<Map.Entry<String, JsonNode>> it = in.fields(); it.hasNext() && glyphs.size() < max; ) {
            Map.Entry<String, JsonNode> e = it.next();
            String ch = e.getKey();
            if (ch.isEmpty() || ch.codePointCount(0, ch.length()) != 1) continue;
            String hex = e.getValue().asText("");
            if (GLYPH.matcher(hex).matches()) glyphs.put(ch, hex);
        }
        return glyphs;
    }

    private static ObjectNode normaliseLayer(JsonNode l, int rows, int cols, boolean legacyFull) throws InvalidGridException {
        if (!l.isObject()) return null;
        String id = l.path("id").asText("");
        if (!LAYER_ID.matcher(id).matches()) return null;
        ObjectNode out = MAPPER.createObjectNode();
        out.put("id", id);
        String name = l.path("name").asText("Layer");
        out.put("name", name.length() > 40 ? name.substring(0, 40) : name);
        out.put("visible", !l.has("visible") || l.path("visible").asBoolean(true));
        ObjectNode layerExt = cleanExt(l.path("ext"));
        if (layerExt != null) out.set("ext", layerExt);

        if ("photo".equals(l.path("kind").asText())) {
            String src = l.path("src").asText("");
            if (!UPLOAD.matcher(src).matches() || src.contains("..")) return null;
            out.put("kind", "photo");
            out.put("src", src);
            out.put("scale", clampNum(l.path("scale"), 0.05, 8, 1));
            out.put("x", clampNum(l.path("x"), -4096, 4096, 0));
            out.put("y", clampNum(l.path("y"), -4096, 4096, 0));
            return out;
        }

        out.put("kind", "pixel");
        JsonNode paint = l.path("paint");
        if (paint.isTextual()) {
            String p = paint.asText();
            if (p.length() > MAX_PAINT_CHARS) throw new InvalidGridException("A layer's painting is too large.");
            if (PNG.matcher(p).matches()) out.put("paint", p); else out.putNull("paint");
        } else {
            out.putNull("paint");
        }

        ArrayNode text = out.putArray("text");
        Set<String> wide = new LinkedHashSet<>();
        JsonNode inText = l.path("text");
        if (inText.isArray()) {
            for (int r = 0; r < inText.size() && r < rows; r++) {
                String row = inText.get(r).asText("");
                int[] chars = row.codePoints().limit(legacyFull ? cols : cols * 2L).toArray();
                if (!legacyFull) { text.add(new String(chars, 0, chars.length)); continue; }
                StringBuilder upgraded = new StringBuilder();
                for (int c = 0; c < chars.length; c++) {
                    upgraded.appendCodePoint(chars[c]).append(' ');
                    if (chars[c] != ' ') wide.add(r + "," + c);
                }
                text.add(upgraded.toString().replaceAll(" +$", ""));
            }
        }
        if (!legacyFull && l.path("wide").isArray()) {
            for (JsonNode k : l.path("wide")) {
                String key = k.asText("");
                if (!SLOT.matcher(key).matches()) continue;
                String[] rc = key.split(",");
                if (Integer.parseInt(rc[0]) < rows && Integer.parseInt(rc[1]) < cols) wide.add(key);
            }
        }
        ArrayNode wideOut = out.putArray("wide");
        wide.forEach(wideOut::add);

        ObjectNode style = out.putObject("style");
        JsonNode inStyle = l.path("style");
        if (inStyle.isObject()) {
            for (Iterator<Map.Entry<String, JsonNode>> it = inStyle.fields(); it.hasNext(); ) {
                Map.Entry<String, JsonNode> e = it.next();
                if (!SLOT.matcher(e.getKey()).matches() || !e.getValue().isObject()) continue;
                ObjectNode s = MAPPER.createObjectNode();
                String font = e.getValue().path("font").asText("");
                if (FONTS.contains(font)) s.put("font", font);
                String color = e.getValue().path("color").asText("");
                if (HEX.matcher(color).matches()) s.put("color", color.toLowerCase());
                if (s.isEmpty()) continue;
                if (legacyFull) {
                    // The character moved from slot s to slot 2s.
                    String[] rs = e.getKey().split(",");
                    style.set(rs[0] + "," + (Integer.parseInt(rs[1]) * 2), s);
                } else {
                    style.set(e.getKey(), s);
                }
            }
        }
        return out;
    }

    static int clampInt(JsonNode n, int lo, int hi, int fallback) {
        if (!n.isNumber()) return fallback;
        return (int) Math.max(lo, Math.min(hi, Math.round(n.asDouble())));
    }

    static double clampNum(JsonNode n, double lo, double hi, double fallback) {
        if (!n.isNumber() || Double.isNaN(n.asDouble())) return fallback;
        return Math.round(Math.max(lo, Math.min(hi, n.asDouble())) * 100) / 100.0;
    }
}
