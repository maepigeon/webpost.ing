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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class JdbcPostRepository implements PostRepository {

    private static final Logger log = LoggerFactory.getLogger(JdbcPostRepository.class);

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
        p.setFolder(rs.getString("folder"));
        p.setSlug(rs.getString("slug"));
        return p;
    };

    public List<Post> getPostsFromUsername(String username) {
        return jdbcTemplate.query(
            "SELECT post.id, post.title, post.description, post.published, post.date, post.background_pattern, post.folder, post.slug " +
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
    /**
     * Creates a post and records its author.
     *
     * Transactional because these are two statements: the row in `posts` and
     * the ownership row in `users_posts_junctions`. Without it, a failure
     * between them leaves a post with no author — invisible on every profile,
     * failing every ownership check, so nobody can edit or delete it. Half the
     * posts in one development database were in exactly that state.
     */
    @Transactional
    public int save(Post post, int userId) {
        log.debug("Saving post \"{}\" (published={})", post.getTitle(), post.isPublished());

        final String INSERT_SQL = "INSERT INTO posts (title, description, published, background_pattern, folder, slug) VALUES(?,?,?,?,?,?) RETURNING \"id\";";
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(
                new PreparedStatementCreator() {
                    public PreparedStatement createPreparedStatement(Connection connection) throws SQLException {
                        PreparedStatement ps = connection.prepareStatement(INSERT_SQL, new String[] {"id"});
                        ps.setString(1, post.getTitle());
                        ps.setString(2, post.getDescription());
                        ps.setBoolean(3, post.isPublished());
                        ps.setString(4, post.getBackgroundPattern());
                        ps.setString(5, post.getFolder());
                        ps.setString(6, post.getSlug());
                        return ps;
                    }
                },
                keyHolder);
        post.setId((int) keyHolder.getKey());

        jdbcTemplate.update(
            "INSERT INTO users_posts_junctions (\"post_id\", \"user_id\") VALUES(?,?);",
            post.getId(), userId);

        return (int) post.getId();
    }

    @Override
    public int update(Post post) {
        return jdbcTemplate.update(
            "UPDATE posts SET title=?, description=?, published=?, background_pattern=?, folder=?, slug=? WHERE id=?",
            post.getTitle(), post.getDescription(), post.isPublished(),
            post.getBackgroundPattern(), post.getFolder(), post.getSlug(), post.getId());
    }

    @Override
    public Post findById(Long id) {
        try {
            return jdbcTemplate.queryForObject(
                "SELECT id, title, description, published, date, background_pattern, folder, slug FROM posts WHERE id=?",
                POST_MAPPER, id);
        } catch (IncorrectResultSizeDataAccessException e) {
            return null;
        }
    }

    /**
     * Transactional for the same reason as save: dropping the ownership row and
     * then failing to drop the post would leave an authorless orphan.
     */
    @Override
    @Transactional
    public int deleteById(Long id) {
        jdbcTemplate.update("DELETE FROM users_posts_junctions WHERE post_id=?", id);
        return jdbcTemplate.update("DELETE FROM posts WHERE id=?", id);
    }
}
