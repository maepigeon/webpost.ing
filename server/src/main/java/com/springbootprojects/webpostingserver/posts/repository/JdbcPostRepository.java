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
        p.setSortOrder(rs.getInt("sort_order"));
        return p;
    };

    /**
     * Position order: the author's arrangement, then newest first among posts
     * sharing a position (a new post has position 0, so it lands at the top),
     * then id, so the order is total.
     */
    private static final String PROFILE_ORDER = "ORDER BY post.sort_order, post.date DESC, post.id DESC";

    /**
     * An author's posts in the order their profile shows them, which is what
     * pages of the profile are sliced from.
     *
     * The profile draws a folder where its first post would be, with all its
     * posts together. Ordering post by post put a folder's posts wherever their
     * positions fell, so a later page would add posts to a folder far above
     * the reader and change its count. Here each folder is one block, placed
     * by its first post, with its posts in order inside it; a post in no
     * folder is a block of one.
     */
    public List<Post> getPostsFromUsername(String username) {
        return jdbcTemplate.query("""
            SELECT id, title, description, published, date, background_pattern, folder, slug, sort_order
              FROM (
                SELECT post.*,
                       first_value(post.sort_order) OVER block AS block_sort,
                       first_value(post.date)       OVER block AS block_date,
                       first_value(post.id)         OVER block AS block_id
                  FROM posts post
                  JOIN users_posts_junctions junction ON junction.post_id = post.id
                  JOIN users selected_user ON selected_user.id = junction.user_id
                 WHERE selected_user.username = ?
                WINDOW block AS (
                  PARTITION BY NULLIF(post.folder, ''),
                               CASE WHEN NULLIF(post.folder, '') IS NULL THEN post.id END
                  ORDER BY post.sort_order, post.date DESC, post.id DESC)
              ) post
             ORDER BY block_sort, block_date DESC, block_id DESC,
                      post.sort_order, post.date DESC, post.id DESC
            """, POST_MAPPER, username);
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

        // A new post starts in its author's current theme, then keeps its own:
        // changing the profile theme later does not restyle it (V009).
        jdbcTemplate.update(
            "UPDATE posts SET page_theme = (SELECT page_theme FROM users WHERE id = ?) WHERE id = ?",
            userId, post.getId());

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
                "SELECT id, title, description, published, date, background_pattern, folder, slug, sort_order FROM posts WHERE id=?",
                POST_MAPPER, id);
        } catch (IncorrectResultSizeDataAccessException e) {
            return null;
        }
    }

    /**
     * Rearranges an author's posts.
     *
     * {@code orderedIds} is the order the author sees, top first; each gets
     * that position and, from {@code folders}, its folder (null for none). The
     * author's posts missing from the list keep their relative order and go
     * after it. The client sends only the posts it has loaded, which are
     * always the top of the profile, so the rest belong below them. Numbering
     * them too is what stops a saved order colliding with posts further down,
     * which had shuffled them into each other and repeated posts across pages.
     *
     * Ids of other people's posts are ignored. The author's rows are locked
     * first, so two saves in quick succession apply one after the other rather
     * than interleaving.
     *
     * @return how many of the requested posts were rearranged
     */
    @Override
    @Transactional
    public int reorder(int userId, List<Integer> orderedIds, java.util.Map<Integer, String> folders) {
        List<Integer> current = jdbcTemplate.queryForList(
            "SELECT post.id FROM posts post " +
            "JOIN users_posts_junctions junction ON junction.post_id = post.id " +
            "WHERE junction.user_id = ? " + PROFILE_ORDER + " FOR UPDATE OF post",
            Integer.class, userId);

        java.util.Set<Integer> owned = new java.util.HashSet<>(current);
        java.util.LinkedHashSet<Integer> requested = new java.util.LinkedHashSet<>();
        for (Integer id : orderedIds) if (id != null && owned.contains(id)) requested.add(id);

        List<Object[]> moved = new java.util.ArrayList<>();
        List<Object[]> rest = new java.util.ArrayList<>();
        int position = 0;
        for (Integer id : requested) moved.add(new Object[] { position++, folders.get(id), id });
        for (Integer id : current) if (!requested.contains(id)) rest.add(new Object[] { position++, id });

        if (!moved.isEmpty()) jdbcTemplate.batchUpdate("UPDATE posts SET sort_order=?, folder=? WHERE id=?", moved);
        if (!rest.isEmpty()) jdbcTemplate.batchUpdate("UPDATE posts SET sort_order=? WHERE id=?", rest);
        return moved.size();
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
