package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.model.User;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;
import com.springbootprojects.webpostingserver.posts.validator.LoginRateLimiter;
import com.springbootprojects.webpostingserver.posts.validator.PatternValidator;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class AuthController {

    @Value("${app.dev-mode:false}")
    private boolean devMode;

    @Autowired
    LoginRepository loginRepository;

    @Autowired
    SocialRepository social;

    @Autowired
    JdbcTemplate jdbc;

    /** Returns the background pattern for a user's profile page (public). */
    @GetMapping("/users/{username}/background")
    public ResponseEntity<String> getUserBackground(@PathVariable("username") String username) {
        String pattern = loginRepository.getUserBackground(username);
        return ResponseEntity.ok(pattern != null ? pattern : "");
    }

    /** Updates the background pattern for the authenticated user's own profile. */
    @PutMapping("/users/{username}/background")
    public ResponseEntity<String> updateUserBackground(
            @PathVariable("username") String username,
            @RequestBody String pattern,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {
        if (!authUsername.equals(username)) {
            return new ResponseEntity<>("Forbidden", HttpStatus.FORBIDDEN);
        }
        AuthSession session;
        try {
            session = loginRepository.authorize(authUsername, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return loginRepository.deleteCookie();
        }
        if (session == null) {
            return new ResponseEntity<>("Unauthorized", HttpStatus.UNAUTHORIZED);
        }
        String trimmed = pattern == null ? "" : pattern.trim();
        if (!PatternValidator.isValid(trimmed)) {
            return new ResponseEntity<>("Invalid background pattern", HttpStatus.BAD_REQUEST);
        }
        loginRepository.updateUserBackground(username, trimmed.isBlank() ? null : trimmed);
        return ResponseEntity.ok("Background updated");
    }

    /** Returns a user's bio (public). */
    @GetMapping("/users/{username}/bio")
    public ResponseEntity<String> getUserBio(@PathVariable("username") String username) {
        String bio = loginRepository.getUserBio(username);
        return ResponseEntity.ok(bio != null ? bio : "");
    }

    /** Updates the authenticated user's own bio. Max 500 chars, no HTML. */
    @PutMapping("/users/{username}/bio")
    public ResponseEntity<String> updateUserBio(
            @PathVariable("username") String username,
            @RequestBody String bio,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {
        if (!authUsername.equals(username)) return new ResponseEntity<>("Forbidden", HttpStatus.FORBIDDEN);
        AuthSession session;
        try {
            session = loginRepository.authorize(authUsername, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return loginRepository.deleteCookie();
        }
        if (session == null) return new ResponseEntity<>("Unauthorized", HttpStatus.UNAUTHORIZED);
        String trimmed = bio == null ? "" : bio.trim();
        if (trimmed.length() > 500) return new ResponseEntity<>("Bio must be 500 characters or less", HttpStatus.BAD_REQUEST);
        loginRepository.updateUserBio(username, trimmed.isBlank() ? null : trimmed);
        return ResponseEntity.ok("Bio updated");
    }

    /** Returns the authenticated user's saved pattern presets as JSON. */
    @GetMapping("/users/{username}/presets")
    public ResponseEntity<String> getUserPresets(
            @PathVariable("username") String username,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {
        if (!authUsername.equals(username)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        AuthSession session;
        try {
            session = loginRepository.authorize(authUsername, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        String presets = loginRepository.getUserPresets(username);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .body(presets != null ? presets : "{}");
    }

    /** Saves the authenticated user's pattern presets. Values must be valid patterns. */
    @PutMapping("/users/{username}/presets")
    public ResponseEntity<String> updateUserPresets(
            @PathVariable("username") String username,
            @RequestBody String body,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {
        if (!authUsername.equals(username)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        AuthSession session;
        try {
            session = loginRepository.authorize(authUsername, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (body == null || body.length() > 50_000)
            return ResponseEntity.badRequest().body("Presets payload too large.");
        // Validate: must be a JSON object with string values that pass PatternValidator
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            java.util.Map<String, String> map = mapper.readValue(body,
                    mapper.getTypeFactory().constructMapType(java.util.Map.class, String.class, String.class));
            if (map.size() > 200) return ResponseEntity.badRequest().body("Too many presets (max 200).");
            for (java.util.Map.Entry<String, String> e : map.entrySet()) {
                if (e.getKey().length() > 80) return ResponseEntity.badRequest().body("Preset name too long.");
                if (!PatternValidator.isValid(e.getValue()))
                    return ResponseEntity.badRequest().body("Invalid pattern value for preset: " + e.getKey());
            }
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Invalid JSON.");
        }
        loginRepository.updateUserPresets(username, body);
        return ResponseEntity.ok("Presets saved.");
    }

    /** Returns storage summary for a user. Accessible by the owner or an admin. */
    @GetMapping("/users/{username}/storage")
    public ResponseEntity<Map<String, Object>> getUserStorage(
            @PathVariable("username") String username,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {
        AuthSession session;
        try {
            session = loginRepository.authorize(authUsername, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        if (!authUsername.equals(username)) {
            Boolean isAdmin = jdbc.queryForObject("SELECT is_admin FROM users WHERE username=?", Boolean.class, authUsername);
            if (!Boolean.TRUE.equals(isAdmin)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        Long uploadBytes = jdbc.queryForObject(
            "SELECT COALESCE(SUM(up.size_bytes),0) FROM uploads up INNER JOIN users u ON u.id=up.user_id WHERE u.username=?",
            Long.class, username);
        Integer uploadCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM uploads up INNER JOIN users u ON u.id=up.user_id WHERE u.username=?",
            Integer.class, username);
        Long postTextBytes = jdbc.queryForObject(
            "SELECT COALESCE(SUM(octet_length(p.description)),0) FROM posts p INNER JOIN users_posts_junctions j ON j.post_id=p.id INNER JOIN users u ON u.id=j.user_id WHERE u.username=?",
            Long.class, username);
        Integer postCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM users_posts_junctions j INNER JOIN users u ON u.id=j.user_id WHERE u.username=?",
            Integer.class, username);

        // Per-role limits
        String role = jdbc.queryForObject("SELECT role FROM users WHERE username=?", String.class, username);
        Map<String, Object> limits = null;
        try {
            limits = jdbc.queryForMap("SELECT max_storage_bytes, max_posts_per_day FROM role_limits WHERE role=?", role);
        } catch (Exception ignored) {}

        int targetUserId = authUsername.equals(username) ? session.userId : social.getUserIdByUsername(username);
        long notificationBytes = targetUserId > 0 ? social.getNotificationStorageBytes(targetUserId) : 0;
        long commentBytes = targetUserId > 0 ? social.getUserCommentStorageBytes(targetUserId) : 0;
        long presetsBytes = loginRepository.getPresetsStorageBytes(username);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("uploadBytes", uploadBytes != null ? uploadBytes : 0L);
        result.put("uploadCount", uploadCount != null ? uploadCount : 0);
        result.put("postTextBytes", postTextBytes != null ? postTextBytes : 0L);
        result.put("postCount", postCount != null ? postCount : 0);
        result.put("notificationBytes", notificationBytes);
        result.put("commentBytes", commentBytes);
        result.put("presetsBytes", presetsBytes);
        result.put("role", role);
        if (limits != null) {
            result.put("maxStorageBytes", limits.get("max_storage_bytes"));
            result.put("maxPostsPerDay", limits.get("max_posts_per_day"));
        }
        return ResponseEntity.ok(result);
    }

    /** Case-insensitive username search. Returns up to 20 matching usernames. */
    @GetMapping("/search/users")
    public ResponseEntity<List<String>> searchUsers(@RequestParam(defaultValue = "") String q) {
        if (q.isBlank() || q.length() > 50) return ResponseEntity.ok(List.of());
        return ResponseEntity.ok(social.searchUsers(q.trim(), 20));
    }

    /** Returns follower and following counts for a user (public). */
    @GetMapping("/users/{username}/follow-counts")
    public ResponseEntity<Map<String, Integer>> getFollowCounts(@PathVariable String username) {
        int uid = social.getUserIdByUsername(username);
        if (uid < 0) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(social.getFollowCounts(uid));
    }

    /** Returns activity (comments + reactions) for a user. Accessible by the owner or an admin. */
    @GetMapping("/users/{username}/activity")
    public ResponseEntity<Map<String, Object>> getUserActivity(
            @PathVariable String username,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {
        AuthSession session;
        try {
            session = loginRepository.authorize(authUsername, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        if (!authUsername.equals(username)) {
            Boolean isAdmin = jdbc.queryForObject("SELECT is_admin FROM users WHERE username=?", Boolean.class, authUsername);
            if (!Boolean.TRUE.equals(isAdmin)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        int targetUserId = authUsername.equals(username) ? session.userId : social.getUserIdByUsername(username);
        if (targetUserId < 0) return ResponseEntity.notFound().build();

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("comments", social.getUserActivityComments(targetUserId, 100));
        result.put("postReactions", social.getUserActivityPostReactions(targetUserId, 100));
        result.put("commentReactions", social.getUserActivityCommentReactions(targetUserId, 100));
        result.put("uploads", social.getUserActivityUploads(targetUserId, 200));
        result.put("deletions", social.getUserActivityDeletions(targetUserId, 100));
        return ResponseEntity.ok(result);
    }

    @GetMapping("getAllUsers")
    public ResponseEntity<List<User>> getAllUsers() {
        System.out.println("getAllUsers: " + loginRepository.getAllUsers().toString());
        return new ResponseEntity<>(loginRepository.getAllUsers(), HttpStatus.OK);
    }

    @PostMapping("logoutSessionAttempt")
    public ResponseEntity<String> logoutSessionAttempt(@CookieValue(name = "username") String username, @CookieValue(name = "authToken") String token, HttpServletResponse response) {
        try {
            AuthSession loginResult = loginRepository.authorize(username, token);
            if (loginResult != null) {
                loginRepository.logout(username, token);
            }
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            System.out.println(e.getMessage());
        }
        return loginRepository.deleteCookie();
    }


    @PostMapping("/authorizeSession")
    public ResponseEntity<String> authorizeSession(@CookieValue(name = "username") String username, @CookieValue(name = "authToken") String token, HttpServletResponse response) {
        AuthSession loginResult = null;
        try {
            loginResult = loginRepository.authorize(username, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            System.out.println(e.getMessage());
            // Delete the cookie by setting maxAge to 0
            return loginRepository.deleteCookie();
        }
        if (loginResult != null) {
            loginRepository.touchLastVisited(username);
            return ResponseEntity.ok().body(username);
        } else {
            return loginRepository.deleteCookie();
        }
    }


    /** Permanently deletes a user account. Admin-only — use the admin dashboard. */
    @DeleteMapping("/users/{username}")
    public ResponseEntity<String> deleteAccount(
            @PathVariable("username") String username,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {
        AuthSession session;
        try {
            session = loginRepository.authorize(authUsername, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return loginRepository.deleteCookie();
        }
        if (session == null) return new ResponseEntity<>("Unauthorized", HttpStatus.UNAUTHORIZED);
        Boolean isAdmin = jdbc.queryForObject("SELECT is_admin FROM users WHERE username=?", Boolean.class, authUsername);
        if (!Boolean.TRUE.equals(isAdmin)) return new ResponseEntity<>("Forbidden", HttpStatus.FORBIDDEN);
        loginRepository.deleteUser(username);
        return ResponseEntity.ok("User deleted.");
    }

    @PostMapping("/loginSessionAttempt")
    public ResponseEntity<String> loginSessionAttempt(@RequestBody LoginInfo loginInfo, HttpServletRequest request, HttpServletResponse response) {
        String clientIp = request.getRemoteAddr();
        if (LoginRateLimiter.isBlocked(clientIp)) {
            return new ResponseEntity<>("Too many failed login attempts. Try again in 15 minutes.", HttpStatus.TOO_MANY_REQUESTS);
        }
        System.out.println("Attempting to login user");
	AuthSession loginResult = loginRepository.login(loginInfo);
        try {
            switch (loginResult.loginHttpStatusCodeResult) {
                case HttpStatus.FORBIDDEN:
		    System.out.println("Failed to authenticate, error 403");
                    LoginRateLimiter.recordFailure(clientIp);
                    return new ResponseEntity<>("Failed to authenticate: Incorrect login information, loginResult: ." + loginResult, HttpStatus.FORBIDDEN);
   		case HttpStatus.OK:
                    System.out.println("AUTHENTICATION OK!! : Logging in user: " + loginInfo.getUsername());
                    LoginRateLimiter.recordSuccess(clientIp);
                    HttpCookie tokenCookie = ResponseCookie.from("authToken", loginResult.token)
                            .httpOnly(true)
                            .sameSite(devMode ? "Lax" : "None")
                            .secure(!devMode)
                            .path("/")
                            .maxAge(60 * 60 * 24)
                            .build();
                    HttpCookie usernameCookie = ResponseCookie.from("username", loginResult.username)
                            .httpOnly(true)
                            .sameSite(devMode ? "Lax" : "None")
                            .secure(!devMode)
                            .path("/")
                            .maxAge(60 * 60 * 24)
                            .build();
                    System.out.println("AUTHENTICATION OK!! : Logging in user: " + loginResult.username);
                    return ResponseEntity.ok()
                            .header(HttpHeaders.SET_COOKIE, tokenCookie.toString())
                            .header(HttpHeaders.SET_COOKIE, usernameCookie.toString())
                            .body(loginResult.username);
                default:
		    System.out.println("Failed to authenticate, bad request");
                    return new ResponseEntity<>("Failed to authenticate:  Bad request, loginResult: " + loginResult, HttpStatus.BAD_REQUEST);
            }

        } catch (Exception e) {
            System.out.println("Internal server error (500): " + e.toString());
            return new ResponseEntity<>(null, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

}
