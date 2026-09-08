package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.service.ImageProcessingService;
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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

// CORS comes from SecurityConfig / ALLOWED_ORIGINS. A @CrossOrigin annotation
// here would silently override that with a hard-coded list, so there isn't one.
@RestController
@RequestMapping("/api")
public class UploadController {

    @Value("${app.upload-dir:uploads}")
    private String uploadDir;

    @Value("${app.upload-max-size:5242880}")
    private long maxFileSizeBytes;

    @Autowired LoginRepository loginRepository;
    @Autowired JdbcTemplate jdbc;
    @Autowired ImageProcessingService imageService;

    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(".jpg", ".jpeg", ".png", ".gif", ".webp");

    private static boolean hasValidImageMagicBytes(byte[] h) {
        if (h.length < 4) return false;
        // JPEG: FF D8 FF
        if ((h[0] & 0xFF) == 0xFF && (h[1] & 0xFF) == 0xD8 && (h[2] & 0xFF) == 0xFF) return true;
        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if ((h[0] & 0xFF) == 0x89 && h[1] == 'P' && h[2] == 'N' && h[3] == 'G') return true;
        // GIF: GIF8
        if (h[0] == 'G' && h[1] == 'I' && h[2] == 'F' && h[3] == '8') return true;
        // WebP: RIFF????WEBP (need 12 bytes)
        if (h.length >= 12 && h[0] == 'R' && h[1] == 'I' && h[2] == 'F' && h[3] == 'F'
                && h[8] == 'W' && h[9] == 'E' && h[10] == 'B' && h[11] == 'P') return true;
        return false;
    }

    @PostMapping("/upload")
    public ResponseEntity<?> uploadFile(
            @RequestParam("file") MultipartFile file,
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        AuthSession loginResult;
        try {
            loginResult = loginRepository.authorize(username, token);
        } catch (JdbcLoginRepository.TokenExpiredException ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Session expired");
        }
        if (loginResult == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized");
        if (file.isEmpty()) return ResponseEntity.badRequest().body("No file provided");
        if (file.getSize() > maxFileSizeBytes)
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body("File exceeds the 5 MB size limit");

        // Extension whitelist
        String originalFilename = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase() : "";
        String extension = originalFilename.contains(".")
                ? originalFilename.substring(originalFilename.lastIndexOf('.'))
                : "";
        if (!ALLOWED_EXTENSIONS.contains(extension))
            return ResponseEntity.badRequest().body("Only .jpg, .jpeg, .png, .gif, and .webp files are allowed");

        // Read the whole file once. It is already capped at maxFileSizeBytes above,
        // and every check below plus variant generation needs the bytes, so
        // re-opening the stream repeatedly would be wasteful and racy.
        byte[] data;
        try (InputStream is = file.getInputStream()) {
            data = is.readAllBytes();
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to read file");
        }

        // 1. Magic bytes — cheap rejection of anything not shaped like an image.
        if (data.length < 12 || !hasValidImageMagicBytes(data))
            return ResponseEntity.badRequest().body("File content does not match an allowed image format");

        String ext = extension.substring(1);   // ".png" -> "png"

        // 2. Declared dimensions, read from the header without decoding pixels.
        //    A decompression bomb is a small file claiming enormous dimensions,
        //    so this has to be refused before anything is allocated.
        ImageProcessingService.Dimensions dims = imageService.readDimensions(data);
        if (!imageService.isWithinPixelBudget(dims))
            return ResponseEntity.badRequest().body("Image dimensions are too large (40 megapixel limit)");

        // 3. Full decode. Magic bytes only prove the first few bytes look right;
        //    decoding proves the whole file is a real image, which rejects
        //    truncated uploads and polyglots — a valid GIF header followed by
        //    something else entirely.
        if (!imageService.decodesCleanly(data, ext))
            return ResponseEntity.badRequest().body("File is not a readable image");

        // Lookup uploader's user ID and role
        List<Integer> ids = jdbc.queryForList("SELECT id FROM users WHERE username=?", Integer.class, username);
        if (ids.isEmpty()) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not found");
        int userId = ids.get(0);

        // Enforce role-based storage quota
        try {
            String role = jdbc.queryForObject("SELECT role FROM users WHERE id=?", String.class, userId);
            if (role == null) role = "user";
            Long maxStorage = jdbc.queryForObject(
                "SELECT max_storage_bytes FROM role_limits WHERE role=?", Long.class, role);
            if (maxStorage != null && maxStorage >= 0) {
                Long currentUsage = jdbc.queryForObject(
                    "SELECT COALESCE(SUM(size_bytes), 0) FROM uploads WHERE user_id=?", Long.class, userId);
                long used = currentUsage != null ? currentUsage : 0L;
                if (used + file.getSize() > maxStorage) {
                    long usedMb = used / 1048576;
                    long limitMb = maxStorage / 1048576;
                    return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                        .body("Storage quota exceeded. Used " + usedMb + " MB of " + limitMb + " MB limit.");
                }
            }
        } catch (Exception e) {
            // If quota lookup fails for any reason, allow the upload rather than blocking it
        }

        try {
            Path uploadPath = Paths.get(uploadDir);
            Files.createDirectories(uploadPath);

            String baseName = UUID.randomUUID().toString();
            String filename = baseName + extension;
            Files.write(uploadPath.resolve(filename), data);

            Integer width  = dims != null ? dims.width()  : null;
            Integer height = dims != null ? dims.height() : null;

            Integer uploadId = jdbc.queryForObject(
                "INSERT INTO uploads(filename, user_id, original_name, size_bytes, width, height) " +
                "VALUES(?,?,?,?,?,?) RETURNING id",
                Integer.class,
                filename, userId, file.getOriginalFilename(), (long) data.length, width, height);

            // Downscaled renditions so the browser can fetch one that suits its
            // viewport and connection. Best-effort: if none can be produced the
            // original is still perfectly usable.
            List<ImageProcessingService.Variant> variants =
                    imageService.writeVariants(data, uploadPath, baseName, ext);

            for (ImageProcessingService.Variant v : variants) {
                jdbc.update(
                    "INSERT INTO upload_variants(upload_id, filename, width, size_bytes) VALUES(?,?,?,?)",
                    uploadId, v.filename(), v.width(), v.sizeBytes());
            }

            return ResponseEntity.ok(describeUpload(filename, width, height, variants));
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to store file: " + e.getMessage());
        }
    }

    /**
     * The upload response.
     *
     * `url` is kept as the first-class field and still points at the original,
     * so a client that ignores everything else behaves exactly as before —
     * posts saved by older clients keep working, and the Lexical documents
     * already in the database store this URL.
     *
     * `srcset` is ready to drop straight into an <img srcset> attribute.
     */
    private Map<String, Object> describeUpload(
            String filename, Integer width, Integer height,
            List<ImageProcessingService.Variant> variants) {

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("url", "/uploads/" + filename);
        if (width != null)  body.put("width", width);
        if (height != null) body.put("height", height);

        List<Map<String, Object>> variantList = new ArrayList<>();
        List<String> srcsetParts = new ArrayList<>();
        for (ImageProcessingService.Variant v : variants) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("url", "/uploads/" + v.filename());
            entry.put("width", v.width());
            variantList.add(entry);
            srcsetParts.add("/uploads/" + v.filename() + " " + v.width() + "w");
        }
        // The original is the widest candidate, so the browser can still choose
        // it on a large high-density display.
        if (!variantList.isEmpty() && width != null) {
            srcsetParts.add("/uploads/" + filename + " " + width + "w");
        }

        body.put("variants", variantList);
        body.put("srcset", String.join(", ", srcsetParts));
        return body;
    }
}
