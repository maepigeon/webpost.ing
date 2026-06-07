package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.Comment;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class DiscussionController {

    @Autowired
    private SocialRepository social;

    @Autowired
    private LoginRepository loginRepository;

    @Autowired
    private PostRepository postRepository;

    // ── Feature status (what's enabled on this post) ─────────────────────────

    @GetMapping("/posts/{postId}/features")
    public ResponseEntity<Map<String, Object>> getFeatures(@PathVariable int postId) {
        Map<String, Object> body = new HashMap<>();
        body.put("discussionEnabled", social.isDiscussionEnabled(postId));
        body.put("reactionsEnabled", social.isReactionsEnabled(postId));
        body.put("discussionStyle", social.getDiscussionStyle(postId));
        return ResponseEntity.ok(body);
    }

    @PutMapping("/posts/{postId}/discussion/style")
    public ResponseEntity<String> setDiscussionStyle(
            @PathVariable int postId,
            @RequestBody Map<String, String> body,
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(username, token);
        if (session == null) return unauthorized();

        LoginInfo owner = postRepository.getUsernameFromPostId(postId);
        if (owner == null || !owner.compareUsername(username)) return forbidden();

        String style = body.get("style");
        if (!"threaded".equals(style) && !"flat".equals(style)) return ResponseEntity.badRequest().body("Style must be 'threaded' or 'flat'.");
        social.setDiscussionStyle(postId, style);
        return ResponseEntity.ok("Style set to " + style + ".");
    }

    // ── Discussion enabled state ──────────────────────────────────────────────

    @GetMapping("/posts/{postId}/discussion")
    public ResponseEntity<Map<String, Object>> getDiscussionStatus(@PathVariable int postId) {
        boolean enabled = social.isDiscussionEnabled(postId);
        Map<String, Object> body = new HashMap<>();
        body.put("enabled", enabled);
        return ResponseEntity.ok(body);
    }

    @PutMapping("/posts/{postId}/reactions/enabled")
    public ResponseEntity<String> setReactionsEnabled(
            @PathVariable int postId,
            @RequestBody Map<String, Boolean> body,
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(username, token);
        if (session == null) return unauthorized();

        LoginInfo owner = postRepository.getUsernameFromPostId(postId);
        if (owner == null || !owner.compareUsername(username))
            return forbidden();

        boolean enabled = Boolean.TRUE.equals(body.get("enabled"));
        social.setReactionsEnabled(postId, enabled);
        return ResponseEntity.ok(enabled ? "Reactions enabled." : "Reactions disabled.");
    }

    @PutMapping("/posts/{postId}/discussion")
    public ResponseEntity<String> setDiscussionEnabled(
            @PathVariable int postId,
            @RequestBody Map<String, Boolean> body,
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(username, token);
        if (session == null) return unauthorized();

        LoginInfo owner = postRepository.getUsernameFromPostId(postId);
        if (owner == null || !owner.compareUsername(username))
            return forbidden();

        boolean enabled = Boolean.TRUE.equals(body.get("enabled"));
        social.setDiscussionEnabled(postId, enabled);
        return ResponseEntity.ok(enabled ? "Discussion enabled." : "Discussion disabled.");
    }

    // ── Comments ──────────────────────────────────────────────────────────────

    @GetMapping("/posts/{postId}/comments")
    public ResponseEntity<List<Comment>> getComments(
            @PathVariable int postId,
            @RequestParam(defaultValue = "recent") String sort,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token) {

        if (!social.isDiscussionEnabled(postId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).<List<Comment>>build();

        int userId = 0;
        if (username != null && token != null) {
            AuthSession s = authorize(username, token);
            if (s != null) userId = s.userId;
        }
        return ResponseEntity.ok(social.getComments(postId, sort, userId));
    }

    @PostMapping("/posts/{postId}/comments")
    public ResponseEntity<Map<String, Object>> addComment(
            @PathVariable int postId,
            @RequestBody Map<String, Object> body,
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(username, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).<Map<String, Object>>build();

        if (!social.isDiscussionEnabled(postId))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).<Map<String, Object>>build();

        String content = (String) body.get("content");
        if (content == null || content.isBlank())
            return ResponseEntity.badRequest().<Map<String, Object>>build();

        Integer parentId = body.get("parentId") != null ? ((Number) body.get("parentId")).intValue() : null;
        int commentId = social.addComment(postId, parentId, session.userId, content.trim());

        // Notify post owner if commenter is not the owner
        LoginInfo postOwner = postRepository.getUsernameFromPostId(postId);
        if (postOwner != null && !postOwner.compareUsername(username)) {
            int ownerId = social.getUserIdByUsername(postOwner.getUsername());
            social.createNotification(ownerId, "comment", username, postId, commentId);
        }

        Map<String, Object> resp = new HashMap<>();
        resp.put("id", commentId);
        return ResponseEntity.status(HttpStatus.CREATED).body(resp);
    }

    @PutMapping("/comments/{commentId}")
    public ResponseEntity<String> editComment(
            @PathVariable int commentId,
            @RequestBody Map<String, String> body,
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(username, token);
        if (session == null) return unauthorized();

        String content = body.get("content");
        if (content == null || content.isBlank()) return ResponseEntity.badRequest().<String>build();

        int updated = social.editComment(commentId, session.userId, content.trim());
        return updated > 0 ? ResponseEntity.ok("Updated.") : forbidden();
    }

    @DeleteMapping("/comments/{commentId}")
    public ResponseEntity<String> deleteComment(
            @PathVariable int commentId,
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(username, token);
        if (session == null) return unauthorized();

        int deleted = social.deleteComment(commentId, session.userId);
        return deleted > 0 ? ResponseEntity.ok("Deleted.") : forbidden();
    }

    // ── Comment reactions ──────────────────────────────────────────────────────

    /** Toggle a comment reaction on/off. Multiple reactions per user are allowed. */
    @PostMapping("/comments/{commentId}/reactions")
    public ResponseEntity<String> toggleCommentReaction(
            @PathVariable int commentId,
            @RequestBody Map<String, String> body,
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(username, token);
        if (session == null) return unauthorized();

        String reaction = body.get("reaction");
        if (reaction == null || reaction.isBlank() || reaction.length() > 20)
            return ResponseEntity.badRequest().<String>build();

        social.toggleCommentReaction(commentId, session.userId, reaction.trim());
        return ResponseEntity.ok("Reaction toggled.");
    }

    @PostMapping("/comments/{commentId}/vote")
    public ResponseEntity<String> voteComment(
            @PathVariable int commentId,
            @RequestBody Map<String, Integer> body,
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        AuthSession session = authorize(username, token);
        if (session == null) return unauthorized();

        Integer vote = body.get("vote");
        if (vote == null || (vote != 1 && vote != -1 && vote != 0))
            return ResponseEntity.badRequest().<String>build();

        if (vote == 0) social.removeVote(commentId, session.userId);
        else social.voteComment(commentId, session.userId, vote);

        return ResponseEntity.ok("Vote recorded.");
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

    private ResponseEntity<String> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Forbidden");
    }
}
