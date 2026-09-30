package com.springbootprojects.webpostingserver.posts.validator;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Set;
import java.util.regex.Pattern;

/**
 * Validates background wallpaper values before storing them.
 *
 * The only format is JSON v2:
 *   {"v":2,"pattern":"hexagons","scale":1.5,"bgColor":"#ece9e2","colors":["#000000"]}
 *   {"v":2,"pattern":"custom","scale":1,"bgColor":"#ece9e2","colors":[],"css":"linear-gradient(...)"}
 *
 * Preset keys resolve to CSS in the frontend; a custom value may only be a
 * gradient, and anything containing url(), expression(), javascript:, data:,
 * @import, CSS variables or other injection vectors is rejected.
 */
public class PatternValidator {

    private static final int MAX_JSON_LENGTH = 2500; // the css field itself is ≤2000

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** A custom value must start with one of these gradient functions. */
    private static final Pattern GRADIENT_START = Pattern.compile(
            "^\\s*(linear-gradient|radial-gradient|conic-gradient|" +
            "repeating-linear-gradient|repeating-radial-gradient)\\s*\\(",
            Pattern.CASE_INSENSITIVE
    );

    /**
     * Block-list: if any of these substrings appear anywhere in the value,
     * reject it outright regardless of the overall structure.
     *
     * Covers: external resource loading (url), IE CSS expressions, JS URIs,
     * data URIs, stylesheet imports, HTML injection, CSS escape sequences,
     * statement terminators, and CSS runtime functions (var/env/attr).
     */
    private static final Pattern BLOCKED = Pattern.compile(
            "url\\s*\\(|expression\\s*\\(|javascript\\s*:|data\\s*:|@import|" +
            "<|>|\\\\|;|var\\s*\\(|env\\s*\\(|attr\\s*\\(",
            Pattern.CASE_INSENSITIVE
    );

    /** Hex color: #RGB, #RRGGBB, or #RRGGBBAA */
    private static final Pattern HEX_COLOR = Pattern.compile(
            "^#[0-9a-fA-F]{3,8}$"
    );

    private static final Set<String> JSON_PRESETS = Set.of(
            "none", "grid", "checkerboard", "paw-print", "stars",
            "hexagons", "chevron", "topographic", "custom"
    );

    /**
     * Returns true if the pattern value is safe to store and render.
     * A return value of false should produce a 400 Bad Request.
     */
    public static boolean isValid(String pattern) {
        if (pattern == null || pattern.isBlank()) return true;
        String trimmed = pattern.trim();
        if (!trimmed.startsWith("{") || trimmed.length() > MAX_JSON_LENGTH) return false;
        return isValidJsonWallpaper(trimmed);
    }

    private static boolean isValidJsonWallpaper(String json) {
        try {
            JsonNode root = MAPPER.readTree(json);
            if (root.path("v").asInt(-1) != 2) return false;

            String pat = root.path("pattern").asText("");
            if (!JSON_PRESETS.contains(pat)) return false;

            if ("custom".equals(pat)) {
                String css = root.path("css").asText("").trim();
                if (BLOCKED.matcher(css).find()) return false;
                if (!css.isEmpty() && !GRADIENT_START.matcher(css).find()) return false;
            }

            if (root.has("scale")) {
                double scale = root.path("scale").asDouble(1.0);
                if (scale < 0.1 || scale > 10) return false;
            }

            String bgColor = root.path("bgColor").asText("");
            if (!bgColor.isEmpty() && !HEX_COLOR.matcher(bgColor).matches()) return false;

            JsonNode colors = root.path("colors");
            if (colors.isArray()) {
                for (JsonNode c : colors) {
                    String colorStr = c.asText("");
                    if (!colorStr.isEmpty() && !HEX_COLOR.matcher(colorStr).matches()) return false;
                }
            }

            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
