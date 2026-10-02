package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.UploadController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.service.StorageAccountService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** The audio upload: what it accepts, where it keeps it, and how it is charged. */
@SpringBootTest
class AudioUploadTest {

    private static final String WHO = "audio_upload_user";
    private static final String TINY_ROLE = "audio_tiny_role";

    @Autowired JdbcTemplate jdbc;
    @Autowired LoginRepository logins;
    @Autowired UploadController uploads;
    @Autowired StorageAccountService storage;

    @TempDir Path tempDir;

    private int userId;
    private String token;
    private Object originalUploadDir;

    @BeforeEach
    void setUp() {
        cleanUp();
        originalUploadDir = ReflectionTestUtils.getField(uploads, "uploadDir");
        ReflectionTestUtils.setField(uploads, "uploadDir", tempDir.toString());
        userId = jdbc.queryForObject("INSERT INTO users (username, password, role) VALUES (?, ?, 'user') RETURNING id",
                Integer.class, WHO, new BCryptPasswordEncoder().encode("pw"));
        LoginInfo info = new LoginInfo();
        info.setUsername(WHO);
        info.setPassword("pw");
        AuthSession session = logins.login(info);
        token = session.token;
    }

    @AfterEach
    void cleanUp() {
        if (originalUploadDir != null) ReflectionTestUtils.setField(uploads, "uploadDir", originalUploadDir);
        jdbc.update("DELETE FROM uploads WHERE user_id IN (SELECT id FROM users WHERE username = ?)", WHO);
        jdbc.update("DELETE FROM users WHERE username = ?", WHO);
        jdbc.update("DELETE FROM role_limits WHERE role = ?", TINY_ROLE);
    }

    private static byte[] mp3WithId3(int size) {
        byte[] b = new byte[size];
        b[0] = 'I'; b[1] = 'D'; b[2] = '3'; b[3] = 3;
        return b;
    }

    private ResponseEntity<?> upload(String name, byte[] bytes) {
        return uploads.uploadAudio(new MockMultipartFile("file", name, "audio/mpeg", bytes), WHO, token);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> at(Map<String, Object> m, String... path) {
        Map<String, Object> cur = m;
        for (String p : path) cur = (Map<String, Object>) cur.get(p);
        return cur;
    }

    @Test
    void storesAnMp3UnderAudioAndChargesItToTheUser() throws Exception {
        ResponseEntity<?> resp = upload("song.mp3", mp3WithId3(1000));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) resp.getBody();
        String url = (String) body.get("url");
        assertThat(url).startsWith("/uploads/audio/").endsWith(".mp3");
        assertThat(body).containsEntry("name", "song.mp3").containsEntry("sizeBytes", 1000L);
        assertThat(Files.size(tempDir.resolve(url.substring("/uploads/".length())))).isEqualTo(1000L);

        assertThat(jdbc.queryForObject("SELECT size_bytes FROM uploads WHERE user_id = ? AND filename = ?",
                Long.class, userId, url.substring("/uploads/".length()))).isEqualTo(1000L);

        // Its own item in the files section, not counted as a post image.
        Map<String, Object> files = at(storage.usage(userId), "sections", "files", "items");
        assertThat(files.get("audio")).isEqualTo(Map.of("count", 1L, "bytes", 1000L));
        assertThat(files.get("postImages")).isEqualTo(Map.of("count", 0L, "bytes", 0L));
        assertThat(storage.filesChargedBytes(userId)).isEqualTo(1000L);
    }

    @Test
    void acceptsABareMpegFrame() {
        byte[] frame = new byte[500];
        frame[0] = (byte) 0xFF;
        frame[1] = (byte) 0xFB;
        assertThat(upload("frame.MP3", frame).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void refusesWhatIsNotAnMp3() {
        assertThat(upload("song.wav", mp3WithId3(100)).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        // Right name, wrong contents: a script renamed to .mp3.
        assertThat(upload("song.mp3", "alert(1);".getBytes()).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(upload("song.mp3", new byte[0]).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM uploads WHERE user_id = ?", Long.class, userId)).isZero();
    }

    @Test
    void refusesMoreThanTwentyMegabytes() {
        ResponseEntity<?> resp = upload("long.mp3", mp3WithId3(20 * 1024 * 1024 + 1));
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
    }

    @Test
    void needsASignedInUser() {
        ResponseEntity<?> resp = uploads.uploadAudio(
                new MockMultipartFile("file", "song.mp3", "audio/mpeg", mp3WithId3(100)), WHO, "not-a-token");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void respectsTheStorageQuota() {
        jdbc.update("INSERT INTO role_limits (role, max_storage_bytes, max_posts_per_day) VALUES (?, 1500, 20)", TINY_ROLE);
        jdbc.update("UPDATE users SET role = ? WHERE id = ?", TINY_ROLE, userId);

        assertThat(upload("one.mp3", mp3WithId3(1000)).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(upload("two.mp3", mp3WithId3(1000)).getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
    }
}
