package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.model.Post;
import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The order posts appear in on a profile, and rearranging it.
 *
 * The profile used to be paged newest first while the page drew posts in the
 * author's arrangement, and a saved arrangement numbered only the posts loaded
 * so far. Together they repeated posts across pages, skipped others, and never
 * showed an arrangement after a reload.
 */
@SpringBootTest
class ProfileOrderTest {

    private static final String AUTHOR = "order_test_author";
    private static final String OTHER = "order_test_other";

    @Autowired JdbcTemplate jdbc;
    @Autowired PostRepository posts;

    private int authorId;
    private int otherId;
    /** The author's posts, oldest first: p[0] is the oldest. */
    private final List<Integer> p = new ArrayList<>();

    @BeforeEach
    void setUp() {
        cleanUp();
        authorId = createUser(AUTHOR);
        otherId = createUser(OTHER);
        for (int i = 0; i < 5; i++) p.add(createPost(authorId, "post " + i, i));
    }

    @AfterEach
    void cleanUp() {
        List<Integer> ids = jdbc.queryForList("""
                SELECT j.post_id FROM users_posts_junctions j
                JOIN users u ON u.id = j.user_id WHERE u.username IN (?, ?)
                """, Integer.class, AUTHOR, OTHER);
        for (Integer id : ids) {
            jdbc.update("DELETE FROM users_posts_junctions WHERE post_id = ?", id);
            jdbc.update("DELETE FROM posts WHERE id = ?", id);
        }
        jdbc.update("DELETE FROM users WHERE username IN (?, ?)", AUTHOR, OTHER);
        p.clear();
    }

    @Test
    void unarrangedProfileIsNewestFirst() {
        assertThat(order()).containsExactly(p.get(4), p.get(3), p.get(2), p.get(1), p.get(0));
    }

    @Test
    void savedArrangementIsWhatTheProfileShows() {
        posts.reorder(authorId, List.of(p.get(0), p.get(2), p.get(4), p.get(1), p.get(3)), noFolders());

        assertThat(order()).containsExactly(p.get(0), p.get(2), p.get(4), p.get(1), p.get(3));
        assertThat(posts.getPostsFromUsername(AUTHOR)).extracting(Post::getSortOrder)
                .containsExactly(0, 1, 2, 3, 4);
    }

    @Test
    void postsLeftOutGoAfterTheListInTheirOldOrder() {
        // The page had loaded only the top two posts when the author moved them.
        posts.reorder(authorId, List.of(p.get(3), p.get(4)), noFolders());

        assertThat(order()).containsExactly(p.get(3), p.get(4), p.get(2), p.get(1), p.get(0));
        // No two posts share a position, so paging cannot repeat or skip one.
        assertThat(posts.getPostsFromUsername(AUTHOR)).extracting(Post::getSortOrder).doesNotHaveDuplicates();
    }

    @Test
    void pagesOfTheProfileNeverRepeatAPost() {
        posts.reorder(authorId, List.of(p.get(1), p.get(3)), noFolders());

        List<Integer> all = order();
        List<Integer> paged = new ArrayList<>();
        for (int offset = 0; offset < all.size(); offset += 2)
            paged.addAll(all.subList(offset, Math.min(offset + 2, all.size())));
        assertThat(paged).doesNotHaveDuplicates().containsExactlyElementsOf(all);
    }

    @Test
    void foldersAreSavedWithTheOrder() {
        Map<Integer, String> folders = noFolders();
        folders.put(p.get(4), "Travel");
        folders.put(p.get(3), "Travel");
        posts.reorder(authorId, List.of(p.get(4), p.get(3), p.get(2)), folders);

        assertThat(folderOf(p.get(4))).isEqualTo("Travel");
        assertThat(folderOf(p.get(3))).isEqualTo("Travel");
        assertThat(folderOf(p.get(2))).isNull();
    }

    @Test
    void anotherAuthorsPostIsIgnored() {
        int theirs = createPost(otherId, "not yours", 10);
        jdbc.update("UPDATE posts SET folder = 'Mine' WHERE id = ?", theirs);

        Map<Integer, String> folders = noFolders();
        folders.put(theirs, "Stolen");
        int moved = posts.reorder(authorId, List.of(theirs, p.get(0)), folders);

        assertThat(moved).isEqualTo(1);
        assertThat(folderOf(theirs)).isEqualTo("Mine");
        assertThat(order().get(0)).isEqualTo(p.get(0));
    }

    @Test
    void aNewPostAppearsAtTheTopOfAnArrangedProfile() {
        posts.reorder(authorId, List.of(p.get(0), p.get(1), p.get(2), p.get(3), p.get(4)), noFolders());
        int fresh = createPost(authorId, "fresh", 20);

        assertThat(order().get(0)).isEqualTo(fresh);
        assertThat(order().subList(1, 6)).containsExactly(p.get(0), p.get(1), p.get(2), p.get(3), p.get(4));
    }

    @Test
    void aFoldersPostsComeTogetherAtItsFirstPostsPlace() {
        // Arranged: p4, p0 (Travel), p3, p1 (Travel), p2.
        Map<Integer, String> folders = noFolders();
        folders.put(p.get(0), "Travel");
        folders.put(p.get(1), "Travel");
        posts.reorder(authorId, List.of(p.get(4), p.get(0), p.get(3), p.get(1), p.get(2)), folders);

        // Travel sits where its first post is, with both its posts together, so
        // a page boundary can never put one of them far from the other.
        assertThat(order()).containsExactly(p.get(4), p.get(0), p.get(1), p.get(3), p.get(2));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private List<Integer> order() {
        return posts.getPostsFromUsername(AUTHOR).stream().map(Post::getId).toList();
    }

    /** Every requested post gets an entry; null means "in no folder". */
    private Map<Integer, String> noFolders() {
        Map<Integer, String> folders = new HashMap<>();
        for (Integer id : p) folders.put(id, null);
        return folders;
    }

    private String folderOf(int postId) {
        return jdbc.queryForObject("SELECT folder FROM posts WHERE id = ?", String.class, postId);
    }

    private int createUser(String username) {
        return jdbc.queryForObject(
                "INSERT INTO users (username, password) VALUES (?, 'x') RETURNING id", Integer.class, username);
    }

    /** A post dated {@code minutes} after a fixed point, so a larger number is newer. */
    private int createPost(int userId, String title, int minutes) {
        int id = jdbc.queryForObject("""
                INSERT INTO posts (title, description, published, date)
                VALUES (?, '', TRUE, TIMESTAMPTZ '2026-01-01' + make_interval(mins => ?))
                RETURNING id
                """, Integer.class, title, minutes);
        jdbc.update("INSERT INTO users_posts_junctions (post_id, user_id) VALUES (?, ?)", id, userId);
        return id;
    }
}
