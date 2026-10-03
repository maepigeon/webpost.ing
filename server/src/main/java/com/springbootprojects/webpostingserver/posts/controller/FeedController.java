package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.sql.Timestamp;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Recent posts from the people you follow, newest first: your reading list.
 * Only published posts, and only for the signed-in reader, whose follows
 * decide what is in it. Drafts never appear.
 */
@RestController
@RequestMapping("/api")
public class FeedController {

    static final int MAX_PAGE = 50;

    @Autowired private LoginRepository loginRepository;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private com.springbootprojects.webpostingserver.posts.repository.SocialRepository social;

    private AuthSession authorize(String username, String token) {
        try { return loginRepository.authorize(username, token); }
        catch (JdbcLoginRepository.TokenExpiredException e) { return null; }
    }

    @GetMapping("/feed/following")
    public ResponseEntity<?> following(
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "0") int offset,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token) {

        AuthSession session = username == null || token == null ? null : authorize(username, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        int size = Math.max(1, Math.min(MAX_PAGE, limit));
        // One more than asked for tells whether there is another page.
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT p.id, p.title, p.description, p.date, p.slug, p.card_grid, p.published,
                       author.username AS author, author.avatar_path
                  FROM follows f
                  JOIN users_posts_junctions j ON j.user_id = f.followed_id
                  JOIN posts p ON p.id = j.post_id
                  JOIN users author ON author.id = f.followed_id
                 WHERE f.follower_id = ? AND p.published AND p.section <> 'subscribers'
                 ORDER BY p.date DESC, p.id DESC
                 LIMIT ? OFFSET ?""", session.userId, size + 1, Math.max(0, offset));

        boolean more = rows.size() > size;
        List<Map<String, Object>> page = (more ? rows.subList(0, size) : rows).stream().map(r -> {
            Map<String, Object> post = new LinkedHashMap<>();
            post.put("id", r.get("id"));
            post.put("title", r.get("title"));
            post.put("description", r.get("description"));
            Object date = r.get("date");
            post.put("date", date instanceof Timestamp t ? t.getTime() : date);
            post.put("slug", r.get("slug"));
            post.put("cardGrid", r.get("card_grid"));
            post.put("published", true);
            post.put("username", r.get("author"));
            post.put("avatarPath", r.get("avatar_path"));
            return post;
        }).toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("posts", page);
        body.put("hasMore", more);
        return ResponseEntity.ok(body);
    }

    static final int DISCOVER_MAX = 20;
    static final int PEOPLE_MAX = 30;

    private int viewerId(String username, String token) {
        AuthSession s = username == null || token == null ? null : authorize(username, token);
        return s == null ? 0 : s.userId;
    }

    /**
     * Recent public posts from everyone, newest first, paged by date: pass the
     * last post's date as {@code before}. Works signed out too (the viewer's own
     * posts are left out when signed in).
     */
    @GetMapping("/feed/discover")
    public ResponseEntity<?> discover(
            @RequestParam(required = false) String before,
            @RequestParam(defaultValue = "20") int size,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token) {

        Timestamp cut = null;
        if (before != null && !before.isBlank()) {
            try { cut = Timestamp.from(java.time.Instant.parse(before)); }
            catch (java.time.format.DateTimeParseException e) {
                try { cut = new Timestamp(Long.parseLong(before)); }
                catch (NumberFormatException e2) { return ResponseEntity.badRequest().build(); }
            }
        }
        int n = Math.max(1, Math.min(DISCOVER_MAX, size));
        List<Map<String, Object>> rows = social.discoverPosts(viewerId(username, token), cut, n);
        boolean more = rows.size() > n;
        List<Map<String, Object>> page = (more ? rows.subList(0, n) : rows).stream().map(r -> {
            Map<String, Object> post = new LinkedHashMap<>();
            post.put("id", r.get("id"));
            post.put("title", r.get("title"));
            post.put("description", r.get("description"));
            Object date = r.get("date");
            post.put("date", date instanceof Timestamp t ? t.getTime() : date);
            post.put("slug", r.get("slug"));
            post.put("cardGrid", r.get("card_grid"));
            post.put("published", true);
            post.put("username", r.get("author"));
            post.put("avatarPath", r.get("avatar_path"));
            return post;
        }).toList();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("posts", page);
        body.put("hasMore", more);
        return ResponseEntity.ok().header("Cache-Control", "private, no-store").body(body);
    }

    /** Recently active members who have at least one public post. */
    @GetMapping("/feed/people")
    public ResponseEntity<?> people(
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token) {
        List<Map<String, Object>> rows = social.discoverPeople(viewerId(username, token), PEOPLE_MAX);
        List<Map<String, Object>> out = rows.stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("username", r.get("username"));
            m.put("avatarPath", r.get("avatar_path"));
            String bio = (String) r.get("bio");
            if (bio != null && bio.length() > 140) bio = bio.substring(0, 140).trim() + "…";
            m.put("bio", bio == null ? "" : bio);
            return m;
        }).toList();
        return ResponseEntity.ok().header("Cache-Control", "private, no-store").body(out);
    }
}
