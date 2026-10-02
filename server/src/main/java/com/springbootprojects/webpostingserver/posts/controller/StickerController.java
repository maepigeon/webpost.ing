package com.springbootprojects.webpostingserver.posts.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.validator.GridValidator;
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
 * A user's sticker collection (V012): small named tile grids, drawn in the
 * grid editor. Public to read, owner-only to change. Packs of them are shared
 * in messages through SharedPackController.
 */
@RestController
@RequestMapping("/api")
public class StickerController {

    public static final int MAX_STICKERS = 200;
    public static final int MAX_TILES = 8;
    static final int MAX_BODY_CHARS = 800_000;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired private LoginRepository loginRepository;
    @Autowired private JdbcTemplate jdbc;

    private Integer userIdOf(String username) {
        List<Integer> ids = jdbc.queryForList("SELECT id FROM users WHERE username = ?", Integer.class, username);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private Integer ownerId(String username, String authUsername, String token) {
        if (authUsername == null || !authUsername.equals(username)) return null;
        try {
            if (loginRepository.authorize(authUsername, token) == null) return null;
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return null;
        }
        return userIdOf(username);
    }

    /** A sticker's name and grid, rebuilt from known fields, or an error message. */
    public record Sticker(String name, String grid, String error) {}

    /** Checks one {name, grid}; shared with SharedPackController so a saved pack obeys the same rules. */
    public static Sticker clean(JsonNode in) {
        String name = in.path("name").asText("").trim();
        if (name.isEmpty() || name.length() > 40) return new Sticker(null, null, "A sticker needs a name of 1–40 characters.");
        try {
            return new Sticker(name, GridValidator.normalise(in.path("grid"), MAX_TILES, MAX_TILES).toString(), null);
        } catch (GridValidator.InvalidGridException e) {
            return new Sticker(null, null, e.getMessage());
        }
    }

    private static Sticker parse(String body) {
        if (body == null || body.length() > MAX_BODY_CHARS) return new Sticker(null, null, "That sticker is too large.");
        try { return clean(MAPPER.readTree(body)); }
        catch (Exception e) { return new Sticker(null, null, "That sticker is not valid JSON."); }
    }

    static Map<String, Object> toJson(Map<String, Object> row) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", row.get("id"));
        item.put("name", row.get("name"));
        try { item.put("grid", MAPPER.readTree((String) row.get("grid"))); }
        catch (Exception e) { item.put("grid", null); }
        return item;
    }

    /** Room left in a collection, after `adding` more. */
    public static boolean hasRoom(JdbcTemplate jdbc, int userId, int adding) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM stickers WHERE user_id = ?", Integer.class, userId);
        return (count == null ? 0 : count) + adding <= MAX_STICKERS;
    }

    @GetMapping("/users/{username}/stickers")
    public ResponseEntity<?> list(@PathVariable String username) {
        Integer userId = userIdOf(username);
        if (userId == null) return ResponseEntity.notFound().build();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : jdbc.queryForList(
                "SELECT id, name, grid FROM stickers WHERE user_id = ? ORDER BY id", userId)) out.add(toJson(row));
        return ResponseEntity.ok(out);
    }

    @PostMapping("/users/{username}/stickers")
    public ResponseEntity<?> create(@PathVariable String username, @RequestBody String body,
                                    @CookieValue(name = "username", required = false) String authUsername,
                                    @CookieValue(name = "authToken", required = false) String token) {
        Integer userId = ownerId(username, authUsername, token);
        if (userId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        if (!hasRoom(jdbc, userId, 1))
            return ResponseEntity.badRequest().body(Map.of("message", "You can keep at most " + MAX_STICKERS + " stickers."));
        Sticker s = parse(body);
        if (s.error() != null) return ResponseEntity.badRequest().body(Map.of("message", s.error()));
        Integer id = jdbc.queryForObject("INSERT INTO stickers (user_id, name, grid) VALUES (?, ?, ?) RETURNING id",
                Integer.class, userId, s.name(), s.grid());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @PutMapping("/users/{username}/stickers/{id}")
    public ResponseEntity<?> update(@PathVariable String username, @PathVariable int id, @RequestBody String body,
                                    @CookieValue(name = "username", required = false) String authUsername,
                                    @CookieValue(name = "authToken", required = false) String token) {
        Integer userId = ownerId(username, authUsername, token);
        if (userId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        Sticker s = parse(body);
        if (s.error() != null) return ResponseEntity.badRequest().body(Map.of("message", s.error()));
        int n = jdbc.update("UPDATE stickers SET name = ?, grid = ?, updated_at = NOW() WHERE id = ? AND user_id = ?",
                s.name(), s.grid(), id, userId);
        return n == 0 ? ResponseEntity.notFound().build() : ResponseEntity.ok(Map.of("id", id));
    }

    @DeleteMapping("/users/{username}/stickers/{id}")
    public ResponseEntity<?> delete(@PathVariable String username, @PathVariable int id,
                                    @CookieValue(name = "username", required = false) String authUsername,
                                    @CookieValue(name = "authToken", required = false) String token) {
        Integer userId = ownerId(username, authUsername, token);
        if (userId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        int n = jdbc.update("DELETE FROM stickers WHERE id = ? AND user_id = ?", id, userId);
        return n == 0 ? ResponseEntity.notFound().build() : ResponseEntity.noContent().build();
    }
}
