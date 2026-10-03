package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.service.EmailTokenService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.*;

/**
 * Integration tests for the tokens behind email verification and password
 * reset. Uses a throwaway account so no real row is touched.
 */
@SpringBootTest
class EmailTokenServiceTest {

    @Autowired EmailTokenService tokens;
    @Autowired JdbcTemplate jdbc;

    private static final String TEST_USER = "junit_email_token_user";
    private static final String TEST_EMAIL = "junit-token@example.test";
    private int userId;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM users WHERE username = ?", TEST_USER);
        userId = jdbc.queryForObject(
                "INSERT INTO users (username, password, role) VALUES (?, 'x', 'user') RETURNING id",
                Integer.class, TEST_USER);
    }

    @AfterEach
    void tearDown() {
        // email_tokens cascades from users.
        jdbc.update("DELETE FROM users WHERE username = ?", TEST_USER);
    }

    // ── Hashing ───────────────────────────────────────────────────────────────

    @Test
    void tokensAreStoredOnlyAsHashes() {
        EmailTokenService.IssuedToken issued =
                tokens.issue(userId, TEST_EMAIL, EmailTokenService.PURPOSE_VERIFY);

        List<String> stored = jdbc.queryForList(
                "SELECT token_hash FROM email_tokens WHERE user_id = ?", String.class, userId);

        assertThat(stored).hasSize(1);
        assertThat(stored.get(0))
                .as("a leaked database must not yield working links")
                .isNotEqualTo(issued.plaintext())
                .hasSize(64)
                .matches("[0-9a-f]{64}");
    }

    @Test
    void hashingIsStable() {
        assertThat(EmailTokenService.hash("abc")).isEqualTo(EmailTokenService.hash("abc"));
        assertThat(EmailTokenService.hash("abc")).isNotEqualTo(EmailTokenService.hash("abd"));
    }

    @Test
    void everyTokenIsDifferent() {
        String a = tokens.issue(userId, TEST_EMAIL, EmailTokenService.PURPOSE_VERIFY).plaintext();
        String b = tokens.issue(userId, TEST_EMAIL, EmailTokenService.PURPOSE_VERIFY).plaintext();
        assertThat(a).isNotEqualTo(b);
        assertThat(a).hasSizeGreaterThan(30);
    }

    // ── Redemption ────────────────────────────────────────────────────────────

    @Test
    void aFreshTokenRedeems() {
        EmailTokenService.IssuedToken issued =
                tokens.issue(userId, TEST_EMAIL, EmailTokenService.PURPOSE_VERIFY);

        EmailTokenService.Redemption result =
                tokens.redeem(issued.plaintext(), EmailTokenService.PURPOSE_VERIFY);

        assertThat(result.valid()).isTrue();
        assertThat(result.userId()).isEqualTo(userId);
        assertThat(result.email()).isEqualTo(TEST_EMAIL);
    }

    @Test
    void aTokenCannotBeUsedTwice() {
        EmailTokenService.IssuedToken issued =
                tokens.issue(userId, TEST_EMAIL, EmailTokenService.PURPOSE_VERIFY);
        tokens.redeem(issued.plaintext(), EmailTokenService.PURPOSE_VERIFY);

        EmailTokenService.Redemption replay =
                tokens.redeem(issued.plaintext(), EmailTokenService.PURPOSE_VERIFY);

        assertThat(replay.valid()).isFalse();
        assertThat(replay.reason()).isEqualTo("already used");
    }

    @Test
    void anUnknownTokenIsRejected() {
        assertThat(tokens.redeem("never-issued", EmailTokenService.PURPOSE_VERIFY).valid()).isFalse();
    }

    @Test
    void aMissingTokenIsRejected() {
        assertThat(tokens.redeem(null, EmailTokenService.PURPOSE_VERIFY).valid()).isFalse();
        assertThat(tokens.redeem("", EmailTokenService.PURPOSE_VERIFY).valid()).isFalse();
        assertThat(tokens.redeem("   ", EmailTokenService.PURPOSE_VERIFY).valid()).isFalse();
    }

    @Test
    void anExpiredTokenIsRejected() {
        EmailTokenService.IssuedToken issued =
                tokens.issue(userId, TEST_EMAIL, EmailTokenService.PURPOSE_VERIFY);
        jdbc.update("UPDATE email_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE user_id = ?", userId);

        EmailTokenService.Redemption result =
                tokens.redeem(issued.plaintext(), EmailTokenService.PURPOSE_VERIFY);

        assertThat(result.valid()).isFalse();
        assertThat(result.reason()).isEqualTo("expired");
    }

    @Test
    void aVerificationTokenCannotResetAPassword() {
        // Otherwise a confirmation link — which is emailed far more freely —
        // would be enough to take over an account.
        EmailTokenService.IssuedToken issued =
                tokens.issue(userId, TEST_EMAIL, EmailTokenService.PURPOSE_VERIFY);

        assertThat(tokens.redeem(issued.plaintext(), EmailTokenService.PURPOSE_RESET).valid()).isFalse();
    }

    @Test
    void issuingAgainInvalidatesTheEarlierToken() {
        // Otherwise a link sent to a previous address would still confirm a new one.
        EmailTokenService.IssuedToken first =
                tokens.issue(userId, "old@example.test", EmailTokenService.PURPOSE_VERIFY);
        tokens.issue(userId, "new@example.test", EmailTokenService.PURPOSE_VERIFY);

        assertThat(tokens.redeem(first.plaintext(), EmailTokenService.PURPOSE_VERIFY).valid()).isFalse();
    }

    @Test
    void resetTokensExpireSoonerThanVerificationTokens() {
        // A reset link is a live credential; a confirmation link is not.
        var verify = tokens.issue(userId, TEST_EMAIL, EmailTokenService.PURPOSE_VERIFY);
        var reset  = tokens.issue(userId, TEST_EMAIL, EmailTokenService.PURPOSE_RESET);
        assertThat(reset.expiresAt()).isBefore(verify.expiresAt());
    }

    // ── Unsubscribe token ─────────────────────────────────────────────────────

    @Test
    void theUnsubscribeTokenIsCreatedOnceAndReused() {
        String first = tokens.unsubscribeTokenFor(userId);
        String second = tokens.unsubscribeTokenFor(userId);

        assertThat(first).isNotBlank();
        assertThat(second)
                .as("links in old emails have to keep working")
                .isEqualTo(first);
    }

    @Test
    void unsubscribeTokensDifferBetweenUsers() {
        int otherId = jdbc.queryForObject(
                "INSERT INTO users (username, password, role) VALUES ('junit_email_other', 'x', 'user') RETURNING id",
                Integer.class);
        try {
            assertThat(tokens.unsubscribeTokenFor(userId))
                    .isNotEqualTo(tokens.unsubscribeTokenFor(otherId));
        } finally {
            jdbc.update("DELETE FROM users WHERE id = ?", otherId);
        }
    }

    @Test
    void parallelRedeemsOfOneTokenSucceedExactlyOnce() throws Exception {
        String plaintext = tokens.issue(userId, TEST_EMAIL, EmailTokenService.PURPOSE_VERIFY).plaintext();
        int n = 8;
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(n);
        java.util.concurrent.CountDownLatch go = new java.util.concurrent.CountDownLatch(1);
        List<java.util.concurrent.Future<Boolean>> results = new java.util.ArrayList<>();
        for (int i = 0; i < n; i++) results.add(pool.submit(() -> {
            go.await();
            return tokens.redeem(plaintext, EmailTokenService.PURPOSE_VERIFY).valid();
        }));
        go.countDown();
        int wins = 0;
        for (var f : results) if (f.get()) wins++;
        pool.shutdown();
        assertThat(wins).as("a single-use token must redeem once however many requests race").isEqualTo(1);
    }

    @Test
    void expiredTokenCannotBeRedeemed() {
        String plaintext = tokens.issue(userId, TEST_EMAIL, EmailTokenService.PURPOSE_RESET).plaintext();
        jdbc.update("UPDATE email_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE user_id = ?", userId);
        var r = tokens.redeem(plaintext, EmailTokenService.PURPOSE_RESET);
        assertThat(r.valid()).isFalse();
        assertThat(r.reason()).isEqualTo("expired");
    }
}
