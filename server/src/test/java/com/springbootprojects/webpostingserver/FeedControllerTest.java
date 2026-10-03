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

    // ── Discover ──────────────────────────────────────────────────────────────

    private List<Object> discoverTitles(String before, int size, String viewer) {
        var r = feed.discover(before, size, viewer, viewer == null ? null : signIn(viewer));
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.OK);
        return ((List<?>) ((Map<?, ?>) r.getBody()).get("posts")).stream()
            .map(p -> (Object) ((Map<?, ?>) p).get("title")).toList();
    }

    @Test
    void discoverShowsOnlyPublicProfilePostsAndNotMine() {
        newPost(followedId, "public one", true);
        newPost(strangerId, "public two", true);
        newPost(followedId, "a draft", false);
        newPost(readerId, "my own", true);
        int notes = newPost(followedId, "a note", true);
        jdbc.update("UPDATE posts SET section='notes' WHERE id=?", notes);
        int subs = newPost(followedId, "for subscribers", true);
        jdbc.update("UPDATE posts SET section='subscribers' WHERE id=?", subs);
        List<Object> titles = discoverTitles(null, 20, READER);
        assertThat(titles).containsExactlyInAnyOrder("public one", "public two");
    }

    @Test
    void discoverLeavesOutFrozenAuthors() {
        newPost(strangerId, "from a frozen one", true);
        jdbc.update("UPDATE users SET role='frozen' WHERE id=?", strangerId);
        assertThat(discoverTitles(null, 20, READER)).doesNotContain("from a frozen one");
    }

    @Test
    void discoverPagesByDateWithoutRepeats() {
        int a = newPost(followedId, "p1", true);
        int b = newPost(followedId, "p2", true);
        int c = newPost(followedId, "p3", true);
        jdbc.update("UPDATE posts SET date = now() - interval '3 hours' WHERE id=?", a);
        jdbc.update("UPDATE posts SET date = now() - interval '2 hours' WHERE id=?", b);
        jdbc.update("UPDATE posts SET date = now() - interval '1 hours' WHERE id=?", c);
        var first = (Map<?, ?>) feed.discover(null, 2, READER, signIn(READER)).getBody();
        List<?> page = (List<?>) first.get("posts");
        assertThat(page.stream().map(p -> (Object) ((Map<?, ?>) p).get("title")).toList()).containsExactly("p3", "p2");
        assertThat(first.get("hasMore")).isEqualTo(true);
        long last = (Long) ((Map<?, ?>) page.get(1)).get("date");
        String before = java.time.Instant.ofEpochMilli(last).toString();
        assertThat(discoverTitles(before, 2, READER)).containsExactly("p1");
    }

    @Test
    void discoverClampsPageSizeAndWorksSignedOut() {
        newPost(followedId, "visible to all", true);
        assertThat(discoverTitles(null, 500, null)).contains("visible to all");
        assertThat(feed.discover("garbage", 20, null, null).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void peopleListsMembersWithPublicPostsOnly() {
        newPost(followedId, "x", true);
        newPost(readerId, "mine", true);
        var r = feed.people(READER, signIn(READER));
        List<String> names = ((List<?>) r.getBody()).stream().map(m -> (String) ((Map<?, ?>) m).get("username")).toList();
        assertThat(names).contains(FOLLOWED).doesNotContain(READER, STRANGER);
    }

    private int newUser(String name, String hash) {
        return jdbc.queryForObject("INSERT INTO users (username, password) VALUES (?, ?) RETURNING id", Integer.class, name, hash);
    }

    private int newPost(int authorId, String title, boolean published) {
        Post p = new Post();
        p.setTitle(title);
        p.setDescription("");
        p.setPublished(published);
        posts.save(p, authorId);
        return jdbc.queryForObject("SELECT p.id FROM posts p JOIN users_posts_junctions j ON j.post_id=p.id WHERE j.user_id=? AND p.title=? ORDER BY p.id DESC LIMIT 1", Integer.class, authorId, title);
    }

    private String signIn(String username) {
        LoginInfo info = new LoginInfo();
        info.setUsername(username);
        info.setPassword("pw");
        AuthSession session = logins.login(info);
        return session.token;
    }
}
