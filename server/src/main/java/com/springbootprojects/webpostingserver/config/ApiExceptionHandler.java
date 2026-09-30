package com.springbootprojects.webpostingserver.config;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingRequestCookieException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Answers for requests that fail before a controller method runs.
 *
 * Most endpoints take the login cookies as required parameters. Without this,
 * a signed-out visitor calling one got a 400 Bad Request and a warning in the
 * log for every call — the wrong status, and noise that hides real problems.
 * Not being signed in is a 401.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(MissingRequestCookieException.class)
    public ResponseEntity<String> notSignedIn(MissingRequestCookieException e) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Sign in to do that.");
    }
}
