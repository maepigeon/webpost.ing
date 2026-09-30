package com.springbootprojects.webpostingserver.posts.validator;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.HashSet;
import java.util.Iterator;
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
        String mode = "half".equals(in.path("mode").asText()) ? "half" : "full";
        out.put("v", 2);
        out.put("cols", cols);
        out.put("rows", rows);
        out.put("mode", mode);

        ObjectNode glyphs = out.putObject("glyphs");
        JsonNode inGlyphs = in.path("glyphs");
        if (inGlyphs.isObject()) {
            int n = 0;
            for (Iterator<Map.Entry<String, JsonNode>> it = inGlyphs.fields(); it.hasNext() && n < 256; ) {
                Map.Entry<String, JsonNode> e = it.next();
                String ch = e.getKey();
                if (ch.codePointCount(0, ch.length()) != 1) continue;
                String hex = e.getValue().asText("");
                if (GLYPH.matcher(hex).matches()) { glyphs.put(ch, hex); n++; }
            }
        }

        ArrayNode layers = out.putArray("layers");
        JsonNode inLayers = in.path("layers");
        Set<String> ids = new HashSet<>();
        int slotsPerRow = cols * ("half".equals(mode) ? 2 : 1);
        if (inLayers.isArray()) {
            for (JsonNode l : inLayers) {
                if (layers.size() >= MAX_LAYERS) break;
                ObjectNode layer = normaliseLayer(l, rows, slotsPerRow);
                if (layer == null) continue;
                String id = layer.path("id").asText();
                if (!ids.add(id)) continue;
                layers.add(layer);
            }
        }
        if (layers.isEmpty()) throw new InvalidGridException("A grid needs at least one layer.");
        return out;
    }

    private static ObjectNode normaliseLayer(JsonNode l, int rows, int slotsPerRow) throws InvalidGridException {
        if (!l.isObject()) return null;
        String id = l.path("id").asText("");
        if (!LAYER_ID.matcher(id).matches()) return null;
        ObjectNode out = MAPPER.createObjectNode();
        out.put("id", id);
        String name = l.path("name").asText("Layer");
        out.put("name", name.length() > 40 ? name.substring(0, 40) : name);
        out.put("visible", !l.has("visible") || l.path("visible").asBoolean(true));

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
        JsonNode inText = l.path("text");
        if (inText.isArray()) {
            for (int r = 0; r < inText.size() && r < rows; r++) {
                String row = inText.get(r).asText("");
                int end = row.offsetByCodePoints(0, Math.min(row.codePointCount(0, row.length()), slotsPerRow));
                text.add(row.substring(0, end));
            }
        }

        ObjectNode style = out.putObject("style");
        JsonNode inStyle = l.path("style");
        if (inStyle.isObject()) {
            for (Iterator<Map.Entry<String, JsonNode>> it = inStyle.fields(); it.hasNext(); ) {
                Map.Entry<String, JsonNode> e = it.next();
                if (!SLOT.matcher(e.getKey()).matches() || !e.getValue().isObject()) continue;
                ObjectNode s = MAPPER.createObjectNode();
                String font = e.getValue().path("font").asText("");
                if (font.equals("pixel") || font.equals("smooth")) s.put("font", font);
                String color = e.getValue().path("color").asText("");
                if (HEX.matcher(color).matches()) s.put("color", color.toLowerCase());
                if (!s.isEmpty()) style.set(e.getKey(), s);
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
