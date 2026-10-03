package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.SocialController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
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

/** Abuse guards from the open-sign-ups security review: M2, M3, M4, M5 (follow) and the cast/null 400s. */
@ExtendWith(MockitoExtension.class)
class SocialAbuseGuardsTest {

    @Mock com.springbootprojects.webpostingserver.posts.service.EmailNotificationService emailNotifications;
    @Mock LoginRepository loginRepository;
    @Mock com.springbootprojects.webpostingserver.posts.service.PostingGate postingGate;
    @Mock SocialRepository social;
    @Mock PostRepository postRepository;

    @InjectMocks SocialController socialController;

    private AuthSession session; // user 1, "whiskers"

    @BeforeEach
    void setUp() {
        session = new AuthSession("whiskers");
        session.userId = 1;
    }

    private void login() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(session);
    }

    // ── M2: DM blocks on the conversation endpoints ───────────────────────────

    @Test
    void getOrCreateConversation_blocked_returns403AndCreatesNothing() throws Exception {
        login();
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        when(social.isMessageBlocked(2, 1)).thenReturn(true);
        ResponseEntity<Map<String, Object>> resp = socialController.getOrCreateConversation("mittens", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(social, never()).getOrCreateConversation(anyInt(), anyInt());
    }

    @Test
    void sendConversationMessage_blocked_returns403NoMessageNoNotification() throws Exception {
        login();
        when(social.isConversationParticipant(7, 1)).thenReturn(true);
        when(social.getOtherParticipant(7, 1)).thenReturn(2);
        when(social.isMessageBlocked(2, 1)).thenReturn(true);
        ResponseEntity<String> resp = socialController.sendConversationMessage(7, Map.of("content", "hi"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(resp.getBody()).isEqualTo("This user is not accepting messages from you.");
        verify(social, never()).sendConversationMessage(anyInt(), anyInt(), anyString());
        verify(social, never()).sendMessage(anyInt(), anyString(), anyString());
    }

    @Test
    void sendConversationMessage_notBlocked_sendsAndNotifies() throws Exception {
        login();
        when(social.isConversationParticipant(7, 1)).thenReturn(true);
        when(social.getOtherParticipant(7, 1)).thenReturn(2);
        ResponseEntity<String> resp = socialController.sendConversationMessage(7, Map.of("content", "hi"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).sendConversationMessage(7, 1, "hi");
        verify(social).sendMessage(2, "whiskers", "hi");
    }

    // ── M3: reactions on messages ─────────────────────────────────────────────

    @Test
    void dmReaction_messageFromAnotherConversation_returns404() throws Exception {
        login();
        when(social.isConversationParticipant(7, 1)).thenReturn(true);
        when(social.dmMessageInConversation(99, 7)).thenReturn(false);
        ResponseEntity<String> resp = socialController.toggleDmReaction(7, 99, Map.of("reaction", "👍"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        verify(social, never()).toggleDmReaction(anyInt(), anyInt(), anyString());
    }

    @Test
    void dmReaction_nonParticipant_returns404() throws Exception {
        login();
        when(social.isConversationParticipant(7, 1)).thenReturn(false);
        ResponseEntity<String> resp = socialController.toggleDmReaction(7, 5, Map.of("reaction", "👍"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        verify(social, never()).toggleDmReaction(anyInt(), anyInt(), anyString());
    }

    @Test
    void dmReaction_ownMessageInConversation_toggles() throws Exception {
        login();
        when(social.isConversationParticipant(7, 1)).thenReturn(true);
        when(social.dmMessageInConversation(5, 7)).thenReturn(true);
        ResponseEntity<String> resp = socialController.toggleDmReaction(7, 5, Map.of("reaction", "👍"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).toggleDmReaction(5, 1, "👍");
    }

    @Test
    void groupReaction_messageFromAnotherGroup_returns404() throws Exception {
        login();
        when(social.isGroupMember(3, 1)).thenReturn(true);
        when(social.groupMessageInGroup(99, 3)).thenReturn(false);
        ResponseEntity<String> resp = socialController.toggleGroupReaction(3, 99, Map.of("reaction", "👍"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        verify(social, never()).toggleGroupReaction(anyInt(), anyInt(), anyString());
    }

    @Test
    void groupReaction_nonMember_returns404() throws Exception {
        login();
        when(social.isGroupMember(3, 1)).thenReturn(false);
        ResponseEntity<String> resp = socialController.toggleGroupReaction(3, 5, Map.of("reaction", "👍"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        verify(social, never()).toggleGroupReaction(anyInt(), anyInt(), anyString());
    }

    @Test
    void groupReaction_member_toggles() throws Exception {
        login();
        when(social.isGroupMember(3, 1)).thenReturn(true);
        when(social.groupMessageInGroup(5, 3)).thenReturn(true);
        ResponseEntity<String> resp = socialController.toggleGroupReaction(3, 5, Map.of("reaction", "👍"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).toggleGroupReaction(5, 1, "👍");
    }

    // ── M4: groups ────────────────────────────────────────────────────────────

    @Test
    void createGroup_tooManyMembers_returns400() throws Exception {
        login();
        List<String> names = new java.util.ArrayList<>();
        for (int i = 0; i < 50; i++) {
            names.add("u" + i);
            when(social.getUserIdByUsername("u" + i)).thenReturn(100 + i);
        }
        ResponseEntity<Map<String, Object>> resp = socialController.createGroup(
                Map.of("name", "g", "members", names), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verify(social, never()).createGroupConversation(anyString(), anyInt());
    }

    @Test
    void createGroup_dailyCapReached_returns429() throws Exception {
        login();
        when(social.countGroupsCreatedByToday(1)).thenReturn(10);
        ResponseEntity<Map<String, Object>> resp = socialController.createGroup(
                Map.of("name", "g"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        verify(social, never()).createGroupConversation(anyString(), anyInt());
    }

    @Test
    void createGroup_ownedCapReached_returns403() throws Exception {
        login();
        when(social.countGroupsCreatedBy(1)).thenReturn(50);
        ResponseEntity<Map<String, Object>> resp = socialController.createGroup(
                Map.of("name", "g"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(social, never()).createGroupConversation(anyString(), anyInt());
    }

    @Test
    void createGroup_memberHasBlockedCreator_returns403AndCreatesNothing() throws Exception {
        login();
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        when(social.isMessageBlocked(2, 1)).thenReturn(true);
        ResponseEntity<Map<String, Object>> resp = socialController.createGroup(
                Map.of("name", "g", "members", List.of("mittens")), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(social, never()).createGroupConversation(anyString(), anyInt());
    }

    @Test
    void createGroup_memberNeitherFollowsNorChats_returns403() throws Exception {
        login();
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        ResponseEntity<Map<String, Object>> resp = socialController.createGroup(
                Map.of("name", "g", "members", List.of("mittens")), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(social, never()).createGroupConversation(anyString(), anyInt());
    }

    @Test
    void createGroup_followerIsAdded() throws Exception {
        login();
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        when(social.isFollowing(2, 1)).thenReturn(true);
        when(social.createGroupConversation("g", 1)).thenReturn(9);
        ResponseEntity<Map<String, Object>> resp = socialController.createGroup(
                Map.of("name", "g", "members", List.of("mittens")), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).addGroupMember(9, 2);
    }

    @Test
    void createGroup_malformedMembers_returns400() throws Exception {
        login();
        assertThat(socialController.createGroup(Map.of("members", "mittens"), "whiskers", "tok").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(socialController.createGroup(Map.of("members", List.of(1, 2)), "whiskers", "tok").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        verify(social, never()).createGroupConversation(anyString(), anyInt());
    }

    @Test
    void addGroupMember_groupFull_returns400() throws Exception {
        login();
        when(social.isGroupAdmin(3, 1)).thenReturn(true);
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        when(social.countGroupMembers(3)).thenReturn(50);
        ResponseEntity<String> resp = socialController.addGroupMember(3, Map.of("username", "mittens"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verify(social, never()).addGroupMember(anyInt(), anyInt());
    }

    @Test
    void addGroupMember_blockedByInvitee_returns403() throws Exception {
        login();
        when(social.isGroupAdmin(3, 1)).thenReturn(true);
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        when(social.isMessageBlocked(2, 1)).thenReturn(true);
        ResponseEntity<String> resp = socialController.addGroupMember(3, Map.of("username", "mittens"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(social, never()).addGroupMember(anyInt(), anyInt());
    }

    @Test
    void addGroupMember_strangerWithoutFollowOrConversation_returns403() throws Exception {
        login();
        when(social.isGroupAdmin(3, 1)).thenReturn(true);
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        ResponseEntity<String> resp = socialController.addGroupMember(3, Map.of("username", "mittens"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(social, never()).addGroupMember(anyInt(), anyInt());
    }

    @Test
    void addGroupMember_sharedConversation_adds() throws Exception {
        login();
        when(social.isGroupAdmin(3, 1)).thenReturn(true);
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        when(social.sharesConversation(2, 1)).thenReturn(true);
        ResponseEntity<String> resp = socialController.addGroupMember(3, Map.of("username", "mittens"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social).addGroupMember(3, 2);
    }

    // ── M5: follow notifications ──────────────────────────────────────────────

    @Test
    void follow_repeatFollow_doesNotNotify() throws Exception {
        login();
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        when(social.follow(1, 2)).thenReturn(false); // row already existed
        ResponseEntity<String> resp = socialController.follow("mittens", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social, never()).createNotification(anyInt(), anyString(), anyString(), any(), any());
        verifyNoInteractions(emailNotifications);
    }

    @Test
    void follow_refollowWithin24h_doesNotNotifyAgain() throws Exception {
        login();
        when(social.getUserIdByUsername("mittens")).thenReturn(2);
        when(social.follow(1, 2)).thenReturn(true);
        when(social.hasRecentFollowNotification(2, "whiskers")).thenReturn(true);
        ResponseEntity<String> resp = socialController.follow("mittens", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(social, never()).createNotification(anyInt(), anyString(), anyString(), any(), any());
        verifyNoInteractions(emailNotifications);
    }

    // ── Casts and nulls ───────────────────────────────────────────────────────

    @Test
    void votePost_nonNumericVote_returns400() throws Exception {
        login();
        ResponseEntity<Map<String, Object>> resp = socialController.votePost(10, Map.of("vote", "up"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verify(social, never()).votePost(anyInt(), anyInt(), anyInt());
    }

    @Test
    void getMessages_negativeLimit_isClampedToOne() throws Exception {
        login();
        when(social.isConversationParticipant(7, 1)).thenReturn(true);
        socialController.getMessages(7, -5, 0, "whiskers", "tok");
        verify(social).getMessages(7, 1, 0);
    }
}
