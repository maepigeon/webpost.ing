package com.springbootprojects.webpostingserver;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * The profile summary: one request in place of the profile's dozen. It answers
 * by the rule of each call it replaces, and carries no post body.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ProfileSummaryTest {

    private static final String OWNER = "psum_owner";
    private static final String FAN = "psum_fan";       // the owner follows this account
    private static final String STRANGER = "psum_stranger";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String GRID = "{\"cols\":16,\"rows\":8,\"layers\":[]}";

    @Autowired JdbcTemplate jdbc;
    @Autowired LoginRepository logins;
    @Autowired PostRepository posts;
    @Autowired MockMvc mvc;

    private int ownerId, fanId, strangerId;
    private String ownerToken, fanToken, strangerToken;

    @BeforeEach
    void setUp() {
        cleanUp();
        String hash = new BCryptPasswordEncoder().encode("pw");
        ownerId = newUser(OWNER, hash);
        fanId = newUser(FAN, hash);
        strangerId = newUser(STRANGER, hash);
        ownerToken = signIn(OWNER);
        fanToken = signIn(FAN);
        strangerToken = signIn(STRANGER);
    }

    @AfterEach
    void cleanUp() {
        for (Integer id : jdbc.queryForList("""
                SELECT j.post_id FROM users_posts_junctions j JOIN users u ON u.id = j.user_id
                 WHERE u.username IN (?, ?, ?)""", Integer.class, OWNER, FAN, STRANGER)) {
            jdbc.update("UPDATE users SET pinned_post_id = NULL WHERE pinned_post_id = ?", id);
            jdbc.update("DELETE FROM users_posts_junctions WHERE post_id = ?", id);
            jdbc.update("DELETE FROM posts WHERE id = ?", id);
        }
        jdbc.update("DELETE FROM follows WHERE follower_id IN (SELECT id FROM users WHERE username IN (?, ?, ?))"
                + " OR followed_id IN (SELECT id FROM users WHERE username IN (?, ?, ?))",
                OWNER, FAN, STRANGER, OWNER, FAN, STRANGER);
        jdbc.update("DELETE FROM dm_blocks WHERE blocker_id IN (SELECT id FROM users WHERE username IN (?, ?, ?))"
                + " OR blocked_id IN (SELECT id FROM users WHERE username IN (?, ?, ?))",
                OWNER, FAN, STRANGER, OWNER, FAN, STRANGER);
        jdbc.update("DELETE FROM users WHERE username IN (?, ?, ?)", OWNER, FAN, STRANGER);
    }

    // ── who may ask, and what comes back ──────────────────────────────────────

    @Test
    void anUnknownUsernameIsA404() throws Exception {
        assertThat(call("psum_nobody_here", null, null).getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void itCarriesWhatTheProfileDrawsAndNoCookiesAreNeeded() throws Exception {
        jdbc.update("UPDATE users SET bio = 'hello there', bio_links = ?, avatar_path = '/uploads/avatar/a.png', header_ink = 'light' WHERE id = ?",
                "[{\"label\":\"Site\",\"url\":\"https://example.com\"}]", ownerId);
        jdbc.update("INSERT INTO follows (follower_id, followed_id) VALUES (?, ?)", fanId, ownerId);
        jdbc.update("INSERT INTO follows (follower_id, followed_id) VALUES (?, ?)", ownerId, fanId);
        newPost("Public one", "profile", true, ownerId);
        newPost("Public note", "notes", true, ownerId);

        MvcResult result = call(OWNER, null, null);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = JSON.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("username").asText()).isEqualTo(OWNER);
        assertThat(body.get("bio").asText()).isEqualTo("hello there");
        assertThat(body.get("bioLinks").get(0).get("label").asText()).isEqualTo("Site");
        assertThat(body.get("avatarPath").asText()).isEqualTo("/uploads/avatar/a.png");
        assertThat(body.get("header").get("headerInk").asText()).isEqualTo("light");
        assertThat(body.get("joined").isNull()).isFalse();
        assertThat(body.get("follows").get("followers").asInt()).isEqualTo(1);
        assertThat(body.get("follows").get("following").asInt()).isEqualTo(1);
        assertThat(body.get("follows").get("followsMe").asBoolean()).isFalse();   // signed out
        assertThat(body.get("pinnedPost").isNull()).isTrue();
        assertThat(body.get("dm").isNull()).isTrue();
        assertThat(body.get("online").asBoolean()).isFalse();
        assertThat(body.get("publicNotes").asInt()).isEqualTo(1);
        assertThat(body.get("banner").get("publicPosts").asInt()).isEqualTo(1);
        assertThat(body.get("banner").get("grid").isNull()).isTrue();
        // Nothing the viewer may not have is cached by a shared proxy.
        assertThat(result.getResponse().getHeader("Cache-Control")).contains("no-store").contains("private");
    }

    @Test
    void countsAreExactlyWhatTheTabsCountForThatReader() throws Exception {
        newPost("Pub", "profile", true, ownerId);
        newPost("Hidden", "profile", false, ownerId);
        newPost("Pub note", "notes", true, ownerId);
        newPost("Sub", "subscribers", true, ownerId);

        JsonNode mine = summary(OWNER, OWNER, ownerToken);
        assertThat(JSON.convertValue(mine.get("counts"), java.util.Map.class)).isEqualTo(posts.countSections(OWNER, true));
        assertThat(mine.get("counts").get("profile").asInt()).isEqualTo(1);   // drafts are not in the Posts tab
        assertThat(mine.get("counts").get("drafts").asInt()).isEqualTo(1);
        assertThat(mine.get("banner").get("publicPosts").asInt()).isEqualTo(mine.get("counts").get("profile").asInt());

        JsonNode visitor = summary(OWNER, STRANGER, strangerToken);
        assertThat(JSON.convertValue(visitor.get("counts"), java.util.Map.class)).isEqualTo(posts.countSections(OWNER, false));
        assertThat(visitor.get("counts").has("drafts")).isFalse();
        assertThat(visitor.get("counts").has("subscribers")).isFalse();
        // The same number for everyone, since the owner's tabs count published posts too.
        assertThat(visitor.get("publicNotes").asInt()).isEqualTo(mine.get("publicNotes").asInt());
    }

    @Test
    void followsMeIsTheOwnerFollowingTheViewer() throws Exception {
        jdbc.update("INSERT INTO follows (follower_id, followed_id) VALUES (?, ?)", ownerId, fanId);
        assertThat(summary(OWNER, FAN, fanToken).get("follows").get("followsMe").asBoolean()).isTrue();
        assertThat(summary(OWNER, STRANGER, strangerToken).get("follows").get("followsMe").asBoolean()).isFalse();
        assertThat(summary(OWNER, OWNER, ownerToken).get("follows").get("followsMe").asBoolean()).isFalse();
    }

    // ── the pinned post ───────────────────────────────────────────────────────

    @Test
    void aPinnedPostComesBackAsACardWithTheGridAndNoBody() throws Exception {
        int id = newPost("Pinned", "profile", true, ownerId);
        jdbc.update("UPDATE posts SET description = 'SECRET BODY WORDS', card_preview = ?, preview_version = 99 WHERE id = ?", GRID, id);
        jdbc.update("UPDATE users SET pinned_post_id = ? WHERE id = ?", id, ownerId);

        for (JsonNode body : new JsonNode[] { summary(OWNER, null, null), summary(OWNER, STRANGER, strangerToken) }) {
            JsonNode card = body.get("pinnedPost");
            assertThat(card.get("id").asInt()).isEqualTo(id);
            assertThat(card.get("title").asText()).isEqualTo("Pinned");
            assertThat(card.get("published").asBoolean()).isTrue();
            assertThat(card.get("preview")).isEqualTo(JSON.readTree(GRID));
            assertThat(card.get("description") == null || card.get("description").isNull()).isTrue();
        }
        assertThat(call(OWNER, null, null).getResponse().getContentAsString()).doesNotContain("SECRET BODY WORDS");
    }

    @Test
    void aPinnedDraftIsTheAuthorsAlone() throws Exception {
        int id = newPost("Pinned draft", "profile", false, ownerId);
        jdbc.update("UPDATE users SET pinned_post_id = ? WHERE id = ?", id, ownerId);

        assertThat(summary(OWNER, null, null).get("pinnedPost").isNull()).isTrue();
        assertThat(summary(OWNER, STRANGER, strangerToken).get("pinnedPost").isNull()).isTrue();
        assertThat(summary(OWNER, FAN, fanToken).get("pinnedPost").isNull()).isTrue();
        assertThat(summary(OWNER, OWNER, ownerToken).get("pinnedPost").get("id").asInt()).isEqualTo(id);
    }

    @Test
    void aForgedUsernameCookieDoesNotShowAPinnedDraft() throws Exception {
        int id = newPost("Pinned draft", "profile", false, ownerId);
        jdbc.update("UPDATE users SET pinned_post_id = ? WHERE id = ?", id, ownerId);

        // The owner's name with somebody else's token, and with no token at all.
        assertThat(summary(OWNER, OWNER, strangerToken).get("pinnedPost").isNull()).isTrue();
        assertThat(summary(OWNER, OWNER, null).get("pinnedPost").isNull()).isTrue();
    }

    @Test
    void aPinnedSubscribersPostIsTheAuthorsAloneEvenWhenPublished() throws Exception {
        int id = newPost("Pinned sub", "subscribers", true, ownerId);
        jdbc.update("UPDATE users SET pinned_post_id = ? WHERE id = ?", id, ownerId);

        assertThat(summary(OWNER, STRANGER, strangerToken).get("pinnedPost").isNull()).isTrue();
        assertThat(summary(OWNER, OWNER, ownerToken).get("pinnedPost").get("id").asInt()).isEqualTo(id);
    }

    // ── direct messages ───────────────────────────────────────────────────────

    @Test
    void theDmStateIsOnlyForASignedInVisitor() throws Exception {
        assertThat(summary(OWNER, null, null).get("dm").isNull()).isTrue();
        assertThat(summary(OWNER, OWNER, ownerToken).get("dm").isNull()).isTrue();

        JsonNode dm = summary(OWNER, STRANGER, strangerToken).get("dm");
        assertThat(dm.get("blocked").asBoolean()).isFalse();
        assertThat(dm.get("blockedByThem").asBoolean()).isFalse();
    }

    @Test
    void aBlockedViewerGetsTheSameAnswerTheOldCallGave() throws Exception {
        // The owner blocks the stranger: the stranger sees blockedByThem, and still sees the profile.
        jdbc.update("INSERT INTO dm_blocks (blocker_id, blocked_id) VALUES (?, ?)", ownerId, strangerId);
        newPost("Pub", "profile", true, ownerId);
        JsonNode blockedViewer = summary(OWNER, STRANGER, strangerToken);
        assertThat(blockedViewer.get("dm").get("blockedByThem").asBoolean()).isTrue();
        assertThat(blockedViewer.get("dm").get("blocked").asBoolean()).isFalse();
        assertThat(blockedViewer.get("counts").get("profile").asInt()).isEqualTo(1);

        // The stranger blocks the owner: `blocked` is the viewer's own block.
        jdbc.update("DELETE FROM dm_blocks WHERE blocker_id = ? AND blocked_id = ?", ownerId, strangerId);
        jdbc.update("INSERT INTO dm_blocks (blocker_id, blocked_id) VALUES (?, ?)", strangerId, ownerId);
        JsonNode blocker = summary(OWNER, STRANGER, strangerToken).get("dm");
        assertThat(blocker.get("blocked").asBoolean()).isTrue();
        assertThat(blocker.get("blockedByThem").asBoolean()).isFalse();
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private MvcResult call(String username, String cookieUser, String token) throws Exception {
        MockHttpServletRequestBuilder request = get("/api/users/" + username + "/profile-summary");
        if (cookieUser != null) request.cookie(new Cookie("username", cookieUser));
        if (token != null) request.cookie(new Cookie("authToken", token));
        return mvc.perform(request).andReturn();
    }

    private JsonNode summary(String username, String cookieUser, String token) throws Exception {
        MvcResult result = call(username, cookieUser, token);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return JSON.readTree(result.getResponse().getContentAsString());
    }

    private int newUser(String name, String hash) {
        return jdbc.queryForObject("INSERT INTO users (username, password) VALUES (?, ?) RETURNING id", Integer.class, name, hash);
    }

    private int newPost(String title, String section, boolean published, int userId) {
        int id = jdbc.queryForObject(
                "INSERT INTO posts (title, description, published, section) VALUES (?, '', ?, ?) RETURNING id",
                Integer.class, title, published, section);
        jdbc.update("INSERT INTO users_posts_junctions (post_id, user_id) VALUES (?, ?)", id, userId);
        return id;
    }

    private String signIn(String username) {
        LoginInfo info = new LoginInfo();
        info.setUsername(username);
        info.setPassword("pw");
        AuthSession session = logins.login(info);
        return session.token;
    }
}
