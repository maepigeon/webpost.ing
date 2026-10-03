package com.springbootprojects.webpostingserver;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.springbootprojects.webpostingserver.posts.validator.PostContentValidator;
import com.springbootprojects.webpostingserver.posts.validator.PostContentValidator.InvalidPostContentException;
import org.junit.jupiter.api.Test;

import java.nio.ByteBuffer;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PostContentValidatorTest {

    private static final ObjectMapper M = new ObjectMapper();

    /** A PNG header declaring the given size, as a data URL (enough for the size check). */
    private static String png(int w, int h) {
        ByteBuffer b = ByteBuffer.allocate(33);
        b.put(new byte[]{(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A});
        b.putInt(13).put(new byte[]{'I', 'H', 'D', 'R'}).putInt(w).putInt(h).put(new byte[]{8, 6, 0, 0, 0});
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(b.array()) + "AAAA";
    }

    private static String doc(String... children) {
        return "{\"root\":{\"type\":\"root\",\"version\":1,\"direction\":\"ltr\",\"format\":\"\",\"indent\":0,\"children\":["
                + String.join(",", children) + "]}}";
    }

    private static String text(String t, String style) {
        return "{\"type\":\"text\",\"version\":1,\"text\":\"" + t + "\",\"format\":0,\"detail\":0,\"mode\":\"normal\",\"style\":\""
                + style + "\"}";
    }

    private static String para(String... kids) {
        return "{\"type\":\"paragraph\",\"version\":1,\"format\":\"\",\"indent\":0,\"direction\":\"ltr\",\"textFormat\":0,\"textStyle\":\"\",\"children\":["
                + String.join(",", kids) + "]}";
    }

    private static String grid(String paint) {
        return "{\"type\":\"tilegrid\",\"version\":1,\"grid\":{\"v\":3,\"cols\":8,\"rows\":3,\"glyphs\":{},\"layers\":[{\"id\":\"a1\",\"name\":\"L\","
                + "\"visible\":true,\"kind\":\"pixel\",\"paint\":" + paint + ",\"text\":[\"hi\"],\"style\":{},\"wide\":[]}]}}";
    }

    private static String clean(String json) throws Exception {
        return PostContentValidator.clean(json);
    }

    private static void rejects(String json, String messagePart) {
        assertThatThrownBy(() -> PostContentValidator.clean(json))
                .isInstanceOf(InvalidPostContentException.class)
                .hasMessageContaining(messagePart);
    }

    private static JsonNode firstText(String cleaned) throws Exception {
        return M.readTree(cleaned).path("root").path("children").get(0).path("children").get(0);
    }

    // ── Valid content ─────────────────────────────────────────────────────────

    @Test
    void aRealisticPostPassesAndKeepsItsMeaning() throws Exception {
        String json = doc(
                "{\"type\":\"heading\",\"tag\":\"h2\",\"version\":1,\"format\":\"center\",\"indent\":0,\"direction\":\"ltr\",\"children\":[" + text("Hello", "") + "]}",
                para(text("Red big", "color: #ff0000; font-size: 24px; font-family: Georgia, \\\"Times New Roman\\\", serif; line-height: 1.5;"),
                        "{\"type\":\"link\",\"version\":1,\"url\":\"https://example.com/a?b=1\",\"rel\":\"noopener\",\"target\":\"_blank\",\"title\":null,\"format\":\"\",\"indent\":0,\"direction\":\"ltr\",\"children\":[" + text("a link", "") + "]}"),
                "{\"type\":\"list\",\"listType\":\"bullet\",\"start\":1,\"tag\":\"ul\",\"version\":1,\"format\":\"\",\"indent\":0,\"direction\":\"ltr\",\"children\":["
                        + "{\"type\":\"listitem\",\"value\":1,\"version\":1,\"format\":\"\",\"indent\":0,\"direction\":\"ltr\",\"children\":[" + text("one", "") + "]}]}",
                "{\"type\":\"image\",\"version\":1,\"src\":\"/uploads/abc-123.jpg\",\"altText\":\"cat\",\"alignment\":\"center\",\"width\":null,"
                        + "\"srcset\":\"/uploads/abc-123-480w.jpg 480w, /uploads/abc-123-960w.jpg 960w, /uploads/abc-123.jpg 2400w\"}",
                "{\"type\":\"audio\",\"version\":1,\"src\":\"/uploads/song.mp3\",\"title\":\"Song\"}",
                "{\"type\":\"math\",\"version\":1,\"equation\":\"x^2+y^2=z^2\"}",
                "{\"type\":\"code\",\"version\":1,\"language\":\"js\",\"lightMode\":false,\"lineNumbers\":true,\"children\":[{\"type\":\"code-highlight\",\"version\":1,\"text\":\"a=1\",\"format\":0,\"detail\":0,\"mode\":\"normal\",\"style\":\"\",\"highlightType\":\"number\"}]}",
                grid("\"" + png(128, 48) + "\""));
        String out = clean(json);
        JsonNode root = M.readTree(out);
        JsonNode kids = root.path("root").path("children");
        assertThat(kids).hasSize(8);
        JsonNode red = kids.get(1).path("children").get(0);
        assertThat(red.path("style").asText()).isEqualTo(
                "color: #ff0000; font-size: 24px; font-family: Georgia, \"Times New Roman\", serif; line-height: 1.5;");
        assertThat(kids.get(1).path("children").get(1).path("url").asText()).isEqualTo("https://example.com/a?b=1");
        assertThat(kids.get(3).path("src").asText()).isEqualTo("/uploads/abc-123.jpg");
        assertThat(kids.get(3).path("srcset").asText()).contains("480w");
        assertThat(kids.get(4).path("src").asText()).isEqualTo("/uploads/song.mp3");
        assertThat(kids.get(5).path("equation").asText()).isEqualTo("x^2+y^2=z^2");
        assertThat(kids.get(2).path("children").get(0).path("children").get(0).path("text").asText()).isEqualTo("one");
        assertThat(kids.get(0).path("format").asText()).isEqualTo("center");
        assertThat(kids.get(7).path("grid").path("layers").get(0).path("paint").asText()).startsWith("data:image/png;base64,");
        // Cleaning twice changes nothing more.
        assertThat(clean(out)).isEqualTo(out);
    }

    @Test
    void anEmptyBodyIsLeftAlone() throws Exception {
        assertThat(PostContentValidator.clean(null)).isNull();
        assertThat(PostContentValidator.clean("")).isEmpty();
    }

    @Test
    void unknownNodeTypesAreKept() throws Exception {
        String out = clean(doc("{\"type\":\"poll\",\"version\":1,\"options\":[\"a\",\"b\"],\"src\":\"x\"}"));
        assertThat(M.readTree(out).path("root").path("children").get(0).path("options")).hasSize(2);
    }

    @Test
    void anUnknownNodesHugeStringIsRefused() {
        rejects(doc("{\"type\":\"poll\",\"blob\":\"" + "a".repeat(100_001) + "\"}"), "too long");
    }

    // ── Structure ────────────────────────────────────────────────────────────

    @Test
    void malformedOrMisshapenJsonIsRefused() {
        rejects("Updated body", "not valid");
        rejects("{\"root\":", "not valid");
        rejects("[]", "not valid");
        rejects("{}", "not valid");
        rejects("{\"root\":{\"children\":{}}}", "not valid");
        rejects("{\"root\":{\"children\":[1]}}", "not valid");
    }

    @Test
    void tooDeepIsRefusedAndTheLimitItselfPasses() throws Exception {
        assertThat(clean(nested(39))).isNotNull(); // root + 39 = 40 levels
        rejects(nested(40), "nested too deeply");
    }

    private static String nested(int levels) {
        StringBuilder sb = new StringBuilder("{\"root\":{\"type\":\"root\",\"children\":[");
        for (int i = 0; i < levels - 1; i++) sb.append("{\"type\":\"quote\",\"children\":[");
        if (levels > 0) sb.append("{\"type\":\"paragraph\",\"children\":[]}");
        for (int i = 0; i < levels - 1; i++) sb.append("]}");
        return sb.append("]}}").toString();
    }

    @Test
    void tooManyNodesIsRefused() throws Exception {
        String p = "{\"type\":\"paragraph\",\"children\":[]}";
        String ok = doc(String.join(",", java.util.Collections.nCopies(19_999, p)));
        assertThat(clean(ok)).isNotNull();
        String bad = doc(String.join(",", java.util.Collections.nCopies(20_000, p)));
        rejects(bad, "too many");
    }

    // ── Images, audio, links ─────────────────────────────────────────────────

    @Test
    void imagesMustBeUploadsOfThisSite() {
        for (String src : new String[]{"https://evil.example/p.gif", "//evil.example/p.gif", "/uploads/../etc/passwd",
                "/uploads//x.png", "data:image/gif;base64,AAAA", "/other/x.png", "uploads/x.png", ""}) {
            rejects(doc("{\"type\":\"image\",\"src\":\"" + src + "\",\"altText\":\"\"}"), "Images must be uploaded to this site.");
        }
        rejects(doc("{\"type\":\"image\",\"altText\":\"\"}"), "Images must be uploaded to this site.");
    }

    @Test
    void anImageSrcsetMustAlsoBeUploads() {
        rejects(doc("{\"type\":\"image\",\"src\":\"/uploads/a.jpg\",\"srcset\":\"/uploads/a.jpg 1x, https://evil.example/x.gif 2x\"}"),
                "Images must be uploaded");
        rejects(doc("{\"type\":\"image\",\"src\":\"/uploads/a.jpg\",\"srcSet\":\"https://evil.example/x.gif\"}"), "Images must be uploaded");
    }

    @Test
    void audioMustBeAnUpload() {
        rejects(doc("{\"type\":\"audio\",\"src\":\"https://evil.example/a.mp3\",\"title\":\"\"}"), "must be uploaded to this site");
    }

    @Test
    void linksAllowWebMailAndSitePathsOnly() throws Exception {
        for (String url : new String[]{"http://a.example", "HTTPS://a.example/x", "mailto:me@a.example", "/posts/1", "#top"}) {
            clean(doc(para("{\"type\":\"link\",\"url\":\"" + url + "\",\"children\":[]}")));
        }
        for (String url : new String[]{"javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "vbscript:x",
                " javascript:alert(1)", "java\\tscript:alert(1)", "//evil.example", "ftp://a.example"}) {
            rejects(doc(para("{\"type\":\"link\",\"url\":\"" + url + "\",\"children\":[]}")), "Links must start with");
        }
    }

    // ── Styles ───────────────────────────────────────────────────────────────

    @Test
    void textStyleKeepsOnlyAllowedSafeDeclarations() throws Exception {
        String style = "position:fixed; inset:0; z-index:99999; color:#abc; background-image:url(https://evil.example/x.png);"
                + " background-color: rgb(1, 2, 3); font-size: 18px; font-weight: bold; text-decoration: underline; letter-spacing: 1px";
        JsonNode t = firstText(clean(doc(para(text("x", style)))));
        assertThat(t.path("style").asText()).isEqualTo(
                "color: #abc; background-color: rgb(1, 2, 3); font-size: 18px; font-weight: bold; text-decoration: underline; letter-spacing: 1px;");
    }

    @Test
    void unsafeValuesAreDropped() throws Exception {
        String[] bad = {"color: url(https://e.example/x)", "color: expression(alert(1))", "color: red !important",
                "font-size: 4px", "font-size: 500px", "font-size: 2em", "font-size: 18px url(x)",
                "font-family: url(x)", "color: #12", "color: red\\\\3b", "line-height: 99",
                "font-weight: 9999", "letter-spacing: 90px", "background-color: var(--x)"};
        for (String s : bad) {
            assertThat(firstText(clean(doc(para(text("x", s))))).path("style").asText()).as(s).isEmpty();
        }
    }

    @Test
    void blockStylesAreCleanedToo() throws Exception {
        String p = "{\"type\":\"paragraph\",\"format\":\"javascript:1\",\"style\":\"position:fixed;color:blue\",\"textStyle\":\"top:0\",\"children\":[]}";
        JsonNode n = M.readTree(clean(doc(p))).path("root").path("children").get(0);
        assertThat(n.path("style").asText()).isEqualTo("color: blue;");
        assertThat(n.path("textStyle").asText()).isEmpty();
        assertThat(n.path("format").asText()).isEmpty();
    }

    // ── Math ─────────────────────────────────────────────────────────────────

    @Test
    void aFormulaIsCapped() throws Exception {
        clean(doc("{\"type\":\"math\",\"equation\":\"" + "x".repeat(10_000) + "\"}"));
        rejects(doc("{\"type\":\"math\",\"equation\":\"" + "x".repeat(10_001) + "\"}"), "formula is too long");
    }

    // ── Tile grids ───────────────────────────────────────────────────────────

    @Test
    void aGridIsRebuiltFromKnownFields() throws Exception {
        String g = "{\"type\":\"tilegrid\",\"version\":1,\"evil\":\"x\",\"grid\":{\"cols\":9999,\"rows\":9999,\"junk\":1,"
                + "\"layers\":[{\"id\":\"a1\",\"kind\":\"photo\",\"src\":\"https://evil.example/x.png\"},"
                + "{\"id\":\"b2\",\"kind\":\"pixel\",\"paint\":null,\"text\":[],\"style\":{}}],"
                + "\"links\":[{\"href\":\"javascript:alert(1)\",\"tiles\":[\"0,0\"]}]}}";
        JsonNode n = M.readTree(clean(doc(g))).path("root").path("children").get(0);
        assertThat(n.has("evil")).isFalse();
        assertThat(n.path("grid").has("junk")).isFalse();
        assertThat(n.path("grid").path("cols").asInt()).isEqualTo(64);
        assertThat(n.path("grid").path("rows").asInt()).isEqualTo(48);
        assertThat(n.path("grid").path("layers")).hasSize(1);   // the remote photo layer is dropped
        assertThat(n.path("grid").has("links")).isFalse();
    }

    @Test
    void gridPaintMustBeASmallPng() {
        rejects(doc(grid("\"https://evil.example/x.png\"")), "PNG");
        rejects(doc(grid("\"data:image/svg+xml;base64,AAAA\"")), "PNG");
        rejects(doc(grid("\"data:image/png;base64,AAAA\"")), "PNG");              // not a real header
        rejects(doc(grid("\"" + png(60000, 60000) + "\"")), "PNG");               // tiny file, huge claimed size
        rejects(doc(grid("\"data:image/png;base64," + "A".repeat(1_500_001) + "\"")), "too large");
    }

    @Test
    void aGridWithoutAGridObjectIsRefused() {
        rejects(doc("{\"type\":\"tilegrid\",\"version\":1}"), "tile grid");
    }

    private static String button(String label, String action, String target, String style, String align) {
        return "{\"type\":\"button\",\"version\":1,\"label\":\"" + label + "\",\"action\":\"" + action
                + "\",\"target\":\"" + target + "\",\"style\":\"" + style + "\",\"align\":\"" + align + "\",\"extra\":\"x\"}";
    }

    @Test
    void buttonsKeepValidTargetsAndDropExtraFields() throws Exception {
        for (String[] ok : new String[][]{
                {"link", "https://example.com/a"}, {"link", "/mae"}, {"post", "/mae/hello"}, {"audio", "/uploads/audio/a.mp3"}}) {
            JsonNode b = M.readTree(clean(doc(button("Go", ok[0], ok[1], "outline", "center")))).path("root").path("children").get(0);
            assertThat(b.path("target").asText()).isEqualTo(ok[1]);
            assertThat(b.path("style").asText()).isEqualTo("outline");
            assertThat(b.path("align").asText()).isEqualTo("center");
            assertThat(b.has("extra")).isFalse();
        }
    }

    @Test
    void buttonStyleAndAlignFallBack() throws Exception {
        JsonNode b = M.readTree(clean(doc(button("Go", "link", "/mae", "red", "middle")))).path("root").path("children").get(0);
        assertThat(b.path("style").asText()).isEqualTo("solid");
        assertThat(b.path("align").asText()).isEqualTo("left");
    }

    @Test
    void buttonTargetsMustBeAllowed() {
        rejects(doc(button("Go", "link", "javascript:alert(1)", "solid", "left")), "http");
        rejects(doc(button("Go", "link", "mailto:a@b.c", "solid", "left")), "http");
        rejects(doc(button("Go", "link", "//evil.example", "solid", "left")), "http");
        rejects(doc(button("Go", "post", "https://example.com/x", "solid", "left")), "path");
        rejects(doc(button("Go", "audio", "https://example.com/a.mp3", "solid", "left")), "uploaded");
        rejects(doc(button("Go", "audio", "/uploads/../etc/passwd", "solid", "left")), "uploaded");
        rejects(doc(button("Go", "dance", "/mae", "solid", "left")), "button");
    }

    @Test
    void buttonLabelIsCappedAndCleaned() throws Exception {
        rejects(doc(button("a".repeat(61), "link", "/mae", "solid", "left")), "60");
        JsonNode b = M.readTree(clean(doc(button("Go\\u0007now", "link", "/mae", "solid", "left")))).path("root").path("children").get(0);
        assertThat(b.path("label").asText()).isEqualTo("Gonow");
    }
}
