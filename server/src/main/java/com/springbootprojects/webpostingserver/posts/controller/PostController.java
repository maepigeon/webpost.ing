package com.springbootprojects.webpostingserver.posts.controller;

import java.util.ArrayList;
import java.util.List;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.Post;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;

import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;


@CrossOrigin(origins = "http://localhost:5173", allowCredentials = "true")
@RestController
@RequestMapping("/api")
public class PostController {
    @Autowired
    PostRepository postRepository;

    @Autowired
    LoginRepository loginRepository;

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
        AuthSession loginResult = loginRepository.authorize(username, token);
        System.out.println("Attempting to create a new post");
        if (loginResult != null) {
            System.out.println("Authorized post creation for user " + username);
            try {
                int userId = loginResult.userId;
                System.out.println("User ID: " + userId);
                postRepository.save(post, userId);
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
    public ResponseEntity<String> updatePost(@PathVariable("id") long id, @RequestBody Post post) {
        Post _post = postRepository.findById(id);

        if (_post != null) {
            _post.setId((int)id);
            _post.setTitle(post.getTitle());
            _post.setDescription(post.getDescription());
            _post.setPublished(post.isPublished());
            _post.setDate(post.getDate());

            postRepository.update(_post);
            return new ResponseEntity<>("Post was updated successfully.", HttpStatus.OK);
        } else {
            return new ResponseEntity<>("Cannot find Post with id=" + id, HttpStatus.NOT_FOUND);
        }
    }

    @DeleteMapping("/posts/{id}")
    public ResponseEntity<String> deletePost(@PathVariable("id") long id) {
        try {
            int result = postRepository.deleteById(id);
            if (result == 0) {
                return new ResponseEntity<>("Cannot find Post with id=" + id, HttpStatus.OK);
            }
            return new ResponseEntity<>("Post was deleted successfully.", HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>("Cannot delete Post.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @DeleteMapping("/posts")
    public ResponseEntity<String> deleteAllPosts() {
        try {
            int numRows = postRepository.deleteAll();
            return new ResponseEntity<>("Deleted " + numRows + " Post(s) successfully.", HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>("Cannot delete Posts.", HttpStatus.INTERNAL_SERVER_ERROR);
        }

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