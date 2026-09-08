package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Admin-uploaded fonts, made available to every user in the post editor.
 *
 * Fonts get more scrutiny than images. A font file is a program in the sense
 * that it is parsed by a complex shaping engine inside every visitor's browser,
 * historically a rich source of memory-safety bugs, and it is served to
 * everyone rather than just the uploader. So: admin-only upload, an extension
 * allowlist, magic-byte verification, and a size cap.
 */
@RestController
@RequestMapping("/api")
public class FontController {

    private static final Logger log = LoggerFactory.getLogger(FontController.class);

    private static final Set<String> ALLOWED_FORMATS = Set.of("woff2", "woff", "ttf", "otf");

    /** 2 MB. A woff2 of a full Latin face is well under this. */
    private static final long MAX_FONT_BYTES = 2 * 1024 * 1024;

    /**
     * The family name ends up inside generated CSS, so it is restricted to
     * letters, digits, spaces and hyphens — no quotes, braces or semicolons
     * that could break out of the declaration.
     */
    private static final Pattern SAFE_FAMILY = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9 \\-]{0,63}$");

    @Value("${app.upload-dir:uploads}")
    private String uploadDir;

    @Autowired private LoginRepository loginRepository;
    @Autowired private JdbcTemplate jdbc;

    private AuthSession authorize(String username, String token) {
        try { return loginRepository.authorize(username, token); }
        catch (JdbcLoginRepository.TokenExpiredException e) { return null; }
    }

    private Path fontDirectory() throws IOException {
        Path dir = Paths.get(uploadDir).resolve("fonts");
        Files.createDirectories(dir);
        return dir;
    }

    /**
     * Verifies the file really is the font format its extension claims.
     *
     * Signatures: woff2 "wOF2", woff "wOFF", OpenType "OTTO", TrueType
     * 0x00010000 or "true".
     */
    private static boolean magicBytesMatch(byte[] h, String format) {
        if (h.length < 4) return false;
        String tag = new String(h, 0, 4, StandardCharsets.US_ASCII);
        return switch (format) {
            case "woff2" -> tag.equals("wOF2");
            case "woff"  -> tag.equals("wOFF");
            case "otf"   -> tag.equals("OTTO");
            case "ttf"   -> (h[0] == 0x00 && h[1] == 0x01 && h[2] == 0x00 && h[3] == 0x00)
                            || tag.equals("true") || tag.equals("ttcf");
            default      -> false;
        };
    }

    // ── Public: what fonts are available ──────────────────────────────────────

    /** The font catalogue. Public — everyone composing a post needs it. */
    @GetMapping("/fonts")
    public ResponseEntity<List<Map<String, Object>>> listFonts() {
        return ResponseEntity.ok(jdbc.queryForList("""
                SELECT id, display_name, family, filename, format
                  FROM custom_fonts
                 WHERE enabled = TRUE
                 ORDER BY display_name
                """));
    }

    /**
     * A stylesheet declaring every enabled font, so a page can pick them up with
     * one <link> and no per-font wiring on the client.
     */
    @GetMapping(value = "/fonts.css", produces = "text/css")
    public ResponseEntity<String> fontStylesheet() {
        List<Map<String, Object>> fonts = jdbc.queryForList(
                "SELECT family, filename, format FROM custom_fonts WHERE enabled = TRUE");

        StringBuilder css = new StringBuilder("/* Generated from the custom font catalogue. */\n");
        for (Map<String, Object> font : fonts) {
            String family = (String) font.get("family");
            // Belt and braces: the family was validated on upload, but this is
            // string-built CSS, so anything unexpected is skipped rather than
            // emitted.
            if (family == null || !SAFE_FAMILY.matcher(family).matches()) continue;
            css.append("""
                    @font-face {
                      font-family: '%s';
                      src: url('/uploads/fonts/%s') format('%s');
                      font-display: swap;
                    }
                    """.formatted(family, font.get("filename"), font.get("format")));
        }
        return ResponseEntity.ok()
                .contentType(MediaType.valueOf("text/css"))
                .body(css.toString());
    }

    // ── Admin: manage the catalogue ───────────────────────────────────────────

    @PostMapping("/admin/fonts")
    public ResponseEntity<?> uploadFont(
            @RequestParam("file") MultipartFile file,
            @RequestParam("displayName") String displayName,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token) {

        if (authorize(username, token) == null || !loginRepository.isAdmin(username))
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "Only admins can add fonts."));

        if (file == null || file.isEmpty())
            return ResponseEntity.badRequest().body(Map.of("message", "No file provided."));
        if (file.getSize() > MAX_FONT_BYTES)
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                    .body(Map.of("message", "Fonts must be 2 MB or smaller."));

        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        int dot = original.lastIndexOf('.');
        String format = dot >= 0 ? original.substring(dot + 1) : "";
        if (!ALLOWED_FORMATS.contains(format))
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Only .woff2, .woff, .ttf and .otf files are allowed."));

        String name = displayName == null ? "" : displayName.trim();
        if (!SAFE_FAMILY.matcher(name).matches())
            return ResponseEntity.badRequest().body(Map.of("message",
                    "The name must be letters, numbers, spaces or hyphens, and start with a letter or number."));

        byte[] data;
        try (InputStream in = file.getInputStream()) {
            data = in.readAllBytes();
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "Could not read that file."));
        }

        if (!magicBytesMatch(data, format))
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "That file is not a valid " + format + " font."));

        List<Integer> clash = jdbc.queryForList(
                "SELECT id FROM custom_fonts WHERE lower(family) = lower(?)", Integer.class, name);
        if (!clash.isEmpty())
            return ResponseEntity.badRequest().body(Map.of("message", "A font with that name already exists."));

        try {
            String filename = UUID.randomUUID() + "." + format;
            Files.write(fontDirectory().resolve(filename), data);
            jdbc.update("""
                    INSERT INTO custom_fonts (display_name, family, filename, format, size_bytes, uploaded_by)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, name, name, filename, format, (long) data.length, username);

            log.info("Font \"{}\" ({} bytes) added by {}", name, data.length, username);
            return ResponseEntity.ok(Map.of("message", "Font added. It is available to everyone now."));
        } catch (IOException e) {
            log.warn("Could not store font: {}", e.toString());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "Could not store that font."));
        }
    }

    /** Lists every font including disabled ones. */
    @GetMapping("/admin/fonts")
    public ResponseEntity<?> listAllFonts(
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token) {

        if (authorize(username, token) == null || !loginRepository.isAdmin(username))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        return ResponseEntity.ok(jdbc.queryForList("""
                SELECT id, display_name, family, filename, format, size_bytes,
                       uploaded_by, enabled, created_at
                  FROM custom_fonts ORDER BY display_name
                """));
    }

    /**
     * Enables or disables a font.
     *
     * Preferred over deletion: posts store the family name, so removing a font
     * outright silently changes how existing posts render. Disabling takes it
     * out of the picker while leaving current uses alone.
     */
    @PutMapping("/admin/fonts/{id}")
    public ResponseEntity<?> setFontEnabled(
            @PathVariable long id,
            @RequestBody Map<String, Object> body,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token) {

        if (authorize(username, token) == null || !loginRepository.isAdmin(username))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        boolean enabled = Boolean.TRUE.equals(body.get("enabled"));
        int updated = jdbc.update("UPDATE custom_fonts SET enabled = ? WHERE id = ?", enabled, id);
        if (updated == 0) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(Map.of("message", enabled ? "Font enabled." : "Font hidden from the picker."));
    }

    /** Permanently removes a font and its file. */
    @DeleteMapping("/admin/fonts/{id}")
    public ResponseEntity<?> deleteFont(
            @PathVariable long id,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token) {

        if (authorize(username, token) == null || !loginRepository.isAdmin(username))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT filename FROM custom_fonts WHERE id = ?", id);
        if (rows.isEmpty()) return ResponseEntity.notFound().build();

        jdbc.update("DELETE FROM custom_fonts WHERE id = ?", id);
        try {
            // The filename is a UUID this server generated, never user input.
            Files.deleteIfExists(fontDirectory().resolve((String) rows.get(0).get("filename")));
        } catch (IOException e) {
            // The catalogue row is gone, so the font is no longer offered; a
            // leftover file is untidy, not harmful.
            log.warn("Removed font {} from the catalogue but could not delete its file: {}", id, e.toString());
        }
        log.info("Font {} deleted by {}", id, username);
        return ResponseEntity.ok(Map.of("message", "Font deleted."));
    }
}
