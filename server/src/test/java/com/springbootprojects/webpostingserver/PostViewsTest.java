package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Recording post views against the real schema. Every signed-in view used to
 * fail: the primary key was deferrable, which ON CONFLICT cannot use (V008).
 * Mock-based tests could not have caught it.
 */
@SpringBootTest
class PostViewsTest {

    @Autowired JdbcTemplate jdbc;
    @Autowired SocialRepository social;

    private int userId;
    private int postId;

    @BeforeEach
    void setUp() {
        cleanUp();
        userId = jdbc.queryForObject("INSERT INTO users (username, password) VALUES ('views_test_user', 'x') RETURNING id", Integer.class);
        postId = jdbc.queryForObject("INSERT INTO posts (title, description, published) VALUES ('viewed', '', TRUE) RETURNING id", Integer.class);
        jdbc.update("INSERT INTO users_posts_junctions (post_id, user_id) VALUES (?, ?)", postId, userId);
    }

    @AfterEach
    void cleanUp() {
        Integer id = jdbc.query("SELECT id FROM users WHERE username = 'views_test_user'", rs -> rs.next() ? rs.getInt(1) : null);
        if (id == null) return;
        for (Integer p : jdbc.queryForList("SELECT post_id FROM users_posts_junctions WHERE user_id = ?", Integer.class, id)) {
            jdbc.update("DELETE FROM post_view_totals WHERE post_id = ?", p);
            jdbc.update("DELETE FROM post_views WHERE post_id = ?", p);
            jdbc.update("DELETE FROM users_posts_junctions WHERE post_id = ?", p);
            jdbc.update("DELETE FROM posts WHERE id = ?", p);
        }
        jdbc.update("DELETE FROM users WHERE id = ?", id);
    }

    @Test
    void aSignedInViewIsRecordedOnceButCountedEachTime() {
        social.recordPostView(postId, userId);
        social.recordPostView(postId, userId);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM post_views WHERE post_id = ?", Integer.class, postId)).isEqualTo(1);
        assertThat(jdbc.queryForMap("SELECT total_views, unique_views FROM post_view_totals WHERE post_id = ?", postId))
                .containsEntry("total_views", 2L).containsEntry("unique_views", 1L);
    }

    @Test
    void deletingAViewerDeletesTheirViews() {
        social.recordPostView(postId, userId);
        int other = jdbc.queryForObject("INSERT INTO users (username, password) VALUES ('views_test_other', 'x') RETURNING id", Integer.class);
        social.recordPostView(postId, other);

        jdbc.update("DELETE FROM users WHERE id = ?", other);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM post_views WHERE post_id = ?", Integer.class, postId)).isEqualTo(1);
    }
}
