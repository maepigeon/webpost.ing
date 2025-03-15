package com.springbootprojects.webpostingserver.posts.repository;

import java.util.List;

import com.springbootprojects.webpostingserver.posts.model.Post;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.IncorrectResultSizeDataAccessException;
import org.springframework.jdbc.core.BeanPropertyRowMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcPostRepository implements PostRepository {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Override
    public int save(Post post) {
        return jdbcTemplate.update("INSERT INTO posts (title, description, published) VALUES(?,?,?)",
                new Object[] { post.getTitle(), post.getDescription(), post.isPublished() });
    }

    @Override
    public int update(Post post) {
        return jdbcTemplate.update("UPDATE posts SET title=?, description=?, published=? WHERE id=?",
                new Object[] { post.getTitle(), post.getDescription(), post.isPublished(), post.getId() });
    }

    @Override
    public Post findById(Long id) {
        try {
            Post post = jdbcTemplate.queryForObject("SELECT * FROM posts WHERE id=?",
                    BeanPropertyRowMapper.newInstance(Post.class), id);

            return post;
        } catch (IncorrectResultSizeDataAccessException e) {
            return null;
        }
    }

    @Override
    public int deleteById(Long id) {
        return jdbcTemplate.update("DELETE FROM posts WHERE id=?", id);
    }

    @Override
    public List<Post> findAll() {
        return jdbcTemplate.query("SELECT * from posts", BeanPropertyRowMapper.newInstance(Post.class));
    }

    @Override
    public List<Post> findByPublished(boolean published) {
        return jdbcTemplate.query("SELECT * from posts WHERE published=?",
                BeanPropertyRowMapper.newInstance(Post.class), published);
    }

    @Override
    public List<Post> findByTitleContaining(String title) {
        String q = "SELECT * from posts WHERE title ILIKE '%" + title + "%'";

        return jdbcTemplate.query(q, BeanPropertyRowMapper.newInstance(Post.class));
    }

    @Override
    public int deleteAll() {
        return jdbcTemplate.update("DELETE from posts");
    }
}