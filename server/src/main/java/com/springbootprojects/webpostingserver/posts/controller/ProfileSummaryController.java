package com.springbootprojects.webpostingserver.posts.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.Post;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;
import com.springbootprojects.webpostingserver.posts.service.PostPreview;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Everything a profile page needs to draw itself, in one request, where it
 * used to make a dozen (the bio, the links, the banner, the follow lists
 * fetched whole just to count them, the pinned post with its whole body, ...).
 *
 * Each part answers by the rule of the call it replaces: the pinned post by
 * the same "a draft is its author's alone" rule as /pinned-post, the tab
 * counts exactly as /user/{u}/sections, the DM block state only for a
 * signed-in visitor. Cookies are optional. The posts themselves, the theme,
 * storage use and the follow button stay separate requests.
 */
@RestController
@RequestMapping("/api")
public class ProfileSummaryController {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String SECTION_SUBSCRIBERS = "subscribers";
    /** Same as AuthController's online status. */
    private static final long ONLINE_MINUTES = 5;

    @Autowired private JdbcTemplate jdbc;
    @Autowired private LoginRepository loginRepository;
    @Autowired private PostRepository postRepository;
    @Autowired private SocialRepository social;

    @GetMapping("/users/{username}/profile-summary")
    public ResponseEntity<?> summary(
            @PathVariable String username,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {

        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT id, registration_date, banner_grid, header_path, header_ink, background_pattern,
                       bio, bio_links, avatar_path, last_active_at, pinned_post_id
                  FROM users WHERE username = ?""", username);
        if (rows.isEmpty()) return ResponseEntity.notFound().build();
        Map<String, Object> row = rows.get(0);
        int userId = ((Number) row.get("id")).intValue();

        AuthSession viewer = authorize(authUsername, token);
        boolean signedIn = viewer != null;
        boolean isOwner = signedIn && username.equals(viewer.username);

        Map<String, Integer> counts = postRepository.countSections(username, isOwner);
        Map<String, Integer> follows = social.getFollowCounts(userId);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("username", username);
        body.put("joined", instantOf(row.get("registration_date")));
        Instant lastActive = instantOf(row.get("last_active_at"));
        body.put("online", lastActive != null && lastActive.isAfter(Instant.now().minusSeconds(ONLINE_MINUTES * 60)));
        body.put("lastSeen", lastActive == null ? "" : lastActive.toString());
        body.put("bio", row.get("bio") == null ? "" : row.get("bio"));
        body.put("bioLinks", jsonOrDefault(row.get("bio_links"), JSON.createArrayNode()));
        body.put("avatarPath", blankToNull(row.get("avatar_path")));

        Map<String, Object> header = new LinkedHashMap<>();
        header.put("headerPath", row.get("header_path"));
        header.put("headerInk", row.get("header_ink"));
        body.put("header", header);
        body.put("background", row.get("background_pattern") == null ? "" : row.get("background_pattern"));

        Map<String, Object> banner = new LinkedHashMap<>();
        banner.put("joined", body.get("joined"));
        banner.put("publicPosts", counts.get("profile"));
        banner.put("cols", ProfileBannerController.COLS);
        banner.put("grid", jsonOrDefault(row.get("banner_grid"), null));
        body.put("banner", banner);

        body.put("counts", counts);
        // Published notes, one number, so no list of note bodies is loaded to count them.
        body.put("publicNotes", counts.get("notes"));

        Map<String, Object> followBlock = new LinkedHashMap<>();
        followBlock.put("followers", follows.get("followers"));
        followBlock.put("following", follows.get("following"));
        // "The profile owner follows the viewer"; never for yourself or when signed out.
        followBlock.put("followsMe", signedIn && !isOwner && social.isFollowing(userId, viewer.userId));
        body.put("follows", followBlock);

        body.put("pinnedPost", pinnedCard(row.get("pinned_post_id"), username, isOwner));

        if (signedIn && !isOwner) {
            Map<String, Object> dm = new LinkedHashMap<>();
            dm.put("blocked", social.isBlockingMessages(viewer.userId, userId));
            dm.put("blockedByThem", social.isMessageBlocked(userId, viewer.userId));
            body.put("dm", dm);
        } else {
            body.put("dm", null);
        }

        // Cookies change the answer, and a profile shows live counts.
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate()).body(body);
    }

    /**
     * The pinned post as a card (no body), or null. A draft, or a post in the
     * subscribers section, is its author's alone: the same rule as
     * /users/{u}/pinned-post, which once answered with a pinned draft for
     * anyone who knew the author's name.
     */
    private Post pinnedCard(Object pinnedId, String username, boolean isOwner) {
        if (pinnedId == null) return null;
        List<Post> found = jdbc.query("""
                SELECT id, title, published, date, folder, slug, summary, section, sort_order, card_grid,
                       CASE WHEN card_grid THEN card_preview END AS card_preview,
                       CASE WHEN card_grid AND preview_version < ? THEN description END AS body
                  FROM posts WHERE id = ?""", (rs, n) -> {
            Post p = new Post();
            p.setId(rs.getInt("id"));
            p.setTitle(rs.getString("title"));
            p.setPublished(rs.getBoolean("published"));
            p.setDate(rs.getTimestamp("date"));
            p.setFolder(rs.getString("folder"));
            p.setSlug(rs.getString("slug"));
            p.setSummary(rs.getString("summary"));
            p.setSection(rs.getString("section"));
            p.setSortOrder(rs.getInt("sort_order"));
            p.setCardGrid(rs.getBoolean("card_grid"));
            p.setPreview(PostPreview.previewJson(rs.getString("card_preview"), rs.getString("body")));
            return p;
        }, PostPreview.VERSION, ((Number) pinnedId).intValue());
        if (found.isEmpty()) return null;
        Post post = found.get(0);
        boolean visible = isOwner || (post.isPublished() && !SECTION_SUBSCRIBERS.equals(post.getSection()));
        return visible ? post : null;
    }

    private AuthSession authorize(String username, String token) {
        if (username == null || token == null) return null;
        try { return loginRepository.authorize(username, token); }
        catch (JdbcLoginRepository.TokenExpiredException e) { return null; }
    }

    private static Instant instantOf(Object value) {
        if (value instanceof Timestamp t) return t.toInstant();
        if (value instanceof OffsetDateTime o) return o.toInstant();
        return null;
    }

    private static Object blankToNull(Object value) {
        return value == null || value.toString().isEmpty() ? null : value;
    }

    /** A stored JSON column as a tree; the fallback when it is missing or unreadable. */
    private static JsonNode jsonOrDefault(Object stored, JsonNode fallback) {
        if (stored == null) return fallback;
        try { return JSON.readTree(stored.toString()); }
        catch (Exception e) { return fallback; }
    }
}
