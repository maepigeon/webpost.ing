package com.springbootprojects.webpostingserver.posts.repository;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.BeanPropertyRowMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;


import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;

@Repository
public class JdbcLoginRepository implements LoginRepository {

    /**
     * Maps usernames to authentication token data
     */
    private static HashMap<String, AuthSession> loginMap = new HashMap<>();

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private static final SecureRandom secureRandom = new SecureRandom(); //threadsafe
    private static final Base64.Encoder base64Encoder = Base64.getUrlEncoder(); //threadsafe

    private static String generateNewToken() {
        byte[] randomBytes = new byte[24];
        secureRandom.nextBytes(randomBytes);
        return base64Encoder.encodeToString(randomBytes);
    }

    private boolean isTokenExpired(AuthSession authSession) {
        return LocalDate.now().compareTo(authSession.expires) > 0;
    }


    // Attempts to log the user out
    public boolean logout(String username, String token) {
        try {
            AuthSession authSession = authorize(username, token);
            if (authSession != null) {
                System.out.println("Logged out " + username + " and removed corresponding server session");
                loginMap.remove(username);
                return true;
            }
        } catch (Exception ex) {
                System.out.println("Tried to log out user " + username + " but no login session found on server. Attempting to delete cookie. Exception: " + ex.getMessage());
        }
        return false;
    }


    /**
     *
     * @param username
     * @param password
     * @return
     */
    public int authenticate(String username, String password) {
        List<LoginInfo> loginInfo = jdbcTemplate.query("SELECT userdata.* from users userdata WHERE userdata.username = ? AND userdata.password = ?;",
                BeanPropertyRowMapper.newInstance(LoginInfo.class), username, password);
        // If the user is authenticated, store a new auth token in the map of logged in users
        if (loginInfo.isEmpty()) {
            return -1;
        }
        else if (loginInfo.size() > 1) {
            System.out.println("Invalid login size: " + loginInfo.size() + "please review database- contains duplicate users.");
            return -1;
        } else {
            return loginInfo.getFirst().getID();
        }
    }

    /**
     * Return whether the user is authorized to access the resource
     * @param username
     * @param token
     * @return
     */
    public AuthSession authorize(String username, String token) {
        //get the user's authorization token
        AuthSession authSession;
        try {
            authSession = loginMap.get(username);
        } catch (Exception e) {
            System.out.println("Username " + username + " not found. " + e.getMessage());
            return null;
        }
        if (authSession == null) {
            return null;
        }
        //check token expiration
        if (isTokenExpired(authSession)) {
            logout(username, token);
            return null;
        }
        //authorize action if not expired and token matches server
        if (authSession.token.equals(token)) {
            System.out.println("Authorized user " + username + " to do something");
            return authSession;
        } else {
            return null;
        }
    }


    /**
     * Attempts to log in the user, adds a session token and http result to the LoginInfo object
     * @param loginInfo - the login info object
     * @return
     */
    @Override
    public AuthSession login(LoginInfo loginInfo) {
        AuthSession authSession = new AuthSession(loginInfo.getUsername());
        authSession.expires = LocalDate.now().plusDays(1);
        authSession.token = "-1";


        if (loginInfo.getUsername().isEmpty() || loginInfo.getPassword().isEmpty()) {
            authSession.loginHttpStatusCodeResult = HttpStatus.BAD_REQUEST;
        }
        if (authenticate(loginInfo.getUsername(), loginInfo.getPassword()) > 0) {
            String authToken;
            if (loginMap.get(loginInfo.getUsername()) != null) {
                authToken = loginMap.get(loginInfo.getUsername()).token;
            } else {
                authToken = generateNewToken();
            }
            authSession.token = authToken;
            authSession.loginHttpStatusCodeResult = HttpStatus.OK;

            loginMap.put(loginInfo.getUsername(), authSession);

        } else {
            authSession.loginHttpStatusCodeResult = HttpStatus.FORBIDDEN;
        }
        return authSession;
    }
}