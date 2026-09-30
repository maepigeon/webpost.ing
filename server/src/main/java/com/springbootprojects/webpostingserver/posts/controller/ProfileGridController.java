package com.springbootprojects.webpostingserver.posts.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.validator.GridValidator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.web.bind.annotation.*;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Tile grids posted straight onto a profile, shown under the header card in
 * the owner's order. Public to read; only the owner can change them.
 */
@RestController
@RequestMapping("/api")
public class ProfileGridController {

    /** How many grids one profile can hold. */
    static final int MAX_GRIDS = 24;
    /** Largest single grid, as stored JSON. */
    static final int MAX_GRID_CHARS = 3_000_000;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired private LoginRepository loginRepository;
    @Autowired private JdbcTemplate jdbc;

    private AuthSession authorize(String username, String token) {
        try { return loginRepository.authorize(username, token); }
        catch (JdbcLoginRepository.TokenExpiredException e) { return null; }
    }

    private Integer userIdOf(String username) {
        List<Integer> ids = jdbc.queryForList("SELECT id FROM users WHERE username = ?", Integer.class, username);
        return ids.isEmpty() ? null : ids.get(0);
    }

    /** The owner's user id, or null when the caller is not signed in as that user. */
    private Integer ownerId(String username, String authUsername, String token) {
        if (authUsername == null || !authUsername.equals(username)) return null;
        if (authorize(authUsername, token) == null) return null;
        return userIdOf(username);
    }

    /** Rebuilds a grid from known fields, or throws with a reason a person can act on. */
    private static String clean(String body) throws GridValidator.InvalidGridException {
        if (body == null || body.isBlank()) throw new GridValidator.InvalidGridException("The grid is empty.");
        if (body.length() > MAX_GRID_CHARS) throw new GridValidator.InvalidGridException("That grid is too large to save.");
        JsonNode in;
        try { in = MAPPER.readTree(body); }
        catch (Exception e) { throw new GridValidator.InvalidGridException("That grid is not valid JSON."); }
        return GridValidator.normalise(in, 64, 48).toString();
    }

    @GetMapping("/users/{username}/grids")
    public ResponseEntity<?> list(@PathVariable String username) {
        Integer userId = userIdOf(username);
        if (userId == null) return ResponseEntity.notFound().build();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : jdbc.queryForList(
                "SELECT id, grid FROM profile_grids WHERE user_id = ? ORDER BY sort_order, id", userId)) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.get("id"));
            try { item.put("grid", MAPPER.readTree((String) row.get("grid"))); }
            catch (Exception e) { continue; }
            out.add(item);
        }
        return ResponseEntity.ok(out);
    }

    @PostMapping("/users/{username}/grids")
    public ResponseEntity<?> create(@PathVariable String username, @RequestBody String body,
                                    @CookieValue(name = "username", required = false) String authUsername,
                                    @CookieValue(name = "authToken", required = false) String token) {
        Integer userId = ownerId(username, authUsername, token);
        if (userId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM profile_grids WHERE user_id = ?", Integer.class, userId);
        if (count != null && count >= MAX_GRIDS)
            return ResponseEntity.badRequest().body(Map.of("message", "A profile can hold at most " + MAX_GRIDS + " grids."));
        String grid;
        try { grid = clean(body); }
        catch (GridValidator.InvalidGridException e) { return ResponseEntity.badRequest().body(Map.of("message", e.getMessage())); }

        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO profile_grids (user_id, sort_order, grid) VALUES (?, "
                    + "(SELECT COALESCE(MAX(sort_order), -1) + 1 FROM profile_grids WHERE user_id = ?), ?)",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, userId);
            ps.setInt(2, userId);
            ps.setString(3, grid);
            return ps;
        }, keys);
        Object id = keys.getKeys() != null ? keys.getKeys().get("id") : null;
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @PutMapping("/users/{username}/grids/{id}")
    public ResponseEntity<?> update(@PathVariable String username, @PathVariable int id, @RequestBody String body,
                                    @CookieValue(name = "username", required = false) String authUsername,
                                    @CookieValue(name = "authToken", required = false) String token) {
        Integer userId = ownerId(username, authUsername, token);
        if (userId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        String grid;
        try { grid = clean(body); }
        catch (GridValidator.InvalidGridException e) { return ResponseEntity.badRequest().body(Map.of("message", e.getMessage())); }
        int n = jdbc.update("UPDATE profile_grids SET grid = ?, updated_at = NOW() WHERE id = ? AND user_id = ?", grid, id, userId);
        return n == 0 ? ResponseEntity.notFound().build() : ResponseEntity.ok(Map.of("id", id));
    }

    @DeleteMapping("/users/{username}/grids/{id}")
    public ResponseEntity<?> delete(@PathVariable String username, @PathVariable int id,
                                    @CookieValue(name = "username", required = false) String authUsername,
                                    @CookieValue(name = "authToken", required = false) String token) {
        Integer userId = ownerId(username, authUsername, token);
        if (userId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        int n = jdbc.update("DELETE FROM profile_grids WHERE id = ? AND user_id = ?", id, userId);
        return n == 0 ? ResponseEntity.notFound().build() : ResponseEntity.noContent().build();
    }

    /** Body: the grid ids in their new order. Ids that are not the owner's are ignored. */
    @PutMapping("/users/{username}/grids/order")
    public ResponseEntity<?> reorder(@PathVariable String username, @RequestBody List<Integer> ids,
                                     @CookieValue(name = "username", required = false) String authUsername,
                                     @CookieValue(name = "authToken", required = false) String token) {
        Integer userId = ownerId(username, authUsername, token);
        if (userId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        if (ids == null || ids.size() > MAX_GRIDS) return ResponseEntity.badRequest().build();
        for (int i = 0; i < ids.size(); i++) {
            jdbc.update("UPDATE profile_grids SET sort_order = ? WHERE id = ? AND user_id = ?", i, ids.get(i), userId);
        }
        return ResponseEntity.noContent().build();
    }
}
