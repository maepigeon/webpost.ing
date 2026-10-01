package com.springbootprojects.webpostingserver.posts.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.validator.ThemeValidator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * A user's page theme: how their profile and posts look to everyone who visits.
 * No theme (null) means the site default, Newspaper Life.
 */
@RestController
@RequestMapping("/api")
public class PageThemeController {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired private LoginRepository loginRepository;
    @Autowired private JdbcTemplate jdbc;

    private AuthSession authorize(String username, String token) {
        try { return loginRepository.authorize(username, token); }
        catch (JdbcLoginRepository.TokenExpiredException e) { return null; }
    }

    /** Public — every visitor needs it to draw the page. */
    @GetMapping("/users/{username}/theme")
    public ResponseEntity<?> getTheme(@PathVariable String username) {
        List<String> rows = jdbc.queryForList(
                "SELECT page_theme FROM users WHERE username = ?", String.class, username);
        if (rows.isEmpty()) return ResponseEntity.notFound().build();
        Map<String, Object> body = new HashMap<>();
        body.put("theme", rows.get(0) == null ? null : parseOrNull(rows.get(0)));
        return ResponseEntity.ok(body);
    }

    /** Body: {"theme": {...}} to save, or {"theme": null} to go back to the default. */
    @PutMapping("/users/{username}/theme")
    public ResponseEntity<?> setTheme(
            @PathVariable String username,
            @RequestBody Map<String, Object> body,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!username.equals(authUsername)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        Object theme = body == null ? null : body.get("theme");
        String canonical = null;
        if (theme != null) {
            try {
                canonical = ThemeValidator.normalise(MAPPER.writeValueAsString(theme));
            } catch (ThemeValidator.InvalidThemeException e) {
                return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
            } catch (Exception e) {
                return ResponseEntity.badRequest().body(Map.of("message", "That theme could not be read."));
            }
        }

        int updated = jdbc.update("UPDATE users SET page_theme = ? WHERE username = ?", canonical, username);
        if (updated == 0) return ResponseEntity.notFound().build();

        Map<String, Object> result = new HashMap<>();
        result.put("theme", canonical == null ? null : parseOrNull(canonical));
        result.put("message", canonical == null ? "Back to Newspaper Life." : "Theme saved.");
        return ResponseEntity.ok(result);
    }

    // ── A post's own theme ───────────────────────────────────────────────────
    // Each post keeps a theme of its own (V009): it starts as a copy of the
    // author's profile theme and is changed from the post's editor.

    /** The post's author and whether it is published, or null if there is no such post. */
    private Map<String, Object> postRow(long postId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT p.page_theme, p.published, u.username AS author
                  FROM posts p
                  JOIN users_posts_junctions j ON j.post_id = p.id
                  JOIN users u ON u.id = j.user_id
                 WHERE p.id = ?
                """, postId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** Signed in as this author, with a valid token (the cookie name alone proves nothing). */
    private boolean isAuthor(Object author, String authUsername, String token) {
        return author != null && author.equals(authUsername) && authorize(authUsername, token) != null;
    }

    /** Public for a published post; a draft's only to its author, like the draft itself. */
    @GetMapping("/posts/{id}/theme")
    public ResponseEntity<?> getPostTheme(
            @PathVariable long id,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {
        Map<String, Object> row = postRow(id);
        if (row == null) return ResponseEntity.notFound().build();
        if (!Boolean.TRUE.equals(row.get("published")) && !isAuthor(row.get("author"), authUsername, token))
            return ResponseEntity.notFound().build();
        Map<String, Object> body = new HashMap<>();
        Object stored = row.get("page_theme");
        body.put("theme", stored == null ? null : parseOrNull((String) stored));
        return ResponseEntity.ok(body);
    }

    /** Body: {"theme": {...}} to save, or {"theme": null} for the site default. Author only. */
    @PutMapping("/posts/{id}/theme")
    public ResponseEntity<?> setPostTheme(
            @PathVariable long id,
            @RequestBody Map<String, Object> body,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {
        Map<String, Object> row = postRow(id);
        if (row == null) return ResponseEntity.notFound().build();
        if (authorize(authUsername, token) == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!authUsername.equals(row.get("author"))) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        Object theme = body == null ? null : body.get("theme");
        String canonical = null;
        if (theme != null) {
            try {
                canonical = ThemeValidator.normalise(MAPPER.writeValueAsString(theme));
            } catch (ThemeValidator.InvalidThemeException e) {
                return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
            } catch (Exception e) {
                return ResponseEntity.badRequest().body(Map.of("message", "That theme could not be read."));
            }
        }
        jdbc.update("UPDATE posts SET page_theme = ? WHERE id = ?", canonical, id);

        Map<String, Object> result = new HashMap<>();
        result.put("theme", canonical == null ? null : parseOrNull(canonical));
        result.put("message", canonical == null ? "This post uses the site default now." : "Post theme saved.");
        return ResponseEntity.ok(result);
    }

    private static Object parseOrNull(String json) {
        try { return ThemeValidator.parse(json); } catch (Exception e) { return null; }
    }
}
