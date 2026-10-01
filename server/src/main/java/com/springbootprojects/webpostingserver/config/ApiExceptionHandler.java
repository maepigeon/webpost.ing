package com.springbootprojects.webpostingserver.config;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingRequestCookieException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
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

    /** Bigger than the upload limit (spring.servlet.multipart.max-file-size). */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<String> tooLarge(MaxUploadSizeExceededException e) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body("That file is too large.");
    }

    /**
     * A request missing a file or a field the endpoint needs, or an upload
     * that is not a file upload at all. These used to fall through to a 500,
     * which reads as a server fault when the request was simply incomplete.
     */
    @ExceptionHandler({ MultipartException.class, MissingServletRequestPartException.class,
            MissingServletRequestParameterException.class })
    public ResponseEntity<String> incomplete(Exception e) {
        return ResponseEntity.badRequest().body("The request is missing a file or a field.");
    }
}
