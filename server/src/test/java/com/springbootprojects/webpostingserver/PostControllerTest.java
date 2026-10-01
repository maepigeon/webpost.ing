package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.PostController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.model.Post;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;

@ExtendWith(MockitoExtension.class)
class PostControllerTest {

    // Email notifications are a fire-and-forget side effect; mocked so these

    // tests stay about the endpoint behaviour.

    @Mock com.springbootprojects.webpostingserver.posts.service.EmailNotificationService emailNotifications;

    @Mock PostRepository postRepository;
    @Mock LoginRepository loginRepository;
    @Mock SocialRepository social;
    @Mock JdbcTemplate jdbc;

    @InjectMocks PostController postController;

    private Post samplePost;
    private AuthSession validSession;

    @BeforeEach
    void setUp() {
        samplePost = new Post();
        samplePost.setTitle("Updated title");
        samplePost.setDescription("Updated body");
        samplePost.setPublished(true);

        validSession = new AuthSession("kittycat");
        validSession.userId = 1;
    }

    @Test
    void updatePost_validOwner_returns200() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        LoginInfo owner = new LoginInfo();
        owner.setUsername("kittycat");
        when(postRepository.getUsernameFromPostId(10)).thenReturn(owner);
        Post existing = new Post();
        existing.setId(10);
        when(postRepository.findById(10L)).thenReturn(existing);

        ResponseEntity<String> resp = postController.updatePost(10L, samplePost, "kittycat", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(postRepository).update(existing);
    }

    @Test
    void updatePost_wrongOwner_returns403() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        LoginInfo owner = new LoginInfo();
        owner.setUsername("mittens");
        when(postRepository.getUsernameFromPostId(10)).thenReturn(owner);

        ResponseEntity<String> resp = postController.updatePost(10L, samplePost, "kittycat", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(postRepository, never()).update(any());
    }

    @Test
    void updatePost_invalidToken_returns401() throws Exception {
        when(loginRepository.authorize("kittycat", "bad")).thenReturn(null);

        ResponseEntity<String> resp = postController.updatePost(10L, samplePost, "kittycat", "bad");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(postRepository, never()).update(any());
    }

    @Test
    void updatePost_expiredToken_delegates_to_deleteCookie() throws Exception {
        when(loginRepository.authorize("kittycat", "expired"))
                .thenThrow(new JdbcLoginRepository.TokenExpiredException());
        when(loginRepository.deleteCookie()).thenReturn(ResponseEntity.ok().build());

        ResponseEntity<String> resp = postController.updatePost(10L, samplePost, "kittycat", "expired");

        verify(loginRepository).deleteCookie();
        verify(postRepository, never()).update(any());
    }

    @Test
    void updatePost_postNotFound_returns404() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        LoginInfo owner = new LoginInfo();
        owner.setUsername("kittycat");
        when(postRepository.getUsernameFromPostId(99)).thenReturn(owner);
        when(postRepository.findById(99L)).thenReturn(null);

        ResponseEntity<String> resp = postController.updatePost(99L, samplePost, "kittycat", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    // ── Resolving a post from a title-derived slug ───────────────────────────

    @Test
    void titleSlug_matchesTheClientSlugify() {
        assertThat(PostController.titleSlug("Café au Lait!")).isEqualTo("cafe-au-lait");
        assertThat(PostController.titleSlug("  sdfsdf ")).isEqualTo("sdfsdf");
        assertThat(PostController.titleSlug("a".repeat(70))).hasSize(60);
        assertThat(PostController.titleSlug("🎉")).isNull();
    }

    @Test
    void resolvePost_findsAPostWithNoStoredSlugByItsTitle() {
        when(jdbc.queryForList(contains("lower(p.slug)"), eq(Integer.class), eq("strky"), eq("my-first-post")))
                .thenReturn(java.util.List.of());
        when(jdbc.queryForList(contains("p.slug IS NULL"), eq("strky")))
                .thenReturn(java.util.List.of(
                        java.util.Map.of("id", 12, "title", "Something else"),
                        java.util.Map.of("id", 209, "title", "My First Post")));
        when(jdbc.queryForList(contains("WHERE p.id = ?"), eq(209)))
                .thenReturn(java.util.List.of(java.util.Map.of("id", 209, "author", "strky", "published", true)));

        ResponseEntity<?> resp = postController.resolvePost("strky", "my-first-post", null, null);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(((java.util.Map<?, ?>) resp.getBody()).get("id")).isEqualTo(209);
    }

    // ── Drafts stay private through every address lookup ─────────────────────

    private static java.util.Map<String, Object> draftRow() {
        return java.util.Map.of("id", 13, "title", "Secret plans", "slug", "secret-plans",
                "published", false, "author", "kittycat");
    }

    @Test
    void canonical_hidesADraftFromEveryoneButItsAuthor() throws Exception {
        when(jdbc.queryForList(contains("WHERE p.id = ?"), eq(13L))).thenReturn(java.util.List.of(draftRow()));
        // Another signed-in user is turned away before their session is even checked.
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);

        assertThat(postController.canonicalPath(13L, null, null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(postController.canonicalPath(13L, "mittens", "tok").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(postController.canonicalPath(13L, "kittycat", "tok").getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void canonical_claimingTheAuthorsNameWithoutTheirTokenGetsNothing() throws Exception {
        when(jdbc.queryForList(contains("WHERE p.id = ?"), eq(13L))).thenReturn(java.util.List.of(draftRow()));
        when(loginRepository.authorize("kittycat", "forged")).thenReturn(null);

        assertThat(postController.canonicalPath(13L, "kittycat", "forged").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void resolve_hidesADraftFromOthers() {
        when(jdbc.queryForList(contains("lower(p.slug)"), eq(Integer.class), eq("kittycat"), eq("secret-plans")))
                .thenReturn(java.util.List.of(13));
        when(jdbc.queryForList(contains("WHERE p.id = ?"), eq(13))).thenReturn(java.util.List.of(draftRow()));

        assertThat(postController.resolvePost("kittycat", "secret-plans", null, null).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void userFromPostId_hidesADraftsAuthor() {
        Post draft = new Post();
        draft.setId(13);
        draft.setPublished(false);
        when(postRepository.findById(13L)).thenReturn(draft);
        LoginInfo owner = new LoginInfo();
        owner.setUsername("kittycat");
        when(postRepository.getUsernameFromPostId(13)).thenReturn(owner);

        assertThat(postController.getUserByPostID(13L, null, null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
}
