package com.springbootprojects.webpostingserver.posts.controller;

import java.util.HashSet;
import java.util.List;
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
            LoginInfo owner = postRepository.getUsernameFromPostId((int) id);
            if (owner == null || !owner.compareUsername(username))
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
            System.out.println("Authorized post creation for user " + username);
            try {
                int userId = loginResult.userId;
                System.out.println("User ID: " + userId);
                int postId = postRepository.save(post, userId);
                syncPostUploads(postId, post.getDescription());
                if (post.isPublished()) social.notifyFollowers(userId, username, postId);
                return new ResponseEntity<>("Post was created successfully.", HttpStatus.CREATED);
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
            postRepository.update(_post);
            syncPostUploads(id, post.getDescription());
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