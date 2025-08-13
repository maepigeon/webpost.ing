package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.stream.Collectors;

@CrossOrigin(origins = "http://localhost:5173", allowCredentials = "true")
@RestController
@RequestMapping("/api")
public class AuthController {

    @Autowired
    LoginRepository loginRepository;

    @PostMapping("logoutSessionAttempt")
    public ResponseEntity<Object> logoutSessionAttempt(@CookieValue(name = "username") String username, @CookieValue(name = "authToken") String token, HttpServletResponse response) {
        AuthSession loginResult = loginRepository.authorize(username, token);
        if (loginResult != null) {
            loginRepository.logout(username, token);
        }

        HttpCookie tokenCookie = ResponseCookie.from("authToken", "token")
                .httpOnly(true)
                .sameSite("None")
                .secure(true)
                .path("/")
                .maxAge(0)
                .build();
        HttpCookie usernameCookie = ResponseCookie.from("username", "username")
                .httpOnly(true)
                .sameSite("None")
                .secure(true)
                .path("/")
                .maxAge(0)
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, tokenCookie.toString())
                .header(HttpHeaders.SET_COOKIE, usernameCookie.toString())
                .body("");
    }

    @PostMapping("/authorizeSession")
    public ResponseEntity<Object> authorizeSession(@CookieValue(name = "username") String username, @CookieValue(name = "authToken") String token, HttpServletResponse response) {
        AuthSession loginResult = loginRepository.authorize(username, token);
        if (loginResult != null) {
            return ResponseEntity.ok()
                    .body(username);
        } else {
            return ResponseEntity.ok()
                    .body("");
        }
    }


    @PostMapping("/loginSessionAttempt")
    public ResponseEntity<Object> loginSessionAttempt(@RequestBody LoginInfo loginInfo, HttpServletResponse response) {
        AuthSession loginResult = loginRepository.login(loginInfo);
        try {
            switch (loginResult.loginHttpStatusCodeResult) {
                case HttpStatus.FORBIDDEN:
                    return new ResponseEntity<>("Failed to authenticate: Incorrect login information, loginResult: ." + loginResult, HttpStatus.FORBIDDEN);
                case HttpStatus.OK:
                    System.out.println("AUTHENTICATION OK!! : Logging in user: " + loginInfo.getUsername());
                    HttpCookie tokenCookie = ResponseCookie.from("authToken", loginResult.token)
                            .httpOnly(true)
                            .sameSite("None")
                            .secure(true)
                            .path("/")
                            .maxAge(60 * 60 * 24)
                            .build();
                    HttpCookie usernameCookie = ResponseCookie.from("username", loginResult.username)
                            .httpOnly(true)
                            .sameSite("None")
                            .secure(true)
                            .path("/")
                            .maxAge(60 * 60 * 24)
                            .build();
                    System.out.println("AUTHENTICATION OK!! : Logging in user: " + loginResult.username);
                    return ResponseEntity.ok()
                            .header(HttpHeaders.SET_COOKIE, tokenCookie.toString())
                            .header(HttpHeaders.SET_COOKIE, usernameCookie.toString())
                            .body(loginResult.username);
                default:
                    return new ResponseEntity<>("Failed to authenticate:  Bad request, loginResult: " + loginResult, HttpStatus.BAD_REQUEST);
            }

        } catch (Exception e) {
            System.out.println("Internal server error (500): " + e.toString());
            return new ResponseEntity<>(null, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

}