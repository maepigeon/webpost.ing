package com.springbootprojects.webpostingserver;

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

/** Who a comment's @mentions may notify: real, other, active members, and only on posts others can read. */
@SpringBootTest
class MentionRecipientsTest {

    private static final String[] NAMES = {"men_author", "men_target", "men_frozen"};

    @Autowired JdbcTemplate jdbc;
    @Autowired PostRepository posts;
    @Autowired SocialRepository social;

    private int authorId, targetId, frozenId;

    @BeforeEach
    void setUp() {
        cleanUp();
        authorId = newUser("men_author");
        targetId = newUser("men_target");
        frozenId = newUser("men_frozen");
        jdbc.update("UPDATE users SET role='frozen' WHERE id=?", frozenId);
    }

    @AfterEach
    void cleanUp() {
        for (Integer id : jdbc.queryForList("""
                SELECT j.post_id FROM users_posts_junctions j JOIN users u ON u.id = j.user_id
                 WHERE u.username IN (?, ?, ?)""", Integer.class, (Object[]) NAMES)) {
            jdbc.update("DELETE FROM users_posts_junctions WHERE post_id = ?", id);
            jdbc.update("DELETE FROM posts WHERE id = ?", id);
        }
        jdbc.update("DELETE FROM users WHERE username IN (?, ?, ?)", (Object[]) NAMES);
    }

    @Test
    void publicPostNotifiesExistingOthersOnly() {
        int post = newPost(true, "profile");
        List<Integer> ids = social.findMentionRecipients(
            List.of("men_target", "men_author", "men_frozen", "nobody_here"), authorId, post);
        assertThat(ids).containsExactly(targetId);
    }

    @Test
    void lookupIgnoresLetterCaseOfStoredNames() {
        jdbc.update("UPDATE users SET username='Men_Target' WHERE id=?", targetId);
        try {
            int post = newPost(true, "profile");
            assertThat(social.findMentionRecipients(List.of("men_target"), authorId, post)).containsExactly(targetId);
        } finally {
            jdbc.update("UPDATE users SET username='men_target' WHERE id=?", targetId);
        }
    }

    @Test
    void draftsAndSubscriberPostsNotifyNobody() {
        assertThat(social.findMentionRecipients(List.of("men_target"), authorId, newPost(false, "profile"))).isEmpty();
        assertThat(social.findMentionRecipients(List.of("men_target"), authorId, newPost(true, "subscribers"))).isEmpty();
    }

    @Test
    void notesAreReadableSoTheyCount() {
        assertThat(social.findMentionRecipients(List.of("men_target"), authorId, newPost(true, "notes"))).containsExactly(targetId);
    }

    private int newUser(String name) {
        return jdbc.queryForObject("INSERT INTO users (username, password) VALUES (?, 'x') RETURNING id", Integer.class, name);
    }

    private int newPost(boolean published, String section) {
        Post p = new Post();
        p.setTitle("mention " + section + published);
        p.setDescription("");
        p.setPublished(published);
        posts.save(p, authorId);
        int id = jdbc.queryForObject("SELECT p.id FROM posts p JOIN users_posts_junctions j ON j.post_id=p.id WHERE j.user_id=? ORDER BY p.id DESC LIMIT 1", Integer.class, authorId);
        jdbc.update("UPDATE posts SET section=? WHERE id=?", section, id);
        return id;
    }
}
