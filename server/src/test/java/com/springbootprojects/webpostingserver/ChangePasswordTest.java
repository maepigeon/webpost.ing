package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.AuthController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** A user changing their own password: PUT /users/{username}/password. */
@ExtendWith(MockitoExtension.class)
class ChangePasswordTest {

    private static final String OLD = "Old-password-123";
    private static final String NEW = "New-password-456";

    @Mock LoginRepository loginRepository;
    @Mock SocialRepository social;
    @Mock JdbcTemplate jdbc;
    @InjectMocks AuthController controller;

    private ResponseEntity<?> change(String target, String as, String current, String next) {
        return controller.changeOwnPassword(target, Map.of("currentPassword", current, "newPassword", next), as, "tok");
    }

    private void signedIn(String name) throws Exception {
        when(loginRepository.authorize(name, "tok")).thenReturn(new AuthSession(name));
    }

    @Test
    void changesThePasswordAndEndsEverySession() throws Exception {
        signedIn("pw_ok");
        when(loginRepository.authenticate("pw_ok", OLD)).thenReturn(7);

        assertThat(change("pw_ok", "pw_ok", OLD, NEW).getStatusCode()).isEqualTo(HttpStatus.OK);

        ArgumentCaptor<String> hash = ArgumentCaptor.forClass(String.class);
        verify(jdbc).update(contains("UPDATE users SET password"), hash.capture(), eq("pw_ok"));
        assertThat(new BCryptPasswordEncoder().matches(NEW, hash.getValue())).isTrue();
        verify(loginRepository).evictSession("pw_ok");
    }

    @Test
    void refusesWithoutASession() throws Exception {
        when(loginRepository.authorize("pw_anon", "tok")).thenReturn(null);
        assertThat(change("pw_anon", "pw_anon", OLD, NEW).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verifyNoInteractions(jdbc);
    }

    @Test
    void refusesToChangeSomeoneElses() throws Exception {
        signedIn("pw_me");
        assertThat(change("pw_other", "pw_me", OLD, NEW).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verifyNoInteractions(jdbc);
    }

    @Test
    void refusesAWrongCurrentPassword() throws Exception {
        signedIn("pw_wrong");
        when(loginRepository.authenticate("pw_wrong", "guess")).thenReturn(-1);
        assertThat(change("pw_wrong", "pw_wrong", "guess", NEW).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verifyNoInteractions(jdbc);
        verify(loginRepository, never()).evictSession(anyString());
    }

    @Test
    void refusesAWeakOrUnchangedNewPassword() throws Exception {
        signedIn("pw_weak");
        when(loginRepository.authenticate("pw_weak", OLD)).thenReturn(7);
        assertThat(change("pw_weak", "pw_weak", OLD, "short").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(change("pw_weak", "pw_weak", OLD, OLD).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verifyNoInteractions(jdbc);
    }

    @Test
    void locksOutAfterRepeatedWrongGuesses() throws Exception {
        signedIn("pw_locked");
        when(loginRepository.authenticate("pw_locked", "guess")).thenReturn(-1);
        HttpStatus last = null;
        for (int i = 0; i < 20; i++) last = (HttpStatus) change("pw_locked", "pw_locked", "guess", NEW).getStatusCode();
        assertThat(last).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }
}
