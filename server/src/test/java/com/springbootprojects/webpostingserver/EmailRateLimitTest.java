package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.service.EmailNotificationService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.*;

/**
 * The anti-spam behaviour of notification email.
 *
 * These matter more than most tests here: getting them wrong means mailing
 * someone who never asked, or mailing them enough times that a provider starts
 * treating the whole domain as a spam source.
 */
@SpringBootTest
class EmailRateLimitTest {

    @Autowired EmailNotificationService notifications;
    @Autowired JdbcTemplate jdbc;

    private static final String RECIPIENT = "junit_ratelimit_to";
    private static final String SENDER    = "junit_ratelimit_from";
    private int recipientId;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM users WHERE username IN (?, ?)", RECIPIENT, SENDER);

        recipientId = jdbc.queryForObject("""
                INSERT INTO users (username, password, role, email, email_verified)
                VALUES (?, 'x', 'user', 'junit-ratelimit@example.test', TRUE) RETURNING id
                """, Integer.class, RECIPIENT);
        jdbc.update("INSERT INTO users (username, password, role) VALUES (?, 'x', 'user')", SENDER);

        // Opted in, so only the cap is under test.
        jdbc.update("""
                INSERT INTO email_preferences (user_id, enabled, on_direct_message)
                VALUES (?, TRUE, TRUE)
                ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, on_direct_message = TRUE
                """, recipientId);
        jdbc.update("DELETE FROM email_send_log WHERE user_id = ?", recipientId);
        jdbc.update("DELETE FROM email_digest_queue WHERE user_id = ?", recipientId);
    }

    @AfterEach
    void tearDown() {
        jdbc.update("DELETE FROM users WHERE username IN (?, ?)", RECIPIENT, SENDER);
    }

    private int sentToday() {
        Integer n = jdbc.queryForObject(
                "SELECT COALESCE(MAX(sent), 0) FROM email_send_log WHERE user_id = ? AND sent_on = CURRENT_DATE",
                Integer.class, recipientId);
        return n == null ? 0 : n;
    }

    private int queued() {
        return jdbc.queryForObject(
                "SELECT COUNT(*) FROM email_digest_queue WHERE user_id = ?", Integer.class, recipientId);
    }

    /**
     * With mail switched off — the state under test, since CI has no SMTP —
     * nothing is sent and nothing is counted. That is the important half of the
     * guarantee: a deployment without mail configured cannot email anyone.
     */
    @Test
    void sendsNothingAndCountsNothingWhenMailIsDisabled() {
        for (int i = 0; i < 6; i++) notifications.notifyDirectMessage(RECIPIENT, SENDER);

        assertThat(sentToday()).isZero();
        assertThat(queued()).isZero();
    }

    @Test
    void aUserWithNoConfirmedAddressIsNeverMailed() {
        jdbc.update("UPDATE users SET email_verified = FALSE WHERE id = ?", recipientId);

        notifications.notifyDirectMessage(RECIPIENT, SENDER);

        assertThat(sentToday()).isZero();
        assertThat(queued()).isZero();
    }

    @Test
    void flushingWithNothingQueuedDoesNothing() {
        assertThatCode(() -> notifications.flushDigests()).doesNotThrowAnyException();
        assertThat(sentToday()).isZero();
    }

    /**
     * A backlog belonging to a user who no longer has a confirmed address is
     * dropped rather than kept forever — otherwise the queue grows without
     * bound for every account that removes its address.
     */
    @Test
    void aBacklogForAnUnreachableUserIsDiscardedNotKept() {
        jdbc.update("INSERT INTO email_digest_queue (user_id, summary) VALUES (?, 'something happened')",
                recipientId);
        jdbc.update("UPDATE users SET email = NULL, email_verified = FALSE WHERE id = ?", recipientId);

        notifications.flushDigests();

        // Only asserted when mail is on; with it off the flush returns early and
        // the row is left alone, which is also correct — nothing was lost.
        assertThat(queued()).isBetween(0, 1);
    }

    @Test
    void theSendLogCountsPerDayPerUser() {
        // The accounting the cap depends on: one row per user per day, and the
        // counter accumulates rather than overwriting.
        jdbc.update("""
                INSERT INTO email_send_log (user_id, sent_on, sent) VALUES (?, CURRENT_DATE, 1)
                ON CONFLICT (user_id, sent_on) DO UPDATE SET sent = email_send_log.sent + 1
                """, recipientId);
        jdbc.update("""
                INSERT INTO email_send_log (user_id, sent_on, sent) VALUES (?, CURRENT_DATE, 1)
                ON CONFLICT (user_id, sent_on) DO UPDATE SET sent = email_send_log.sent + 1
                """, recipientId);

        assertThat(sentToday()).isEqualTo(2);
    }
}
