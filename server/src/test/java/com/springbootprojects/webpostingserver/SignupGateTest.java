package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.AuthController;
import com.springbootprojects.webpostingserver.posts.service.PostingGate;
import com.springbootprojects.webpostingserver.posts.service.SignupGuard;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SignupGateTest {

    // ── PostingGate ──────────────────────────────────────────────────────────

    private JdbcTemplate jdbcWith(String setting, Map<String, Object> user) {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(startsWith("SELECT value FROM system_settings"), eq(String.class), eq("require_verified_email")))
                .thenReturn(setting == null ? List.of() : List.of(setting));
        when(jdbc.queryForList(startsWith("SELECT email_verified"), eq(7)))
                .thenReturn(user == null ? List.of() : List.of(user));
        return jdbc;
    }

    private static final Map<String, Object> UNVERIFIED = Map.of("email_verified", false, "is_admin", false);

    @Test
    void gatesOnlyWhenEverythingLinesUp() {
        assertThat(new PostingGate(jdbcWith("true", UNVERIFIED), true).mustVerifyFirst(7)).isTrue();
    }

    @Test
    void mailOffMeansNoGate() {
        assertThat(new PostingGate(jdbcWith("true", UNVERIFIED), false).mustVerifyFirst(7)).isFalse();
    }

    @Test
    void settingFalseOrAbsentMeansNoGate() {
        assertThat(new PostingGate(jdbcWith("false", UNVERIFIED), true).mustVerifyFirst(7)).isFalse();
        assertThat(new PostingGate(jdbcWith(null, UNVERIFIED), true).mustVerifyFirst(7)).isFalse();
    }

    @Test
    void verifiedUserPasses() {
        assertThat(new PostingGate(jdbcWith("true", Map.of("email_verified", true, "is_admin", false)), true)
                .mustVerifyFirst(7)).isFalse();
    }

    @Test
    void adminPassesEvenUnverified() {
        assertThat(new PostingGate(jdbcWith("true", Map.of("email_verified", false, "is_admin", true)), true)
                .mustVerifyFirst(7)).isFalse();
    }

    @Test
    void refusalIsPlain403() {
        ResponseEntity<String> r = new PostingGate(mock(JdbcTemplate.class), true).refusal();
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(r.getBody()).isEqualTo("Confirm your email address first (Settings → Email).");
    }

    // ── SignupGuard ──────────────────────────────────────────────────────────

    @Test
    void offWithoutSecret() {
        SignupGuard g = new SignupGuard("site", "", (u, b) -> { throw new AssertionError("no call"); });
        assertThat(g.enabled()).isFalse();
        assertThat(g.siteKey()).isNull();
        assertThat(g.verify(null, "1.2.3.4")).isTrue();
    }

    @Test
    void onRequiresTokenAndPassesIpAndSecret() {
        String[] seen = new String[2];
        SignupGuard g = new SignupGuard("site", "sec", (u, b) -> { seen[0] = u; seen[1] = b; return "{\"success\":true}"; });
        assertThat(g.siteKey()).isEqualTo("site");
        assertThat(g.verify(null, "1.2.3.4")).isFalse();
        assertThat(g.verify(" ", "1.2.3.4")).isFalse();
        assertThat(g.verify("tok", "1.2.3.4")).isTrue();
        assertThat(seen[0]).isEqualTo("https://challenges.cloudflare.com/turnstile/v0/siteverify");
        assertThat(seen[1]).contains("secret=sec").contains("response=tok").contains("remoteip=1.2.3.4");
    }

    @Test
    void rejectedOrBrokenFailsClosed() {
        assertThat(new SignupGuard("s", "x", (u, b) -> "{\"success\":false}").verify("t", "ip")).isFalse();
        assertThat(new SignupGuard("s", "x", (u, b) -> "not json").verify("t", "ip")).isFalse();
        assertThat(new SignupGuard("s", "x", (u, b) -> { throw new java.io.IOException("down"); }).verify("t", "ip")).isFalse();
    }

    // ── register wiring ──────────────────────────────────────────────────────

    private AuthController controller(JdbcTemplate jdbc, SignupGuard guard) {
        AuthController c = new AuthController();
        org.springframework.test.util.ReflectionTestUtils.setField(c, "jdbc", jdbc);
        org.springframework.test.util.ReflectionTestUtils.setField(c, "signupGuard", guard);
        return c;
    }

    private static jakarta.servlet.http.HttpServletRequest req() {
        var r = mock(jakarta.servlet.http.HttpServletRequest.class);
        when(r.getRemoteAddr()).thenReturn("127.0.0.1");
        return r;
    }

    private static Map<String, String> body() {
        return new java.util.HashMap<>(Map.of("username", "newbie", "password", "Abcdefgh1234!", "email", "n@x.io"));
    }

    @Test
    void configReportsInviteSettingAndKey() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("invite_required"), eq(String.class))).thenReturn(List.of("false"));
        Map<String, Object> m = controller(jdbc, new SignupGuard("site", "sec", (u, b) -> "{}")).signupConfig();
        assertThat(m.get("inviteRequired")).isEqualTo(false);
        assertThat(m.get("turnstileSiteKey")).isEqualTo("site");

        JdbcTemplate absent = mock(JdbcTemplate.class);
        when(absent.queryForList(contains("invite_required"), eq(String.class))).thenReturn(List.of());
        Map<String, Object> d = controller(absent, new SignupGuard("", "", (u, b) -> "{}")).signupConfig();
        assertThat(d.get("inviteRequired")).isEqualTo(true);
        assertThat(d.get("turnstileSiteKey")).isNull();
    }

    @Test
    void registerNeedsInviteCodeByDefault() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("invite_required"), eq(String.class))).thenReturn(List.of());
        ResponseEntity<String> r = controller(jdbc, new SignupGuard("", "", (u, b) -> "{}")).register(body(), req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(r.getBody()).isEqualTo("Invite code required.");
    }

    @Test
    void registerWithTurnstileOnAndNoTokenIsRefused() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("invite_required"), eq(String.class))).thenReturn(List.of("false"));
        ResponseEntity<String> r = controller(jdbc, new SignupGuard("site", "sec", (u, b) -> "{\"success\":true}"))
                .register(body(), req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(r.getBody()).isEqualTo("Could not check you are human. Try again.");
    }

    @Test
    void registerWithoutInviteRequirementCreatesAccount() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("invite_required"), eq(String.class))).thenReturn(List.of("false"));
        when(jdbc.queryForObject(contains("LOWER(username)"), eq(Integer.class), any(Object[].class))).thenReturn(0);
        ResponseEntity<String> r = controller(jdbc, new SignupGuard("", "", (u, b) -> "{}")).register(body(), req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        verify(jdbc, never()).queryForList(contains("invite_codes"), any(Object[].class));
    }
}
