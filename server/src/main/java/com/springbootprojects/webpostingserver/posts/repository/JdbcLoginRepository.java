package com.springbootprojects.webpostingserver.posts.repository;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.model.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.jdbc.core.BeanPropertyRowMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Repository;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.util.*;

@Repository
public class JdbcLoginRepository implements LoginRepository {

    @Value("${app.dev-mode:false}")
    private boolean devMode;

    public ResponseEntity<String> deleteCookie() {
        HttpCookie deleteTokenCookie = ResponseCookie.from("authToken", "token")
                .httpOnly(true)
                .sameSite(devMode ? "Lax" : "None")
                .secure(!devMode)
                .path("/")
                .maxAge(0)
                .build();
        HttpCookie deleteUsernameCookie = ResponseCookie.from("username", "username")
                .httpOnly(true)
                .sameSite(devMode ? "Lax" : "None")
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
     * Maps usernames to authentication token data
     */
    private static HashMap<String, AuthSession> loginMap = new HashMap<>();

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private static final SecureRandom secureRandom = new SecureRandom(); //threadsafe
    private static final Base64.Encoder base64Encoder = Base64.getUrlEncoder(); //threadsafe
    private static final BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder();

    private static String generateNewToken() {
        byte[] randomBytes = new byte[24];
        secureRandom.nextBytes(randomBytes);
        return base64Encoder.encodeToString(randomBytes);
    }

    private boolean isTokenExpired(AuthSession authSession) {
        return LocalDate.now().compareTo(authSession.expires) > 0;
    }

    public List<User> getAllUsers() {
        return jdbcTemplate.query(
            "SELECT id, username, registration_date, last_visited FROM users ORDER BY last_visited DESC NULLS LAST",
            BeanPropertyRowMapper.newInstance(User.class));
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
    public boolean logout(String username, String token) {
        try {
            //If token expired, logout
            if (loginMap.get(username) != null && isTokenExpired(loginMap.get(username))) {
                loginMap.remove(username);
            }
            //If user is authorized, logout
            AuthSession authSession = authorize(username, token);
            if (authSession != null) {
                System.out.println("Logged out " + username + " and removed corresponding server session");
                loginMap.remove(username);
                return true;
            }
        } catch (Exception ex) {
                System.out.println("Tried to log out user " + username + " but no login session found on server. Attempting to delete cookie. Exception: " + ex.getMessage());
        }
        return false;
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
        if (loginInfo.isEmpty()) return -1;
        if (loginInfo.size() > 1) {
            System.out.println("Duplicate users detected for username: " + username);
            return -1;
        }
        LoginInfo user = loginInfo.getFirst();
        String stored = user.getPassword();
        if (stored == null) return -1;

        if (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$")) {
            // Already hashed — verify with BCrypt
            return bcrypt.matches(password, stored) ? user.getID() : -1;
        } else {
            // Plain-text legacy password — verify then migrate to BCrypt
            if (!stored.equals(password)) return -1;
            String hashed = bcrypt.encode(password);
            jdbcTemplate.update("UPDATE users SET password = ? WHERE username = ?", hashed, username);
            System.out.println("Migrated password to BCrypt for user: " + username);
            return user.getID();
        }
    }

    /**
     * Return whether the user is authorized to access the resource
     * @param username
     * @param token
     * @return
     */
    public AuthSession authorize(String username, String token) throws TokenExpiredException {

        //If token expired, logout
        if (loginMap.get(username) != null && isTokenExpired(loginMap.get(username))) {
            loginMap.remove(username);
            throw new TokenExpiredException();
        }

        //get the user's authorization token
        AuthSession authSession;
        try {
            authSession = loginMap.get(username);
        } catch (Exception e) {
            System.out.println("Username " + username + " not found. " + e.getMessage());
            return null;
        }
        if (authSession == null) {
            return null;
        }
        //authorize action if not expired and token matches server
        if (authSession.token.equals(token)) {
            System.out.println("Authorized user " + username + " to do something");
            return authSession;
        } else {
            return null;
        }
    }


    /**
     * Attempts to log in the user, adds a session token and http result to the LoginInfo object
     * @param loginInfo - the login info object
     * @return
     */
    @Override
    public AuthSession login(LoginInfo loginInfo) {
        AuthSession authSession = new AuthSession(loginInfo.getUsername());
        authSession.expires = LocalDate.now().plusDays(1);
        authSession.token = "-1";

        // Verify the credentials are not empty
        if (loginInfo.getUsername().isEmpty() || loginInfo.getPassword().isEmpty()) {
            authSession.loginHttpStatusCodeResult = HttpStatus.BAD_REQUEST;
        }
        authSession.userId = authenticate(loginInfo.getUsername(), loginInfo.getPassword());
        if (authSession.userId > 0) {
            String authToken;
            if (loginMap.get(loginInfo.getUsername()) != null) {
                authToken = loginMap.get(loginInfo.getUsername()).token;
            } else {
                authToken = generateNewToken();
            }
            authSession.token = authToken;
            authSession.loginHttpStatusCodeResult = HttpStatus.OK;

            loginMap.put(loginInfo.getUsername(), authSession);

        } else {
            authSession.loginHttpStatusCodeResult = HttpStatus.FORBIDDEN;
        }
        return authSession;
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
        loginMap.remove(username);
    }

    public static class TokenExpiredException extends Exception {
        public TokenExpiredException() {
            super("Session token is expired");
        }
    }
}