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
 * The quota covers files (the images a user uploads, their profile picture
 * and header image); the downscaled copies the site makes of an upload are
 * shown but not charged, being the site's choice. Text kept in the database
 * is shown by category and not charged.
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

    /** Upload records by kind: avatars and headers are named "avatar/…" and "header/…". */
    private static final String POST_IMAGES = "filename NOT LIKE 'avatar/%' AND filename NOT LIKE 'header/%'";

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

    /** Bytes of files charged to the user: what counts toward their quota. */
    public long filesChargedBytes(int userId) {
        recordOldHeader(userId);
        return sum("SELECT COALESCE(SUM(size_bytes), 0) FROM uploads WHERE user_id = ?", userId);
    }

    /** The user's file quota in bytes, or null for no limit. */
    public Long fileLimitBytes(int userId) {
        List<Long> r = jdbc.queryForList("""
                SELECT rl.max_storage_bytes FROM users u JOIN role_limits rl ON rl.role = COALESCE(u.role, 'user')
                 WHERE u.id = ?""", Long.class, userId);
        Long limit = r.isEmpty() ? null : r.get(0);
        return limit == null || limit < 0 ? null : limit;
    }

    /**
     * Whether adding `addBytes` of files, after freeing `freedBytes` (a
     * picture being replaced), stays within the quota.
     */
    public boolean fitsQuota(int userId, long addBytes, long freedBytes) {
        Long limit = fileLimitBytes(userId);
        return limit == null || filesChargedBytes(userId) - freedBytes + addBytes <= limit;
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
        long charged = bytesOf(files);
        long renditions = sum("""
                SELECT COALESCE(SUM(v.size_bytes), 0) FROM upload_variants v JOIN uploads u ON u.id = v.upload_id
                 WHERE u.user_id = ?""", userId);

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
        sections.put("files", Map.of("items", files, "bytes", charged, "renditionBytes", renditions));
        sections.put("posts", Map.of("items", posts, "bytes", bytesOf(posts)));
        sections.put("profile", Map.of("items", profile, "bytes", bytesOf(profile)));
        sections.put("library", Map.of("items", library, "bytes", bytesOf(library)));
        sections.put("social", Map.of("items", social, "bytes", bytesOf(social)));

        long total = charged + bytesOf(posts) + bytesOf(profile) + bytesOf(library) + bytesOf(social);
        Long limit = fileLimitBytes(userId);
        Map<String, Object> quota = new LinkedHashMap<>();
        quota.put("counts", "files");
        quota.put("usedBytes", charged);
        quota.put("limitBytes", limit);
        quota.put("remainingBytes", limit == null ? null : Math.max(0, limit - charged));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("sections", sections);
        out.put("totalBytes", total);
        out.put("diskBytes", total + renditions);
        out.put("quota", quota);
        return out;
    }
}
