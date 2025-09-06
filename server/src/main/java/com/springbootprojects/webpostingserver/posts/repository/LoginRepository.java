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
    public ResponseEntity<Object> deleteCookie();
}