package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.model.Notification;
import com.springbootprojects.webpostingserver.posts.model.Post;
import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * What a notification says about its subject: the post's title, the comment's
 * words, and "gone" instead of anything the recipient may not see.
 */
@SpringBootTest
class NotificationSubjectTest {

    private static final String[] NAMES = {"nsub_owner", "nsub_actor", "nsub_other"};

    @Autowired JdbcTemplate jdbc;
    @Autowired PostRepository posts;
    @Autowired SocialRepository social;

    private int ownerId, actorId, otherId;

    @BeforeEach
    void setUp() {
        cleanUp();
        ownerId = newUser("nsub_owner");
        actorId = newUser("nsub_actor");
        otherId = newUser("nsub_other");
    }

    @AfterEach
    void cleanUp() {
        for (Integer id : jdbc.queryForList("""
                SELECT j.post_id FROM users_posts_junctions j JOIN users u ON u.id = j.user_id
                 WHERE u.username IN (?, ?, ?)""", Integer.class, (Object[]) NAMES)) {
            jdbc.update("DELETE FROM users_posts_junctions WHERE post_id = ?", id);
            jdbc.update("DELETE FROM posts WHERE id = ?", id);
        }
        jdbc.update("DELETE FROM dm_blocks WHERE blocker_id IN (SELECT id FROM users WHERE username IN (?, ?, ?))", (Object[]) NAMES);
        jdbc.update("DELETE FROM users WHERE username IN (?, ?, ?)", (Object[]) NAMES);
    }

    // ── what each type carries ────────────────────────────────────────────────

    @Test
    void commentCarriesTitleOwnerAndTheCommentsWords() {
        int post = newPost(true, "profile", "My cat");
        int comment = social.addComment(post, null, actorId, "  Great\n\n  post,   really  ");
        social.createNotification(ownerId, "comment", "nsub_actor", post, comment);

        Notification n = only(ownerId);
        assertThat(n.isSubjectGone()).isFalse();
        assertThat(n.getPostId()).isEqualTo(post);
        assertThat(n.getCommentId()).isEqualTo(comment);
        assertThat(n.getPostTitle()).isEqualTo("My cat");
        assertThat(n.getPostOwner()).isEqualTo("nsub_owner");
        assertThat(n.getCommentExcerpt()).isEqualTo("Great post, really");
    }

    @Test
    void replyAndMentionCarryTheExcerptToo() {
        int post = newPost(true, "profile", "Thread");
        int parent = social.addComment(post, null, ownerId, "first");
        int reply = social.addComment(post, parent, actorId, "hello @nsub_other");
        social.createNotification(ownerId, "reply", "nsub_actor", post, reply);
        social.createNotification(otherId, "mention", "nsub_actor", post, reply);

        assertThat(only(ownerId).getCommentExcerpt()).isEqualTo("hello @nsub_other");
        Notification m = only(otherId);
        assertThat(m.getCommentExcerpt()).isEqualTo("hello @nsub_other");
        assertThat(m.isSubjectGone()).isFalse();
    }

    @Test
    void longCommentIsCutAt160CharactersWithAnEllipsis() {
        int post = newPost(true, "profile", "Long");
        int comment = social.addComment(post, null, actorId, "word ".repeat(100));
        social.createNotification(ownerId, "comment", "nsub_actor", post, comment);

        String excerpt = only(ownerId).getCommentExcerpt();
        assertThat(excerpt.codePointCount(0, excerpt.length())).isLessThanOrEqualTo(160);
        assertThat(excerpt).endsWith("word…");
    }

    @Test
    void reactionAndNewPostCarryTheTitleAndNoExcerpt() {
        int post = newPost(true, "profile", "Liked");
        social.createNotification(ownerId, "reaction", "nsub_actor", post, null);
        social.createNotification(otherId, "new_post", "nsub_owner", post, null);

        Notification r = only(ownerId);
        assertThat(r.getPostTitle()).isEqualTo("Liked");
        assertThat(r.getCommentExcerpt()).isNull();
        assertThat(r.isSubjectGone()).isFalse();
        assertThat(only(otherId).getPostTitle()).isEqualTo("Liked");
    }

    @Test
    void emptyTitleStaysEmpty() {
        int post = newPost(true, "profile", "");
        social.createNotification(ownerId, "reaction", "nsub_actor", post, null);
        assertThat(only(ownerId).getPostTitle()).isEmpty();
    }

    @Test
    void followAndMessageAreNeverGone() {
        social.createNotification(ownerId, "follow", "nsub_actor", null, null);
        social.sendMessage(ownerId, "nsub_actor", "hi");
        List<Notification> all = social.getNotifications(ownerId, 50, 0);
        assertThat(all).hasSize(2).allSatisfy(n -> {
            assertThat(n.isSubjectGone()).isFalse();
            assertThat(n.getPostTitle()).isNull();
            assertThat(n.getCommentExcerpt()).isNull();
        });
    }

    @Test
    void oldRowWithoutCommentIdHasNoExcerptButIsNotGone() {
        int post = newPost(true, "profile", "Old");
        social.createNotification(ownerId, "comment", "nsub_actor", post, null);
        Notification n = only(ownerId);
        assertThat(n.getCommentExcerpt()).isNull();
        assertThat(n.isSubjectGone()).isFalse();
        assertThat(n.getPostTitle()).isEqualTo("Old");
    }

    @Test
    void titleIsTheCurrentOne() {
        int post = newPost(true, "profile", "Before");
        social.createNotification(ownerId, "reaction", "nsub_actor", post, null);
        jdbc.update("UPDATE posts SET title='After' WHERE id=?", post);
        assertThat(only(ownerId).getPostTitle()).isEqualTo("After");
    }

    // ── what is gone or hidden ────────────────────────────────────────────────

    @Test
    void deletedCommentIsGoneWithNoExcerpt() {
        int post = newPost(true, "profile", "Visible");
        int comment = social.addComment(post, null, actorId, "bye");
        social.createNotification(ownerId, "comment", "nsub_actor", post, comment);
        jdbc.update("DELETE FROM comments WHERE id=?", comment);

        Notification n = only(ownerId);
        assertThat(n.isSubjectGone()).isTrue();
        assertThat(n.getCommentExcerpt()).isNull();
    }

    @Test
    void deletedPostIsGone() {
        int post = newPost(true, "profile", "Doomed");
        int comment = social.addComment(post, null, actorId, "secret words");
        social.createNotification(ownerId, "comment", "nsub_actor", post, comment);
        social.createNotification(ownerId, "reaction", "nsub_actor", post, null);
        jdbc.update("DELETE FROM users_posts_junctions WHERE post_id=?", post);
        jdbc.update("DELETE FROM posts WHERE id=?", post);

        assertThat(social.getNotifications(ownerId, 50, 0)).hasSize(2).allSatisfy(n -> {
            assertThat(n.isSubjectGone()).isTrue();
            assertThat(n.getPostTitle()).isNull();
            assertThat(n.getCommentExcerpt()).isNull();
        });
    }

    @Test
    void draftIsGoneForARecipientWhoDoesNotOwnIt() {
        int post = newPost(true, "profile", "Hidden later");
        int comment = social.addComment(post, null, actorId, "private words");
        social.createNotification(otherId, "mention", "nsub_actor", post, comment);
        social.createNotification(otherId, "new_post", "nsub_owner", post, null);
        jdbc.update("UPDATE posts SET published=FALSE WHERE id=?", post);

        assertThat(social.getNotifications(otherId, 50, 0)).hasSize(2).allSatisfy(n -> {
            assertThat(n.isSubjectGone()).isTrue();
            assertThat(n.getPostTitle()).isNull();
            assertThat(n.getPostOwner()).isNull();
            assertThat(n.getCommentExcerpt()).isNull();
        });
    }

    @Test
    void subscribersOnlyPostIsGoneForOthers() {
        int post = newPost(true, "profile", "Subs");
        social.createNotification(otherId, "new_post", "nsub_owner", post, null);
        jdbc.update("UPDATE posts SET section='subscribers' WHERE id=?", post);
        Notification n = only(otherId);
        assertThat(n.isSubjectGone()).isTrue();
        assertThat(n.getPostTitle()).isNull();
    }

    @Test
    void ownerStillSeesTheirOwnDraft() {
        int post = newPost(false, "profile", "My draft");
        int comment = social.addComment(post, null, actorId, "nice draft");
        social.createNotification(ownerId, "comment", "nsub_actor", post, comment);

        Notification n = only(ownerId);
        assertThat(n.isSubjectGone()).isFalse();
        assertThat(n.getPostTitle()).isEqualTo("My draft");
        assertThat(n.getCommentExcerpt()).isEqualTo("nice draft");
    }

    @Test
    void commentByAuthorTheRecipientBlockedIsGone() {
        int post = newPost(true, "profile", "Blocked one way");
        int comment = social.addComment(post, null, actorId, "unwelcome");
        social.createNotification(ownerId, "comment", "nsub_actor", post, comment);
        social.blockMessages(ownerId, actorId);

        assertGoneWithNothing(only(ownerId));
    }

    @Test
    void commentByAuthorWhoBlockedTheRecipientIsGone() {
        int post = newPost(true, "profile", "Blocked other way");
        int comment = social.addComment(post, null, actorId, "you cannot read this");
        social.createNotification(ownerId, "comment", "nsub_actor", post, comment);
        social.blockMessages(actorId, ownerId);

        assertGoneWithNothing(only(ownerId));
    }

    @Test
    void anUnrelatedBlockChangesNothing() {
        int post = newPost(true, "profile", "Fine");
        int comment = social.addComment(post, null, actorId, "still here");
        social.createNotification(ownerId, "comment", "nsub_actor", post, comment);
        social.blockMessages(otherId, actorId);

        Notification n = only(ownerId);
        assertThat(n.isSubjectGone()).isFalse();
        assertThat(n.getCommentExcerpt()).isEqualTo("still here");
    }

    @Test
    void aCommentFromAnotherPostIsNotShown() {
        int post = newPost(true, "profile", "Mine");
        int elsewhere = newPost(true, "profile", "Elsewhere");
        int comment = social.addComment(elsewhere, null, actorId, "wrong post");
        social.createNotification(ownerId, "comment", "nsub_actor", post, comment);

        assertGoneWithNothing(only(ownerId));
    }

    @Test
    void aPageOfNotificationsComesBackInOrderWithPaging() {
        int post = newPost(true, "profile", "Paged");
        for (int i = 0; i < 5; i++) {
            int c = social.addComment(post, null, actorId, "comment " + i);
            social.createNotification(ownerId, "comment", "nsub_actor", post, c);
        }
        List<Notification> first = social.getNotifications(ownerId, 3, 0);
        List<Notification> rest = social.getNotifications(ownerId, 3, 3);
        assertThat(first).hasSize(3);
        assertThat(rest).hasSize(2);
        assertThat(first.get(0).getCommentExcerpt()).isEqualTo("comment 4");
        assertThat(rest.get(1).getCommentExcerpt()).isEqualTo("comment 0");
    }

    // ── the excerpt itself ────────────────────────────────────────────────────

    @Test
    void excerptCollapsesWhitespaceAndKeepsShortTextWhole() {
        assertThat(Notification.excerptOf("a\tb\n\nc  d")).isEqualTo("a b c d");
        assertThat(Notification.excerptOf("   ")).isNull();
        assertThat(Notification.excerptOf(null)).isNull();
        String exactly160 = "x".repeat(160);
        assertThat(Notification.excerptOf(exactly160)).isEqualTo(exactly160);
    }

    @Test
    void excerptNeverSplitsAnEmoji() {
        String text = "x".repeat(158) + "😀😀😀";
        String cut = Notification.excerptOf(text);
        assertThat(cut.codePointCount(0, cut.length())).isLessThanOrEqualTo(160);
        assertThat(cut).endsWith("…");
        assertThat(cut).doesNotContain("😀\uD83D");
        assertThat(Character.isHighSurrogate(cut.charAt(cut.length() - 2))).isFalse();
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private Notification only(int recipientId) {
        List<Notification> all = social.getNotifications(recipientId, 50, 0);
        assertThat(all).hasSize(1);
        return all.get(0);
    }

    private static void assertGoneWithNothing(Notification n) {
        assertThat(n.isSubjectGone()).isTrue();
        assertThat(n.getCommentExcerpt()).isNull();
        assertThat(n.getPostTitle()).isNull();
    }

    private int newUser(String name) {
        return jdbc.queryForObject("INSERT INTO users (username, password) VALUES (?, 'x') RETURNING id", Integer.class, name);
    }

    private int newPost(boolean published, String section, String title) {
        Post p = new Post();
        p.setTitle(title);
        p.setDescription("");
        p.setPublished(published);
        posts.save(p, ownerId);
        int id = jdbc.queryForObject("SELECT p.id FROM posts p JOIN users_posts_junctions j ON j.post_id=p.id WHERE j.user_id=? ORDER BY p.id DESC LIMIT 1", Integer.class, ownerId);
        jdbc.update("UPDATE posts SET section=? WHERE id=?", section, id);
        return id;
    }
}
