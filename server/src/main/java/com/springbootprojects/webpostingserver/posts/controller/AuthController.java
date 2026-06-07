package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.model.User;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.validator.PatternValidator;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class AuthController {

    @Value("${app.dev-mode:false}")
    private boolean devMode;

    @Autowired
    LoginRepository loginRepository;

    @Autowired
    JdbcTemplate jdbc;

    /** Returns the background pattern for a user's profile page (public). */
    @GetMapping("/users/{username}/background")
    public ResponseEntity<String> getUserBackground(@PathVariable("username") String username) {
        String pattern = loginRepository.getUserBackground(username);
        return ResponseEntity.ok(pattern != null ? pattern : "");
    }

    /** Updates the background pattern for the authenticated user's own profile. */
    @PutMapping("/users/{username}/background")
    public ResponseEntity<String> updateUserBackground(
            @PathVariable("username") String username,
            @RequestBody String pattern,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {
        if (!authUsername.equals(username)) {
            return new ResponseEntity<>("Forbidden", HttpStatus.FORBIDDEN);
        }
        AuthSession session;
        try {
            session = loginRepository.authorize(authUsername, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return loginRepository.deleteCookie();
        }
        if (session == null) {
            return new ResponseEntity<>("Unauthorized", HttpStatus.UNAUTHORIZED);
        }
        String trimmed = pattern == null ? "" : pattern.trim();
        if (!PatternValidator.isValid(trimmed)) {
            return new ResponseEntity<>("Invalid background pattern", HttpStatus.BAD_REQUEST);
        }
        loginRepository.updateUserBackground(username, trimmed.isBlank() ? null : trimmed);
        return ResponseEntity.ok("Background updated");
    }

    /** Returns a user's bio (public). */
    @GetMapping("/users/{username}/bio")
    public ResponseEntity<String> getUserBio(@PathVariable("username") String username) {
        String bio = loginRepository.getUserBio(username);
        return ResponseEntity.ok(bio != null ? bio : "");
    }

    /** Updates the authenticated user's own bio. Max 500 chars, no HTML. */
    @PutMapping("/users/{username}/bio")
    public ResponseEntity<String> updateUserBio(
            @PathVariable("username") String username,
            @RequestBody String bio,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {
        if (!authUsername.equals(username)) return new ResponseEntity<>("Forbidden", HttpStatus.FORBIDDEN);
        AuthSession session;
        try {
            session = loginRepository.authorize(authUsername, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return loginRepository.deleteCookie();
        }
        if (session == null) return new ResponseEntity<>("Unauthorized", HttpStatus.UNAUTHORIZED);
        String trimmed = bio == null ? "" : bio.trim();
        if (trimmed.length() > 500) return new ResponseEntity<>("Bio must be 500 characters or less", HttpStatus.BAD_REQUEST);
        loginRepository.updateUserBio(username, trimmed.isBlank() ? null : trimmed);
        return ResponseEntity.ok("Bio updated");
    }

    /** Returns the authenticated user's own storage summary (uploads + post text). */
    @GetMapping("/users/{username}/storage")
    public ResponseEntity<Map<String, Object>> getUserStorage(
            @PathVariable("username") String username,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {
        if (!authUsername.equals(username)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        AuthSession session;
        try {
            session = loginRepository.authorize(authUsername, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        Long uploadBytes = jdbc.queryForObject(
            "SELECT COALESCE(SUM(up.size_bytes),0) FROM uploads up INNER JOIN users u ON u.id=up.user_id WHERE u.username=?",
            Long.class, username);
        Integer uploadCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM uploads up INNER JOIN users u ON u.id=up.user_id WHERE u.username=?",
            Integer.class, username);
        Long postTextBytes = jdbc.queryForObject(
            "SELECT COALESCE(SUM(octet_length(p.description)),0) FROM posts p INNER JOIN users_posts_junctions j ON j.post_id=p.id INNER JOIN users u ON u.id=j.user_id WHERE u.username=?",
            Long.class, username);
        Integer postCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM users_posts_junctions j INNER JOIN users u ON u.id=j.user_id WHERE u.username=?",
            Integer.class, username);

        // Per-role limits
        String role = jdbc.queryForObject("SELECT role FROM users WHERE username=?", String.class, username);
        Map<String, Object> limits = null;
        try {
            limits = jdbc.queryForMap("SELECT max_storage_bytes, max_posts_per_day FROM role_limits WHERE role=?", role);
        } catch (Exception ignored) {}

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("uploadBytes", uploadBytes != null ? uploadBytes : 0L);
        result.put("uploadCount", uploadCount != null ? uploadCount : 0);
        result.put("postTextBytes", postTextBytes != null ? postTextBytes : 0L);
        result.put("postCount", postCount != null ? postCount : 0);
        result.put("role", role);
        if (limits != null) {
            result.put("maxStorageBytes", limits.get("max_storage_bytes"));
            result.put("maxPostsPerDay", limits.get("max_posts_per_day"));
        }
        return ResponseEntity.ok(result);
    }

    @GetMapping("getAllUsers")
    public ResponseEntity<List<User>> getAllUsers() {
        System.out.println("getAllUsers: " + loginRepository.getAllUsers().toString());
        return new ResponseEntity<>(loginRepository.getAllUsers(), HttpStatus.OK);
    }

    @PostMapping("logoutSessionAttempt")
    public ResponseEntity<String> logoutSessionAttempt(@CookieValue(name = "username") String username, @CookieValue(name = "authToken") String token, HttpServletResponse response) {
        try {
            AuthSession loginResult = loginRepository.authorize(username, token);
            if (loginResult != null) {
                loginRepository.logout(username, token);
            }
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            System.out.println(e.getMessage());
        }
        return loginRepository.deleteCookie();
    }


    @PostMapping("/authorizeSession")
    public ResponseEntity<String> authorizeSession(@CookieValue(name = "username") String username, @CookieValue(name = "authToken") String token, HttpServletResponse response) {
        AuthSession loginResult = null;
        try {
            loginResult = loginRepository.authorize(username, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            System.out.println(e.getMessage());
            // Delete the cookie by setting maxAge to 0
            return loginRepository.deleteCookie();
        }
        if (loginResult != null) {
            loginRepository.touchLastVisited(username);
            return ResponseEntity.ok().body(username);
        } else {
            return loginRepository.deleteCookie();
        }
    }


    @PostMapping("/loginSessionAttempt")
    public ResponseEntity<String> loginSessionAttempt(@RequestBody LoginInfo loginInfo, HttpServletResponse response) {
        System.out.println("Attempting to login user");
	AuthSession loginResult = loginRepository.login(loginInfo);
        try {
            switch (loginResult.loginHttpStatusCodeResult) {
                case HttpStatus.FORBIDDEN:
		    System.out.println("Failed to authenticate, error 403");
                    return new ResponseEntity<>("Failed to authenticate: Incorrect login information, loginResult: ." + loginResult, HttpStatus.FORBIDDEN);
   		case HttpStatus.OK:
                    System.out.println("AUTHENTICATION OK!! : Logging in user: " + loginInfo.getUsername());
                    HttpCookie tokenCookie = ResponseCookie.from("authToken", loginResult.token)
                            .httpOnly(true)
                            .sameSite(devMode ? "Lax" : "None")
                            .secure(!devMode)
                            .path("/")
                            .maxAge(60 * 60 * 24)
                            .build();
                    HttpCookie usernameCookie = ResponseCookie.from("username", loginResult.username)
                            .httpOnly(true)
                            .sameSite(devMode ? "Lax" : "None")
                            .secure(!devMode)
                            .path("/")
                            .maxAge(60 * 60 * 24)
                            .build();
                    System.out.println("AUTHENTICATION OK!! : Logging in user: " + loginResult.username);
                    return ResponseEntity.ok()
                            .header(HttpHeaders.SET_COOKIE, tokenCookie.toString())
                            .header(HttpHeaders.SET_COOKIE, usernameCookie.toString())
                            .body(loginResult.username);
                default:
		    System.out.println("Failed to authenticate, bad request");
                    return new ResponseEntity<>("Failed to authenticate:  Bad request, loginResult: " + loginResult, HttpStatus.BAD_REQUEST);
            }

        } catch (Exception e) {
            System.out.println("Internal server error (500): " + e.toString());
            return new ResponseEntity<>(null, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

}
