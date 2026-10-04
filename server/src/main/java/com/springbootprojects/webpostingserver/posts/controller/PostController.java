package com.springbootprojects.webpostingserver.posts.controller;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.Post;

import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.service.PostPreview;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.validator.WallpaperValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;


@RestController
@RequestMapping("/api")
public class PostController {

    private static final Logger log = LoggerFactory.getLogger(PostController.class);

    /** Counts what a post stores in the database against the author's quota (see StorageAccountService). */
    @Autowired private com.springbootprojects.webpostingserver.posts.service.StorageAccountService storage;

    private static final String SECTION_SUBSCRIBERS = "subscribers";
    private static final java.util.Set<String> SECTIONS = java.util.Set.of("profile", "notes", SECTION_SUBSCRIBERS);

    private static final String STORAGE_FULL = "Storage limit reached. Free up some space first.";

    /** Bytes a post's text columns take: its content and its wallpaper. */
    private static long storedBytes(String description, String wallpaper) {
        long n = 0;
        if (description != null) n += description.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
        if (wallpaper != null) n += wallpaper.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
        return n;
    }

    /**
     * Followers are told about a post once, when it is first published. A
     * notification row for the post is the record that they were: unpublishing
     * and publishing again (which anyone can loop) must not notify and email
     * them every time.
     */
    /**
     * Only posts on the profile announce themselves to followers. Notes are
     * quieter than posts, so publishing one tells nobody, and subscribers
     * posts are private for now.
     */
    private static boolean announces(String section) {
        return section == null || "profile".equals(section);
    }

    private boolean alreadyAnnounced(long postId) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM notifications WHERE type = 'new_post' AND post_id = ?", Integer.class, postId);
        return n != null && n > 0;
    }
    // ── Resolving a post from a URL segment ───────────────────────────────────

    /**
     * Finds a post from whatever appears in the URL after the author's name.
     *
     * Two forms resolve:
     *   /mae/42            — the id
     *   /mae/my-post       — the slug, stored or derived from the title
     *
     * A slug lookup is scoped to the
     * named author and ordered by id, so a duplicate — which the save path tries
     * to prevent but cannot guarantee under a race — always resolves to the same
     * post rather than alternating.
     */
    @GetMapping("/users/{username}/resolve/{segment}")
    public ResponseEntity<?> resolvePost(@PathVariable String username, @PathVariable String segment,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {
        java.util.regex.Matcher leadingId = java.util.regex.Pattern.compile("^(\\d+)$").matcher(segment);

        Integer postId = null;
        if (leadingId.matches()) {
            postId = Integer.valueOf(leadingId.group(1));
        } else {
            List<Integer> matches = jdbc.queryForList("""
                    SELECT p.id
                      FROM posts p
                      JOIN users_posts_junctions j ON j.post_id = p.id
                      JOIN users u ON u.id = j.user_id
                     WHERE u.username = ? AND lower(p.slug) = lower(?)
                     ORDER BY p.id
                     LIMIT 1
                    """, Integer.class, username, segment);
            if (!matches.isEmpty()) postId = matches.get(0);
            else postId = findByTitleSlug(username, segment);
        }

        if (postId == null) return ResponseEntity.notFound().build();

        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT p.id, p.title, p.slug, p.published, p.section, COALESCE(u.username, '') AS author
                  FROM posts p
                  LEFT JOIN users_posts_junctions j ON j.post_id = p.id
                  LEFT JOIN users u ON u.id = j.user_id
                 WHERE p.id = ?
                """, postId);
        if (rows.isEmpty()) return ResponseEntity.notFound().build();
        Map<String, Object> row = rows.get(0);
        if (!canSee(Boolean.TRUE.equals(row.get("published")), (String) row.get("section"), (String) row.get("author"), authUsername, token))
            return ResponseEntity.notFound().build();

        return ResponseEntity.ok(row);
    }

    /**
     * Whether the requester may learn anything about a post: anyone for a
     * published post, only its signed-in author for a draft. A post in the
     * "subscribers" section is the author's alone, published or not, until
     * subscriptions exist to say who else may read it.
     *
     * Every lookup that answers with a post's title, slug or author goes
     * through this. The address lookups used to answer for drafts too, so
     * counting through post ids listed the title and author of every draft on
     * the site.
     */
    private boolean canSee(boolean published, String section, String author, String authUsername, String token) {
        if (published && !SECTION_SUBSCRIBERS.equals(section)) return true;
        if (authUsername == null || token == null || author == null || !author.equals(authUsername)) return false;
        try {
            return loginRepository.authorize(authUsername, token) != null;
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return false;
        }
    }

    /**
     * Most posts have no stored slug: their links use one derived from the
     * title (see client/src/utils/postUrl.js effectiveSlug). Match those the
     * same way, lowest id first so a repeated title always resolves the same.
     */
    private Integer findByTitleSlug(String username, String segment) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT p.id, p.title
                  FROM posts p
                  JOIN users_posts_junctions j ON j.post_id = p.id
                  JOIN users u ON u.id = j.user_id
                 WHERE u.username = ? AND (p.slug IS NULL OR p.slug = '')
                 ORDER BY p.id
                """, username);
        String wanted = segment.toLowerCase();
        for (Map<String, Object> row : rows) {
            if (wanted.equals(titleSlug((String) row.get("title")))) return (Integer) row.get("id");
        }
        return null;
    }

    /** Title slugs that say nothing; such a post is addressed by its id instead. */
    private static final java.util.Set<String> EMPTY_SLUGS = java.util.Set.of("untitled", "undefined", "null", "new-post", "post");

    /**
     * The slug a post is saved under: the author's own, or else one made from
     * the title. Stored either way, so every post has a unique /author/slug
     * address — two posts with the same title get "title" and "title-2" rather
     * than sharing one address that only the older can answer.
     */
    private static String slugFor(Post post) {
        String custom = normaliseSlug(post.getSlug());
        if (custom != null) return custom;
        String derived = titleSlug(post.getTitle());
        return derived == null || EMPTY_SLUGS.contains(derived) ? null : derived;
    }

    /** Mirrors slugify() in client/src/utils/postUrl.js, including its 60-character cap. */
    public static String titleSlug(String title) {
        String slug = normaliseSlug(title);
        if (slug == null) return null;
        if (slug.length() > 60) slug = slug.substring(0, 60).replaceAll("-+$", "");
        return slug;
    }

    /**
     * Finds the author of a post from its id alone, so a bare /123 can be sent
     * on to the post's real address.
     */
    @GetMapping("/posts/{id}/canonical")
    public ResponseEntity<?> canonicalPath(@PathVariable long id,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT p.id, p.title, p.slug, p.published, p.section, COALESCE(u.username, '') AS author
                  FROM posts p
                  LEFT JOIN users_posts_junctions j ON j.post_id = p.id
                  LEFT JOIN users u ON u.id = j.user_id
                 WHERE p.id = ?
                """, id);
        if (rows.isEmpty() || String.valueOf(rows.get(0).get("author")).isEmpty())
            return ResponseEntity.notFound().build();
        Map<String, Object> row = rows.get(0);
        if (!canSee(Boolean.TRUE.equals(row.get("published")), (String) row.get("section"), (String) row.get("author"), authUsername, token))
            return ResponseEntity.notFound().build();
        return ResponseEntity.ok(row);
    }

    /**
     * What a post card in a message needs: title, address, author and the
     * grid it shows (the stored preview, never the body). A post shared in a direct message is seen
     * by whoever reads that conversation, so this answers by the same rule as
     * the address lookups: a draft is the author's alone, and for anyone else
     * it is indistinguishable from a post that does not exist.
     */
    @GetMapping("/posts/{id}/card")
    public ResponseEntity<?> postCard(@PathVariable long id,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT p.id, p.title, p.slug, p.published, p.section, COALESCE(u.username, '') AS username,
                       CASE WHEN p.card_grid THEN p.card_preview END AS card_preview,
                       CASE WHEN p.card_grid AND p.preview_version < %d THEN p.description END AS body
                  FROM posts p
                  LEFT JOIN users_posts_junctions j ON j.post_id = p.id
                  LEFT JOIN users u ON u.id = j.user_id
                 WHERE p.id = ?
                """.formatted(PostPreview.VERSION), id);
        if (rows.isEmpty() || String.valueOf(rows.get(0).get("username")).isEmpty())
            return ResponseEntity.notFound().build();
        Map<String, Object> row = rows.get(0);
        if (!canSee(Boolean.TRUE.equals(row.get("published")), (String) row.get("section"), (String) row.get("username"), authUsername, token))
            return ResponseEntity.notFound().build();
        Map<String, Object> card = new java.util.LinkedHashMap<>();
        for (String key : new String[] {"id", "title", "slug", "published", "section", "username"}) card.put(key, row.get(key));
        // A row the sweep has not reached yet has no stored preview; its grid is found in the body (nothing is written).
        card.put("preview", PostPreview.previewValue((String) row.get("card_preview"), (String) row.get("body")));
        return ResponseEntity.ok(card);
    }

    /**
     * Makes a slug unique among the author's other posts by appending a counter.
     *
     * Posts are now reachable by slug alone, so a duplicate would make one of
     * the two unreachable. Silently adjusting beats rejecting the save: the
     * author cannot see their other slugs from the editor, so "that name is
     * taken" would be a puzzle rather than a prompt.
     */
    private String uniqueSlugFor(String slug, String username, Integer excludePostId) {
        if (slug == null || slug.isBlank()) return null;
        String candidate = slug;
        for (int suffix = 2; suffix < 100; suffix++) {
            List<Integer> clash = jdbc.queryForList("""
                    SELECT p.id
                      FROM posts p
                      JOIN users_posts_junctions j ON j.post_id = p.id
                      JOIN users u ON u.id = j.user_id
                     WHERE u.username = ? AND lower(p.slug) = lower(?) AND (CAST(? AS INTEGER) IS NULL OR p.id <> CAST(? AS INTEGER))
                     LIMIT 1
                    """, Integer.class, username, candidate, excludePostId, excludePostId);
            if (clash.isEmpty()) return candidate;
            candidate = slug + "-" + suffix;
        }
        return slug + "-" + System.currentTimeMillis();
    }

    /**
     * Normalises an author-chosen slug, or returns null to fall back to the
     * title.
     *
     * The slug appears in a URL, so it is reduced to lowercase letters, digits
     * and single hyphens rather than rejected — a near-miss should be tidied,
     * not refused. It is not checked for uniqueness: the post id precedes it in
     * the URL, so duplicates are harmless.
     */
    static String normaliseSlug(String raw) {
        if (raw == null) return null;
        String slug = java.text.Normalizer.normalize(raw.trim(), java.text.Normalizer.Form.NFKD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-+)|(-+$)", "");
        if (slug.length() > 80) slug = slug.substring(0, 80).replaceAll("-+$", "");
        return slug.isEmpty() ? null : slug;
    }


    @Autowired private com.springbootprojects.webpostingserver.posts.service.EmailNotificationService emailNotifications;
    @Autowired private com.springbootprojects.webpostingserver.posts.service.PostingGate postingGate;
    @Autowired PostRepository postRepository;
    @Autowired LoginRepository loginRepository;
    @Autowired SocialRepository social;
    @Autowired JdbcTemplate jdbc;

    private static final Pattern UPLOAD_PATTERN = Pattern.compile("/uploads/([^\"\\s]+)");

    /**
     * Links a post to the uploads it names, in two statements however many it
     * names. Kept for drafts too: orphan cleanup has to see a draft's images.
     * Upload names are UUID paths, so a newline never occurs inside one.
     */
    private void syncPostUploads(long postId, String description) {
        Set<String> filenames = new HashSet<>();
        if (description != null) {
            Matcher m = UPLOAD_PATTERN.matcher(description);
            while (m.find()) filenames.add(m.group(1));
        }
        jdbc.update("DELETE FROM post_uploads WHERE post_id=?", postId);
        if (filenames.isEmpty()) return;
        jdbc.update("INSERT INTO post_uploads(post_id, upload_id) SELECT CAST(? AS INTEGER), id FROM uploads"
                + " WHERE filename = ANY(string_to_array(?, E'\\n')) ON CONFLICT DO NOTHING",
                postId, String.join("\n", filenames));
    }

    /**
     * The username of a post's author, or null when the post has no author row.
     * Callers that only compare names use this instead of loading the author's
     * whole row; compare with equals, as LoginInfo.compareUsername does.
     */
    private String ownerOf(long postId) {
        List<String> names = jdbc.queryForList(
                "SELECT u.username FROM users_posts_junctions j JOIN users u ON u.id = j.user_id WHERE j.post_id = ?",
                String.class, postId);
        return names.isEmpty() ? null : names.get(0);
    }

    @GetMapping("/posts/{id}")
    public ResponseEntity<Post> getPostById(
            @PathVariable("id") long id,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token) {
        Post post = postRepository.findById(id);
        if (post == null) return new ResponseEntity<>(HttpStatus.NOT_FOUND);

        if (!post.isPublished() || SECTION_SUBSCRIBERS.equals(post.getSection())) {
            // Draft, or a subscribers post — only the owner may read it
            if (username == null || token == null) return new ResponseEntity<>(HttpStatus.NOT_FOUND);
            AuthSession session;
            try {
                session = loginRepository.authorize(username, token);
            } catch (JdbcLoginRepository.TokenExpiredException ex) {
                return new ResponseEntity<>(HttpStatus.NOT_FOUND);
            }
            if (session == null) return new ResponseEntity<>(HttpStatus.NOT_FOUND);
            if (!username.equals(ownerOf(id)))
                return new ResponseEntity<>(HttpStatus.NOT_FOUND);
        }

        return new ResponseEntity<>(post, HttpStatus.OK);
    }

    @GetMapping("/UserFromPostID/{id}")
    public ResponseEntity<String> getUserByPostID(@PathVariable("id") long id,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {
        // One row, no body: all the answer needs is whether the post is public and who wrote it.
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT p.published, p.section, u.username
                  FROM posts p
                  JOIN users_posts_junctions j ON j.post_id = p.id
                  JOIN users u ON u.id = j.user_id
                 WHERE p.id = ?
                """, id);
        Map<String, Object> row = rows.isEmpty() ? null : rows.get(0);

        if (row != null && canSee(Boolean.TRUE.equals(row.get("published")), (String) row.get("section"),
                (String) row.get("username"), authUsername, token)) {
            return new ResponseEntity<>((String) row.get("username"), HttpStatus.OK);
        } else {
            return new ResponseEntity<>(HttpStatus.NOT_FOUND);
        }
    }

    private boolean isOwner(String username, String authUsername, String authToken) {
        if (authUsername != null && authUsername.equals(username) && authToken != null) {
            try {
                return loginRepository.authorize(authUsername, authToken) != null;
            } catch (JdbcLoginRepository.TokenExpiredException ignored) {}
        }
        return false;
    }

    /**
     * An author's posts in one section: "profile" (the default), "notes",
     * "subscribers" (owner only) or "drafts" (every unpublished post, owner
     * only). What others may not see comes back as an empty list.
     */
    @GetMapping("/user/{username}")
    public ResponseEntity<List<Post>> getPostsByUser(
            @PathVariable("username") String username,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "profile") String section,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String authToken) {
        boolean isOwner = isOwner(username, authUsername, authToken);
        if (!SECTIONS.contains(section) && !"drafts".equals(section))
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);

        // The page is cut in SQL, in profile order (the author's arrangement,
        // then newest first), and drafts are dropped there for visitors. The
        // same order is what paging slices: sorting pages by date while the
        // page showed them by arrangement repeated some posts across pages and
        // skipped others. Loading every post to slice it here let one author
        // with big posts exhaust the server's memory for anyone's request.
        int safeLimit  = Math.min(Math.max(limit, 1), 50);
        int safeOffset = Math.max(offset, 0);
        List<Post> page = postRepository.getPostsPage(username, section, isOwner, safeLimit, safeOffset);
        if (page == null) return new ResponseEntity<>(HttpStatus.NOT_FOUND);

        return new ResponseEntity<>(page, HttpStatus.OK);
    }

    /** What the profile's tabs show as counts, for this reader (see PostRepository.countSections). */
    @GetMapping("/user/{username}/sections")
    public ResponseEntity<Map<String, Integer>> getSectionCounts(
            @PathVariable("username") String username,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String authToken) {
        return ResponseEntity.ok(postRepository.countSections(username, isOwner(username, authUsername, authToken)));
    }

    /**
     * A published post needs a title; a draft does not.
     *
     * Requiring one on every save meant "Save draft" failed outright on a new
     * post before the writer had thought of a title — which is exactly when a
     * draft is most useful. An untitled draft is saved as "Untitled" and can be
     * named before it is published.
     */
    private static ResponseEntity<String> validatePost(Post post) {
        String title = post.getTitle();
        String desc  = post.getDescription();

        if (title != null && title.length() > 255)
            return new ResponseEntity<>("Title must be 255 characters or fewer.", HttpStatus.BAD_REQUEST);

        if (title == null || title.isBlank()) {
            if (post.isPublished())
                return new ResponseEntity<>("Add a title before publishing.", HttpStatus.BAD_REQUEST);
            post.setTitle("Untitled");
        }
        if (post.getSection() == null || post.getSection().isBlank()) post.setSection("profile");
        if (!SECTIONS.contains(post.getSection()))
            return new ResponseEntity<>("Section must be profile, notes or subscribers.", HttpStatus.BAD_REQUEST);
        String summary = cleanSummary(post.getSummary());
        if (summary != null && summary.length() > 300)
            return new ResponseEntity<>("The description must be 300 characters or fewer.", HttpStatus.BAD_REQUEST);
        post.setSummary(summary);
        // Generous because tile grids carry their pixels as PNGs; each layer is
        // capped separately by GridValidator on the client's save path.
        if (desc != null && desc.length() > 5_000_000)
            return new ResponseEntity<>("This post is too large to save.", HttpStatus.BAD_REQUEST);
        try {
            post.setDescription(com.springbootprojects.webpostingserver.posts.validator.PostContentValidator.clean(desc));
        } catch (com.springbootprojects.webpostingserver.posts.validator.PostContentValidator.InvalidPostContentException e) {
            return new ResponseEntity<>(e.getMessage(), HttpStatus.BAD_REQUEST);
        }
        try {
            post.setBackgroundPattern(WallpaperValidator.normalise(post.getBackgroundPattern()));
        } catch (WallpaperValidator.InvalidWallpaperException e) {
            return new ResponseEntity<>(e.getMessage(), HttpStatus.BAD_REQUEST);
        }
        return null;
    }

    /** Plain text on one line, or null when empty: newlines become spaces. */
    static String cleanSummary(String raw) {
        if (raw == null) return null;
        String s = raw.replaceAll("\\s*[\\r\\n]+\\s*", " ").trim();
        return s.isEmpty() ? null : s;
    }

    @PostMapping("/posts")
    public ResponseEntity<String> createPost(@RequestBody Post post, @CookieValue(name = "username") String username, @CookieValue(name = "authToken") String token) {
        AuthSession loginResult;
        try {
            loginResult = loginRepository.authorize(username, token);
        } catch (JdbcLoginRepository.TokenExpiredException ex) {
            return loginRepository.deleteCookie();
        }
        if (loginResult != null) {
            if (postingGate.mustVerifyFirst(loginResult.userId)) return postingGate.refusal();
            ResponseEntity<String> invalid = validatePost(post);
            if (invalid != null) return invalid;
            if (!storage.fitsQuota(loginResult.userId, storedBytes(post.getDescription(), post.getBackgroundPattern()), 0))
                return new ResponseEntity<>(STORAGE_FULL, HttpStatus.PAYLOAD_TOO_LARGE);
            // Enforce daily post limit from role_limits
            try {
                Integer maxPerDay = jdbc.queryForObject(
                    "SELECT rl.max_posts_per_day FROM users u LEFT JOIN role_limits rl ON rl.role = COALESCE(u.role, 'user') WHERE u.id=?",
                    Integer.class, loginResult.userId);
                if (maxPerDay != null && maxPerDay >= 0) {
                    Integer todayCount = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM posts p " +
                        "INNER JOIN users_posts_junctions j ON j.post_id = p.id " +
                        "WHERE j.user_id=? AND p.date >= CURRENT_DATE",
                        Integer.class, loginResult.userId);
                    if (todayCount != null && todayCount >= maxPerDay) {
                        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                            .body("Daily post limit reached (" + maxPerDay + " posts per day).");
                    }
                }
            } catch (Exception ignored) {}
            try {
                int userId = loginResult.userId;
                post.setSlug(uniqueSlugFor(slugFor(post), username, null));
                int postId = postRepository.save(post, userId);
                syncPostUploads(postId, post.getDescription());
                // Hashtags only matter once a post is public (listings filter on it);
                // publishing later, from the editor or the arrange menu, adds them.
                if (post.isPublished()) social.parseAndSaveHashtags(postId, post.getDescription());
                if (post.isPublished()) {
                    social.votePost(postId, userId, 1);
                    if (announces(post.getSection())) {
                        social.notifyFollowers(userId, username, postId);
                        // Email is opt-in per recipient and asynchronous; a mail
                        // failure must not fail the post.
                        emailNotifications.notifyFollowersOfPost(username, post.getTitle(), postId);
                    }
                    emailNotifications.sendPublishReceipt(username, post.getTitle(), postId);
                }
                return new ResponseEntity<>(String.valueOf(postId), HttpStatus.CREATED);
            } catch (Exception e) {
                log.warn("Post creation failed for {}: {}", username, e.getMessage());
                return new ResponseEntity<>("Failed to create post", HttpStatus.INTERNAL_SERVER_ERROR);
            }
        }
        log.info("Refused post creation for {}: not authorised", username);
        return new ResponseEntity<>(null, HttpStatus.FORBIDDEN);
    }

    @PutMapping("/posts/{id}")
    public ResponseEntity<String> updatePost(@PathVariable("id") long id, @RequestBody Post post,
            @CookieValue(name = "username") String username, @CookieValue(name = "authToken") String token) {
        AuthSession loginResult;
        try {
            loginResult = loginRepository.authorize(username, token);
        } catch (JdbcLoginRepository.TokenExpiredException ex) {
            return loginRepository.deleteCookie();
        }
        if (loginResult == null) {
            return new ResponseEntity<>("Unauthorized", HttpStatus.UNAUTHORIZED);
        }
        if (!username.equals(ownerOf(id))) {
            return new ResponseEntity<>("Forbidden", HttpStatus.FORBIDDEN);
        }
        if (post.isPublished() && postingGate.mustVerifyFirst(loginResult.userId)) return postingGate.refusal();
        ResponseEntity<String> invalid = validatePost(post);
        if (invalid != null) return invalid;
        // What the post holds now: whether it was public, and how many bytes it
        // frees as the new version is stored. The old body itself is never read.
        List<Map<String, Object>> stored = jdbc.queryForList("""
                SELECT published,
                       COALESCE(octet_length(description), 0) + COALESCE(octet_length(background_pattern), 0) AS stored
                  FROM posts WHERE id = ?""", id);
        if (stored.isEmpty()) {
            return new ResponseEntity<>("Cannot find Post with id=" + id, HttpStatus.NOT_FOUND);
        }
        boolean wasPublished = Boolean.TRUE.equals(stored.get(0).get("published"));
        long freedBytes = ((Number) stored.get(0).get("stored")).longValue();
        if (!storage.fitsQuota(loginResult.userId, storedBytes(post.getDescription(), post.getBackgroundPattern()), freedBytes))
            return new ResponseEntity<>(STORAGE_FULL, HttpStatus.PAYLOAD_TOO_LARGE);
        // update() writes the columns the editor owns; the request is the row.
        post.setId((int) id);
        post.setFolder(post.getFolder() != null && !post.getFolder().isBlank() ? post.getFolder().trim() : null);
        post.setSlug(uniqueSlugFor(slugFor(post), username, (int) id));
        postRepository.update(post);
        syncPostUploads(id, post.getDescription());
        if (post.isPublished()) social.parseAndSaveHashtags((int) id, post.getDescription());
        // Notify followers when a draft is published for the first time
        if (!wasPublished && post.isPublished()) {
            if (announces(post.getSection()) && !alreadyAnnounced(id)) {
                int authorId = social.getUserIdByUsername(username);
                if (authorId > 0) social.notifyFollowers(authorId, username, (int) id);
                emailNotifications.notifyFollowersOfPost(username, post.getTitle(), id);
            }
            emailNotifications.sendPublishReceipt(username, post.getTitle(), id);
        }
        return new ResponseEntity<>("Post was updated successfully.", HttpStatus.OK);
    }

    /**
     * Makes a post public or private (a draft) without touching anything else
     * about it: what the profile's arrange menu does. Making a draft public
     * for the first time tells followers, as publishing from the editor does.
     */
    @PutMapping("/posts/{id}/visibility")
    public ResponseEntity<String> setVisibility(@PathVariable("id") long id,
            @RequestBody java.util.Map<String, Boolean> body,
            @CookieValue(name = "username") String username, @CookieValue(name = "authToken") String token) {
        AuthSession loginResult;
        try {
            loginResult = loginRepository.authorize(username, token);
        } catch (JdbcLoginRepository.TokenExpiredException ex) {
            return loginRepository.deleteCookie();
        }
        if (loginResult == null) return new ResponseEntity<>("Unauthorized", HttpStatus.UNAUTHORIZED);
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT published, section, title FROM posts WHERE id = ?", id);
        if (rows.isEmpty()) return new ResponseEntity<>("Cannot find Post with id=" + id, HttpStatus.NOT_FOUND);
        if (!username.equals(ownerOf(id))) return new ResponseEntity<>("Forbidden", HttpStatus.FORBIDDEN);
        if (body == null || !body.containsKey("published")) return new ResponseEntity<>("Say whether it is published.", HttpStatus.BAD_REQUEST);

        boolean published = Boolean.TRUE.equals(body.get("published"));
        if (published && postingGate.mustVerifyFirst(loginResult.userId)) return postingGate.refusal();
        boolean was = Boolean.TRUE.equals(rows.get(0).get("published"));
        String section = (String) rows.get(0).get("section");
        // Only the flag changes: the post's body is neither read nor rewritten.
        jdbc.update("UPDATE posts SET published = ? WHERE id = ?", published, id);
        if (!was && published) {
            // Hashtags are saved for public posts only, so this is where a draft's tags appear.
            List<String> text = jdbc.queryForList("SELECT description FROM posts WHERE id = ?", String.class, id);
            if (!text.isEmpty()) social.parseAndSaveHashtags((int) id, text.get(0));
            if (announces(section) && !alreadyAnnounced(id)) {
                int authorId = social.getUserIdByUsername(username);
                if (authorId > 0) social.notifyFollowers(authorId, username, (int) id);
                emailNotifications.notifyFollowersOfPost(username, (String) rows.get(0).get("title"), id);
            }
        }
        return new ResponseEntity<>(published ? "The post is public." : "The post is private.", HttpStatus.OK);
    }

    @DeleteMapping("/posts/{id}")
    public ResponseEntity<String> deletePost(@PathVariable("id") long id,
                         @CookieValue(name = "username") String username, @CookieValue(name = "authToken") String token) {
        //Authorize the user
        AuthSession loginResult;
        try {loginResult = loginRepository.authorize(username, token);}
        catch (JdbcLoginRepository.TokenExpiredException ex) {
            return loginRepository.deleteCookie();
        }
        if (loginResult != null) {
            String postOwner = ownerOf(id);
            if (postOwner == null) return new ResponseEntity<>("Cannot find Post with id=" + id, HttpStatus.NOT_FOUND);
            if (!postOwner.equals(username)) {
                log.info("Refused delete of post {} by {}", id, username);
                return new ResponseEntity<>(HttpStatus.UNAUTHORIZED);
            }

            try {
                // Log deletion before the row is removed (captures title + content)
                Post post = postRepository.findById(id);
                if (post != null) {
                    java.util.Map<String, Object> info = new java.util.HashMap<>();
                    info.put("post_title",  post.getTitle());
                    info.put("post_owner",  username);
                    info.put("post_id",     (int) id);
                    info.put("content",     post.getTitle()); // summary = title for posts
                    int authorId = social.getUserIdByUsername(username);
                    if (authorId > 0) social.logDeletion(authorId, "post", info);
                }
                int result = postRepository.deleteById(id);
                if (result == 0) {
                    return new ResponseEntity<>("Cannot find Post with id=" + id, HttpStatus.OK);
                }
                return new ResponseEntity<>("Post was deleted successfully.", HttpStatus.OK);
            } catch (Exception e) {
                return new ResponseEntity<>("Cannot delete Post.", HttpStatus.INTERNAL_SERVER_ERROR);
            }
        } else {
            return new ResponseEntity<>(HttpStatus.UNAUTHORIZED);
        }
    }

    // ── Pinned posts ──────────────────────────────────────────────────────────

    @GetMapping("/users/{username}/pinned-post")
    public ResponseEntity<Post> getPinnedPost(
            @PathVariable("username") String username,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String authToken) {
        // Nothing pinned is an ordinary answer, 204, not an error: as a 404 it
        // logged a console error on every profile without a pinned post.
        List<Integer> ids = jdbc.queryForList(
                "SELECT pinned_post_id FROM users WHERE username=?", Integer.class, username);
        if (ids.isEmpty() || ids.get(0) == null) return ResponseEntity.noContent().build();
        Post post = postRepository.findById(ids.get(0).longValue());
        if (post == null) return ResponseEntity.noContent().build();
        // A pinned draft is the author's alone. This used to compare the
        // username cookie without checking its token, so setting the cookie to
        // the author's name showed anyone their pinned draft.
        if (!canSee(post.isPublished(), post.getSection(), username, authUsername, authToken))
            return ResponseEntity.noContent().build();
        return ResponseEntity.ok(post);
    }

    @PutMapping("/users/{username}/pinned-post")
    public ResponseEntity<String> setPinnedPost(
            @PathVariable("username") String username,
            @RequestBody Map<String, Integer> body,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {
        if (!authUsername.equals(username)) return new ResponseEntity<>("Forbidden", HttpStatus.FORBIDDEN);
        AuthSession session;
        try {
            session = loginRepository.authorize(authUsername, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return loginRepository.deleteCookie();
        }
        if (session == null) return new ResponseEntity<>("Unauthorized", HttpStatus.UNAUTHORIZED);
        int postId = body.getOrDefault("postId", 0);
        if (postId <= 0) return new ResponseEntity<>("Invalid postId", HttpStatus.BAD_REQUEST);
        if (!username.equals(ownerOf(postId)))
            return new ResponseEntity<>("Forbidden", HttpStatus.FORBIDDEN);
        jdbc.update("UPDATE users SET pinned_post_id=? WHERE username=?", postId, username);
        return ResponseEntity.ok("Post pinned");
    }

    @DeleteMapping("/users/{username}/pinned-post")
    public ResponseEntity<String> unpinPost(
            @PathVariable("username") String username,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {
        if (!authUsername.equals(username)) return new ResponseEntity<>("Forbidden", HttpStatus.FORBIDDEN);
        AuthSession session;
        try {
            session = loginRepository.authorize(authUsername, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return loginRepository.deleteCookie();
        }
        if (session == null) return new ResponseEntity<>("Unauthorized", HttpStatus.UNAUTHORIZED);
        jdbc.update("UPDATE users SET pinned_post_id=NULL WHERE username=?", username);
        return ResponseEntity.ok("Post unpinned");
    }

    @GetMapping("/hashtags/{tag}/posts")
    public ResponseEntity<List<Map<String, Object>>> getPostsByHashtag(@PathVariable String tag) {
        if (tag == null || tag.isBlank() || tag.length() > 50)
            return ResponseEntity.badRequest().build();
        return ResponseEntity.ok(social.getPostsByHashtag(tag));
    }

    @GetMapping("/hashtags/suggest")
    public ResponseEntity<List<String>> suggestHashtags(@RequestParam(defaultValue = "") String q) {
        if (q.isBlank() || q.length() > 50) return ResponseEntity.ok(List.of());
        List<String> tags = jdbc.queryForList(
            "SELECT tag FROM hashtags WHERE tag LIKE ? ORDER BY tag LIMIT 8",
            String.class, q.toLowerCase().replaceAll("[^a-z0-9_]", "") + "%");
        return ResponseEntity.ok(tags);
    }

    /** Search published posts by title/content, optionally filtered to a specific author. */
    @GetMapping("/search/posts")
    public ResponseEntity<List<Map<String, Object>>> searchPosts(
            @RequestParam(defaultValue = "") String q,
            @RequestParam(required = false)  String from) {

        if (q.isBlank() && (from == null || from.isBlank())) return ResponseEntity.ok(List.of());
        if (q.length() > 200) return ResponseEntity.badRequest().build();
        if (from != null && from.length() > 50)
            from = null; // ignore suspicious from param

        String pattern = "%" + q.trim().replace("%", "\\%").replace("_", "\\_") + "%";

        List<Map<String, Object>> rows;
        if (from != null && !from.isBlank()) {
            rows = jdbc.queryForList(
                "SELECT p.id, p.title, u.username FROM posts p " +
                "JOIN users_posts_junctions j ON j.post_id = p.id " +
                "JOIN users u ON u.id = j.user_id " +
                "WHERE p.published = true AND p.section <> 'subscribers' " +
                "  AND (p.title ILIKE ? OR p.search_text ILIKE ?) " +
                "  AND u.username = ? " +
                "ORDER BY p.date DESC LIMIT 25",
                pattern, pattern, from.trim());
        } else if (q.isBlank()) {
            rows = jdbc.queryForList(
                "SELECT p.id, p.title, u.username FROM posts p " +
                "JOIN users_posts_junctions j ON j.post_id = p.id " +
                "JOIN users u ON u.id = j.user_id " +
                "WHERE p.published = true AND p.section <> 'subscribers' AND u.username = ? " +
                "ORDER BY p.date DESC LIMIT 25",
                from == null ? "" : from.trim());
        } else {
            rows = jdbc.queryForList(
                "SELECT p.id, p.title, u.username FROM posts p " +
                "JOIN users_posts_junctions j ON j.post_id = p.id " +
                "JOIN users u ON u.id = j.user_id " +
                "WHERE p.published = true AND p.section <> 'subscribers' " +
                "  AND (p.title ILIKE ? OR p.search_text ILIKE ?) " +
                "ORDER BY p.date DESC LIMIT 25",
                pattern, pattern);
        }
        return ResponseEntity.ok(rows);
    }

    /**
     * Saves the arrangement of an author's profile.
     * Body: { "updates": [ { "id": 7, "folder": "Travel" }, { "id": 3, "folder": null }, ... ] }
     *
     * The list is the order shown, top first. Positions come from that order,
     * not from any number the client sends, and the author's posts left out of
     * the list are placed after it (see PostRepository.reorder).
     */
    @PutMapping("/users/{username}/posts/order")
    public ResponseEntity<String> updatePostOrder(
            @PathVariable String username,
            @RequestBody Map<String, Object> body,
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token) {

        if (!authUsername.equals(username))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Forbidden.");
        AuthSession session = null;
        try { session = loginRepository.authorize(authUsername, token); }
        catch (JdbcLoginRepository.TokenExpiredException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized.");
        }
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized.");

        if (!(body.get("updates") instanceof List<?> updates))
            return ResponseEntity.badRequest().body("Expected a list of updates.");
        if (updates.size() > MAX_ORDER_UPDATES)
            return ResponseEntity.badRequest().body("Too many posts in one update.");

        List<Integer> ids = new java.util.ArrayList<>();
        Map<Integer, String> folders = new java.util.HashMap<>();
        for (Object item : updates) {
            if (!(item instanceof Map<?, ?> u) || !(u.get("id") instanceof Number n)) continue;
            int postId = n.intValue();
            String folder = u.get("folder") instanceof String s && !s.isBlank() ? s.trim() : null;
            if (folder != null && folder.length() > 100) folder = folder.substring(0, 100);
            ids.add(postId);
            folders.put(postId, folder);
        }
        postRepository.reorder(session.userId, ids, folders);
        return ResponseEntity.ok("Updated.");
    }

    /** Bounds the work one request can ask for; far above any real profile. */
    private static final int MAX_ORDER_UPDATES = 5000;
}