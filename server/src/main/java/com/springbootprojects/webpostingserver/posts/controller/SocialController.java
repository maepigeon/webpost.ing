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

    // ── Direct message conversations ──────────────────────────────────────────

    @GetMapping("/conversations")
    public ResponseEntity<List<Map<String, Object>>> getConversations(
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(social.getConversations(session.userId));
    }

    /** Gets or creates a conversation between the authenticated user and {username}. */
    @PostMapping("/users/{username}/conversation")
    public ResponseEntity<Map<String, Object>> getOrCreateConversation(
            @PathVariable String username,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        int targetId = social.getUserIdByUsername(username);
        if (targetId < 0) return ResponseEntity.notFound().build();
        if (targetId == session.userId) return ResponseEntity.badRequest().build();

        int convId = social.getOrCreateConversation(session.userId, targetId);
        return ResponseEntity.ok(Map.of("id", convId));
    }

    @GetMapping("/conversations/{id}/messages")
    public ResponseEntity<List<Map<String, Object>>> getMessages(
            @PathVariable int id,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!social.isConversationParticipant(id, session.userId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        return ResponseEntity.ok(social.getMessages(id, Math.min(limit, 100), Math.max(offset, 0)));
    }

    @PostMapping("/conversations/{id}/messages")
    public ResponseEntity<String> sendConversationMessage(
            @PathVariable int id,
            @RequestBody Map<String, String> body,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();

        if (!social.isConversationParticipant(id, session.userId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Not a participant.");

        String key = "conv:" + session.userId;
        if (MSG_LIMITER.isBlocked(key))
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body("Too many messages. Try again later.");

        String content = body.get("content");
        if (content == null || content.isBlank() || content.length() > 5000)
            return ResponseEntity.badRequest().body("Message must be 1–5000 characters.");

        social.sendConversationMessage(id, session.userId, content.trim());
        MSG_LIMITER.recordUse(key);

        // Notify the other participant
        int otherId = social.getOtherParticipant(id, session.userId);
        if (otherId > 0) {
            String preview = content.trim().substring(0, Math.min(100, content.trim().length()));
            social.sendMessage(otherId, authUsername, preview);
        }

        return ResponseEntity.ok("Sent.");
    }

    @PutMapping("/conversations/{id}/messages/read")
    public ResponseEntity<String> markConversationRead(
            @PathVariable int id,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();
        if (!social.isConversationParticipant(id, session.userId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Not a participant.");
        social.markConversationRead(id, session.userId);
        return ResponseEntity.ok("Marked read.");
    }

    @GetMapping("/conversations/unread-count")
    public ResponseEntity<Map<String, Integer>> getUnreadMessageCount(
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        int dm = social.getUnreadMessageCount(session.userId);
        int group = social.getTotalGroupUnreadCount(session.userId);
        return ResponseEntity.ok(Map.of("count", dm + group));
    }

    // ── DM reactions ──────────────────────────────────────────────────────────

    @PostMapping("/conversations/{convId}/messages/{msgId}/reactions")
    public ResponseEntity<String> toggleDmReaction(
            @PathVariable int convId,
            @PathVariable int msgId,
            @RequestBody Map<String, String> body,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();
        if (!social.isConversationParticipant(convId, session.userId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Not a participant.");

        String rkey = "dmr:" + session.userId;
        if (REACTION_LIMITER.isBlocked(rkey))
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body("Too many reactions.");

        String reaction = body.get("reaction");
        if (!EmojiValidator.isValid(reaction))
            return ResponseEntity.badRequest().body("Invalid reaction.");

        social.toggleDmReaction(msgId, session.userId, reaction.trim());
        REACTION_LIMITER.recordUse(rkey);
        return ResponseEntity.ok("Toggled.");
    }

    @GetMapping("/conversations/{convId}/reactions")
    public ResponseEntity<Map<Integer, Map<String, Object>>> getConvReactions(
            @PathVariable int convId,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!social.isConversationParticipant(convId, session.userId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        return ResponseEntity.ok(social.getDmReactionsForConversation(convId, session.userId));
    }

    // ── Group conversations ───────────────────────────────────────────────────

    @GetMapping("/groups")
    public ResponseEntity<List<Map<String, Object>>> getGroups(
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(social.getGroupConversations(session.userId));
    }

    @PostMapping("/groups")
    public ResponseEntity<Map<String, Object>> createGroup(
            @RequestBody Map<String, Object> body,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        String name = body.get("name") instanceof String s ? s.trim() : "Group";
        if (name.isBlank() || name.length() > 100) name = "Group";

        int groupId = social.createGroupConversation(name, session.userId);

        @SuppressWarnings("unchecked")
        List<String> members = body.get("members") instanceof List<?> l
            ? (List<String>) l : List.of();
        for (String m : members) {
            if (m.equals(authUsername)) continue;
            int uid = social.getUserIdByUsername(m.trim());
            if (uid > 0) social.addGroupMember(groupId, uid);
        }
        return ResponseEntity.ok(Map.of("id", groupId, "name", name));
    }

    @PostMapping("/groups/{groupId}/members")
    public ResponseEntity<String> addGroupMember(
            @PathVariable int groupId,
            @RequestBody Map<String, String> body,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();
        if (!social.isGroupAdmin(groupId, session.userId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Only admins can add members.");

        String username = body.get("username");
        if (username == null || username.isBlank()) return ResponseEntity.badRequest().body("Username required.");
        int uid = social.getUserIdByUsername(username.trim());
        if (uid < 0) return ResponseEntity.notFound().build();

        social.addGroupMember(groupId, uid);
        return ResponseEntity.ok("Added.");
    }

    @DeleteMapping("/groups/{groupId}/members/{username}")
    public ResponseEntity<String> removeGroupMember(
            @PathVariable int groupId,
            @PathVariable String username,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();

        // Owner (admin) cannot leave — they must transfer ownership first
        boolean isSelf = authUsername.equals(username);
        if (isSelf && social.isGroupAdmin(groupId, session.userId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("You are the group owner. Transfer ownership before leaving.");

        if (!isSelf && !social.isGroupAdmin(groupId, session.userId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Only admins can remove members.");

        int uid = social.getUserIdByUsername(username);
        if (uid < 0) return ResponseEntity.notFound().build();
        social.removeGroupMember(groupId, uid);
        return ResponseEntity.ok("Removed.");
    }

    @GetMapping("/groups/{groupId}/members")
    public ResponseEntity<List<Map<String, Object>>> getGroupMembers(
            @PathVariable int groupId,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!social.isGroupMember(groupId, session.userId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        return ResponseEntity.ok(social.getGroupMembers(groupId));
    }

    @GetMapping("/groups/{groupId}/messages")
    public ResponseEntity<List<Map<String, Object>>> getGroupMessages(
            @PathVariable int groupId,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!social.isGroupMember(groupId, session.userId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        return ResponseEntity.ok(social.getGroupMessages(groupId, Math.min(limit, 100), Math.max(offset, 0)));
    }

    @PostMapping("/groups/{groupId}/messages")
    public ResponseEntity<String> sendGroupMessage(
            @PathVariable int groupId,
            @RequestBody Map<String, String> body,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();
        if (!social.isGroupMember(groupId, session.userId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Not a member.");

        String key = "grp:" + session.userId;
        if (MSG_LIMITER.isBlocked(key))
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body("Too many messages.");

        String content = body.get("content");
        if (content == null || content.isBlank() || content.length() > 5000)
            return ResponseEntity.badRequest().body("Message must be 1–5000 characters.");

        social.sendGroupMessage(groupId, session.userId, content.trim());
        MSG_LIMITER.recordUse(key);
        return ResponseEntity.ok("Sent.");
    }

    @PutMapping("/groups/{groupId}/messages/read")
    public ResponseEntity<String> markGroupRead(
            @PathVariable int groupId,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();
        if (!social.isGroupMember(groupId, session.userId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Not a member.");
        social.markGroupRead(groupId, session.userId);
        return ResponseEntity.ok("Marked read.");
    }

    @PutMapping("/groups/{groupId}")
    public ResponseEntity<String> renameGroup(
            @PathVariable int groupId,
            @RequestBody Map<String, String> body,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();
        if (!social.isGroupAdmin(groupId, session.userId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Only admins can rename.");

        String name = body.get("name");
        if (name == null || name.isBlank() || name.length() > 100)
            return ResponseEntity.badRequest().body("Invalid name.");
        social.renameGroup(groupId, name.trim());
        return ResponseEntity.ok("Renamed.");
    }

    // ── Group reactions ───────────────────────────────────────────────────────

    @PostMapping("/groups/{groupId}/messages/{msgId}/reactions")
    public ResponseEntity<String> toggleGroupReaction(
            @PathVariable int groupId,
            @PathVariable int msgId,
            @RequestBody Map<String, String> body,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();
        if (!social.isGroupMember(groupId, session.userId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Not a member.");

        String key = "grp_rxn:" + session.userId;
        if (REACTION_LIMITER.isBlocked(key))
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body("Too many reactions.");

        String reaction = body.get("reaction");
        if (!EmojiValidator.isValid(reaction))
            return ResponseEntity.badRequest().body("Invalid reaction.");

        social.toggleGroupReaction(msgId, session.userId, reaction.trim());
        REACTION_LIMITER.recordUse(key);
        return ResponseEntity.ok("ok");
    }

    @GetMapping("/groups/{groupId}/reactions")
    public ResponseEntity<Map<Integer, Map<String, Object>>> getGroupReactions(
            @PathVariable int groupId,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!social.isGroupMember(groupId, session.userId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        return ResponseEntity.ok(social.getGroupReactionsForGroup(groupId, session.userId));
    }

    // ── Group ownership transfer ───────────────────────────────────────────────

    @PutMapping("/groups/{groupId}/owner")
    public ResponseEntity<String> transferGroupOwnership(
            @PathVariable int groupId,
            @RequestBody Map<String, String> body,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(authUsername, token);
        if (session == null) return unauthorized();
        if (!social.isGroupAdmin(groupId, session.userId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Only the owner can transfer ownership.");

        String newOwner = body.get("username");
        if (newOwner == null || newOwner.isBlank())
            return ResponseEntity.badRequest().body("Username required.");

        int newOwnerId = social.getUserIdByUsername(newOwner.trim());
        if (newOwnerId < 0) return ResponseEntity.notFound().build();
        if (!social.isGroupMember(groupId, newOwnerId))
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("User is not a member of this group.");
        if (newOwnerId == session.userId)
            return ResponseEntity.badRequest().body("You are already the owner.");

        social.transferGroupOwnership(groupId, newOwnerId);
        return ResponseEntity.ok("Ownership transferred.");
    }

    // ── Post views ────────────────────────────────────────────────────────────

    @PostMapping("/posts/{postId}/view")
    public ResponseEntity<String> recordView(
            @PathVariable int postId,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {

        Integer userId = null;
        if (authUsername != null && token != null) {
            AuthSession s = authorize(authUsername, token);
            if (s != null) userId = s.userId;
        }
        social.recordPostView(postId, userId);
        return ResponseEntity.ok("ok");
    }

    @GetMapping("/posts/{postId}/views")
    public ResponseEntity<Map<String, Object>> getViews(@PathVariable int postId) {
        return ResponseEntity.ok(social.getPostViews(postId));
    }

    // ── Post votes ────────────────────────────────────────────────────────────

    @GetMapping("/posts/{postId}/vote")
    public ResponseEntity<Map<String, Object>> getPostVote(
            @PathVariable int postId,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token) {
        int userId = 0;
        if (username != null && token != null) {
            AuthSession s = authorize(username, token);
            if (s != null) userId = s.userId;
        }
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("score", social.getPostScore(postId));
        result.put("userVote", userId > 0 ? social.getUserPostVote(postId, userId) : 0);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/posts/{postId}/vote")
    public ResponseEntity<Map<String, Object>> votePost(
            @PathVariable int postId,
            @RequestBody Map<String, Object> body,
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {
        AuthSession session = authorize(username, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).<Map<String, Object>>build();
        int vote = body.get("vote") != null ? ((Number) body.get("vote")).intValue() : 0;
        if (vote < -1 || vote > 1) return ResponseEntity.badRequest().<Map<String, Object>>build();
        return ResponseEntity.ok(social.votePost(postId, session.userId, vote));
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
