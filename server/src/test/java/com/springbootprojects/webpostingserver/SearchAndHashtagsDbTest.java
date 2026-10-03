package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.PostController;
import com.springbootprojects.webpostingserver.posts.model.Post;
import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Post search runs over the stored text and keeps its visibility rules; hashtags are saved in two statements. */
@SpringBootTest
class SearchAndHashtagsDbTest {

    private static final String AUTHOR = "wp3_author";

    @Autowired JdbcTemplate jdbc;
    @Autowired PostRepository posts;
    @Autowired PostController postController;
    @Autowired SocialRepository social;

    private int authorId;

    @BeforeEach
    void setUp() {
        cleanUp();
        authorId = jdbc.queryForObject("INSERT INTO users (username, password) VALUES (?, 'x') RETURNING id", Integer.class, AUTHOR);
    }

    @AfterEach
    void cleanUp() {
        for (Integer id : jdbc.queryForList("SELECT j.post_id FROM users_posts_junctions j JOIN users u ON u.id = j.user_id WHERE u.username = ?", Integer.class, AUTHOR)) {
            jdbc.update("DELETE FROM post_hashtags WHERE post_id = ?", id);
            jdbc.update("DELETE FROM users_posts_junctions WHERE post_id = ?", id);
            jdbc.update("DELETE FROM posts WHERE id = ?", id);
        }
        jdbc.update("DELETE FROM hashtags WHERE tag LIKE 'wp3tag%'");
        jdbc.update("DELETE FROM users WHERE username = ?", AUTHOR);
    }

    private static String body(String text) {
        return "{\"root\":{\"children\":[{\"type\":\"paragraph\",\"children\":[{\"type\":\"text\",\"text\":\"" + text + "\"}]}]}}";
    }

    private int post(String title, String text, boolean published, String section) {
        Post p = new Post();
        p.setTitle(title);
        p.setDescription(body(text));
        p.setPublished(published);
        posts.save(p, authorId);
        int id = jdbc.queryForObject("SELECT p.id FROM posts p JOIN users_posts_junctions j ON j.post_id=p.id WHERE j.user_id=? AND p.title=?", Integer.class, authorId, title);
        if (!"profile".equals(section)) jdbc.update("UPDATE posts SET section = ? WHERE id = ?", section, id);
        return id;
    }

    private List<Integer> found(String q, String from) {
        return postController.searchPosts(q, from).getBody().stream().map(r -> ((Number) r.get("id")).intValue()).toList();
    }

    @Test
    void findsAPublishedPostByItsBodyWords() {
        int id = post("plain title", "zebrafinch lives here", true, "profile");
        assertThat(found("zebrafinch", null)).containsExactly(id);
        assertThat(found("zebrafinch", AUTHOR)).containsExactly(id);
        assertThat(found("ZEBRAFINCH", null)).containsExactly(id);
    }

    @Test
    void aDraftsWordsAreNotFindableByAnyone() {
        post("draft title", "quokkasecret only in a draft", false, "profile");
        assertThat(found("quokkasecret", null)).isEmpty();
        assertThat(found("quokkasecret", AUTHOR)).isEmpty();
        // The draft is still there with its text stored: only the published filter hides it.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM posts WHERE search_text ILIKE '%quokkasecret%'", Integer.class)).isEqualTo(1);
    }

    @Test
    void subscribersOnlyPostsAreNotFindable() {
        post("subs title", "axolotlsecret for subscribers", true, "subscribers");
        assertThat(found("axolotlsecret", null)).isEmpty();
    }

    @Test
    void aPostPublishedLaterBecomesFindable() {
        int id = post("later title", "pangolinlater words", false, "profile");
        assertThat(found("pangolinlater", null)).isEmpty();
        jdbc.update("UPDATE posts SET published = true WHERE id = ?", id);
        assertThat(found("pangolinlater", null)).containsExactly(id);
    }

    // ── Hashtags ──────────────────────────────────────────────────────────────

    private List<String> tagsOf(int postId) {
        return jdbc.queryForList("SELECT h.tag FROM post_hashtags ph JOIN hashtags h ON h.id = ph.hashtag_id WHERE ph.post_id = ? ORDER BY h.tag", String.class, postId);
    }

    @Test
    void hashtagsAreSavedLowercasedWithoutRepeatsAndReplacedOnResave() {
        int id = post("tags title", "x", true, "profile");
        social.parseAndSaveHashtags(id, body("hello #wp3tagA and #WP3TAGa and #wp3tagb"));
        assertThat(tagsOf(id)).containsExactly("wp3taga", "wp3tagb");

        social.parseAndSaveHashtags(id, body("now only #wp3tagb and #wp3tagc"));
        assertThat(tagsOf(id)).containsExactly("wp3tagb", "wp3tagc");

        social.parseAndSaveHashtags(id, body("no tags left"));
        assertThat(tagsOf(id)).isEmpty();
        social.parseAndSaveHashtags(id, null);
        assertThat(tagsOf(id)).isEmpty();
    }

    @Test
    void sameTagOnTwoPostsSharesOneHashtagRow() {
        int a = post("tag post a", "x", true, "profile");
        int b = post("tag post b", "x", true, "profile");
        social.parseAndSaveHashtags(a, body("#wp3tagshared"));
        social.parseAndSaveHashtags(b, body("#wp3tagshared"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM hashtags WHERE tag = 'wp3tagshared'", Integer.class)).isEqualTo(1);
        List<Map<String, Object>> byTag = social.getPostsByHashtag("wp3tagshared");
        assertThat(byTag).hasSize(2);
    }

    @Test
    void hashColoursInStylesAreNotTags() {
        int id = post("style title", "x", true, "profile");
        social.parseAndSaveHashtags(id, "{\"root\":{\"children\":[{\"type\":\"text\",\"text\":\"plain\",\"style\":\"color: #1a73e8\"}]}}");
        assertThat(tagsOf(id)).isEmpty();
    }
}
