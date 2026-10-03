package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.model.Post;
import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/** A post's description (V016) is stored with it and comes back from read and list. */
@SpringBootTest
class PostSummaryTest {

    private static final String AUTHOR = "summary_author";

    @Autowired JdbcTemplate jdbc;
    @Autowired PostRepository posts;

    private int authorId;

    @BeforeEach
    void setUp() {
        cleanUp();
        authorId = jdbc.queryForObject("INSERT INTO users (username, password) VALUES (?, ?) RETURNING id",
                Integer.class, AUTHOR, "x");
    }

    @AfterEach
    void cleanUp() {
        for (Integer id : jdbc.queryForList("""
                SELECT j.post_id FROM users_posts_junctions j JOIN users u ON u.id = j.user_id
                 WHERE u.username = ?""", Integer.class, AUTHOR)) {
            jdbc.update("DELETE FROM users_posts_junctions WHERE post_id = ?", id);
            jdbc.update("DELETE FROM posts WHERE id = ?", id);
        }
        jdbc.update("DELETE FROM users WHERE username = ?", AUTHOR);
    }

    @Test
    void theSummaryIsSavedUpdatedClearedAndListed() {
        Post post = new Post();
        post.setTitle("With a summary");
        post.setDescription("{}");
        post.setPublished(true);
        post.setSummary("A line about it");
        int id = posts.save(post, authorId);

        assertThat(posts.findById((long) id).getSummary()).isEqualTo("A line about it");
        assertThat(posts.getPostsFromUsername(AUTHOR)).singleElement().extracting(Post::getSummary).isEqualTo("A line about it");

        Post stored = posts.findById((long) id);
        stored.setSummary("Changed");
        posts.update(stored);
        assertThat(posts.findById((long) id).getSummary()).isEqualTo("Changed");

        stored.setSummary(null);
        posts.update(stored);
        assertThat(posts.findById((long) id).getSummary()).isNull();
    }
}
