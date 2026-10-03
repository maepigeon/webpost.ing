package com.springbootprojects.webpostingserver.posts.validator;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Validates a page theme and rebuilds it from known fields only.
 *
 * A theme's pictures are tile grids: the page background and the card texture
 * are wallpapers (WallpaperValidator), and the sticker pinned to each card —
 * a push pin, a strip of tape — is a small grid (GridValidator). Everything
 * else is a key from a fixed list, a #rrggbb colour, a clamped number or a
 * boolean, so nothing stored can carry text into a style. The frontend applies
 * the same rules (client/src/components/PageTheme/theme.js).
 *
 * Shape (v2):
 *   { v, preset,
 *     page: { wallpaper, useProfileWallpaper },
 *     type: { heading, body, ink, headingInk, accent, link, headingCase, headingScale },
 *     card: { bg, opacity, border, borderColor, radius, shadow, texture, sticker },
 *     fx:   { glow, scanlines, flicker, rainbow } }
 */
public final class ThemeValidator {

    private ThemeValidator() {}

    public static final int MAX_JSON_LENGTH = 2_000_000;
    public static final int MAX_STICKER_TILES = 4;

    private static final Pattern HEX = Pattern.compile("^#[0-9a-fA-F]{6}$");

    public static final Set<String> PRESETS = Set.of(
            "newspaper", "sticky", "notebook", "corkboard", "neon", "paw", "custom");
    public static final Set<String> FONTS = Set.of(
            "news-serif", "headline", "blackletter", "fell", "typewriter", "handwriting",
            "marker", "notebook", "terminal", "mono", "cookie", "cooljazz", "sans", "comic", "papyrus");
    public static final Set<String> BORDERS = Set.of("none", "rule", "double", "dashed", "glow", "rainbow");
    public static final Set<String> SHADOWS = Set.of("none", "soft", "lifted", "curl", "glow");
    public static final Set<String> CASES = Set.of("none", "upper");
    private static final String[] EFFECTS = { "glow", "scanlines", "flicker", "rainbow" };

    public static class InvalidThemeException extends Exception {
        public InvalidThemeException(String message) { super(message); }
    }

    /** Returns the theme as canonical JSON, or throws with a reason a person can act on. */
    public static String normalise(String json) throws InvalidThemeException {
        if (json == null || json.isBlank()) throw new InvalidThemeException("The theme is empty.");
        if (json.length() > MAX_JSON_LENGTH) throw new InvalidThemeException("That theme is too large.");
        JsonNode in;
        try { in = GridValidator.MAPPER.readTree(json); }
        catch (Exception e) { throw new InvalidThemeException("That theme is not valid JSON."); }
        if (in == null || !in.isObject()) throw new InvalidThemeException("A theme must be an object.");

        ObjectNode out = GridValidator.MAPPER.createObjectNode();
        out.put("v", 2);
        out.put("preset", oneOf(in.path("preset"), PRESETS, "custom"));

        JsonNode page = in.path("page");
        ObjectNode p = out.putObject("page");
        p.set("wallpaper", optionalWallpaper(page.path("wallpaper")));
        p.put("useProfileWallpaper", page.path("useProfileWallpaper").asBoolean(false));

        JsonNode type = in.path("type");
        ObjectNode t = out.putObject("type");
        t.put("heading", oneOf(type.path("heading"), FONTS, "headline"));
        t.put("body", oneOf(type.path("body"), FONTS, "news-serif"));
        t.put("ink", colour(type.path("ink"), "#111111"));
        t.put("headingInk", colour(type.path("headingInk"), "#111111"));
        t.put("accent", colour(type.path("accent"), "#111111"));
        // Links have a colour of their own; themes saved before that use their accent.
        t.put("link", colour(type.path("link"), t.get("accent").asText()));
        t.put("headingCase", oneOf(type.path("headingCase"), CASES, "none"));
        t.put("headingScale", GridValidator.clampNum(type.path("headingScale"), 0.7, 1.8, 1));

        JsonNode card = in.path("card");
        ObjectNode c = out.putObject("card");
        c.put("bg", colour(card.path("bg"), "#fbfaf6"));
        c.put("opacity", GridValidator.clampNum(card.path("opacity"), 0, 1, 1));
        c.put("border", oneOf(card.path("border"), BORDERS, "rule"));
        c.put("borderColor", colour(card.path("borderColor"), "#111111"));
        c.put("radius", GridValidator.clampNum(card.path("radius"), 0, 28, 0));
        c.put("shadow", oneOf(card.path("shadow"), SHADOWS, "none"));
        c.set("texture", optionalWallpaper(card.path("texture")));
        JsonNode sticker = card.path("sticker");
        if (sticker.isObject()) {
            try { c.set("sticker", GridValidator.normalise(sticker, MAX_STICKER_TILES, MAX_STICKER_TILES)); }
            catch (GridValidator.InvalidGridException e) { throw new InvalidThemeException("Sticker: " + e.getMessage()); }
        } else {
            c.putNull("sticker");
        }

        JsonNode fx = in.path("fx");
        ObjectNode f = out.putObject("fx");
        for (String name : EFFECTS) f.put(name, fx.path(name).asBoolean(false));

        return out.toString();
    }

    private static JsonNode optionalWallpaper(JsonNode node) throws InvalidThemeException {
        if (node == null || !node.isObject()) return GridValidator.MAPPER.nullNode();
        try { return WallpaperValidator.normalise(node); }
        catch (WallpaperValidator.InvalidWallpaperException e) { throw new InvalidThemeException(e.getMessage()); }
    }

    private static String oneOf(JsonNode node, Set<String> allowed, String fallback) {
        String v = node.isTextual() ? node.asText() : null;
        return v != null && allowed.contains(v) ? v : fallback;
    }

    private static String colour(JsonNode node, String fallback) {
        String v = node.isTextual() ? node.asText() : null;
        return v != null && HEX.matcher(v).matches() ? v.toLowerCase() : fallback;
    }

    /** For tests and callers that want the parsed form. */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> parse(String canonical) throws Exception {
        return GridValidator.MAPPER.readValue(canonical, Map.class);
    }
}
