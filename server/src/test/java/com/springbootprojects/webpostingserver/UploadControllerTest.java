package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.UploadController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UploadControllerTest {

    @Mock LoginRepository loginRepository;
    @Mock JdbcTemplate jdbc;
    @Mock com.springbootprojects.webpostingserver.posts.service.StorageAccountService storageAccount;
    @Spy  com.springbootprojects.webpostingserver.posts.service.ImageProcessingService imageService =
            new com.springbootprojects.webpostingserver.posts.service.ImageProcessingService();

    @InjectMocks UploadController uploadController;

    @TempDir Path tempDir;

    private AuthSession validSession;

    @BeforeEach
    void setUp() {
        validSession = new AuthSession("kittycat");
        validSession.userId = 1;
        ReflectionTestUtils.setField(uploadController, "uploadDir", tempDir.toString());
        ReflectionTestUtils.setField(uploadController, "maxFileSizeBytes", 5 * 1024 * 1024L);
    }

    /** Produces a real, decodable JPEG of the given size. */
    private static byte[] realJpeg(int width, int height) throws java.io.IOException {
        java.awt.image.BufferedImage img =
                new java.awt.image.BufferedImage(width, height, java.awt.image.BufferedImage.TYPE_INT_RGB);
        java.awt.Graphics2D g = img.createGraphics();
        g.setColor(java.awt.Color.decode("#4b44cc"));
        g.fillRect(0, 0, width, height);
        g.dispose();
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(img, "jpg", out);
        return out.toByteArray();
    }

    @Test
    void upload_validImage_returns200WithPath() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        when(jdbc.queryForList(anyString(), eq(Integer.class), any())).thenReturn(List.of(1));
        when(storageAccount.fitsQuota(eq(1), anyLong(), eq(0L))).thenReturn(true);
        // A genuinely encoded JPEG. This used to be three magic bytes followed by
        // zeros, which the endpoint now rejects on purpose: uploads are verified
        // by decoding them, so a file that only *starts* like an image no longer
        // gets through. See ImageProcessingServiceTest.rejectsAPolyglot.
        MockMultipartFile file = new MockMultipartFile(
                "file", "photo.jpg", "image/jpeg", realJpeg(64, 48));

        ResponseEntity<?> resp = uploadController.uploadFile("kittycat", "tok", file);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).isInstanceOf(java.util.Map.class);
        String url = (String) ((java.util.Map<?, ?>) resp.getBody()).get("url");
        assertThat(url).startsWith("/uploads/").endsWith(".jpg");
    }

    @Test
    void upload_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("kittycat", "bad")).thenReturn(null);
        MockMultipartFile file = new MockMultipartFile(
                "file", "photo.jpg", "image/jpeg", new byte[100]);

        ResponseEntity<?> resp = uploadController.uploadFile("kittycat", "bad", file);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void upload_expiredToken_returns401() throws Exception {
        when(loginRepository.authorize("kittycat", "expired"))
                .thenThrow(new JdbcLoginRepository.TokenExpiredException());

        MockMultipartFile file = new MockMultipartFile(
                "file", "photo.jpg", "image/jpeg", new byte[100]);

        ResponseEntity<?> resp = uploadController.uploadFile("kittycat", "expired", file);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void upload_nonImageFile_returns400() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        MockMultipartFile file = new MockMultipartFile(
                "file", "script.js", "text/javascript", new byte[100]);

        ResponseEntity<?> resp = uploadController.uploadFile("kittycat", "tok", file);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat((String) resp.getBody()).contains(".jpg");
    }

    @Test
    void upload_emptyFile_returns400() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        MockMultipartFile file = new MockMultipartFile(
                "file", "empty.jpg", "image/jpeg", new byte[0]);

        ResponseEntity<?> resp = uploadController.uploadFile("kittycat", "tok", file);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void upload_oversizedFile_returns413() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        // 6 MB — exceeds the 5 MB limit
        MockMultipartFile file = new MockMultipartFile(
                "file", "big.jpg", "image/jpeg", new byte[6 * 1024 * 1024]);

        ResponseEntity<?> resp = uploadController.uploadFile("kittycat", "tok", file);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
    }

    @Test
    void upload_quotaCheckAndRecordAreAtomicPerUser() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        when(jdbc.queryForList(anyString(), eq(Integer.class), any())).thenReturn(List.of(1));
        java.util.concurrent.atomic.AtomicInteger inside = new java.util.concurrent.atomic.AtomicInteger();
        java.util.concurrent.atomic.AtomicInteger most = new java.util.concurrent.atomic.AtomicInteger();
        when(storageAccount.fitsQuota(eq(1), anyLong(), eq(0L))).thenAnswer(inv -> {
            most.accumulateAndGet(inside.incrementAndGet(), Math::max);
            Thread.sleep(150);   // long enough for a second upload to arrive between check and record
            return true;
        });
        // The row that records the upload ends the critical section.
        when(jdbc.queryForObject(startsWith("INSERT INTO uploads"), eq(Integer.class), any(Object[].class)))
                .thenAnswer(inv -> { inside.decrementAndGet(); return 7; });
        byte[] jpeg = realJpeg(64, 48);

        Runnable one = () -> uploadController.uploadFile("kittycat", "tok",
                new MockMultipartFile("file", "p.jpg", "image/jpeg", jpeg));
        Thread a = new Thread(one), b = new Thread(one);
        a.start(); b.start(); a.join(); b.join();

        assertThat(most.get()).isEqualTo(1);   // never two uploads between the check and the record
    }

    @Test
    void upload_whenDecodingIsBusy_answers503() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        doThrow(new com.springbootprojects.webpostingserver.posts.service.ImageProcessingService.BusyException())
                .when(imageService).decodesCleanly(any(), anyString());

        ResponseEntity<?> resp = uploadController.uploadFile("kittycat", "tok",
                new MockMultipartFile("file", "p.jpg", "image/jpeg", realJpeg(64, 48)));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(resp.getBody()).isEqualTo("Busy, try again in a moment");
    }
}
