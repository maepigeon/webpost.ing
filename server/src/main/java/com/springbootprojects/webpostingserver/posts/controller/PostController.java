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

    private static ResponseEntity<String> validatePost(Post post) {
        String title = post.getTitle();
        String desc  = post.getDescription();
        if (title == null || title.isBlank() || title.length() > 255)
            return new ResponseEntity<>("Title must be 1–255 characters.", HttpStatus.BAD_REQUEST);
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
                int postId = postRepository.save(post, userId);
                syncPostUploads(postId, post.getDescription());
                social.parseAndSaveHashtags(postId, post.getDescription());
                if (post.isPublished()) {
                    social.votePost(postId, userId, 1);
                    social.notifyFollowers(userId, username, postId);
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
            postRepository.update(_post);
            syncPostUploads(id, post.getDescription());
            social.parseAndSaveHashtags((int) id, post.getDescription());
            // Notify followers when a draft is published for the first time
            if (!wasPublished && post.isPublished()) {
                int authorId = social.getUserIdByUsername(username);
                if (authorId > 0) social.notifyFollowers(authorId, username, (int) id);
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

    /**
     * Delete all posts
    @DeleteMapping("/posts")
    public ResponseEntity<String> deleteAllPosts() {
        try {
            int numRows = postRepository.deleteAll();
            return new ResponseEntity<>("Deleted " + numRows + " Post(s) successfully.", HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>("Cannot delete Posts.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }*/
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
}