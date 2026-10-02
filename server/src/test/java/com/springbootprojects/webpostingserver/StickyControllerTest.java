package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.StickyController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Stickers placed on a profile: public to see, the owner's own stickers only, owner-only to change. */
@SpringBootTest
class StickyControllerTest {

    private static final String OWNER = "sticky_owner";
    private static final String OTHER = "sticky_other";

    @Autowired JdbcTemplate jdbc;
    @Autowired LoginRepository logins;
    @Autowired StickyController stickies;

    private int ownerSticker, otherSticker;

    @BeforeEach
    void setUp() {
        cleanUp();
        String hash = new BCryptPasswordEncoder().encode("pw");
        int owner = jdbc.queryForObject("INSERT INTO users (username, password) VALUES (?, ?) RETURNING id", Integer.class, OWNER, hash);
        int other = jdbc.queryForObject("INSERT INTO users (username, password) VALUES (?, ?) RETURNING id", Integer.class, OTHER, hash);
        ownerSticker = jdbc.queryForObject("INSERT INTO stickers (user_id, name, grid) VALUES (?, 'mine', '{\"v\":3}') RETURNING id", Integer.class, owner);
        otherSticker = jdbc.queryForObject("INSERT INTO stickers (user_id, name, grid) VALUES (?, 'theirs', '{\"v\":3}') RETURNING id", Integer.class, other);
    }

    @AfterEach
    void cleanUp() {
        jdbc.update("DELETE FROM stickies WHERE user_id IN (SELECT id FROM users WHERE username IN (?, ?))", OWNER, OTHER);
        jdbc.update("DELETE FROM stickers WHERE user_id IN (SELECT id FROM users WHERE username IN (?, ?))", OWNER, OTHER);
        jdbc.update("DELETE FROM users WHERE username IN (?, ?)", OWNER, OTHER);
    }

    private Map<String, Object> at(Object stickerId, double x, double y) {
        Map<String, Object> b = new HashMap<>();
        b.put("stickerId", stickerId);
        b.put("x", x);
        b.put("y", y);
        b.put("size", 3);
        return b;
    }

    @Test
    void theOwnerPlacesMovesAndRemovesTheirOwnStickers() {
        String tok = signIn(OWNER);
        var placed = stickies.place(OWNER, at(ownerSticker, 0.25, 120), OWNER, tok);
        assertThat(placed.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        int id = ((Number) ((Map<?, ?>) placed.getBody()).get("id")).intValue();

        List<?> list = (List<?>) stickies.list(OWNER).getBody();
        assertThat(list).hasSize(1);
        assertThat(((Map<?, ?>) list.get(0)).get("name")).isEqualTo("mine");

        Map<String, Object> move = new HashMap<>();
        move.put("x", 7.0);         // clamped to 1
        move.put("y", 300);
        assertThat(stickies.move(OWNER, id, move, OWNER, tok).getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<String, Object> row = jdbc.queryForMap("SELECT x, y, size FROM stickies WHERE id = ?", id);
        assertThat(((Number) row.get("x")).doubleValue()).isEqualTo(1.0);
        assertThat(((Number) row.get("y")).doubleValue()).isEqualTo(300.0);
        assertThat(((Number) row.get("size")).intValue()).isEqualTo(3);

        assertThat(stickies.remove(OWNER, id, OWNER, tok).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat((List<?>) stickies.list(OWNER).getBody()).isEmpty();
    }

    @Test
    void nobodyElsePlacesStickersAndOnlyYourOwnStickersCanBePlaced() {
        assertThat(stickies.place(OWNER, at(ownerSticker, 0.5, 10), OTHER, signIn(OTHER)).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(stickies.place(OWNER, at(ownerSticker, 0.5, 10), OWNER, "forged").getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(stickies.place(OWNER, at(otherSticker, 0.5, 10), OWNER, signIn(OWNER)).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void aStickerSticksToTheOwnersPostAndHidesWhileThePostIsADraft() {
        String tok = signIn(OWNER);
        int owner = jdbc.queryForObject("SELECT id FROM users WHERE username = ?", Integer.class, OWNER);
        int other = jdbc.queryForObject("SELECT id FROM users WHERE username = ?", Integer.class, OTHER);
        int post = jdbc.queryForObject("INSERT INTO posts (title, description, published) VALUES ('p', '', true) RETURNING id", Integer.class);
        jdbc.update("INSERT INTO users_posts_junctions (user_id, post_id) VALUES (?, ?)", owner, post);
        int theirs = jdbc.queryForObject("INSERT INTO posts (title, description, published) VALUES ('q', '', true) RETURNING id", Integer.class);
        jdbc.update("INSERT INTO users_posts_junctions (user_id, post_id) VALUES (?, ?)", other, theirs);
        try {
            Map<String, Object> onPost = at(ownerSticker, 0.5, 30);
            onPost.put("postId", post);
            assertThat(stickies.place(OWNER, onPost, OWNER, tok).getStatusCode()).isEqualTo(HttpStatus.CREATED);
            assertThat(((Map<?, ?>) ((List<?>) stickies.list(OWNER).getBody()).get(0)).get("postId")).isEqualTo(post);

            Map<String, Object> onTheirs = at(ownerSticker, 0.5, 30);
            onTheirs.put("postId", theirs);
            assertThat(stickies.place(OWNER, onTheirs, OWNER, tok).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

            jdbc.update("UPDATE posts SET published = false WHERE id = ?", post);
            assertThat((List<?>) stickies.list(OWNER).getBody()).isEmpty();
        } finally {
            jdbc.update("DELETE FROM stickies WHERE post_id IN (?, ?)", post, theirs);
            jdbc.update("DELETE FROM users_posts_junctions WHERE post_id IN (?, ?)", post, theirs);
            jdbc.update("DELETE FROM posts WHERE id IN (?, ?)", post, theirs);
        }
    }

    private String signIn(String username) {
        LoginInfo info = new LoginInfo();
        info.setUsername(username);
        info.setPassword("pw");
        AuthSession session = logins.login(info);
        return session.token;
    }
}
