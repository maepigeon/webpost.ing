package com.springbootprojects.webpostingserver.posts.model;

import org.springframework.http.HttpStatus;

import java.time.LocalDate;
import java.util.Date;

/**
 * Represents an auth token
 */
public class AuthSession {
    public String username;
    public String token;
    public LocalDate expires;
    public HttpStatus loginHttpStatusCodeResult;
    public AuthSession(String username) {
        this.username = username;
    }
}
