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

    private static Object parseOrNull(String json) {
        try { return ThemeValidator.parse(json); } catch (Exception e) { return null; }
    }
}
