package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.Notification;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;
import com.springbootprojects.webpostingserver.posts.validator.EmojiValidator;
import com.springbootprojects.webpostingserver.posts.validator.RateLimiter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class SocialController {

    // 20 messages per hour per sender; 60 reactions per 5 min per user
    private static final RateLimiter MSG_LIMITER      = new RateLimiter(20,  60 * 60 * 1000L, 60 * 60 * 1000L);
    private static final RateLimiter REACTION_LIMITER = new RateLimiter(60,   5 * 60 * 1000L,  5 * 60 * 1000L);

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
        boolean mutuals = following && social.isFollowing(targetId, session.userId);
        return ResponseEntity.ok(Map.of("following", following, "mutuals", mutuals));
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

        String rkey = String.valueOf(session.userId);
        if (REACTION_LIMITER.isBlocked(rkey))
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body("Too many reactions. Slow down.");

        String reaction = body.get("reaction");
        if (!EmojiValidator.isValid(reaction))
            return ResponseEntity.badRequest().body("Invalid reaction.");

        // Authors may not react to their own content
        var postOwner = postRepository.getUsernameFromPostId(postId);
        if (postOwner != null && postOwner.compareUsername(authUsername))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("You cannot react to your own post.");

        social.toggleReaction(postId, session.userId, reaction.trim());
        REACTION_LIMITER.recordUse(rkey);
        if (postOwner != null) {
            int ownerId = social.getUserIdByUsername(postOwner.getUsername());
            social.createNotification(ownerId, "reaction", authUsername, postId, null);
        }
        return ResponseEntity.ok("Reaction toggled.");
    }

    // ── Direct messages ───────────────────────────────────────────────────────

    @PostMapping("/users/{username}/message")
    public ResponseEntity<String> sendMessage(
            @PathVariable String username,
            @RequestBody Map<String, String> body,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();

        String key = String.valueOf(session.userId);
        if (MSG_LIMITER.isBlocked(key))
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body("Too many messages. Try again later.");

        String message = body.get("message");
        if (message == null || message.isBlank() || message.length() > 1000)
            return ResponseEntity.badRequest().body("Message must be 1–1000 characters.");

        int targetId = social.getUserIdByUsername(username);
        if (targetId < 0) return ResponseEntity.notFound().build();
        if (targetId == session.userId) return ResponseEntity.badRequest().body("Cannot message yourself.");

        if (social.isMessageBlocked(targetId, session.userId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("This user is not accepting messages from you.");

        social.sendMessage(targetId, authUsername, message.trim());
        MSG_LIMITER.recordUse(key);
        return ResponseEntity.ok("Message sent.");
    }

    // ── DM blocks ─────────────────────────────────────────────────────────────

    /** Block direct messages from {username} reaching the authenticated user. */
    @PostMapping("/users/{username}/block-messages")
    public ResponseEntity<String> blockMessages(
            @PathVariable String username,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();

        int targetId = social.getUserIdByUsername(username);
        if (targetId < 0) return ResponseEntity.notFound().build();
        if (targetId == session.userId) return ResponseEntity.badRequest().body("Cannot block yourself.");

        social.blockMessages(session.userId, targetId);
        return ResponseEntity.ok("Messages blocked.");
    }

    /** Unblock direct messages from {username}. */
    @DeleteMapping("/users/{username}/block-messages")
    public ResponseEntity<String> unblockMessages(
            @PathVariable String username,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();

        int targetId = social.getUserIdByUsername(username);
        if (targetId < 0) return ResponseEntity.notFound().build();

        social.unblockMessages(session.userId, targetId);
        return ResponseEntity.ok("Messages unblocked.");
    }

    /** Check whether the authenticated user has blocked messages from {username}. */
    @GetMapping("/users/{username}/block-messages")
    public ResponseEntity<Map<String, Boolean>> getBlockStatus(
            @PathVariable String username,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        int targetId = social.getUserIdByUsername(username);
        if (targetId < 0) return ResponseEntity.notFound().build();

        boolean blocked = social.isBlockingMessages(session.userId, targetId);
        boolean blockedByThem = social.isMessageBlocked(targetId, session.userId);
        return ResponseEntity.ok(Map.of("blocked", blocked, "blockedByThem", blockedByThem));
    }

    // ── Notifications ─────────────────────────────────────────────────────────

    @GetMapping("/notifications")
    public ResponseEntity<List<Notification>> getNotifications(
            @RequestParam(defaultValue = "30") int limit,
            @RequestParam(defaultValue = "0") int offset,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        int safeLimit  = Math.min(Math.max(limit, 1), 100);
        int safeOffset = Math.max(offset, 0);
        return ResponseEntity.ok(social.getNotifications(session.userId, safeLimit, safeOffset));
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

        int rows = social.markRead(id, session.userId);
        return rows > 0 ? ResponseEntity.ok("Marked read.") : ResponseEntity.status(HttpStatus.NOT_FOUND).body("Notification not found.");
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

        int rows = social.deleteNotification(id, session.userId);
        return rows > 0 ? ResponseEntity.ok("Deleted.") : ResponseEntity.status(HttpStatus.NOT_FOUND).body("Notification not found.");
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
