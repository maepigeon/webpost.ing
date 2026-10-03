package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.service.ImageProcessingService;
import com.springbootprojects.webpostingserver.posts.service.SecurityLog;
import com.springbootprojects.webpostingserver.posts.validator.LoginRateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

/**
 * The member's own account: what happened on it, ending other sessions, and
 * leaving. Every endpoint needs a valid session and only ever touches the
 * caller's own account.
 */
@RestController
@RequestMapping("/api/account")
public class AccountController {

    private static final Logger log = LoggerFactory.getLogger(AccountController.class);

    @Autowired private LoginRepository loginRepository;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private SecurityLog securityLog;

    @Value("${app.upload-dir:uploads}")
    private String uploadDir;

    private AuthSession sessionOf(String username, String token) {
        try {
            return loginRepository.authorize(username, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return null;
        }
    }

    private static ResponseEntity<Map<String, Object>> signInFirst() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Sign in first."));
    }

    private Integer userId(String username) {
        List<Integer> ids = jdbc.queryForList("SELECT id FROM users WHERE username = ?", Integer.class, username);
        return ids.isEmpty() ? null : ids.get(0);
    }

    @GetMapping("/security-events")
    public ResponseEntity<Map<String, Object>> securityEvents(
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token) {
        if (sessionOf(username, token) == null) return signInFirst();
        Integer id = userId(username);
        if (id == null) return signInFirst();
        List<Map<String, Object>> events = new ArrayList<>();
        for (Map<String, Object> row : securityLog.list(id, 50)) {
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("kind", row.get("kind"));
            e.put("detail", row.get("detail"));
            e.put("ipPrefix", row.get("ip_prefix"));
            e.put("device", SecurityLog.deviceLabel((String) row.get("user_agent")));
            Object at = row.get("created_at");
            e.put("createdAt", at == null ? null : at.toString());
            events.add(e);
        }
        return ResponseEntity.ok(Map.of("events", events));
    }

    /** How many sessions are live. Sessions are kept in memory; no token is ever returned. */
    @GetMapping("/sessions")
    public ResponseEntity<Map<String, Object>> sessions(
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token) {
        AuthSession session = sessionOf(username, token);
        if (session == null) return signInFirst();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("count", Math.max(1, loginRepository.countSessions(username)));
        body.put("thisSessionEndsAt", session.expiresAt == null ? null : session.expiresAt.toString());
        return ResponseEntity.ok(body);
    }

    @PostMapping("/sessions/end-others")
    public ResponseEntity<Map<String, Object>> endOthers(
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token,
            HttpServletRequest request) {
        if (sessionOf(username, token) == null) return signInFirst();
        int ended = loginRepository.endOtherSessions(username, token);
        Integer id = userId(username);
        if (id != null) securityLog.record(id, "sessions_ended", ended + " other session(s) ended", request);
        return ResponseEntity.ok(Map.of("ended", ended));
    }

    /**
     * Deletes the caller's account and everything it owns, files included.
     * The password is asked again (limited like sign-in guesses, per account and
     * address). The last admin cannot leave this way.
     */
    @PostMapping("/delete")
    public ResponseEntity<?> deleteOwn(
            @RequestBody(required = false) Map<String, String> body,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token,
            HttpServletRequest request) {
        if (sessionOf(username, token) == null) return signInFirst();

        String limiterKey = "delete:" + username + "|" + AuthController.rateKey(request.getRemoteAddr());
        if (LoginRateLimiter.isBlocked(limiterKey))
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("message", "Too many wrong attempts. Try again in 15 minutes."));

        String password = body == null ? null : body.get("password");
        if (password == null || password.isEmpty())
            return ResponseEntity.badRequest().body(Map.of("message", "Type your password to delete the account."));
        if (loginRepository.authenticate(username, password) < 0) {
            LoginRateLimiter.recordFailure(limiterKey);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "That password is not right."));
        }
        LoginRateLimiter.recordSuccess(limiterKey);

        Integer id = userId(username);
        if (id == null) return signInFirst();

        if (loginRepository.isAdmin(username)) {
            Integer admins = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE is_admin = true", Integer.class);
            if (admins == null || admins <= 1)
                return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message",
                        "You are the only admin. Make someone else an admin before deleting this account."));
        }

        // Find the files first: the rows are gone once the account is.
        List<String> uploads = jdbc.queryForList("SELECT filename FROM uploads WHERE user_id = ?", String.class, id);
        List<String> variants = jdbc.queryForList(
                "SELECT v.filename FROM upload_variants v JOIN uploads u ON u.id = v.upload_id WHERE u.user_id = ?",
                String.class, id);
        List<Map<String, Object>> paths = jdbc.queryForList(
                "SELECT avatar_path, header_path FROM users WHERE id = ?", id);
        String avatar = paths.isEmpty() ? null : (String) paths.get(0).get("avatar_path");
        String header = paths.isEmpty() ? null : (String) paths.get(0).get("header_path");

        loginRepository.deleteUser(username);
        loginRepository.evictSession(username);

        int removed = deleteFiles(filesOf(Paths.get(uploadDir), uploads, variants, avatar, header));
        log.info("Account {} deleted by its owner; {} file(s) removed", username, removed);

        ResponseEntity<String> cleared = loginRepository.deleteCookie();
        return ResponseEntity.ok().headers(cleared.getHeaders())
                .body(Map.of("message", "Your account has been deleted."));
    }

    // ── files ────────────────────────────────────────────────────────────────

    /**
     * Every file on disk that belongs to the given records, each resolved under
     * {@code root}. A name that would leave the folder ("..", an absolute path,
     * a backslash) is dropped, not followed.
     */
    static Set<Path> filesOf(Path uploadRoot, List<String> uploadNames, List<String> variantNames,
                             String avatarPath, String headerPath) {
        Path root = uploadRoot.toAbsolutePath().normalize();
        Set<Path> out = new LinkedHashSet<>();
        for (String n : uploadNames) {
            if (n == null) continue;
            if (n.startsWith("avatar/")) addUnder(out, root, "avatars", n.substring(7));
            else if (n.startsWith("header/")) addHeader(out, root, n.substring(7));
            else if (n.startsWith("audio/")) addUnder(out, root, "audio", n.substring(6));
            else addUnder(out, root, null, n);
        }
        for (String n : variantNames) addUnder(out, root, null, n);
        if (avatarPath != null && avatarPath.startsWith("/uploads/avatars/"))
            addUnder(out, root, "avatars", avatarPath.substring("/uploads/avatars/".length()));
        if (headerPath != null && headerPath.startsWith("/uploads/headers/"))
            addHeader(out, root, headerPath.substring("/uploads/headers/".length()));
        return out;
    }

    private static void addHeader(Set<Path> out, Path root, String name) {
        addUnder(out, root, "headers", name);
        int dot = name.lastIndexOf('.');
        if (dot > 0) {
            for (int w : ImageProcessingService.VARIANT_WIDTHS)
                addUnder(out, root, "headers", name.substring(0, dot) + "-" + w + "w" + name.substring(dot));
        }
    }

    private static void addUnder(Set<Path> out, Path root, String sub, String name) {
        if (name == null || name.isBlank() || name.contains("..") || name.contains("\\")
                || name.startsWith("/") || name.indexOf('\0') >= 0) return;
        try {
            Path base = sub == null ? root : root.resolve(sub).normalize();
            Path p = base.resolve(name).normalize();
            if (p.startsWith(base) && !p.equals(base)) out.add(p);
        } catch (Exception ignored) { }
    }

    private static int deleteFiles(Set<Path> files) {
        int n = 0;
        for (Path p : files) {
            try {
                if (Files.deleteIfExists(p)) n++;
            } catch (Exception e) {
                log.warn("Could not delete {}: {}", p, e.toString());
            }
        }
        return n;
    }
}
