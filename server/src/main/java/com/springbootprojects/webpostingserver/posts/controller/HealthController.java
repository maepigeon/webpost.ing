package com.springbootprojects.webpostingserver.posts.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * GET /api/health: 200 when the server is up and can reach its database,
 * 503 when it cannot.
 *
 * For the release script's check after a restart, and for uptime monitoring.
 * Those used to probe particular posts (/api/posts/3, /api/posts/8), which
 * broke the moment the owner deleted one. Public, cheap, and says nothing
 * about the database beyond whether it answered.
 */
@RestController
@RequestMapping("/api")
public class HealthController {

    @Autowired JdbcTemplate jdbc;

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            return ResponseEntity.ok(Map.of("status", "ok", "database", "ok"));
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("status", "unavailable", "database", "unreachable"));
        }
    }
}
