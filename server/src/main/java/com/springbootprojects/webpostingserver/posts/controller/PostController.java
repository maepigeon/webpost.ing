package com.springbootprojects.webpostingserver.posts.controller;

import java.util.ArrayList;
import java.util.List;

import com.springbootprojects.webpostingserver.posts.model.Post;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.springbootprojects.webpostingserver.posts.repository.PostRepository;

@CrossOrigin(origins = "http://localhost:5173")
@RestController
@RequestMapping("/api")
public class PostController {

    @Autowired
    PostRepository postRepository;

    @GetMapping("/posts")
    public ResponseEntity<List<Post>> getAllTutorials(@RequestParam(required = false) String title) {
        try {
            List<Post> posts = new ArrayList<Post>();

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
    public ResponseEntity<Post> getTutorialById(@PathVariable("id") long id) {
        Post post = postRepository.findById(id);

        if (post != null) {
            return new ResponseEntity<>(post, HttpStatus.OK);
        } else {
            return new ResponseEntity<>(HttpStatus.NOT_FOUND);
        }
    }

    @PostMapping("/posts")
    public ResponseEntity<String> createTutorial(@RequestBody Post post) {
        try {
            postRepository.save(new Post(post.getTitle(), post.getDescription(), false));
            return new ResponseEntity<>("Tutorial was created successfully.", HttpStatus.CREATED);
        } catch (Exception e) {
            return new ResponseEntity<>(null, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @PutMapping("/posts/{id}")
    public ResponseEntity<String> updateTutorial(@PathVariable("id") long id, @RequestBody Post post) {
        Post _post = postRepository.findById(id);

        if (_post != null) {
            _post.setId(id);
            _post.setTitle(post.getTitle());
            _post.setDescription(post.getDescription());
            _post.setPublished(post.isPublished());

            postRepository.update(_post);
            return new ResponseEntity<>("Tutorial was updated successfully.", HttpStatus.OK);
        } else {
            return new ResponseEntity<>("Cannot find Tutorial with id=" + id, HttpStatus.NOT_FOUND);
        }
    }

    @DeleteMapping("/posts/{id}")
    public ResponseEntity<String> deleteTutorial(@PathVariable("id") long id) {
        try {
            int result = postRepository.deleteById(id);
            if (result == 0) {
                return new ResponseEntity<>("Cannot find Tutorial with id=" + id, HttpStatus.OK);
            }
            return new ResponseEntity<>("Tutorial was deleted successfully.", HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>("Cannot delete tutorial.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @DeleteMapping("/posts")
    public ResponseEntity<String> deleteAllTutorials() {
        try {
            int numRows = postRepository.deleteAll();
            return new ResponseEntity<>("Deleted " + numRows + " Tutorial(s) successfully.", HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>("Cannot delete tutorials.", HttpStatus.INTERNAL_SERVER_ERROR);
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