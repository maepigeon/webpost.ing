package com.springbootprojects.webpostingserver.posts.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.util.RawValue;

/**
 * What a post's card and the search need from its body, worked out once at
 * save (posts.card_preview, posts.search_text; V020) so that lists and search
 * never read the body itself.
 *
 * Pure and tolerant: a save must never fail because of its preview, and the
 * sweep runs this over every old row, whatever it holds.
 */
public final class PostPreview {

    /**
     * The rule's version, stored per row in posts.preview_version. A row below
     * it is recomputed by PreviewSweep; raise it when the rule changes.
     */
    public static final int VERSION = 1;

    /** A first grid whose JSON is longer than this is not kept: the card shows title and summary. */
    public static final int PREVIEW_MAX_CHARS = 300_000;

    /** Characters of plain text kept for search and the crawler excerpt. */
    public static final int SEARCH_MAX_CHARS = 20_000;

    /** Jackson refuses documents nested deeper than this, so the walk never needs more. */
    private static final int MAX_DEPTH = 1000;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Result NOTHING = new Result(null, "", false);

    /** gridJson: the first grid's "grid" object as JSON, or null; searchText: never null ('' when none). */
    public record Result(String gridJson, String searchText, boolean gridTooBig) {}

    private PostPreview() {}

    /**
     * Never throws. Null or blank content gives (null, "", false). Content
     * that is not the editor's JSON has no grid; its text is whatever
     * PostTextExtractor can still read from it, so an old plain-text post
     * stays searchable.
     */
    public static Result of(String cleanedDescription) {
        if (cleanedDescription == null || cleanedDescription.isBlank()) return NOTHING;

        String gridJson = null;
        boolean tooBig = false;
        // The same shortcut as firstGridOfPost: most posts have no grid, and
        // those are not parsed a second time here.
        if (cleanedDescription.contains("\"tilegrid\"")) {
            try {
                JsonNode grid = firstGrid(JSON.readTree(cleanedDescription).path("root"), 0);
                if (grid != null) {
                    String json = JSON.writeValueAsString(grid);
                    if (json.length() > PREVIEW_MAX_CHARS) tooBig = true;
                    else gridJson = json;
                }
            } catch (Exception | StackOverflowError e) {
                gridJson = null;
                tooBig = false;
            }
        }

        String text;
        try { text = searchText(cleanedDescription); }
        catch (Exception | StackOverflowError e) { text = ""; }
        return new Result(gridJson, text, tooBig);
    }

    /**
     * The preview as stored JSON text: the stored one, or when the row is not
     * yet computed (bodyFallback != null) the grid found in the body on the
     * fly, or null. For a bean field serialised with @JsonRawValue.
     */
    public static String previewJson(String storedPreview, String bodyFallback) {
        if (storedPreview != null) return storedPreview;
        return bodyFallback == null ? null : of(bodyFallback).gridJson();
    }

    /**
     * What a list item puts under "preview": a Jackson RawValue of the stored
     * preview, or when the row is not yet computed (bodyFallback != null) the
     * grid found in the body on the fly, or null. A RawValue inside a Map is
     * written as the JSON it holds, not as a string.
     */
    public static Object previewValue(String storedPreview, String bodyFallback) {
        String json = previewJson(storedPreview, bodyFallback);
        return json == null ? null : new RawValue(json);
    }

    /**
     * Depth-first, children in order: the "grid" of the first tilegrid node
     * that has one. The same walk as firstGridOfPost in client/src/utils/gridPost.js,
     * so a card shows the grid it showed when the client found it in the body.
     */
    private static JsonNode firstGrid(JsonNode node, int depth) {
        if (node == null || !node.isObject() || depth > MAX_DEPTH) return null;
        JsonNode type = node.get("type");
        if (type != null && type.isTextual() && type.asText().equals("tilegrid") && node.path("grid").isObject())
            return node.get("grid");
        JsonNode children = node.get("children");
        if (children == null || !children.isArray()) return null;
        for (JsonNode child : children) {
            JsonNode found = firstGrid(child, depth + 1);
            if (found != null) return found;
        }
        return null;
    }

    /** The extractor's blocks, one per line, without the Markdown markers plain() adds. */
    private static String searchText(String description) {
        StringBuilder sb = new StringBuilder();
        for (PostTextExtractor.Block b : PostTextExtractor.extract(description).blocks()) {
            if (b.kind().equals("img") && b.text().isEmpty()) continue;
            if (sb.length() > 0) sb.append('\n');
            sb.append(b.text());
            if (sb.length() >= SEARCH_MAX_CHARS) break;
        }
        return storable(sb);
    }

    /**
     * Cut to the cap and made safe for a PostgreSQL text column: a NUL
     * character (legal inside a JSON string as an escape, so the body can hold
     * one) is refused by the database and would fail the whole save, and a cut
     * must not leave half a surrogate pair at the end.
     */
    private static String storable(StringBuilder sb) {
        if (sb.length() > SEARCH_MAX_CHARS) sb.setLength(SEARCH_MAX_CHARS);
        if (sb.length() > 0 && Character.isHighSurrogate(sb.charAt(sb.length() - 1))) sb.setLength(sb.length() - 1);
        String s = sb.toString();
        return s.indexOf('\u0000') < 0 ? s : s.replace("\u0000", "");
    }
}
