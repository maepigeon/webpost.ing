package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.validator.RateLimiter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Reporting a post, and the admin queue that reports land in.
 */
@RestController
@RequestMapping("/api")
public class ReportController {

    private static final Logger log = LoggerFactory.getLogger(ReportController.class);

    /** Closed set — a free-text reason would be unsortable and unactionable. */
    private static final Set<String> REASONS = Set.of(
            "spam", "harassment", "hate", "violence", "sexual", "self-harm",
            "misinformation", "copyright", "other");

    /** Ten reports an hour per user. Enough for genuine use, not for flooding. */
    private static final RateLimiter REPORT_LIMITER =
            new RateLimiter(10, 60 * 60 * 1000L, 60 * 60 * 1000L);

    @Autowired private LoginRepository loginRepository;
    @Autowired private JdbcTemplate jdbc;

    private AuthSession authorize(String username, String token) {
        try { return loginRepository.authorize(username, token); }
        catch (JdbcLoginRepository.TokenExpiredException e) { return null; }
    }

    private boolean isAdmin(String username) {
        return loginRepository.isAdmin(username);
    }

    // ── Reporting ─────────────────────────────────────────────────────────────

    /**
     * Reports a post. Sign-in required: anonymous reporting is impossible to
     * rate-limit meaningfully and trivial to abuse.
     */
    @PostMapping("/posts/{postId}/report")
    public ResponseEntity<?> reportPost(
            @PathVariable long postId,
            @RequestBody Map<String, String> body,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token) {

        AuthSession session = authorize(username, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("message", "Sign in to report a post."));

        String reason = body.getOrDefault("reason", "").trim().toLowerCase();
        if (!REASONS.contains(reason))
            return ResponseEntity.badRequest().body(Map.of("message", "Choose a reason."));

        String details = body.getOrDefault("details", "").trim();
        if (details.length() > 1000) details = details.substring(0, 1000);

        List<Integer> exists = jdbc.queryForList(
                "SELECT id FROM posts WHERE id = ?", Integer.class, postId);
        if (exists.isEmpty()) return ResponseEntity.notFound().build();

        String key = String.valueOf(session.userId);
        if (REPORT_LIMITER.isBlocked(key))
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("message", "You have reported a lot recently. Try again later."));

        try {
            jdbc.update("""
                    INSERT INTO post_reports (post_id, reporter_id, reason, details)
                    VALUES (?, ?, ?, ?)
                    """, postId, session.userId, reason, details.isEmpty() ? null : details);
        } catch (DuplicateKeyException e) {
            // The unique index did its job. Reporting twice is not an error from
            // the reporter's point of view, so this reads as success.
            return ResponseEntity.ok(Map.of("message", "You have already reported this post."));
        }

        REPORT_LIMITER.recordUse(key);
        log.info("Post {} reported by user {} for {}", postId, session.userId, reason);
        return ResponseEntity.ok(Map.of("message", "Thanks — this has been sent to the moderators."));
    }

    // ── Admin queue ───────────────────────────────────────────────────────────

    @GetMapping("/admin/reports")
    public ResponseEntity<?> listReports(
            @RequestParam(defaultValue = "open") String status,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token) {

        if (authorize(username, token) == null || !isAdmin(username))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        // Whitelisted, never interpolated from the request.
        String filter = switch (status) {
            case "resolved"  -> "resolved";
            case "dismissed" -> "dismissed";
            case "all"       -> null;
            default          -> "open";
        };

        String sql = """
                SELECT r.id, r.post_id, r.reason, r.details, r.status,
                       r.resolved_by, r.resolved_at, r.created_at,
                       COALESCE(u.username, '[deleted]') AS reporter,
                       p.title AS post_title,
                       COALESCE(a.username, '[unknown]') AS post_author
                  FROM post_reports r
                  LEFT JOIN users u ON u.id = r.reporter_id
                  LEFT JOIN posts p ON p.id = r.post_id
                  LEFT JOIN users_posts_junctions j ON j.post_id = r.post_id
                  LEFT JOIN users a ON a.id = j.user_id
                 %s
                 ORDER BY r.created_at DESC
                 LIMIT 200
                """.formatted(filter == null ? "" : "WHERE r.status = ?");

        List<Map<String, Object>> rows = filter == null
                ? jdbc.queryForList(sql)
                : jdbc.queryForList(sql, filter);

        return ResponseEntity.ok(Map.of(
                "reports", rows,
                "openCount", jdbc.queryForObject(
                        "SELECT COUNT(*) FROM post_reports WHERE status = 'open'", Integer.class)));
    }

    /** Marks a report resolved or dismissed. */
    @PutMapping("/admin/reports/{reportId}")
    public ResponseEntity<?> updateReport(
            @PathVariable long reportId,
            @RequestBody Map<String, String> body,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token) {

        if (authorize(username, token) == null || !isAdmin(username))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        String status = body.getOrDefault("status", "").trim();
        if (!status.equals("resolved") && !status.equals("dismissed") && !status.equals("open"))
            return ResponseEntity.badRequest().body(Map.of("message", "Unknown status."));

        int updated = jdbc.update("""
                UPDATE post_reports
                   SET status = ?,
                       resolved_by = CASE WHEN ? = 'open' THEN NULL ELSE ? END,
                       resolved_at = CASE WHEN ? = 'open' THEN NULL ELSE NOW() END
                 WHERE id = ?
                """, status, status, username, status, reportId);

        if (updated == 0) return ResponseEntity.notFound().build();
        log.info("Report {} marked {} by {}", reportId, status, username);
        return ResponseEntity.ok(Map.of("message", "Report updated."));
    }
}
