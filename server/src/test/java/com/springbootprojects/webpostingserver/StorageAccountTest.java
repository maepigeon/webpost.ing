package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.service.StorageAccountService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** One account of a user's storage: every category, the totals, and the quota. */
@SpringBootTest
class StorageAccountTest {

    private static final String WHO = "storage_account_user";

    @Autowired JdbcTemplate jdbc;
    @Autowired StorageAccountService storage;

    private int userId;

    @BeforeEach
    void setUp() {
        cleanUp();
        userId = jdbc.queryForObject("INSERT INTO users (username, password, bio, banner_grid, role) VALUES (?, 'x', ?, ?, 'user') RETURNING id",
                Integer.class, WHO, "hello", "{\"v\":3}");
        jdbc.update("INSERT INTO uploads (filename, user_id, size_bytes) VALUES ('a.png', ?, 1000), ('b.png', ?, 500)", userId, userId);
        Integer up = jdbc.queryForObject("SELECT id FROM uploads WHERE user_id = ? AND filename = 'a.png'", Integer.class, userId);
        jdbc.update("INSERT INTO upload_variants (upload_id, filename, width, size_bytes) VALUES (?, 'a-480w.png', 480, 300)", up);
        jdbc.update("INSERT INTO uploads (filename, user_id, size_bytes) VALUES ('avatar/x.jpg', ?, 200), ('header/y.jpg', ?, 700)", userId, userId);
        int post = jdbc.queryForObject("INSERT INTO posts (title, description, published) VALUES ('t', 'abcd', true) RETURNING id", Integer.class);
        jdbc.update("INSERT INTO users_posts_junctions (user_id, post_id) VALUES (?, ?)", userId, post);
        jdbc.update("INSERT INTO stickers (user_id, name, grid) VALUES (?, 'st', '12345')", userId);
    }

    @AfterEach
    void cleanUp() {
        for (Integer id : jdbc.queryForList("SELECT j.post_id FROM users_posts_junctions j JOIN users u ON u.id = j.user_id WHERE u.username = ?", Integer.class, WHO)) {
            jdbc.update("DELETE FROM users_posts_junctions WHERE post_id = ?", id);
            jdbc.update("DELETE FROM posts WHERE id = ?", id);
        }
        jdbc.update("DELETE FROM upload_variants WHERE upload_id IN (SELECT up.id FROM uploads up JOIN users u ON u.id = up.user_id WHERE u.username = ?)", WHO);
        jdbc.update("DELETE FROM uploads WHERE user_id IN (SELECT id FROM users WHERE username = ?)", WHO);
        jdbc.update("DELETE FROM stickers WHERE user_id IN (SELECT id FROM users WHERE username = ?)", WHO);
        jdbc.update("DELETE FROM users WHERE username = ?", WHO);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> at(Map<String, Object> m, String... path) {
        Map<String, Object> cur = m;
        for (String p : path) cur = (Map<String, Object>) cur.get(p);
        return cur;
    }

    @Test
    void sortsEverythingIntoItsSectionAndAddsUp() {
        Map<String, Object> u = storage.usage(userId);
        Map<String, Object> files = at(u, "sections", "files");
        assertThat(at(files, "items", "postImages")).containsEntry("count", 2L).containsEntry("bytes", 1500L);
        assertThat(at(files, "items", "profilePicture")).containsEntry("bytes", 200L);
        assertThat(at(files, "items", "headerImage")).containsEntry("bytes", 700L);
        assertThat(files).containsEntry("bytes", 2400L).containsEntry("renditionBytes", 300L);
        assertThat(at(u, "sections", "posts", "items", "content")).containsEntry("count", 1L).containsEntry("bytes", 4L);
        assertThat(at(u, "sections", "profile", "items", "bio")).containsEntry("bytes", 5L);
        assertThat(at(u, "sections", "profile", "items", "banner")).containsEntry("bytes", 7L);
        assertThat(at(u, "sections", "library", "items", "stickers")).containsEntry("count", 1L).containsEntry("bytes", 7L);

        long sections = 0;
        for (String s : new String[] {"files", "posts", "profile", "library", "social"}) sections += ((Number) at(u, "sections", s).get("bytes")).longValue();
        // The renditions are charged, so they are inside the total and the disk figure matches it.
        assertThat(u.get("totalBytes")).isEqualTo(sections + 300L);
        assertThat(u.get("diskBytes")).isEqualTo(sections + 300L);
        assertThat(at(u, "quota")).containsEntry("usedBytes", sections + 300L);
    }

    /** Everything a user stores counts: the total in usage() is what the limit is checked against. */
    private long total() {
        return ((Number) storage.usage(userId).get("totalBytes")).longValue();
    }

    @Test
    void quotaChargesEverythingAndFreesWhatIsReplaced() {
        Long limit = storage.fileLimitBytes(userId);
        assertThat(limit).isNotNull();
        long used = total();
        assertThat(used).isGreaterThan(2400L);   // files, renditions, the post, the sticker, the bio and banner
        assertThat(storage.fitsQuota(userId, limit - used, 0)).isTrue();
        assertThat(storage.fitsQuota(userId, limit - used + 1, 0)).isFalse();
        assertThat(storage.fitsQuota(userId, limit - used + 1, 700)).isTrue();   // replacing the header frees its 700
    }

    @Test
    void textKeptInTheDatabaseCountsTowardTheLimit() {
        jdbc.update("UPDATE users SET role = 'restricted' WHERE id = ?", userId);   // a small limit keeps the test cheap
        long limit = storage.fileLimitBytes(userId);
        long room = limit - total();
        assertThat(storage.fitsQuota(userId, room, 0)).isTrue();
        // A sticker, the same size as the room left, no longer fits: it used to be free.
        jdbc.update("INSERT INTO stickers (user_id, name, grid) VALUES (?, 'big', ?)", userId, "g".repeat((int) room));
        assertThat(storage.fitsQuota(userId, 1, 0)).isFalse();
    }

    @Test
    void aSaveThatDoesNotGrowAlwaysFits_evenOverALoweredLimit() {
        jdbc.update("UPDATE users SET role = 'restricted' WHERE id = ?", userId);
        long limit = storage.fileLimitBytes(userId);
        // Over the limit by a margin, as when an admin lowers a role's limit.
        jdbc.update("INSERT INTO stickers (user_id, name, grid) VALUES (?, 'big', ?)", userId, "g".repeat((int) limit));
        assertThat(total()).isGreaterThan(limit);

        assertThat(storage.fitsQuota(userId, 5, 5)).isTrue();    // same size: nothing grows
        assertThat(storage.fitsQuota(userId, 3, 900)).isTrue();  // shrinking is always allowed
        assertThat(storage.fitsQuota(userId, 6, 5)).isFalse();   // one byte more is not
    }

    @Test
    void theBreakdownCoversEverySectionItReports() {
        jdbc.update("INSERT INTO pixel_fonts (user_id, name, glyphs) VALUES (?, 'pf', '{1}')", userId);
        Map<String, Object> u = storage.usage(userId);
        assertThat(at(u, "sections", "library", "items", "pixelFonts")).containsEntry("count", 1L).containsEntry("bytes", 5L);
        assertThat(at(u, "sections", "social", "items", "comments")).containsEntry("count", 0L).containsEntry("bytes", 0L);
        assertThat(at(u, "sections", "social", "items", "messages")).containsEntry("count", 0L).containsEntry("bytes", 0L);
        assertThat(at(u, "sections", "library", "items").keySet()).containsExactly("stickers", "pixelFonts", "sharedPacks");
        assertThat(at(u, "sections", "profile", "items").keySet())
                .containsExactly("banner", "theme", "wallpaper", "bio", "links", "wallpaperPresets");
        assertThat(at(u, "quota")).containsKey("limitBytes");
    }

    @Test
    void renditionsAreChargedToTheQuota() {
        long before = storage.filesChargedBytes(userId);
        assertThat(before).isEqualTo(1000 + 500 + 200 + 700 + 300);   // a.png, b.png, avatar, header, a-480w.png
    }

    @Test
    void aRoleWithNoLimitRowGetsTheDefaultLimitNotNoLimit() {
        jdbc.update("UPDATE users SET role = 'no_such_role_row' WHERE id = ?", userId);
        Long limit = storage.fileLimitBytes(userId);
        assertThat(limit).isNotNull().isGreaterThan(0L);
        assertThat(storage.fitsQuota(userId, limit, 0)).isFalse();
    }
}
