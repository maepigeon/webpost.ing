package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.FeedController;
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

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** The reading list: published posts of the people you follow, and nobody else's. */
@SpringBootTest
class FeedControllerTest {

    private static final String READER = "feed_reader";
    private static final String FOLLOWED = "feed_followed";
    private static final String STRANGER = "feed_stranger";

    @Autowired JdbcTemplate jdbc;
    @Autowired PostRepository posts;
    @Autowired LoginRepository logins;
    @Autowired FeedController feed;

    private int readerId, followedId, strangerId;

    @BeforeEach
    void setUp() {
        cleanUp();
        String hash = new BCryptPasswordEncoder().encode("pw");
        readerId = newUser(READER, hash);
        followedId = newUser(FOLLOWED, hash);
        strangerId = newUser(STRANGER, hash);
        jdbc.update("INSERT INTO follows (follower_id, followed_id) VALUES (?, ?)", readerId, followedId);
    }

    @AfterEach
    void cleanUp() {
        for (Integer id : jdbc.queryForList("""
                SELECT j.post_id FROM users_posts_junctions j JOIN users u ON u.id = j.user_id
                 WHERE u.username IN (?, ?, ?)""", Integer.class, READER, FOLLOWED, STRANGER)) {
            jdbc.update("DELETE FROM users_posts_junctions WHERE post_id = ?", id);
            jdbc.update("DELETE FROM posts WHERE id = ?", id);
        }
        jdbc.update("DELETE FROM follows WHERE follower_id IN (SELECT id FROM users WHERE username IN (?, ?, ?))", READER, FOLLOWED, STRANGER);
        jdbc.update("DELETE FROM users WHERE username IN (?, ?, ?)", READER, FOLLOWED, STRANGER);
    }

    @Test
    void showsOnlyPublishedPostsOfFollowedPeopleNewestFirst() {
        newPost(followedId, "older", true);
        newPost(followedId, "a draft", false);
        newPost(strangerId, "not followed", true);
        newPost(readerId, "my own", true);
        newPost(followedId, "newer", true);

        var response = feed.following(20, 0, READER, signIn(READER));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        List<?> page = (List<?>) body.get("posts");
        List<Object> titles = page.stream().map(p -> (Object) ((Map<?, ?>) p).get("title")).toList();
        assertThat(titles).containsExactly("newer", "older");
        assertThat(((Map<?, ?>) page.get(0)).get("username")).isEqualTo(FOLLOWED);
        assertThat(body.get("hasMore")).isEqualTo(false);
    }

    @Test
    void pagesAndTellsWhetherThereIsMore() {
        for (int i = 0; i < 3; i++) newPost(followedId, "post " + i, true);
        Map<?, ?> first = (Map<?, ?>) feed.following(2, 0, READER, signIn(READER)).getBody();
        assertThat((List<?>) first.get("posts")).hasSize(2);
        assertThat(first.get("hasMore")).isEqualTo(true);
        Map<?, ?> second = (Map<?, ?>) feed.following(2, 2, READER, signIn(READER)).getBody();
        assertThat((List<?>) second.get("posts")).hasSize(1);
        assertThat(second.get("hasMore")).isEqualTo(false);
    }

    @Test
    void needsASignedInReader() {
        assertThat(feed.following(20, 0, null, null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(feed.following(20, 0, READER, "forged").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    private int newUser(String name, String hash) {
        return jdbc.queryForObject("INSERT INTO users (username, password) VALUES (?, ?) RETURNING id", Integer.class, name, hash);
    }

    private void newPost(int authorId, String title, boolean published) {
        Post p = new Post();
        p.setTitle(title);
        p.setDescription("");
        p.setPublished(published);
        posts.save(p, authorId);
    }

    private String signIn(String username) {
        LoginInfo info = new LoginInfo();
        info.setUsername(username);
        info.setPassword("pw");
        AuthSession session = logins.login(info);
        return session.token;
    }
}
