package com.springbootprojects.webpostingserver.posts.repository;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import org.springframework.http.ResponseEntity;

import java.util.List;

public interface LoginRepository {
    AuthSession login(LoginInfo loginInfo);
    boolean logout(String username, String token);
    int authenticate(String username, String password);
    AuthSession authorize(String username, String token) throws JdbcLoginRepository.TokenExpiredException;
    public ResponseEntity<String> deleteCookie();
    public String getUserBackground(String username);
    public void updateUserBackground(String username, String pattern);
    public String getUserBio(String username);
    public void updateUserBio(String username, String bio);
    public boolean isAdmin(String username);

    /**
     * Ends every session belonging to a user.
     *
     * Used when an account is frozen or deleted, and after a password reset —
     * whoever reset it may be locking an intruder out, so any session the
     * intruder holds has to die with the old password.
     */
    public void evictSession(String username);

    /**
     * Clears the session cookies and returns them with the given status and
     * body — used to reject a dead session with a 401 rather than the 200 that
     * {@code deleteCookie()} returns.
     */
    public org.springframework.http.ResponseEntity<String> expireCookies(
            org.springframework.http.HttpStatus status, String body);
    public void touchLastVisited(String username);
    public String getUserPresets(String username);
    public void updateUserPresets(String username, String presetsJson);
    public long getPresetsStorageBytes(String username);
    public String getUserBioLinks(String username);
    public void updateUserBioLinks(String username, String bioLinksJson);
    public void deleteUser(String username);

    /** How many live sessions the account has (this one included). */
    public int countSessions(String username);

    /** Ends every session of the account except the one with {@code keepToken}; returns how many were ended. */
    public int endOtherSessions(String username, String keepToken);
}