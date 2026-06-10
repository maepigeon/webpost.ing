package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.DiscussionController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.Comment;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;
import org.springframework.jdbc.core.JdbcTemplate;
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
class DiscussionControllerTest {

    @Mock SocialRepository social;
    @Mock LoginRepository loginRepository;
    @Mock PostRepository postRepository;
    @Mock JdbcTemplate jdbc;

    @InjectMocks DiscussionController discussionController;

    private AuthSession whiskersSession;
    private LoginInfo whiskersOwner;
    private LoginInfo mittensOwner;

    @BeforeEach
    void setUp() {
        whiskersSession = new AuthSession("whiskers");
        whiskersSession.userId = 1;

        whiskersOwner = new LoginInfo();
        whiskersOwner.setUsername("whiskers");

        mittensOwner = new LoginInfo();
        mittensOwner.setUsername("mittens");
    }

    // ── GET /posts/{postId}/features ──────────────────────────────────────────

    @Test
    void getFeatures_returnsAllFlags() {
        when(social.isDiscussionEnabled(10)).thenReturn(true);
        when(social.isReactionsEnabled(10)).thenReturn(false);
        when(social.getDiscussionStyle(10)).thenReturn("threaded");
        ResponseEntity<Map<String, Object>> resp = discussionController.getFeatures(10);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsEntry("discussionEnabled", true);
        assertThat(resp.getBody()).containsEntry("reactionsEnabled", false);
        assertThat(resp.getBody()).containsEntry("discussionStyle", "threaded");
    }

    // ── GET /posts/{postId}/comments ──────────────────────────────────────────

    @Test
    void getComments_discussionDisabled_returns403() {
        when(social.isDiscussionEnabled(10)).thenReturn(false);
        ResponseEntity<List<Comment>> resp = discussionController.getComments(10, "recent", null, null);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void getComments_enabled_returns200() {
        when(social.isDiscussionEnabled(10)).thenReturn(true);
        when(social.getComments(10, "recent", 0)).thenReturn(List.of());
        ResponseEntity<List<Comment>> resp = discussionController.getComments(10, "recent", null, null);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void getComments_authenticated_passesUserId() throws Exception {
        when(social.isDiscussionEnabled(10)).thenReturn(true);
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.getComments(10, "recent", 1)).thenReturn(List.of());
        ResponseEntity<List<Comment>> resp = discussionController.getComments(10, "recent", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).getComments(10, "recent", 1);
    }

    // ── POST /posts/{postId}/comments ─────────────────────────────────────────

    @Test
    void addComment_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("stray", "bad")).thenReturn(null);
        ResponseEntity<Map<String, Object>> resp = discussionController.addComment(
                10, Map.of("content", "hello"), "stray", "bad");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void addComment_discussionDisabled_returns403() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.isDiscussionEnabled(10)).thenReturn(false);
        ResponseEntity<Map<String, Object>> resp = discussionController.addComment(
                10, Map.of("content", "hello"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void addComment_emptyContent_returns400() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.isDiscussionEnabled(10)).thenReturn(true);
        ResponseEntity<Map<String, Object>> resp = discussionController.addComment(
                10, Map.of("content", ""), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void addComment_contentTooLong_returns400() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.isDiscussionEnabled(10)).thenReturn(true);
        ResponseEntity<Map<String, Object>> resp = discussionController.addComment(
                10, Map.of("content", "a".repeat(10_001)), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void addComment_valid_returns201WithId() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.isDiscussionEnabled(10)).thenReturn(true);
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), eq(1))).thenReturn(false);
        when(social.addComment(10, null, 1, "great post")).thenReturn(42);
        when(postRepository.getUsernameFromPostId(10)).thenReturn(mittensOwner);
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        ResponseEntity<Map<String, Object>> resp = discussionController.addComment(
                10, Map.of("content", "great post"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(resp.getBody()).containsEntry("id", 42);
    }

    @Test
    void addComment_notifiesPostOwner() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.isDiscussionEnabled(10)).thenReturn(true);
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), eq(1))).thenReturn(false);
        when(social.addComment(10, null, 1, "great post")).thenReturn(42);
        when(postRepository.getUsernameFromPostId(10)).thenReturn(mittensOwner);
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        discussionController.addComment(10, Map.of("content", "great post"), "whiskers", "tok");
        verify(social).createNotification(2, "comment", "whiskers", 10, 42);
    }

    @Test
    void addComment_ownPost_doesNotNotify() throws Exception {
        // alice comments on her own post — no notification
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.isDiscussionEnabled(10)).thenReturn(true);
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), eq(1))).thenReturn(false);
        when(social.addComment(10, null, 1, "my own post")).thenReturn(43);
        when(postRepository.getUsernameFromPostId(10)).thenReturn(whiskersOwner);
        discussionController.addComment(10, Map.of("content", "my own post"), "whiskers", "tok");
        verify(social, never()).createNotification(anyInt(), eq("comment"), anyString(), anyInt(), anyInt());
    }

    // ── PUT /comments/{commentId} ─────────────────────────────────────────────

    @Test
    void editComment_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("stray", "bad")).thenReturn(null);
        ResponseEntity<String> resp = discussionController.editComment(5, Map.of("content", "edit"), "stray", "bad");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void editComment_notOwner_returns403() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.editComment(5, 1, "edit")).thenReturn(0); // 0 rows = not owner
        ResponseEntity<String> resp = discussionController.editComment(5, Map.of("content", "edit"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void editComment_owner_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.editComment(5, 1, "fixed")).thenReturn(1); // 1 row = owner
        ResponseEntity<String> resp = discussionController.editComment(5, Map.of("content", "fixed"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void editComment_emptyContent_returns400() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        ResponseEntity<String> resp = discussionController.editComment(5, Map.of("content", ""), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    // ── DELETE /comments/{commentId} ──────────────────────────────────────────

    @Test
    void deleteComment_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("stray", "bad")).thenReturn(null);
        ResponseEntity<String> resp = discussionController.deleteComment(5, "stray", "bad");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void deleteComment_notOwner_returns403() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.getCommentInfoForLog(5, 1)).thenReturn(null);
        when(social.deleteComment(5, 1)).thenReturn(0); // 0 rows = not owner
        ResponseEntity<String> resp = discussionController.deleteComment(5, "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void deleteComment_owner_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(social.getCommentInfoForLog(5, 1)).thenReturn(null);
        when(social.deleteComment(5, 1)).thenReturn(1);
        ResponseEntity<String> resp = discussionController.deleteComment(5, "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    // ── PUT /posts/{postId}/discussion/style ──────────────────────────────────

    @Test
    void setDiscussionStyle_nonOwner_returns403() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(postRepository.getUsernameFromPostId(10)).thenReturn(mittensOwner);
        ResponseEntity<String> resp = discussionController.setDiscussionStyle(
                10, Map.of("style", "flat"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void setDiscussionStyle_invalidStyle_returns400() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(postRepository.getUsernameFromPostId(10)).thenReturn(whiskersOwner);
        ResponseEntity<String> resp = discussionController.setDiscussionStyle(
                10, Map.of("style", "random"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void setDiscussionStyle_owner_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(postRepository.getUsernameFromPostId(10)).thenReturn(whiskersOwner);
        ResponseEntity<String> resp = discussionController.setDiscussionStyle(
                10, Map.of("style", "flat"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).setDiscussionStyle(10, "flat");
    }

    // ── PUT /posts/{postId}/reactions/enabled ─────────────────────────────────

    @Test
    void setReactionsEnabled_nonOwner_returns403() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(postRepository.getUsernameFromPostId(10)).thenReturn(mittensOwner);
        ResponseEntity<String> resp = discussionController.setReactionsEnabled(
                10, Map.of("enabled", false), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void setReactionsEnabled_owner_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(postRepository.getUsernameFromPostId(10)).thenReturn(whiskersOwner);
        ResponseEntity<String> resp = discussionController.setReactionsEnabled(
                10, Map.of("enabled", true), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).setReactionsEnabled(10, true);
    }

    // ── PUT /posts/{postId}/discussion ────────────────────────────────────────

    @Test
    void setDiscussionEnabled_nonOwner_returns403() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(postRepository.getUsernameFromPostId(10)).thenReturn(mittensOwner);
        ResponseEntity<String> resp = discussionController.setDiscussionEnabled(
                10, Map.of("enabled", false), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void setDiscussionEnabled_owner_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(postRepository.getUsernameFromPostId(10)).thenReturn(whiskersOwner);
        ResponseEntity<String> resp = discussionController.setDiscussionEnabled(
                10, Map.of("enabled", false), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).setDiscussionEnabled(10, false);
    }

    // ── POST /comments/{commentId}/reactions ──────────────────────────────────

    @Test
    void toggleCommentReaction_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("stray", "bad")).thenReturn(null);
        ResponseEntity<String> resp = discussionController.toggleCommentReaction(
                5, Map.of("reaction", "👍"), "stray", "bad");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void toggleCommentReaction_invalidEmoji_returns400() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        ResponseEntity<String> resp = discussionController.toggleCommentReaction(
                5, Map.of("reaction", "<script>"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verify(social, never()).toggleCommentReaction(anyInt(), anyInt(), anyString());
    }

    @Test
    void toggleCommentReaction_validEmoji_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        ResponseEntity<String> resp = discussionController.toggleCommentReaction(
                5, Map.of("reaction", "👍"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).toggleCommentReaction(5, 1, "👍");
    }

    // ── POST /comments/{commentId}/vote ───────────────────────────────────────

    @Test
    void voteComment_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("stray", "bad")).thenReturn(null);
        ResponseEntity<String> resp = discussionController.voteComment(
                5, Map.of("vote", 1), "stray", "bad");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void voteComment_invalidVote_returns400() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        // 99 is not a valid vote value (only -1, 0, 1)
        ResponseEntity<String> resp = discussionController.voteComment(
                5, Map.of("vote", 99), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void voteComment_upvote_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        ResponseEntity<String> resp = discussionController.voteComment(
                5, Map.of("vote", 1), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).voteComment(5, 1, 1);
    }

    @Test
    void voteComment_removeVote_callsRemove() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        discussionController.voteComment(5, Map.of("vote", 0), "whiskers", "tok");
        verify(social).removeVote(5, 1);
        verify(social, never()).voteComment(anyInt(), anyInt(), anyInt());
    }
}
