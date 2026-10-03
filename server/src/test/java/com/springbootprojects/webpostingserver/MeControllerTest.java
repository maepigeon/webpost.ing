package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.MeController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MeControllerTest {

    @Mock LoginRepository loginRepository;
    @Mock SocialRepository social;
    @Mock JdbcTemplate jdbc;
    @InjectMocks MeController me;

    private AuthSession session;

    @BeforeEach
    void setUp() {
        session = new AuthSession("whiskers");
        session.userId = 7;
    }

    private void counts(int dm, int group, int notifications) {
        when(social.getUnreadMessageCount(7)).thenReturn(dm);
        when(social.getTotalGroupUnreadCount(7)).thenReturn(group);
        when(social.getUnreadCount(7)).thenReturn(notifications);
    }

    @Test
    void returnsBothCountsWithAnEtag() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(session);
        counts(2, 1, 5);

        ResponseEntity<Map<String, Integer>> resp = me.counters("whiskers", "tok", null);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsEntry("messages", 3).containsEntry("notifications", 5);
        assertThat(resp.getHeaders().getETag()).isEqualTo("\"3-5\"");
        assertThat(resp.getHeaders().getCacheControl()).isEqualTo("private, no-cache");
    }

    @Test
    void anUnchangedPollAnswers304WithNoBody() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(session);
        counts(2, 1, 5);

        ResponseEntity<Map<String, Integer>> resp = me.counters("whiskers", "tok", "\"3-5\"");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_MODIFIED);
        assertThat(resp.getBody()).isNull();
        assertThat(resp.getHeaders().getETag()).isEqualTo("\"3-5\"");
    }

    @Test
    void aChangedCountIsSentInFullEvenWhenOldTagsArePresented() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(session);
        counts(0, 0, 6);

        ResponseEntity<Map<String, Integer>> resp = me.counters("whiskers", "tok", "W/\"0-5\", \"3-5\"");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsEntry("notifications", 6);
    }

    @Test
    void weakAndListedTagsMatch() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(session);
        counts(0, 0, 0);

        assertThat(me.counters("whiskers", "tok", "\"9-9\", W/\"0-0\"").getStatusCode())
            .isEqualTo(HttpStatus.NOT_MODIFIED);
    }

    @Test
    void theHeartbeatIsThrottledInSqlAndAlsoRunsOn304() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(session);
        counts(0, 0, 0);

        me.counters("whiskers", "tok", "\"0-0\"");

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).update(sql.capture(), eq(7));
        assertThat(sql.getValue())
            .contains("last_active_at IS NULL")
            .contains("last_active_at < NOW() - INTERVAL '1 minute'");
    }

    @Test
    void aFailedHeartbeatDoesNotHideTheCounts() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(session);
        counts(1, 0, 0);
        when(jdbc.update(anyString(), anyInt())).thenThrow(new DataAccessResourceFailureException("down"));

        ResponseEntity<Map<String, Integer>> resp = me.counters("whiskers", "tok", null);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsEntry("messages", 1);
    }

    @Test
    void anUnknownSessionGets401AndNoWrites() throws Exception {
        when(loginRepository.authorize("stray", "bad")).thenReturn(null);

        assertThat(me.counters("stray", "bad", null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verifyNoInteractions(jdbc, social);
    }

    @Test
    void anExpiredTokenGets401() throws Exception {
        when(loginRepository.authorize("whiskers", "old")).thenThrow(new JdbcLoginRepository.TokenExpiredException());

        assertThat(me.counters("whiskers", "old", null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verifyNoInteractions(jdbc, social);
    }
}
