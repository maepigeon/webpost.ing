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
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcPostRepository implements PostRepository {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    public List<Post> getPostsFromUsername(String username) {
        return jdbcTemplate.query("SELECT post.* FROM posts post INNER JOIN users_posts_junctions junction ON " +
        "junction.post_id = post.id INNER JOIN users selected_user ON selected_user.id = junction.user_id WHERE selected_user.username = ?;",
        BeanPropertyRowMapper.newInstance(Post.class), username);
    }
    public LoginInfo getUsernameFromPostId(int postId) {
        return jdbcTemplate.queryForObject(
                "SELECT selected_user.* " +
                "FROM users selected_user " +
                "INNER JOIN users_posts_junctions junction ON junction.user_id = selected_user.id " +
                "INNER JOIN posts post ON post.id = junction.post_id " +
                "WHERE post.id = ?;", BeanPropertyRowMapper.newInstance(LoginInfo.class), postId);
    }

    /**
     * Saves a post to the database
     * @param post - the post to save to the database
     * @return the post ID
     */
    @Override
    public int save(Post post, int userId) {
        System.out.println("Saving post: " + post.getTitle() + "description: " + post.getDescription() + "published: " + post.isPublished());

        final String INSERT_SQL = "INSERT INTO posts (title, description, published) VALUES(?,?,?) RETURNING \"id\";";
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(
                new PreparedStatementCreator() {
                    public PreparedStatement createPreparedStatement(Connection connection) throws SQLException {
                        PreparedStatement ps =
                                connection.prepareStatement(INSERT_SQL, new String[] {"id"});
                        ps.setString(1, post.getTitle());
                        ps.setString(2, post.getDescription());
                        ps.setBoolean(3, post.isPublished());
                        return ps;
                    }
                },
                keyHolder);
        post.setId((int)keyHolder.getKey());

        System.out.println("Saving post with id: " + post.getId() + " by user " + userId);
        final String INSERT_JUNCTION_SQL = "INSERT INTO users_posts_junctions (\"post_id\", \"user_id\") VALUES(?,?);";
        jdbcTemplate.update(INSERT_JUNCTION_SQL, post.getId(), userId);

        return (int)post.getId();
    }

    /**
     * Updates the post's data in the database
     * @param post - the post to be updated
     * @return
     */
    @Override
    public int update(Post post) {
        return jdbcTemplate.update("UPDATE posts SET title=?, description=?, published=? WHERE id=?",
                new Object[] { post.getTitle(), post.getDescription(), post.isPublished(), post.getId() });
    }

    /**
     *
     * @param id`
     * @return
     */
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
        jdbcTemplate.update("DELETE FROM users_posts_junctions WHERE post_id=?", id);
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