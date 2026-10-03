package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.SeoController;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Crawler endpoints show published posts only, and never emit unescaped user text. */
@SpringBootTest
@AutoConfigureMockMvc
class SeoControllerTest {

    private static final String AUTHOR = "seo_author";
    private static final String QUIET = "seo_quiet";

    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;

    private int pubId, draftId;

    @BeforeEach
    void setUp() {
        cleanUp();
        int author = newUser(AUTHOR);
        newUser(QUIET);
        pubId = newPost(author, "Seo <b>public</b> post", true, "seo-public");
        draftId = newPost(author, "Seo secret draft", false, "seo-draft");
    }

    @AfterEach
    void cleanUp() {
        for (Integer id : jdbc.queryForList("""
                SELECT j.post_id FROM users_posts_junctions j JOIN users u ON u.id = j.user_id
                 WHERE u.username IN (?, ?)""", Integer.class, AUTHOR, QUIET)) {
            jdbc.update("DELETE FROM users_posts_junctions WHERE post_id = ?", id);
            jdbc.update("DELETE FROM posts WHERE id = ?", id);
        }
        jdbc.update("DELETE FROM users WHERE username IN (?, ?)", AUTHOR, QUIET);
    }

    private int newUser(String name) {
        return jdbc.queryForObject("INSERT INTO users (username, password, bio) VALUES (?, 'x', ?) RETURNING id",
                Integer.class, name, "Bio with <script>alert(1)</script>");
    }

    private int newPost(int author, String title, boolean published, String slug) {
        String body = "{\"root\":{\"children\":[{\"type\":\"paragraph\",\"children\":[{\"type\":\"text\","
                + "\"text\":\"Body <i>text</i> of " + slug + "\"}]}]}}";
        int id = jdbc.queryForObject(
                "INSERT INTO posts (title, description, published, slug) VALUES (?, ?, ?, ?) RETURNING id",
                Integer.class, title, body, published, slug);
        jdbc.update("INSERT INTO users_posts_junctions (post_id, user_id) VALUES (?, ?)", id, author);
        return id;
    }

    private String body(String url) throws Exception {
        return mvc.perform(get(url)).andReturn().getResponse().getContentAsString();
    }

    @Test
    void escapeHandlesMarkupAndQuotes() {
        assertThat(SeoController.escape("<a href=\"x\">'&'</a>")).isEqualTo("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
        assertThat(SeoController.escape("a\u0000b")).isEqualTo("ab");
        assertThat(SeoController.escape(null)).isEmpty();
    }

    @Test
    void onlyHttpAndSiteRelativeLinksAreKept() {
        assertThat(SeoController.safeUrl("https://example.com/a")).isEqualTo("https://example.com/a");
        assertThat(SeoController.safeUrl("/uploads/a.png")).isEqualTo("/uploads/a.png");
        assertThat(SeoController.safeUrl("javascript:alert(1)")).isNull();
        assertThat(SeoController.safeUrl("data:text/html,x")).isNull();
        assertThat(SeoController.safeUrl("//evil.example")).isNull();
    }

    @Test
    void publishedPostPageHasMetaJsonLdAndEscapedText() throws Exception {
        mvc.perform(get("/api/seo/page").param("path", "/" + AUTHOR + "/seo-public"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "max-age=300, public"));
        String html = body("/api/seo/page?path=/" + AUTHOR + "/seo-public");
        assertThat(html).contains("<title>Seo &lt;b&gt;public&lt;/b&gt; post — " + AUTHOR + "</title>")
                .contains("rel=\"canonical\"").contains("property=\"og:type\" content=\"article\"")
                .contains("\"@type\":\"BlogPosting\"").contains("<h1>Seo &lt;b&gt;public&lt;/b&gt; post</h1>")
                .contains("Body &lt;i&gt;text&lt;/i&gt; of seo-public")
                .doesNotContain("<b>public").doesNotContain("<i>text");
        // Also by id and by the title's own slug.
        assertThat(body("/api/seo/page?path=/" + AUTHOR + "/" + pubId)).contains("<h1>Seo");
    }

    @Test
    void draftsAndUnknownPathsAre404() throws Exception {
        mvc.perform(get("/api/seo/page").param("path", "/" + AUTHOR + "/seo-draft")).andExpect(status().isNotFound());
        mvc.perform(get("/api/seo/page").param("path", "/" + AUTHOR + "/" + draftId)).andExpect(status().isNotFound());
        mvc.perform(get("/api/seo/page").param("path", "/" + AUTHOR + "/nothing")).andExpect(status().isNotFound());
        mvc.perform(get("/api/seo/page").param("path", "/no_such_user_seo")).andExpect(status().isNotFound());
        mvc.perform(get("/api/seo/page").param("path", "/" + QUIET)).andExpect(status().isNotFound());   // nothing published
        mvc.perform(get("/api/seo/page").param("path", "/a/b/c")).andExpect(status().isNotFound());
        assertThat(body("/api/seo/page?path=/" + AUTHOR)).doesNotContain("secret draft");
    }

    @Test
    void profilePageListsPublishedPostsAndEscapesTheBio() throws Exception {
        String html = body("/api/seo/page?path=/" + AUTHOR);
        assertThat(html).contains("property=\"og:type\" content=\"profile\"").contains("ProfilePage")
                .contains("/" + AUTHOR + "/seo-public").doesNotContain("seo-draft")
                .contains("&lt;script&gt;alert(1)&lt;/script&gt;").doesNotContain("<script>alert");
    }

    @Test
    void sitemapHasPublishedPostsAndProfilesWithPostsOnly() throws Exception {
        mvc.perform(get("/api/seo/sitemap.xml")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "max-age=300, public"));
        String xml = body("/api/seo/sitemap.xml");
        assertThat(xml).contains("/" + AUTHOR + "/seo-public</loc>").contains("/" + AUTHOR + "</loc>")
                .doesNotContain("seo-draft").doesNotContain("/" + QUIET + "<");
    }

    @Test
    void feedAndTextFiles() throws Exception {
        String atom = body("/api/seo/feed/" + AUTHOR + ".atom");
        assertThat(atom).contains("<feed").contains("seo-public").doesNotContain("seo-draft")
                .contains("Seo &lt;b&gt;public&lt;/b&gt; post");
        mvc.perform(get("/api/seo/feed/no_such_user_seo.atom")).andExpect(status().isNotFound());
        assertThat(body("/api/seo/robots.txt")).contains("Disallow: /api/").contains("Allow: /api/seo/").contains("Sitemap: ");
        assertThat(body("/api/seo/llms.txt")).contains("/api/seo/page?path=").contains(".atom");
    }
}
