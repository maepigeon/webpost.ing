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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;

@ExtendWith(MockitoExtension.class)
class PostControllerTest {

    // Email notifications are a fire-and-forget side effect; mocked so these

    // tests stay about the endpoint behaviour.

    @Mock com.springbootprojects.webpostingserver.posts.service.EmailNotificationService emailNotifications;

    @Mock PostRepository postRepository;
    @Mock LoginRepository loginRepository;
    @Mock SocialRepository social;
    @Mock JdbcTemplate jdbc;
    @Mock com.springbootprojects.webpostingserver.posts.service.StorageAccountService storage;

    @InjectMocks PostController postController;

    private Post samplePost;
    private AuthSession validSession;

    @BeforeEach
    void setUp() {
        samplePost = new Post();
        samplePost.setTitle("Updated title");
        samplePost.setDescription("{\"root\":{\"children\":[]}}");   // 24 bytes
        samplePost.setPublished(true);

        validSession = new AuthSession("kittycat");
        validSession.userId = 1;
        lenient().when(storage.fitsQuota(anyInt(), anyLong(), anyLong())).thenReturn(true);
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
    void setVisibility_ownerMakesItPrivateOrPublic() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        LoginInfo owner = new LoginInfo();
        owner.setUsername("kittycat");
        when(postRepository.getUsernameFromPostId(10)).thenReturn(owner);
        Post existing = new Post();
        existing.setId(10);
        existing.setPublished(true);
        when(postRepository.findById(10L)).thenReturn(existing);

        var resp = postController.setVisibility(10L, java.util.Map.of("published", false), "kittycat", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(existing.isPublished()).isFalse();
        verify(postRepository).update(existing);
        verifyNoInteractions(emailNotifications);   // going private tells nobody

        postController.setVisibility(10L, java.util.Map.of("published", true), "kittycat", "tok");
        assertThat(existing.isPublished()).isTrue();
        verify(emailNotifications).notifyFollowersOfPost(eq("kittycat"), any(), eq(10L));   // a draft made public is published
    }

    @Test
    void setVisibility_notTheOwnerOrNotSignedIn() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        Post existing = new Post();
        existing.setId(10);
        when(postRepository.findById(10L)).thenReturn(existing);
        LoginInfo owner = new LoginInfo();
        owner.setUsername("mittens");
        when(postRepository.getUsernameFromPostId(10)).thenReturn(owner);
        assertThat(postController.setVisibility(10L, java.util.Map.of("published", true), "kittycat", "tok").getStatusCode())
            .isEqualTo(HttpStatus.FORBIDDEN);
        verify(postRepository, never()).update(any());

        when(loginRepository.authorize("kittycat", "bad")).thenReturn(null);
        assertThat(postController.setVisibility(10L, java.util.Map.of("published", true), "kittycat", "bad").getStatusCode())
            .isEqualTo(HttpStatus.UNAUTHORIZED);
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
        assertThat(((java.util.Map<Object, Object>) resp.getBody()).get("id")).isEqualTo(209);
    }

    // ── Saving a profile's arrangement ───────────────────────────────────────

    @Test
    void updatePostOrder_passesTheListInOrderWithFolders() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        java.util.Map<String, Object> first = new java.util.HashMap<>();
        first.put("id", 7);
        first.put("folder", "  Travel ");
        java.util.Map<String, Object> second = new java.util.HashMap<>();
        second.put("id", 3);
        second.put("folder", null);
        // A position sent by the client is ignored: the list order decides.
        second.put("sortOrder", 99);

        ResponseEntity<String> resp = postController.updatePostOrder("kittycat",
                java.util.Map.of("updates", java.util.List.of(first, second, java.util.Map.of("id", "junk"))),
                "kittycat", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        java.util.Map<Integer, String> folders = new java.util.HashMap<>();
        folders.put(7, "Travel");
        folders.put(3, null);
        verify(postRepository).reorder(1, java.util.List.of(7, 3), folders);
    }

    @Test
    void updatePostOrder_anotherUsersProfileIsForbidden() {
        ResponseEntity<String> resp = postController.updatePostOrder("mittens",
                java.util.Map.of("updates", java.util.List.of()), "kittycat", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verifyNoInteractions(postRepository);
    }

    @Test
    void updatePostOrder_withoutAListIsRejected() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);

        ResponseEntity<String> resp = postController.updatePostOrder("kittycat",
                java.util.Map.of("updates", "nope"), "kittycat", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verifyNoInteractions(postRepository);
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

    // A post card in a message answers by the same rule: a draft reaches nobody but its author.

    private static java.util.Map<String, Object> cardRow(boolean published) {
        return java.util.Map.of("id", 13, "title", "Secret plans", "slug", "secret-plans",
                "published", published, "description", "{}", "username", "kittycat");
    }

    @Test
    void card_hidesADraftFromEveryoneButItsAuthor() throws Exception {
        when(jdbc.queryForList(contains("WHERE p.id = ?"), eq(13L))).thenReturn(java.util.List.of(cardRow(false)));
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        when(loginRepository.authorize("kittycat", "forged")).thenReturn(null);

        assertThat(postController.postCard(13L, null, null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(postController.postCard(13L, "mittens", "tok").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(postController.postCard(13L, "kittycat", "forged").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(postController.postCard(13L, "kittycat", "tok").getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @SuppressWarnings("unchecked")
    void card_ofAPublishedPostIsOpenToAnyone() {
        when(jdbc.queryForList(contains("WHERE p.id = ?"), eq(13L))).thenReturn(java.util.List.of(cardRow(true)));

        ResponseEntity<?> resp = postController.postCard(13L, null, null);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((java.util.Map<Object, Object>) resp.getBody()).containsEntry("username", "kittycat");
    }

    @Test
    void card_ofAMissingPostIsNotFound() {
        when(jdbc.queryForList(contains("WHERE p.id = ?"), eq(99L))).thenReturn(java.util.List.of());

        assertThat(postController.postCard(99L, null, null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
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

    // ── Pinned post ───────────────────────────────────────────────────────────

    @Test
    void pinnedPost_noneIsNoContentNotAnError() {
        when(jdbc.queryForList(contains("pinned_post_id"), eq(Integer.class), eq("kittycat")))
                .thenReturn(new java.util.ArrayList<>(java.util.Collections.singletonList(null)));

        assertThat(postController.getPinnedPost("kittycat", null, null).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }

    @Test
    void pinnedPost_aDraftIsNotShownForAForgedUsernameCookie() throws Exception {
        when(jdbc.queryForList(contains("pinned_post_id"), eq(Integer.class), eq("kittycat"))).thenReturn(java.util.List.of(13));
        Post draft = new Post();
        draft.setId(13);
        draft.setPublished(false);
        when(postRepository.findById(13L)).thenReturn(draft);
        when(loginRepository.authorize("kittycat", "forged")).thenReturn(null);
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);

        assertThat(postController.getPinnedPost("kittycat", "kittycat", "forged").getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(postController.getPinnedPost("kittycat", "kittycat", "tok").getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    // ── Description (summary) ─────────────────────────────────────────────────

    private Post existingPostOwnedByKittycat() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        LoginInfo owner = new LoginInfo();
        owner.setUsername("kittycat");
        when(postRepository.getUsernameFromPostId(10)).thenReturn(owner);
        Post existing = new Post();
        existing.setId(10);
        when(postRepository.findById(10L)).thenReturn(existing);
        return existing;
    }

    @Test
    void updatePost_savesTheSummaryTrimmedOnOneLine() throws Exception {
        Post existing = existingPostOwnedByKittycat();
        samplePost.setSummary("  First line\nsecond line \r\n third  ");

        assertThat(postController.updatePost(10L, samplePost, "kittycat", "tok").getStatusCode()).isEqualTo(HttpStatus.OK);

        assertThat(existing.getSummary()).isEqualTo("First line second line third");
    }

    @Test
    void updatePost_anEmptySummaryClearsIt() throws Exception {
        Post existing = existingPostOwnedByKittycat();
        existing.setSummary("old");
        samplePost.setSummary("  \n ");

        assertThat(postController.updatePost(10L, samplePost, "kittycat", "tok").getStatusCode()).isEqualTo(HttpStatus.OK);

        assertThat(existing.getSummary()).isNull();
    }

    @Test
    void updatePost_aSummaryOver300CharactersIsRejected() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        LoginInfo owner = new LoginInfo();
        owner.setUsername("kittycat");
        when(postRepository.getUsernameFromPostId(10)).thenReturn(owner);
        samplePost.setSummary("x".repeat(301));

        ResponseEntity<String> resp = postController.updatePost(10L, samplePost, "kittycat", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody()).contains("300");
        verify(postRepository, never()).update(any());
    }

    @Test
    void createPost_savesTheSummaryAndRejectsALongOne() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        samplePost.setSummary("x".repeat(301));
        assertThat(postController.createPost(samplePost, "kittycat", "tok").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verify(postRepository, never()).save(any(), anyInt());

        samplePost.setSummary(" A blurb ");
        postController.createPost(samplePost, "kittycat", "tok");
        verify(postRepository).save(argThat(p -> "A blurb".equals(p.getSummary())), eq(1));
    }

    // ── Storage limit ─────────────────────────────────────────────────────────

    @Test
    void createPost_overTheStorageLimit_is413AndNothingIsSaved() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        when(storage.fitsQuota(eq(1), eq(24L), eq(0L))).thenReturn(false);   // the sample body is 24 bytes

        ResponseEntity<String> resp = postController.createPost(samplePost, "kittycat", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(resp.getBody()).contains("Storage limit reached");
        verify(postRepository, never()).save(any(), anyInt());
    }

    @Test
    void updatePost_chargesTheNewTextAndFreesTheOld() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        LoginInfo owner = new LoginInfo();
        owner.setUsername("kittycat");
        when(postRepository.getUsernameFromPostId(10)).thenReturn(owner);
        Post existing = new Post();
        existing.setId(10);
        existing.setDescription("old text");   // 8 bytes
        when(postRepository.findById(10L)).thenReturn(existing);
        when(storage.fitsQuota(eq(1), eq(24L), eq(8L))).thenReturn(false);

        ResponseEntity<String> resp = postController.updatePost(10L, samplePost, "kittycat", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        verify(postRepository, never()).update(any());
    }

    // ── Followers are told once ───────────────────────────────────────────────

    private void postWasAnnounced(boolean announced) {
        when(jdbc.queryForObject(contains("new_post"), eq(Integer.class), any(Object.class))).thenReturn(announced ? 1 : 0);
    }

    @Test
    void republishingAnAlreadyAnnouncedPost_doesNotNotifyFollowersAgain() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        LoginInfo owner = new LoginInfo();
        owner.setUsername("kittycat");
        when(postRepository.getUsernameFromPostId(10)).thenReturn(owner);
        Post hidden = new Post();
        hidden.setId(10);
        hidden.setTitle("T");
        hidden.setPublished(false);
        when(postRepository.findById(10L)).thenReturn(hidden);
        postWasAnnounced(true);

        postController.setVisibility(10L, java.util.Map.of("published", true), "kittycat", "tok");

        verify(social, never()).notifyFollowers(anyInt(), any(), any());
        verify(emailNotifications, never()).notifyFollowersOfPost(any(), any(), anyLong());
    }

    @Test
    void firstPublishNotifiesFollowers_throughVisibilityAndThroughTheEditor() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        LoginInfo owner = new LoginInfo();
        owner.setUsername("kittycat");
        when(postRepository.getUsernameFromPostId(10)).thenReturn(owner);
        when(social.getUserIdByUsername("kittycat")).thenReturn(1);
        postWasAnnounced(false);

        Post hidden = new Post();
        hidden.setId(10);
        hidden.setTitle("T");
        when(postRepository.findById(10L)).thenReturn(hidden);
        postController.setVisibility(10L, java.util.Map.of("published", true), "kittycat", "tok");
        verify(social).notifyFollowers(1, "kittycat", 10);

        // The editor path: a draft saved as published for the first time.
        Post draft = new Post();
        draft.setId(10);
        when(postRepository.findById(10L)).thenReturn(draft);
        postController.updatePost(10L, samplePost, "kittycat", "tok");
        verify(social, times(2)).notifyFollowers(1, "kittycat", 10);
    }

    @Test
    void editorRepublishOfAnAnnouncedPost_doesNotNotifyFollowersAgain() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        LoginInfo owner = new LoginInfo();
        owner.setUsername("kittycat");
        when(postRepository.getUsernameFromPostId(10)).thenReturn(owner);
        Post draft = new Post();
        draft.setId(10);
        when(postRepository.findById(10L)).thenReturn(draft);
        postWasAnnounced(true);

        postController.updatePost(10L, samplePost, "kittycat", "tok");

        verify(social, never()).notifyFollowers(anyInt(), any(), any());
        verify(emailNotifications, never()).notifyFollowersOfPost(any(), any(), anyLong());
    }

    // ── Profile paging ────────────────────────────────────────────────────────

    @Test
    void profilePageIsCutInSqlAndTheLimitIsCappedAtFifty() {
        when(postRepository.getPostsPage("kittycat", false, 50, 0)).thenReturn(new java.util.ArrayList<>());
        postController.getPostsByUser("kittycat", 5000, 0, null, null);
        verify(postRepository).getPostsPage("kittycat", false, 50, 0);

        postController.getPostsByUser("kittycat", -3, -9, null, null);
        verify(postRepository).getPostsPage("kittycat", false, 1, 0);
        verify(postRepository, never()).getPostsFromUsername(any());   // never the whole list
    }
}
