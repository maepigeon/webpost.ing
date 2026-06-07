package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.Notification;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class SocialController {

    @Autowired
    private SocialRepository social;

    @Autowired
    private LoginRepository loginRepository;

    @Autowired
    private PostRepository postRepository;

    // ── Follows ───────────────────────────────────────────────────────────────

    @GetMapping("/users/{username}/followers")
    public ResponseEntity<List<String>> getFollowers(@PathVariable String username) {
        int uid = social.getUserIdByUsername(username);
        if (uid < 0) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(social.getFollowers(uid));
    }

    @GetMapping("/users/{username}/following")
    public ResponseEntity<List<String>> getFollowing(@PathVariable String username) {
        int uid = social.getUserIdByUsername(username);
        if (uid < 0) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(social.getFollowing(uid));
    }

    /** Returns whether the authenticated user follows the given username. */
    @GetMapping("/users/{username}/follow")
    public ResponseEntity<Map<String, Object>> getFollowStatus(
            @PathVariable String username,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        int targetId = social.getUserIdByUsername(username);
        if (targetId < 0) return ResponseEntity.notFound().build();

        boolean following = social.isFollowing(session.userId, targetId);
        return ResponseEntity.ok(Map.of("following", following));
    }

    @PostMapping("/users/{username}/follow")
    public ResponseEntity<String> follow(
            @PathVariable String username,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();

        int targetId = social.getUserIdByUsername(username);
        if (targetId < 0) return ResponseEntity.notFound().build();
        if (targetId == session.userId) return ResponseEntity.badRequest().body("Cannot follow yourself.");

        social.follow(session.userId, targetId);
        social.createNotification(targetId, "follow", authUsername, null, null);
        return ResponseEntity.ok("Followed.");
    }

    @DeleteMapping("/users/{username}/follow")
    public ResponseEntity<String> unfollow(
            @PathVariable String username,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();

        int targetId = social.getUserIdByUsername(username);
        if (targetId < 0) return ResponseEntity.notFound().build();

        social.unfollow(session.userId, targetId);
        return ResponseEntity.ok("Unfollowed.");
    }

    // ── Post reactions ────────────────────────────────────────────────────────

    @GetMapping("/posts/{postId}/reactions")
    public ResponseEntity<Map<String, Object>> getReactions(
            @PathVariable int postId,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {

        Map<String, Integer> counts = social.getReactions(postId);
        List<String> userReactions = List.of();
        if (authUsername != null && token != null) {
            AuthSession s = authorize(authUsername, token);
            if (s != null) userReactions = social.getUserReactions(postId, s.userId);
        }
        return ResponseEntity.ok(Map.of("counts", counts, "userReactions", userReactions));
    }

    /** Toggle a reaction on/off. Multiple reactions per user are allowed. */
    @PostMapping("/posts/{postId}/reactions")
    public ResponseEntity<String> toggleReaction(
            @PathVariable int postId,
            @RequestBody Map<String, String> body,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();

        String reaction = body.get("reaction");
        if (reaction == null || reaction.isBlank() || reaction.length() > 10)
            return ResponseEntity.badRequest().body("Invalid reaction.");

        social.toggleReaction(postId, session.userId, reaction);
        var postOwner = postRepository.getUsernameFromPostId(postId);
        if (postOwner != null && !postOwner.compareUsername(authUsername)) {
            int ownerId = social.getUserIdByUsername(postOwner.getUsername());
            social.createNotification(ownerId, "reaction", authUsername, postId, null);
        }
        return ResponseEntity.ok("Reaction toggled.");
    }

    // ── Notifications ─────────────────────────────────────────────────────────

    @GetMapping("/notifications")
    public ResponseEntity<List<Notification>> getNotifications(
            @RequestParam(defaultValue = "50") int limit,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        return ResponseEntity.ok(social.getNotifications(session.userId, limit));
    }

    @GetMapping("/notifications/unread-count")
    public ResponseEntity<Map<String, Integer>> getUnreadCount(
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        return ResponseEntity.ok(Map.of("count", social.getUnreadCount(session.userId)));
    }

    @PutMapping("/notifications/{id}/read")
    public ResponseEntity<String> markRead(
            @PathVariable int id,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();

        social.markRead(id, session.userId);
        return ResponseEntity.ok("Marked read.");
    }

    @PutMapping("/notifications/read-all")
    public ResponseEntity<String> markAllRead(
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();

        social.markAllRead(session.userId);
        return ResponseEntity.ok("All marked read.");
    }

    @DeleteMapping("/notifications/{id}")
    public ResponseEntity<String> deleteNotification(
            @PathVariable int id,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();

        social.deleteNotification(id, session.userId);
        return ResponseEntity.ok("Deleted.");
    }

    @DeleteMapping("/notifications")
    public ResponseEntity<String> clearNotifications(
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();

        social.clearNotifications(session.userId);
        return ResponseEntity.ok("Inbox cleared.");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private AuthSession authorize(String username, String token) {
        try {
            return loginRepository.authorize(username, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return null;
        }
    }

    private ResponseEntity<String> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized");
    }
}
