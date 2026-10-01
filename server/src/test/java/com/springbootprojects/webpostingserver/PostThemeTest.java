package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.PageThemeController;
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

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Each post keeps its own theme (V009): a copy of the author's at creation,
 * unchanged when the profile theme changes, private along with a draft.
 */
@SpringBootTest
class PostThemeTest {

    private static final String AUTHOR = "post_theme_author";
    private static final String OTHER = "post_theme_other";

    @Autowired JdbcTemplate jdbc;
    @Autowired PostRepository posts;
    @Autowired LoginRepository logins;
    @Autowired PageThemeController themes;

    private int authorId;

    @BeforeEach
    void setUp() {
        cleanUp();
        String hash = new BCryptPasswordEncoder().encode("pw");
        authorId = jdbc.queryForObject("INSERT INTO users (username, password, page_theme) VALUES (?, ?, ?) RETURNING id",
                Integer.class, AUTHOR, hash, theme("#111111"));
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
    void aNewPostStartsWithTheAuthorsThemeAndKeepsItWhenTheProfileChanges() {
        int id = newPost(true);
        assertThat(postTheme(id)).contains("#111111");

        jdbc.update("UPDATE users SET page_theme = ? WHERE id = ?", theme("#999999"), authorId);

        assertThat(postTheme(id)).contains("#111111").doesNotContain("#999999");
    }

    @Test
    void aDraftsThemeIsTheAuthorsAlone() {
        int draft = newPost(false);

        assertThat(themes.getPostTheme(draft, null, null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(themes.getPostTheme(draft, AUTHOR, "forged").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(themes.getPostTheme(draft, AUTHOR, signIn(AUTHOR)).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(themes.getPostTheme(newPost(true), null, null).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void onlyTheAuthorCanChangeAPostsTheme() {
        int id = newPost(true);
        Map<String, Object> body = new HashMap<>();
        body.put("theme", null);

        assertThat(themes.setPostTheme(id, body, null, null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(themes.setPostTheme(id, body, OTHER, signIn(OTHER)).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(postTheme(id)).isNotNull();

        assertThat(themes.setPostTheme(id, body, AUTHOR, signIn(AUTHOR)).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(postTheme(id)).isNull();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** A minimal stored theme whose card colour marks it. */
    private static String theme(String cardColour) {
        return "{\"v\":2,\"preset\":\"custom\",\"card\":{\"bg\":\"" + cardColour + "\"}}";
    }

    private int newPost(boolean published) {
        Post p = new Post();
        p.setTitle("themed");
        p.setDescription("");
        p.setPublished(published);
        return posts.save(p, authorId);
    }

    private String postTheme(int id) {
        return jdbc.queryForObject("SELECT page_theme FROM posts WHERE id = ?", String.class, id);
    }

    private String signIn(String username) {
        LoginInfo info = new LoginInfo();
        info.setUsername(username);
        info.setPassword("pw");
        AuthSession session = logins.login(info);
        return session.token;
    }
}
