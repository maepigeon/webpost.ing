package com.springbootprojects.webpostingserver;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.springbootprojects.webpostingserver.posts.controller.ProfileBannerController;
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

/** The profile banner (V011): what it reports, and who may change the owner's rows. */
@SpringBootTest
class ProfileBannerTest {

    private static final String OWNER = "banner_owner";
    private static final String OTHER = "banner_other";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired JdbcTemplate jdbc;
    @Autowired PostRepository posts;
    @Autowired LoginRepository logins;
    @Autowired ProfileBannerController banner;

    private int ownerId;

    @BeforeEach
    void setUp() {
        cleanUp();
        String hash = new BCryptPasswordEncoder().encode("pw");
        ownerId = jdbc.queryForObject("INSERT INTO users (username, password) VALUES (?, ?) RETURNING id", Integer.class, OWNER, hash);
        jdbc.update("INSERT INTO users (username, password) VALUES (?, ?)", OTHER, hash);
    }

    @AfterEach
    void cleanUp() {
        for (Integer id : jdbc.queryForList("""
                SELECT j.post_id FROM users_posts_junctions j JOIN users u ON u.id = j.user_id
                 WHERE u.username IN (?, ?)""", Integer.class, OWNER, OTHER)) {
            jdbc.update("DELETE FROM users_posts_junctions WHERE post_id = ?", id);
            jdbc.update("DELETE FROM posts WHERE id = ?", id);
        }
        jdbc.update("DELETE FROM users WHERE username IN (?, ?)", OWNER, OTHER);
    }

    @Test
    void countsOnlyPublicPostsAndGivesTheJoinDate() {
        newPost(true);
        newPost(true);
        newPost(false);
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) banner.getBanner(OWNER).getBody();
        assertThat(body).containsEntry("publicPosts", 2L).containsEntry("cols", 32).containsEntry("grid", null);
        assertThat((String) body.get("joined")).isNotBlank();
        assertThat(banner.getBanner("nobody_by_this_name").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void onlyTheOwnerSavesRowsWhichAreAlwaysTheBannersWidth() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("grid", JSON.readValue("{\"v\":3,\"cols\":5,\"rows\":40,\"layers\":[{\"id\":\"a1\",\"kind\":\"pixel\",\"text\":[\"hi\"]}]}", Map.class));

        assertThat(banner.setBanner(OWNER, body, null, null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(banner.setBanner(OWNER, body, OTHER, signIn(OTHER)).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(stored()).isNull();

        assertThat(banner.setBanner(OWNER, body, OWNER, signIn(OWNER)).getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode grid = JSON.readTree(stored());
        assertThat(grid.path("cols").asInt()).isEqualTo(32);
        assertThat(grid.path("rows").asInt()).isEqualTo(ProfileBannerController.MAX_ROWS);
        assertThat(grid.path("layers").get(0).path("text").get(0).asText()).isEqualTo("hi");

        Map<String, Object> remove = new HashMap<>();
        remove.put("grid", null);
        assertThat(banner.setBanner(OWNER, remove, OWNER, signIn(OWNER)).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(stored()).isNull();
    }

    @Test
    void refusesAGridWithoutLayers() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("grid", JSON.readValue("{\"v\":3,\"rows\":2,\"layers\":[]}", Map.class));
        assertThat(banner.setBanner(OWNER, body, OWNER, signIn(OWNER)).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    private String stored() {
        return jdbc.queryForObject("SELECT banner_grid FROM users WHERE id = ?", String.class, ownerId);
    }

    private void newPost(boolean published) {
        Post p = new Post();
        p.setTitle("p");
        p.setDescription("");
        p.setPublished(published);
        posts.save(p, ownerId);
    }

    private String signIn(String username) {
        LoginInfo info = new LoginInfo();
        info.setUsername(username);
        info.setPassword("pw");
        AuthSession session = logins.login(info);
        return session.token;
    }
}
