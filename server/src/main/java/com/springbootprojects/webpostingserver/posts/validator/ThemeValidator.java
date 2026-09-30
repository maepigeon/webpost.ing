package com.springbootprojects.webpostingserver.posts.validator;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Validates a page theme and rebuilds it from known fields only.
 *
 * A theme reaches the page as CSS custom properties and data attributes, so
 * every value is either a key from a fixed list, a #rrggbb colour, a clamped
 * number or a boolean. Unknown fields are dropped, not echoed back, so nothing
 * stored can carry text into a style. The frontend applies the same rules
 * (client/src/components/PageTheme/theme.js) before using a theme.
 *
 * Shape (v1):
 *   { v, preset,
 *     page: { bg, texture, textureColor, textureOpacity },
 *     type: { heading, body, ink, headingInk, accent, headingCase, headingScale },
 *     card: { bg, opacity, border, borderColor, radius, shadow, lines, lineColor, tilt, pin },
 *     fx:   { glow, scanlines, flicker, rainbow, grain } }
 */
public final class ThemeValidator {

    private ThemeValidator() {}

    public static final int MAX_JSON_LENGTH = 4000;

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Pattern HEX = Pattern.compile("^#[0-9a-fA-F]{6}$");

    public static final Set<String> PRESETS = Set.of(
            "newspaper", "sticky", "notebook", "corkboard", "neon", "paw", "custom");
    public static final Set<String> TEXTURES = Set.of(
            "none", "newsprint", "cork", "graph", "dots", "scanlines", "rainbow-paws", "wallpaper");
    public static final Set<String> FONTS = Set.of(
            "news-serif", "headline", "blackletter", "fell", "typewriter", "handwriting",
            "marker", "notebook", "terminal", "mono", "cookie", "sans");
    public static final Set<String> BORDERS = Set.of("none", "rule", "double", "dashed", "glow", "rainbow");
    public static final Set<String> SHADOWS = Set.of("none", "soft", "lifted", "curl", "glow");
    public static final Set<String> LINES = Set.of("none", "ruled", "grid");
    public static final Set<String> PINS = Set.of("none", "tape", "pin");
    public static final Set<String> CASES = Set.of("none", "upper");
    private static final String[] EFFECTS = { "glow", "scanlines", "flicker", "rainbow", "grain" };

    public static class InvalidThemeException extends Exception {
        public InvalidThemeException(String message) { super(message); }
    }

    /** Returns the theme as canonical JSON, or throws with a reason a person can act on. */
    public static String normalise(String json) throws InvalidThemeException {
        if (json == null || json.isBlank()) throw new InvalidThemeException("The theme is empty.");
        if (json.length() > MAX_JSON_LENGTH) throw new InvalidThemeException("That theme is too large.");
        JsonNode in;
        try { in = MAPPER.readTree(json); }
        catch (Exception e) { throw new InvalidThemeException("That theme is not valid JSON."); }
        if (in == null || !in.isObject()) throw new InvalidThemeException("A theme must be an object.");

        ObjectNode out = MAPPER.createObjectNode();
        out.put("v", 1);
        out.put("preset", oneOf(in.path("preset"), PRESETS, "custom"));

        JsonNode page = in.path("page");
        ObjectNode p = out.putObject("page");
        p.put("bg", colour(page.path("bg"), "#eeede9"));
        p.put("texture", oneOf(page.path("texture"), TEXTURES, "none"));
        p.put("textureColor", colour(page.path("textureColor"), "#000000"));
        p.put("textureOpacity", number(page.path("textureOpacity"), 0, 1, 0.5));

        JsonNode type = in.path("type");
        ObjectNode t = out.putObject("type");
        t.put("heading", oneOf(type.path("heading"), FONTS, "headline"));
        t.put("body", oneOf(type.path("body"), FONTS, "news-serif"));
        t.put("ink", colour(type.path("ink"), "#111111"));
        t.put("headingInk", colour(type.path("headingInk"), "#111111"));
        t.put("accent", colour(type.path("accent"), "#111111"));
        t.put("headingCase", oneOf(type.path("headingCase"), CASES, "none"));
        t.put("headingScale", number(type.path("headingScale"), 0.7, 1.8, 1));

        JsonNode card = in.path("card");
        ObjectNode c = out.putObject("card");
        c.put("bg", colour(card.path("bg"), "#fbfaf6"));
        c.put("opacity", number(card.path("opacity"), 0, 1, 1));
        c.put("border", oneOf(card.path("border"), BORDERS, "rule"));
        c.put("borderColor", colour(card.path("borderColor"), "#111111"));
        c.put("radius", number(card.path("radius"), 0, 28, 0));
        c.put("shadow", oneOf(card.path("shadow"), SHADOWS, "none"));
        c.put("lines", oneOf(card.path("lines"), LINES, "none"));
        c.put("lineColor", colour(card.path("lineColor"), "#9ab8d8"));
        c.put("tilt", number(card.path("tilt"), 0, 5, 0));
        c.put("pin", oneOf(card.path("pin"), PINS, "none"));

        JsonNode fx = in.path("fx");
        ObjectNode f = out.putObject("fx");
        for (String name : EFFECTS) f.put(name, fx.path(name).asBoolean(false));

        return out.toString();
    }

    private static String oneOf(JsonNode node, Set<String> allowed, String fallback) {
        String v = node.isTextual() ? node.asText() : null;
        return v != null && allowed.contains(v) ? v : fallback;
    }

    private static String colour(JsonNode node, String fallback) {
        String v = node.isTextual() ? node.asText() : null;
        return v != null && HEX.matcher(v).matches() ? v.toLowerCase() : fallback;
    }

    private static double number(JsonNode node, double lo, double hi, double fallback) {
        if (!node.isNumber()) return fallback;
        double v = node.asDouble();
        if (Double.isNaN(v)) return fallback;
        return Math.round(Math.min(hi, Math.max(lo, v)) * 100) / 100.0;
    }

    /** For tests and callers that want the parsed form. */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> parse(String canonical) throws Exception {
        return MAPPER.readValue(canonical, Map.class);
    }
}
