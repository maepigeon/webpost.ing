package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.PostController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
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
    @Mock com.springbootprojects.webpostingserver.posts.service.PostingGate postingGate;
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

    /** The save path asks the database who wrote a post, not the repository (no whole user row). */
    private void ownerIs(long postId, String username) {
        when(jdbc.queryForList(contains("SELECT u.username"), eq(String.class), eq(postId)))
                .thenReturn(java.util.List.of(username));
    }

    /** What updatePost reads about the stored post: whether it was public and the bytes it holds. */
    private void storedRow(long postId, boolean published, long bytes) {
        when(jdbc.queryForList(contains("octet_length(description)"), eq(postId)))
                .thenReturn(java.util.List.of(java.util.Map.of("published", published, "stored", bytes)));
    }

    /** What setVisibility reads: the flag, the section and the title, never the body. */
    private static java.util.Map<String, Object> flagRow(boolean published) {
        return java.util.Map.of("published", published, "section", "profile", "title", "T");
    }

    @Test
    void updatePost_validOwner_returns200() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        ownerIs(10, "kittycat");
        storedRow(10, false, 0);

        ResponseEntity<String> resp = postController.updatePost(10L, samplePost, "kittycat", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        // The request is the row: the id comes from the address, and the old body is never loaded.
        verify(postRepository).update(argThat(p -> p.getId() == 10 && "Updated title".equals(p.getTitle())));
        verify(postRepository, never()).findById(any());
        verify(social).parseAndSaveHashtags(10, samplePost.getDescription());
    }

    @Test
    void updatePost_aDraftSaveLeavesHashtagsAlone() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        ownerIs(10, "kittycat");
        storedRow(10, false, 0);
        samplePost.setPublished(false);

        assertThat(postController.updatePost(10L, samplePost, "kittycat", "tok").getStatusCode()).isEqualTo(HttpStatus.OK);

        verify(postRepository).update(any());
        verify(social, never()).parseAndSaveHashtags(anyInt(), any());
    }

    @Test
    void updatePost_theNameOfTheAuthorIsComparedExactly() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        ownerIs(10, "Kittycat");   // the same rule as LoginInfo.compareUsername: case counts

        assertThat(postController.updatePost(10L, samplePost, "kittycat", "tok").getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(postRepository, never()).update(any());
    }

    @Test
    void updatePost_linksUploadsInOneStatement() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        ownerIs(10, "kittycat");
        storedRow(10, false, 0);
        samplePost.setDescription("{\"root\":{\"children\":[{\"src\":\"/uploads/abc.png\"}]}}");

        assertThat(postController.updatePost(10L, samplePost, "kittycat", "tok").getStatusCode()).isEqualTo(HttpStatus.OK);

        verify(jdbc).update("DELETE FROM post_uploads WHERE post_id=?", 10L);
        verify(jdbc).update(contains("string_to_array"), eq(10L), eq("abc.png"));
        verify(jdbc, never()).queryForList(contains("SELECT id FROM uploads"), eq(Integer.class), any());   // no query per file
    }

    @Test
    void setVisibility_ownerMakesItPrivateOrPublic() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        ownerIs(10, "kittycat");
        when(jdbc.queryForList(contains("SELECT published, section, title"), eq(10L)))
                .thenReturn(java.util.List.of(flagRow(true)), java.util.List.of(flagRow(false)));
        when(jdbc.queryForList(contains("SELECT description"), eq(String.class), eq(10L)))
                .thenReturn(java.util.List.of("the body"));

        var resp = postController.setVisibility(10L, java.util.Map.of("published", false), "kittycat", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        // One column changes; the post is neither loaded nor saved whole.
        verify(jdbc).update("UPDATE posts SET published = ? WHERE id = ?", false, 10L);
        verify(postRepository, never()).update(any());
        verify(postRepository, never()).findById(any());
        verifyNoInteractions(emailNotifications);   // going private tells nobody
        verify(social, never()).parseAndSaveHashtags(anyInt(), any());

        postController.setVisibility(10L, java.util.Map.of("published", true), "kittycat", "tok");
        verify(jdbc).update("UPDATE posts SET published = ? WHERE id = ?", true, 10L);
        verify(emailNotifications).notifyFollowersOfPost(eq("kittycat"), eq("T"), eq(10L));   // a draft made public is published
        verify(social).parseAndSaveHashtags(10, "the body");   // its tags appear when it goes public
    }

    @Test
    void setVisibility_notTheOwnerOrNotSignedIn() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        when(jdbc.queryForList(contains("SELECT published, section, title"), eq(10L))).thenReturn(java.util.List.of(flagRow(false)));
        ownerIs(10, "mittens");
        assertThat(postController.setVisibility(10L, java.util.Map.of("published", true), "kittycat", "tok").getStatusCode())
            .isEqualTo(HttpStatus.FORBIDDEN);
        verify(jdbc, never()).update(contains("SET published"), eq(true), eq(10L));

        when(loginRepository.authorize("kittycat", "bad")).thenReturn(null);
        assertThat(postController.setVisibility(10L, java.util.Map.of("published", true), "kittycat", "bad").getStatusCode())
            .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void setVisibility_aMissingPostIsNotFound() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);

        assertThat(postController.setVisibility(99L, java.util.Map.of("published", true), "kittycat", "tok").getStatusCode())
            .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void updatePost_wrongOwner_returns403() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        ownerIs(10, "mittens");

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
        ownerIs(99, "kittycat");   // the author row is there; the post row is gone (a race)

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
                "published", published, "username", "kittycat");
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
    @SuppressWarnings("unchecked")
    void card_carriesThePreviewAndNeverTheBody() throws Exception {
        java.util.Map<String, Object> row = new java.util.HashMap<>(cardRow(true));
        row.put("card_preview", "{\"cols\":2,\"rows\":1}");
        row.put("body", null);
        when(jdbc.queryForList(contains("WHERE p.id = ?"), eq(13L))).thenReturn(java.util.List.of(row));

        java.util.Map<String, Object> card = (java.util.Map<String, Object>) postController.postCard(13L, null, null).getBody();

        assertThat(card).doesNotContainKeys("description", "body", "card_preview");
        assertThat(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(card.get("preview")))
                .isEqualTo("{\"cols\":2,\"rows\":1}");
        assertThat(card).containsEntry("username", "kittycat").containsEntry("title", "Secret plans");
    }

    @Test
    @SuppressWarnings("unchecked")
    void card_ofARowNotYetComputedFindsTheGridInTheBody() throws Exception {
        java.util.Map<String, Object> row = new java.util.HashMap<>(cardRow(true));
        row.put("card_preview", null);
        row.put("body", "{\"root\":{\"children\":[{\"type\":\"tilegrid\",\"grid\":{\"cols\":3,\"rows\":1}}]}}");
        when(jdbc.queryForList(contains("WHERE p.id = ?"), eq(13L))).thenReturn(java.util.List.of(row));

        java.util.Map<String, Object> card = (java.util.Map<String, Object>) postController.postCard(13L, null, null).getBody();

        assertThat(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(card.get("preview")))
                .isEqualTo("{\"cols\":3,\"rows\":1}");
        assertThat(card).doesNotContainKey("body");
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
        when(jdbc.queryForList(contains("WHERE p.id = ?"), eq(13L)))
                .thenReturn(java.util.List.of(java.util.Map.of("published", false, "section", "profile", "username", "kittycat")));

        assertThat(postController.getUserByPostID(13L, null, null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        verify(postRepository, never()).findById(any());   // the body is not loaded to answer this
    }

    @Test
    void userFromPostId_namesTheAuthorOfAPublishedPost() {
        when(jdbc.queryForList(contains("WHERE p.id = ?"), eq(14L)))
                .thenReturn(java.util.List.of(java.util.Map.of("published", true, "section", "profile", "username", "kittycat")));

        ResponseEntity<String> resp = postController.getUserByPostID(14L, null, null);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).isEqualTo("kittycat");
        assertThat(postController.getUserByPostID(15L, null, null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
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

    private void existingPostOwnedByKittycat() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        ownerIs(10, "kittycat");
        storedRow(10, false, 0);
    }

    @Test
    void updatePost_savesTheSummaryTrimmedOnOneLine() throws Exception {
        existingPostOwnedByKittycat();
        samplePost.setSummary("  First line\nsecond line \r\n third  ");

        assertThat(postController.updatePost(10L, samplePost, "kittycat", "tok").getStatusCode()).isEqualTo(HttpStatus.OK);

        verify(postRepository).update(argThat(p -> "First line second line third".equals(p.getSummary())));
    }

    @Test
    void updatePost_anEmptySummaryClearsIt() throws Exception {
        existingPostOwnedByKittycat();
        samplePost.setSummary("  \n ");

        assertThat(postController.updatePost(10L, samplePost, "kittycat", "tok").getStatusCode()).isEqualTo(HttpStatus.OK);

        verify(postRepository).update(argThat(p -> p.getSummary() == null));
    }

    @Test
    void updatePost_aSummaryOver300CharactersIsRejected() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        ownerIs(10, "kittycat");
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
        ownerIs(10, "kittycat");
        storedRow(10, false, 8);   // "old text" is 8 bytes
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
        ownerIs(10, "kittycat");
        when(jdbc.queryForList(contains("SELECT published, section, title"), eq(10L))).thenReturn(java.util.List.of(flagRow(false)));
        postWasAnnounced(true);

        postController.setVisibility(10L, java.util.Map.of("published", true), "kittycat", "tok");

        verify(social, never()).notifyFollowers(anyInt(), any(), any());
        verify(emailNotifications, never()).notifyFollowersOfPost(any(), any(), anyLong());
    }

    @Test
    void firstPublishNotifiesFollowers_throughVisibilityAndThroughTheEditor() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        ownerIs(10, "kittycat");
        when(social.getUserIdByUsername("kittycat")).thenReturn(1);
        postWasAnnounced(false);

        when(jdbc.queryForList(contains("SELECT published, section, title"), eq(10L))).thenReturn(java.util.List.of(flagRow(false)));
        postController.setVisibility(10L, java.util.Map.of("published", true), "kittycat", "tok");
        verify(social).notifyFollowers(1, "kittycat", 10);

        // The editor path: a draft saved as published for the first time.
        storedRow(10, false, 0);
        postController.updatePost(10L, samplePost, "kittycat", "tok");
        verify(social, times(2)).notifyFollowers(1, "kittycat", 10);
    }

    @Test
    void editorRepublishOfAnAnnouncedPost_doesNotNotifyFollowersAgain() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        ownerIs(10, "kittycat");
        storedRow(10, false, 0);
        postWasAnnounced(true);

        postController.updatePost(10L, samplePost, "kittycat", "tok");

        verify(social, never()).notifyFollowers(anyInt(), any(), any());
        verify(emailNotifications, never()).notifyFollowersOfPost(any(), any(), anyLong());
    }

    // ── Creating a post ───────────────────────────────────────────────────────

    @Test
    void createPost_hashtagsAreSavedOnlyForAPublishedPost() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        when(postRepository.save(any(), eq(1))).thenReturn(7);

        samplePost.setPublished(false);
        assertThat(postController.createPost(samplePost, "kittycat", "tok").getStatusCode()).isEqualTo(HttpStatus.CREATED);
        verify(social, never()).parseAndSaveHashtags(anyInt(), any());

        samplePost.setPublished(true);
        assertThat(postController.createPost(samplePost, "kittycat", "tok").getStatusCode()).isEqualTo(HttpStatus.CREATED);
        verify(social).parseAndSaveHashtags(7, samplePost.getDescription());
    }

    @Test
    void createPost_theDailyLimitIsOneLookupAndACount() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        when(jdbc.queryForObject(contains("max_posts_per_day"), eq(Integer.class), eq(1))).thenReturn(2);
        when(jdbc.queryForObject(contains("COUNT(*) FROM posts"), eq(Integer.class), eq(1))).thenReturn(2);

        ResponseEntity<String> resp = postController.createPost(samplePost, "kittycat", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        verify(postRepository, never()).save(any(), anyInt());
        verify(jdbc, never()).queryForObject(contains("SELECT role FROM users"), eq(String.class), any());
    }

    // ── Search ────────────────────────────────────────────────────────────────

    @Test
    void searchPosts_looksInTheStoredTextNotInTheBody() {
        postController.searchPosts("kitten", null);
        postController.searchPosts("kitten", "kittycat");

        org.mockito.ArgumentCaptor<String> sql = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(jdbc, times(2)).queryForList(sql.capture(), any(Object[].class));
        assertThat(sql.getAllValues()).allSatisfy(q ->
                assertThat(q).contains("p.search_text ILIKE ?").doesNotContain("p.description"));
    }

    // ── Profile paging ────────────────────────────────────────────────────────

    @Test
    void profilePageIsCutInSqlAndTheLimitIsCappedAtFifty() {
        when(postRepository.getPostsPage("kittycat", "profile", false, 50, 0)).thenReturn(new java.util.ArrayList<>());
        postController.getPostsByUser("kittycat", 5000, 0, "profile", null, null);
        verify(postRepository).getPostsPage("kittycat", "profile", false, 50, 0);

        postController.getPostsByUser("kittycat", -3, -9, "profile", null, null);
        verify(postRepository).getPostsPage("kittycat", "profile", false, 1, 0);
        verify(postRepository, never()).getPostsFromUsername(any());   // never the whole list
    }
}
