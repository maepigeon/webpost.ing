package com.springbootprojects.webpostingserver.posts.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns a post's stored content (the editor's Lexical JSON) into plain
 * structured text, for crawlers, link previews and AI readers.
 *
 * Tolerant on purpose: this runs on public pages, so a post with broken or
 * unexpected content must still give something readable instead of an error.
 */
public final class PostTextExtractor {

    /** Characters of text kept per post; the rest is dropped. */
    public static final int MAX_CHARS = 20_000;
    private static final int MAX_DEPTH = 24;
    private static final ObjectMapper JSON = new ObjectMapper();

    /**
     * One readable piece. kind: h1..h6, p, quote, code, li, img.
     * For li, extra is "ol" or "ul"; for img, text is the alt text and extra the src.
     */
    public record Block(String kind, String text, String extra) {}

    /** What was found: blocks in reading order, and every link as {label, url}. */
    public record Extracted(List<Block> blocks, List<String[]> links) {
        /** The text alone, one block per line; headings and list items are marked as in Markdown. */
        public String plain() {
            StringBuilder sb = new StringBuilder();
            for (Block b : blocks) {
                if (b.kind().equals("img") && b.text().isEmpty()) continue;
                if (sb.length() > 0) sb.append('\n');
                if (b.kind().startsWith("h")) sb.append("#".repeat(b.kind().charAt(1) - '0')).append(' ');
                else if (b.kind().equals("li")) sb.append("- ");
                sb.append(b.text());
            }
            return sb.toString();
        }

        /** The first {@code max} characters of the prose (no code or images) on one line, cut at a word. */
        public String excerpt(int max) {
            StringBuilder sb = new StringBuilder();
            for (Block b : blocks) {
                if (b.kind().equals("img") || b.kind().equals("code")) continue;
                if (sb.length() > 0) sb.append(' ');
                sb.append(b.text());
                if (sb.length() > max * 2) break;
            }
            return shorten(sb.toString(), max);
        }
    }

    private PostTextExtractor() {}

    /** Collapses whitespace and cuts to {@code max} characters at a word boundary, with an ellipsis if cut. */
    public static String shorten(String text, int max) {
        String s = text == null ? "" : text.replaceAll("\\s+", " ").trim();
        if (s.length() <= max) return s;
        int cut = s.lastIndexOf(' ', max);
        if (cut < max / 2) cut = max;
        return s.substring(0, cut).trim() + "…";
    }

    public static Extracted extract(String stored) {
        State st = new State();
        if (stored == null || stored.isBlank()) return st.done();
        try {
            JsonNode root = JSON.readTree(stored);
            if (root == null || !root.isObject()) throw new IllegalArgumentException("not an object");
            JsonNode top = root.has("root") ? root.get("root") : root;
            blocks(top.path("children"), st, 0);
            if (st.blocks.isEmpty() && !hasChildren(top)) throw new IllegalArgumentException("empty");
        } catch (Exception e) {
            // Not usable JSON: take what text can be found by stripping.
            st = new State();
            st.add("p", strip(stored), null);
        }
        return st.done();
    }

    private static boolean hasChildren(JsonNode n) { return n.path("children").isArray() && n.path("children").size() > 0; }

    private static final Pattern TEXT_FIELD = Pattern.compile("\"text\"\\s*:\\s*(\"(?:[^\"\\\\]|\\\\.)*\")");
    private static final Pattern TAGS = Pattern.compile("<[^>]*>");

    /** Last resort for content that is not valid JSON: the "text" values if it looks like JSON, else the text without tags. */
    private static String strip(String s) {
        String trimmed = s.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            StringBuilder sb = new StringBuilder();
            Matcher m = TEXT_FIELD.matcher(trimmed);
            while (m.find() && sb.length() < MAX_CHARS) {
                try { sb.append(JSON.readValue(m.group(1), String.class)).append(' '); }
                catch (Exception ignored) { /* skip a broken value */ }
            }
            return sb.toString();
        }
        return TAGS.matcher(s).replaceAll(" ");
    }

    private static final class State {
        final List<Block> blocks = new ArrayList<>();
        final List<String[]> links = new ArrayList<>();
        int chars;

        boolean full() { return chars >= MAX_CHARS; }

        void add(String kind, String text, String extra) {
            String t = kind.equals("code") ? text.strip() : text.replaceAll("\\s+", " ").trim();
            if (t.isEmpty() && !kind.equals("img")) return;
            if (full()) return;
            if (chars + t.length() > MAX_CHARS) t = t.substring(0, MAX_CHARS - chars);
            chars += t.length();
            blocks.add(new Block(kind, t, extra));
        }

        Extracted done() { return new Extracted(List.copyOf(blocks), List.copyOf(links)); }
    }

    private static void blocks(JsonNode children, State st, int depth) {
        if (!children.isArray() || depth > MAX_DEPTH) return;
        for (JsonNode n : children) {
            if (st.full()) return;
            block(n, st, depth);
        }
    }

    private static void block(JsonNode n, State st, int depth) {
        String type = n.path("type").asText("");
        switch (type) {
            case "paragraph", "text", "link", "autolink" -> st.add("p", inline(n, st, false), null);
            case "heading" -> {
                String tag = n.path("tag").asText("h2");
                st.add(tag.matches("h[1-6]") ? tag : "h2", inline(n, st, false), null);
            }
            case "quote" -> st.add("quote", inline(n, st, false), null);
            case "code" -> st.add("code", inline(n, st, true), null);
            case "list" -> list(n, st, depth);
            case "image" -> {
                String src = n.path("src").asText("");
                if (!src.isEmpty()) st.add("img", n.path("altText").asText(""), src);
            }
            case "math" -> st.add("code", n.path("equation").asText(""), null);
            case "tilegrid" -> grid(n.path("grid"), st);
            case "button" -> {
                // Crawlers see a link's label and where it goes; audio buttons are just the label.
                String label = n.path("label").asText("").trim();
                String act = n.path("action").asText("");
                String target = n.path("target").asText("");
                boolean goes = (act.equals("link") || act.equals("post")) && !target.isEmpty();
                st.add("p", goes ? (label.isEmpty() ? target : label + " (" + target + ")") : label, null);
                if (goes && st.links.size() < 200) st.links.add(new String[]{ label, target });
            }
            case "audio", "linebreak" -> { }
            default -> blocks(n.path("children"), st, depth + 1);
        }
    }

    private static void list(JsonNode list, State st, int depth) {
        String kind = "number".equals(list.path("listType").asText("")) ? "ol" : "ul";
        for (JsonNode item : list.path("children")) {
            if (st.full() || depth > MAX_DEPTH) return;
            // A list item holds its own text inline and nested lists as children.
            StringBuilder text = new StringBuilder();
            List<JsonNode> nested = new ArrayList<>();
            for (JsonNode c : item.path("children")) {
                if ("list".equals(c.path("type").asText())) nested.add(c);
                else text.append(inline(c, st, false)).append(' ');
            }
            st.add("li", text.toString(), kind);
            for (JsonNode c : nested) list(c, st, depth + 1);
        }
    }

    /** The readable text of the visible text layers: one paragraph per layer. */
    private static void grid(JsonNode grid, State st) {
        for (JsonNode layer : grid.path("layers")) {
            if (layer.path("visible").asBoolean(true) == false) continue;
            JsonNode rows = layer.path("text");
            if (!rows.isArray()) continue;
            StringBuilder sb = new StringBuilder();
            for (JsonNode row : rows) sb.append(row.asText("")).append(' ');
            st.add("p", sb.toString(), null);
        }
    }

    /** Text of a node and everything inside it; links are noted on the way. */
    private static String inline(JsonNode n, State st, boolean keepNewlines) {
        StringBuilder sb = new StringBuilder();
        inline(n, st, keepNewlines, sb, 0);
        return sb.toString();
    }

    private static void inline(JsonNode n, State st, boolean keepNewlines, StringBuilder sb, int depth) {
        if (depth > MAX_DEPTH || sb.length() > MAX_CHARS) return;
        String type = n.path("type").asText("");
        if (type.equals("text") || type.equals("code-highlight")) { sb.append(n.path("text").asText("")); return; }
        if (type.equals("linebreak")) { sb.append(keepNewlines ? '\n' : ' '); return; }
        if (type.equals("tab")) { sb.append(' '); return; }
        int start = sb.length();
        for (JsonNode c : n.path("children")) inline(c, st, keepNewlines, sb, depth + 1);
        if ((type.equals("link") || type.equals("autolink")) && n.hasNonNull("url") && st.links.size() < 200) {
            st.links.add(new String[]{ sb.substring(start).trim(), n.get("url").asText() });
        }
    }
}
