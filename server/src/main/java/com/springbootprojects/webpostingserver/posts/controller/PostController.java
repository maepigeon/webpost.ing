package com.springbootprojects.webpostingserver.posts.controller;

import java.util.ArrayList;
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


@RestController
@RequestMapping("/api")
public class PostController {
    @Autowired PostRepository postRepository;
    @Autowired LoginRepository loginRepository;
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
            List<Post> posts = new ArrayList<>();

            if (title == null)
                postRepository.findAll().forEach(posts::add);
            else
                postRepository.findByTitleContaining(title).forEach(posts::add);

            if (posts.isEmpty()) {
                return new ResponseEntity<>(HttpStatus.NO_CONTENT);
            }

            return new ResponseEntity<>(posts, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(null, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @GetMapping("/posts/{id}")
    public ResponseEntity<Post> getPostById(@PathVariable("id") long id) {
        Post post = postRepository.findById(id);

        if (post != null) {
            return new ResponseEntity<>(post, HttpStatus.OK);
        } else {
            return new ResponseEntity<>(HttpStatus.NOT_FOUND);
        }
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
    public ResponseEntity<List<Post>> getPostsByUser(@PathVariable("username") String username) {
        System.out.println("Attempting to get posts by user: " + username);
        List<Post> posts = postRepository.getPostsFromUsername(username);

        if (posts != null) {
            System.out.println("Found posts: " + posts.size());
            return new ResponseEntity<>(posts, HttpStatus.OK);
        } else {
            return new ResponseEntity<>(HttpStatus.NOT_FOUND);
        }
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
            if (!PatternValidator.isValid(post.getBackgroundPattern())) {
                return new ResponseEntity<>("Invalid background pattern", HttpStatus.BAD_REQUEST);
            }
            System.out.println("Authorized post creation for user " + username);
            try {
                int userId = loginResult.userId;
                System.out.println("User ID: " + userId);
                int postId = postRepository.save(post, userId);
                syncPostUploads(postId, post.getDescription());
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
        if (!PatternValidator.isValid(post.getBackgroundPattern())) {
            return new ResponseEntity<>("Invalid background pattern", HttpStatus.BAD_REQUEST);
        }
        Post _post = postRepository.findById(id);
        if (_post != null) {
            _post.setId((int) id);
            _post.setTitle(post.getTitle());
            _post.setDescription(post.getDescription());
            _post.setPublished(post.isPublished());
            _post.setDate(post.getDate());
            _post.setBackgroundPattern(post.getBackgroundPattern());
            postRepository.update(_post);
            syncPostUploads(id, post.getDescription());
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