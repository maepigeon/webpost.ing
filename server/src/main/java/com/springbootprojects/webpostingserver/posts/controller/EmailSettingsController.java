package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.service.EmailService;
import com.springbootprojects.webpostingserver.posts.service.EmailTokenService;
import com.springbootprojects.webpostingserver.posts.validator.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * User settings: email address, verification, notification preferences, and the
 * email-verified password reset.
 *
 * All of it is optional. With mail switched off the endpoints still work — an
 * address can be saved, preferences can be changed — but no message is sent and
 * verification cannot complete, which the responses say plainly rather than
 * failing silently.
 */
@RestController
@RequestMapping("/api")
public class EmailSettingsController {

    private static final Logger log = LoggerFactory.getLogger(EmailSettingsController.class);

    /**
     * Deliberately permissive. Validating email addresses by pattern is a losing
     * game — the authoritative check is whether the verification mail arrives,
     * which is exactly what this feature does. This only catches typos.
     */
    private static final Pattern EMAIL_SHAPE =
            Pattern.compile("^[^@\\s]+@[^@\\s.]+\\.[^@\\s]+$");

    private static final BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder();

    /**
     * Sending mail costs money and sender reputation, and an unthrottled
     * endpoint that emails an arbitrary address is a spam relay. Three per
     * quarter-hour per IP, with a matching lockout.
     */
    private static final RateLimiter VERIFY_LIMITER =
            new RateLimiter(3, 15 * 60 * 1000L, 15 * 60 * 1000L);
    private static final RateLimiter RESET_LIMITER =
            new RateLimiter(3, 15 * 60 * 1000L, 15 * 60 * 1000L);

    @Autowired private LoginRepository loginRepository;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private EmailService emailService;
    @Autowired private EmailTokenService tokenService;

    // ── Auth guard ────────────────────────────────────────────────────────────

    private AuthSession authorize(String username, String token) {
        try { return loginRepository.authorize(username, token); }
        catch (JdbcLoginRepository.TokenExpiredException e) { return null; }
    }

    private Integer userIdOf(String username) {
        List<Integer> ids = jdbc.queryForList("SELECT id FROM users WHERE username = ?", Integer.class, username);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) return forwarded.split(",")[0].trim();
        return request.getRemoteAddr();
    }

    // ── Settings ──────────────────────────────────────────────────────────────

    /** Everything the settings page needs, in one request. */
    @GetMapping("/users/{username}/settings")
    public ResponseEntity<?> getSettings(
            @PathVariable String username,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        // Settings are private to their owner. Not even admins read them here —
        // there is no reason for the admin panel to see someone's inbox
        // preferences, and the narrower rule is the easier one to keep right.
        if (!username.equals(authUsername)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        Integer userId = userIdOf(username);
        if (userId == null) return ResponseEntity.notFound().build();

        Map<String, Object> user = jdbc.queryForMap(
                "SELECT email, email_verified FROM users WHERE id = ?", userId);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("email", user.get("email"));
        body.put("emailVerified", Boolean.TRUE.equals(user.get("email_verified")));
        body.put("mailEnabled", emailService.isEnabled());
        body.put("preferences", preferencesFor(userId));
        return ResponseEntity.ok(body);
    }

    /** Reads a user's preferences, creating the row with defaults on first access. */
    private Map<String, Object> preferencesFor(int userId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT enabled, on_direct_message, on_new_follower, on_followed_post, on_post_published " +
                "FROM email_preferences WHERE user_id = ?", userId);
        if (rows.isEmpty()) {
            jdbc.update("INSERT INTO email_preferences (user_id) VALUES (?) ON CONFLICT DO NOTHING", userId);
            rows = jdbc.queryForList(
                    "SELECT enabled, on_direct_message, on_new_follower, on_followed_post, on_post_published " +
                    "FROM email_preferences WHERE user_id = ?", userId);
        }
        Map<String, Object> row = rows.get(0);
        Map<String, Object> prefs = new LinkedHashMap<>();
        prefs.put("enabled",         row.get("enabled"));
        prefs.put("onDirectMessage", row.get("on_direct_message"));
        prefs.put("onNewFollower",   row.get("on_new_follower"));
        prefs.put("onFollowedPost",  row.get("on_followed_post"));
        prefs.put("onPostPublished", row.get("on_post_published"));
        return prefs;
    }

    @PutMapping("/users/{username}/settings/preferences")
    public ResponseEntity<?> updatePreferences(
            @PathVariable String username,
            @RequestBody Map<String, Object> body,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!username.equals(authUsername)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        Integer userId = userIdOf(username);
        if (userId == null) return ResponseEntity.notFound().build();

        // Absent keys keep their current value, so a partial update is safe.
        jdbc.update("INSERT INTO email_preferences (user_id) VALUES (?) ON CONFLICT DO NOTHING", userId);
        jdbc.update("""
                UPDATE email_preferences SET
                    enabled           = COALESCE(?, enabled),
                    on_direct_message = COALESCE(?, on_direct_message),
                    on_new_follower   = COALESCE(?, on_new_follower),
                    on_followed_post  = COALESCE(?, on_followed_post),
                    on_post_published = COALESCE(?, on_post_published),
                    updated_at        = NOW()
                WHERE user_id = ?
                """,
                boolOrNull(body.get("enabled")),
                boolOrNull(body.get("onDirectMessage")),
                boolOrNull(body.get("onNewFollower")),
                boolOrNull(body.get("onFollowedPost")),
                boolOrNull(body.get("onPostPublished")),
                userId);

        return ResponseEntity.ok(preferencesFor(userId));
    }

    private static Boolean boolOrNull(Object v) {
        return (v instanceof Boolean b) ? b : null;
    }

    // ── Address and verification ──────────────────────────────────────────────

    /**
     * Sets or changes the address and sends a verification mail.
     *
     * Changing the address always clears the verified flag: the new one has not
     * been proven, and leaving it set would let someone point a verified account
     * at an address they do not control.
     */
    @PutMapping("/users/{username}/settings/email")
    public ResponseEntity<?> setEmail(
            @PathVariable String username,
            @RequestBody Map<String, String> body,
            HttpServletRequest request,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!username.equals(authUsername)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        String email = body.getOrDefault("email", "").trim();
        if (email.isEmpty()) {
            // Clearing the address is a legitimate way to opt out entirely.
            Integer userId = userIdOf(username);
            if (userId == null) return ResponseEntity.notFound().build();
            jdbc.update("UPDATE users SET email = NULL, email_verified = FALSE, email_verified_at = NULL WHERE id = ?", userId);
            return ResponseEntity.ok(Map.of("email", "", "emailVerified", false, "message", "Email address removed."));
        }

        if (email.length() > 255 || !EMAIL_SHAPE.matcher(email).matches())
            return ResponseEntity.badRequest().body(Map.of("message", "That does not look like an email address."));

        if (VERIFY_LIMITER.isBlocked(clientIp(request)))
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("message", "Too many verification emails. Try again in a few minutes."));

        Integer userId = userIdOf(username);
        if (userId == null) return ResponseEntity.notFound().build();
        VERIFY_LIMITER.recordUse(clientIp(request));

        jdbc.update("UPDATE users SET email = ?, email_verified = FALSE, email_verified_at = NULL WHERE id = ?",
                email, userId);

        EmailTokenService.IssuedToken issued =
                tokenService.issue(userId, email, EmailTokenService.PURPOSE_VERIFY);
        emailService.sendVerification(email, username, issued.plaintext());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("email", email);
        response.put("emailVerified", false);
        response.put("message", emailService.isEnabled()
                ? "Check your inbox for a confirmation link."
                : "Address saved. Email sending is switched off on this server, so it cannot be verified yet.");
        return ResponseEntity.ok(response);
    }

    /** Resends the verification mail for an address already on file. */
    @PostMapping("/users/{username}/settings/email/resend")
    public ResponseEntity<?> resendVerification(
            @PathVariable String username,
            HttpServletRequest request,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!username.equals(authUsername)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        if (VERIFY_LIMITER.isBlocked(clientIp(request)))
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("message", "Too many verification emails. Try again in a few minutes."));

        Integer userId = userIdOf(username);
        if (userId == null) return ResponseEntity.notFound().build();
        VERIFY_LIMITER.recordUse(clientIp(request));

        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT email, email_verified FROM users WHERE id = ?", userId);
        String email = (String) rows.get(0).get("email");
        if (email == null || email.isBlank())
            return ResponseEntity.badRequest().body(Map.of("message", "No email address on file."));
        if (Boolean.TRUE.equals(rows.get(0).get("email_verified")))
            return ResponseEntity.ok(Map.of("message", "That address is already confirmed."));

        EmailTokenService.IssuedToken issued =
                tokenService.issue(userId, email, EmailTokenService.PURPOSE_VERIFY);
        emailService.sendVerification(email, username, issued.plaintext());
        return ResponseEntity.ok(Map.of("message", "Confirmation email sent."));
    }

    /**
     * Confirms an address. Public by necessity — the link is opened from an
     * inbox, quite possibly in a browser with no session. The token is the
     * credential.
     */
    @PostMapping("/email/verify")
    public ResponseEntity<?> verifyEmail(@RequestBody Map<String, String> body) {
        EmailTokenService.Redemption result =
                tokenService.redeem(body.get("token"), EmailTokenService.PURPOSE_VERIFY);

        if (!result.valid())
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "This confirmation link is " + result.reason() + "."));

        // Confirm against the address the token was issued for. If the user has
        // since changed it, an older link must not verify the new address.
        int updated = jdbc.update("""
                UPDATE users SET email_verified = TRUE, email_verified_at = NOW()
                 WHERE id = ? AND email = ?
                """, result.userId(), result.email());

        if (updated == 0)
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "This link was for a different address. Request a new one from Settings."));

        return ResponseEntity.ok(Map.of("message", "Email confirmed. Notifications are on."));
    }

    // ── One-click unsubscribe ─────────────────────────────────────────────────

    /**
     * Turns notifications off from a link in an email. Public and idempotent:
     * it must work without a session, and it can only ever disable things.
     */
    @PostMapping("/email/unsubscribe")
    public ResponseEntity<?> unsubscribe(@RequestBody Map<String, String> body) {
        String token = body.getOrDefault("token", "");
        String category = body.getOrDefault("category", "all");
        if (token.isBlank()) return ResponseEntity.badRequest().body(Map.of("message", "Missing token."));

        List<Integer> ids = jdbc.queryForList(
                "SELECT id FROM users WHERE unsubscribe_token = ?", Integer.class, token);
        if (ids.isEmpty())
            return ResponseEntity.badRequest().body(Map.of("message", "This unsubscribe link is not valid."));

        int userId = ids.get(0);
        jdbc.update("INSERT INTO email_preferences (user_id) VALUES (?) ON CONFLICT DO NOTHING", userId);

        String column = switch (category) {
            case "messages"  -> "on_direct_message";
            case "followers" -> "on_new_follower";
            case "posts"     -> "on_followed_post";
            // Anything unrecognised falls back to the master switch. Erring
            // towards unsubscribing from more is the right side to be on.
            default          -> "enabled";
        };
        boolean silencedEverything = column.equals("enabled");

        // The column name comes from the switch above, never from the request,
        // so the category string can never reach the SQL.
        jdbc.update("UPDATE email_preferences SET " + column + " = FALSE, updated_at = NOW() WHERE user_id = ?", userId);

        log.info("User {} unsubscribed from {}", userId, column);
        return ResponseEntity.ok(Map.of(
                "message", silencedEverything
                        ? "Unsubscribed. You will not receive any more notification emails."
                        : "Unsubscribed from those notifications."));
    }

    // ── Password reset by email ───────────────────────────────────────────────

    /**
     * Starts a reset. Always reports success, whatever the address: telling a
     * caller whether an address is registered turns this into an account
     * enumeration oracle.
     */
    @PostMapping("/password/forgot")
    public ResponseEntity<?> forgotPassword(@RequestBody Map<String, String> body, HttpServletRequest request) {
        String email = body.getOrDefault("email", "").trim();
        Map<String, String> alwaysTheSame = Map.of("message",
                "If that address belongs to a confirmed account, a reset link is on its way.");

        if (email.isEmpty()) return ResponseEntity.ok(alwaysTheSame);
        if (RESET_LIMITER.isBlocked(clientIp(request)))
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("message", "Too many reset requests. Try again in a few minutes."));
        RESET_LIMITER.recordUse(clientIp(request));

        // Only confirmed addresses. Otherwise anyone could put someone else's
        // address on their own account and use this to mail them reset links.
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, username FROM users WHERE email = ? AND email_verified = TRUE", email);

        if (!rows.isEmpty()) {
            int userId = (Integer) rows.get(0).get("id");
            String username = (String) rows.get(0).get("username");
            EmailTokenService.IssuedToken issued =
                    tokenService.issue(userId, email, EmailTokenService.PURPOSE_RESET);
            emailService.sendPasswordReset(email, username, issued.plaintext());
        }
        return ResponseEntity.ok(alwaysTheSame);
    }

    /** Completes a reset and ends every existing session for that account. */
    @PostMapping("/password/reset")
    public ResponseEntity<?> resetPassword(@RequestBody Map<String, String> body) {
        String newPassword = body.getOrDefault("password", "");
        if (newPassword.length() < 8)
            return ResponseEntity.badRequest().body(Map.of("message", "Password must be at least 8 characters."));
        if (newPassword.length() > 200)
            return ResponseEntity.badRequest().body(Map.of("message", "That password is too long."));

        EmailTokenService.Redemption result =
                tokenService.redeem(body.get("token"), EmailTokenService.PURPOSE_RESET);
        if (!result.valid())
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "This reset link is " + result.reason() + "."));

        List<String> names = jdbc.queryForList(
                "SELECT username FROM users WHERE id = ?", String.class, result.userId());
        if (names.isEmpty()) return ResponseEntity.badRequest().body(Map.of("message", "Account not found."));

        jdbc.update("UPDATE users SET password = ? WHERE id = ?",
                bcrypt.encode(newPassword), result.userId());

        // Whoever reset the password may be locking an intruder out, so every
        // session — including any the attacker holds — has to end.
        loginRepository.evictSession(names.get(0));

        log.info("Password reset completed for user {}", result.userId());
        return ResponseEntity.ok(Map.of("message", "Password changed. Sign in with your new password."));
    }
}
