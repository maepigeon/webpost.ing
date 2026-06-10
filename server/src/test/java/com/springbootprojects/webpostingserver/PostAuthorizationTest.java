package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.PostController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.model.Post;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/**
 * Tests for post access control: draft hiding and ownership enforcement.
 */
@ExtendWith(MockitoExtension.class)
class PostAuthorizationTest {

    @Mock PostRepository postRepository;
    @Mock LoginRepository loginRepository;
    @Mock SocialRepository social;

    @InjectMocks PostController postController;

    private LoginInfo whiskersOwnership;
    private AuthSession whiskersSession;

    @BeforeEach
    void setUp() {
        whiskersOwnership = new LoginInfo();
        whiskersOwnership.setUsername("whiskers");

        whiskersSession = new AuthSession("whiskers");
        whiskersSession.userId = 1;
    }

    // ── Draft post hiding ─────────────────────────────────────────────────────

    @Test
    void getPostsByUser_draftHiddenFromNonOwner() throws Exception {
        Post published = post(1, "Published", true);
        Post draft     = post(2, "Draft",     false);
        when(postRepository.getPostsFromUsername("whiskers")).thenReturn(new ArrayList<>(List.of(published, draft)));

        // Bob requests Alice's posts (different user — no auth cookies passed)
        ResponseEntity<List<Post>> resp = postController.getPostsByUser(
                "whiskers", 20, 0, null, null);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).hasSize(1);
        assertThat(resp.getBody().get(0).getTitle()).isEqualTo("Published");
    }

    @Test
    void getPostsByUser_ownerSeesOwnDrafts() throws Exception {
        Post published = post(1, "Published", true);
        Post draft     = post(2, "Draft",     false);
        when(postRepository.getPostsFromUsername("whiskers")).thenReturn(new ArrayList<>(List.of(published, draft)));
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);

        ResponseEntity<List<Post>> resp = postController.getPostsByUser(
                "whiskers", 20, 0, "whiskers", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).hasSize(2);
    }

    @Test
    void getPostById_draftReturnedToOwner() throws Exception {
        Post draft = post(5, "My Draft", false);
        when(postRepository.findById(5L)).thenReturn(draft);
        when(postRepository.getUsernameFromPostId(5)).thenReturn(whiskersOwnership);
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);

        ResponseEntity<Post> resp = postController.getPostById(5L, "whiskers", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void getPostById_draftHiddenFromGuest() {
        Post draft = post(5, "My Draft", false);
        when(postRepository.findById(5L)).thenReturn(draft);
        when(postRepository.getUsernameFromPostId(5)).thenReturn(whiskersOwnership);

        // No cookies — guest request
        ResponseEntity<Post> resp = postController.getPostById(5L, null, null);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void getPostById_draftHiddenFromOtherUser() throws Exception {
        Post draft = post(5, "Alice Draft", false);
        LoginInfo mittensOwnership = new LoginInfo();
        mittensOwnership.setUsername("mittens");

        when(postRepository.findById(5L)).thenReturn(draft);
        when(postRepository.getUsernameFromPostId(5)).thenReturn(whiskersOwnership);
        AuthSession mittensSession = new AuthSession("mittens");
        mittensSession.userId = 2;
        when(loginRepository.authorize("mittens", "btok")).thenReturn(mittensSession);

        // Bob tries to read Alice's draft
        ResponseEntity<Post> resp = postController.getPostById(5L, "mittens", "btok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Post post(int id, String title, boolean published) {
        Post p = new Post();
        p.setId(id);
        p.setTitle(title);
        p.setPublished(published);
        p.setDate(new Date());
        return p;
    }
}
