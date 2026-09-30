package com.springbootprojects.webpostingserver.posts.controller;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.Post;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;

import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.validator.PatternValidator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;


@RestController
@RequestMapping("/api")
public class PostController {
    // ── Resolving a post from a URL segment ───────────────────────────────────

    /**
     * Finds a post from whatever appears in the URL after the author's name.
     *
     * Three forms all resolve, so no link ever breaks:
     *   /mae/42            — the id
     *   /mae/my-post       — the slug alone
     *   /mae/42-my-post    — the older combined form
     *
     * The id is authoritative when present: a stale or edited slug alongside a
     * valid id still finds the right post. A slug-only lookup is scoped to the
     * named author and ordered by id, so a duplicate — which the save path tries
     * to prevent but cannot guarantee under a race — always resolves to the same
     * post rather than alternating.
     */
    @GetMapping("/users/{username}/resolve/{segment}")
    public ResponseEntity<?> resolvePost(@PathVariable String username, @PathVariable String segment) {
        java.util.regex.Matcher leadingId = java.util.regex.Pattern.compile("^(\\d+)(?:-.*)?$").matcher(segment);

        Integer postId = null;
        if (leadingId.matches()) {
            postId = Integer.valueOf(leadingId.group(1));
        } else {
            List<Integer> matches = jdbc.queryForList("""
                    SELECT p.id
                      FROM posts p
                      JOIN users_posts_junctions j ON j.post_id = p.id
                      JOIN users u ON u.id = j.user_id
                     WHERE u.username = ? AND lower(p.slug) = lower(?)
                     ORDER BY p.id
                     LIMIT 1
                    """, Integer.class, username, segment);
            if (!matches.isEmpty()) postId = matches.get(0);
            else postId = findByTitleSlug(username, segment);
        }

        if (postId == null) return ResponseEntity.notFound().build();

        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT p.id, p.title, p.slug, p.published, COALESCE(u.username, '') AS author
                  FROM posts p
                  LEFT JOIN users_posts_junctions j ON j.post_id = p.id
                  LEFT JOIN users u ON u.id = j.user_id
                 WHERE p.id = ?
                """, postId);
        if (rows.isEmpty()) return ResponseEntity.notFound().build();

        return ResponseEntity.ok(rows.get(0));
    }

    /**
     * Most posts have no stored slug: their links use one derived from the
     * title (see client/src/utils/postUrl.js effectiveSlug). Match those the
     * same way, lowest id first so a repeated title always resolves the same.
     */
    private Integer findByTitleSlug(String username, String segment) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT p.id, p.title
                  FROM posts p
                  JOIN users_posts_junctions j ON j.post_id = p.id
                  JOIN users u ON u.id = j.user_id
                 WHERE u.username = ? AND (p.slug IS NULL OR p.slug = '')
                 ORDER BY p.id
                """, username);
        String wanted = segment.toLowerCase();
        for (Map<String, Object> row : rows) {
            if (wanted.equals(titleSlug((String) row.get("title")))) return (Integer) row.get("id");
        }
        return null;
    }

    /** Mirrors slugify() in client/src/utils/postUrl.js, including its 60-character cap. */
    public static String titleSlug(String title) {
        String slug = normaliseSlug(title);
        if (slug == null) return null;
        if (slug.length() > 60) slug = slug.substring(0, 60).replaceAll("-+$", "");
        return slug;
    }

    /**
     * Finds the author of a post from its id alone, so a bare /123 can be sent
     * on to the post's real address.
     */
    @GetMapping("/posts/{id}/canonical")
    public ResponseEntity<?> canonicalPath(@PathVariable long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT p.id, p.title, p.slug, COALESCE(u.username, '') AS author
                  FROM posts p
                  LEFT JOIN users_posts_junctions j ON j.post_id = p.id
                  LEFT JOIN users u ON u.id = j.user_id
                 WHERE p.id = ?
                """, id);
        if (rows.isEmpty() || String.valueOf(rows.get(0).get("author")).isEmpty())
            return ResponseEntity.notFound().build();
        return ResponseEntity.ok(rows.get(0));
    }

    /**
     * Makes a slug unique among the author's other posts by appending a counter.
     *
     * Posts are now reachable by slug alone, so a duplicate would make one of
     * the two unreachable. Silently adjusting beats rejecting the save: the
     * author cannot see their other slugs from the editor, so "that name is
     * taken" would be a puzzle rather than a prompt.
     */
    private String uniqueSlugFor(String slug, String username, Integer excludePostId) {
        if (slug == null || slug.isBlank()) return null;
        String candidate = slug;
        for (int suffix = 2; suffix < 100; suffix++) {
            List<Integer> clash = jdbc.queryForList("""
                    SELECT p.id
                      FROM posts p
                      JOIN users_posts_junctions j ON j.post_id = p.id
                      JOIN users u ON u.id = j.user_id
                     WHERE u.username = ? AND lower(p.slug) = lower(?) AND (? IS NULL OR p.id <> ?)
                     LIMIT 1
                    """, Integer.class, username, candidate, excludePostId, excludePostId);
            if (clash.isEmpty()) return candidate;
            candidate = slug + "-" + suffix;
        }
        return slug + "-" + System.currentTimeMillis();
    }

    /**
     * Normalises an author-chosen slug, or returns null to fall back to the
     * title.
     *
     * The slug appears in a URL, so it is reduced to lowercase letters, digits
     * and single hyphens rather than rejected — a near-miss should be tidied,
     * not refused. It is not checked for uniqueness: the post id precedes it in
     * the URL, so duplicates are harmless.
     */
    static String normaliseSlug(String raw) {
        if (raw == null) return null;
        String slug = java.text.Normalizer.normalize(raw.trim(), java.text.Normalizer.Form.NFKD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-+)|(-+$)", "");
        if (slug.length() > 80) slug = slug.substring(0, 80).replaceAll("-+$", "");
        return slug.isEmpty() ? null : slug;
    }


    @Autowired private com.springbootprojects.webpostingserver.posts.service.EmailNotificationService emailNotifications;
    @Autowired PostRepository postRepository;
    @Autowired LoginRepository loginRepository;
    @Autowired SocialRepository social;
    @Autowired JdbcTemplate jdbc;

    private static final Pattern UPLOAD_PATTERN = Pattern.compile("/uploads/([^\"\\s]+)");

    private void syncPostUploads(long postId, String description) {
        Set<String> filenames = new HashSet<>();
        if (description != null) {
            Matcher m = UPLOAD_PATTERN.matcher(description);
            while (m.find()) filenames.add(m.group(1));
        }
        jdbc.update("DELETE FROM post_uploads WHERE post_id=?", postId);
        for (String fn : filenames) {
            List<Integer> ids = jdbc.queryForList("SELECT id FROM uploads WHERE filename=?", Integer.class, fn);
            if (!ids.isEmpty()) {
                jdbc.update("INSERT INTO post_uploads(post_id, upload_id) VALUES(?,?) ON CONFLICT DO NOTHING",
                    postId, ids.get(0));
            }
        }
    }

    @GetMapping("/posts")
    public ResponseEntity<List<Post>> getAllPosts(@RequestParam(required = false) String title) {
        try {
            List<Post> posts;
            if (title == null)
                posts = postRepository.findByPublished(true);
            else
                posts = postRepository.findByTitleContaining(title).stream()
                        .filter(Post::isPublished).collect(java.util.stream.Collectors.toList());

            if (posts.isEmpty()) {
                return new ResponseEntity<>(HttpStatus.NO_CONTENT);
            }

            return new ResponseEntity<>(posts, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(null, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @GetMapping("/posts/{id}")
    public ResponseEntity<Post> getPostById(
            @PathVariable("id") long id,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token) {
        Post post = postRepository.findById(id);
        if (post == null) return new ResponseEntity<>(HttpStatus.NOT_FOUND);

        LoginInfo postOwnerInfo = postRepository.getUsernameFromPostId((int) id);

        if (!post.isPublished()) {
            // Draft — only the owner may read it
            if (username == null || token == null) return new ResponseEntity<>(HttpStatus.NOT_FOUND);
            AuthSession session;
            try {
                session = loginRepository.authorize(username, token);
            } catch (JdbcLoginRepository.TokenExpiredException ex) {
                return new ResponseEntity<>(HttpStatus.NOT_FOUND);
            }
            if (session == null) return new ResponseEntity<>(HttpStatus.NOT_FOUND);
            if (postOwnerInfo == null || !postOwnerInfo.compareUsername(username))
                return new ResponseEntity<>(HttpStatus.NOT_FOUND);
        }

        return new ResponseEntity<>(post, HttpStatus.OK);
    }

    @GetMapping("/UserFromPostID/{id}")
    public ResponseEntity<String> getUserByPostID(@PathVariable("id") long id) {
        LoginInfo userLogin = postRepository.getUsernameFromPostId((int)id);

        if (userLogin != null) {
            System.out.println("User " +  userLogin.getUsername() + " found using post ID " + id);
            return new ResponseEntity<>(userLogin.getUsername(), HttpStatus.OK);
        } else {
            return new ResponseEntity<>(HttpStatus.NOT_FOUND);
        }
    }

    @GetMapping("/user/{username}")
    public ResponseEntity<List<Post>> getPostsByUser(
            @PathVariable("username") String username,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "0") int offset,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String authToken) {
        List<Post> posts = postRepository.getPostsFromUsername(username);
        if (posts == null) return new ResponseEntity<>(HttpStatus.NOT_FOUND);

        boolean isOwner = false;
        if (authUsername != null && authUsername.equals(username) && authToken != null) {
            try {
                isOwner = loginRepository.authorize(authUsername, authToken) != null;
            } catch (JdbcLoginRepository.TokenExpiredException ignored) {}
        }

        if (!isOwner) posts = posts.stream().filter(Post::isPublished).collect(java.util.stream.Collectors.toList());

        // Sort newest first, then slice for pagination
        posts.sort((a, b) -> b.getDate().compareTo(a.getDate()));
        int safeLimit  = Math.min(Math.max(limit, 1), 50);
        int safeOffset = Math.max(offset, 0);
        int end = Math.min(safeOffset + safeLimit, posts.size());
        List<Post> page = safeOffset >= posts.size() ? List.of() : posts.subList(safeOffset, end);

        return new ResponseEntity<>(page, HttpStatus.OK);
    }

    /**
     * A published post needs a title; a draft does not.
     *
     * Requiring one on every save meant "Save draft" failed outright on a new
     * post before the writer had thought of a title — which is exactly when a
     * draft is most useful. An untitled draft is saved as "Untitled" and can be
     * named before it is published.
     */
    private static ResponseEntity<String> validatePost(Post post) {
        String title = post.getTitle();
        String desc  = post.getDescription();

        if (title != null && title.length() > 255)
            return new ResponseEntity<>("Title must be 255 characters or fewer.", HttpStatus.BAD_REQUEST);

        if (title == null || title.isBlank()) {
            if (post.isPublished())
                return new ResponseEntity<>("Add a title before publishing.", HttpStatus.BAD_REQUEST);
            post.setTitle("Untitled");
        }
        if (desc != null && desc.length() > 100_000)
            return new ResponseEntity<>("Post content must be under 100,000 characters.", HttpStatus.BAD_REQUEST);
        if (!PatternValidator.isValid(post.getBackgroundPattern()))
            return new ResponseEntity<>("Invalid background pattern", HttpStatus.BAD_REQUEST);
        return null;
    }

    @PostMapping("/posts")
    public ResponseEntity<String> createPost(@RequestBody Post post, @CookieValue(name = "username") String username, @CookieValue(name = "authToken") String token) {
        AuthSession loginResult;
        try {
            loginResult = loginRepository.authorize(username, token);
        } catch (JdbcLoginRepository.TokenExpiredException ex) {
            return loginRepository.deleteCookie();
        }
        System.out.println("Attempting to create a new post");
        if (loginResult != null) {
            ResponseEntity<String> invalid = validatePost(post);
            if (invalid != null) return invalid;
            // Enforce daily post limit from role_limits
            try {
                String role = jdbc.queryForObject("SELECT role FROM users WHERE id=?", String.class, loginResult.userId);
                if (role == null) role = "user";
                Integer maxPerDay = jdbc.queryForObject(
                    "SELECT max_posts_per_day FROM role_limits WHERE role=?", Integer.class, role);
                if (maxPerDay != null && maxPerDay >= 0) {
                    Integer todayCount = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM posts p " +
                        "INNER JOIN users_posts_junctions j ON j.post_id = p.id " +
                        "WHERE j.user_id=? AND p.date >= CURRENT_DATE",
                        Integer.class, loginResult.userId);
                    if (todayCount != null && todayCount >= maxPerDay) {
                        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                            .body("Daily post limit reached (" + maxPerDay + " posts per day).");
                    }
                }
            } catch (Exception ignored) {}
            System.out.println("Authorized post creation for user " + username);
            try {
                int userId = loginResult.userId;
                System.out.println("User ID: " + userId);
                post.setSlug(uniqueSlugFor(normaliseSlug(post.getSlug()), username, null));
                int postId = postRepository.save(post, userId);
                syncPostUploads(postId, post.getDescription());
                social.parseAndSaveHashtags(postId, post.getDescription());
                if (post.isPublished()) {
                    social.votePost(postId, userId, 1);
                    social.notifyFollowers(userId, username, postId);
                    // Email is opt-in per recipient and asynchronous; a mail
                    // failure must not fail the post.
                    emailNotifications.notifyFollowersOfPost(username, post.getTitle(), postId);
                    emailNotifications.sendPublishReceipt(username, post.getTitle(), postId);
                }
                return new ResponseEntity<>(String.valueOf(postId), HttpStatus.CREATED);
            } catch (Exception e) {
                System.out.println("Post creation failed: " + e.getMessage());
                return new ResponseEntity<>("Failed to create post", HttpStatus.INTERNAL_SERVER_ERROR);
            }
        }
        System.out.println("Attempted to create a new post as user " + username + " with a token " + token + ", but authorization failed.");
        return new ResponseEntity<>(null, HttpStatus.FORBIDDEN);
    }

    @PutMapping("/posts/{id}")
    public ResponseEntity<String> updatePost(@PathVariable("id") long id, @RequestBody Post post,
            @CookieValue(name = "username") String username, @CookieValue(name = "authToken") String token) {
        AuthSession loginResult;
        try {
            loginResult = loginRepository.authorize(username, token);
        } catch (JdbcLoginRepository.TokenExpiredException ex) {
            return loginRepository.deleteCookie();
        }
        if (loginResult == null) {
            return new ResponseEntity<>("Unauthorized", HttpStatus.UNAUTHORIZED);
        }
        LoginInfo postOwner = postRepository.getUsernameFromPostId((int) id);
        if (postOwner == null || !postOwner.compareUsername(username)) {
            return new ResponseEntity<>("Forbidden", HttpStatus.FORBIDDEN);
        }
        ResponseEntity<String> invalid = validatePost(post);
        if (invalid != null) return invalid;
        Post _post = postRepository.findById(id);
        if (_post != null) {
            boolean wasPublished = _post.isPublished();
            _post.setId((int) id);
            _post.setTitle(post.getTitle());
            _post.setDescription(post.getDescription());
            _post.setPublished(post.isPublished());
            _post.setDate(post.getDate());
            _post.setBackgroundPattern(post.getBackgroundPattern());
            _post.setFolder(post.getFolder() != null && !post.getFolder().isBlank() ? post.getFolder().trim() : null);
            _post.setSlug(uniqueSlugFor(normaliseSlug(post.getSlug()), username, (int) id));
            postRepository.update(_post);
            syncPostUploads(id, post.getDescription());
            social.parseAndSaveHashtags((int) id, post.getDescription());
            // Notify followers when a draft is published for the first time
            if (!wasPublished && post.isPublished()) {
                int authorId = social.getUserIdByUsername(username);
                if (authorId > 0) social.notifyFollowers(authorId, username, (int) id);
                emailNotifications.notifyFollowersOfPost(username, post.getTitle(), id);
                emailNotifications.sendPublishReceipt(username, post.getTitle(), id);
            }
            return new ResponseEntity<>("Post was updated successfully.", HttpStatus.OK);
        } else {
            return new ResponseEntity<>("Cannot find Post with id=" + id, HttpStatus.NOT_FOUND);
        }
    }

    @DeleteMapping("/posts/{id}")
    public ResponseEntity<String> deletePost(@PathVariable("id") long id,
                         @CookieValue(name = "username") String username, @CookieValue(name = "authToken") String token) {
        //Authorize the user
        AuthSession loginResult;
        try {loginResult = loginRepository.authorize(username, token);}
        catch (JdbcLoginRepository.TokenExpiredException ex) {
            return loginRepository.deleteCookie();
        }
        System.out.println("Attempting delete a post");
        if (loginResult != null) {
            System.out.println("User " + username + " authorized. Attempting to delete post with id: " + id + ". Validating ownership...");
            LoginInfo postOwner = postRepository.getUsernameFromPostId((int)id);
            if (postOwner.compareUsername(username) == false) {
                System.out.println("User " + username + " not authorized to delete " + postOwner.getUsername() + "'s post with ID:" + id);
                return new ResponseEntity<>(HttpStatus.UNAUTHORIZED);
            }

            try {
                // Log deletion before the row is removed (captures title + content)
                Post post = postRepository.findById(id);
                if (post != null) {
                    java.util.Map<String, Object> info = new java.util.HashMap<>();
                    info.put("post_title",  post.getTitle());
                    info.put("post_owner",  username);
                    info.put("post_id",     (int) id);
                    info.put("content",     post.getTitle()); // summary = title for posts
                    int authorId = social.getUserIdByUsername(username);
                    if (authorId > 0) social.logDeletion(authorId, "post", info);
                }
                int result = postRepository.deleteById(id);
                if (result == 0) {
                    return new ResponseEntity<>("Cannot find Post with id=" + id, HttpStatus.OK);
                }
                return new ResponseEntity<>("Post was deleted successfully.", HttpStatus.OK);
            } catch (Exception e) {
                return new ResponseEntity<>("Cannot delete Post.", HttpStatus.INTERNAL_SERVER_ERROR);
            }
        } else {
            return new ResponseEntity<>(HttpStatus.UNAUTHORIZED);
        }
    }

    // ── Pinned posts ──────────────────────────────────────────────────────────

    @GetMapping("/users/{username}/pinned-post")
    public ResponseEntity<Post> getPinnedPost(
            @PathVariable("username") String username,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String authToken) {
        List<Integer> ids = jdbc.queryForList(
                "SELECT pinned_post_id FROM users WHERE username=?", Integer.class, username);
        if (ids.isEmpty() || ids.get(0) == null) return ResponseEntity.notFound().build();
        Post post = postRepository.findById(ids.get(0).longValue());
        if (post == null) return ResponseEntity.notFound().build();
        if (!post.isPublished() && (authUsername == null || !authUsername.equals(username)))
            return ResponseEntity.notFound().build();
        return ResponseEntity.ok(post);
    }

    @PutMapping("/users/{username}/pinned-post")
    public ResponseEntity<String> setPinnedPost(
            @PathVariable("username") String username,
            @RequestBody Map<String, Integer> body,
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
        int postId = body.getOrDefault("postId", 0);
        if (postId <= 0) return new ResponseEntity<>("Invalid postId", HttpStatus.BAD_REQUEST);
        LoginInfo owner = postRepository.getUsernameFromPostId(postId);
        if (owner == null || !owner.compareUsername(username))
            return new ResponseEntity<>("Forbidden", HttpStatus.FORBIDDEN);
        jdbc.update("UPDATE users SET pinned_post_id=? WHERE username=?", postId, username);
        return ResponseEntity.ok("Post pinned");
    }

    @DeleteMapping("/users/{username}/pinned-post")
    public ResponseEntity<String> unpinPost(
            @PathVariable("username") String username,
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
        jdbc.update("UPDATE users SET pinned_post_id=NULL WHERE username=?", username);
        return ResponseEntity.ok("Post unpinned");
    }

    @GetMapping("/hashtags/{tag}/posts")
    public ResponseEntity<List<Map<String, Object>>> getPostsByHashtag(@PathVariable String tag) {
        if (tag == null || tag.isBlank() || tag.length() > 50)
            return ResponseEntity.badRequest().build();
        return ResponseEntity.ok(social.getPostsByHashtag(tag));
    }

    @GetMapping("/hashtags/suggest")
    public ResponseEntity<List<String>> suggestHashtags(@RequestParam(defaultValue = "") String q) {
        if (q.isBlank() || q.length() > 50) return ResponseEntity.ok(List.of());
        List<String> tags = jdbc.queryForList(
            "SELECT tag FROM hashtags WHERE tag LIKE ? ORDER BY tag LIMIT 8",
            String.class, q.toLowerCase().replaceAll("[^a-z0-9_]", "") + "%");
        return ResponseEntity.ok(tags);
    }

    /** Search published posts by title/content, optionally filtered to a specific author. */
    @GetMapping("/search/posts")
    public ResponseEntity<List<Map<String, Object>>> searchPosts(
            @RequestParam(defaultValue = "") String q,
            @RequestParam(required = false)  String from) {

        if (q.isBlank() && (from == null || from.isBlank())) return ResponseEntity.ok(List.of());
        if (q.length() > 200) return ResponseEntity.badRequest().build();
        if (from != null && from.length() > 50)
            from = null; // ignore suspicious from param

        String pattern = "%" + q.trim().replace("%", "\\%").replace("_", "\\_") + "%";

        List<Map<String, Object>> rows;
        if (from != null && !from.isBlank()) {
            rows = jdbc.queryForList(
                "SELECT p.id, p.title, u.username FROM posts p " +
                "JOIN users_posts_junctions j ON j.post_id = p.id " +
                "JOIN users u ON u.id = j.user_id " +
                "WHERE p.published = true " +
                "  AND (p.title ILIKE ? OR p.description ILIKE ?) " +
                "  AND u.username = ? " +
                "ORDER BY p.date DESC LIMIT 25",
                pattern, pattern, from.trim());
        } else if (q.isBlank()) {
            rows = jdbc.queryForList(
                "SELECT p.id, p.title, u.username FROM posts p " +
                "JOIN users_posts_junctions j ON j.post_id = p.id " +
                "JOIN users u ON u.id = j.user_id " +
                "WHERE p.published = true AND u.username = ? " +
                "ORDER BY p.date DESC LIMIT 25",
                from == null ? "" : from.trim());
        } else {
            rows = jdbc.queryForList(
                "SELECT p.id, p.title, u.username FROM posts p " +
                "JOIN users_posts_junctions j ON j.post_id = p.id " +
                "JOIN users u ON u.id = j.user_id " +
                "WHERE p.published = true " +
                "  AND (p.title ILIKE ? OR p.description ILIKE ?) " +
                "ORDER BY p.date DESC LIMIT 25",
                pattern, pattern);
        }
        return ResponseEntity.ok(rows);
    }

    @GetMapping("/posts/published")
    public ResponseEntity<List<Post>> findByPublished() {
        try {
            List<Post> posts = postRepository.findByPublished(true);

            if (posts.isEmpty()) {
                return new ResponseEntity<>(HttpStatus.NO_CONTENT);
            }
            return new ResponseEntity<>(posts, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Bulk-update post sort_order and folder for a user's posts.
     * Body: { "updates": [ { "id": 1, "sortOrder": 0, "folder": null }, ... ] }
     */
    @PutMapping("/users/{username}/posts/order")
    public ResponseEntity<String> updatePostOrder(
            @PathVariable String username,
            @RequestBody Map<String, Object> body,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        if (!authUsername.equals(username))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Forbidden.");
        AuthSession session = null;
        try { session = loginRepository.authorize(authUsername, token); }
        catch (JdbcLoginRepository.TokenExpiredException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized.");
        }
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized.");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> updates = body.get("updates") instanceof List<?> l
            ? (List<Map<String, Object>>) l : List.of();

        for (Map<String, Object> u : updates) {
            if (!(u.get("id") instanceof Number)) continue;
            int postId    = ((Number) u.get("id")).intValue();
            int sortOrder = u.get("sortOrder") instanceof Number n ? n.intValue() : 0;
            String folder = u.get("folder") instanceof String s && !((String) s).isBlank()
                ? ((String) s).trim() : null;
            if (folder != null && folder.length() > 100) folder = folder.substring(0, 100);
            jdbc.update(
                "UPDATE posts SET sort_order=?, folder=? WHERE id=? " +
                "AND EXISTS (SELECT 1 FROM users_posts_junctions WHERE post_id=? AND user_id=?)",
                sortOrder, folder, postId, postId, session.userId);
        }
        return ResponseEntity.ok("Updated.");
    }
}