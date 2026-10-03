package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.model.Post;
import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import com.springbootprojects.webpostingserver.posts.service.PostPreview;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Profile pages are cut in SQL (LIMIT/OFFSET), in the same order the whole
 * list had, with drafts dropped for visitors but still counted in the order.
 * What comes back is cards (V020): the grid the card shows, and no body.
 */
@SpringBootTest
class ProfilePagingTest {

    private static final String AUTHOR = "paging_test_author";

    @Autowired JdbcTemplate jdbc;
    @Autowired PostRepository posts;
    /** The mapper the controllers answer with. */
    @Autowired com.fasterxml.jackson.databind.ObjectMapper mapper;

    private int authorId;
    /** Oldest first; p[2] is a draft. */
    private final List<Integer> p = new ArrayList<>();

    @BeforeEach
    void setUp() {
        cleanUp();
        authorId = jdbc.queryForObject("INSERT INTO users (username, password) VALUES (?, 'x') RETURNING id", Integer.class, AUTHOR);
        for (int i = 0; i < 6; i++) {
            int id = jdbc.queryForObject("INSERT INTO posts (title, description, published, date) VALUES (?, 'body', ?, now() + (? * interval '1 minute')) RETURNING id",
                    Integer.class, "post " + i, i != 2, i);
            jdbc.update("INSERT INTO users_posts_junctions (user_id, post_id) VALUES (?, ?)", authorId, id);
            p.add(id);
        }
    }

    @AfterEach
    void cleanUp() {
        for (Integer id : jdbc.queryForList("SELECT j.post_id FROM users_posts_junctions j JOIN users u ON u.id = j.user_id WHERE u.username = ?", Integer.class, AUTHOR)) {
            jdbc.update("DELETE FROM users_posts_junctions WHERE post_id = ?", id);
            jdbc.update("DELETE FROM posts WHERE id = ?", id);
        }
        jdbc.update("DELETE FROM users WHERE username = ?", AUTHOR);
        p.clear();
    }

    private List<Integer> ids(boolean drafts, int limit, int offset) {
        return posts.getPostsPage(AUTHOR, drafts, limit, offset).stream().map(Post::getId).map(Integer::valueOf).toList();
    }

    @Test
    void ownerPagesFollowTheFullOrderWithoutRepeatsOrGaps() {
        List<Integer> all = ids(true, 100, 0);
        assertThat(all).containsExactly(p.get(5), p.get(4), p.get(3), p.get(2), p.get(1), p.get(0));
        assertThat(ids(true, 2, 0)).containsExactly(p.get(5), p.get(4));
        assertThat(ids(true, 2, 2)).containsExactly(p.get(3), p.get(2));
        assertThat(ids(true, 2, 4)).containsExactly(p.get(1), p.get(0));
        assertThat(ids(true, 2, 6)).isEmpty();
    }

    @Test
    void visitorsPagesSkipDraftsInSqlSoAPageIsStillFull() {
        assertThat(ids(false, 3, 0)).containsExactly(p.get(5), p.get(4), p.get(3));
        assertThat(ids(false, 3, 3)).containsExactly(p.get(1), p.get(0));
    }

    @Test
    void theWholeListStillMatchesThePagedOrder() {
        assertThat(posts.getPostsFromUsername(AUTHOR)).extracting(Post::getId).containsExactlyElementsOf(ids(true, 100, 0));
    }

    // ── Cards: the preview instead of the body (V020) ─────────────────────────

    private static final String GRID = "{\"cols\":16,\"rows\":8,\"layers\":[{\"kind\":\"pixel\",\"visible\":true,\"text\":[\"HELLO\"]}]}";
    private static final String OTHER_GRID = "{\"cols\":4,\"rows\":4,\"layers\":[]}";

    private static String body(String grid, String words) {
        return "{\"root\":{\"type\":\"root\",\"children\":["
                + "{\"type\":\"paragraph\",\"children\":[{\"type\":\"text\",\"text\":\"" + words + "\"}]},"
                + "{\"type\":\"tilegrid\",\"version\":1,\"grid\":" + grid + "}]}}";
    }

    private int savePost(String title, String description) {
        Post post = new Post();
        post.setTitle(title);
        post.setDescription(description);
        post.setBackgroundPattern("{\"wallpaper\":true}");
        post.setPublished(true);
        return posts.save(post, authorId);
    }

    private Post card(int id) {
        return posts.getPostsPage(AUTHOR, true, 100, 0).stream().filter(c -> c.getId() == id).findFirst().orElseThrow();
    }

    private static com.fasterxml.jackson.databind.JsonNode json(String s) throws Exception {
        return new com.fasterxml.jackson.databind.ObjectMapper().readTree(s);
    }

    @Test
    void aListItemCarriesTheGridAndNotTheBody() throws Exception {
        int id = savePost("gridded", body(GRID, "some words"));

        Post card = card(id);
        assertThat(json(card.getPreview())).isEqualTo(json(GRID));
        assertThat(card.getDescription()).isNull();
        assertThat(card.getBackgroundPattern()).isNull();
        assertThat(card.getTitle()).isEqualTo("gridded");
        assertThat(card.isCardGrid()).isTrue();

        // The editor and the post page still get everything.
        Post whole = posts.findById((long) id);
        assertThat(whole.getDescription()).isEqualTo(body(GRID, "some words"));
        assertThat(whole.getBackgroundPattern()).isEqualTo("{\"wallpaper\":true}");

        // On the wire: a card has the grid as an object and a null body; a whole post has its body
        // and no "preview" key at all, so the client goes on finding its grid in the body.
        var cardJson = mapper.readTree(mapper.writeValueAsString(card));
        assertThat(cardJson.get("preview")).isEqualTo(json(GRID));
        assertThat(cardJson.get("description").isNull()).isTrue();
        var wholeJson = mapper.readTree(mapper.writeValueAsString(whole));
        assertThat(wholeJson.has("preview")).isFalse();
        assertThat(wholeJson.get("description").asText()).isEqualTo(body(GRID, "some words"));

        assertThat(jdbc.queryForObject("SELECT search_text FROM posts WHERE id = ?", String.class, id)).isEqualTo("some words\nHELLO");
        assertThat(jdbc.queryForObject("SELECT preview_version FROM posts WHERE id = ?", Integer.class, id)).isEqualTo(PostPreview.VERSION);
    }

    @Test
    void savingAgainReplacesThePreviewAndTheSearchText() throws Exception {
        int id = savePost("gridded", body(GRID, "first words"));

        Post edited = posts.findById((long) id);
        edited.setDescription(body(OTHER_GRID, "second words"));
        posts.update(edited);
        assertThat(json(card(id).getPreview())).isEqualTo(json(OTHER_GRID));
        assertThat(jdbc.queryForObject("SELECT search_text FROM posts WHERE id = ?", String.class, id)).isEqualTo("second words");

        edited.setDescription("{\"root\":{\"type\":\"root\",\"children\":[]}}");
        posts.update(edited);
        assertThat(card(id).getPreview()).isNull();
        assertThat(jdbc.queryForObject("SELECT search_text FROM posts WHERE id = ?", String.class, id)).isEmpty();
    }

    @Test
    void aGridOverTheSizeCapLeavesTheCardWithoutOne() {
        String huge = "{\"cols\":64,\"rows\":48,\"layers\":[{\"kind\":\"pixel\",\"paint\":\"" + "a".repeat(PostPreview.PREVIEW_MAX_CHARS) + "\"}]}";
        int id = savePost("huge", body(huge, "words"));

        Post card = card(id);
        assertThat(card.getPreview()).isNull();
        assertThat(card.isCardGrid()).isTrue();
        assertThat(jdbc.queryForObject("SELECT card_preview IS NULL AND preview_version = ? FROM posts WHERE id = ?",
                Boolean.class, PostPreview.VERSION, id)).isTrue();
    }

    @Test
    void aRowNotYetComputedStillShowsItsGrid() throws Exception {
        // What a post saved before V020 looks like until the sweep reaches it.
        int id = savePost("old", body(GRID, "words"));
        jdbc.update("UPDATE posts SET card_preview = NULL, search_text = NULL, preview_version = 0 WHERE id = ?", id);

        Post card = card(id);
        assertThat(json(card.getPreview())).isEqualTo(json(GRID));
        assertThat(card.getDescription()).isNull();

        // With "Grid on card" off the body is not even read.
        jdbc.update("UPDATE posts SET card_grid = false, preview_version = 0 WHERE id = ?", id);
        assertThat(card(id).getPreview()).isNull();
    }

    @Test
    void aSaveNeverFailsOverWhatThePreviewHolds() {
        // A NUL escape and half a surrogate pair are legal JSON; the text column would refuse a raw NUL.
        int id = savePost("odd", body(GRID, "be\\u0000fore \\ud83d"));
        assertThat(jdbc.queryForObject("SELECT search_text FROM posts WHERE id = ?", String.class, id)).startsWith("before");

        int plain = savePost("plain", "not the editor's JSON at all");
        assertThat(card(plain).getPreview()).isNull();
        assertThat(jdbc.queryForObject("SELECT search_text FROM posts WHERE id = ?", String.class, plain)).isEqualTo("not the editor's JSON at all");
    }
}
