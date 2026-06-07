package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    @Autowired private LoginRepository loginRepository;
    @Autowired private JdbcTemplate jdbc;

    @Value("${app.upload-dir:uploads}")
    private String uploadDir;

    // ── Auth guard ────────────────────────────────────────────────────────────

    private AuthSession authorize(String username, String token) {
        try { return loginRepository.authorize(username, token); }
        catch (JdbcLoginRepository.TokenExpiredException e) { return null; }
    }

    private boolean isAdmin(String username) {
        return loginRepository.isAdmin(username);
    }

    private ResponseEntity<String> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Forbidden: admin only");
    }

    // ── Check admin status (called from frontend to know if admin UI should show) ──

    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> getAdminStatus(
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(username, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        return ResponseEntity.ok(Map.of("isAdmin", isAdmin(username), "username", username));
    }

    // ── User list with stats ───────────────────────────────────────────────────

    @GetMapping("/users")
    public ResponseEntity<List<Map<String, Object>>> listUsers(
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        if (authorize(username, token) == null || !isAdmin(username)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        List<Map<String, Object>> users = jdbc.queryForList(
            "SELECT u.id, u.username, u.registration_date, u.is_admin, u.background_pattern, " +
            "  (SELECT COUNT(*) FROM users_posts_junctions j WHERE j.user_id=u.id) AS post_count, " +
            "  COALESCE((SELECT SUM(up.size_bytes) FROM uploads up WHERE up.user_id=u.id), 0) AS storage_bytes, " +
            "  COALESCE((SELECT SUM(octet_length(p.description)) FROM posts p INNER JOIN users_posts_junctions j ON j.post_id=p.id WHERE j.user_id=u.id), 0) AS post_bytes " +
            "FROM users u ORDER BY u.registration_date DESC");
        return ResponseEntity.ok(users);
    }

    // ── Create user ────────────────────────────────────────────────────────────

    @PostMapping("/users")
    public ResponseEntity<String> createUser(
            @RequestBody Map<String, String> body,
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        if (authorize(username, token) == null || !isAdmin(username)) return forbidden();

        String newUsername = body.get("username");
        String newPassword = body.get("password");
        if (newUsername == null || newUsername.isBlank() || newPassword == null || newPassword.isBlank())
            return ResponseEntity.badRequest().body("Username and password required.");
        if (newUsername.length() > 32 || newPassword.length() > 32)
            return ResponseEntity.badRequest().body("Username and password must be 32 chars or less.");

        try {
            jdbc.update("INSERT INTO users(username, password) VALUES(?,?)", newUsername.trim(), newPassword);
            return ResponseEntity.status(HttpStatus.CREATED).body("User created.");
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body("Username already exists.");
        }
    }

    // ── Delete user ────────────────────────────────────────────────────────────

    @DeleteMapping("/users/{targetUsername}")
    public ResponseEntity<String> deleteUser(
            @PathVariable String targetUsername,
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        if (authorize(username, token) == null || !isAdmin(username)) return forbidden();
        if (username.equals(targetUsername)) return ResponseEntity.badRequest().body("Cannot delete your own account.");

        // Verify user exists and is not an admin
        List<Boolean> adminCheck = jdbc.queryForList(
            "SELECT is_admin FROM users WHERE username=?", Boolean.class, targetUsername);
        if (adminCheck.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body("User not found.");
        if (Boolean.TRUE.equals(adminCheck.get(0))) return ResponseEntity.badRequest().body("Cannot delete an admin user.");

        // Delete uploaded files from disk
        try {
            List<String> filenames = jdbc.queryForList(
                "SELECT filename FROM uploads u INNER JOIN users usr ON usr.id=u.user_id WHERE usr.username=?",
                String.class, targetUsername);
            for (String fn : filenames) {
                Path p = Paths.get(uploadDir, fn);
                Files.deleteIfExists(p);
            }
        } catch (Exception ignored) {}

        // Delete user's posts (cascades: discussions, comments, reactions, post_uploads, notifications, junction rows)
        List<Integer> postIds = jdbc.queryForList(
            "SELECT post_id FROM users_posts_junctions WHERE user_id=(SELECT id FROM users WHERE username=?)",
            Integer.class, targetUsername);
        for (int postId : postIds) {
            jdbc.update("DELETE FROM posts WHERE id=?", postId);
        }

        // Delete user (cascades: uploads, follows, notifications, comment_votes, comment_reactions, remaining junction rows)
        int deleted = jdbc.update("DELETE FROM users WHERE username=?", targetUsername);
        if (deleted == 0) return ResponseEntity.status(HttpStatus.NOT_FOUND).body("User not found.");
        return ResponseEntity.ok("User deleted.");
    }

    // ── Set admin flag ─────────────────────────────────────────────────────────

    @PutMapping("/users/{targetUsername}/admin")
    public ResponseEntity<String> setAdmin(
            @PathVariable String targetUsername,
            @RequestBody Map<String, Boolean> body,
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        if (authorize(username, token) == null || !isAdmin(username)) return forbidden();

        boolean admin = Boolean.TRUE.equals(body.get("isAdmin"));
        jdbc.update("UPDATE users SET is_admin=? WHERE username=?", admin, targetUsername);
        return ResponseEntity.ok("Admin status updated.");
    }

    // ── Role limits ────────────────────────────────────────────────────────────

    @GetMapping("/role-limits")
    public ResponseEntity<List<Map<String, Object>>> getRoleLimits(
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        if (authorize(username, token) == null || !isAdmin(username)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        List<Map<String, Object>> limits = jdbc.queryForList("SELECT * FROM role_limits ORDER BY role");
        return ResponseEntity.ok(limits);
    }

    @PutMapping("/role-limits/{role}")
    public ResponseEntity<String> setRoleLimit(
            @PathVariable String role,
            @RequestBody Map<String, Object> body,
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        if (authorize(username, token) == null || !isAdmin(username)) return forbidden();

        Long maxStorage = body.get("maxStorageBytes") != null ? ((Number) body.get("maxStorageBytes")).longValue() : null;
        Integer maxPosts = body.get("maxPostsPerDay") != null ? ((Number) body.get("maxPostsPerDay")).intValue() : null;

        int updated = jdbc.update(
            "UPDATE role_limits SET max_storage_bytes=COALESCE(?,max_storage_bytes), max_posts_per_day=COALESCE(?,max_posts_per_day) WHERE role=?",
            maxStorage, maxPosts, role);
        if (updated == 0) return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Role not found.");
        return ResponseEntity.ok("Limits updated.");
    }

    // ── Set user role ──────────────────────────────────────────────────────────

    @PutMapping("/users/{targetUsername}/role")
    public ResponseEntity<String> setUserRole(
            @PathVariable String targetUsername,
            @RequestBody Map<String, String> body,
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        if (authorize(username, token) == null || !isAdmin(username)) return forbidden();

        String role = body.get("role");
        if (role == null || role.isBlank()) return ResponseEntity.badRequest().body("Role required.");
        List<String> validRoles = List.of("user", "trusted", "restricted", "admin");
        if (!validRoles.contains(role)) return ResponseEntity.badRequest().body("Invalid role.");

        jdbc.update("UPDATE users SET role=? WHERE username=?", role, targetUsername);
        return ResponseEntity.ok("Role updated.");
    }

    // ── Overall stats ──────────────────────────────────────────────────────────

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats(
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        if (authorize(username, token) == null || !isAdmin(username)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalUsers", jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class));
        stats.put("totalPosts", jdbc.queryForObject("SELECT COUNT(*) FROM posts", Integer.class));
        stats.put("publishedPosts", jdbc.queryForObject("SELECT COUNT(*) FROM posts WHERE published=TRUE", Integer.class));
        stats.put("totalComments", jdbc.queryForObject("SELECT COUNT(*) FROM comments", Integer.class));
        stats.put("totalUploads", jdbc.queryForObject("SELECT COUNT(*) FROM uploads", Integer.class));
        stats.put("totalStorage", jdbc.queryForObject("SELECT COALESCE(SUM(size_bytes),0) FROM uploads", Long.class));
        stats.put("totalPostBytes", jdbc.queryForObject("SELECT COALESCE(SUM(octet_length(description)),0) FROM posts", Long.class));
        return ResponseEntity.ok(stats);
    }

    // ── Flagged/suspicious users ───────────────────────────────────────────────

    @GetMapping("/flagged")
    public ResponseEntity<List<Map<String, Object>>> getFlaggedUsers(
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        if (authorize(username, token) == null || !isAdmin(username)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        // Flag users who: uploaded unusually large amount, or have very high post count, or posted many times recently
        List<Map<String, Object>> flagged = jdbc.queryForList(
            "SELECT u.username, u.registration_date, " +
            "  (SELECT COUNT(*) FROM users_posts_junctions j WHERE j.user_id=u.id) AS post_count, " +
            "  (SELECT COUNT(*) FROM posts p INNER JOIN users_posts_junctions j ON j.post_id=p.id WHERE j.user_id=u.id AND p.date > NOW() - INTERVAL '24 hours') AS posts_today, " +
            "  COALESCE((SELECT SUM(up.size_bytes) FROM uploads up WHERE up.user_id=u.id), 0) AS storage_bytes, " +
            "  (SELECT COUNT(*) FROM uploads up WHERE up.user_id=u.id) AS upload_count " +
            "FROM users u " +
            "WHERE " +
            "  (SELECT COALESCE(SUM(up.size_bytes), 0) FROM uploads up WHERE up.user_id=u.id) > 52428800 OR " +
            "  (SELECT COUNT(*) FROM posts p INNER JOIN users_posts_junctions j ON j.post_id=p.id WHERE j.user_id=u.id AND p.date > NOW() - INTERVAL '24 hours') > 20 " +
            "ORDER BY storage_bytes DESC");
        return ResponseEntity.ok(flagged);
    }

    // ── Orphan upload cleanup ──────────────────────────────────────────────────

    @DeleteMapping("/uploads/orphans")
    public ResponseEntity<Map<String, Object>> cleanupOrphanUploads(
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        if (authorize(username, token) == null || !isAdmin(username)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        // Orphans: in uploads table but not referenced by any post_uploads row,
        // and uploaded more than 1 hour ago (grace period for in-progress edits)
        List<Map<String, Object>> orphans = jdbc.queryForList(
            "SELECT id, filename FROM uploads " +
            "WHERE id NOT IN (SELECT upload_id FROM post_uploads) " +
            "AND uploaded_at < NOW() - INTERVAL '1 hour'");

        int deleted = 0;
        for (Map<String, Object> row : orphans) {
            String fn = (String) row.get("filename");
            try { Files.deleteIfExists(Paths.get(uploadDir, fn)); } catch (Exception ignored) {}
            jdbc.update("DELETE FROM uploads WHERE id=?", row.get("id"));
            deleted++;
        }
        return ResponseEntity.ok(Map.of("deleted", deleted));
    }

    // ── Storage info for a specific user ───────────────────────────────────────

    @GetMapping("/users/{targetUsername}/storage")
    public ResponseEntity<Map<String, Object>> getUserStorage(
            @PathVariable String targetUsername,
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        if (authorize(username, token) == null || !isAdmin(username)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        List<Map<String, Object>> uploads = jdbc.queryForList(
            "SELECT up.filename, up.original_name, up.size_bytes, up.uploaded_at " +
            "FROM uploads up INNER JOIN users u ON u.id=up.user_id WHERE u.username=? ORDER BY up.uploaded_at DESC",
            targetUsername);
        Long total = jdbc.queryForObject(
            "SELECT COALESCE(SUM(up.size_bytes),0) FROM uploads up INNER JOIN users u ON u.id=up.user_id WHERE u.username=?",
            Long.class, targetUsername);

        return ResponseEntity.ok(Map.of("uploads", uploads, "totalBytes", total != null ? total : 0L));
    }
}
