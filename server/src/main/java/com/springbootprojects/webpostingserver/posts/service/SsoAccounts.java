package com.springbootprojects.webpostingserver.posts.service;

import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.validator.ReservedUsernames;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The account rules of single sign-on (guide/SSO-PLAN.md, 3.3 to 3.5), kept
 * apart from the web layer so each rule reads on its own:
 *
 * <ul>
 *   <li>A provider account is matched to a member by (provider, subject) and
 *       by nothing else. An email address never links or signs anyone in.</li>
 *   <li>A first sign-in makes an account only after the person picks a
 *       username, under the same name rules, invite policy and sign-up limits
 *       as password sign-up.</li>
 *   <li>That account has no password until one is set. "No password" is
 *       {@link #NO_PASSWORD} in users.password: not a bcrypt hash, so no
 *       password can ever match it, and every existing path that stores a real
 *       hash (change, reset by email, admin) ends the state by itself.</li>
 *   <li>A provider can be unlinked only while another way to sign in remains:
 *       a password, or another linked provider that is switched on.</li>
 * </ul>
 */
@Service
public class SsoAccounts {

    private static final Logger log = LoggerFactory.getLogger(SsoAccounts.class);

    /** Stored in users.password for an account that has never had one. */
    public static final String NO_PASSWORD = "!sso";

    public static final String EMAIL_EXISTS_MESSAGE =
            "An account with this email exists. Sign in with your password, then link this provider in Settings.";
    private static final String NETWORK_MESSAGE =
            "Registration temporarily unavailable from this network. Please try again later.";

    // The same numbers as AuthController.register. The counters themselves are
    // separate from its (they are private there), so one network gets these
    // allowances once for password sign-up and once for provider sign-up; the
    // daily cap is one count, taken from the users table.
    private static final ConcurrentHashMap<String, Long> BLOCKED_UNTIL = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<String, long[]> DAILY = new ConcurrentHashMap<>();
    private static final int MAX_PER_NETWORK_PER_DAY = 3;
    private static final long BLOCK_MS = 60 * 60 * 1000L;        // after an account is made
    private static final long BLOCK_SHORT_MS = 5 * 60 * 1000L;   // after a wrong invite code

    public enum Linked { LINKED, ALREADY_YOURS, TAKEN, HAVE_ONE }

    public enum Unlinked { DONE, NOT_LINKED, LAST_METHOD }

    /** The outcome of making an account; {@code userId} is set only when status is CREATED. */
    public record Signup(HttpStatus status, String message, int userId, String username) {
        public boolean created() { return status == HttpStatus.CREATED; }
    }

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public SsoAccounts(JdbcTemplate jdbc, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /** Forgets the per-network sign-up counters (for tests). */
    public static void clearLimits() {
        BLOCKED_UNTIL.clear();
        DAILY.clear();
    }

    // ── identities ────────────────────────────────────────────────────────────

    /** The member this provider account is linked to, or null. */
    public Integer userIdFor(String provider, String subject) {
        List<Integer> ids = jdbc.queryForList(
                "SELECT user_id FROM user_identities WHERE provider = ? AND subject = ?", Integer.class, provider, subject);
        return ids.isEmpty() ? null : ids.get(0);
    }

    /** Notes a sign-in with this identity, and what the provider now reports as its address. */
    public void markUsed(String provider, String subject, String email, boolean emailVerified) {
        jdbc.update("UPDATE user_identities SET last_used_at = now(), email = ?, email_verified = ? "
                + "WHERE provider = ? AND subject = ?", email, emailVerified, provider, subject);
    }

    public List<Map<String, Object>> identities(int userId) {
        return jdbc.queryForList("SELECT provider, email, created_at, last_used_at FROM user_identities "
                + "WHERE user_id = ? ORDER BY created_at, id", userId);
    }

    /** True when the stored value is a real password hash. */
    public static boolean isPasswordHash(String stored) {
        return stored != null && stored.startsWith("$2");
    }

    public boolean hasPassword(int userId) {
        List<String> stored = jdbc.queryForList("SELECT password FROM users WHERE id = ?", String.class, userId);
        return !stored.isEmpty() && isPasswordHash(stored.get(0));
    }

    /** True when a member has confirmed this address themselves. Such an account is never linked or shadowed by email. */
    public boolean verifiedEmailInUse(String email) {
        if (email == null || email.isBlank()) return false;
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM users WHERE LOWER(email) = ? AND email_verified = TRUE", Integer.class,
                email.trim().toLowerCase());
        return n != null && n > 0;
    }

    /**
     * Links a provider account to a signed-in member. Refused when that
     * provider account already belongs to someone else, or the member already
     * has a different account of the same provider linked.
     */
    public Linked link(int userId, String provider, String subject, String email, boolean emailVerified) {
        Integer owner = userIdFor(provider, subject);
        if (owner != null) return owner == userId ? Linked.ALREADY_YOURS : Linked.TAKEN;
        Integer mine = jdbc.queryForObject(
                "SELECT COUNT(*) FROM user_identities WHERE user_id = ? AND provider = ?", Integer.class, userId, provider);
        if (mine != null && mine > 0) return Linked.HAVE_ONE;
        try {
            jdbc.update("INSERT INTO user_identities (user_id, provider, subject, email, email_verified) VALUES (?,?,?,?,?)",
                    userId, provider, subject, email, emailVerified);
            return Linked.LINKED;
        } catch (DuplicateKeyException e) {
            // Two requests at once: the unique indexes decide, and the loser is told why.
            Integer now = userIdFor(provider, subject);
            if (now != null && now == userId) return Linked.ALREADY_YOURS;
            return now != null ? Linked.TAKEN : Linked.HAVE_ONE;
        }
    }

    /** Whether removing {@code provider} would leave this member a way to sign in. */
    public boolean canUnlink(int userId, String provider, Collection<String> enabledProviders) {
        if (hasPassword(userId)) return true;
        for (Map<String, Object> row : identities(userId)) {
            String other = (String) row.get("provider");
            if (!other.equals(provider) && enabledProviders.contains(other)) return true;
        }
        return false;
    }

    /**
     * Unlinks a provider unless it is the last way in. The member's row is
     * locked for the check and the delete, so two unlinks at once cannot each
     * see the other's provider as "the one that remains".
     */
    public Unlinked unlink(int userId, String provider, Collection<String> enabledProviders) {
        return tx.execute(status -> {
            jdbc.queryForList("SELECT id FROM users WHERE id = ? FOR UPDATE", Integer.class, userId);
            Integer linked = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM user_identities WHERE user_id = ? AND provider = ?", Integer.class, userId, provider);
            if (linked == null || linked == 0) return Unlinked.NOT_LINKED;
            if (!canUnlink(userId, provider, enabledProviders)) return Unlinked.LAST_METHOD;
            jdbc.update("DELETE FROM user_identities WHERE user_id = ? AND provider = ?", userId, provider);
            return Unlinked.DONE;
        });
    }

    /**
     * Gives an account without a password its first one. False when it already
     * has one (that is "change password", which asks for the current one).
     */
    public boolean setFirstPassword(int userId, String newPassword) {
        return jdbc.update("UPDATE users SET password = ? WHERE id = ? AND password NOT LIKE '$2%'",
                JdbcLoginRepository.hashPassword(newPassword), userId) == 1;
    }

    // ── first sign-in: making the account ─────────────────────────────────────

    /** The username rules of password sign-up, word for word; null when the name is fine. */
    public static String usernameProblem(String username) {
        if (username == null || username.isBlank()) return "Username required.";
        String name = username.trim();
        if (name.length() < 3 || name.length() > 32) return "Username must be 3–32 characters.";
        if (!name.matches("[A-Za-z0-9_\\-]+"))
            return "Username may only contain letters, numbers, underscores, and hyphens.";
        if (ReservedUsernames.isReserved(name)) return "That username is reserved. Please choose another.";
        return null;
    }

    /** Admin setting invite_required; default true, and an absent or unreadable row means true. */
    public boolean inviteRequired() {
        try {
            List<String> v = jdbc.queryForList("SELECT value FROM system_settings WHERE key='invite_required'", String.class);
            return v.isEmpty() || v.get(0) == null || !"false".equalsIgnoreCase(v.get(0).trim());
        } catch (Exception e) {
            return true;
        }
    }

    /**
     * Makes the account for a proven provider identity, in the order password
     * sign-up checks things: the network's limits, the name, the invite code,
     * the daily cap, then the insert. An invite code is claimed in one
     * statement and handed back if the account cannot be made after all.
     *
     * @param networkKey the caller's address as a rate-limit key (AuthController.rateKey)
     * @param loopback   the caller is this machine; as in password sign-up, the per-network limits are skipped
     */
    public Signup signUp(String rawUsername, String rawCode, SsoFlowStore.Pending identity,
                         String networkKey, boolean loopback) {
        if (!loopback && (isBlocked(networkKey) || madeTodayFrom(networkKey) >= MAX_PER_NETWORK_PER_DAY))
            return refused(HttpStatus.TOO_MANY_REQUESTS, NETWORK_MESSAGE);

        String problem = usernameProblem(rawUsername);
        if (problem != null) return refused(HttpStatus.BAD_REQUEST, problem);
        String username = rawUsername.trim();
        String code = rawCode == null ? "" : rawCode.trim();
        boolean needCode = inviteRequired();
        if (needCode && code.isEmpty()) return refused(HttpStatus.BAD_REQUEST, "Invite code required.");

        if (dailyCapReached()) {
            if (!loopback) BLOCKED_UNTIL.put(networkKey, System.currentTimeMillis() + BLOCK_MS);
            return refused(HttpStatus.SERVICE_UNAVAILABLE, "Registration is currently closed. Please try again tomorrow.");
        }

        Integer sameName = jdbc.queryForObject(
                "SELECT COUNT(*) FROM users WHERE LOWER(username) = LOWER(?)", Integer.class, username);
        if (sameName != null && sameName > 0) return refused(HttpStatus.CONFLICT, "Username already taken.");

        // Another tab may have finished with the same provider account meanwhile.
        if (userIdFor(identity.provider(), identity.subject()) != null)
            return refused(HttpStatus.CONFLICT, alreadyHere(identity));
        if (identity.emailVerified() && verifiedEmailInUse(identity.email()))
            return refused(HttpStatus.CONFLICT, EMAIL_EXISTS_MESSAGE);

        if (needCode) {
            List<Map<String, Object>> rows = jdbc.queryForList("SELECT used_by FROM invite_codes WHERE code = ?", code);
            if (rows.isEmpty()) {
                if (!loopback) BLOCKED_UNTIL.put(networkKey, System.currentTimeMillis() + BLOCK_SHORT_MS);
                return refused(HttpStatus.FORBIDDEN, "Invalid invite code.");
            }
            if (rows.get(0).get("used_by") != null)
                return refused(HttpStatus.GONE, "Invite code has already been used.");
            int claimed = jdbc.update("UPDATE invite_codes SET used_by=?, used_at=NOW() WHERE code=? AND used_by IS NULL "
                    + "AND (expires_at IS NULL OR expires_at > NOW())", username, code);
            if (claimed == 0) return refused(HttpStatus.GONE, "Invite code has expired or was just used.");
        }

        Integer userId;
        try {
            // The member and their identity appear together or not at all.
            userId = tx.execute(status -> {
                boolean trusted = identity.emailVerified() && identity.email() != null;
                Integer id = jdbc.queryForObject("INSERT INTO users (username, password, email, email_verified, email_verified_at) "
                                + "VALUES (?, ?, ?, ?, CASE WHEN ? THEN now() END) RETURNING id", Integer.class,
                        username, NO_PASSWORD, trusted ? identity.email() : null, trusted, trusted);
                jdbc.update("INSERT INTO user_identities (user_id, provider, subject, email, email_verified, last_used_at) "
                        + "VALUES (?,?,?,?,?, now())", id, identity.provider(), identity.subject(),
                        identity.email(), identity.emailVerified());
                return id;
            });
        } catch (Exception e) {
            if (needCode) jdbc.update("UPDATE invite_codes SET used_by=NULL, used_at=NULL WHERE code=? AND used_by=?", code, username);
            log.info("Could not make an account from a {} sign-in: {}", identity.provider(), e.getClass().getSimpleName());
            if (userIdFor(identity.provider(), identity.subject()) != null) return refused(HttpStatus.CONFLICT, alreadyHere(identity));
            return refused(HttpStatus.CONFLICT, "Username already taken.");
        }

        if (!loopback) {
            BLOCKED_UNTIL.put(networkKey, System.currentTimeMillis() + BLOCK_MS);
            DAILY.merge(networkKey, new long[]{java.time.LocalDate.now().toEpochDay(), 1},
                    (old, one) -> old[0] == one[0] ? new long[]{old[0], old[1] + 1} : one);
        }
        return new Signup(HttpStatus.CREATED, "Account created.", userId == null ? 0 : userId, username);
    }

    private static String alreadyHere(SsoFlowStore.Pending identity) {
        return "That " + SsoProviders.displayName(identity.provider()) + " account already has an account here. Sign in with it.";
    }

    private static Signup refused(HttpStatus status, String message) {
        return new Signup(status, message, 0, null);
    }

    /** No row means the default of 5; a negative value means no cap. Counts every account made today, however it was made. */
    private boolean dailyCapReached() {
        try {
            List<String> limits = jdbc.queryForList(
                    "SELECT value FROM system_settings WHERE key='max_daily_registrations'", String.class);
            String raw = limits.isEmpty() ? null : limits.get(0);
            int limit = raw != null ? Integer.parseInt(raw.trim()) : 5;
            if (limit < 0) return false;
            Integer today = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM users WHERE registration_date >= CURRENT_DATE", Integer.class);
            return today != null && today >= limit;
        } catch (Exception e) {
            return false;   // as password sign-up does: an unreadable setting does not close sign-up
        }
    }

    private static boolean isBlocked(String key) {
        long now = System.currentTimeMillis();
        if (BLOCKED_UNTIL.size() > 10_000) BLOCKED_UNTIL.values().removeIf(until -> until <= now);
        Long until = BLOCKED_UNTIL.get(key);
        return until != null && now < until;
    }

    private static int madeTodayFrom(String key) {
        long today = java.time.LocalDate.now().toEpochDay();
        if (DAILY.size() > 10_000) DAILY.values().removeIf(v -> v[0] != today);
        long[] v = DAILY.get(key);
        return v != null && v[0] == today ? (int) v[1] : 0;
    }

    // ── the member's security log ─────────────────────────────────────────────

    /**
     * Writes "identity_linked" / "identity_unlinked" to the member's security
     * log. SecurityLog.record only accepts the kinds in its own list, which
     * does not have these two yet, so the row is written here in the same
     * shape (shortened address, cut user agent). Never throws.
     */
    public void logIdentityEvent(int userId, String kind, String provider, HttpServletRequest request) {
        try {
            String ua = request == null ? null : request.getHeader("User-Agent");
            jdbc.update("INSERT INTO security_events (user_id, kind, detail, ip_prefix, user_agent) VALUES (?,?,?,?,?)",
                    userId, kind, SsoProviders.displayName(provider),
                    request == null ? null : SecurityLog.shortenAddress(request.getRemoteAddr()),
                    SecurityLog.truncate(ua, 200));
        } catch (Exception e) {
            log.warn("Could not write the security log: {}", e.toString());
        }
    }
}
