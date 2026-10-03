package com.springbootprojects.webpostingserver.posts.service;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * Decides whether an account must confirm its email address before it may
 * publish or upload. Entirely off by default: it needs mail to be enabled
 * AND the admin setting {@code require_verified_email} to be true (an absent
 * row means false), so a site without a mail service behaves as before.
 * Admins are exempt. Reading, private drafts and profile edits are never
 * gated; callers apply this only to creating posts, publishing and uploads.
 */
@Service
public class PostingGate {

    public static final String MESSAGE = "Confirm your email address first (Settings → Email).";

    private final JdbcTemplate jdbc;
    private final boolean mailEnabled;
    /** Null in tests that only care about the setting; then the flag alone decides. */
    private final ObjectProvider<JavaMailSender> mailSender;

    public PostingGate(JdbcTemplate jdbc, boolean mailEnabled) {
        this(jdbc, mailEnabled, null);
    }

    /**
     * Mail counts as on only when it can really be sent, the same test
     * EmailService.isEnabled() uses. MAIL_ENABLED=true with no MAIL_HOST would
     * otherwise lock every new account out of posting with no way to confirm.
     */
    @Autowired
    public PostingGate(JdbcTemplate jdbc, @Value("${app.mail.enabled:false}") boolean mailEnabled,
                       ObjectProvider<JavaMailSender> mailSender) {
        this.jdbc = jdbc;
        this.mailEnabled = mailEnabled;
        this.mailSender = mailSender;
    }

    private boolean mailReady() {
        return mailEnabled && (mailSender == null || mailSender.getIfAvailable() != null);
    }

    /** True when this user must verify their email before the action. */
    public boolean mustVerifyFirst(int userId) {
        if (!mailReady()) return false;
        if (!settingIsTrue("require_verified_email")) return false;
        List<Map<String, Object>> rows =
                jdbc.queryForList("SELECT email_verified, is_admin FROM users WHERE id = ?", userId);
        if (rows.isEmpty()) return false;
        Map<String, Object> u = rows.get(0);
        if (Boolean.TRUE.equals(u.get("is_admin"))) return false;
        return !Boolean.TRUE.equals(u.get("email_verified"));
    }

    /** The ready 403 answer to return when {@link #mustVerifyFirst} is true. */
    public ResponseEntity<String> refusal() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(MESSAGE);
    }

    private boolean settingIsTrue(String key) {
        try {
            List<String> v = jdbc.queryForList("SELECT value FROM system_settings WHERE key = ?", String.class, key);
            return !v.isEmpty() && v.get(0) != null && "true".equalsIgnoreCase(v.get(0).trim());
        } catch (Exception e) {
            return false;
        }
    }
}
