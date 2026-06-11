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
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class AuthController {

    @Value("${app.dev-mode:false}")
    private boolean devMode;

    @Value("${app.upload-dir:uploads}")
    private String uploadDir;

    private static final Set<String> AVATAR_EXTENSIONS = Set.of(".jpg", ".jpeg", ".png", ".gif", ".webp");
    private static final long AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

    // Registration rate limiter: IP → blocked-until epoch ms (1 attempt then 1-hour block)
    private static final java.util.concurrent.ConcurrentHashMap<String, Long> REG_BLOCK = new java.util.concurrent.ConcurrentHashMap<>();
    private static final long REG_BLOCK_MS = 60 * 60 * 1000L; // 1 hour

    private static boolean hasValidImageMagicBytes(byte[] h) {
        if (h.length < 4) return false;
        if ((h[0] & 0xFF) == 0xFF && (h[1] & 0xFF) == 0xD8 && (h[2] & 0xFF) == 0xFF) return true;
        if ((h[0] & 0xFF) == 0x89 && h[1] == 'P' && h[2] == 'N' && h[3] == 'G') return true;
        if (h[0] == 'G' && h[1] == 'I' && h[2] == 'F' && h[3] == '8') return true;
        if (h.length >= 12 && h[0] == 'R' && h[1] == 'I' && h[2] == 'F' && h[3] == 'F'
                && h[8] == 'W' && h[9] == 'E' && h[10] == 'B' && h[11] == 'P') return true;
        return false;
    }

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
        // Strip HTML tags to prevent stored XSS (React also escapes on render, this is defense-in-depth)
        String stripped = bio == null ? "" : bio.replaceAll("<[^>]*>", "").trim();
        if (stripped.length() > 500) return new ResponseEntity<>("Bio must be 500 characters or less", HttpStatus.BAD_REQUEST);
        loginRepository.updateUserBio(username, stripped.isBlank() ? null : stripped);
        return ResponseEntity.ok("Bio updated");
    }

    /** Returns a user's bio links (public). */
    @GetMapping("/users/{username}/bio-links")
    public ResponseEntity<String> getUserBioLinks(@PathVariable("username") String username) {
        String links = loginRepository.getUserBioLinks(username);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .body(links != null ? links : "[]");
    }

    /** Updates the authenticated user's own bio links. Up to 3 links, each label max 50 chars, URL max 500 chars. */
    @PutMapping("/users/{username}/bio-links")
    public ResponseEntity<String> updateUserBioLinks(
            @PathVariable("username") String username,
            @RequestBody String body,
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
        if (body == null || body.length() > 5000)
            return ResponseEntity.badRequest().body("Payload too large.");
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            java.util.List<java.util.Map<String, String>> links = mapper.readValue(body,
                    mapper.getTypeFactory().constructCollectionType(java.util.List.class,
                            mapper.getTypeFactory().constructMapType(java.util.Map.class, String.class, String.class)));
            if (links.size() > 3) return ResponseEntity.badRequest().body("Maximum 3 links allowed.");
            for (java.util.Map<String, String> link : links) {
                String url = link.get("url");
                String label = link.getOrDefault("label", "");
                if (url == null || url.isBlank()) return ResponseEntity.badRequest().body("Each link must have a URL.");
                if (url.length() > 500) return ResponseEntity.badRequest().body("URL too long (max 500 chars).");
                if (label.length() > 50) return ResponseEntity.badRequest().body("Label too long (max 50 chars).");
                if (!url.startsWith("http://") && !url.startsWith("https://"))
                    return ResponseEntity.badRequest().body("URLs must start with http:// or https://");
            }
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Invalid JSON.");
        }
        loginRepository.updateUserBioLinks(username, body);
        return ResponseEntity.ok("Bio links updated.");
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
        result.put("posts", social.getUserActivityPosts(targetUserId, 200));
        result.put("comments", social.getUserActivityComments(targetUserId, 200));
        result.put("reactions", social.getUserActivityPostReactions(targetUserId, 200));
        result.put("commentReactions", social.getUserActivityCommentReactions(targetUserId, 200));
        result.put("uploads", social.getUserActivityUploads(targetUserId, 200));
        result.put("deletions", social.getUserActivityDeletions(targetUserId, 100));
        return ResponseEntity.ok(result);
    }

    /** Downloads the authenticated user's full data as a JSON file. Admins can export any user. */
    @GetMapping("/users/{username}/export")
    public ResponseEntity<byte[]> exportUserData(
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

        try {
            Map<String, Object> exportData = social.buildUserExport(username, targetUserId);
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            mapper.registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule());
            byte[] json = mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(exportData);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + username + "_data.json\"");
            return new ResponseEntity<>(json, headers, HttpStatus.OK);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
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

    // ── Public registration (invite code required) ────────────────────────────

    @PostMapping("/register")
    public ResponseEntity<String> register(@RequestBody Map<String, String> body,
                                           HttpServletRequest request) {
        String ip = getClientIp(request);

        // IP rate limit: block after first failed or successful attempt for 1 hour
        Long blockedUntil = REG_BLOCK.get(ip);
        if (blockedUntil != null && System.currentTimeMillis() < blockedUntil)
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body("Registration temporarily unavailable from this network. Please try again later.");

        String username  = body.get("username");
        String password  = body.get("password");
        String email     = body.get("email");
        String code      = body.get("inviteCode");

        if (username == null || username.isBlank()) return ResponseEntity.badRequest().body("Username required.");
        if (password == null || password.isBlank()) return ResponseEntity.badRequest().body("Password required.");
        if (email    == null || email.isBlank())    return ResponseEntity.badRequest().body("Email required.");
        if (code     == null || code.isBlank())     return ResponseEntity.badRequest().body("Invite code required.");

        username = username.trim();
        email    = email.trim().toLowerCase();

        if (username.length() < 3 || username.length() > 32)
            return ResponseEntity.badRequest().body("Username must be 3–32 characters.");
        if (!username.matches("[A-Za-z0-9_\\-]+"))
            return ResponseEntity.badRequest().body("Username may only contain letters, numbers, underscores, and hyphens.");
        if (email.length() > 255 || !email.contains("@"))
            return ResponseEntity.badRequest().body("Invalid email address.");

        String pwErr = AdminController.validatePassword(password);
        if (pwErr != null) return ResponseEntity.badRequest().body(pwErr);

        // Check daily registration limit
        try {
            String limitStr = jdbc.queryForObject(
                "SELECT value FROM system_settings WHERE key='max_daily_registrations'", String.class);
            int limit = limitStr != null ? Integer.parseInt(limitStr.trim()) : 5;
            if (limit >= 0) {
                int todayCount = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM users WHERE registration_date >= CURRENT_DATE",
                    Integer.class);
                if (todayCount != null && todayCount >= limit) {
                    REG_BLOCK.put(ip, System.currentTimeMillis() + REG_BLOCK_MS);
                    return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                        .body("Registration is currently closed. Please try again tomorrow.");
                }
            }
        } catch (Exception ignored) {}

        // Validate invite code (not expired, not used)
        List<Map<String, Object>> codeRows = jdbc.queryForList(
            "SELECT expires_at, used_by FROM invite_codes WHERE code=?", code.trim());
        if (codeRows.isEmpty()) {
            REG_BLOCK.put(ip, System.currentTimeMillis() + REG_BLOCK_MS);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Invalid invite code.");
        }
        Map<String, Object> codeRow = codeRows.get(0);
        if (codeRow.get("used_by") != null) {
            REG_BLOCK.put(ip, System.currentTimeMillis() + REG_BLOCK_MS);
            return ResponseEntity.status(HttpStatus.GONE).body("Invite code has already been used.");
        }
        try {
            java.time.OffsetDateTime expiresAt = (java.time.OffsetDateTime) codeRow.get("expires_at");
            if (expiresAt != null && expiresAt.isBefore(java.time.OffsetDateTime.now())) {
                REG_BLOCK.put(ip, System.currentTimeMillis() + REG_BLOCK_MS);
                return ResponseEntity.status(HttpStatus.GONE).body("Invite code has expired.");
            }
        } catch (Exception ignored) {}

        // Create the user account
        org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder bcrypt =
            new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder();
        try {
            jdbc.update("INSERT INTO users(username, password, email) VALUES(?,?,?)",
                username, bcrypt.encode(password), email);
        } catch (Exception e) {
            REG_BLOCK.put(ip, System.currentTimeMillis() + REG_BLOCK_MS);
            return ResponseEntity.status(HttpStatus.CONFLICT).body("Username already taken.");
        }

        // Mark code as used, then block IP for 1 hour to prevent multi-account creation
        jdbc.update("UPDATE invite_codes SET used_by=?, used_at=NOW() WHERE code=?", username, code.trim());
        REG_BLOCK.put(ip, System.currentTimeMillis() + REG_BLOCK_MS);
        return ResponseEntity.status(HttpStatus.CREATED).body("Account created. You can now log in.");
    }

    private static String getClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        return request.getRemoteAddr();
    }

    // ── Avatar ────────────────────────────────────────────────────────────────

    @GetMapping("/users/{username}/avatar")
    public ResponseEntity<Map<String, Object>> getAvatar(@PathVariable String username) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT avatar_path FROM users WHERE username=?", username);
        if (rows.isEmpty()) return ResponseEntity.notFound().build();
        String path = (String) rows.get(0).get("avatar_path");
        return ResponseEntity.ok(Map.of("avatarPath", path != null ? path : ""));
    }

    @PostMapping("/users/{username}/avatar")
    public ResponseEntity<String> uploadAvatar(
            @PathVariable String username,
            @RequestParam("file") MultipartFile file,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        if (!authUsername.equals(username))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Forbidden");
        try { if (loginRepository.authorize(authUsername, token) == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized");
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Session expired");
        }

        if (file.isEmpty()) return ResponseEntity.badRequest().body("No file provided");
        if (file.getSize() > AVATAR_MAX_BYTES)
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body("Avatar must be under 2 MB");

        String original = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase() : "";
        String ext = original.contains(".") ? original.substring(original.lastIndexOf('.')) : "";
        if (!AVATAR_EXTENSIONS.contains(ext))
            return ResponseEntity.badRequest().body("Only jpg, png, gif, or webp allowed");

        try (InputStream is = file.getInputStream()) {
            byte[] header = is.readNBytes(12);
            if (!hasValidImageMagicBytes(header))
                return ResponseEntity.badRequest().body("File content does not match an allowed image format");
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to read file");
        }

        // Check storage quota: avatar counts like a regular upload
        int userId = jdbc.queryForObject("SELECT id FROM users WHERE username=?", Integer.class, username);
        long fileSize = file.getSize();

        // Find existing avatar upload record (to subtract its size from current usage)
        List<Map<String, Object>> existingAvatarRows = jdbc.queryForList(
            "SELECT id, filename, size_bytes FROM uploads WHERE user_id=? AND filename LIKE 'avatar/%'", userId);
        long oldAvatarBytes = existingAvatarRows.stream().mapToLong(r -> ((Number) r.get("size_bytes")).longValue()).sum();

        String role = jdbc.queryForObject("SELECT role FROM users WHERE id=?", String.class, userId);
        Long maxBytes = null;
        try {
            maxBytes = jdbc.queryForObject("SELECT max_storage_bytes FROM role_limits WHERE role=?", Long.class, role);
        } catch (Exception ignored) {}
        if (maxBytes != null && maxBytes >= 0) {
            Long currentUsed = jdbc.queryForObject(
                "SELECT COALESCE(SUM(size_bytes),0) FROM uploads WHERE user_id=?", Long.class, userId);
            if (currentUsed == null) currentUsed = 0L;
            long effectiveUsed = currentUsed - oldAvatarBytes + fileSize;
            if (effectiveUsed > maxBytes)
                return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                    .body("Storage limit exceeded. Free up space before uploading a new avatar.");
        }

        try {
            Path avatarDir = Paths.get(uploadDir, "avatars");
            Files.createDirectories(avatarDir);
            String filename = UUID.randomUUID() + ext;
            Files.copy(file.getInputStream(), avatarDir.resolve(filename));
            String avatarPath = "/uploads/avatars/" + filename;
            jdbc.update("UPDATE users SET avatar_path=? WHERE username=?", avatarPath, username);

            // Replace old avatar upload record(s), then insert new one
            for (Map<String, Object> row : existingAvatarRows) {
                jdbc.update("DELETE FROM uploads WHERE id=?", row.get("id"));
                String oldFile = (String) row.get("filename"); // e.g. "avatar/<uuid>.jpg"
                try { Files.deleteIfExists(Paths.get(uploadDir, oldFile.replace("/", java.io.File.separator))); } catch (Exception ignored) {}
            }
            jdbc.update(
                "INSERT INTO uploads(filename, user_id, original_name, size_bytes) VALUES(?,?,?,?)",
                "avatar/" + filename, userId, file.getOriginalFilename(), fileSize);

            return ResponseEntity.ok(avatarPath);
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to store avatar");
        }
    }

    // ── Online / heartbeat ────────────────────────────────────────────────────

    @PostMapping("/users/{username}/heartbeat")
    public ResponseEntity<String> heartbeat(
            @PathVariable String username,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        if (!authUsername.equals(username)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        try { loginRepository.authorize(authUsername, token); }
        catch (JdbcLoginRepository.TokenExpiredException e) { return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build(); }
        jdbc.update("UPDATE users SET last_active_at=NOW() WHERE username=?", username);
        return ResponseEntity.ok("ok");
    }

    @GetMapping("/users/{username}/online")
    public ResponseEntity<Map<String, Object>> getOnlineStatus(@PathVariable String username) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT last_active_at FROM users WHERE username=?", username);
        if (rows.isEmpty()) return ResponseEntity.notFound().build();
        Object lastActive = rows.get(0).get("last_active_at");
        boolean online = false;
        String lastSeen = null;
        if (lastActive instanceof java.time.OffsetDateTime ts) {
            online = ts.isAfter(java.time.OffsetDateTime.now().minusMinutes(5));
            lastSeen = ts.toString();
        }
        return ResponseEntity.ok(Map.of("online", online, "lastSeen", lastSeen != null ? lastSeen : ""));
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
