package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.AccountController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.service.SecurityLog;
import com.springbootprojects.webpostingserver.posts.validator.LoginRateLimiter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AccountControllerTest {

    @Mock LoginRepository loginRepository;
    @Mock JdbcTemplate jdbc;
    @Mock SecurityLog securityLog;
    @InjectMocks AccountController controller;

    @TempDir Path uploads;

    @BeforeEach
    void setUp() {
        LoginRateLimiter.clear();
        ReflectionTestUtils.setField(controller, "uploadDir", uploads.toString());
    }

    private void signedIn(String name) throws Exception {
        when(loginRepository.authorize(name, "tok")).thenReturn(new AuthSession(name));
    }

    private void userRow(String name, int id) {
        lenient().when(jdbc.queryForList(eq("SELECT id FROM users WHERE username = ?"), eq(Integer.class), eq(name)))
                .thenReturn(List.of(id));
    }

    private ResponseEntity<?> delete(String name, String password) {
        return controller.deleteOwn(password == null ? Map.of() : Map.of("password", password), name, "tok",
                new MockHttpServletRequest());
    }

    @Test
    void endpointsNeedASession() throws Exception {
        when(loginRepository.authorize(any(), any())).thenReturn(null);
        assertThat(controller.securityEvents("a", "tok").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(controller.sessions("a", "tok").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(controller.endOthers("a", "tok", new MockHttpServletRequest()).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(delete("a", "x").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(loginRepository, never()).deleteUser(any());
    }

    @Test
    void endOthersKeepsThisSessionAndLogsIt() throws Exception {
        signedIn("acc_me");
        userRow("acc_me", 5);
        when(loginRepository.endOtherSessions("acc_me", "tok")).thenReturn(2);
        ResponseEntity<Map<String, Object>> r = controller.endOthers("acc_me", "tok", new MockHttpServletRequest());
        assertThat(r.getBody()).containsEntry("ended", 2);
        verify(securityLog).record(eq(5), eq("sessions_ended"), anyString(), any());
    }

    @Test
    void sessionsReportsACountAndNoToken() throws Exception {
        signedIn("acc_me");
        when(loginRepository.countSessions("acc_me")).thenReturn(3);
        Map<String, Object> body = controller.sessions("acc_me", "tok").getBody();
        assertThat(body).containsEntry("count", 3);
        assertThat(body.toString()).doesNotContain("tok");
    }

    @Test
    void securityEventsAreLabelledAndShortened() throws Exception {
        signedIn("acc_me");
        userRow("acc_me", 5);
        when(securityLog.list(5, 50)).thenReturn(List.of(Map.of("kind", "sign_in", "ip_prefix", "203.0.113.0",
                "user_agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0 Safari/537.36")));
        Map<String, Object> body = controller.securityEvents("acc_me", "tok").getBody();
        List<?> events = (List<?>) body.get("events");
        assertThat(((Map<?, ?>) events.get(0)).get("device")).isEqualTo("Chrome on macOS");
    }

    @Test
    void wrongPasswordIsRefusedAndCounted() throws Exception {
        signedIn("acc_wrong");
        when(loginRepository.authenticate("acc_wrong", "guess")).thenReturn(-1);
        assertThat(delete("acc_wrong", "guess").getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        HttpStatus last = HttpStatus.FORBIDDEN;
        for (int i = 0; i < 30 && last == HttpStatus.FORBIDDEN; i++)
            last = HttpStatus.valueOf(delete("acc_wrong", "guess").getStatusCode().value());
        assertThat(last).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        verify(loginRepository, never()).deleteUser(any());
    }

    @Test
    void lastAdminCannotLeave() throws Exception {
        signedIn("acc_admin");
        userRow("acc_admin", 1);
        when(loginRepository.authenticate("acc_admin", "pw")).thenReturn(1);
        when(loginRepository.isAdmin("acc_admin")).thenReturn(true);
        when(jdbc.queryForObject(contains("is_admin"), eq(Integer.class))).thenReturn(1);
        assertThat(delete("acc_admin", "pw").getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        verify(loginRepository, never()).deleteUser(any());
    }

    @Test
    void deletingRemovesTheAccountItsFilesAndTheSessions() throws Exception {
        signedIn("acc_gone");
        userRow("acc_gone", 9);
        when(loginRepository.authenticate("acc_gone", "pw")).thenReturn(9);
        when(loginRepository.deleteCookie()).thenReturn(ResponseEntity.ok("")); 

        Files.createDirectories(uploads.resolve("avatars"));
        Files.createDirectories(uploads.resolve("headers"));
        Files.createDirectories(uploads.resolve("audio"));
        Path img = Files.writeString(uploads.resolve("aaa.png"), "x");
        Path rend = Files.writeString(uploads.resolve("aaa-480w.png"), "x");
        Path av = Files.writeString(uploads.resolve("avatars/av.png"), "x");
        Path hd = Files.writeString(uploads.resolve("headers/h.png"), "x");
        Path hd2 = Files.writeString(uploads.resolve("headers/h-480w.png"), "x");
        Path au = Files.writeString(uploads.resolve("audio/s.mp3"), "x");
        Path other = Files.writeString(uploads.resolve("someone-else.png"), "x");

        when(jdbc.queryForList(contains("FROM uploads WHERE user_id"), eq(String.class), eq(9)))
                .thenReturn(List.of("aaa.png", "avatar/av.png", "header/h.png", "audio/s.mp3", "../../etc/passwd"));
        when(jdbc.queryForList(contains("upload_variants"), eq(String.class), eq(9)))
                .thenReturn(List.of("aaa-480w.png"));
        when(jdbc.queryForList(contains("avatar_path"), eq(9)))
                .thenReturn(List.of(Map.of("avatar_path", "/uploads/avatars/av.png")));

        assertThat(delete("acc_gone", "pw").getStatusCode()).isEqualTo(HttpStatus.OK);

        verify(loginRepository).deleteUser("acc_gone");
        verify(loginRepository).evictSession("acc_gone");
        for (Path p : List.of(img, rend, av, hd, hd2, au)) assertThat(p).doesNotExist();
        assertThat(other).exists();
    }

    @Test
    void shortensAddressesAndNamesDevices() {
        assertThat(SecurityLog.shortenAddress("203.0.113.77")).isEqualTo("203.0.113.0");
        assertThat(SecurityLog.shortenAddress("2001:db8:1:2:3:4:5:6")).isEqualTo("2001:db8:1::/48");
        assertThat(SecurityLog.shortenAddress("not an address")).isNull();
        assertThat(SecurityLog.deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1"))
                .isEqualTo("Safari on iOS");
        assertThat(SecurityLog.deviceLabel(null)).isEqualTo("Unknown device");
    }
}
