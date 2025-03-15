package com.springbootprojects.webpostingserver.posts.repository;

import java.util.List;

import com.springbootprojects.webpostingserver.posts.model.Post;

public interface PostRepository {
    int save(Post book);

    int update(Post book);

    Post findById(Long id);

    int deleteById(Long id);

    List<Post> findAll();

    List<Post> findByPublished(boolean published);

    List<Post> findByTitleContaining(String title);

    int deleteAll();
}