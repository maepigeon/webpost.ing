package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.AdminController;
import com.springbootprojects.webpostingserver.posts.controller.AuthController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.validator.LoginRateLimiter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/** Session cap, limiter keying/pruning, password validation order and rate keys. */
class OpenSignupHardeningTest {

    @BeforeEach
    void reset() {
        JdbcLoginRepository.clearSessions();
        LoginRateLimiter.clear();
    }

    private static AuthSession session(String user, String token, long ageOrder) {
        AuthSession s = new AuthSession(user);
        s.token = token;
        s.expiresAt = Instant.now().plusSeconds(1000 + ageOrder); // larger = newer
        return s;
    }

    @Test
    void sixthSessionEvictsTheUsersOldestNotTheNewest() {
        for (int i = 1; i <= 5; i++) JdbcLoginRepository.storeSession(session("a", "t" + i, i), 5, 100);
        JdbcLoginRepository.storeSession(session("a", "t6", 6), 5, 100);
        assertThat(JdbcLoginRepository.sessionCountFor("a")).isEqualTo(5);
        assertThat(JdbcLoginRepository.hasSession("t1")).isFalse();
        assertThat(JdbcLoginRepository.hasSession("t6")).isTrue();
    }

    @Test
    void fullTableEvictsGloballyOldestAndOtherUsersStillLogIn() {
        JdbcLoginRepository.storeSession(session("a", "a1", 1), 5, 3);
        JdbcLoginRepository.storeSession(session("a", "a2", 2), 5, 3);
        JdbcLoginRepository.storeSession(session("a", "a3", 3), 5, 3);
        JdbcLoginRepository.storeSession(session("b", "b1", 4), 5, 3);
        assertThat(JdbcLoginRepository.hasSession("b1")).isTrue();
        assertThat(JdbcLoginRepository.hasSession("a1")).isFalse();
    }

    @Test
    void lockoutIsPerAddressSoASecondAddressIsNotLocked() {
        String ipA = "account:admin|1.1.1.1", ipB = "account:admin|2.2.2.2";
        for (int i = 0; i < 15; i++) LoginRateLimiter.recordFailure(ipA);
        assertThat(LoginRateLimiter.isBlocked(ipA)).isTrue();
        assertThat(LoginRateLimiter.isBlocked(ipB)).isFalse();
    }

    @Test
    void customThresholdBlocksOnlyAtThatCount() {
        for (int i = 0; i < 99; i++) LoginRateLimiter.recordFailure("accountAll:x", 100);
        assertThat(LoginRateLimiter.isBlocked("accountAll:x")).isFalse();
        LoginRateLimiter.recordFailure("accountAll:x", 100);
        assertThat(LoginRateLimiter.isBlocked("accountAll:x")).isTrue();
    }

    @Test
    void expiredEntriesArePrunedOnceTheMapIsLarge() {
        long t0 = 1_000_000L;
        for (int i = 0; i < 10_001; i++) LoginRateLimiter.recordFailure("k" + i, 15, t0);
        assertThat(LoginRateLimiter.size()).isEqualTo(10_001);
        LoginRateLimiter.recordFailure("fresh", 15, t0 + 16 * 60 * 1000L);
        assertThat(LoginRateLimiter.size()).isEqualTo(1);
    }

    @Test
    void passwordLengthIsCheckedBeforeAnyPatternAndBytesAreBounded() {
        assertThat(AdminController.validatePassword(null)).contains("at least 12");
        assertThat(AdminController.validatePassword("Ab1!")).contains("at least 12");
        // 200 lowercase letters: too long, reported before the "uppercase" rule.
        assertThat(AdminController.validatePassword("a".repeat(200))).contains("128 characters");
        // 40 three-byte characters = 120 bytes but only 40 chars; plus pattern-valid ASCII.
        String multibyte = "Aa1!" + "€".repeat(25); // 29 chars, 79 bytes
        assertThat(AdminController.validatePassword(multibyte)).isEqualTo("Password must be 72 bytes or fewer.");
        assertThat(AdminController.validatePassword("Aa1!" + "x".repeat(20))).isNull();
    }

    @Test
    void rateKeyKeepsIpv4AndCollapsesIpv6ToItsSlash64() {
        assertThat(AuthController.rateKey("203.0.113.9")).isEqualTo("203.0.113.9");
        String a = AuthController.rateKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
        String b = AuthController.rateKey("2001:db8:1:2::1");
        assertThat(a).isEqualTo(b);
        assertThat(AuthController.rateKey("2001:db8:1:3::1")).isNotEqualTo(a);
        assertThat(AuthController.rateKey("::ffff:203.0.113.9")).isEqualTo("203.0.113.9");
    }
}
