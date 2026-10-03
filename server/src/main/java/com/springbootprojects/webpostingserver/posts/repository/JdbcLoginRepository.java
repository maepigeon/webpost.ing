package com.springbootprojects.webpostingserver.posts.repository;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.jdbc.core.BeanPropertyRowMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Repository;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Repository
public class JdbcLoginRepository implements LoginRepository {

    private static final Logger log = LoggerFactory.getLogger(JdbcLoginRepository.class);

    @Value("${app.dev-mode:false}")
    private boolean devMode;

    /**
     * Clears the session cookies and returns them with the given status and body.
     *
     * deleteCookie() always answers 200, which is right for a logout — the
     * logout itself succeeded — but wrong for a rejected session, where the
     * status is the whole point.
     */
    public ResponseEntity<String> expireCookies(HttpStatus status, String body) {
        return ResponseEntity.status(status)
                .header(HttpHeaders.SET_COOKIE, expiredCookie("authToken").toString())
                .header(HttpHeaders.SET_COOKIE, expiredCookie("username").toString())
                .body(body);
    }

    private ResponseCookie expiredCookie(String name) {
        return ResponseCookie.from(name, "")
                .httpOnly(true)
                .sameSite("Lax")
                .secure(!devMode)
                .path("/")
                .maxAge(0)
                .build();
    }

    public ResponseEntity<String> deleteCookie() {
        HttpCookie deleteTokenCookie = ResponseCookie.from("authToken", "token")
                .httpOnly(true)
                .sameSite("Lax")
                .secure(!devMode)
                .path("/")
                .maxAge(0)
                .build();
        HttpCookie deleteUsernameCookie = ResponseCookie.from("username", "username")
                .httpOnly(true)
                .sameSite("Lax")
                .secure(!devMode)
                .path("/")
                .maxAge(0)
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, deleteTokenCookie.toString())
                .header(HttpHeaders.SET_COOKIE, deleteUsernameCookie.toString())
                .body("");
    }

    /**
     * Live sessions, keyed by the session token.
     *
     * Keyed by token rather than by username so one account can hold several
     * concurrent sessions — a phone and a laptop, say. Keying by username meant
     * each login overwrote the previous one, so signing in anywhere signed you
     * out everywhere.
     *
     * ConcurrentHashMap, not HashMap: this is static state touched by every
     * request thread, and concurrent writes to a plain HashMap can corrupt its
     * internal table, losing or duplicating entries during a resize.
     *
     * Sessions live only in memory, so a restart logs everyone out. Moving them
     * to the database is tracked in guide/tasks.md.
     */
    private static final Map<String, AuthSession> sessionsByToken = new ConcurrentHashMap<>();

    /** Hard ceiling on stored sessions, so a login flood cannot exhaust memory. */
    private static final int MAX_SESSIONS = 10_000;

    /** Sessions one account may hold at once; the oldest is dropped beyond this. */
    private static final int MAX_SESSIONS_PER_USER = 5;

    /**
     * Stores a session, evicting instead of refusing: beyond the per-user cap the
     * user's own oldest session goes, and when the whole table is full the
     * globally oldest goes. Refusing would let one account's login flood lock
     * every other user out. Oldest = earliest expiresAt (lifetime is constant).
     */
    public static synchronized void storeSession(AuthSession s, int perUserCap, int globalCap) {
        java.util.Comparator<AuthSession> oldestFirst = java.util.Comparator.comparing(
                x -> x.expiresAt == null ? Instant.MIN : x.expiresAt);
        List<AuthSession> mine = new ArrayList<>();
        for (AuthSession x : sessionsByToken.values()) if (s.username.equals(x.username)) mine.add(x);
        mine.sort(oldestFirst);
        for (int i = 0; mine.size() - i >= perUserCap; i++) sessionsByToken.remove(mine.get(i).token);
        while (sessionsByToken.size() >= globalCap) {
            sessionsByToken.values().stream().min(oldestFirst).ifPresentOrElse(
                    o -> sessionsByToken.remove(o.token), () -> { });
            if (sessionsByToken.isEmpty()) break;
        }
        sessionsByToken.put(s.token, s);
    }

    /** Live session count for a user (for tests). */
    public static int sessionCountFor(String username) {
        return (int) sessionsByToken.values().stream().filter(x -> username.equals(x.username)).count();
    }

    public static boolean hasSession(String token) { return sessionsByToken.containsKey(token); }

    /** Drops all sessions (for tests). */
    public static void clearSessions() { sessionsByToken.clear(); }

    /** Absolute session lifetime, in minutes. */
    @Value("${app.session-lifetime-minutes:1440}")
    private long sessionLifetimeMinutes;

    /** Idle timeout, in minutes — reset on each authorized request. */
    @Value("${app.session-idle-minutes:720}")
    private long sessionIdleMinutes;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private static final SecureRandom secureRandom = new SecureRandom(); //threadsafe
    private static final Base64.Encoder base64Encoder = Base64.getUrlEncoder(); //threadsafe
    private static final BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder();

    /** Compared against when the username is unknown, so timing does not reveal which names exist. */
    private static final String DUMMY_HASH = bcrypt.encode("not-a-real-password-timing-pad");

    private static String generateNewToken() {
        byte[] randomBytes = new byte[24];
        secureRandom.nextBytes(randomBytes);
        return base64Encoder.encodeToString(randomBytes);
    }

    private boolean isTokenExpired(AuthSession authSession) {
        return authSession.isExpired(Instant.now());
    }

    /**
     * Compares two tokens without leaking their contents through timing.
     * String.equals returns as soon as it finds a differing character, so the
     * time it takes reveals how much of a guess was correct.
     */
    private static boolean tokensMatch(String expected, String presented) {
        if (expected == null || presented == null) return false;
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                presented.getBytes(StandardCharsets.UTF_8));
    }

    /** Drops every session whose absolute or idle deadline has passed. */
    private void purgeExpiredSessions() {
        Instant now = Instant.now();
        sessionsByToken.values().removeIf(s -> s.isExpired(now));
    }

    public void touchLastVisited(String username) {
        jdbcTemplate.update("UPDATE users SET last_visited = NOW() WHERE username = ?", username);
    }

    public String getUserBackground(String username) {
        List<String> results = jdbcTemplate.query(
                "SELECT background_pattern FROM users WHERE username = ?",
                (rs, rowNum) -> rs.getString("background_pattern"),
                username);
        return results.isEmpty() ? null : results.get(0);
    }

    public void updateUserBackground(String username, String pattern) {
        jdbcTemplate.update("UPDATE users SET background_pattern = ? WHERE username = ?", pattern, username);
    }

    public String getUserPresets(String username) {
        List<String> r = jdbcTemplate.query(
                "SELECT pattern_presets FROM users WHERE username = ?",
                (rs, rowNum) -> rs.getString("pattern_presets"),
                username);
        return (r.isEmpty() || r.get(0) == null) ? "{}" : r.get(0);
    }

    public void updateUserPresets(String username, String presetsJson) {
        jdbcTemplate.update("UPDATE users SET pattern_presets = ? WHERE username = ?", presetsJson, username);
    }

    public long getPresetsStorageBytes(String username) {
        List<Long> r = jdbcTemplate.query(
                "SELECT COALESCE(octet_length(pattern_presets), 0) FROM users WHERE username = ?",
                (rs, rowNum) -> rs.getLong(1),
                username);
        return r.isEmpty() ? 0L : r.get(0);
    }

    public String getUserBio(String username) {
        List<String> r = jdbcTemplate.query(
                "SELECT bio FROM users WHERE username = ?",
                (rs, rowNum) -> rs.getString("bio"),
                username);
        return r.isEmpty() ? null : r.get(0);
    }

    public void updateUserBio(String username, String bio) {
        jdbcTemplate.update("UPDATE users SET bio = ? WHERE username = ?", bio, username);
    }

    public String getUserBioLinks(String username) {
        List<String> r = jdbcTemplate.query(
                "SELECT bio_links FROM users WHERE username = ?",
                (rs, rowNum) -> rs.getString("bio_links"),
                username);
        return (r.isEmpty() || r.get(0) == null) ? "[]" : r.get(0);
    }

    public void updateUserBioLinks(String username, String bioLinksJson) {
        jdbcTemplate.update("UPDATE users SET bio_links = ? WHERE username = ?", bioLinksJson, username);
    }

    public boolean isAdmin(String username) {
        List<Boolean> r = jdbcTemplate.queryForList(
            "SELECT is_admin FROM users WHERE username = ?", Boolean.class, username);
        return !r.isEmpty() && Boolean.TRUE.equals(r.get(0));
    }


    // Attempts to log the user out
    /**
     * Ends the one session identified by {@code token}, leaving this account's
     * other sessions (other devices) alone.
     *
     * Returns false when there was nothing to end — an already-expired or
     * already-removed session. The caller clears the cookie either way, so a
     * false result is not an error worth surfacing to the user.
     */
    public boolean logout(String username, String token) {
        if (token == null) return false;
        AuthSession session = sessionsByToken.get(token);
        if (session == null) return false;

        // Only the owner of a session may end it.
        if (!tokensMatch(session.username, username)) return false;

        sessionsByToken.remove(token);
        log.debug("Ended session for {}", username);
        return true;
    }

    /** Ends every session belonging to a user — used when freezing or deleting. */
    private void evictAllSessionsFor(String username) {
        if (username == null) return;
        sessionsByToken.values().removeIf(s -> username.equals(s.username));
    }


    /**
     *
     * @param username
     * @param password
     * @return
     */
    public int authenticate(String username, String password) {
        List<LoginInfo> loginInfo = jdbcTemplate.query(
                "SELECT * FROM users WHERE username = ?",
                BeanPropertyRowMapper.newInstance(LoginInfo.class), username);
        if (loginInfo.isEmpty()) {
            bcrypt.matches(password, DUMMY_HASH);
            return -1;
        }
        if (loginInfo.size() > 1) {
            log.error("Duplicate users detected for username: {}", username);
            return -1;
        }
        LoginInfo user = loginInfo.getFirst();
        String stored = user.getPassword();
        if (stored == null) {
            bcrypt.matches(password, DUMMY_HASH);
            return -1;
        }

        // Every password is stored as a BCrypt hash.
        return bcrypt.matches(password, stored) ? user.getID() : -1;
    }

    /**
     * Return whether the user is authorized to access the resource
     * @param username
     * @param token
     * @return
     */
    public AuthSession authorize(String username, String token) throws TokenExpiredException {
        if (username == null || token == null) return null;

        AuthSession authSession = sessionsByToken.get(token);
        if (authSession == null) return null;

        // Expired sessions are removed and reported distinctly from "wrong
        // token", so the client can tell "log in again" from "access denied".
        if (isTokenExpired(authSession)) {
            sessionsByToken.remove(token);
            throw new TokenExpiredException();
        }

        // The token is the credential; the username cookie only says who the
        // client believes it is. They must agree, or a valid token could be
        // replayed against another account's name.
        if (!tokensMatch(authSession.username, username)) return null;

        // Frozen users are refused even while holding a valid session.
        if ("frozen".equals(authSession.role)) return null;

        // Successful use pushes the idle deadline forward.
        authSession.idleExpiresAt = Instant.now().plus(sessionIdleMinutes, ChronoUnit.MINUTES);
        return authSession;
    }


    /**
     * Attempts to log in the user, adds a session token and http result to the LoginInfo object
     * @param loginInfo - the login info object
     * @return
     */
    @Override
    public AuthSession login(LoginInfo loginInfo) {
        purgeExpiredSessions();

        Instant now = Instant.now();
        AuthSession authSession = new AuthSession(loginInfo.getUsername());
        authSession.expiresAt = now.plus(sessionLifetimeMinutes, ChronoUnit.MINUTES);
        authSession.idleExpiresAt = now.plus(sessionIdleMinutes, ChronoUnit.MINUTES);
        authSession.token = "-1";

        // Verify the credentials are not empty
        if (loginInfo.getUsername().isEmpty() || loginInfo.getPassword().isEmpty()) {
            authSession.loginHttpStatusCodeResult = HttpStatus.BAD_REQUEST;
            return authSession;
        }
        authSession.userId = authenticate(loginInfo.getUsername(), loginInfo.getPassword());
        if (authSession.userId > 0) {
            // Load and store the user's role
            List<String> roles = jdbcTemplate.queryForList(
                "SELECT role FROM users WHERE id=?", String.class, authSession.userId);
            authSession.role = roles.isEmpty() ? "user" : roles.get(0);

            // Frozen users are blocked from all API access — refuse session creation
            if ("frozen".equals(authSession.role)) {
                authSession.loginHttpStatusCodeResult = HttpStatus.FORBIDDEN;
                return authSession;
            }

            // Always issue a fresh token. Reusing the previous one meant a token
            // captured once stayed valid indefinitely, because each new login
            // pushed the expiry forward without changing the secret.
            authSession.token = generateNewToken();
            authSession.loginHttpStatusCodeResult = HttpStatus.OK;

            // Bounded per user and overall by evicting the oldest, never by refusing.
            storeSession(authSession, MAX_SESSIONS_PER_USER, MAX_SESSIONS);

        } else {
            authSession.loginHttpStatusCodeResult = HttpStatus.FORBIDDEN;
        }
        return authSession;
    }

    /** Immediately invalidate a user's sessions, e.g. when a user is frozen. */
    public void evictSession(String username) {
        evictAllSessionsFor(username);
    }

    public void deleteUser(String username) {
        List<Integer> ids = jdbcTemplate.queryForList("SELECT id FROM users WHERE username=?", Integer.class, username);
        if (ids.isEmpty()) return;
        int userId = ids.get(0);
        // Delete owned posts via junction (posts FK has no cascade from users)
        List<Integer> postIds = jdbcTemplate.queryForList(
            "SELECT post_id FROM users_posts_junctions WHERE user_id=?", Integer.class, userId);
        jdbcTemplate.update("DELETE FROM users_posts_junctions WHERE user_id=?", userId);
        for (int postId : postIds) {
            jdbcTemplate.update("DELETE FROM posts WHERE id=?", postId);
        }
        // Delete the user — cascades to uploads, reactions, follows, comments, notifications
        jdbcTemplate.update("DELETE FROM users WHERE id=?", userId);
        evictAllSessionsFor(username);
    }

    public static class TokenExpiredException extends Exception {
        public TokenExpiredException() {
            super("Session token is expired");
        }
    }
}