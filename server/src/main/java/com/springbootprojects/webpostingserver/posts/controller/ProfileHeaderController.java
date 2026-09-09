package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.service.ImageProcessingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The banner image behind a profile's header card — the block holding the
 * avatar, name, bio and links.
 *
 * Verified the same way as any other upload: extension allowlist, magic bytes,
 * a full decode, and a pixel ceiling. A header is wide and always visible, so a
 * 960px variant is generated and preferred; the original stays for large
 * displays.
 */
@RestController
@RequestMapping("/api")
public class ProfileHeaderController {

    private static final Logger log = LoggerFactory.getLogger(ProfileHeaderController.class);

    private static final Set<String> ALLOWED = Set.of(".jpg", ".jpeg", ".png", ".gif", ".webp");
    private static final long MAX_BYTES = 4 * 1024 * 1024;
    private static final Set<String> INK_CHOICES = Set.of("auto", "light", "dark");

    @Value("${app.upload-dir:uploads}")
    private String uploadDir;

    @Autowired private LoginRepository loginRepository;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ImageProcessingService imageService;

    private AuthSession authorize(String username, String token) {
        try { return loginRepository.authorize(username, token); }
        catch (JdbcLoginRepository.TokenExpiredException e) { return null; }
    }

    /** The header settings for a profile. Public — anyone viewing it needs them. */
    @GetMapping("/users/{username}/header")
    public ResponseEntity<?> getHeader(@PathVariable String username) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT header_path, header_ink FROM users WHERE username = ?", username);
        if (rows.isEmpty()) return ResponseEntity.notFound().build();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("headerPath", rows.get(0).get("header_path"));
        body.put("headerInk", rows.get(0).get("header_ink"));
        return ResponseEntity.ok(body);
    }

    @PostMapping("/users/{username}/header")
    public ResponseEntity<?> uploadHeader(
            @PathVariable String username,
            @RequestParam("file") MultipartFile file,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {

        if (authorize(authUsername, token) == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Sign in first."));
        if (!username.equals(authUsername))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "That is not your profile."));

        if (file == null || file.isEmpty())
            return ResponseEntity.badRequest().body(Map.of("message", "No file provided."));
        if (file.getSize() > MAX_BYTES)
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                    .body(Map.of("message", "Header images must be 4 MB or smaller."));

        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        String ext = original.contains(".") ? original.substring(original.lastIndexOf('.')) : "";
        if (!ALLOWED.contains(ext))
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Only .jpg, .png, .gif and .webp images are allowed."));

        byte[] data;
        try (InputStream in = file.getInputStream()) {
            data = in.readAllBytes();
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "Could not read that file."));
        }

        String bare = ext.substring(1);
        ImageProcessingService.Dimensions dims = imageService.readDimensions(data);
        if (!imageService.isWithinPixelBudget(dims))
            return ResponseEntity.badRequest().body(Map.of("message", "That image is too large."));
        if (!imageService.decodesCleanly(data, bare))
            return ResponseEntity.badRequest().body(Map.of("message", "That file is not a readable image."));

        Integer userId = jdbc.queryForObject("SELECT id FROM users WHERE username = ?", Integer.class, username);
        if (userId == null) return ResponseEntity.notFound().build();

        try {
            Path dir = Paths.get(uploadDir, "headers");
            Files.createDirectories(dir);

            String base = UUID.randomUUID().toString();
            String filename = base + ext;
            Files.write(dir.resolve(filename), data);
            imageService.writeVariants(data, dir, base, bare);

            String previous = jdbc.queryForObject(
                    "SELECT header_path FROM users WHERE id = ?", String.class, userId);
            jdbc.update("UPDATE users SET header_path = ? WHERE id = ?", "/uploads/headers/" + filename, userId);
            deleteHeaderFiles(previous);

            log.info("Profile header updated for {}", username);
            return ResponseEntity.ok(Map.of(
                    "headerPath", "/uploads/headers/" + filename,
                    "message", "Header image saved."));
        } catch (IOException e) {
            log.warn("Could not store header for {}: {}", username, e.toString());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "Could not store that image."));
        }
    }

    /** Chooses how text over the header is coloured, or removes the image. */
    @PutMapping("/users/{username}/header")
    public ResponseEntity<?> updateHeader(
            @PathVariable String username,
            @RequestBody Map<String, Object> body,
            @CookieValue(name = "username", required = false) String authUsername,
            @CookieValue(name = "authToken", required = false) String token) {

        if (authorize(authUsername, token) == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!username.equals(authUsername))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        Integer userId = jdbc.queryForObject("SELECT id FROM users WHERE username = ?", Integer.class, username);
        if (userId == null) return ResponseEntity.notFound().build();

        if (Boolean.TRUE.equals(body.get("remove"))) {
            String previous = jdbc.queryForObject(
                    "SELECT header_path FROM users WHERE id = ?", String.class, userId);
            jdbc.update("UPDATE users SET header_path = NULL WHERE id = ?", userId);
            deleteHeaderFiles(previous);
            return ResponseEntity.ok(Map.of("headerPath", "", "message", "Header image removed."));
        }

        Object ink = body.get("headerInk");
        if (ink instanceof String choice && INK_CHOICES.contains(choice)) {
            jdbc.update("UPDATE users SET header_ink = ? WHERE id = ?", choice, userId);
            return ResponseEntity.ok(Map.of("headerInk", choice, "message", "Saved."));
        }
        return ResponseEntity.badRequest().body(Map.of("message", "Nothing to change."));
    }

    /**
     * Removes a header and the variants generated alongside it.
     *
     * Best-effort: the row is already updated, so the image is no longer shown
     * either way, and a leftover file is untidy rather than harmful.
     */
    private void deleteHeaderFiles(String path) {
        if (path == null || path.isBlank()) return;
        String name = path.substring(path.lastIndexOf('/') + 1);
        int dot = name.lastIndexOf('.');
        if (dot < 0) return;
        String base = name.substring(0, dot);
        String ext = name.substring(dot);
        try {
            Path dir = Paths.get(uploadDir, "headers");
            Files.deleteIfExists(dir.resolve(name));
            for (int width : ImageProcessingService.VARIANT_WIDTHS) {
                Files.deleteIfExists(dir.resolve(base + "-" + width + "w" + ext));
            }
        } catch (IOException e) {
            log.warn("Could not delete old header {}: {}", path, e.toString());
        }
    }
}
