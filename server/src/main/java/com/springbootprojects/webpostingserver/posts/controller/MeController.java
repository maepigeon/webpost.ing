package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.SocialRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * The signed-in tab's poll: unread counts for the badges, in one request, and
 * the "last active" heartbeat as a side effect (so the client needs no timer
 * of its own for it).
 */
@RestController
@RequestMapping("/api/me")
public class MeController {

    // At most one write per user per minute, decided in SQL so several tabs
    // (and several servers' worth of clock) cannot defeat it.
    private static final String HEARTBEAT_SQL =
        "UPDATE users SET last_active_at = NOW() WHERE id = ? " +
        "AND (last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '1 minute')";

    @Autowired private LoginRepository loginRepository;
    @Autowired private SocialRepository social;
    @Autowired private JdbcTemplate jdbc;

    @GetMapping("/counters")
    public ResponseEntity<Map<String, Integer>> counters(
            @CookieValue(name = "username") String authUsername,
            @CookieValue(name = "authToken") String token,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {

        AuthSession session;
        try {
            session = loginRepository.authorize(authUsername, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            session = null;
        }
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        // Presence is best effort: a failed write must not hide the badges.
        try { jdbc.update(HEARTBEAT_SQL, session.userId); } catch (RuntimeException ignored) { }

        int messages = social.getUnreadMessageCount(session.userId)
                     + social.getTotalGroupUnreadCount(session.userId);
        int notifications = social.getUnreadCount(session.userId);

        String etag = "\"" + messages + "-" + notifications + "\"";
        ResponseEntity.BodyBuilder reply = ResponseEntity.status(HttpStatus.OK)
            .eTag(etag)
            // Revalidate every time (that is the point of the ETag), never share.
            .header(HttpHeaders.CACHE_CONTROL, "private, no-cache");
        if (matches(ifNoneMatch, etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED)
                .eTag(etag).header(HttpHeaders.CACHE_CONTROL, "private, no-cache").build();
        }
        return reply.body(Map.of("messages", messages, "notifications", notifications));
    }

    /** True when the If-None-Match header lists this tag (weak or strong) or is "*". */
    private static boolean matches(String header, String etag) {
        if (header == null || header.isBlank()) return false;
        for (String part : header.split(",")) {
            String tag = part.trim();
            if (tag.equals("*")) return true;
            if (tag.startsWith("W/")) tag = tag.substring(2);
            if (tag.equals(etag)) return true;
        }
        return false;
    }
}
