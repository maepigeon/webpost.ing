package com.springbootprojects.webpostingserver.posts.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Map;

/**
 * Issues and redeems the single-use tokens behind email verification and
 * password reset.
 *
 * Only a SHA-256 hash of each token is stored. The plaintext exists just long
 * enough to be put in an email, so a leaked database yields no working links —
 * the same reasoning that applies to password hashing. SHA-256 rather than
 * BCrypt is right here because the token is 256 bits of SecureRandom output,
 * not a guessable human secret: there is nothing to brute-force, and lookups
 * need to be indexed.
 */
@Service
public class EmailTokenService {

    private static final Logger log = LoggerFactory.getLogger(EmailTokenService.class);

    public static final String PURPOSE_VERIFY = "verify_email";
    public static final String PURPOSE_RESET  = "password_reset";

    /** Verification is not urgent; a day is comfortable for a person's inbox. */
    private static final long VERIFY_TTL_HOURS = 24;

    /** A reset link is a live credential, so it expires quickly. */
    private static final long RESET_TTL_HOURS = 1;

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();

    private final JdbcTemplate jdbc;

    public EmailTokenService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** A token as issued: the plaintext to email, and nothing else retained. */
    public record IssuedToken(String plaintext, Instant expiresAt) {}

    /** The outcome of redeeming a token. */
    public record Redemption(boolean valid, Integer userId, String email, String reason) {
        static Redemption invalid(String reason) { return new Redemption(false, null, null, reason); }
        static Redemption ok(int userId, String email) { return new Redemption(true, userId, email, null); }
    }

    public static String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(64);
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandated by the platform; unreachable.
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    /** 256 bits of randomness, URL-safe so it survives being pasted from an email. */
    private static String newToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return ENCODER.encodeToString(bytes);
    }

    /**
     * Issues a token, invalidating any earlier unused one for the same user and
     * purpose so only the most recent link works. Without that, an address
     * changed after a first request would still be confirmable by the older
     * link sent to the previous address.
     */
    public IssuedToken issue(int userId, String email, String purpose) {
        jdbc.update("DELETE FROM email_tokens WHERE user_id = ? AND purpose = ? AND used_at IS NULL",
                userId, purpose);
        // Opportunistic cleanup, so expired rows do not accumulate forever.
        jdbc.update("DELETE FROM email_tokens WHERE expires_at < NOW() - INTERVAL '30 days'");

        String plaintext = newToken();
        long ttl = PURPOSE_RESET.equals(purpose) ? RESET_TTL_HOURS : VERIFY_TTL_HOURS;
        Instant expiresAt = Instant.now().plus(ttl, ChronoUnit.HOURS);

        jdbc.update("""
                INSERT INTO email_tokens (user_id, token_hash, purpose, email, expires_at)
                VALUES (?, ?, ?, ?, ?)
                """, userId, hash(plaintext), purpose, email, java.sql.Timestamp.from(expiresAt));

        log.debug("Issued a {} token for user {}", purpose, userId);
        return new IssuedToken(plaintext, expiresAt);
    }

    /**
     * Redeems a token, marking it used. Every failure mode returns the same
     * shape so a caller cannot accidentally leak which one occurred to an
     * attacker probing for valid tokens.
     */
    public Redemption redeem(String plaintext, String purpose) {
        if (plaintext == null || plaintext.isBlank()) return Redemption.invalid("missing");

        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT id, user_id, email, expires_at, used_at
                  FROM email_tokens
                 WHERE token_hash = ? AND purpose = ?
                """, hash(plaintext), purpose);

        if (rows.isEmpty()) return Redemption.invalid("unknown");

        Map<String, Object> row = rows.get(0);
        if (row.get("used_at") != null) return Redemption.invalid("already used");

        Instant expiresAt = ((java.sql.Timestamp) row.get("expires_at")).toInstant();
        if (Instant.now().isAfter(expiresAt)) return Redemption.invalid("expired");

        jdbc.update("UPDATE email_tokens SET used_at = NOW() WHERE id = ?", row.get("id"));
        return Redemption.ok((Integer) row.get("user_id"), (String) row.get("email"));
    }

    /**
     * Returns the user's unsubscribe secret, creating one on first use.
     *
     * Separate from the single-use tokens above: this one is long-lived, because
     * it has to keep working in an email a person may open weeks later, and it
     * only ever grants the ability to turn notifications *off*.
     */
    public String unsubscribeTokenFor(int userId) {
        List<String> existing = jdbc.queryForList(
                "SELECT unsubscribe_token FROM users WHERE id = ?", String.class, userId);
        if (!existing.isEmpty() && existing.get(0) != null) return existing.get(0);

        String token = newToken();
        jdbc.update("UPDATE users SET unsubscribe_token = ? WHERE id = ?", token, userId);
        return token;
    }

    /**
     * The address a user is currently being asked to confirm, if any.
     *
     * An unconfirmed address is deliberately not stored on the account — it
     * lives here on the outstanding token — so this is where the pending value
     * is read from.
     */
    public String pendingEmailFor(int userId) {
        List<String> rows = jdbc.queryForList("""
                SELECT email FROM email_tokens
                 WHERE user_id = ? AND purpose = ? AND used_at IS NULL AND expires_at > NOW()
                 ORDER BY created_at DESC
                 LIMIT 1
                """, String.class, userId, PURPOSE_VERIFY);
        return rows.isEmpty() ? null : rows.get(0);
    }
}
