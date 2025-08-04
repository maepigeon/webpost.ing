package com.springbootprojects.webpostingserver.posts.repository;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;

public interface LoginRepository {
    AuthSession login(LoginInfo loginInfo);
    boolean logout(String username, String token);
    int authenticate(String username, String password);
    AuthSession authorize(String username, String token);
}