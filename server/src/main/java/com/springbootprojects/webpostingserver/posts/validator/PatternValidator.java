package com.springbootprojects.webpostingserver.posts.validator;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Set;
import java.util.regex.Pattern;

/**
 * Validates background wallpaper values before storing them.
 *
 * Accepts two formats:
 *
 *   JSON v2 (preferred):
 *     {"v":2,"pattern":"hexagons","scale":1.5,"bgColor":"#ece9e2","colors":["#000000"]}
 *     {"v":2,"pattern":"custom","scale":1,"bgColor":"#ece9e2","colors":[],"css":"linear-gradient(...)"}
 *
 *   Legacy pipe format (still accepted for backward compatibility):
 *     hexagons|#ece9e2|scale:2
 *     paw-print:#ff0000|#f5f5dc|scale:1.5
 *
 * Rejects anything containing url(), expression(), javascript:, data:, @import,
 * CSS variables, or other injection vectors.
 */
public class PatternValidator {

    private static final int MAX_LENGTH      = 2000; // legacy pipe format
    private static final int MAX_JSON_LENGTH = 2500; // JSON v2 (CSS field itself is ≤2000)

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Keys the frontend resolves to hardcoded CSS — nothing from DB reaches the DOM for these. */
    private static final Set<String> PRESETS = Set.of(
            // Current presets
            "none", "grid", "checkerboard", "paw-print", "stars",
            "hexagons", "chevron", "topographic",
            // Legacy keys — kept so stored values remain valid
            "pinstripes", "dots", "diagonal-stripes", "notebook", "zigzag", "cross-hatch"
    );

    /** paw-print:COLOR — parameterized paw with custom color; color must be hex or rgb/rgba only. */
    private static final Pattern PAW_COLOR = Pattern.compile(
            "^paw-print:(#[0-9a-fA-F]{3,8}|rgba?\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+(?:\\s*,\\s*[\\d.]+)?\\s*\\))$",
            Pattern.CASE_INSENSITIVE
    );

    private static final String _COLOR_TOKEN =
            "(#[0-9a-fA-F]{3,8}|rgba?\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+(?:\\s*,\\s*[\\d.]+)?\\s*\\)|transparent)";

    /** stars:STAR_COLOR:BG_COLOR — parameterized starfield with custom star and background colors. */
    private static final Pattern STARS_COLORS = Pattern.compile(
            "^stars:" + _COLOR_TOKEN + ":" + _COLOR_TOKEN + "$",
            Pattern.CASE_INSENSITIVE
    );

    /** stars:STAR_COLOR — parameterized starfield with custom star color, transparent background. */
    private static final Pattern STARS_ONE_COLOR = Pattern.compile(
            "^stars:" + _COLOR_TOKEN + "$",
            Pattern.CASE_INSENSITIVE
    );

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

    /** Hex color suffix appended after a pipe: e.g. "dots|#f0e6d3" */
    private static final Pattern BG_COLOR_SUFFIX = Pattern.compile(
            "\\|#[0-9a-fA-F]{3,8}"
    );

    /** Scale suffix: e.g. "dots|scale:2.5" */
    private static final Pattern SCALE_SUFFIX = Pattern.compile(
            "\\|scale:\\d+(?:\\.\\d+)?"
    );

    /** Hex color: #RGB, #RRGGBB, or #RRGGBBAA */
    private static final Pattern HEX_COLOR = Pattern.compile(
            "^#[0-9a-fA-F]{3,8}$"
    );

    /** Preset keys valid inside JSON v2 (no legacy keys needed — those only appear in pipe format). */
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

        // ── JSON v2 format ──
        if (trimmed.startsWith("{")) {
            if (trimmed.length() > MAX_JSON_LENGTH) return false;
            return isValidJsonWallpaper(trimmed);
        }

        // ── Legacy pipe format ──
        if (pattern.length() > MAX_LENGTH) return false;
        if (BLOCKED.matcher(pattern).find()) return false;
        String core = BG_COLOR_SUFFIX.matcher(trimmed).replaceAll("");
        core = SCALE_SUFFIX.matcher(core).replaceAll("").trim();
        if (core.isEmpty()) return true;
        String coreLower = core.toLowerCase();
        if (PRESETS.contains(coreLower)) return true;
        if (PAW_COLOR.matcher(core).matches()) return true;
        if (STARS_COLORS.matcher(core).matches()) return true;
        if (STARS_ONE_COLOR.matcher(core).matches()) return true;
        return GRADIENT_START.matcher(core).find();
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
