package com.springbootprojects.webpostingserver;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.springbootprojects.webpostingserver.posts.model.Post;
import com.springbootprojects.webpostingserver.posts.service.PostPreview;
import com.springbootprojects.webpostingserver.posts.service.PostPreview.Result;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * What a post's card and the search keep of its body (V020): the first grid,
 * capped, and the plain text. Whatever the body holds, working it out never
 * throws, because it runs inside every save.
 */
class PostPreviewTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static String doc(String children) {
        return "{\"root\":{\"type\":\"root\",\"children\":[" + children + "]}}";
    }

    private static String text(String t) { return "{\"type\":\"text\",\"text\":\"" + t + "\"}"; }

    private static String paragraph(String t) { return "{\"type\":\"paragraph\",\"children\":[" + text(t) + "]}"; }

    private static String gridObject(String word) {
        return "{\"cols\":16,\"rows\":8,\"layers\":[{\"kind\":\"pixel\",\"visible\":true,\"text\":[\"" + word + "\"]}]}";
    }

    private static String grid(String word) {
        return "{\"type\":\"tilegrid\",\"version\":1,\"grid\":" + gridObject(word) + "}";
    }

    // ── Odd content ───────────────────────────────────────────────────────────

    @Test
    void nothingComesOfNoContent() {
        for (String empty : new String[] { null, "", "   \n" }) {
            Result r = PostPreview.of(empty);
            assertThat(r.gridJson()).isNull();
            assertThat(r.searchText()).isEmpty();
            assertThat(r.gridTooBig()).isFalse();
        }
    }

    @Test
    void contentThatIsNotTheEditorsJsonHasNoGridAndNeverThrows() {
        for (String odd : new String[] {
                "just some words", "<p>old <b>html</b></p>", "[1,2,3]", "42", "\"tilegrid\"", "{\"root\":5}",
                "{\"root\":{\"children\":\"tilegrid\"}}", "{\"root\":{\"type\":\"tilegrid\",\"grid\":",
                "{\"type\":\"tilegrid\",\"grid\":{\"cols\":1}}" }) {
            Result r = PostPreview.of(odd);
            assertThat(r.gridJson()).as(odd).isNull();
            assertThat(r.gridTooBig()).as(odd).isFalse();
            assertThat(r.searchText()).as(odd).isNotNull();
        }
        // An old plain-text post is still found by its words.
        assertThat(PostPreview.of("just some words").searchText()).isEqualTo("just some words");
        assertThat(PostPreview.of("<p>old <b>html</b></p>").searchText()).isEqualTo("old html");
    }

    @Test
    void aDocumentNestedBeyondReasonIsLeftAlone() {
        String deep = "{\"type\":\"x\",\"children\":[".repeat(5000) + grid("DEEP") + "]}".repeat(5000);
        Result r = PostPreview.of("{\"root\":" + deep + "}");
        assertThat(r.gridJson()).isNull();
        assertThat(r.gridTooBig()).isFalse();
    }

    // ── The first grid ────────────────────────────────────────────────────────

    @Test
    void thePreviewIsTheFirstGridsGridObjectUnchanged() throws Exception {
        Result r = PostPreview.of(doc(paragraph("before") + "," + grid("ONE") + "," + grid("TWO")));
        assertThat(JSON.readTree(r.gridJson())).isEqualTo(JSON.readTree(gridObject("ONE")));
        assertThat(r.gridTooBig()).isFalse();
    }

    @Test
    void aGridInsideOtherNodesIsFoundInReadingOrder() throws Exception {
        String nested = "{\"type\":\"list\",\"children\":[{\"type\":\"listitem\",\"children\":[" + grid("INNER") + "]}]}";
        Result r = PostPreview.of(doc(nested + "," + grid("LATER")));
        assertThat(JSON.readTree(r.gridJson())).isEqualTo(JSON.readTree(gridObject("INNER")));
    }

    @Test
    void aGridNodeWithoutAGridObjectIsPassedOver() throws Exception {
        String hollow = "{\"type\":\"tilegrid\",\"version\":1}";
        String wrong = "{\"type\":\"tilegrid\",\"grid\":\"nope\"}";
        assertThat(PostPreview.of(doc(hollow)).gridJson()).isNull();
        Result r = PostPreview.of(doc(hollow + "," + wrong + "," + grid("REAL")));
        assertThat(JSON.readTree(r.gridJson())).isEqualTo(JSON.readTree(gridObject("REAL")));
    }

    @Test
    void aPostWithoutAGridHasNoPreview() {
        Result r = PostPreview.of(doc(paragraph("the word tilegrid in prose is not a grid")));
        assertThat(r.gridJson()).isNull();
        assertThat(r.gridTooBig()).isFalse();
    }

    @Test
    void aGridOverTheCapIsNotKeptAndIsReported() {
        String paint = "a".repeat(PostPreview.PREVIEW_MAX_CHARS);
        String big = "{\"type\":\"tilegrid\",\"grid\":{\"cols\":64,\"rows\":48,\"layers\":[{\"kind\":\"pixel\",\"paint\":\"" + paint + "\"}]}}";
        // A small grid after it does not stand in: the card is about the first grid.
        Result r = PostPreview.of(doc(big + "," + grid("SMALL")));
        assertThat(r.gridJson()).isNull();
        assertThat(r.gridTooBig()).isTrue();
    }

    @Test
    void aGridOfExactlyTheCapIsKept() {
        String shell = "{\"layers\":[{\"paint\":\"\"}]}";
        String paint = "a".repeat(PostPreview.PREVIEW_MAX_CHARS - shell.length());
        Result r = PostPreview.of(doc("{\"type\":\"tilegrid\",\"grid\":{\"layers\":[{\"paint\":\"" + paint + "\"}]}}"));
        assertThat(r.gridJson()).hasSize(PostPreview.PREVIEW_MAX_CHARS);
        assertThat(r.gridTooBig()).isFalse();
    }

    // ── Search text ───────────────────────────────────────────────────────────

    @Test
    void searchTextIsThePlainTextOnePieceALineWithoutMarkers() {
        Result r = PostPreview.of(doc(
                "{\"type\":\"heading\",\"tag\":\"h2\",\"children\":[" + text("Title") + "]},"
                + "{\"type\":\"list\",\"listType\":\"bullet\",\"children\":[{\"type\":\"listitem\",\"children\":[" + text("item") + "]}]},"
                + "{\"type\":\"image\",\"src\":\"/uploads/a.png\",\"altText\":\"\"},"
                + "{\"type\":\"image\",\"src\":\"/uploads/b.png\",\"altText\":\"A cat\"},"
                + grid("HELLO")));
        assertThat(r.searchText()).isEqualTo("Title\nitem\nA cat\nHELLO");
    }

    @Test
    void searchTextStopsAtTheCap() {
        StringBuilder children = new StringBuilder();
        for (int i = 0; i < 400; i++) children.append(i == 0 ? "" : ",").append(paragraph("word ".repeat(20).trim()));
        Result r = PostPreview.of(doc(children.toString()));
        assertThat(r.searchText().length()).isLessThanOrEqualTo(PostPreview.SEARCH_MAX_CHARS).isGreaterThan(PostPreview.SEARCH_MAX_CHARS - 200);
    }

    @Test
    void searchTextHoldsNothingTheDatabaseWouldRefuse() {
        // \u0000 is a legal escape inside a JSON string, but PostgreSQL text cannot hold the character.
        Result r = PostPreview.of(doc(paragraph("be\\u0000fore")));
        assertThat(r.searchText()).isEqualTo("before");

        // A cut at the cap must not leave the first half of a pair.
        String smileys = "\\ud83d\\ude00".repeat(PostPreview.SEARCH_MAX_CHARS);
        String cut = PostPreview.of(doc(paragraph("a" + smileys))).searchText();
        assertThat(cut.length()).isLessThanOrEqualTo(PostPreview.SEARCH_MAX_CHARS);
        assertThat(Character.isHighSurrogate(cut.charAt(cut.length() - 1))).isFalse();
    }

    // ── What a list item carries ──────────────────────────────────────────────

    @Test
    void aListItemsPreviewIsWrittenAsAnObjectNotAString() throws Exception {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("stored", PostPreview.previewValue(gridObject("STORED"), null));
        item.put("fallback", PostPreview.previewValue(null, doc(grid("BODY"))));
        item.put("storedWins", PostPreview.previewValue(gridObject("STORED"), doc(grid("BODY"))));
        item.put("none", PostPreview.previewValue(null, null));
        item.put("bodyWithoutGrid", PostPreview.previewValue(null, doc(paragraph("text"))));

        JsonNode out = JSON.readTree(JSON.writeValueAsString(item));
        assertThat(out.get("stored")).isEqualTo(JSON.readTree(gridObject("STORED")));
        assertThat(out.get("fallback")).isEqualTo(JSON.readTree(gridObject("BODY")));
        assertThat(out.get("storedWins")).isEqualTo(JSON.readTree(gridObject("STORED")));
        assertThat(out.get("none").isNull()).isTrue();
        assertThat(out.get("bodyWithoutGrid").isNull()).isTrue();
    }

    @Test
    void thePostBeanWritesItsPreviewAsAnObjectAndNeverReadsOne() throws Exception {
        Post card = new Post();
        card.setTitle("gridded");
        card.setPreview(gridObject("CARD"));
        JsonNode out = JSON.readTree(JSON.writeValueAsString(card));
        assertThat(out.get("preview")).isEqualTo(JSON.readTree(gridObject("CARD")));
        assertThat(out.get("description").isNull()).isTrue();

        // A whole post (the post page, the pinned post) has a body and no preview. The client reads
        // "preview": null as "the server says no grid" and would not look in the body, so the key must be absent.
        Post whole = new Post("t", "{\"root\":{}}", true);
        JsonNode plain = JSON.readTree(JSON.writeValueAsString(whole));
        assertThat(plain.has("preview")).isFalse();
        assertThat(plain.has("description")).isTrue();

        // A client that sends a list item back (or anything under "preview") cannot set it.
        Post sent = JSON.readValue("{\"title\":\"t\",\"description\":\"d\",\"preview\":{\"cols\":1}}", Post.class);
        assertThat(sent.getTitle()).isEqualTo("t");
        assertThat(sent.getPreview()).isNull();
    }
}
