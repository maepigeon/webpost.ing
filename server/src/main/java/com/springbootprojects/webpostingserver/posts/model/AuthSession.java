package com.springbootprojects.webpostingserver.posts.model;

import org.springframework.http.HttpStatus;

import java.time.Instant;

/**
 * A logged-in session: the bearer token handed to the client plus the identity
 * and validity window the server checks it against.
 *
 * Expiry is tracked as two Instants rather than a LocalDate. A date-based
 * expiry gave every session a validity of "until the end of some day", so a
 * session created at 23:59 lived for one minute and one created at 00:01 lived
 * for nearly two days, and an abandoned session stayed usable for the rest of
 * the day no matter how long it sat idle.
 */
public class AuthSession {
    public String username;
    public String token;

    /** Hard cut-off: the session is dead at this point no matter how active. */
    public Instant expiresAt;

    /** Rolling cut-off, pushed forward on each authorized request. */
    public Instant idleExpiresAt;

    public HttpStatus loginHttpStatusCodeResult;
    public int userId;
    public String role = "user";

    public AuthSession(String username) {
        this.username = username;
    }

    public boolean isExpired(Instant now) {
        return (expiresAt != null && now.isAfter(expiresAt))
            || (idleExpiresAt != null && now.isAfter(idleExpiresAt));
    }
}
