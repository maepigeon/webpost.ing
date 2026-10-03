package com.springbootprojects.webpostingserver.posts.validator;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Base64;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Checks a post's body (Lexical editor JSON) before it is stored.
 *
 * The editor is the only thing that is supposed to write this JSON, but the
 * endpoint accepts whatever a client sends, and every reader's browser renders
 * it. So what a page can make a browser load or draw is pinned down here:
 * images and audio are this site's own uploads, links are web or mail
 * addresses, text styles are a short allowlist of harmless properties, and tile
 * grids go through {@link GridValidator}. Style problems are repaired quietly;
 * anything that would load or run something is refused with a plain message.
 *
 * Node shapes mirror exportJSON() in client/.../PostRenderer/RichTextPost:
 * ImageNode.jsx (src, srcset), AudioNode.jsx (src), MathNode.jsx (equation),
 * TileGrid/TileGridNode.jsx (grid), and Lexical's own link, text, heading, list
 * and code nodes. Node types this does not know are kept.
 */
public final class PostContentValidator {

    private PostContentValidator() {}

    public static class InvalidPostContentException extends Exception {
        public InvalidPostContentException(String message) { super(message); }
    }

    static final int MAX_DEPTH = 40;
    static final int MAX_NODES = 20_000;
    static final int MAX_STRING = 100_000;
    static final int MAX_EQUATION = 10_000;
    static final int MAX_URL = 8_000;
    // A grid's biggest legitimate paint: 64 x 48 tiles of 16 px (see LIMITS and TILE in tileGrid.js).
    static final int GRID_MAX_COLS = 64;
    static final int GRID_MAX_ROWS = 48;
    static final int TILE_PX = 16;
    static final int MAX_PAINT_CHARS = 1_500_000;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final String BAD_IMAGE = "Images must be uploaded to this site.";
    private static final String BAD_AUDIO = "Audio must be uploaded to this site.";
    private static final String BAD_LINK = "Links must start with http://, https://, mailto: or /.";
    private static final String BAD_CONTENT = "This post could not be saved because its content is not valid.";

    private static final Pattern UPLOAD = Pattern.compile("^/uploads/[A-Za-z0-9._/-]{1,200}$");
    private static final Pattern PNG = Pattern.compile("^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$");
    private static final Pattern ALIGN = Pattern.compile("^(left|center|right|justify|start|end)?$");

    /** Returns the content normalised, or throws with a message fit to show the writer. */
    public static String clean(String json) throws InvalidPostContentException {
        // A post with no body yet (an empty draft) has nothing to check.
        if (json == null || json.isBlank()) return json;
        JsonNode root;
        try {
            root = MAPPER.readTree(json);
        } catch (JsonProcessingException e) {
            throw new InvalidPostContentException(BAD_CONTENT);
        }
        if (root == null || !root.isObject() || !root.path("root").isObject())
            throw new InvalidPostContentException(BAD_CONTENT);

        int[] count = {0};
        ObjectNode top = (ObjectNode) root;
        // Everything beside the tree is only length-capped.
        for (Iterator<Map.Entry<String, JsonNode>> it = top.fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> e = it.next();
            if (!e.getKey().equals("root")) capStrings(e.getValue(), 2);
        }
        cleanNode((ObjectNode) top.get("root"), 1, count);
        return top.toString();
    }

    // ── Tree ─────────────────────────────────────────────────────────────────

    private static void cleanNode(ObjectNode n, int depth, int[] count) throws InvalidPostContentException {
        if (depth > MAX_DEPTH) throw new InvalidPostContentException("This post is nested too deeply.");
        if (++count[0] > MAX_NODES) throw new InvalidPostContentException("This post has too many elements.");

        String type = n.path("type").isTextual() ? n.path("type").asText() : "";
        switch (type) {
            case "image" -> {
                requireUpload(n, "src", BAD_IMAGE);
                cleanSrcset(n, "srcset");
                cleanSrcset(n, "srcSet");
            }
            case "audio" -> requireUpload(n, "src", BAD_AUDIO);
            case "link", "autolink" -> {
                JsonNode url = n.get("url");
                if (url != null && !url.isNull() && (!url.isTextual() || !safeLink(url.asText())))
                    throw new InvalidPostContentException(BAD_LINK);
            }
            case "math" -> {
                JsonNode eq = n.get("equation");
                if (eq != null && !eq.isNull() && (!eq.isTextual() || eq.asText().length() > MAX_EQUATION))
                    throw new InvalidPostContentException("A formula is too long (at most " + MAX_EQUATION + " characters).");
            }
            case "tilegrid" -> {
                cleanTileGridNode(n);
                return; // rebuilt from known fields; nothing else to walk
            }
            default -> { }
        }

        // Styles and alignment on any node (text, paragraphs, headings, ...).
        for (String key : List.of("style", "textStyle")) {
            if (n.has(key)) {
                JsonNode v = n.get(key);
                n.put(key, v.isTextual() ? cleanStyle(v.asText()) : "");
            }
        }
        if (n.has("format") && n.get("format").isTextual() && !ALIGN.matcher(n.get("format").asText()).matches())
            n.put("format", "");

        for (Iterator<Map.Entry<String, JsonNode>> it = n.fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> e = it.next();
            if (e.getKey().equals("children")) continue;
            capStrings(e.getValue(), depth + 1);
        }
        JsonNode children = n.get("children");
        if (children == null) return;
        if (!children.isArray()) throw new InvalidPostContentException(BAD_CONTENT);
        for (JsonNode child : children) {
            if (!child.isObject()) throw new InvalidPostContentException(BAD_CONTENT);
            cleanNode((ObjectNode) child, depth + 1, count);
        }
    }

    /** Refuses any string over the cap, anywhere inside a value. */
    private static void capStrings(JsonNode v, int depth) throws InvalidPostContentException {
        if (depth > MAX_DEPTH + 10) throw new InvalidPostContentException("This post is nested too deeply.");
        if (v.isTextual()) {
            if (v.asText().length() > MAX_STRING) throw new InvalidPostContentException("Part of this post is too long.");
        } else if (v.isContainerNode()) {
            for (JsonNode child : v) capStrings(child, depth + 1);
        }
    }

    // ── Uploads and links ────────────────────────────────────────────────────

    private static boolean uploadPath(String s) {
        return UPLOAD.matcher(s).matches() && !s.contains("..") && !s.contains("//");
    }

    private static void requireUpload(ObjectNode n, String key, String message) throws InvalidPostContentException {
        JsonNode v = n.get(key);
        if (v == null || !v.isTextual() || !uploadPath(v.asText())) throw new InvalidPostContentException(message);
    }

    /** "/uploads/a-480w.jpg 480w, /uploads/a.jpg 2400w": every candidate must be an upload. */
    private static void cleanSrcset(ObjectNode n, String key) throws InvalidPostContentException {
        JsonNode v = n.get(key);
        if (v == null || v.isNull()) return;
        if (!v.isTextual() || v.asText().length() > 4000) throw new InvalidPostContentException(BAD_IMAGE);
        String s = v.asText().trim();
        if (s.isEmpty()) return;
        for (String candidate : s.split(",")) {
            String[] parts = candidate.trim().split("\\s+");
            boolean ok = parts.length >= 1 && parts.length <= 2 && uploadPath(parts[0])
                    && (parts.length == 1 || parts[1].matches("^\\d{1,5}(\\.\\d+)?[wx]$"));
            if (!ok) throw new InvalidPostContentException(BAD_IMAGE);
        }
    }

    /** http(s), mailto, a path on this site, or a fragment; nothing that runs or embeds. */
    static boolean safeLink(String url) {
        if (url.length() > MAX_URL) return false;
        for (int i = 0; i < url.length(); i++) if (url.charAt(i) <= 0x20 || url.charAt(i) == 0x7f) return false;
        if (url.isEmpty() || url.equals("#") || url.startsWith("#")) return true;
        if (url.startsWith("/")) return url.length() == 1 || (url.charAt(1) != '/' && url.charAt(1) != '\\');
        String lower = url.toLowerCase();
        return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("mailto:");
    }

    // ── Tile grid ────────────────────────────────────────────────────────────

    private static void cleanTileGridNode(ObjectNode n) throws InvalidPostContentException {
        JsonNode grid = n.get("grid");
        if (grid == null || !grid.isObject()) throw new InvalidPostContentException("A tile grid in this post is not valid.");
        JsonNode layers = grid.path("layers");
        if (layers.isArray()) {
            for (JsonNode l : layers) {
                if (!l.isObject() || "photo".equals(l.path("kind").asText())) continue;
                JsonNode paint = l.get("paint");
                if (paint == null || paint.isNull()) continue;
                if (!paint.isTextual() || paint.asText().length() > MAX_PAINT_CHARS)
                    throw new InvalidPostContentException("A tile grid's painting is too large.");
                String p = paint.asText();
                if (!PNG.matcher(p).matches() || !pngSizeOk(p))
                    throw new InvalidPostContentException("A tile grid's painting must be a PNG image of reasonable size.");
            }
        }
        ObjectNode clean;
        try {
            clean = GridValidator.normalise(grid, GRID_MAX_COLS, GRID_MAX_ROWS);
        } catch (GridValidator.InvalidGridException e) {
            throw new InvalidPostContentException(e.getMessage());
        }
        int version = n.path("version").isInt() ? n.get("version").asInt() : 1;
        n.removeAll();
        n.put("type", "tilegrid");
        n.put("version", version);
        n.set("grid", clean);
    }

    /** Reads the PNG header (IHDR) so a tiny file claiming a huge size is refused. */
    private static boolean pngSizeOk(String dataUrl) {
        String b64 = dataUrl.substring("data:image/png;base64,".length());
        if (b64.length() < 44) return false;
        byte[] head;
        try {
            head = Base64.getDecoder().decode(b64.substring(0, 44));
        } catch (IllegalArgumentException e) {
            return false;
        }
        byte[] sig = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
        for (int i = 0; i < 8; i++) if (head[i] != sig[i]) return false;
        if (head[12] != 'I' || head[13] != 'H' || head[14] != 'D' || head[15] != 'R') return false;
        long w = u32(head, 16), h = u32(head, 20);
        return w >= 1 && h >= 1 && w <= (long) GRID_MAX_COLS * TILE_PX && h <= (long) GRID_MAX_ROWS * TILE_PX;
    }

    private static long u32(byte[] b, int o) {
        return ((b[o] & 0xffL) << 24) | ((b[o + 1] & 0xffL) << 16) | ((b[o + 2] & 0xffL) << 8) | (b[o + 3] & 0xffL);
    }

    // ── Styles ───────────────────────────────────────────────────────────────

    private static final Pattern HEX = Pattern.compile("^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$");
    private static final Pattern RGB = Pattern.compile("^(rgb|rgba|hsl|hsla)\\([0-9.,%\\s/deg]{1,50}\\)$");
    private static final Pattern NAMED = Pattern.compile("^[a-z]{3,30}$");
    private static final Pattern PX = Pattern.compile("^(-?\\d{1,4}(?:\\.\\d{1,3})?)px$");
    private static final Pattern NUM = Pattern.compile("^\\d{1,2}(?:\\.\\d{1,3})?$");
    private static final String FAMILY_NAME = "(?:\"[A-Za-z0-9 _-]{1,50}\"|'[A-Za-z0-9 _-]{1,50}'|[A-Za-z0-9 _-]{1,50})";
    private static final Pattern FAMILY = Pattern.compile("^" + FAMILY_NAME + "(?:\\s*,\\s*" + FAMILY_NAME + "){0,9}$");
    private static final Pattern WEIGHT = Pattern.compile("^(normal|bold|bolder|lighter|[1-9]00)$");
    private static final Pattern FONT_STYLE = Pattern.compile("^(normal|italic|oblique)$");
    private static final Pattern DECORATION = Pattern.compile("^(none|(underline|line-through|overline)( (underline|line-through|overline)){0,2})$");
    private static final Pattern SPACING = Pattern.compile("^(normal|-?\\d{1,2}(?:\\.\\d{1,3})?(px|em))$");
    private static final Set<String> PROPS = Set.of("color", "background-color", "font-size", "font-family",
            "line-height", "font-weight", "font-style", "text-decoration", "letter-spacing");

    /** Keeps only allowlisted declarations with safe values; "" when none survive. */
    static String cleanStyle(String style) {
        if (style == null || style.isEmpty() || style.length() > 2000) return "";
        Map<String, String> kept = new LinkedHashMap<>();
        for (String decl : style.split(";")) {
            int colon = decl.indexOf(':');
            if (colon < 1) continue;
            String prop = decl.substring(0, colon).trim().toLowerCase();
            String value = decl.substring(colon + 1).trim();
            if (!PROPS.contains(prop) || value.isEmpty()) continue;
            if (value.contains("\\") || value.contains("/*") || value.toLowerCase().contains("url(")
                    || value.toLowerCase().contains("expression") || value.contains("!") || value.contains("<")) continue;
            String ok = safeValue(prop, value);
            if (ok != null) kept.put(prop, ok);
        }
        StringBuilder sb = new StringBuilder();
        kept.forEach((k, v) -> { if (sb.length() > 0) sb.append(' '); sb.append(k).append(": ").append(v).append(';'); });
        return sb.toString();
    }

    private static String safeValue(String prop, String value) {
        String lower = value.toLowerCase();
        switch (prop) {
            case "color", "background-color" -> {
                if (HEX.matcher(lower).matches() || RGB.matcher(lower).matches() || NAMED.matcher(lower).matches()) return lower;
                return null;
            }
            case "font-size" -> {
                Matcher m = PX.matcher(lower);
                if (!m.matches()) return null;
                double px = Double.parseDouble(m.group(1));
                return px >= 6 && px <= 200 ? lower : null;
            }
            case "font-family" -> {
                return value.length() <= 400 && FAMILY.matcher(value).matches() ? value : null;
            }
            case "line-height" -> {
                if (NUM.matcher(lower).matches()) {
                    double v = Double.parseDouble(lower);
                    return v >= 0.5 && v <= 5 ? lower : null;
                }
                Matcher m = PX.matcher(lower);
                if (m.matches()) {
                    double px = Double.parseDouble(m.group(1));
                    return px >= 6 && px <= 400 ? lower : null;
                }
                return null;
            }
            case "font-weight" -> { return WEIGHT.matcher(lower).matches() ? lower : null; }
            case "font-style" -> { return FONT_STYLE.matcher(lower).matches() ? lower : null; }
            case "text-decoration" -> { return DECORATION.matcher(lower).matches() ? lower : null; }
            case "letter-spacing" -> {
                if (!SPACING.matcher(lower).matches()) return null;
                if (lower.equals("normal")) return lower;
                double v = Double.parseDouble(lower.replaceAll("[a-z]+$", ""));
                return Math.abs(v) <= (lower.endsWith("em") ? 2 : 20) ? lower : null;
            }
            default -> { return null; }
        }
    }
}
