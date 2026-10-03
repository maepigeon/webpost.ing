package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.service.EmailService;
import com.springbootprojects.webpostingserver.posts.service.EmailTokenService;
import com.springbootprojects.webpostingserver.posts.validator.WallpaperValidator;
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
import java.util.Set;
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

    /**
     * Per-key send budget over an hour and a day, in memory. The IP limits above
     * do nothing against an attacker with many IPs or accounts who aims every
     * mail at one victim, so the budget is also counted per recipient address
     * and per account. The map is bounded: expired timestamps are dropped on use
     * and the whole map is swept when it grows large.
     */
    public static final class SendBudget {
        private static final long HOUR = 60 * 60 * 1000L, DAY = 24 * HOUR;
        private static final int MAX_KEYS = 50_000;
        private final int perHour, perDay;
        private final java.util.Map<String, java.util.ArrayDeque<Long>> hits = new java.util.HashMap<>();

        public SendBudget(int perHour, int perDay) { this.perHour = perHour; this.perDay = perDay; }

        /** True if one more send is allowed now. Does not record it. */
        public synchronized boolean allows(String key) { return allows(key, System.currentTimeMillis()); }

        public synchronized boolean allows(String key, long now) {
            java.util.ArrayDeque<Long> q = hits.get(key);
            if (q == null) return true;
            while (!q.isEmpty() && now - q.peekFirst() > DAY) q.pollFirst();
            if (q.size() >= perDay) return false;
            int lastHour = 0;
            for (long t : q) if (now - t <= HOUR) lastHour++;
            return lastHour < perHour;
        }

        public synchronized void record(String key) { record(key, System.currentTimeMillis()); }

        public synchronized void record(String key, long now) {
            if (hits.size() >= MAX_KEYS) {
                hits.values().removeIf(d -> d.isEmpty() || now - d.peekLast() > DAY);
                if (hits.size() >= MAX_KEYS) hits.clear();   // still full of live keys: fail open rather than grow
            }
            hits.computeIfAbsent(key, k -> new java.util.ArrayDeque<>()).addLast(now);
        }
    }

    /** Mail to one address, whatever asked for it: 3 an hour, 6 a day. */
    public static final SendBudget RECIPIENT_BUDGET = new SendBudget(3, 6);
    /** Verification requests by one account: 5 an hour. */
    public static final SendBudget ACCOUNT_BUDGET = new SendBudget(5, 50);

    private static String recipientKey(String email) { return email.trim().toLowerCase(java.util.Locale.ROOT); }

    /** Checks both budgets and, only if both allow, spends from both. */
    private static synchronized boolean takeVerificationSlot(int userId, String email) {
        String rk = recipientKey(email), ak = "u:" + userId;
        if (!RECIPIENT_BUDGET.allows(rk) || !ACCOUNT_BUDGET.allows(ak)) return false;
        RECIPIENT_BUDGET.record(rk);
        ACCOUNT_BUDGET.record(ak);
        return true;
    }

    private static final String VERIFY_BUDGET_MSG = "Too many verification emails for that address or account. Try again later.";

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
    private static String clientIp(HttpServletRequest request) {
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
                "SELECT email, email_verified, site_background, background_pattern, pattern_presets, " +
                "code_font, code_font_size FROM users WHERE id = ?", userId);

        boolean verified = Boolean.TRUE.equals(user.get("email_verified"));

        Map<String, Object> body = new LinkedHashMap<>();
        // Only a confirmed address is ever reported as the account's email. An
        // unconfirmed one is reported separately as pending, so the UI cannot
        // put a tick beside an address nobody has proved they own.
        body.put("email", verified ? user.get("email") : null);
        body.put("emailVerified", verified);
        body.put("pendingEmail", tokenService.pendingEmailFor(userId));
        // The site-wide background, plus the two sources a user can pick from:
        // their own profile wallpaper and their saved preset library.
        body.put("siteBackground", user.get("site_background"));
        body.put("profileBackground", user.get("background_pattern"));
        body.put("presets", user.get("pattern_presets") == null ? "{}" : user.get("pattern_presets"));
        body.put("codeFont", user.get("code_font"));
        body.put("codeFontSize", user.get("code_font_size"));
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
        if (!takeVerificationSlot(userId, email))
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("message", VERIFY_BUDGET_MSG));

        // The address is NOT written to the account here. It lives only on the
        // token until the person who owns it clicks the link.
        //
        // Writing it immediately let anyone put someone else's address on their
        // own account: that address then received a confirmation mail, and
        // another every time "resend" was pressed. Holding it here means an
        // address only reaches an account whose owner proved they can read it,
        // and an unwilling recipient gets exactly one message.
        EmailTokenService.IssuedToken issued =
                tokenService.issue(userId, email, EmailTokenService.PURPOSE_VERIFY);
        emailService.sendVerification(email, username, issued.plaintext());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("email", currentEmailOf(userId));   // unchanged until confirmed
        response.put("pendingEmail", email);
        response.put("emailVerified", false);
        response.put("message", emailService.isEnabled()
                ? "Check " + email + " for a confirmation link. The address joins your account once you confirm it."
                : "Email sending is switched off on this server, so this address cannot be confirmed yet.");
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

        // The address being confirmed lives on the outstanding token, not on the
        // account — see setEmail for why.
        String email = tokenService.pendingEmailFor(userId);
        if (email == null)
            return ResponseEntity.badRequest().body(Map.of("message",
                    "No address is waiting to be confirmed. Enter one above."));
        if (!takeVerificationSlot(userId, email))
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("message", VERIFY_BUDGET_MSG));

        EmailTokenService.IssuedToken issued =
                tokenService.issue(userId, email, EmailTokenService.PURPOSE_VERIFY);
        emailService.sendVerification(email, username, issued.plaintext());
        return ResponseEntity.ok(Map.of("message", "Confirmation email sent to " + email + "."));
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

        // This is where the address is written to the account: the click is the
        // proof that whoever reads that inbox agreed to it.
        jdbc.update("""
                UPDATE users SET email = ?, email_verified = TRUE, email_verified_at = NOW()
                 WHERE id = ?
                """, result.email(), result.userId());

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

        // Per recipient, shared with verification mail so one address cannot be
        // flooded by mixing the two. Counted whether or not the address is
        // registered, and a limited request gets the SAME reply as any other,
        // so this cannot be used to probe addresses.
        synchronized (EmailSettingsController.class) {
            String rk = recipientKey(email);
            if (!RECIPIENT_BUDGET.allows(rk)) return ResponseEntity.ok(alwaysTheSame);
            RECIPIENT_BUDGET.record(rk);
        }

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
        // The same rules as signing up: a reset used to accept any 8 characters,
        // so it was a way round them. Checked before the token is spent, so a
        // rejected password leaves the link usable.
        String pwErr = AdminController.validatePassword(newPassword);
        if (pwErr != null) return ResponseEntity.badRequest().body(Map.of("message", pwErr));

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

    // ── Site-wide background ──────────────────────────────────────────────────

    /**
     * Sets the background shown to this user across the site.
     *
     * Applies only to its owner and only outside profiles and posts — those
     * belong to whoever wrote them and keep showing their wallpaper. Sending an
     * empty value clears it.
     *
     * The pattern goes through the same validator as a profile wallpaper, since
     * it reaches CSS by the same route.
     */
    @PutMapping("/users/{username}/settings/site-background")
    public ResponseEntity<?> setSiteBackground(
            @PathVariable String username,
            @RequestBody Map<String, String> body,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!username.equals(authUsername)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        String pattern;
        try {
            pattern = WallpaperValidator.normalise(body.getOrDefault("background", ""));
        } catch (WallpaperValidator.InvalidWallpaperException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }

        Integer userId = userIdOf(username);
        if (userId == null) return ResponseEntity.notFound().build();

        jdbc.update("UPDATE users SET site_background = ? WHERE id = ?", pattern, userId);

        return ResponseEntity.ok(Map.of(
                "siteBackground", pattern == null ? "" : pattern,
                "message", pattern == null ? "Site background cleared." : "Site background saved."));
    }

    // ── Code block display ────────────────────────────────────────────────────

    /** Monospace families offered for code blocks, as an allowlist. */
    private static final Set<String> CODE_FONTS = Set.of(
            "default", "system", "jetbrains", "fira", "ibm-plex", "source-code",
            "courier", "menlo", "consolas");

    /**
     * How this reader sees code blocks, across every post they read.
     *
     * A reading preference rather than a publishing one: the author chose the
     * code, the reader chooses how comfortably to read it.
     */
    @PutMapping("/users/{username}/settings/code-display")
    public ResponseEntity<?> updateCodeDisplay(
            @PathVariable String username,
            @RequestBody Map<String, Object> body,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!username.equals(authUsername)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        Integer userId = userIdOf(username);
        if (userId == null) return ResponseEntity.notFound().build();

        Object fontValue = body.get("codeFont");
        if (fontValue instanceof String font) {
            if (!CODE_FONTS.contains(font))
                return ResponseEntity.badRequest().body(Map.of("message", "Unknown font."));
            jdbc.update("UPDATE users SET code_font = ? WHERE id = ?", font, userId);
        }

        Object sizeValue = body.get("codeFontSize");
        if (sizeValue instanceof Number size) {
            int px = size.intValue();
            if (px < 10 || px > 24)
                return ResponseEntity.badRequest().body(Map.of("message", "Size must be between 10 and 24."));
            jdbc.update("UPDATE users SET code_font_size = ? WHERE id = ?", px, userId);
        }

        Map<String, Object> row = jdbc.queryForMap(
                "SELECT code_font, code_font_size FROM users WHERE id = ?", userId);
        return ResponseEntity.ok(Map.of(
                "codeFont", row.get("code_font"),
                "codeFontSize", row.get("code_font_size"),
                "message", "Saved."));
    }

    /** The address currently on the account, or "" when none is confirmed. */
    private String currentEmailOf(int userId) {
        List<String> rows = jdbc.queryForList(
                "SELECT email FROM users WHERE id = ? AND email_verified = TRUE", String.class, userId);
        return rows.isEmpty() || rows.get(0) == null ? "" : rows.get(0);
    }
}
