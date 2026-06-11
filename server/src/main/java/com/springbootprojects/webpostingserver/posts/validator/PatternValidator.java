package com.springbootprojects.webpostingserver.posts.validator;

import java.util.Set;
import java.util.regex.Pattern;

/**
 * Validates CSS background pattern values before storing them.
 *
 * Accepts:
 *   - null / blank  → "no pattern" (always valid)
 *   - A known preset key (e.g. "dots", "grid") → resolved to safe CSS on the frontend
 *   - A CSS gradient function string starting with linear-gradient, radial-gradient, etc.
 *     provided it contains none of the blocked substrings below.
 *
 * Rejects everything else, including any value containing url(), expression(),
 * javascript:, data:, @import, CSS variables, or other injection vectors.
 */
public class PatternValidator {

    private static final int MAX_LENGTH = 2000;

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

    /**
     * Returns true if the pattern is safe to store and render.
     * A return value of false should produce a 400 Bad Request.
     */
    public static boolean isValid(String pattern) {
        if (pattern == null || pattern.isBlank()) return true;
        if (pattern.length() > MAX_LENGTH) return false;
        if (BLOCKED.matcher(pattern).find()) return false;
        // Strip |#COLOR and |scale:X.X suffix segments (any order) before validating the core
        String core = BG_COLOR_SUFFIX.matcher(pattern.trim()).replaceAll("");
        core = SCALE_SUFFIX.matcher(core).replaceAll("").trim();
        if (core.isEmpty()) return true;
        String trimmedLower = core.toLowerCase();
        if (PRESETS.contains(trimmedLower)) return true;
        if (PAW_COLOR.matcher(core).matches()) return true;
        if (STARS_COLORS.matcher(core).matches()) return true;
        if (STARS_ONE_COLOR.matcher(core).matches()) return true;
        return GRADIENT_START.matcher(core).find();
    }
}
