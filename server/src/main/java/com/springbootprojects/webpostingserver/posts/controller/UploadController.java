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

    @Autowired
    private com.springbootprojects.webpostingserver.posts.service.StorageAccountService storageAccount;

    private static final Logger log = LoggerFactory.getLogger(UploadController.class);

    /**
     * IOException text contains absolute server paths. Log it, return a fixed
     * message.
     */
    private static String storeFailure(IOException e) {
        log.error("Upload could not be stored", e);
        return "Failed to store file";
    }

    @Autowired LoginRepository loginRepository;
    @Autowired com.springbootprojects.webpostingserver.posts.service.PostingGate postingGate;
    @Autowired JdbcTemplate jdbc;
    @Autowired ImageProcessingService imageService;

    // Audio is kept to the size of a song, well under the general upload cap.
    static final long MAX_AUDIO_BYTES = 20L * 1024 * 1024;

    /**
     * One lock per user (hashed into a fixed set, so no map grows with users):
     * the quota check and the row that records the upload happen under it, so
     * two parallel uploads cannot both pass the check before either is counted.
     */
    private static final Object[] USER_LOCKS = new Object[64];
    static { for (int i = 0; i < USER_LOCKS.length; i++) USER_LOCKS[i] = new Object(); }

    static Object lockFor(int userId) {
        return USER_LOCKS[Math.floorMod(userId, USER_LOCKS.length)];
    }

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

    /** An MP3 starts with an ID3 tag, or directly with an MPEG frame: 11 set sync bits. */
    static boolean hasMp3MagicBytes(byte[] h) {
        if (h.length < 4) return false;
        if (h[0] == 'I' && h[1] == 'D' && h[2] == '3') return true;
        return (h[0] & 0xFF) == 0xFF && (h[1] & 0xE0) == 0xE0;
    }

    /**
     * An MP3 for the audio block. Stored under audio/ and recorded as an upload,
     * so it is charged to the user's storage like their images.
     */
    @PostMapping("/upload/audio")
    public ResponseEntity<?> uploadAudio(
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
        if (postingGate.mustVerifyFirst(loginResult.userId)) return postingGate.refusal();
        if (file.isEmpty()) return ResponseEntity.badRequest().body("No file provided");
        if (file.getSize() > MAX_AUDIO_BYTES)
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body("Audio exceeds the 20 MB size limit");

        String original = file.getOriginalFilename() != null ? file.getOriginalFilename() : "";
        if (!original.toLowerCase().endsWith(".mp3"))
            return ResponseEntity.badRequest().body("Only .mp3 files are allowed");

        byte[] data;
        try (InputStream is = file.getInputStream()) {
            data = is.readAllBytes();
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to read file");
        }
        if (!hasMp3MagicBytes(data))
            return ResponseEntity.badRequest().body("File content is not an MP3");

        List<Integer> ids = jdbc.queryForList("SELECT id FROM users WHERE username=?", Integer.class, username);
        if (ids.isEmpty()) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not found");
        int userId = ids.get(0);

        synchronized (lockFor(userId)) {
        if (!storageAccount.fitsQuota(userId, data.length, 0))
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body("Storage quota exceeded");

        try {
            Path audioDir = Paths.get(uploadDir, "audio");
            Files.createDirectories(audioDir);
            String filename = "audio/" + UUID.randomUUID() + ".mp3";
            Files.write(Paths.get(uploadDir).resolve(filename), data);
            jdbc.update("INSERT INTO uploads(filename, user_id, original_name, size_bytes) VALUES(?,?,?,?)",
                    filename, userId, original, (long) data.length);

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("url", "/uploads/" + filename);
            body.put("name", original);
            body.put("sizeBytes", (long) data.length);
            return ResponseEntity.ok(body);
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(storeFailure(e));
        }
        }
    }

    @PostMapping("/upload")
    public ResponseEntity<?> uploadFile(
            // The cookies come first: Spring resolves parameters in order, so a
            // signed-out request is told 401 before anything looks at the file.
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token,
            @RequestParam("file") MultipartFile file) {

        AuthSession loginResult;
        try {
            loginResult = loginRepository.authorize(username, token);
        } catch (JdbcLoginRepository.TokenExpiredException ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Session expired");
        }
        if (loginResult == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized");
        if (postingGate.mustVerifyFirst(loginResult.userId)) return postingGate.refusal();
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
            return ResponseEntity.badRequest().body("Image dimensions are too large (16 megapixel limit)");

        // 3. Full decode. Magic bytes only prove the first few bytes look right;
        //    decoding proves the whole file is a real image, which rejects
        //    truncated uploads and polyglots — a valid GIF header followed by
        //    something else entirely.
        try {
            if (!imageService.decodesCleanly(data, ext))
                return ResponseEntity.badRequest().body("File is not a readable image");
        } catch (ImageProcessingService.BusyException busy) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body("Busy, try again in a moment");
        }

        // Original JPEGs are stored byte-for-byte, so remove EXIF (GPS, camera
        // serial) here. Other formats are left as is (see stripJpegMetadata).
        data = imageService.stripJpegMetadata(data, ext);

        // Lookup uploader's user ID and role
        List<Integer> ids = jdbc.queryForList("SELECT id FROM users WHERE username=?", Integer.class, username);
        if (ids.isEmpty()) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not found");
        int userId = ids.get(0);

        // Check and record under the user's lock (see USER_LOCKS).
        synchronized (lockFor(userId)) {
        // Enforce the storage quota (see StorageAccountService).
        if (!storageAccount.fitsQuota(userId, data.length, 0)) {
            Long limit = storageAccount.fileLimitBytes(userId);
            long usedMb = storageAccount.filesChargedBytes(userId) / 1048576;
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body("Storage quota exceeded. Used " + usedMb + " MB of " + (limit == null ? 0 : limit / 1048576) + " MB limit.");
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
            List<ImageProcessingService.Variant> variants;
            try {
                variants = imageService.writeVariants(data, uploadPath, baseName, ext);
            } catch (ImageProcessingService.BusyException busy) {
                variants = List.of();   // the file is already stored and recorded; it just has no smaller copies
            }

            for (ImageProcessingService.Variant v : variants) {
                jdbc.update(
                    "INSERT INTO upload_variants(upload_id, filename, width, size_bytes) VALUES(?,?,?,?)",
                    uploadId, v.filename(), v.width(), v.sizeBytes());
            }

            // The renditions are charged too: StorageAccountService adds
            // upload_variants.size_bytes to what the user has used.
            return ResponseEntity.ok(describeUpload(filename, width, height, variants));
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(storeFailure(e));
        }
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

    /**
     * The signed-in user's own uploaded images, newest first.
     *
     * Backs the "choose one you have already uploaded" picker. Re-uploading the
     * same picture is the common case — a header, a logo, a diagram used across
     * several posts — and it wastes the user's storage quota every time.
     *
     * Scoped to the caller: this lists files, and one person's uploads are not
     * another's to browse. Avatars and headers are excluded because they are
     * profile furniture rather than things to place in a post.
     */
    @GetMapping("/uploads/mine")
    public ResponseEntity<?> listMyUploads(
            @RequestParam(defaultValue = "60") int limit,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token) {

        AuthSession session;
        try {
            session = loginRepository.authorize(username, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Session expired");
        }
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        int capped = Math.min(Math.max(limit, 1), 200);

        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT u.id, u.filename, u.original_name, u.size_bytes, u.uploaded_at,
                       u.width, u.height
                  FROM uploads u
                  JOIN users usr ON usr.id = u.user_id
                 WHERE usr.username = ?
                   AND u.filename NOT LIKE 'avatar/%'
                   AND u.filename NOT LIKE 'headers/%'
                   AND u.filename NOT LIKE 'audio/%'
                 ORDER BY u.uploaded_at DESC
                 LIMIT ?
                """, username, capped);

        List<Map<String, Object>> images = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            String filename = (String) row.get("filename");
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.get("id"));
            item.put("url", "/uploads/" + filename);
            item.put("name", row.get("original_name"));
            item.put("sizeBytes", row.get("size_bytes"));
            item.put("uploadedAt", row.get("uploaded_at"));
            item.put("width", row.get("width"));
            item.put("height", row.get("height"));

            // Hand back the same srcset a fresh upload would produce, so an
            // image picked from the library is served as responsively as one
            // uploaded on the spot.
            List<Map<String, Object>> variants = jdbc.queryForList(
                    "SELECT filename, width FROM upload_variants WHERE upload_id = ? ORDER BY width",
                    row.get("id"));
            List<String> parts = new ArrayList<>();
            for (Map<String, Object> v : variants) {
                parts.add("/uploads/" + v.get("filename") + " " + v.get("width") + "w");
            }
            if (!parts.isEmpty() && row.get("width") != null) {
                parts.add("/uploads/" + filename + " " + row.get("width") + "w");
            }
            item.put("srcset", String.join(", ", parts));
            images.add(item);
        }

        return ResponseEntity.ok(Map.of("images", images));
    }
}
