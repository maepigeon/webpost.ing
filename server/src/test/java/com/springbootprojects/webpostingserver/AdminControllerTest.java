package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.AdminController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
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
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for AdminController. Uses JdbcLoginRepository (concrete class) as the
 * mock type so the cast in setUserRole — ((JdbcLoginRepository) loginRepository).evictSession()
 * — resolves at runtime without ClassCastException.
 */
@ExtendWith(MockitoExtension.class)
class AdminControllerTest {

    @Mock JdbcLoginRepository loginRepository;
    @Mock JdbcTemplate jdbc;
    @Mock SocialRepository social;

    @InjectMocks AdminController adminController;

    private AuthSession catminSession;
    private AuthSession straySession;

    @BeforeEach
    void setUp() {
        catminSession = new AuthSession("catmin");
        catminSession.userId = 1;

        straySession = new AuthSession("whiskers");
        straySession.userId = 2;
    }

    // ── GET /admin/me ─────────────────────────────────────────────────────────

    @Test
    void getAdminStatus_unauthenticated_returns401() throws Exception {
        when(loginRepository.authorize("whiskers", "bad")).thenReturn(null);
        ResponseEntity<Map<String, Object>> resp = adminController.getAdminStatus("whiskers", "bad");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void getAdminStatus_authenticated_returns200WithIsAdminFlag() throws Exception {
        when(loginRepository.authorize("catmin", "tok")).thenReturn(catminSession);
        when(loginRepository.isAdmin("catmin")).thenReturn(true);
        ResponseEntity<Map<String, Object>> resp = adminController.getAdminStatus("catmin", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsEntry("isAdmin", true);
        assertThat(resp.getBody()).containsEntry("username", "catmin");
    }

    // ── GET /admin/users ──────────────────────────────────────────────────────

    @Test
    void listUsers_nonAdmin_returns403() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(straySession);
        when(loginRepository.isAdmin("whiskers")).thenReturn(false);
        ResponseEntity<List<Map<String, Object>>> resp = adminController.listUsers("whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void listUsers_admin_returns200() throws Exception {
        when(loginRepository.authorize("catmin", "tok")).thenReturn(catminSession);
        when(loginRepository.isAdmin("catmin")).thenReturn(true);
        when(jdbc.queryForList(anyString())).thenReturn(List.of());
        ResponseEntity<List<Map<String, Object>>> resp = adminController.listUsers("catmin", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    // ── POST /admin/users ─────────────────────────────────────────────────────

    @Test
    void createUser_nonAdmin_returns403() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(straySession);
        when(loginRepository.isAdmin("whiskers")).thenReturn(false);
        ResponseEntity<String> resp = adminController.createUser(
                Map.of("username", "kittens", "password", "pass"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void createUser_missingUsername_returns400() throws Exception {
        when(loginRepository.authorize("catmin", "tok")).thenReturn(catminSession);
        when(loginRepository.isAdmin("catmin")).thenReturn(true);
        ResponseEntity<String> resp = adminController.createUser(
                Map.of("password", "pass"), "catmin", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void createUser_usernameTooLong_returns400() throws Exception {
        when(loginRepository.authorize("catmin", "tok")).thenReturn(catminSession);
        when(loginRepository.isAdmin("catmin")).thenReturn(true);
        ResponseEntity<String> resp = adminController.createUser(
                Map.of("username", "a".repeat(33), "password", "pass"), "catmin", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void createUser_admin_returns201() throws Exception {
        when(loginRepository.authorize("catmin", "tok")).thenReturn(catminSession);
        when(loginRepository.isAdmin("catmin")).thenReturn(true);
        ResponseEntity<String> resp = adminController.createUser(
                Map.of("username", "kittens", "password", "pass123"), "catmin", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }

    // ── DELETE /admin/users/{targetUsername} ──────────────────────────────────

    @Test
    void deleteUser_nonAdmin_returns403() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(straySession);
        when(loginRepository.isAdmin("whiskers")).thenReturn(false);
        ResponseEntity<String> resp = adminController.deleteUser("mittens", "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void deleteUser_selfDelete_returns400() throws Exception {
        when(loginRepository.authorize("catmin", "tok")).thenReturn(catminSession);
        when(loginRepository.isAdmin("catmin")).thenReturn(true);
        ResponseEntity<String> resp = adminController.deleteUser("catmin", "catmin", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody()).contains("own account");
    }

    @Test
    void deleteUser_targetIsAdmin_returns400() throws Exception {
        when(loginRepository.authorize("catmin", "tok")).thenReturn(catminSession);
        when(loginRepository.isAdmin("catmin")).thenReturn(true);
        when(jdbc.queryForList(anyString(), eq(Boolean.class), eq("othercatmin")))
                .thenReturn(List.of(true));
        ResponseEntity<String> resp = adminController.deleteUser("othercatmin", "catmin", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody()).containsIgnoringCase("admin");
    }

    // ── PUT /admin/users/{targetUsername}/admin ────────────────────────────────

    @Test
    void setAdmin_nonAdmin_returns403() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(straySession);
        when(loginRepository.isAdmin("whiskers")).thenReturn(false);
        ResponseEntity<String> resp = adminController.setAdmin("mittens", Map.of("isAdmin", true), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(jdbc, never()).update(anyString(), eq(true), anyString());
    }

    @Test
    void setAdmin_admin_updatesFlag() throws Exception {
        when(loginRepository.authorize("catmin", "tok")).thenReturn(catminSession);
        when(loginRepository.isAdmin("catmin")).thenReturn(true);
        ResponseEntity<String> resp = adminController.setAdmin("whiskers", Map.of("isAdmin", true), "catmin", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    // ── GET /admin/role-limits ────────────────────────────────────────────────

    @Test
    void getRoleLimits_nonAdmin_returns403() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(straySession);
        when(loginRepository.isAdmin("whiskers")).thenReturn(false);
        ResponseEntity<List<Map<String, Object>>> resp = adminController.getRoleLimits("whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void getRoleLimits_admin_returns200() throws Exception {
        when(loginRepository.authorize("catmin", "tok")).thenReturn(catminSession);
        when(loginRepository.isAdmin("catmin")).thenReturn(true);
        when(jdbc.queryForList(anyString())).thenReturn(List.of());
        ResponseEntity<List<Map<String, Object>>> resp = adminController.getRoleLimits("catmin", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    // ── PUT /admin/users/{targetUsername}/role ────────────────────────────────

    @Test
    void setUserRole_nonAdmin_returns403() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(straySession);
        when(loginRepository.isAdmin("whiskers")).thenReturn(false);
        ResponseEntity<String> resp = adminController.setUserRole("mittens", Map.of("role", "trusted"), "whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void setUserRole_invalidRole_returns400() throws Exception {
        when(loginRepository.authorize("catmin", "tok")).thenReturn(catminSession);
        when(loginRepository.isAdmin("catmin")).thenReturn(true);
        ResponseEntity<String> resp = adminController.setUserRole("whiskers", Map.of("role", "superuser"), "catmin", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void setUserRole_frozenRole_evictsSession() throws Exception {
        when(loginRepository.authorize("catmin", "tok")).thenReturn(catminSession);
        when(loginRepository.isAdmin("catmin")).thenReturn(true);
        ResponseEntity<String> resp = adminController.setUserRole("whiskers", Map.of("role", "frozen"), "catmin", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(loginRepository).evictSession("whiskers");
    }

    @Test
    void setUserRole_nonFrozenRole_doesNotEvict() throws Exception {
        when(loginRepository.authorize("catmin", "tok")).thenReturn(catminSession);
        when(loginRepository.isAdmin("catmin")).thenReturn(true);
        adminController.setUserRole("whiskers", Map.of("role", "trusted"), "catmin", "tok");
        verify(loginRepository, never()).evictSession(anyString());
    }

    // ── GET /admin/stats ──────────────────────────────────────────────────────

    @Test
    void getStats_nonAdmin_returns403() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(straySession);
        when(loginRepository.isAdmin("whiskers")).thenReturn(false);
        ResponseEntity<Map<String, Object>> resp = adminController.getStats("whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void getStats_admin_returns200WithKeys() throws Exception {
        when(loginRepository.authorize("catmin", "tok")).thenReturn(catminSession);
        when(loginRepository.isAdmin("catmin")).thenReturn(true);
        when(jdbc.queryForObject(anyString(), eq(Integer.class))).thenReturn(0);
        when(jdbc.queryForObject(anyString(), eq(Long.class))).thenReturn(0L);
        ResponseEntity<Map<String, Object>> resp = adminController.getStats("catmin", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsKeys("totalUsers", "totalPosts", "totalComments");
    }

    // ── DELETE /admin/uploads/orphans ─────────────────────────────────────────

    @Test
    void cleanupOrphans_nonAdmin_returns403() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(straySession);
        when(loginRepository.isAdmin("whiskers")).thenReturn(false);
        ResponseEntity<Map<String, Object>> resp = adminController.cleanupOrphanUploads("whiskers", "tok");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }
}
