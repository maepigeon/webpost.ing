package com.springbootprojects.webpostingserver.posts.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Stickies: the owner's stickers placed on their profile (the stickies table,
 * V012). Each is anchored to the profile's top section (post_id NULL) or to
 * one of the owner's posts (post_id), and placed relative to it, so it stays
 * with what it was stuck on when posts load or move. Anyone can see them,
 * except on a draft; only the owner places, moves and removes them, and only
 * stickers from their own collection.
 *
 * x is the sticky's centre across its anchor (0 to 1), y its distance from
 * the anchor's top in CSS pixels, size CSS pixels per grid pixel.
 */
@RestController
@RequestMapping("/api")
public class StickyController {

    static final int MAX_STICKIES = 30;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired private LoginRepository loginRepository;
    @Autowired private JdbcTemplate jdbc;

    private Integer userIdOf(String username) {
        List<Integer> ids = jdbc.queryForList("SELECT id FROM users WHERE username = ?", Integer.class, username);
        return ids.isEmpty() ? null : ids.get(0);
    }

    /** The signed-in owner of `username`'s profile, or null. */
    private Integer ownerId(String username, String authUsername, String token) {
        if (authUsername == null || !authUsername.equals(username)) return null;
        try {
            if (loginRepository.authorize(authUsername, token) == null) return null;
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return null;
        }
        return userIdOf(username);
    }

    private static double clamp(Object v, double lo, double hi, double fallback) {
        if (!(v instanceof Number n) || !Double.isFinite(n.doubleValue())) return fallback;
        return Math.max(lo, Math.min(hi, n.doubleValue()));
    }

    @GetMapping("/users/{username}/stickies")
    public ResponseEntity<?> list(@PathVariable String username) {
        Integer userId = userIdOf(username);
        if (userId == null) return ResponseEntity.notFound().build();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : jdbc.queryForList("""
                SELECT s.id, s.x, s.y, s.size, s.post_id, st.id AS sticker_id, st.name, st.grid
                  FROM stickies s JOIN stickers st ON st.id = s.sticker_id
                  LEFT JOIN posts p ON p.id = s.post_id
                 WHERE s.user_id = ? AND (s.post_id IS NULL OR p.published)
                 ORDER BY s.id""", userId)) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.get("id"));
            item.put("x", row.get("x"));
            item.put("y", row.get("y"));
            item.put("size", row.get("size"));
            item.put("postId", row.get("post_id"));
            item.put("stickerId", row.get("sticker_id"));
            item.put("name", row.get("name"));
            try { item.put("grid", MAPPER.readTree((String) row.get("grid"))); }
            catch (Exception e) { continue; }
            out.add(item);
        }
        return ResponseEntity.ok(out);
    }

    /** The post a sticky may be anchored to: null for the top section, or one of the owner's posts. */
    private record Anchor(boolean ok, Integer postId) {}

    private Anchor anchorOf(Object raw, int userId) {
        if (raw == null) return new Anchor(true, null);
        if (!(raw instanceof Number n)) return new Anchor(false, null);
        Integer owned = jdbc.queryForObject(
                "SELECT COUNT(*) FROM users_posts_junctions WHERE post_id = ? AND user_id = ?", Integer.class, n.intValue(), userId);
        return owned != null && owned > 0 ? new Anchor(true, n.intValue()) : new Anchor(false, null);
    }

    /** Places one of the owner's stickers: {stickerId, postId (or null for the top section), x, y, size}. */
    @PostMapping("/users/{username}/stickies")
    public ResponseEntity<?> place(@PathVariable String username, @RequestBody Map<String, Object> body,
                                   @CookieValue(name = "username", required = false) String authUsername,
                                   @CookieValue(name = "authToken", required = false) String token) {
        Integer userId = ownerId(username, authUsername, token);
        if (userId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        if (!(body.get("stickerId") instanceof Number sid))
            return ResponseEntity.badRequest().body(Map.of("message", "Choose a sticker."));
        Integer mine = jdbc.queryForObject("SELECT COUNT(*) FROM stickers WHERE id = ? AND user_id = ?",
                Integer.class, sid.intValue(), userId);
        if (mine == null || mine == 0)
            return ResponseEntity.badRequest().body(Map.of("message", "That sticker isn't in your collection."));
        Anchor anchor = anchorOf(body.get("postId"), userId);
        if (!anchor.ok()) return ResponseEntity.badRequest().body(Map.of("message", "Stickers go on your own profile or posts."));
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM stickies WHERE user_id = ?", Integer.class, userId);
        if (count != null && count >= MAX_STICKIES)
            return ResponseEntity.badRequest().body(Map.of("message", "A profile can hold " + MAX_STICKIES + " stickers."));
        Integer id = jdbc.queryForObject(
                "INSERT INTO stickies (user_id, sticker_id, post_id, x, y, size) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
                Integer.class, userId, sid.intValue(), anchor.postId(),
                clamp(body.get("x"), 0, 1, 0.5), clamp(body.get("y"), 0, 100000, 40),
                (int) Math.round(clamp(body.get("size"), 1, 6, 2)));
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    /** Moves or resizes a sticky: any of {x, y, size}, and postId to move it to another anchor. */
    @PutMapping("/users/{username}/stickies/{id}")
    public ResponseEntity<?> move(@PathVariable String username, @PathVariable int id, @RequestBody Map<String, Object> body,
                                  @CookieValue(name = "username", required = false) String authUsername,
                                  @CookieValue(name = "authToken", required = false) String token) {
        Integer userId = ownerId(username, authUsername, token);
        if (userId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT x, y, size, post_id FROM stickies WHERE id = ? AND user_id = ?", id, userId);
        if (rows.isEmpty()) return ResponseEntity.notFound().build();
        Map<String, Object> was = rows.get(0);
        Integer postId = (Integer) was.get("post_id");
        if (body.containsKey("postId")) {
            Anchor anchor = anchorOf(body.get("postId"), userId);
            if (!anchor.ok()) return ResponseEntity.badRequest().body(Map.of("message", "Stickers go on your own profile or posts."));
            postId = anchor.postId();
        }
        jdbc.update("UPDATE stickies SET post_id = ?, x = ?, y = ?, size = ? WHERE id = ?", postId,
                clamp(body.get("x"), 0, 1, ((Number) was.get("x")).doubleValue()),
                clamp(body.get("y"), 0, 100000, ((Number) was.get("y")).doubleValue()),
                (int) Math.round(clamp(body.get("size"), 1, 6, ((Number) was.get("size")).doubleValue())), id);
        return ResponseEntity.ok(Map.of("id", id));
    }

    @DeleteMapping("/users/{username}/stickies/{id}")
    public ResponseEntity<?> remove(@PathVariable String username, @PathVariable int id,
                                    @CookieValue(name = "username", required = false) String authUsername,
                                    @CookieValue(name = "authToken", required = false) String token) {
        Integer userId = ownerId(username, authUsername, token);
        if (userId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        int n = jdbc.update("DELETE FROM stickies WHERE id = ? AND user_id = ?", id, userId);
        return n == 0 ? ResponseEntity.notFound().build() : ResponseEntity.noContent().build();
    }
}
