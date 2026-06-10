package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.SocialController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.Notification;
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

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SocialFollowsMessagesTest {

    @Mock LoginRepository loginRepository;
    @Mock SocialRepository social;
    @Mock PostRepository postRepository;

    @InjectMocks SocialController socialController;

    private AuthSession whiskersSession;

    @BeforeEach
    void setUp() {
        whiskersSession = new AuthSession("whiskers");
        whiskersSession.userId = 1;
    }

    // ── GET /users/{username}/followers|following ─────────────────────────────

    @Test
    void getFollowers_userNotFound_returns404() {
        when(social.getUserIdByUsername("ghost")).thenReturn(-1);
        ResponseEntity<List<String>> resp = socialController.getFollowers("ghost");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void getFollowers_validUser_returns200() {
        when(social.getUserIdByUsername("whiskers")).thenReturn(1);
        when(social.getFollowers(1)).thenReturn(List.of("mittens", "pumpkin"));
        ResponseEntity<List<String>> resp = socialController.getFollowers("whiskers");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsExactly("mittens", "pumpkin");
    }

    @Test
    void getFollowing_validUser_returns200() {
        when(social.getUserIdByUsername("whiskers")).thenReturn(1);
        when(social.getFollowing(1)).thenReturn(List.of("mittens"));
        ResponseEntity<List<String>> resp = socialController.getFollowing("whiskers");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsExactly("mittens");
    }

    // ── GET /users/{username}/follow ──────────────────────────────────────────

    @Test
    void getFollowStatus_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("stray", "bad")).thenReturn(null);
        ResponseEntity<Map<String, Object>> resp = socialController.getFollowStatus("mittens", "stray", "bad");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void getFollowStatus_targetNotFound_returns404() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.getUserIdByUsername("ghost")).thenReturn(-1);
        ResponseEntity<Map<String, Object>> resp = socialController.getFollowStatus("ghost", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void getFollowStatus_notFollowing_returnsFalse() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        when(social.isFollowing(1, 2)).thenReturn(false);
        ResponseEntity<Map<String, Object>> resp = socialController.getFollowStatus("mittens", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsEntry("following", false);
        assertThat(resp.getBody()).containsEntry("mutuals", false);
    }

    @Test
    void getFollowStatus_following_returnsTrue() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        when(social.isFollowing(1, 2)).thenReturn(true);
        when(social.isFollowing(2, 1)).thenReturn(false);
        ResponseEntity<Map<String, Object>> resp = socialController.getFollowStatus("mittens", "whiskers", "tok");
        assertThat(resp.getBody()).containsEntry("following", true);
        assertThat(resp.getBody()).containsEntry("mutuals", false);
    }

    // ── POST /users/{username}/follow ─────────────────────────────────────────

    @Test
    void follow_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("stray", "bad")).thenReturn(null);
        ResponseEntity<String> resp = socialController.follow("mittens", "stray", "bad");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(social, never()).follow(anyInt(), anyInt());
    }

    @Test
    void follow_selfFollow_returns400() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.getUserIdByUsername("whiskers")).thenReturn(1);
        ResponseEntity<String> resp = socialController.follow("whiskers", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verify(social, never()).follow(anyInt(), anyInt());
    }

    @Test
    void follow_validUser_returns200AndCreatesNotification() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        ResponseEntity<String> resp = socialController.follow("mittens", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).follow(1, 2);
        verify(social).createNotification(2, "follow", "whiskers", null, null);
    }

    // ── DELETE /users/{username}/follow ───────────────────────────────────────

    @Test
    void unfollow_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("stray", "bad")).thenReturn(null);
        ResponseEntity<String> resp = socialController.unfollow("mittens", "stray", "bad");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void unfollow_valid_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        ResponseEntity<String> resp = socialController.unfollow("mittens", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).unfollow(1, 2);
    }

    // ── POST /users/{username}/message ────────────────────────────────────────

    @Test
    void sendMessage_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("stray", "bad")).thenReturn(null);
        ResponseEntity<String> resp = socialController.sendMessage("mittens", Map.of("message", "hi"), "stray", "bad");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void sendMessage_emptyMessage_returns400() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        ResponseEntity<String> resp = socialController.sendMessage("mittens", Map.of("message", ""), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void sendMessage_tooLong_returns400() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        ResponseEntity<String> resp = socialController.sendMessage(
                "mittens", Map.of("message", "a".repeat(1001)), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void sendMessage_selfMessage_returns400() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.getUserIdByUsername("whiskers")).thenReturn(1);
        ResponseEntity<String> resp = socialController.sendMessage("whiskers", Map.of("message", "hi"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verify(social, never()).sendMessage(anyInt(), anyString(), anyString());
    }

    @Test
    void sendMessage_blockedBySender_returns403() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        when(social.isMessageBlocked(2, 1)).thenReturn(true);
        ResponseEntity<String> resp = socialController.sendMessage("mittens", Map.of("message", "hi"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(social, never()).sendMessage(anyInt(), anyString(), anyString());
    }

    @Test
    void sendMessage_valid_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        when(social.isMessageBlocked(2, 1)).thenReturn(false);
        ResponseEntity<String> resp = socialController.sendMessage("mittens", Map.of("message", "Hello!"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).sendMessage(2, "whiskers", "Hello!");
    }

    // ── POST/DELETE /users/{username}/block-messages ──────────────────────────

    @Test
    void blockMessages_selfBlock_returns400() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.getUserIdByUsername("whiskers")).thenReturn(1);
        ResponseEntity<String> resp = socialController.blockMessages("whiskers", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void blockMessages_valid_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        ResponseEntity<String> resp = socialController.blockMessages("mittens", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).blockMessages(1, 2);
    }

    @Test
    void unblockMessages_valid_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        ResponseEntity<String> resp = socialController.unblockMessages("mittens", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).unblockMessages(1, 2);
    }

    @Test
    void getBlockStatus_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("stray", "bad")).thenReturn(null);
        ResponseEntity<Map<String, Boolean>> resp = socialController.getBlockStatus("mittens", "stray", "bad");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void getBlockStatus_valid_returnsBlockedFalse() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        when(social.isBlockingMessages(1, 2)).thenReturn(false);
        ResponseEntity<Map<String, Boolean>> resp = socialController.getBlockStatus("mittens", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsEntry("blocked", false);
    }

    // ── GET /notifications ────────────────────────────────────────────────────

    @Test
    void getNotifications_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("stray", "bad")).thenReturn(null);
        ResponseEntity<List<Notification>> resp = socialController.getNotifications(30, 0, "stray", "bad");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void getNotifications_valid_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.getNotifications(1, 30, 0)).thenReturn(List.of());
        ResponseEntity<List<Notification>> resp = socialController.getNotifications(30, 0, "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    // ── PUT /notifications/read-all ───────────────────────────────────────────

    @Test
    void markAllRead_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("stray", "bad")).thenReturn(null);
        ResponseEntity<String> resp = socialController.markAllRead("stray", "bad");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void markAllRead_valid_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        ResponseEntity<String> resp = socialController.markAllRead("whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).markAllRead(1);
    }

    // ── DELETE /notifications ─────────────────────────────────────────────────

    @Test
    void clearNotifications_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("stray", "bad")).thenReturn(null);
        ResponseEntity<String> resp = socialController.clearNotifications("stray", "bad");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void clearNotifications_valid_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        ResponseEntity<String> resp = socialController.clearNotifications("whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).clearNotifications(1);
    }

    // ── PUT /notifications/{id}/read ──────────────────────────────────────────

    @Test
    void markRead_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("stray", "bad")).thenReturn(null);
        ResponseEntity<String> resp = socialController.markRead(5, "stray", "bad");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void markRead_notificationNotFound_returns404() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.markRead(5, 1)).thenReturn(0);
        ResponseEntity<String> resp = socialController.markRead(5, "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void markRead_valid_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.markRead(5, 1)).thenReturn(1);
        ResponseEntity<String> resp = socialController.markRead(5, "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
