package com.springbootprojects.webpostingserver.posts.repository;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;

public interface LoginRepository {
    AuthSession login(LoginInfo loginInfo);
}