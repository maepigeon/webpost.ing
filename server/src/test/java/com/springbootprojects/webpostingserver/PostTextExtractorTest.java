package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.service.PostTextExtractor;
import com.springbootprojects.webpostingserver.posts.service.PostTextExtractor.Extracted;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** What crawlers read out of a post: the editor's JSON as plain structured text. */
class PostTextExtractorTest {

    private static String doc(String children) {
        return "{\"root\":{\"type\":\"root\",\"children\":[" + children + "]}}";
    }

    private static String text(String t) { return "{\"type\":\"text\",\"text\":\"" + t + "\"}"; }

    @Test
    void paragraphsAndHeadings() {
        Extracted e = PostTextExtractor.extract(doc(
                "{\"type\":\"heading\",\"tag\":\"h2\",\"children\":[" + text("Title") + "]},"
                + "{\"type\":\"paragraph\",\"children\":[" + text("Hello ") + "," + text("world") + "]}"));
        assertThat(e.blocks()).extracting("kind").containsExactly("h2", "p");
        assertThat(e.plain()).isEqualTo("## Title\nHello world");
    }

    @Test
    void listsKeepTheirKindAndNesting() {
        Extracted e = PostTextExtractor.extract(doc(
                "{\"type\":\"list\",\"listType\":\"number\",\"children\":["
                + "{\"type\":\"listitem\",\"children\":[" + text("one") + "]},"
                + "{\"type\":\"listitem\",\"children\":[{\"type\":\"list\",\"listType\":\"bullet\",\"children\":["
                + "{\"type\":\"listitem\",\"children\":[" + text("inner") + "]}]}]}]}"));
        assertThat(e.blocks()).extracting("kind").containsExactly("li", "li");
        assertThat(e.blocks().get(0).extra()).isEqualTo("ol");
        assertThat(e.blocks().get(1).text()).isEqualTo("inner");
        assertThat(e.blocks().get(1).extra()).isEqualTo("ul");
    }

    @Test
    void linksAreReadAsTextAndCollected() {
        Extracted e = PostTextExtractor.extract(doc(
                "{\"type\":\"paragraph\",\"children\":[" + text("see ")
                + ",{\"type\":\"link\",\"url\":\"https://example.com\",\"children\":[" + text("this") + "]}]}"));
        assertThat(e.plain()).isEqualTo("see this");
        assertThat(e.links()).hasSize(1);
        assertThat(e.links().get(0)).containsExactly("this", "https://example.com");
    }

    @Test
    void gridTextComesFromVisibleLayersOnly() {
        Extracted e = PostTextExtractor.extract(doc(
                "{\"type\":\"tilegrid\",\"version\":1,\"grid\":{\"layers\":["
                + "{\"kind\":\"pixel\",\"visible\":true,\"text\":[\"HELLO  \",\"GRID\"]},"
                + "{\"kind\":\"pixel\",\"visible\":false,\"text\":[\"HIDDEN\"]},"
                + "{\"kind\":\"photo\",\"visible\":true,\"src\":\"/uploads/x.png\"}]}}"));
        assertThat(e.plain()).isEqualTo("HELLO GRID");
    }

    @Test
    void imagesKeepSrcAndAlt() {
        Extracted e = PostTextExtractor.extract(doc("{\"type\":\"image\",\"src\":\"/uploads/a.png\",\"altText\":\"A cat\"}"));
        assertThat(e.blocks()).singleElement().satisfies(b -> {
            assertThat(b.kind()).isEqualTo("img");
            assertThat(b.text()).isEqualTo("A cat");
            assertThat(b.extra()).isEqualTo("/uploads/a.png");
        });
    }

    @Test
    void malformedInputFallsBackToStripping() {
        assertThat(PostTextExtractor.extract("<p>Plain <b>old</b> text</p>").plain()).isEqualTo("Plain old text");
        assertThat(PostTextExtractor.extract("{\"root\":{\"children\":[{\"type\":\"text\",\"text\":\"kept\"},{\"type\":").plain())
                .isEqualTo("kept");
        assertThat(PostTextExtractor.extract(null).blocks()).isEmpty();
        assertThat(PostTextExtractor.extract("   ").blocks()).isEmpty();
    }

    @Test
    void textIsCappedAndExcerptCutsAtAWord() {
        String long1 = "word ".repeat(10_000);
        Extracted e = PostTextExtractor.extract(doc(
                "{\"type\":\"paragraph\",\"children\":[" + text(long1) + "]},"
                + "{\"type\":\"paragraph\",\"children\":[" + text(long1) + "]},"
                + "{\"type\":\"paragraph\",\"children\":[" + text(long1) + "]}"));
        assertThat(e.plain().length()).isLessThanOrEqualTo(PostTextExtractor.MAX_CHARS + 3);
        String ex = e.excerpt(160);
        assertThat(ex.length()).isLessThanOrEqualTo(161);
        assertThat(ex).endsWith("word…");
    }

    @Test
    void aLinkButtonShowsItsLabelAndTarget() {
        Extracted e = PostTextExtractor.extract(doc(
                "{\"type\":\"button\",\"label\":\"Read more\",\"action\":\"post\",\"target\":\"/mae/hello\"},"
                + "{\"type\":\"button\",\"label\":\"Song\",\"action\":\"audio\",\"target\":\"/uploads/a.mp3\"}"));
        assertThat(e.plain()).isEqualTo("Read more (/mae/hello)\nSong");
        assertThat(e.links()).hasSize(1);
        assertThat(e.links().get(0)[1]).isEqualTo("/mae/hello");
    }
}
