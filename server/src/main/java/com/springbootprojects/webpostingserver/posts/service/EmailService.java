package com.springbootprojects.webpostingserver.posts.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * Sends the handful of transactional emails the app produces.
 *
 * The feature is entirely optional. When {@code app.mail.enabled} is false — the
 * default — nothing is sent, no SMTP connection is attempted, and the message
 * that would have gone out is logged at debug level instead. That keeps local
 * development and any deployment without a mail server working normally, and
 * makes the feature safe to ship dark.
 *
 * Sending is asynchronous. An SMTP handshake can take seconds, and no user
 * action should block on one: posting still succeeds if the mail server is
 * down, and a failure is logged rather than surfaced.
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    /**
     * Master switch. Off by default so a deployment that has not configured SMTP
     * cannot accidentally attempt sends.
     */
    @Value("${app.mail.enabled:false}")
    private boolean enabled;

    @Value("${app.mail.from:no-reply@webpost.ing}")
    private String fromAddress;

    /** Public base URL, used to build links that must work from an inbox. */
    @Value("${app.base-url:http://localhost:5173}")
    private String baseUrl;

    /**
     * ObjectProvider rather than a direct injection: the mail sender bean only
     * exists when spring.mail.host is set, and requiring it would stop the whole
     * application from starting on a deployment with no SMTP.
     */
    private final ObjectProvider<JavaMailSender> mailSender;

    public EmailService(ObjectProvider<JavaMailSender> mailSender) {
        this.mailSender = mailSender;
    }

    /** True when a message would actually be delivered. */
    public boolean isEnabled() {
        return enabled && mailSender.getIfAvailable() != null;
    }

    public String baseUrl() {
        return baseUrl;
    }

    /**
     * Sends a plain-text message, or logs it when mail is disabled.
     *
     * Never throws. Callers are user-facing request handlers, and a mail server
     * problem must not turn into a failed action for the person using the site.
     */
    @Async
    public void send(String to, String subject, String body) {
        if (to == null || to.isBlank()) return;
        subject = oneLine(subject, SUBJECT_MAX);   // last line of defence for any caller

        JavaMailSender sender = enabled ? mailSender.getIfAvailable() : null;
        if (sender == null) {
            // Not an error: this is the normal path when mail is switched off.
            log.debug("Mail disabled; would have sent to {} with subject \"{}\"", to, subject);
            return;
        }

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromAddress);
            message.setTo(to);
            message.setSubject(subject);
            message.setText(body);
            sender.send(message);
            log.info("Sent \"{}\" to {}", subject, to);
        } catch (Exception e) {
            // Deliberately swallowed. The user's action already succeeded.
            log.warn("Could not send \"{}\" to {}: {}", subject, to, e.toString());
        }
    }

    // ── Untrusted text in mail ────────────────────────────────────────────────

    /** Subject length cap. */
    static final int SUBJECT_MAX = 150;

    /**
     * Makes one user-controlled string safe for a subject, a header or a single
     * line of a plain-text body: every control character (CR, LF, tab, NUL...)
     * and Unicode line/paragraph separator becomes a space, runs of spaces
     * collapse, and the result is capped. A title can then neither inject
     * headers nor start a new line that looks like the site's own text.
     * (All mail here is plain text, so there is no HTML to escape.)
     */
    public static String oneLine(String s, int max) {
        if (s == null) return "";
        String t = s.replaceAll("[\\p{Cntrl}\\u0085\\u2028\\u2029]", " ").replaceAll(" {2,}", " ").trim();
        return t.length() > max ? t.substring(0, max - 1) + "\u2026" : t;
    }

    /** A name or title inside a body line. */
    private static String field(String s) { return oneLine(s, 100); }

    // ── Message templates ─────────────────────────────────────────────────────

    public void sendVerification(String to, String username, String token) {
        String link = baseUrl + "/verify-email?token=" + token;
        send(to, "Confirm your email for webpost.ing", """
                Hi %s,

                Confirm this address to turn on email notifications for your
                webpost.ing account:

                %s

                The link is good for 24 hours. If you did not ask for this, you
                can ignore this message — nothing will change, and we will not
                email this address again.
                """.formatted(field(username), link));
    }

    public void sendPasswordReset(String to, String username, String token) {
        String link = baseUrl + "/reset-password?token=" + token;
        send(to, "Reset your webpost.ing password", """
                Hi %s,

                Use this link to choose a new password:

                %s

                The link is good for 1 hour and can be used once.

                If you did not request this, ignore this message — your password
                has not changed, and nobody can change it without this link.
                """.formatted(field(username), link));
    }

    public void sendDirectMessageAlert(String to, String username, String sender, String unsubscribeToken) {
        sender = field(sender);
        send(to, sender + " sent you a message on webpost.ing", """
                Hi %s,

                %s sent you a direct message.

                Read it: %s/messages

                %s
                """.formatted(field(username), sender, baseUrl, unsubscribeFooter(unsubscribeToken, "messages")));
    }

    public void sendNewFollowerAlert(String to, String username, String follower, String unsubscribeToken) {
        follower = field(follower);
        send(to, follower + " followed you on webpost.ing", """
                Hi %s,

                %s is now following you.

                Their profile: %s/users/%s

                %s
                """.formatted(field(username), follower, baseUrl, java.net.URLEncoder.encode(follower, java.nio.charset.StandardCharsets.UTF_8),
                              unsubscribeFooter(unsubscribeToken, "followers")));
    }

    public void sendFollowedPostAlert(String to, String username, String author,
                                      String postTitle, long postId, String unsubscribeToken) {
        author = field(author);
        postTitle = field(postTitle);
        send(to, author + " published \"" + postTitle + "\"", """
                Hi %s,

                %s just published a new post: %s

                Read it: %s/posts/%d

                %s
                """.formatted(field(username), author, postTitle, baseUrl, postId,
                              unsubscribeFooter(unsubscribeToken, "posts")));
    }

    public void sendPublishReceipt(String to, String username, String postTitle, long postId) {
        postTitle = field(postTitle);
        send(to, "Your post is live: " + postTitle, """
                Hi %s,

                "%s" has been published.

                View it: %s/posts/%d
                """.formatted(field(username), postTitle, baseUrl, postId));
    }

    /**
     * Every notification carries a link that unsubscribes without logging in —
     * required by anti-spam norms and simply decent behaviour. Receipts and
     * verification mails are transactional and do not get one.
     */
    private String unsubscribeFooter(String unsubscribeToken, String category) {
        if (unsubscribeToken == null) return "";
        return """
                —
                Stop these emails: %s/unsubscribe?token=%s&category=%s
                Change what you get: %s/settings
                """.formatted(baseUrl, unsubscribeToken, category, baseUrl);
    }

    /**
     * One message summarising everything held back by the daily cap.
     *
     * The alternative to a digest is silence, which loses the news, or sending
     * anyway, which is what the cap exists to prevent.
     */
    public void sendDigest(String to, String username, java.util.List<String> lines, String unsubscribeToken) {
        send(to, "What you missed on webpost.ing", """
                Hi %s,

                A few things happened while you were away:

                %s

                See them: %s/inbox

                (You are getting one message instead of several — there is a
                limit on how much email webpost.ing will send you in a day.)

                %s
                """.formatted(field(username), lines.stream().map(l -> oneLine(l, 200)).collect(java.util.stream.Collectors.joining("\n")), baseUrl,
                              unsubscribeFooter(unsubscribeToken, "all")));
    }
}
