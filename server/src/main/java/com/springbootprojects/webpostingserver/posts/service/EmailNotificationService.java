package com.springbootprojects.webpostingserver.posts.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
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
        email.sendDirectMessageAlert(r.address(), r.username(), senderUsername, r.unsubscribeToken());
    }

    public void notifyNewFollower(String followedUsername, String followerUsername) {
        Recipient r = recipientFor(followedUsername, "on_new_follower");
        if (r == null) return;
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
        email.sendPublishReceipt(r.address(), r.username(), postTitle, postId);
    }
}
