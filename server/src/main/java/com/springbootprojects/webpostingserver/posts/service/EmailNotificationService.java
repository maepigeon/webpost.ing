package com.springbootprojects.webpostingserver.posts.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * Decides whether a given user should receive a given notification email, and
 * sends it if so.
 *
 * Every send passes through {@link #recipientFor}, which enforces the same four
 * conditions in one place rather than at each call site:
 *
 *   1. mail is switched on for this deployment,
 *   2. the user has an address,
 *   3. that address has been confirmed,
 *   4. their preferences allow this category.
 *
 * Nothing here ever throws. A notification is a side effect of something the
 * user already did successfully, so a failure to send must not surface as a
 * failure of that action.
 */
@Service
public class EmailNotificationService {

    private static final Logger log = LoggerFactory.getLogger(EmailNotificationService.class);

    private final JdbcTemplate jdbc;
    private final EmailService email;
    private final EmailTokenService tokens;

    public EmailNotificationService(JdbcTemplate jdbc, EmailService email, EmailTokenService tokens) {
        this.jdbc = jdbc;
        this.email = email;
        this.tokens = tokens;
    }

    /** A user cleared to receive mail in a particular category. */
    private record Recipient(int userId, String username, String address, String unsubscribeToken) {}

    /**
     * @param preferenceColumn the email_preferences column gating this category
     * @return the recipient, or null if they should not be emailed
     */
    private Recipient recipientFor(String username, String preferenceColumn) {
        if (!email.isEnabled()) return null;
        try {
            List<Map<String, Object>> rows = jdbc.queryForList("""
                    SELECT u.id, u.username, u.email,
                           COALESCE(p.enabled, TRUE)  AS enabled,
                           COALESCE(p.%s, TRUE)       AS category
                      FROM users u
                      LEFT JOIN email_preferences p ON p.user_id = u.id
                     WHERE u.username = ?
                       AND u.email IS NOT NULL
                       AND u.email_verified = TRUE
                    """.formatted(preferenceColumn), username);

            if (rows.isEmpty()) return null;
            Map<String, Object> row = rows.get(0);
            if (!Boolean.TRUE.equals(row.get("enabled")))  return null;
            if (!Boolean.TRUE.equals(row.get("category"))) return null;

            int userId = (Integer) row.get("id");
            return new Recipient(userId, (String) row.get("username"), (String) row.get("email"),
                                 tokens.unsubscribeTokenFor(userId));
        } catch (Exception e) {
            log.warn("Could not resolve email recipient {}: {}", username, e.toString());
            return null;
        }
    }

    public void notifyDirectMessage(String recipientUsername, String senderUsername) {
        Recipient r = recipientFor(recipientUsername, "on_direct_message");
        if (r == null) return;
        if (!claimDailySlot(r, senderUsername + " sent you a message")) return;
        email.sendDirectMessageAlert(r.address(), r.username(), senderUsername, r.unsubscribeToken());
    }

    public void notifyNewFollower(String followedUsername, String followerUsername) {
        Recipient r = recipientFor(followedUsername, "on_new_follower");
        if (r == null) return;
        if (!claimDailySlot(r, followerUsername + " followed you")) return;
        email.sendNewFollowerAlert(r.address(), r.username(), followerUsername, r.unsubscribeToken());
    }

    /**
     * Tells an author's followers about a new post.
     *
     * Fans out one query and one send per follower. Fine at this scale; an
     * account with very many followers would want a queue instead, which is why
     * the send itself is already asynchronous.
     */
    public void notifyFollowersOfPost(String authorUsername, String postTitle, long postId) {
        if (!email.isEnabled()) return;
        try {
            List<String> followers = jdbc.queryForList("""
                    SELECT f.username
                      FROM follows fo
                      JOIN users f ON f.id = fo.follower_id
                      JOIN users a ON a.id = fo.followed_id
                     WHERE a.username = ?
                    """, String.class, authorUsername);

            for (String follower : followers) {
                Recipient r = recipientFor(follower, "on_followed_post");
                if (r == null) continue;
                if (!claimDailySlot(r, authorUsername + " published \"" + postTitle + "\"")) continue;
                email.sendFollowedPostAlert(r.address(), r.username(), authorUsername,
                                            postTitle, postId, r.unsubscribeToken());
            }
        } catch (Exception e) {
            log.warn("Could not notify followers of {}: {}", authorUsername, e.toString());
        }
    }

    /** Confirms to an author that their own post went live, if they asked for it. */
    public void sendPublishReceipt(String authorUsername, String postTitle, long postId) {
        Recipient r = recipientFor(authorUsername, "on_post_published");
        if (r == null) return;
        if (!claimDailySlot(r, "Your post \"" + postTitle + "\" went live")) return;
        email.sendPublishReceipt(r.address(), r.username(), postTitle, postId);
    }

    // ── Daily cap and digest ──────────────────────────────────────────────────

    /**
     * Most notification email one person can receive in a day.
     *
     * Without a ceiling a single busy thread could mail someone dozens of times
     * in an evening. To them that is indistinguishable from spam, and to their
     * provider it is how a sending domain gets blocked — which then costs
     * everyone their password-reset mail too.
     *
     * Transactional mail (verification, password reset) is deliberately not
     * counted: the recipient asked for it and it has to arrive.
     */
    private static final int DAILY_LIMIT = 3;

    /**
     * Takes one of today's slots for this recipient, or queues the news for a
     * digest if they are used up.
     *
     * @return true if the caller should send now
     */
    private boolean claimDailySlot(Recipient r, String summary) {
        try {
            Integer sentToday = jdbc.queryForObject(
                    "SELECT COALESCE(MAX(sent), 0) FROM email_send_log WHERE user_id = ? AND sent_on = CURRENT_DATE",
                    Integer.class, r.userId());
            int sent = sentToday == null ? 0 : sentToday;

            if (sent >= DAILY_LIMIT) {
                // Queued rather than dropped: the aim is to send less mail, not
                // to lose what happened.
                jdbc.update("INSERT INTO email_digest_queue (user_id, summary) VALUES (?, ?)",
                        r.userId(), summary.length() > 300 ? summary.substring(0, 300) : summary);
                log.debug("Daily email limit reached for user {}; queued for digest", r.userId());
                return false;
            }

            recordSend(r.userId());
            return true;
        } catch (Exception e) {
            // A failure to account must not silently stop notifications; err
            // towards sending, since the per-IP limits still apply upstream.
            log.warn("Could not check the daily email limit for user {}: {}", r.userId(), e.toString());
            return true;
        }
    }

    private void recordSend(int userId) {
        jdbc.update("""
                INSERT INTO email_send_log (user_id, sent_on, sent) VALUES (?, CURRENT_DATE, 1)
                ON CONFLICT (user_id, sent_on) DO UPDATE SET sent = email_send_log.sent + 1
                """, userId);
    }

    /**
     * Sends one digest per user with a backlog, and clears it.
     *
     * Runs hourly rather than once at midnight: a fixed nightly job means news
     * from 9am waits fifteen hours, and every user's mail leaves in the same
     * second. The daily counter is what prevents this from being chatty — a
     * digest takes a slot like anything else.
     */
    @Scheduled(fixedDelay = 60 * 60 * 1000L, initialDelay = 5 * 60 * 1000L)
    public void flushDigests() {
        if (!email.isEnabled()) return;
        try {
            List<Integer> waiting = jdbc.queryForList(
                    "SELECT DISTINCT user_id FROM email_digest_queue", Integer.class);

            for (int userId : waiting) {
                Integer sentToday = jdbc.queryForObject(
                        "SELECT COALESCE(MAX(sent), 0) FROM email_send_log WHERE user_id = ? AND sent_on = CURRENT_DATE",
                        Integer.class, userId);
                if (sentToday != null && sentToday >= DAILY_LIMIT) continue;   // try again next hour

                List<Map<String, Object>> rows = jdbc.queryForList("""
                        SELECT u.username, u.email, q.summary
                          FROM email_digest_queue q
                          JOIN users u ON u.id = q.user_id
                         WHERE q.user_id = ? AND u.email IS NOT NULL AND u.email_verified = TRUE
                         ORDER BY q.created_at
                        """, userId);

                if (rows.isEmpty()) {
                    // No confirmed address any more; drop the backlog rather
                    // than keeping it forever.
                    jdbc.update("DELETE FROM email_digest_queue WHERE user_id = ?", userId);
                    continue;
                }

                String username = (String) rows.get(0).get("username");
                String address = (String) rows.get(0).get("email");
                List<String> lines = rows.stream().map(row -> "  • " + row.get("summary")).toList();

                email.sendDigest(address, username, lines, tokens.unsubscribeTokenFor(userId));
                recordSend(userId);
                jdbc.update("DELETE FROM email_digest_queue WHERE user_id = ?", userId);
                log.info("Sent a digest of {} item(s) to user {}", lines.size(), userId);
            }
        } catch (Exception e) {
            log.warn("Digest flush failed: {}", e.toString());
        }
    }
}
