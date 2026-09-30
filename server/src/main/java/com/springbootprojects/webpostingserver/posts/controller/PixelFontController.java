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
 * Pixel font libraries: a user's own named sets of custom characters, made in
 * the grid editor's character designer and reusable in any grid. A grid copies
 * the characters it uses, so a post never depends on a library that might be
 * edited or deleted later. Public to read, owner-only to change.
 */
@RestController
@RequestMapping("/api")
public class PixelFontController {

    static final int MAX_FONTS = 20;
    static final int MAX_GLYPHS = 1024;
    static final int MAX_BODY_CHARS = 200_000;

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

    /** {name, glyphs} rebuilt from known fields, or an error message. */
    private record Font(String name, String glyphs, String error) {}

    private static Font parse(String body) {
        if (body == null || body.length() > MAX_BODY_CHARS) return new Font(null, null, "That font is too large.");
        JsonNode in;
        try { in = MAPPER.readTree(body); } catch (Exception e) { return new Font(null, null, "That font is not valid JSON."); }
        String name = in.path("name").asText("").trim();
        if (name.isEmpty() || name.length() > 40) return new Font(null, null, "A font needs a name of 1–40 characters.");
        return new Font(name, GridValidator.cleanGlyphs(in.path("glyphs"), MAX_GLYPHS).toString(), null);
    }

    @GetMapping("/users/{username}/fonts")
    public ResponseEntity<?> list(@PathVariable String username) {
        Integer userId = userIdOf(username);
        if (userId == null) return ResponseEntity.notFound().build();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : jdbc.queryForList(
                "SELECT id, name, glyphs FROM pixel_fonts WHERE user_id = ? ORDER BY lower(name), id", userId)) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.get("id"));
            item.put("name", row.get("name"));
            try { item.put("glyphs", MAPPER.readTree((String) row.get("glyphs"))); }
            catch (Exception e) { item.put("glyphs", MAPPER.createObjectNode()); }
            out.add(item);
        }
        return ResponseEntity.ok(out);
    }

    @PostMapping("/users/{username}/fonts")
    public ResponseEntity<?> create(@PathVariable String username, @RequestBody String body,
                                    @CookieValue(name = "username", required = false) String authUsername,
                                    @CookieValue(name = "authToken", required = false) String token) {
        Integer userId = ownerId(username, authUsername, token);
        if (userId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM pixel_fonts WHERE user_id = ?", Integer.class, userId);
        if (count != null && count >= MAX_FONTS)
            return ResponseEntity.badRequest().body(Map.of("message", "You can keep at most " + MAX_FONTS + " fonts."));
        Font font = parse(body);
        if (font.error() != null) return ResponseEntity.badRequest().body(Map.of("message", font.error()));
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO pixel_fonts (user_id, name, glyphs) VALUES (?, ?, ?)", Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, userId);
            ps.setString(2, font.name());
            ps.setString(3, font.glyphs());
            return ps;
        }, keys);
        Object id = keys.getKeys() != null ? keys.getKeys().get("id") : null;
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @PutMapping("/users/{username}/fonts/{id}")
    public ResponseEntity<?> update(@PathVariable String username, @PathVariable int id, @RequestBody String body,
                                    @CookieValue(name = "username", required = false) String authUsername,
                                    @CookieValue(name = "authToken", required = false) String token) {
        Integer userId = ownerId(username, authUsername, token);
        if (userId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        Font font = parse(body);
        if (font.error() != null) return ResponseEntity.badRequest().body(Map.of("message", font.error()));
        int n = jdbc.update("UPDATE pixel_fonts SET name = ?, glyphs = ?, updated_at = NOW() WHERE id = ? AND user_id = ?",
                font.name(), font.glyphs(), id, userId);
        return n == 0 ? ResponseEntity.notFound().build() : ResponseEntity.ok(Map.of("id", id));
    }

    @DeleteMapping("/users/{username}/fonts/{id}")
    public ResponseEntity<?> delete(@PathVariable String username, @PathVariable int id,
                                    @CookieValue(name = "username", required = false) String authUsername,
                                    @CookieValue(name = "authToken", required = false) String token) {
        Integer userId = ownerId(username, authUsername, token);
        if (userId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        int n = jdbc.update("DELETE FROM pixel_fonts WHERE id = ? AND user_id = ?", id, userId);
        return n == 0 ? ResponseEntity.notFound().build() : ResponseEntity.noContent().build();
    }
}
