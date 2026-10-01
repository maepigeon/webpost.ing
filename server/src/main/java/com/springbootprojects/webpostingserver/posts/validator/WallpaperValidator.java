package com.springbootprojects.webpostingserver.posts.validator;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Set;
import java.util.regex.Pattern;

/**
 * Validates a wallpaper: a small tile grid, how it repeats, how big each grid
 * pixel is, and the colour behind anything transparent.
 *
 *   {"v":3,"tile":{…grid…},"tiling":"brick","scale":2,"bg":"#eeede9",
 *    "source":{"texture":"paws","options":{"colouring":"gradient","colour":"#ff5e8a","stops":["#ff0000","#0000ff"]}}}
 *
 * "source" is optional: which texture the tile was made from and with what
 * options, so the editor can show those options again after a reload. It is
 * only a label for the editor; the tile is what is drawn.
 *
 * Used for profile and post wallpapers, the site background, saved wallpaper
 * presets, and the page and card backgrounds of a theme. Mirrors
 * sanitiseWallpaper() in client/src/components/TileArt/wallpaper.js.
 */
public final class WallpaperValidator {

    private WallpaperValidator() {}

    /** Largest wallpaper tile, in grid tiles (16 px each) on a side. */
    public static final int MAX_TILES = 8;
    public static final int MAX_JSON_LENGTH = 600_000;
    public static final Set<String> TILINGS = Set.of("repeat", "brick", "half-drop", "mirror", "stretch", "center");
    private static final Pattern HEX = Pattern.compile("^#[0-9a-fA-F]{6}$");
    private static final Pattern TEXTURE_NAME = Pattern.compile("^[a-z][a-z-]{0,23}$");
    private static final Set<String> PAW_COLOURINGS = Set.of("random", "single", "rainbow", "gradient");
    private static final int MAX_PAW_STOPS = 6;

    public static class InvalidWallpaperException extends Exception {
        public InvalidWallpaperException(String message) { super(message); }
    }

    /**
     * Canonical JSON for a stored wallpaper string, or null when it is empty
     * (which clears the wallpaper).
     */
    public static String normalise(String json) throws InvalidWallpaperException {
        if (json == null || json.isBlank()) return null;
        if (json.length() > MAX_JSON_LENGTH) throw new InvalidWallpaperException("That wallpaper is too large.");
        JsonNode in;
        try { in = GridValidator.MAPPER.readTree(json); }
        catch (Exception e) { throw new InvalidWallpaperException("That wallpaper is not valid JSON."); }
        return normalise(in).toString();
    }

    public static ObjectNode normalise(JsonNode in) throws InvalidWallpaperException {
        if (in == null || !in.isObject() || in.path("v").asInt() != 3)
            throw new InvalidWallpaperException("That is not a wallpaper.");
        ObjectNode out = GridValidator.MAPPER.createObjectNode();
        out.put("v", 3);
        try {
            out.set("tile", GridValidator.normalise(in.path("tile"), MAX_TILES, MAX_TILES));
        } catch (GridValidator.InvalidGridException e) {
            throw new InvalidWallpaperException(e.getMessage());
        }
        String tiling = in.path("tiling").asText("repeat");
        out.put("tiling", TILINGS.contains(tiling) ? tiling : "repeat");
        out.put("scale", GridValidator.clampNum(in.path("scale"), 1, 8, 2));
        String bg = in.path("bg").asText("");
        out.put("bg", HEX.matcher(bg).matches() ? bg.toLowerCase() : "#eeede9");
        ObjectNode source = source(in.path("source"));
        if (source != null) out.set("source", source);
        return out;
    }

    /** The texture a wallpaper was made from, and Paws' colours; null if absent or unreadable. */
    private static ObjectNode source(JsonNode in) {
        String texture = in.path("texture").asText("");
        if (!in.isObject() || !TEXTURE_NAME.matcher(texture).matches()) return null;
        ObjectNode out = GridValidator.MAPPER.createObjectNode();
        out.put("texture", texture);
        if (!texture.equals("paws")) return out;
        JsonNode o = in.path("options");
        ObjectNode options = out.putObject("options");
        String colouring = o.path("colouring").asText("random");
        options.put("colouring", PAW_COLOURINGS.contains(colouring) ? colouring : "random");
        String colour = o.path("colour").asText("");
        options.put("colour", HEX.matcher(colour).matches() ? colour.toLowerCase() : "#ff5e8a");
        ArrayNode stops = options.putArray("stops");
        for (JsonNode stop : o.path("stops")) {
            if (stops.size() >= MAX_PAW_STOPS) break;
            String c = stop.asText("");
            if (HEX.matcher(c).matches()) stops.add(c.toLowerCase());
        }
        return out;
    }

    /** True when the value is empty or a valid wallpaper. */
    public static boolean isValid(String json) {
        try { normalise(json); return true; } catch (InvalidWallpaperException e) { return false; }
    }
}
