package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.PostController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.model.Post;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PostControllerTest {

    @Mock PostRepository postRepository;
    @Mock LoginRepository loginRepository;

    @InjectMocks PostController postController;

    private Post samplePost;
    private AuthSession validSession;

    @BeforeEach
    void setUp() {
        samplePost = new Post();
        samplePost.setTitle("Updated title");
        samplePost.setDescription("Updated body");
        samplePost.setPublished(true);

        validSession = new AuthSession("kittycat");
        validSession.userId = 1;
    }

    @Test
    void updatePost_validOwner_returns200() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        LoginInfo owner = new LoginInfo();
        owner.setUsername("kittycat");
        when(postRepository.getUsernameFromPostId(10)).thenReturn(owner);
        Post existing = new Post();
        existing.setId(10);
        when(postRepository.findById(10L)).thenReturn(existing);

        ResponseEntity<String> resp = postController.updatePost(10L, samplePost, "kittycat", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(postRepository).update(existing);
    }

    @Test
    void updatePost_wrongOwner_returns403() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        LoginInfo owner = new LoginInfo();
        owner.setUsername("bob");
        when(postRepository.getUsernameFromPostId(10)).thenReturn(owner);

        ResponseEntity<String> resp = postController.updatePost(10L, samplePost, "kittycat", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(postRepository, never()).update(any());
    }

    @Test
    void updatePost_invalidToken_returns401() throws Exception {
        when(loginRepository.authorize("kittycat", "bad")).thenReturn(null);

        ResponseEntity<String> resp = postController.updatePost(10L, samplePost, "kittycat", "bad");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(postRepository, never()).update(any());
    }

    @Test
    void updatePost_expiredToken_delegates_to_deleteCookie() throws Exception {
        when(loginRepository.authorize("kittycat", "expired"))
                .thenThrow(new JdbcLoginRepository.TokenExpiredException());
        when(loginRepository.deleteCookie()).thenReturn(ResponseEntity.ok().build());

        ResponseEntity<String> resp = postController.updatePost(10L, samplePost, "kittycat", "expired");

        verify(loginRepository).deleteCookie();
        verify(postRepository, never()).update(any());
    }

    @Test
    void updatePost_postNotFound_returns404() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        LoginInfo owner = new LoginInfo();
        owner.setUsername("kittycat");
        when(postRepository.getUsernameFromPostId(99)).thenReturn(owner);
        when(postRepository.findById(99L)).thenReturn(null);

        ResponseEntity<String> resp = postController.updatePost(99L, samplePost, "kittycat", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
}
