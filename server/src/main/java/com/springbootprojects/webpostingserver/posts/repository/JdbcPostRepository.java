package com.springbootprojects.webpostingserver.posts.repository;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.model.Post;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.IncorrectResultSizeDataAccessException;
import org.springframework.jdbc.core.BeanPropertyRowMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcPostRepository implements PostRepository {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // Explicit mapper so background_pattern (snake_case) is always read correctly
    private static final RowMapper<Post> POST_MAPPER = (rs, rowNum) -> {
        Post p = new Post();
        p.setId(rs.getInt("id"));
        p.setTitle(rs.getString("title"));
        p.setDescription(rs.getString("description"));
        p.setPublished(rs.getBoolean("published"));
        p.setDate(rs.getTimestamp("date"));
        p.setBackgroundPattern(rs.getString("background_pattern"));
        return p;
    };

    public List<Post> getPostsFromUsername(String username) {
        return jdbcTemplate.query(
            "SELECT post.id, post.title, post.description, post.published, post.date, post.background_pattern " +
            "FROM posts post " +
            "INNER JOIN users_posts_junctions junction ON junction.post_id = post.id " +
            "INNER JOIN users selected_user ON selected_user.id = junction.user_id " +
            "WHERE selected_user.username = ?;",
            POST_MAPPER, username);
    }

    public LoginInfo getUsernameFromPostId(int postId) {
        return jdbcTemplate.queryForObject(
                "SELECT selected_user.* " +
                "FROM users selected_user " +
                "INNER JOIN users_posts_junctions junction ON junction.user_id = selected_user.id " +
                "INNER JOIN posts post ON post.id = junction.post_id " +
                "WHERE post.id = ?;", BeanPropertyRowMapper.newInstance(LoginInfo.class), postId);
    }

    @Override
    public int save(Post post, int userId) {
        System.out.println("Saving post: " + post.getTitle() + " published: " + post.isPublished());

        final String INSERT_SQL = "INSERT INTO posts (title, description, published, background_pattern) VALUES(?,?,?,?) RETURNING \"id\";";
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(
                new PreparedStatementCreator() {
                    public PreparedStatement createPreparedStatement(Connection connection) throws SQLException {
                        PreparedStatement ps = connection.prepareStatement(INSERT_SQL, new String[] {"id"});
                        ps.setString(1, post.getTitle());
                        ps.setString(2, post.getDescription());
                        ps.setBoolean(3, post.isPublished());
                        ps.setString(4, post.getBackgroundPattern());
                        return ps;
                    }
                },
                keyHolder);
        post.setId((int) keyHolder.getKey());

        System.out.println("Saved post id=" + post.getId() + " for user=" + userId);
        jdbcTemplate.update(
            "INSERT INTO users_posts_junctions (\"post_id\", \"user_id\") VALUES(?,?);",
            post.getId(), userId);

        return (int) post.getId();
    }

    @Override
    public int update(Post post) {
        return jdbcTemplate.update(
            "UPDATE posts SET title=?, description=?, published=?, background_pattern=? WHERE id=?",
            post.getTitle(), post.getDescription(), post.isPublished(),
            post.getBackgroundPattern(), post.getId());
    }

    @Override
    public Post findById(Long id) {
        try {
            return jdbcTemplate.queryForObject(
                "SELECT id, title, description, published, date, background_pattern FROM posts WHERE id=?",
                POST_MAPPER, id);
        } catch (IncorrectResultSizeDataAccessException e) {
            return null;
        }
    }

    @Override
    public int deleteById(Long id) {
        jdbcTemplate.update("DELETE FROM users_posts_junctions WHERE post_id=?", id);
        return jdbcTemplate.update("DELETE FROM posts WHERE id=?", id);
    }

    @Override
    public List<Post> findAll() {
        return jdbcTemplate.query(
            "SELECT id, title, description, published, date, background_pattern FROM posts",
            POST_MAPPER);
    }

    @Override
    public List<Post> findByPublished(boolean published) {
        return jdbcTemplate.query(
            "SELECT id, title, description, published, date, background_pattern FROM posts WHERE published=?",
            POST_MAPPER, published);
    }

    @Override
    public List<Post> findByTitleContaining(String title) {
        return jdbcTemplate.query(
            "SELECT id, title, description, published, date, background_pattern FROM posts WHERE title ILIKE ?",
            POST_MAPPER, "%" + title + "%");
    }

    @Override
    public int deleteAll() {
        return jdbcTemplate.update("DELETE from posts");
    }
}
