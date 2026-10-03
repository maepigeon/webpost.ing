package com.springbootprojects.webpostingserver.posts.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Everything a user stores, measured in one place.
 *
 * Every figure the site shows about a user's storage, and every quota check,
 * comes from here, so the numbers agree wherever they appear. Sizes are bytes
 * as stored: file sizes for uploads, octet_length for text kept in the
 * database.
 *
 * The quota covers everything usage() adds up: files (the images a user
 * uploads, their audio, their profile picture and header image, and the
 * downscaled copies made of an upload, which take real disk) and the text
 * kept in the database (posts, stickers, packs and so on). Charging only the
 * files let one account fill the database through posts, stickers and packs.
 */
@Service
public class StorageAccountService {

    @Autowired private JdbcTemplate jdbc;

    @org.springframework.beans.factory.annotation.Value("${app.upload-dir:uploads}")
    private String uploadDir;

    /**
     * Header images uploaded before they were recorded as uploads: records the
     * file (and its smaller copies) the first time the user's storage is read.
     */
    private void recordOldHeader(int userId) {
        List<String> paths = jdbc.queryForList(
                "SELECT u.header_path FROM users u WHERE u.id = ? AND u.header_path IS NOT NULL"
                + " AND NOT EXISTS (SELECT 1 FROM uploads WHERE user_id = u.id AND filename LIKE 'header/%')",
                String.class, userId);
        if (paths.isEmpty() || paths.get(0) == null) return;
        String name = paths.get(0).substring(paths.get(0).lastIndexOf('/') + 1);
        int dot = name.lastIndexOf('.');
        if (dot < 0) return;
        java.nio.file.Path dir = java.nio.file.Paths.get(uploadDir, "headers");
        long bytes = 0;
        try {
            if (!java.nio.file.Files.exists(dir.resolve(name))) return;
            bytes += java.nio.file.Files.size(dir.resolve(name));
            for (int w : ImageProcessingService.VARIANT_WIDTHS) {
                java.nio.file.Path v = dir.resolve(name.substring(0, dot) + "-" + w + "w" + name.substring(dot));
                if (java.nio.file.Files.exists(v)) bytes += java.nio.file.Files.size(v);
            }
        } catch (java.io.IOException e) {
            return;
        }
        jdbc.update("INSERT INTO uploads (filename, user_id, original_name, size_bytes) VALUES (?, ?, ?, ?)",
                "header/" + name, userId, name, bytes);
    }

    /** Upload records by kind: avatars, headers and audio are named "avatar/…", "header/…" and "audio/…". */
    private static final String POST_IMAGES =
            "filename NOT LIKE 'avatar/%' AND filename NOT LIKE 'header/%' AND filename NOT LIKE 'audio/%'";

    private long sum(String sql, Object... args) {
        Long v = jdbc.queryForObject(sql, Long.class, args);
        return v == null ? 0L : v;
    }

    private long count(String sql, Object... args) {
        Number v = jdbc.queryForObject(sql, Number.class, args);
        return v == null ? 0L : v.longValue();
    }

    private static Map<String, Object> item(long count, long bytes) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("count", count);
        m.put("bytes", bytes);
        return m;
    }

    private static long bytesOf(Map<String, Object> section) {
        return section.values().stream()
                .filter(v -> v instanceof Map<?, ?>)
                .mapToLong(v -> ((Number) ((Map<?, ?>) v).get("bytes")).longValue())
                .sum();
    }

    /** Used when a role has no role_limits row: the limit of the ordinary "user" role (V001). */
    static final long DEFAULT_LIMIT_BYTES = 52_428_800L;

    /** The downscaled copies of a user's uploads, in bytes (headers keep theirs inside their own row). */
    private long renditionBytes(int userId) {
        return sum("""
                SELECT COALESCE(SUM(v.size_bytes), 0) FROM upload_variants v JOIN uploads u ON u.id = v.upload_id
                 WHERE u.user_id = ?""", userId);
    }

    /** Bytes of files charged to the user, renditions included: the file part of their quota. */
    public long filesChargedBytes(int userId) {
        recordOldHeader(userId);
        return sum("SELECT COALESCE(SUM(size_bytes), 0) FROM uploads WHERE user_id = ?", userId) + renditionBytes(userId);
    }

    /** The user's quota in bytes, or null for no limit (a negative limit, as the admin role has). */
    public Long fileLimitBytes(int userId) {
        List<Long> r = jdbc.queryForList("""
                SELECT rl.max_storage_bytes FROM users u JOIN role_limits rl ON rl.role = COALESCE(u.role, 'user')
                 WHERE u.id = ?""", Long.class, userId);
        // No row for the role used to mean no limit at all; it now means the default.
        if (r.isEmpty() || r.get(0) == null) {
            List<Long> base = jdbc.queryForList("SELECT max_storage_bytes FROM role_limits WHERE role = 'user'", Long.class);
            Long limit = base.isEmpty() ? null : base.get(0);
            return limit == null ? DEFAULT_LIMIT_BYTES : (limit < 0 ? null : limit);
        }
        Long limit = r.get(0);
        return limit < 0 ? null : limit;
    }

    /**
     * Whether adding `addBytes`, after freeing `freedBytes` (a picture or post
     * being replaced), keeps everything the user stores within their quota.
     */
    public boolean fitsQuota(int userId, long addBytes, long freedBytes) {
        Long limit = fileLimitBytes(userId);
        if (limit == null) return true;
        long used = ((Number) usage(userId).get("totalBytes")).longValue();
        return used - freedBytes + addBytes <= limit;
    }

    /** The full breakdown, by section, with totals and the quota. */
    public Map<String, Object> usage(int userId) {
        recordOldHeader(userId);
        Map<String, Object> files = new LinkedHashMap<>();
        files.put("postImages", item(
                count("SELECT COUNT(*) FROM uploads WHERE user_id = ? AND " + POST_IMAGES, userId),
                sum("SELECT COALESCE(SUM(size_bytes), 0) FROM uploads WHERE user_id = ? AND " + POST_IMAGES, userId)));
        files.put("profilePicture", item(
                count("SELECT COUNT(*) FROM uploads WHERE user_id = ? AND filename LIKE 'avatar/%'", userId),
                sum("SELECT COALESCE(SUM(size_bytes), 0) FROM uploads WHERE user_id = ? AND filename LIKE 'avatar/%'", userId)));
        files.put("headerImage", item(
                count("SELECT COUNT(*) FROM uploads WHERE user_id = ? AND filename LIKE 'header/%'", userId),
                sum("SELECT COALESCE(SUM(size_bytes), 0) FROM uploads WHERE user_id = ? AND filename LIKE 'header/%'", userId)));
        files.put("audio", item(
                count("SELECT COUNT(*) FROM uploads WHERE user_id = ? AND filename LIKE 'audio/%'", userId),
                sum("SELECT COALESCE(SUM(size_bytes), 0) FROM uploads WHERE user_id = ? AND filename LIKE 'audio/%'", userId)));
        long itemBytes = bytesOf(files);
        long renditions = renditionBytes(userId);
        long charged = itemBytes + renditions;

        String mine = "FROM posts p JOIN users_posts_junctions j ON j.post_id = p.id WHERE j.user_id = ?";
        Map<String, Object> posts = new LinkedHashMap<>();
        posts.put("content", item(count("SELECT COUNT(*) " + mine, userId),
                sum("SELECT COALESCE(SUM(octet_length(p.description)), 0) " + mine, userId)));
        posts.put("themes", item(count("SELECT COUNT(p.page_theme) " + mine, userId),
                sum("SELECT COALESCE(SUM(octet_length(p.page_theme)), 0) " + mine, userId)));
        posts.put("wallpapers", item(count("SELECT COUNT(p.background_pattern) " + mine, userId),
                sum("SELECT COALESCE(SUM(octet_length(p.background_pattern)), 0) " + mine, userId)));

        Map<String, Object> profile = new LinkedHashMap<>();
        for (String[] col : new String[][] {
                {"banner", "banner_grid"}, {"theme", "page_theme"}, {"wallpaper", "background_pattern"},
                {"bio", "bio"}, {"links", "bio_links"}, {"wallpaperPresets", "pattern_presets"}}) {
            long b = sum("SELECT COALESCE(octet_length(" + col[1] + "), 0) FROM users WHERE id = ?", userId);
            profile.put(col[0], item(b > 0 ? 1 : 0, b));
        }

        Map<String, Object> library = new LinkedHashMap<>();
        library.put("stickers", item(count("SELECT COUNT(*) FROM stickers WHERE user_id = ?", userId),
                sum("SELECT COALESCE(SUM(octet_length(grid) + octet_length(name)), 0) FROM stickers WHERE user_id = ?", userId)));
        library.put("pixelFonts", item(count("SELECT COUNT(*) FROM pixel_fonts WHERE user_id = ?", userId),
                sum("SELECT COALESCE(SUM(octet_length(glyphs) + octet_length(name)), 0) FROM pixel_fonts WHERE user_id = ?", userId)));
        library.put("sharedPacks", item(count("SELECT COUNT(*) FROM shared_packs WHERE sender_id = ?", userId),
                sum("SELECT COALESCE(SUM(octet_length(body) + octet_length(name)), 0) FROM shared_packs WHERE sender_id = ?", userId)));

        Map<String, Object> social = new LinkedHashMap<>();
        social.put("comments", item(count("SELECT COUNT(*) FROM comments WHERE user_id = ?", userId),
                sum("SELECT COALESCE(SUM(octet_length(content)), 0) FROM comments WHERE user_id = ?", userId)));
        social.put("messages", item(
                count("SELECT (SELECT COUNT(*) FROM direct_messages WHERE sender_id = ? AND deleted_at IS NULL)"
                        + " + (SELECT COUNT(*) FROM group_messages WHERE sender_id = ? AND deleted_at IS NULL)", userId, userId),
                sum("SELECT (SELECT COALESCE(SUM(octet_length(content)), 0) FROM direct_messages WHERE sender_id = ? AND deleted_at IS NULL)"
                        + " + (SELECT COALESCE(SUM(octet_length(content)), 0) FROM group_messages WHERE sender_id = ? AND deleted_at IS NULL)", userId, userId)));
        social.put("notifications", item(count("SELECT COUNT(*) FROM notifications WHERE recipient_id = ?", userId),
                sum("SELECT COALESCE(SUM(octet_length(COALESCE(message, ''))), 0) FROM notifications WHERE recipient_id = ?", userId)));

        Map<String, Object> sections = new LinkedHashMap<>();
        sections.put("files", Map.of("items", files, "bytes", itemBytes, "renditionBytes", renditions));
        sections.put("posts", Map.of("items", posts, "bytes", bytesOf(posts)));
        sections.put("profile", Map.of("items", profile, "bytes", bytesOf(profile)));
        sections.put("library", Map.of("items", library, "bytes", bytesOf(library)));
        sections.put("social", Map.of("items", social, "bytes", bytesOf(social)));

        long total = charged + bytesOf(posts) + bytesOf(profile) + bytesOf(library) + bytesOf(social);
        Long limit = fileLimitBytes(userId);
        Map<String, Object> quota = new LinkedHashMap<>();
        quota.put("counts", "everything");
        quota.put("usedBytes", total);
        quota.put("limitBytes", limit);
        quota.put("remainingBytes", limit == null ? null : Math.max(0, limit - total));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("sections", sections);
        out.put("totalBytes", total);
        out.put("diskBytes", total);   // renditions are inside the total now
        out.put("quota", quota);
        return out;
    }
}
