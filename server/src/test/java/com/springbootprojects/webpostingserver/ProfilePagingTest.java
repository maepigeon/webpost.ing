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
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Profile pages are cut in SQL (LIMIT/OFFSET), in the same order the whole
 * list had, with drafts dropped for visitors but still counted in the order.
 */
@SpringBootTest
class ProfilePagingTest {

    private static final String AUTHOR = "paging_test_author";

    @Autowired JdbcTemplate jdbc;
    @Autowired PostRepository posts;

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
}
