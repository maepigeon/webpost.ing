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
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UploadControllerTest {

    @Mock LoginRepository loginRepository;

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

    @Test
    void upload_validImage_returns200WithPath() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        MockMultipartFile file = new MockMultipartFile(
                "file", "photo.jpg", "image/jpeg", new byte[100]);

        ResponseEntity<String> resp = uploadController.uploadFile(file, "kittycat", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).startsWith("/uploads/");
        assertThat(resp.getBody()).endsWith(".jpg");
    }

    @Test
    void upload_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("kittycat", "bad")).thenReturn(null);
        MockMultipartFile file = new MockMultipartFile(
                "file", "photo.jpg", "image/jpeg", new byte[100]);

        ResponseEntity<String> resp = uploadController.uploadFile(file, "kittycat", "bad");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void upload_expiredToken_returns401() throws Exception {
        when(loginRepository.authorize("kittycat", "expired"))
                .thenThrow(new JdbcLoginRepository.TokenExpiredException());

        MockMultipartFile file = new MockMultipartFile(
                "file", "photo.jpg", "image/jpeg", new byte[100]);

        ResponseEntity<String> resp = uploadController.uploadFile(file, "kittycat", "expired");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void upload_nonImageFile_returns400() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        MockMultipartFile file = new MockMultipartFile(
                "file", "script.js", "text/javascript", new byte[100]);

        ResponseEntity<String> resp = uploadController.uploadFile(file, "kittycat", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody()).contains("image");
    }

    @Test
    void upload_emptyFile_returns400() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        MockMultipartFile file = new MockMultipartFile(
                "file", "empty.jpg", "image/jpeg", new byte[0]);

        ResponseEntity<String> resp = uploadController.uploadFile(file, "kittycat", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void upload_oversizedFile_returns413() throws Exception {
        when(loginRepository.authorize("kittycat", "tok")).thenReturn(validSession);
        // 6 MB — exceeds the 5 MB limit
        MockMultipartFile file = new MockMultipartFile(
                "file", "big.jpg", "image/jpeg", new byte[6 * 1024 * 1024]);

        ResponseEntity<String> resp = uploadController.uploadFile(file, "kittycat", "tok");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
    }
}
