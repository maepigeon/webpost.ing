package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.validator.ReservedUsernames;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;
import com.springbootprojects.webpostingserver.posts.validator.LoginRateLimiter;
import com.springbootprojects.webpostingserver.posts.validator.WallpaperValidator;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    @Value("${app.dev-mode:false}")
    private boolean devMode;

    @Value("${app.upload-dir:uploads}")
    private String uploadDir;

    private static final Set<String> AVATAR_EXTENSIONS = Set.of(".jpg", ".jpeg", ".png", ".gif", ".webp");
    /** What a picture may be as uploaded; it is compressed to a small square afterwards. */
    private static final long AVATAR_MAX_BYTES = 25 * 1024 * 1024;
    /** A profile picture is stored at most this many pixels on a side. */
    private static final int AVATAR_SIDE = 512;
    /** Where an image we cannot re-encode (WebP) must already fit. */
    private static final long AVATAR_UNCOMPRESSED_MAX = 2 * 1024 * 1024;

    // Registration rate limiter: IP → blocked-until epoch ms (1 attempt then 1-hour block)
    private static final java.util.concurrent.ConcurrentHashMap<String, Long> REG_BLOCK = new java.util.concurrent.ConcurrentHashMap<>();
    private static final java.util.concurrent.ConcurrentHashMap<String, long[]> REG_DAILY = new java.util.concurrent.ConcurrentHashMap<>();
    private static final int MAX_REG_PER_IP_PER_DAY = 3;
    private static final int MAX_LOGINS_PER_IP = 30;
    private static final int MAX_FAILURES_PER_ACCOUNT_ALL_IPS = 100;
    private static final long REG_BLOCK_MS      = 60 * 60 * 1000L; // 1 hour  — post-success (prevent multi-account)
    private static final long REG_BLOCK_SHORT_MS = 5 * 60 * 1000L; // 5 minutes — after bad code attempt

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
    private com.springbootprojects.webpostingserver.posts.service.StorageAccountService storageAccount;

    @Autowired
    private com.springbootprojects.webpostingserver.posts.service.ImageProcessingService imageService;

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
        String wallpaper;
        try {
            wallpaper = WallpaperValidator.normalise(pattern);
        } catch (WallpaperValidator.InvalidWallpaperException e) {
            return new ResponseEntity<>(e.getMessage(), HttpStatus.BAD_REQUEST);
        }
        loginRepository.updateUserBackground(username, wallpaper);
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
            // Ten is generous for a profile and still bounded, so the header
            // cannot be turned into a link farm.
            if (links.size() > 10) return ResponseEntity.badRequest().body("Maximum 10 links allowed.");
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
        if (body == null || body.length() > 4_000_000)
            return ResponseEntity.badRequest().body("Saved wallpapers are too large.");
        // A JSON object of name → wallpaper JSON string; each is rebuilt by
        // WallpaperValidator, and the canonical form is what gets stored.
        String canonical;
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            java.util.Map<String, String> map = mapper.readValue(body,
                    mapper.getTypeFactory().constructMapType(java.util.LinkedHashMap.class, String.class, String.class));
            if (map.size() > 40) return ResponseEntity.badRequest().body("Too many saved wallpapers (max 40).");
            java.util.Map<String, String> clean = new java.util.LinkedHashMap<>();
            for (java.util.Map.Entry<String, String> e : map.entrySet()) {
                if (e.getKey().isBlank() || e.getKey().length() > 80) return ResponseEntity.badRequest().body("Wallpaper names must be 1–80 characters.");
                String w = WallpaperValidator.normalise(e.getValue());
                if (w != null) clean.put(e.getKey(), w);
            }
            canonical = mapper.writeValueAsString(clean);
        } catch (WallpaperValidator.InvalidWallpaperException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Invalid JSON.");
        }
        loginRepository.updateUserPresets(username, canonical);
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

        int targetUserId = authUsername.equals(username) ? session.userId : social.getUserIdByUsername(username);
        if (targetUserId < 0) return ResponseEntity.notFound().build();
        Map<String, Object> usage = storageAccount.usage(targetUserId);

        // The breakdown, plus the flat figures the storage bar has always read.
        @SuppressWarnings("unchecked") Map<String, Object> sections = (Map<String, Object>) usage.get("sections");
        @SuppressWarnings("unchecked") Map<String, Object> quota = (Map<String, Object>) usage.get("quota");
        Map<String, Object> result = new LinkedHashMap<>(usage);
        result.put("uploadBytes", quota.get("usedBytes"));
        result.put("postTextBytes", ((Map<?, ?>) ((Map<?, ?>) ((Map<?, ?>) sections.get("posts")).get("items")).get("content")).get("bytes"));
        result.put("postCount", ((Map<?, ?>) ((Map<?, ?>) ((Map<?, ?>) sections.get("posts")).get("items")).get("content")).get("count"));
        result.put("role", jdbc.queryForObject("SELECT role FROM users WHERE id=?", String.class, targetUserId));
        result.put("maxStorageBytes", quota.get("limitBytes") == null ? -1L : quota.get("limitBytes"));
        try {
            result.put("maxPostsPerDay", jdbc.queryForObject(
                "SELECT rl.max_posts_per_day FROM role_limits rl JOIN users u ON rl.role = u.role WHERE u.id = ?", Integer.class, targetUserId));
        } catch (Exception ignored) {}
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

    /** Returns all users sorted by most-recently-active first. */
    @GetMapping("/users/recently-active")
    public ResponseEntity<List<Map<String, Object>>> getRecentlyActive() {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT username, last_active_at FROM users " +
            "ORDER BY last_active_at DESC NULLS LAST LIMIT 50"); // bounded: this list is public
        return ResponseEntity.ok(rows);
    }

    @PostMapping("logoutSessionAttempt")
    public ResponseEntity<String> logoutSessionAttempt(@CookieValue(name = "username") String username, @CookieValue(name = "authToken") String token, HttpServletResponse response) {
        try {
            AuthSession loginResult = loginRepository.authorize(username, token);
            if (loginResult != null) {
                loginRepository.logout(username, token);
            }
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            // Already expired: nothing to log out.
        }
        return loginRepository.deleteCookie();
    }


    /**
     * Reports whether the caller's session is still valid.
     *
     * Returns 200 with the username when it is, and **401** when it is not —
     * this used to answer 200 with an empty body, which meant the only way to
     * detect a dead session was to inspect the body, every client had to know
     * that convention, and a stale session looked like a success to anything
     * that did not. A 401 lets one interceptor handle it everywhere.
     *
     * The session cookies are cleared on the way out either way, so the browser
     * stops presenting a token that is known to be dead.
     */
    @PostMapping("/authorizeSession")
    public ResponseEntity<String> authorizeSession(
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token,
            HttpServletResponse response) {

        AuthSession loginResult = null;
        try {
            loginResult = loginRepository.authorize(username, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return loginRepository.expireCookies(HttpStatus.UNAUTHORIZED, "Session expired");
        }
        if (loginResult != null) {
            loginRepository.touchLastVisited(username);
            return ResponseEntity.ok().body(username);
        }
        return loginRepository.expireCookies(HttpStatus.UNAUTHORIZED, "Not signed in");
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

    /**
     * Changes the signed-in user's own password. They give the current one
     * (so a borrowed, still-signed-in browser cannot lock them out) and a new
     * one that meets the same rules as at sign-up. Every session of theirs is
     * then ended, this one included, so they sign in again with the new one.
     * Wrong guesses at the current password are limited like sign-in attempts.
     */
    @PutMapping("/users/{username}/password")
    public ResponseEntity<?> changeOwnPassword(
            @PathVariable("username") String username,
            @RequestBody Map<String, String> body,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token,
            HttpServletRequest request) {
        AuthSession session;
        try {
            session = loginRepository.authorize(authUsername, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            session = null;
        }
        if (session == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Sign in first."));
        if (!username.equals(authUsername))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "That is not your account."));

        // Per account and address, so a stranger cannot lock the owner out of changing it.
        String limiterKey = "password:" + username + "|" + rateKey(request.getRemoteAddr());
        if (LoginRateLimiter.isBlocked(limiterKey))
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("message", "Too many wrong attempts. Try again in 15 minutes."));

        String current = body.get("currentPassword");
        String next = body.get("newPassword");
        if (current == null || next == null)
            return ResponseEntity.badRequest().body(Map.of("message", "Give your current password and a new one."));
        if (loginRepository.authenticate(username, current) < 0) {
            LoginRateLimiter.recordFailure(limiterKey);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Your current password is not right."));
        }
        LoginRateLimiter.recordSuccess(limiterKey);
        String problem = AdminController.validatePassword(next);
        if (problem != null) return ResponseEntity.badRequest().body(Map.of("message", problem));
        if (next.equals(current))
            return ResponseEntity.badRequest().body(Map.of("message", "The new password is the same as the current one."));

        jdbc.update("UPDATE users SET password = ? WHERE username = ?",
                new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode(next), username);
        loginRepository.evictSession(username);
        log.info("Password changed by {}", username);
        return ResponseEntity.ok(Map.of("message", "Password changed. Sign in again with the new one."));
    }

    // ── Public registration (invite code required) ────────────────────────────

    @PostMapping("/register")
    public ResponseEntity<String> register(@RequestBody Map<String, String> body,
                                           HttpServletRequest request) {
        String ip = rateKey(getClientIp(request));
        boolean isLoopback;
        try {
            isLoopback = java.net.InetAddress.getByName(ip).isLoopbackAddress();
        } catch (Exception e) {
            isLoopback = ip.equals("127.0.0.1") || ip.equals("::1") || ip.startsWith("127.");
        }

        // IP rate limit: block after first failed or successful attempt for 1 hour
        // Loopback addresses are not rate-limited (local development / admin testing).
        if (!isLoopback) {
            if (REG_BLOCK.size() > 10_000) {
                long t = System.currentTimeMillis();
                REG_BLOCK.values().removeIf(until -> until <= t); // expired entries are dead weight
            }
            Long blockedUntil = REG_BLOCK.get(ip);
            if (blockedUntil != null && System.currentTimeMillis() < blockedUntil)
                return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body("Registration temporarily unavailable from this network. Please try again later.");
        }

        // Per-address daily cap on top of the global one, so one network cannot take the whole quota.
        if (!isLoopback && registeredTodayFrom(ip) >= MAX_REG_PER_IP_PER_DAY)
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
        // Profiles live at /{username}, so a name matching an application route
        // would make both that route and the profile unreachable.
        if (ReservedUsernames.isReserved(username))
            return ResponseEntity.badRequest().body("That username is reserved. Please choose another.");
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
                Integer todayCount = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM users WHERE registration_date >= CURRENT_DATE",
                    Integer.class);
                if (todayCount != null && todayCount >= limit) {
                    REG_BLOCK.put(ip, System.currentTimeMillis() + REG_BLOCK_MS);
                    return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                        .body("Registration is currently closed. Please try again tomorrow.");
                }
            }
        } catch (Exception ignored) {}

        // A name that differs from an existing one only in capitals would let
        // one account pass for another.
        Integer sameName = jdbc.queryForObject(
            "SELECT COUNT(*) FROM users WHERE LOWER(username) = LOWER(?)", Integer.class, username);
        if (sameName != null && sameName > 0)
            return ResponseEntity.status(HttpStatus.CONFLICT).body("Username already taken.");

        // Validate invite code (not expired, not used)
        List<Map<String, Object>> codeRows = jdbc.queryForList(
            "SELECT expires_at, used_by FROM invite_codes WHERE code=?", code.trim());
        if (codeRows.isEmpty()) {
            if (!isLoopback) REG_BLOCK.put(ip, System.currentTimeMillis() + REG_BLOCK_SHORT_MS);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Invalid invite code.");
        }
        if (codeRows.get(0).get("used_by") != null) {
            // Already used — not an attack, don't block
            return ResponseEntity.status(HttpStatus.GONE).body("Invite code has already been used.");
        }

        // Claim the code before making the account, in one statement, so two
        // sign-ups arriving together cannot both use it. Zero rows means it
        // was used or ran out in the meantime.
        int claimed = jdbc.update(
            "UPDATE invite_codes SET used_by=?, used_at=NOW() WHERE code=? AND used_by IS NULL "
            + "AND (expires_at IS NULL OR expires_at > NOW())", username, code.trim());
        if (claimed == 0)
            return ResponseEntity.status(HttpStatus.GONE).body("Invite code has expired or was just used.");

        // Create the user account
        org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder bcrypt =
            new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder();
        try {
            jdbc.update("INSERT INTO users(username, password, email) VALUES(?,?,?)",
                username, bcrypt.encode(password), email);
        } catch (Exception e) {
            // The name was taken after all: hand the code back.
            jdbc.update("UPDATE invite_codes SET used_by=NULL, used_at=NULL WHERE code=? AND used_by=?", code.trim(), username);
            return ResponseEntity.status(HttpStatus.CONFLICT).body("Username already taken.");
        }

        // Block the IP for 1 hour to prevent multi-account creation
        if (!isLoopback) {
            REG_BLOCK.put(ip, System.currentTimeMillis() + REG_BLOCK_MS);
            REG_DAILY.merge(ip, new long[]{java.time.LocalDate.now().toEpochDay(), 1},
                (old, one) -> old[0] == one[0] ? new long[]{old[0], old[1] + 1} : one);
        }
        return ResponseEntity.status(HttpStatus.CREATED).body("Account created. You can now log in.");
    }

    /**
     * The client's address, for rate limits.
     *
     * Never read X-Forwarded-For here: anyone can send it, and taking its first
     * entry let "X-Forwarded-For: 127.0.0.1" pass as local, which skipped the
     * sign-up limit and fooled the email limiters. server.forward-headers-strategy
     * (application.properties) makes Tomcat take the header only from a proxy on
     * this machine or a private network, nginx in production, so
     * getRemoteAddr() is already the real client.
     */
    private static int registeredTodayFrom(String key) {
        long today = java.time.LocalDate.now().toEpochDay();
        if (REG_DAILY.size() > 10_000) REG_DAILY.values().removeIf(v -> v[0] != today);
        long[] v = REG_DAILY.get(key);
        return v != null && v[0] == today ? (int) v[1] : 0;
    }

    /**
     * Key for per-address limits. IPv4 is used as is; IPv6 is cut to its /64,
     * because one subscriber normally holds a whole /64 and could otherwise
     * present 2^64 "different" addresses.
     */
    public static String rateKey(String ip) {
        if (ip == null || !ip.contains(":")) return ip; // IPv4 (or unknown): no lookup needed
        try {
            java.net.InetAddress a = java.net.InetAddress.getByName(ip);
            if (!(a instanceof java.net.Inet6Address)) return a.getHostAddress(); // IPv4-mapped
            byte[] b = a.getAddress();
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 8; i++) sb.append(String.format("%02x", b[i]));
            return sb + "::/64";
        } catch (Exception e) {
            return ip;
        }
    }

    private static String getClientIp(HttpServletRequest request) {
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
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body("That picture is over 25 MB. Try a smaller one.");

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

        // Shrink it: a profile picture is small however big the upload was.
        byte[] stored;
        try {
            stored = file.getBytes();
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to read file");
        }
        if (!imageService.isWithinPixelBudget(imageService.readDimensions(stored)))
            return ResponseEntity.badRequest().body("That picture has too many pixels. Try a smaller one.");
        var compressed = imageService.compressSquare(stored, AVATAR_SIDE);
        if (compressed != null) {
            stored = compressed.bytes();
            ext = compressed.extension();
        } else if (stored.length > AVATAR_UNCOMPRESSED_MAX) {
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body("That picture can't be shrunk here. Save it as a JPG or PNG, or use one under 2 MB.");
        }

        // Check storage quota: avatar counts like a regular upload
        int userId = jdbc.queryForObject("SELECT id FROM users WHERE username=?", Integer.class, username);
        long fileSize = stored.length;

        // Find existing avatar upload record (to subtract its size from current usage)
        List<Map<String, Object>> existingAvatarRows = jdbc.queryForList(
            "SELECT id, filename, size_bytes FROM uploads WHERE user_id=? AND filename LIKE 'avatar/%'", userId);
        long oldAvatarBytes = existingAvatarRows.stream().mapToLong(r -> ((Number) r.get("size_bytes")).longValue()).sum();

        if (!storageAccount.fitsQuota(userId, fileSize, oldAvatarBytes))
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body("Storage limit exceeded. Free up space before uploading a new avatar.");

        try {
            Path avatarDir = Paths.get(uploadDir, "avatars");
            Files.createDirectories(avatarDir);
            String filename = UUID.randomUUID() + ext;
            Files.write(avatarDir.resolve(filename), stored);
            String avatarPath = "/uploads/avatars/" + filename;
            jdbc.update("UPDATE users SET avatar_path=? WHERE username=?", avatarPath, username);

            // Replace old avatar upload record(s), then insert new one
            for (Map<String, Object> row : existingAvatarRows) {
                jdbc.update("DELETE FROM uploads WHERE id=?", row.get("id"));
                // Recorded as "avatar/<file>" but stored in the "avatars" folder;
                // resolving the recorded name directly never found the file, so
                // every replaced avatar used to stay on disk.
                String oldFile = (String) row.get("filename");
                String oldName = oldFile.substring(oldFile.lastIndexOf('/') + 1);
                try { Files.deleteIfExists(avatarDir.resolve(oldName)); } catch (Exception ignored) {}
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
        String clientIp = "loginip:" + rateKey(request.getRemoteAddr());
        String name = String.valueOf(loginInfo.getUsername()).toLowerCase();
        // Per account AND address: keyed on the account alone, any stranger could
        // lock the owner out. A looser all-address guard still bounds distributed guessing.
        String accountKey = "account:" + name + "|" + rateKey(request.getRemoteAddr());
        String globalAccountKey = "accountAll:" + name;
        if (LoginRateLimiter.isBlocked(clientIp) || LoginRateLimiter.isBlocked(accountKey)
                || LoginRateLimiter.isBlocked(globalAccountKey)) {
            return new ResponseEntity<>("Too many failed login attempts. Try again in 15 minutes.", HttpStatus.TOO_MANY_REQUESTS);
        }
        // Every attempt counts against the address, successes included, and a
        // success never resets it, so one address cannot mint sessions endlessly.
        LoginRateLimiter.recordFailure(clientIp, MAX_LOGINS_PER_IP);
        AuthSession loginResult = loginRepository.login(loginInfo);
        try {
            switch (loginResult.loginHttpStatusCodeResult) {
                case HttpStatus.FORBIDDEN:
                    LoginRateLimiter.recordFailure(accountKey);
                    LoginRateLimiter.recordFailure(globalAccountKey, MAX_FAILURES_PER_ACCOUNT_ALL_IPS);
                    return new ResponseEntity<>("Incorrect username or password.", HttpStatus.FORBIDDEN);
                case HttpStatus.OK:
                    LoginRateLimiter.recordSuccess(accountKey);
                    HttpCookie tokenCookie = ResponseCookie.from("authToken", loginResult.token)
                            .httpOnly(true)
                            .sameSite("Lax")
                            .secure(!devMode)
                            .path("/")
                            .maxAge(60 * 60 * 24)
                            .build();
                    HttpCookie usernameCookie = ResponseCookie.from("username", loginResult.username)
                            .httpOnly(true)
                            .sameSite("Lax")
                            .secure(!devMode)
                            .path("/")
                            .maxAge(60 * 60 * 24)
                            .build();
                    return ResponseEntity.ok()
                            .header(HttpHeaders.SET_COOKIE, tokenCookie.toString())
                            .header(HttpHeaders.SET_COOKIE, usernameCookie.toString())
                            .body(loginResult.username);
                default:
                    return new ResponseEntity<>("Authentication failed. Please try again.", HttpStatus.BAD_REQUEST);
            }

        } catch (Exception e) {
            log.error("Login failed with an unexpected error", e);
            return new ResponseEntity<>(null, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

}
