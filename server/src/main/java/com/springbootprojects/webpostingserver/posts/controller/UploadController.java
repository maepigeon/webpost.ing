package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
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
import java.util.List;
import java.util.Set;
import java.util.UUID;

@CrossOrigin(origins = {"https://webpost.ing", "http://localhost:5173"}, allowCredentials = "true")
@RestController
@RequestMapping("/api")
public class UploadController {

    @Value("${app.upload-dir:uploads}")
    private String uploadDir;

    @Value("${app.upload-max-size:5242880}")
    private long maxFileSizeBytes;

    @Autowired LoginRepository loginRepository;
    @Autowired JdbcTemplate jdbc;

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
    public ResponseEntity<String> uploadFile(
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

        // Magic byte validation — read first 12 bytes without consuming the stream
        try (InputStream is = file.getInputStream()) {
            byte[] header = is.readNBytes(12);
            if (!hasValidImageMagicBytes(header))
                return ResponseEntity.badRequest().body("File content does not match an allowed image format");
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to read file");
        }

        // Lookup uploader's user ID
        List<Integer> ids = jdbc.queryForList("SELECT id FROM users WHERE username=?", Integer.class, username);
        if (ids.isEmpty()) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not found");
        int userId = ids.get(0);

        try {
            Path uploadPath = Paths.get(uploadDir);
            Files.createDirectories(uploadPath);

            String filename = UUID.randomUUID() + extension;
            Files.copy(file.getInputStream(), uploadPath.resolve(filename));

            // Record in uploads table
            jdbc.update(
                "INSERT INTO uploads(filename, user_id, original_name, size_bytes) VALUES(?,?,?,?)",
                filename, userId, file.getOriginalFilename(), file.getSize());

            return ResponseEntity.ok("/uploads/" + filename);
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to store file: " + e.getMessage());
        }
    }
}
