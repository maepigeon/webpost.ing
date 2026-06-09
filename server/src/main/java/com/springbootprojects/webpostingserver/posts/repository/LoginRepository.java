package com.springbootprojects.webpostingserver.posts.repository;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.model.User;
import org.springframework.http.ResponseEntity;

import java.util.List;

public interface LoginRepository {
    AuthSession login(LoginInfo loginInfo);
    boolean logout(String username, String token);
    int authenticate(String username, String password);
    AuthSession authorize(String username, String token) throws JdbcLoginRepository.TokenExpiredException;
    public List<User> getAllUsers();
    public ResponseEntity<String> deleteCookie();
    public String getUserBackground(String username);
    public void updateUserBackground(String username, String pattern);
    public String getUserBio(String username);
    public void updateUserBio(String username, String bio);
    public boolean isAdmin(String username);
    public void touchLastVisited(String username);
    public String getUserPresets(String username);
    public void updateUserPresets(String username, String presetsJson);
    public long getPresetsStorageBytes(String username);
    public String getUserBioLinks(String username);
    public void updateUserBioLinks(String username, String bioLinksJson);
    public void deleteUser(String username);
}