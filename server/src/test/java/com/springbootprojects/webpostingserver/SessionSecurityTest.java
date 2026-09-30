package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;

import static org.assertj.core.api.Assertions.*;

/**
 * Unit tests for the session model and the credential-safety of LoginInfo.
 *
 * These cover the pure logic only — see AuthControllerTest for the endpoint
 * behaviour that depends on the repository.
 */
class SessionSecurityTest {

    private static AuthSession session(long lifetimeMinutes, long idleMinutes) {
        Instant now = Instant.now();
        AuthSession s = new AuthSession("Mae");
        s.expiresAt = now.plus(lifetimeMinutes, ChronoUnit.MINUTES);
        s.idleExpiresAt = now.plus(idleMinutes, ChronoUnit.MINUTES);
        return s;
    }

    // ── Absolute lifetime ─────────────────────────────────────────────────────

    @Test
    void freshSessionIsNotExpired() {
        assertThat(session(1440, 720).isExpired(Instant.now())).isFalse();
    }

    @Test
    void sessionIsExpiredPastItsAbsoluteDeadline() {
        AuthSession s = session(1440, 720);
        assertThat(s.isExpired(s.expiresAt.plusSeconds(1))).isTrue();
    }

    @Test
    void sessionIsStillValidExactlyOnItsDeadline() {
        // isAfter is strict, so the deadline instant itself is still inside the
        // window — the session dies a moment later, not a moment early.
        // Both deadlines are set to the same instant so this isolates the
        // boundary rather than tripping the (earlier) idle deadline.
        Instant deadline = Instant.now().plus(1440, ChronoUnit.MINUTES);
        AuthSession s = new AuthSession("Mae");
        s.expiresAt = deadline;
        s.idleExpiresAt = deadline;

        assertThat(s.isExpired(deadline)).isFalse();
        assertThat(s.isExpired(deadline.plusSeconds(1))).isTrue();
    }

    // ── Idle timeout ──────────────────────────────────────────────────────────

    @Test
    void idleTimeoutExpiresSessionBeforeAbsoluteDeadline() {
        AuthSession s = session(1440, 30);
        Instant later = Instant.now().plus(31, ChronoUnit.MINUTES);
        assertThat(s.isExpired(later))
                .as("idle deadline passed even though the absolute one has not")
                .isTrue();
    }

    @Test
    void pushingTheIdleDeadlineForwardKeepsTheSessionAlive() {
        AuthSession s = session(1440, 30);
        Instant later = Instant.now().plus(29, ChronoUnit.MINUTES);
        // Simulates what authorize() does on each successful request.
        s.idleExpiresAt = later.plus(30, ChronoUnit.MINUTES);
        assertThat(s.isExpired(later.plus(1, ChronoUnit.MINUTES))).isFalse();
    }

    @Test
    void idleRefreshCannotOutliveTheAbsoluteDeadline() {
        AuthSession s = session(10, 5);
        // However often the idle window is renewed, the hard cut-off still ends it.
        s.idleExpiresAt = Instant.now().plus(10_000, ChronoUnit.MINUTES);
        assertThat(s.isExpired(s.expiresAt.plusSeconds(1))).isTrue();
    }

    // ── Missing deadlines ─────────────────────────────────────────────────────

    @Test
    void sessionWithNoDeadlinesIsNeverExpired() {
        // A half-built session must not be treated as expired, or a login race
        // would log the user straight back out.
        assertThat(new AuthSession("Mae").isExpired(Instant.now())).isFalse();
    }

    // ── Credential hygiene ────────────────────────────────────────────────────

    @Test
    void loginInfoToStringDoesNotRevealThePassword() {
        LoginInfo info = new LoginInfo();
        info.setUsername("Mae");
        info.setPassword("hunter2-should-never-be-logged");
        info.setDate(new Date());

        assertThat(info.toString())
                .as("a logged LoginInfo must not put the password in the log file")
                .doesNotContain("hunter2-should-never-be-logged")
                .contains("Mae")
                .contains("***");
    }
}
