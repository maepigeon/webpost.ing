package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.service.PreviewSweep;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * The admin's view of the card-preview sweep (PreviewSweep): how many posts
 * still wait, and a way to run a batch at once. Admin only, checked the same
 * way as every route of AdminController.
 */
@RestController
@RequestMapping("/api/admin/previews")
public class PreviewAdminController {

    @Autowired private LoginRepository loginRepository;
    @Autowired private PreviewSweep sweep;

    private boolean isAdmin(String username, String token) {
        AuthSession session;
        try { session = loginRepository.authorize(username, token); }
        catch (JdbcLoginRepository.TokenExpiredException e) { return false; }
        return session != null && loginRepository.isAdmin(username);
    }

    /** { version, remaining, processed, tooBig, failed, lastError, lastRunAt }. */
    @GetMapping
    public ResponseEntity<Map<String, Object>> status(
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        if (!isAdmin(username, token)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        return ResponseEntity.ok(sweep.status());
    }

    /** Runs one batch now and returns the status after it. */
    @PostMapping("/run")
    public ResponseEntity<Map<String, Object>> run(
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token) {

        if (!isAdmin(username, token)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        return ResponseEntity.ok(sweep.runNow());
    }
}
