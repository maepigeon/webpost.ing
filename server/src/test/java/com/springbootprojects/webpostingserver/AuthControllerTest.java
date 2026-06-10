package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.AuthController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    @Mock LoginRepository loginRepository;
    @Mock SocialRepository social;
    @Mock JdbcTemplate jdbc;

    @InjectMocks AuthController authController;

    private AuthSession whiskersSession;

    @BeforeEach
    void setUp() {
        whiskersSession = new AuthSession("whiskers");
        whiskersSession.userId = 1;
    }

    // ── GET background ────────────────────────────────────────────────────────

    @Test
    void getUserBackground_returnsStoredPattern() {
        when(loginRepository.getUserBackground("whiskers")).thenReturn("dots");
        ResponseEntity<String> resp = authController.getUserBackground("whiskers");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).isEqualTo("dots");
    }

    @Test
    void getUserBackground_nullPattern_returnsEmpty() {
        when(loginRepository.getUserBackground("whiskers")).thenReturn(null);
        ResponseEntity<String> resp = authController.getUserBackground("whiskers");
        assertThat(resp.getBody()).isEmpty();
    }

    // ── PUT background ────────────────────────────────────────────────────────

    @Test
    void updateBackground_wrongUser_returns403() throws Exception {
        ResponseEntity<String> resp = authController.updateUserBackground("mittens", "dots", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(loginRepository, never()).updateUserBackground(anyString(), anyString());
    }

    @Test
    void updateBackground_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(null);
        ResponseEntity<String> resp = authController.updateUserBackground("whiskers", "dots", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void updateBackground_expiredToken_deletesCookie() throws Exception {
        when(loginRepository.authorize("whiskers", "expired"))
                .thenThrow(new JdbcLoginRepository.TokenExpiredException());
        when(loginRepository.deleteCookie()).thenReturn(ResponseEntity.ok().build());
        authController.updateUserBackground("whiskers", "dots", "whiskers", "expired");
        verify(loginRepository).deleteCookie();
    }

    @Test
    void updateBackground_invalidPattern_returns400() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        // "red" is not a valid preset or gradient
        ResponseEntity<String> resp = authController.updateUserBackground("whiskers", "red", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verify(loginRepository, never()).updateUserBackground(anyString(), anyString());
    }

    @Test
    void updateBackground_validPattern_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        ResponseEntity<String> resp = authController.updateUserBackground("whiskers", "dots", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(loginRepository).updateUserBackground("whiskers", "dots");
    }

    @Test
    void updateBackground_emptyPattern_clearsBackground() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        ResponseEntity<String> resp = authController.updateUserBackground("whiskers", "", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        // blank → stored as null
        verify(loginRepository).updateUserBackground("whiskers", null);
    }

    // ── GET bio ───────────────────────────────────────────────────────────────

    @Test
    void getUserBio_returnsStoredBio() {
        when(loginRepository.getUserBio("whiskers")).thenReturn("Hello world");
        ResponseEntity<String> resp = authController.getUserBio("whiskers");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).isEqualTo("Hello world");
    }

    @Test
    void getUserBio_nullBio_returnsEmpty() {
        when(loginRepository.getUserBio("whiskers")).thenReturn(null);
        ResponseEntity<String> resp = authController.getUserBio("whiskers");
        assertThat(resp.getBody()).isEmpty();
    }

    // ── PUT bio ───────────────────────────────────────────────────────────────

    @Test
    void updateBio_wrongUser_returns403() throws Exception {
        ResponseEntity<String> resp = authController.updateUserBio("mittens", "hi", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void updateBio_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(null);
        ResponseEntity<String> resp = authController.updateUserBio("whiskers", "hi", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void updateBio_tooLong_returns400() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        ResponseEntity<String> resp = authController.updateUserBio("whiskers", "a".repeat(501), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void updateBio_stripsHtmlTags() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        authController.updateUserBio("whiskers", "<b>bold</b>text", "whiskers", "tok");
        verify(loginRepository).updateUserBio("whiskers", "boldtext");
    }

    @Test
    void updateBio_valid_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        ResponseEntity<String> resp = authController.updateUserBio("whiskers", "My bio", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(loginRepository).updateUserBio("whiskers", "My bio");
    }

    // ── GET bio-links ─────────────────────────────────────────────────────────

    @Test
    void getUserBioLinks_returnsJsonArray() {
        when(loginRepository.getUserBioLinks("whiskers"))
                .thenReturn("[{\"label\":\"Blog\",\"url\":\"https://example.com\"}]");
        ResponseEntity<String> resp = authController.getUserBioLinks("whiskers");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).contains("example.com");
    }

    @Test
    void getUserBioLinks_nullLinks_returnsEmptyArray() {
        when(loginRepository.getUserBioLinks("whiskers")).thenReturn(null);
        ResponseEntity<String> resp = authController.getUserBioLinks("whiskers");
        assertThat(resp.getBody()).isEqualTo("[]");
    }

    // ── PUT bio-links ─────────────────────────────────────────────────────────

    @Test
    void updateBioLinks_wrongUser_returns403() throws Exception {
        ResponseEntity<String> resp = authController.updateUserBioLinks("mittens", "[]", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void updateBioLinks_tooManyLinks_returns400() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        String body = "[{\"url\":\"https://a.com\"},{\"url\":\"https://b.com\"},{\"url\":\"https://c.com\"},{\"url\":\"https://d.com\"}]";
        ResponseEntity<String> resp = authController.updateUserBioLinks("whiskers", body, "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody()).contains("3");
    }

    @Test
    void updateBioLinks_nonHttpUrl_returns400() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        String body = "[{\"url\":\"ftp://evil.com\",\"label\":\"bad\"}]";
        ResponseEntity<String> resp = authController.updateUserBioLinks("whiskers", body, "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody()).contains("http");
    }

    @Test
    void updateBioLinks_labelTooLong_returns400() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        String label = "a".repeat(51);
        String body = "[{\"url\":\"https://example.com\",\"label\":\"" + label + "\"}]";
        ResponseEntity<String> resp = authController.updateUserBioLinks("whiskers", body, "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void updateBioLinks_valid_returns200() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        String body = "[{\"url\":\"https://example.com\",\"label\":\"My Site\"}]";
        ResponseEntity<String> resp = authController.updateUserBioLinks("whiskers", body, "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(loginRepository).updateUserBioLinks("whiskers", body);
    }

    // ── Search ────────────────────────────────────────────────────────────────

    @Test
    void searchUsers_blankQuery_returnsEmptyList() {
        ResponseEntity<List<String>> resp = authController.searchUsers("   ");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).isEmpty();
    }

    @Test
    void searchUsers_tooLongQuery_returnsEmptyList() {
        ResponseEntity<List<String>> resp = authController.searchUsers("a".repeat(51));
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).isEmpty();
    }

    @Test
    void searchUsers_validQuery_returnsList() {
        when(social.searchUsers("ali", 20)).thenReturn(List.of("whiskers", "alicia"));
        ResponseEntity<List<String>> resp = authController.searchUsers("ali");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsExactly("whiskers", "alicia");
    }

    // ── Delete account ────────────────────────────────────────────────────────

    @Test
    void deleteAccount_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(null);
        ResponseEntity<String> resp = authController.deleteAccount("mittens", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void deleteAccount_nonAdmin_returns403() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(whiskersSession);
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), eq("whiskers"))).thenReturn(false);
        ResponseEntity<String> resp = authController.deleteAccount("mittens", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(loginRepository, never()).deleteUser(anyString());
    }

    @Test
    void deleteAccount_adminDeletes_returns200() throws Exception {
        AuthSession catminSession = new AuthSession("admin");
        catminSession.userId = 99;
        when(loginRepository.authorize("admin", "tok")).thenReturn(catminSession);
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), eq("admin"))).thenReturn(true);
        ResponseEntity<String> resp = authController.deleteAccount("mittens", "admin", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(loginRepository).deleteUser("mittens");
    }
}
