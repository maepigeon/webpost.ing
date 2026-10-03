package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.service.BuildCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * The admin panel's "is there a newer build" check (see BuildCheck). Admin
 * only, checked the same way as every route of AdminController.
 */
@RestController
@RequestMapping("/api/admin/build")
public class BuildController {

    @Autowired private LoginRepository loginRepository;
    @Autowired private BuildCheck buildCheck;

    private boolean isAdmin(String username, String token) {
        AuthSession session;
        try { session = loginRepository.authorize(username, token); }
        catch (JdbcLoginRepository.TokenExpiredException e) { return false; }
        return session != null && loginRepository.isAdmin(username);
    }

    /** { available: false } or { available, repo, behind, latest }; `commit` is the live build's commit. */
    @GetMapping("/latest")
    public ResponseEntity<Map<String, Object>> latest(
            @CookieValue(name = "username") String username,
            @CookieValue(name = "authToken") String token,
            @RequestParam(name = "commit", defaultValue = "") String commit) {

        if (!isAdmin(username, token)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        return ResponseEntity.ok(buildCheck.latest(commit));
    }
}
