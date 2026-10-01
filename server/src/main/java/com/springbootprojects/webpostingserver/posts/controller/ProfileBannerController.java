package com.springbootprojects.webpostingserver.posts.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.validator.GridValidator;
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
 * The banner at the top of a profile: a tile grid 32 tiles wide. Its first
 * four rows are the site's (name, follow counts, join date, public posts,
 * with the avatar beside them) and are drawn by the client from what this
 * returns; the rows under them are the owner's own grid.
 */
@RestController
@RequestMapping("/api")
public class ProfileBannerController {

    /** Banner width in tiles; the owner's rows must match the site's. */
    public static final int COLS = 32;
    public static final int MAX_ROWS = 12;

    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired private LoginRepository loginRepository;
    @Autowired private JdbcTemplate jdbc;

    private AuthSession authorize(String username, String token) {
        try { return loginRepository.authorize(username, token); }
        catch (JdbcLoginRepository.TokenExpiredException e) { return null; }
    }

    /** Public: everything the banner shows besides follow counts, which the profile already loads. */
    @GetMapping("/users/{username}/banner")
    public ResponseEntity<?> getBanner(@PathVariable String username) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT u.registration_date, u.banner_grid,
                       (SELECT COUNT(*) FROM users_posts_junctions j JOIN posts p ON p.id = j.post_id
                         WHERE j.user_id = u.id AND p.published) AS public_posts
                  FROM users u WHERE u.username = ?""", username);
        if (rows.isEmpty()) return ResponseEntity.notFound().build();
        Map<String, Object> row = rows.get(0);

        Map<String, Object> body = new LinkedHashMap<>();
        Object joined = row.get("registration_date");
        body.put("joined", joined instanceof Timestamp t ? t.toInstant().toString() : null);
        body.put("publicPosts", ((Number) row.get("public_posts")).longValue());
        body.put("cols", COLS);
        Object grid = row.get("banner_grid");
        try { body.put("grid", grid == null ? null : JSON.readTree(grid.toString())); }
        catch (Exception e) { body.put("grid", null); }
        return ResponseEntity.ok(body);
    }

    /** Saves the owner's rows ({"grid": …}), or removes them ({"grid": null}). */
    @PutMapping("/users/{username}/banner")
    public ResponseEntity<?> setBanner(
            @PathVariable String username,
            @RequestBody Map<String, Object> body,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {

        if (authorize(authUsername, token) == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!username.equals(authUsername))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        Object raw = body.get("grid");
        if (raw == null) {
            jdbc.update("UPDATE users SET banner_grid = NULL WHERE username = ?", username);
            return ResponseEntity.ok(Map.of("message", "Banner rows removed."));
        }
        ObjectNode grid;
        try {
            JsonNode in = JSON.valueToTree(raw);
            if (in.isObject()) ((ObjectNode) in).put("cols", COLS);
            grid = GridValidator.normalise(in, COLS, MAX_ROWS);
        } catch (GridValidator.InvalidGridException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
        jdbc.update("UPDATE users SET banner_grid = ? WHERE username = ?", grid.toString(), username);
        return ResponseEntity.ok(Map.of("message", "Banner saved.", "grid", grid));
    }
}
