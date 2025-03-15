package com.springbootprojects.webpostingserver.user.model;

import com.springbootprojects.webpostingserver.posts.model.Post;

public class User {
    private long id;
    private String username;
    private String displayName;
    private String email;
    private String password;
    private Post[] posts;
    private Post[] starredPosts;
    private Post[] bookmarkedPosts;
    private User[] following;
    private User[] followers;
    private User[] friends;
    private String userType;
}
