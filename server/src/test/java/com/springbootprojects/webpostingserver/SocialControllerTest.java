package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.SocialController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
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

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SocialControllerTest {

    @Mock LoginRepository loginRepository;
    @Mock PostRepository postRepository;
    @Mock SocialRepository social;

    @InjectMocks SocialController socialController;

    private AuthSession whiskersSession;
    private LoginInfo whiskersOwnership;
    private LoginInfo mittensOwnership;

    @BeforeEach
    void setUp() {
        whiskersSession = new AuthSession("whiskers");
        whiskersSession.userId = 1;

        whiskersOwnership = new LoginInfo();
        whiskersOwnership.setUsername("whiskers");

        mittensOwnership = new LoginInfo();
        mittensOwnership.setUsername("mittens");
    }

    // ── Authentication ────────────────────────────────────────────────────────

    @Test
    void toggleReaction_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("stray", "bad")).thenReturn(null);

        ResponseEntity<String> resp = socialController.toggleReaction(
                42, Map.of("reaction", "👍"), "stray", "bad");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(social, never()).toggleReaction(anyInt(), anyInt(), anyString());
    }

    @Test
    void toggleReaction_expiredToken_returns401() throws Exception {
        // The controller's private authorize() catches TokenExpiredException → null → 401
        when(loginRepository.authorize("whiskers", "expired"))
                .thenThrow(new JdbcLoginRepository.TokenExpiredException());

        ResponseEntity<String> resp = socialController.toggleReaction(
                42, Map.of("reaction", "👍"), "whiskers", "expired");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(social, never()).toggleReaction(anyInt(), anyInt(), anyString());
    }

    // ── Self-reaction prevention ──────────────────────────────────────────────

    @Test
    void toggleReaction_selfReaction_returns403() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(postRepository.getUsernameFromPostId(10)).thenReturn(whiskersOwnership);

        ResponseEntity<String> resp = socialController.toggleReaction(
                10, Map.of("reaction", "👍"), "whiskers", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(resp.getBody()).contains("cannot react to your own post");
        verify(social, never()).toggleReaction(anyInt(), anyInt(), anyString());
    }

    @Test
    void toggleReaction_differentUser_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(postRepository.getUsernameFromPostId(10)).thenReturn(mittensOwnership);
        when(social.getUserIdByUsername("mittens")).thenReturn(2);

        ResponseEntity<String> resp = socialController.toggleReaction(
                10, Map.of("reaction", "👍"), "whiskers", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).toggleReaction(10, 1, "👍");
        verify(social).createNotification(2, "reaction", "whiskers", 10, null);
    }

    // ── Emoji validation ──────────────────────────────────────────────────────

    @Test
    void toggleReaction_invalidEmoji_returns400() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        // Emoji validation fires before post owner lookup — no postRepository stub needed

        ResponseEntity<String> resp = socialController.toggleReaction(
                10, Map.of("reaction", "<script>"), "whiskers", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verify(social, never()).toggleReaction(anyInt(), anyInt(), anyString());
    }

    @Test
    void toggleReaction_emptyReaction_returns400() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);

        ResponseEntity<String> resp = socialController.toggleReaction(
                10, Map.of("reaction", ""), "whiskers", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
