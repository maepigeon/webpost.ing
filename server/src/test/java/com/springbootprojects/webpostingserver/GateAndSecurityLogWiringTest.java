package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.AuthController;
import com.springbootprojects.webpostingserver.posts.controller.DiscussionController;
import com.springbootprojects.webpostingserver.posts.controller.SocialController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;
import com.springbootprojects.webpostingserver.posts.service.PostingGate;
import com.springbootprojects.webpostingserver.posts.service.SecurityLog;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** The email-verification posting gate and the security log are wired into the controllers. */
@ExtendWith(MockitoExtension.class)
class GateAndSecurityLogWiringTest {

    @Mock LoginRepository loginRepository;
    @Mock SocialRepository social;
    @Mock PostRepository postRepository;
    @Mock PostingGate postingGate;
    @Mock SecurityLog securityLog;
    @Mock com.springbootprojects.webpostingserver.posts.service.EmailNotificationService emailNotifications;
    @Mock org.springframework.jdbc.core.JdbcTemplate jdbc;

    @InjectMocks AuthController authController;
    @InjectMocks SocialController socialController;
    @InjectMocks DiscussionController discussionController;

    private AuthSession signedIn(String name) throws Exception {
        AuthSession s = new AuthSession(name);
        s.userId = 42;
        when(loginRepository.authorize(name, "tok")).thenReturn(s);
        when(postingGate.mustVerifyFirst(42)).thenReturn(true);
        lenient().when(postingGate.refusal()).thenReturn(
                ResponseEntity.status(HttpStatus.FORBIDDEN).body(PostingGate.MESSAGE));
        return s;
    }

    @Test
    void commentIsRefusedUntilEmailIsConfirmed() throws Exception {
        signedIn("gate_c");
        ResponseEntity<Map<String, Object>> r = discussionController.addComment(1, Map.of("content", "hi"), "gate_c", "tok");
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(r.getBody()).containsEntry("message", PostingGate.MESSAGE);
        verify(social, never()).addComment(anyInt(), any(), anyInt(), anyString());
    }

    @Test
    void followIsRefusedUntilEmailIsConfirmed() throws Exception {
        signedIn("gate_f");
        ResponseEntity<String> r = socialController.follow("someone", "gate_f", "tok");
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(r.getBody()).isEqualTo(PostingGate.MESSAGE);
        verify(social, never()).follow(anyInt(), anyInt());
    }

    @Test
    void signInSuccessIsRecorded() {
        AuthSession result = new AuthSession("log_ok");
        result.userId = 9;
        result.token = "t";
        result.loginHttpStatusCodeResult = HttpStatus.OK;
        when(loginRepository.login(any(LoginInfo.class))).thenReturn(result);
        LoginInfo info = new LoginInfo();
        info.setUsername("log_ok");
        info.setPassword("x");
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRemoteAddr("203.0.113.77");

        ResponseEntity<String> r = authController.loginSessionAttempt(info, req, new MockHttpServletResponse());

        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(securityLog).record(9, "sign_in", null, req);
    }
}
