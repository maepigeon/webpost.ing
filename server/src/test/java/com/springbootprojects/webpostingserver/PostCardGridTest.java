package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.DiscussionController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.model.Post;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A post's profile card shows its first grid unless the author turns that
 * off (V010); the setting travels with the post to the profile list.
 */
@SpringBootTest
class PostCardGridTest {

    private static final String AUTHOR = "card_grid_author";
    private static final String OTHER = "card_grid_other";

    @Autowired JdbcTemplate jdbc;
    @Autowired PostRepository posts;
    @Autowired LoginRepository logins;
    @Autowired DiscussionController discussion;

    private int authorId;

    @BeforeEach
    void setUp() {
        cleanUp();
        String hash = new BCryptPasswordEncoder().encode("pw");
        authorId = jdbc.queryForObject("INSERT INTO users (username, password) VALUES (?, ?) RETURNING id",
                Integer.class, AUTHOR, hash);
        jdbc.update("INSERT INTO users (username, password) VALUES (?, ?)", OTHER, hash);
    }

    @AfterEach
    void cleanUp() {
        for (Integer id : jdbc.queryForList("""
                SELECT j.post_id FROM users_posts_junctions j JOIN users u ON u.id = j.user_id
                 WHERE u.username IN (?, ?)""", Integer.class, AUTHOR, OTHER)) {
            jdbc.update("DELETE FROM users_posts_junctions WHERE post_id = ?", id);
            jdbc.update("DELETE FROM posts WHERE id = ?", id);
        }
        jdbc.update("DELETE FROM users WHERE username IN (?, ?)", AUTHOR, OTHER);
    }

    @Test
    void aNewPostsCardShowsItsGrid() {
        int id = newPost();

        assertThat(discussion.getFeatures(id).getBody()).containsEntry("cardGrid", true);
        assertThat(posts.getPostsFromUsername(AUTHOR)).singleElement().extracting(Post::isCardGrid).isEqualTo(true);
    }

    @Test
    void onlyTheAuthorCanTurnItOff() {
        int id = newPost();
        Map<String, Boolean> off = Map.of("enabled", false);

        assertThat(discussion.setCardGrid(id, off, OTHER, signIn(OTHER)).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(discussion.setCardGrid(id, off, AUTHOR, "forged").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(discussion.getFeatures(id).getBody()).containsEntry("cardGrid", true);

        assertThat(discussion.setCardGrid(id, off, AUTHOR, signIn(AUTHOR)).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(discussion.getFeatures(id).getBody()).containsEntry("cardGrid", false);
        assertThat(posts.getPostsFromUsername(AUTHOR)).singleElement().extracting(Post::isCardGrid).isEqualTo(false);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private int newPost() {
        Post p = new Post();
        p.setTitle("gridded");
        p.setDescription("");
        p.setPublished(true);
        return posts.save(p, authorId);
    }

    private String signIn(String username) {
        LoginInfo info = new LoginInfo();
        info.setUsername(username);
        info.setPassword("pw");
        AuthSession session = logins.login(info);
        return session.token;
    }
}
