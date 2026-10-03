package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.FeedController;
import com.springbootprojects.webpostingserver.posts.controller.PostController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.model.Post;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Sections (V017): a post belongs to the profile, to notes or to subscribers.
 * Subscribers posts are the author's alone for now, so every public surface
 * must leave them out; notes are public once published but never announced.
 */
@SpringBootTest
@AutoConfigureMockMvc
class PostSectionTest {

    private static final String OWNER = "sect_owner";
    private static final String OTHER = "sect_other";
    private static final String FAN = "sect_fan";
    private static final String TAG = "sectiontagx";

    @Autowired JdbcTemplate jdbc;
    @Autowired LoginRepository logins;
    @Autowired PostController controller;
    @Autowired FeedController feed;
    @Autowired MockMvc mvc;

    private int ownerId, otherId, fanId;
    private int profilePub, profileDraft, notePub, noteDraft, subPub, subDraft;
    private String ownerToken, otherToken, fanToken;

    @BeforeEach
    void setUp() {
        cleanUp();
        String hash = new BCryptPasswordEncoder().encode("pw");
        ownerId = newUser(OWNER, hash);
        otherId = newUser(OTHER, hash);
        fanId = newUser(FAN, hash);
        jdbc.update("INSERT INTO follows (follower_id, followed_id) VALUES (?, ?)", fanId, ownerId);
        profilePub = newPost("Profile public", "profile", true);
        profileDraft = newPost("Profile draft", "profile", false);
        notePub = newPost("Note public", "notes", true);
        noteDraft = newPost("Note draft", "notes", false);
        subPub = newPost("Sub published", "subscribers", true);
        subDraft = newPost("Sub draft", "subscribers", false);
        int tag = jdbc.queryForObject("INSERT INTO hashtags (tag) VALUES (?) RETURNING id", Integer.class, TAG);
        for (int id : new int[] { profilePub, subPub })
            jdbc.update("INSERT INTO post_hashtags (post_id, hashtag_id) VALUES (?, ?)", id, tag);
        ownerToken = signIn(OWNER);
        otherToken = signIn(OTHER);
        fanToken = signIn(FAN);
    }

    @AfterEach
    void cleanUp() {
        for (Integer id : jdbc.queryForList("""
                SELECT j.post_id FROM users_posts_junctions j JOIN users u ON u.id = j.user_id
                 WHERE u.username IN (?, ?, ?)""", Integer.class, OWNER, OTHER, FAN)) {
            jdbc.update("DELETE FROM post_hashtags WHERE post_id = ?", id);
            jdbc.update("DELETE FROM notifications WHERE post_id = ?", id);
            jdbc.update("DELETE FROM users_posts_junctions WHERE post_id = ?", id);
            jdbc.update("DELETE FROM posts WHERE id = ?", id);
        }
        jdbc.update("DELETE FROM hashtags WHERE tag = ?", TAG);
        jdbc.update("DELETE FROM follows WHERE follower_id IN (SELECT id FROM users WHERE username IN (?, ?, ?))", OWNER, OTHER, FAN);
        jdbc.update("DELETE FROM users WHERE username IN (?, ?, ?)", OWNER, OTHER, FAN);
    }

    // ── validation and storage ────────────────────────────────────────────────

    @Test
    void createDefaultsToProfileAndKeepsNotesAndSubscribers() {
        assertThat(created(null)).isEqualTo("profile");
        assertThat(created("notes")).isEqualTo("notes");
        assertThat(created("subscribers")).isEqualTo("subscribers");
    }

    @Test
    void anUnknownSectionIsRefusedOnCreateAndUpdate() {
        Post bad = draft("Bad section", "friends");
        assertThat(controller.createPost(bad, OWNER, ownerToken).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(controller.updatePost(noteDraft, bad, OWNER, ownerToken).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(sectionOf(noteDraft)).isEqualTo("notes");
    }

    @Test
    void updateMovesAPostBetweenSections() {
        Post moved = draft("Note draft", "subscribers");
        assertThat(controller.updatePost(noteDraft, moved, OWNER, ownerToken).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(sectionOf(noteDraft)).isEqualTo("subscribers");
    }

    // ── reading one post ──────────────────────────────────────────────────────

    @Test
    void profileAndNotesFollowThePublishedRule() throws Exception {
        assertThat(readStatus(profilePub, null, null)).isEqualTo(200);
        assertThat(readStatus(profileDraft, null, null)).isEqualTo(404);
        assertThat(readStatus(notePub, null, null)).isEqualTo(200);
        assertThat(readStatus(noteDraft, null, null)).isEqualTo(404);
        assertThat(readStatus(noteDraft, OTHER, otherToken)).isEqualTo(404);
        assertThat(readStatus(noteDraft, OWNER, ownerToken)).isEqualTo(200);
    }

    @Test
    void aSubscribersPostIsTheOwnersAloneEvenWhenPublished() throws Exception {
        for (int id : new int[] { subPub, subDraft }) {
            assertThat(readStatus(id, null, null)).isEqualTo(404);
            assertThat(readStatus(id, OTHER, otherToken)).isEqualTo(404);
            assertThat(readStatus(id, FAN, fanToken)).isEqualTo(404);
            assertThat(readStatus(id, OWNER, ownerToken)).isEqualTo(200);
            // The address lookups answer exactly as they do for an unpublished post.
            assertThat(controller.canonicalPath(id, null, null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(controller.canonicalPath(id, OTHER, otherToken).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(controller.postCard(id, OTHER, otherToken).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(controller.getUserByPostID(id, null, null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(controller.resolvePost(OWNER, String.valueOf(id), null, null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(controller.canonicalPath(id, OWNER, ownerToken).getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(controller.resolvePost(OWNER, String.valueOf(id), OWNER, ownerToken).getStatusCode()).isEqualTo(HttpStatus.OK);
        }
    }

    // ── lists and counts ──────────────────────────────────────────────────────

    @Test
    void theListTakesASectionAndDraftsAreTheOwnersAlone() {
        assertThat(ids(OWNER, "profile", OWNER, ownerToken)).containsExactlyInAnyOrder(profilePub, profileDraft);
        assertThat(ids(OWNER, "notes", OWNER, ownerToken)).containsExactlyInAnyOrder(notePub, noteDraft);
        assertThat(ids(OWNER, "subscribers", OWNER, ownerToken)).containsExactlyInAnyOrder(subPub, subDraft);
        assertThat(ids(OWNER, "drafts", OWNER, ownerToken)).containsExactlyInAnyOrder(profileDraft, noteDraft, subDraft);

        assertThat(ids(OWNER, "profile", OTHER, otherToken)).containsExactly(profilePub);
        assertThat(ids(OWNER, "notes", null, null)).containsExactly(notePub);
        assertThat(ids(OWNER, "subscribers", OTHER, otherToken)).isEmpty();
        assertThat(ids(OWNER, "subscribers", null, null)).isEmpty();
        assertThat(ids(OWNER, "drafts", OTHER, otherToken)).isEmpty();
        assertThat(ids(OWNER, "drafts", null, null)).isEmpty();
    }

    @Test
    void theListDefaultsToProfileAndRefusesUnknownSections() {
        ResponseEntity<List<Post>> plain = controller.getPostsByUser(OWNER, 20, 0, "profile", null, null);
        assertThat(plain.getBody()).extracting(Post::getId).containsExactly(profilePub);
        assertThat(controller.getPostsByUser(OWNER, 20, 0, "everything", null, null).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void countsDifferForTheOwnerAndAVisitor() {
        Map<String, Integer> mine = controller.getSectionCounts(OWNER, OWNER, ownerToken).getBody();
        assertThat(mine).containsEntry("profile", 2).containsEntry("notes", 2)
                .containsEntry("subscribers", 2).containsEntry("drafts", 3);

        Map<String, Integer> visitor = controller.getSectionCounts(OWNER, OTHER, otherToken).getBody();
        assertThat(visitor).containsOnlyKeys("profile", "notes").containsEntry("profile", 1).containsEntry("notes", 1);
        assertThat(controller.getSectionCounts(OWNER, null, null).getBody()).isEqualTo(visitor);
    }

    @Test
    void countsOverHttpHaveTheSameShape() throws Exception {
        mvc.perform(get("/api/user/" + OWNER + "/sections")).andExpect(status().isOk());
        mvc.perform(get("/api/user/" + OWNER).param("section", "notes")).andExpect(status().isOk());
    }

    // ── public surfaces ───────────────────────────────────────────────────────

    @Test
    void theFollowingFeedLeavesOutSubscribersPostsButShowsPublishedNotes() {
        Map<?, ?> body = (Map<?, ?>) feed.following(50, 0, FAN, fanToken).getBody();
        List<Object> titles = ((List<?>) body.get("posts")).stream().map(p -> (Object) ((Map<?, ?>) p).get("title")).toList();
        assertThat(titles).contains("Profile public", "Note public").doesNotContain("Sub published", "Sub draft");
    }

    @Test
    void searchAndHashtagsLeaveOutSubscribersPosts() {
        List<Map<String, Object>> all = controller.searchPosts("Sub", null).getBody();
        assertThat(all).extracting(r -> r.get("title")).doesNotContain("Sub published");
        List<Map<String, Object>> byAuthor = controller.searchPosts("", OWNER).getBody();
        assertThat(byAuthor).extracting(r -> r.get("title")).contains("Profile public").doesNotContain("Sub published");
        List<Map<String, Object>> tagged = controller.getPostsByHashtag(TAG).getBody();
        assertThat(tagged).extracting(r -> r.get("title")).containsExactly("Profile public");
    }

    @Test
    void sitemapFeedAndCrawlerPagesLeaveOutSubscribersPosts() throws Exception {
        String sitemap = mvc.perform(get("/api/seo/sitemap.xml")).andReturn().getResponse().getContentAsString();
        assertThat(sitemap).contains("/" + OWNER + "/" + profilePub + "<").doesNotContain("/" + OWNER + "/" + subPub);
        String atom = mvc.perform(get("/api/seo/feed/" + OWNER + ".atom")).andReturn().getResponse().getContentAsString();
        assertThat(atom).contains("Profile public").doesNotContain("Sub published");
        String profile = mvc.perform(get("/api/seo/page").param("path", "/" + OWNER)).andReturn().getResponse().getContentAsString();
        assertThat(profile).contains("Profile public").doesNotContain("Sub published");
        mvc.perform(get("/api/seo/page").param("path", "/" + OWNER + "/" + subPub)).andExpect(status().isNotFound());
    }

    // ── announcing ────────────────────────────────────────────────────────────

    @Test
    void onlyProfilePostsNotifyFollowersWhenPublished() {
        int before = announcements();
        Post note = draft("Quiet note", "notes");
        note.setPublished(true);
        assertThat(controller.createPost(note, OWNER, ownerToken).getStatusCode()).isEqualTo(HttpStatus.CREATED);
        Post sub = draft("Quiet sub", "subscribers");
        sub.setPublished(true);
        assertThat(controller.createPost(sub, OWNER, ownerToken).getStatusCode()).isEqualTo(HttpStatus.CREATED);
        Post publish = draft("Note draft", "notes");
        publish.setPublished(true);
        controller.updatePost(noteDraft, publish, OWNER, ownerToken);
        assertThat(announcements()).isEqualTo(before);

        Post loud = draft("Loud post", "profile");
        loud.setPublished(true);
        assertThat(controller.createPost(loud, OWNER, ownerToken).getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(announcements()).isEqualTo(before + 1);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private int announcements() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM notifications WHERE type = 'new_post' AND recipient_id = ?",
                Integer.class, fanId);
    }

    private Post draft(String title, String section) {
        Post p = new Post();
        p.setTitle(title);
        p.setDescription("");
        p.setPublished(false);
        p.setSection(section);
        return p;
    }

    private String created(String section) {
        Post p = draft("Created " + section, section);
        ResponseEntity<String> resp = controller.createPost(p, OWNER, ownerToken);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return sectionOf(Integer.parseInt(resp.getBody()));
    }

    private String sectionOf(int id) {
        return jdbc.queryForObject("SELECT section FROM posts WHERE id = ?", String.class, id);
    }

    private List<Integer> ids(String author, String section, String user, String token) {
        return controller.getPostsByUser(author, 50, 0, section, user, token).getBody()
                .stream().map(p -> p.getId()).toList();
    }

    private int readStatus(int id, String user, String token) throws Exception {
        var request = get("/api/posts/" + id);
        if (user != null) request.cookie(new Cookie("username", user), new Cookie("authToken", token));
        return mvc.perform(request).andReturn().getResponse().getStatus();
    }

    private int newUser(String name, String hash) {
        return jdbc.queryForObject("INSERT INTO users (username, password) VALUES (?, ?) RETURNING id", Integer.class, name, hash);
    }

    private int newPost(String title, String section, boolean published) {
        int id = jdbc.queryForObject(
                "INSERT INTO posts (title, description, published, section) VALUES (?, '', ?, ?) RETURNING id",
                Integer.class, title, published, section);
        jdbc.update("INSERT INTO users_posts_junctions (post_id, user_id) VALUES (?, ?)", id, ownerId);
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
