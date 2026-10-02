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
 * V012, with post_id NULL). Anyone can see them; only the owner places,
 * moves and removes them, and only stickers from their own collection.
 *
 * x is the sticky's centre across the profile column (0 to 1), y its distance
 * from the column's top in CSS pixels, size CSS pixels per grid pixel.
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
                SELECT s.id, s.x, s.y, s.size, st.id AS sticker_id, st.name, st.grid
                  FROM stickies s JOIN stickers st ON st.id = s.sticker_id
                 WHERE s.user_id = ? AND s.post_id IS NULL
                 ORDER BY s.id""", userId)) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.get("id"));
            item.put("x", row.get("x"));
            item.put("y", row.get("y"));
            item.put("size", row.get("size"));
            item.put("stickerId", row.get("sticker_id"));
            item.put("name", row.get("name"));
            try { item.put("grid", MAPPER.readTree((String) row.get("grid"))); }
            catch (Exception e) { continue; }
            out.add(item);
        }
        return ResponseEntity.ok(out);
    }

    /** Places one of the owner's stickers: {stickerId, x, y, size}. */
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
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM stickies WHERE user_id = ? AND post_id IS NULL",
                Integer.class, userId);
        if (count != null && count >= MAX_STICKIES)
            return ResponseEntity.badRequest().body(Map.of("message", "A profile can hold " + MAX_STICKIES + " stickers."));
        Integer id = jdbc.queryForObject(
                "INSERT INTO stickies (user_id, sticker_id, x, y, size) VALUES (?, ?, ?, ?, ?) RETURNING id",
                Integer.class, userId, sid.intValue(),
                clamp(body.get("x"), 0, 1, 0.5), clamp(body.get("y"), 0, 100000, 40),
                (int) Math.round(clamp(body.get("size"), 1, 6, 2)));
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    /** Moves or resizes a sticky: any of {x, y, size}. */
    @PutMapping("/users/{username}/stickies/{id}")
    public ResponseEntity<?> move(@PathVariable String username, @PathVariable int id, @RequestBody Map<String, Object> body,
                                  @CookieValue(name = "username", required = false) String authUsername,
                                  @CookieValue(name = "authToken", required = false) String token) {
        Integer userId = ownerId(username, authUsername, token);
        if (userId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT x, y, size FROM stickies WHERE id = ? AND user_id = ? AND post_id IS NULL", id, userId);
        if (rows.isEmpty()) return ResponseEntity.notFound().build();
        Map<String, Object> was = rows.get(0);
        jdbc.update("UPDATE stickies SET x = ?, y = ?, size = ? WHERE id = ?",
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
        int n = jdbc.update("DELETE FROM stickies WHERE id = ? AND user_id = ? AND post_id IS NULL", id, userId);
        return n == 0 ? ResponseEntity.notFound().build() : ResponseEntity.noContent().build();
    }
}
