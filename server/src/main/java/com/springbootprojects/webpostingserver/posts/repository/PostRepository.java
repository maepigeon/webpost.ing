package com.springbootprojects.webpostingserver.posts.repository;

import java.util.List;

import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.model.Post;

public interface PostRepository {
    int save(Post post, int userId);

    int update(Post post);

    Post findById(Long id);

    public LoginInfo getUsernameFromPostId(int postId);

    List<Post> getPostsFromUsername(String username);

    int deleteById(Long id);

    List<Post> findAll();

    List<Post> findByPublished(boolean published);

    List<Post> findByTitleContaining(String title);

    int deleteAll();
}