package com.springbootprojects.webpostingserver.posts.repository;

import com.springbootprojects.webpostingserver.posts.model.Comment;
import com.springbootprojects.webpostingserver.posts.model.Notification;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.*;

@Repository
public class SocialRepository {

    @Autowired
    private JdbcTemplate jdbc;

    // ── Follows ───────────────────────────────────────────────────────────────

    public boolean isFollowing(int followerId, int followedId) {
        List<Integer> r = jdbc.queryForList(
            "SELECT 1 FROM follows WHERE follower_id=? AND followed_id=?", Integer.class, followerId, followedId);
        return !r.isEmpty();
    }

    public void follow(int followerId, int followedId) {
        jdbc.update("INSERT INTO follows(follower_id,followed_id) VALUES(?,?) ON CONFLICT DO NOTHING", followerId, followedId);
    }

    public void unfollow(int followerId, int followedId) {
        jdbc.update("DELETE FROM follows WHERE follower_id=? AND followed_id=?", followerId, followedId);
    }

    public List<String> getFollowers(int userId) {
        return jdbc.queryForList(
            "SELECT u.username FROM users u INNER JOIN follows f ON f.follower_id=u.id WHERE f.followed_id=?",
            String.class, userId);
    }

    public List<String> getFollowing(int userId) {
        return jdbc.queryForList(
            "SELECT u.username FROM users u INNER JOIN follows f ON f.followed_id=u.id WHERE f.follower_id=?",
            String.class, userId);
    }

    public int getUserIdByUsername(String username) {
        try {
            return jdbc.queryForObject("SELECT id FROM users WHERE username=?", Integer.class, username);
        } catch (EmptyResultDataAccessException e) { return -1; }
    }

    // ── Post reactions ────────────────────────────────────────────────────────

    /** Returns map of reaction → count for a post. */
    public Map<String, Integer> getReactions(int postId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT reaction, COUNT(*) AS cnt FROM post_reactions WHERE post_id=? GROUP BY reaction", postId);
        Map<String, Integer> m = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) m.put((String) r.get("reaction"), ((Number) r.get("cnt")).intValue());
        return m;
    }

    /** Returns all reactions the given user has set on a post. */
    public List<String> getUserReactions(int postId, int userId) {
        return jdbc.queryForList(
            "SELECT reaction FROM post_reactions WHERE post_id=? AND user_id=?", String.class, postId, userId);
    }

    /** Toggles a reaction: adds it if absent, removes it if present. */
    public void toggleReaction(int postId, int userId, String reaction) {
        int deleted = jdbc.update(
            "DELETE FROM post_reactions WHERE post_id=? AND user_id=? AND reaction=?", postId, userId, reaction);
        if (deleted == 0) {
            jdbc.update(
                "INSERT INTO post_reactions(post_id,user_id,reaction) VALUES(?,?,?) ON CONFLICT DO NOTHING",
                postId, userId, reaction);
        }
    }

    public void removeReaction(int postId, int userId, String reaction) {
        jdbc.update("DELETE FROM post_reactions WHERE post_id=? AND user_id=? AND reaction=?", postId, userId, reaction);
    }

    // ── Discussions ───────────────────────────────────────────────────────────

    public int getOrCreateDiscussion(int postId) {
        List<Integer> existing = jdbc.queryForList(
            "SELECT id FROM discussions WHERE post_id=?", Integer.class, postId);
        if (!existing.isEmpty()) return existing.get(0);
        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(c -> {
            PreparedStatement ps = c.prepareStatement(
                "INSERT INTO discussions(post_id) VALUES(?) RETURNING id", Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, postId);
            return ps;
        }, kh);
        return kh.getKey().intValue();
    }

    public boolean isDiscussionEnabled(int postId) {
        List<Boolean> r = jdbc.queryForList(
            "SELECT enabled FROM discussions WHERE post_id=?", Boolean.class, postId);
        return !r.isEmpty() && r.get(0);
    }

    public boolean isReactionsEnabled(int postId) {
        List<Boolean> r = jdbc.queryForList(
            "SELECT reactions_enabled FROM discussions WHERE post_id=?", Boolean.class, postId);
        return !r.isEmpty() && r.get(0);
    }

    public void setDiscussionEnabled(int postId, boolean enabled) {
        int updated = jdbc.update("UPDATE discussions SET enabled=? WHERE post_id=?", enabled, postId);
        if (updated == 0 && enabled) getOrCreateDiscussion(postId);
    }

    public void setReactionsEnabled(int postId, boolean enabled) {
        int updated = jdbc.update("UPDATE discussions SET reactions_enabled=? WHERE post_id=?", enabled, postId);
        if (updated == 0) {
            getOrCreateDiscussion(postId);
            jdbc.update("UPDATE discussions SET reactions_enabled=? WHERE post_id=?", enabled, postId);
        }
    }

    public String getDiscussionStyle(int postId) {
        List<String> r = jdbc.queryForList(
            "SELECT style FROM discussions WHERE post_id=?", String.class, postId);
        return r.isEmpty() ? "threaded" : r.get(0);
    }

    public void setDiscussionStyle(int postId, String style) {
        int updated = jdbc.update("UPDATE discussions SET style=? WHERE post_id=?", style, postId);
        if (updated == 0) {
            getOrCreateDiscussion(postId);
            jdbc.update("UPDATE discussions SET style=? WHERE post_id=?", style, postId);
        }
    }

    // ── Comments ──────────────────────────────────────────────────────────────

    private static final RowMapper<Comment> COMMENT_MAPPER = (rs, rowNum) -> {
        Comment c = new Comment();
        c.setId(rs.getInt("id"));
        c.setDiscussionId(rs.getInt("discussion_id"));
        int parentId = rs.getInt("parent_id");
        if (!rs.wasNull()) c.setParentId(parentId);
        c.setUserId(rs.getInt("user_id"));
        c.setAuthorUsername(rs.getString("username"));
        c.setContent(rs.getString("content"));
        c.setScore(rs.getInt("score"));
        c.setCreatedAt(rs.getTimestamp("created_at"));
        c.setEditedAt(rs.getTimestamp("edited_at"));
        return c;
    };

    public List<Comment> getComments(int postId, String sort, int requestingUserId) {
        String orderBy = "votes".equals(sort) ? "c.score DESC, c.created_at ASC" : "c.created_at DESC";
        List<Comment> flat = jdbc.query(
            "SELECT c.id, c.discussion_id, c.parent_id, c.user_id, u.username, c.content, c.score, c.created_at, c.edited_at " +
            "FROM comments c INNER JOIN users u ON u.id=c.user_id " +
            "INNER JOIN discussions d ON d.id=c.discussion_id " +
            "WHERE d.post_id=? ORDER BY " + orderBy,
            COMMENT_MAPPER, postId);

        // Attach each user's own vote
        if (requestingUserId > 0) {
            Map<Integer, Integer> votes = new HashMap<>();
            jdbc.query(
                "SELECT cv.comment_id, cv.vote FROM comment_votes cv " +
                "INNER JOIN comments c ON c.id=cv.comment_id " +
                "INNER JOIN discussions d ON d.id=c.discussion_id " +
                "WHERE d.post_id=? AND cv.user_id=?",
                (RowCallbackHandler) rs -> votes.put(rs.getInt("comment_id"), rs.getInt("vote")),
                postId, requestingUserId);
            flat.forEach(c -> c.setUserVote(votes.getOrDefault(c.getId(), 0)));
        }

        // Attach reaction counts for all comments in one query
        if (!flat.isEmpty()) {
            Map<Integer, Map<String, Integer>> allReactions = new HashMap<>();
            jdbc.query(
                "SELECT cr.comment_id, cr.reaction, COUNT(*) AS cnt " +
                "FROM comment_reactions cr " +
                "INNER JOIN comments c ON c.id=cr.comment_id " +
                "INNER JOIN discussions d ON d.id=c.discussion_id " +
                "WHERE d.post_id=? GROUP BY cr.comment_id, cr.reaction",
                (RowCallbackHandler) rs -> {
                    int cid = rs.getInt("comment_id");
                    allReactions.computeIfAbsent(cid, k -> new LinkedHashMap<>())
                        .put(rs.getString("reaction"), ((Number) rs.getObject("cnt")).intValue());
                }, postId);
            flat.forEach(c -> { if (allReactions.containsKey(c.getId())) c.setReactions(allReactions.get(c.getId())); });

            if (requestingUserId > 0) {
                Map<Integer, List<String>> userReactionsMap = new HashMap<>();
                jdbc.query(
                    "SELECT cr.comment_id, cr.reaction FROM comment_reactions cr " +
                    "INNER JOIN comments c ON c.id=cr.comment_id " +
                    "INNER JOIN discussions d ON d.id=c.discussion_id " +
                    "WHERE d.post_id=? AND cr.user_id=?",
                    (RowCallbackHandler) rs -> userReactionsMap
                        .computeIfAbsent(rs.getInt("comment_id"), k -> new ArrayList<>())
                        .add(rs.getString("reaction")),
                    postId, requestingUserId);
                flat.forEach(c -> { List<String> ur = userReactionsMap.get(c.getId()); if (ur != null) c.setUserReactions(ur); });
            }
        }

        // Build tree
        Map<Integer, Comment> byId = new LinkedHashMap<>();
        List<Comment> roots = new ArrayList<>();
        for (Comment c : flat) byId.put(c.getId(), c);
        for (Comment c : flat) {
            if (c.getParentId() == null) roots.add(c);
            else {
                Comment parent = byId.get(c.getParentId());
                if (parent != null) parent.getReplies().add(c);
                else roots.add(c);
            }
        }
        return roots;
    }

    public int addComment(int postId, Integer parentId, int userId, String content) {
        int discussionId = getOrCreateDiscussion(postId);
        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(c -> {
            PreparedStatement ps = c.prepareStatement(
                "INSERT INTO comments(discussion_id,parent_id,user_id,content) VALUES(?,?,?,?) RETURNING id",
                Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, discussionId);
            if (parentId != null) ps.setInt(2, parentId); else ps.setNull(2, java.sql.Types.INTEGER);
            ps.setInt(3, userId);
            ps.setString(4, content);
            return ps;
        }, kh);
        return kh.getKey().intValue();
    }

    public int getCommentAuthorId(int commentId) {
        List<Integer> ids = jdbc.queryForList("SELECT user_id FROM comments WHERE id=?", Integer.class, commentId);
        return ids.isEmpty() ? -1 : ids.get(0);
    }

    public int editComment(int commentId, int userId, String content) {
        return jdbc.update(
            "UPDATE comments SET content=?, edited_at=NOW() WHERE id=? AND user_id=?",
            content, commentId, userId);
    }

    public int deleteComment(int commentId, int userId) {
        return jdbc.update("DELETE FROM comments WHERE id=? AND user_id=?", commentId, userId);
    }

    public int voteComment(int commentId, int userId, int vote) {
        jdbc.update(
            "INSERT INTO comment_votes(comment_id,user_id,vote) VALUES(?,?,?) " +
            "ON CONFLICT(comment_id,user_id) DO UPDATE SET vote=EXCLUDED.vote",
            commentId, userId, vote);
        // Recompute score
        return jdbc.update(
            "UPDATE comments SET score=(SELECT COALESCE(SUM(vote),0) FROM comment_votes WHERE comment_id=?) WHERE id=?",
            commentId, commentId);
    }

    public int removeVote(int commentId, int userId) {
        int rows = jdbc.update("DELETE FROM comment_votes WHERE comment_id=? AND user_id=?", commentId, userId);
        jdbc.update(
            "UPDATE comments SET score=(SELECT COALESCE(SUM(vote),0) FROM comment_votes WHERE comment_id=?) WHERE id=?",
            commentId, commentId);
        return rows;
    }

    // ── Comment reactions ─────────────────────────────────────────────────────

    public Map<String, Integer> getCommentReactions(int commentId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT reaction, COUNT(*) AS cnt FROM comment_reactions WHERE comment_id=? GROUP BY reaction", commentId);
        Map<String, Integer> m = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) m.put((String) r.get("reaction"), ((Number) r.get("cnt")).intValue());
        return m;
    }

    public List<String> getUserCommentReactions(int commentId, int userId) {
        return jdbc.queryForList(
            "SELECT reaction FROM comment_reactions WHERE comment_id=? AND user_id=?", String.class, commentId, userId);
    }

    /** Toggles a comment reaction: adds if absent, removes if present. */
    public void toggleCommentReaction(int commentId, int userId, String reaction) {
        int deleted = jdbc.update(
            "DELETE FROM comment_reactions WHERE comment_id=? AND user_id=? AND reaction=?", commentId, userId, reaction);
        if (deleted == 0) {
            jdbc.update(
                "INSERT INTO comment_reactions(comment_id,user_id,reaction) VALUES(?,?,?) ON CONFLICT DO NOTHING",
                commentId, userId, reaction);
        }
    }

    // ── Notifications ─────────────────────────────────────────────────────────

    private static final RowMapper<Notification> NOTIF_MAPPER = (rs, rowNum) -> {
        Notification n = new Notification();
        n.setId(rs.getInt("id"));
        n.setRecipientId(rs.getInt("recipient_id"));
        n.setType(rs.getString("type"));
        n.setActorUsername(rs.getString("actor_username"));
        int pid = rs.getInt("post_id"); if (!rs.wasNull()) n.setPostId(pid);
        int cid = rs.getInt("comment_id"); if (!rs.wasNull()) n.setCommentId(cid);
        n.setMessage(rs.getString("message"));
        n.setRead(rs.getBoolean("is_read"));
        n.setCreatedAt(rs.getTimestamp("created_at"));
        n.setPostTitle(rs.getString("post_title"));
        n.setPostOwner(rs.getString("post_owner"));
        return n;
    };

    public void createNotification(int recipientId, String type, String actorUsername, Integer postId, Integer commentId) {
        if (recipientId <= 0) return;
        jdbc.update(
            "INSERT INTO notifications(recipient_id,type,actor_username,post_id,comment_id) VALUES(?,?,?,?,?)",
            recipientId, type, actorUsername, postId, commentId);
    }

    /** Bulk-insert a notification for every follower of followedUserId in one query. */
    public void notifyFollowers(int followedUserId, String actorUsername, Integer postId) {
        jdbc.update(
            "INSERT INTO notifications(recipient_id,type,actor_username,post_id) " +
            "SELECT f.follower_id, 'new_post', ?, ? FROM follows f WHERE f.followed_id=?",
            actorUsername, postId, followedUserId);
    }

    /** Send a direct text message to a user as a notification of type 'message'. */
    public void sendMessage(int recipientId, String senderUsername, String message) {
        if (recipientId <= 0) return;
        jdbc.update(
            "INSERT INTO notifications(recipient_id,type,actor_username,message) VALUES(?,?,?,?)",
            recipientId, "message", senderUsername, message);
    }

    public long getNotificationStorageBytes(int userId) {
        Long r = jdbc.queryForObject(
            "SELECT COALESCE(SUM(OCTET_LENGTH(COALESCE(message,''))),0) FROM notifications WHERE recipient_id=?",
            Long.class, userId);
        return r != null ? r : 0L;
    }

    public List<Notification> getNotifications(int userId, int limit, int offset) {
        return jdbc.query(
            "SELECT n.*, p.title AS post_title, u.username AS post_owner " +
            "FROM notifications n " +
            "LEFT JOIN posts p ON p.id = n.post_id " +
            "LEFT JOIN users_posts_junctions j ON j.post_id = p.id " +
            "LEFT JOIN users u ON u.id = j.user_id " +
            "WHERE n.recipient_id=? ORDER BY n.created_at DESC LIMIT ? OFFSET ?",
            NOTIF_MAPPER, userId, limit, offset);
    }

    public int getUnreadCount(int userId) {
        Integer r = jdbc.queryForObject(
            "SELECT COUNT(*) FROM notifications WHERE recipient_id=? AND is_read=FALSE", Integer.class, userId);
        return r != null ? r : 0;
    }

    public int markRead(int notificationId, int userId) {
        return jdbc.update("UPDATE notifications SET is_read=TRUE WHERE id=? AND recipient_id=?", notificationId, userId);
    }

    public void markAllRead(int userId) {
        jdbc.update("UPDATE notifications SET is_read=TRUE WHERE recipient_id=?", userId);
    }

    public int deleteNotification(int notificationId, int userId) {
        return jdbc.update("DELETE FROM notifications WHERE id=? AND recipient_id=?", notificationId, userId);
    }

    public void clearNotifications(int userId) {
        jdbc.update("DELETE FROM notifications WHERE recipient_id=?", userId);
    }

    // ── DM blocks ─────────────────────────────────────────────────────────────

    /** Block direct messages from blockedId to blockerId. */
    public void blockMessages(int blockerId, int blockedId) {
        jdbc.update(
            "INSERT INTO dm_blocks(blocker_id, blocked_id) VALUES(?,?) ON CONFLICT DO NOTHING",
            blockerId, blockedId);
    }

    /** Remove a DM block. */
    public void unblockMessages(int blockerId, int blockedId) {
        jdbc.update("DELETE FROM dm_blocks WHERE blocker_id=? AND blocked_id=?", blockerId, blockedId);
    }

    /** Returns true if blockerId has blocked messages from blockedId. */
    public boolean isBlockingMessages(int blockerId, int blockedId) {
        List<Integer> r = jdbc.queryForList(
            "SELECT 1 FROM dm_blocks WHERE blocker_id=? AND blocked_id=?", Integer.class, blockerId, blockedId);
        return !r.isEmpty();
    }

    /** Returns true if the recipient (recipientId) has blocked the sender (senderId). */
    public boolean isMessageBlocked(int recipientId, int senderId) {
        return isBlockingMessages(recipientId, senderId);
    }

    // ── Activity feed ─────────────────────────────────────────────────────────

    /** Returns the user's comments with their post context, most recent first. */
    public List<Map<String, Object>> getUserActivityComments(int userId, int limit) {
        return jdbc.queryForList(
            "SELECT c.id, c.content, c.created_at, c.score, c.parent_id, " +
            "  p.id AS post_id, p.title AS post_title, u.username AS post_owner " +
            "FROM comments c " +
            "JOIN discussions d ON d.id = c.discussion_id " +
            "JOIN posts p ON p.id = d.post_id " +
            "JOIN users_posts_junctions j ON j.post_id = p.id " +
            "JOIN users u ON u.id = j.user_id " +
            "WHERE c.user_id = ? " +
            "ORDER BY c.created_at DESC LIMIT ?",
            userId, limit);
    }

    /** Returns the user's post reactions with post context, most recent first. */
    public List<Map<String, Object>> getUserActivityPostReactions(int userId, int limit) {
        return jdbc.queryForList(
            "SELECT pr.reaction, pr.post_id, p.title AS post_title, u.username AS post_owner " +
            "FROM post_reactions pr " +
            "JOIN posts p ON p.id = pr.post_id " +
            "JOIN users_posts_junctions j ON j.post_id = p.id " +
            "JOIN users u ON u.id = j.user_id " +
            "WHERE pr.user_id = ? " +
            "ORDER BY pr.post_id DESC LIMIT ?",
            userId, limit);
    }

    /** Returns the user's comment reactions with post/comment context, most recent first. */
    public List<Map<String, Object>> getUserActivityCommentReactions(int userId, int limit) {
        return jdbc.queryForList(
            "SELECT cr.reaction, cr.comment_id, " +
            "  SUBSTRING(c.content, 1, 120) AS comment_preview, " +
            "  p.id AS post_id, p.title AS post_title, u.username AS post_owner " +
            "FROM comment_reactions cr " +
            "JOIN comments c ON c.id = cr.comment_id " +
            "JOIN discussions d ON d.id = c.discussion_id " +
            "JOIN posts p ON p.id = d.post_id " +
            "JOIN users_posts_junctions j ON j.post_id = p.id " +
            "JOIN users u ON u.id = j.user_id " +
            "WHERE cr.user_id = ? " +
            "ORDER BY cr.comment_id DESC LIMIT ?",
            userId, limit);
    }

    /** Returns the user's authored posts, most recent first. */
    public List<Map<String, Object>> getUserActivityPosts(int userId, int limit) {
        return jdbc.queryForList(
            "SELECT p.id, p.title, p.date, p.edited_at, p.published " +
            "FROM posts p " +
            "JOIN users_posts_junctions j ON j.post_id = p.id " +
            "WHERE j.user_id = ? " +
            "ORDER BY p.date DESC LIMIT ?",
            userId, limit);
    }

    /** Returns the user's uploads, each annotated with the post they are linked to (if any). */
    public List<Map<String, Object>> getUserActivityUploads(int userId, int limit) {
        return jdbc.queryForList(
            "SELECT u.id, u.filename, u.original_name, u.size_bytes, u.uploaded_at, " +
            "  pu.post_id, p.title AS post_title, owner.username AS post_owner " +
            "FROM uploads u " +
            "LEFT JOIN post_uploads pu ON pu.upload_id = u.id " +
            "LEFT JOIN posts p ON p.id = pu.post_id " +
            "LEFT JOIN users_posts_junctions j ON j.post_id = p.id " +
            "LEFT JOIN users owner ON owner.id = j.user_id " +
            "WHERE u.user_id = ? " +
            "ORDER BY u.uploaded_at DESC LIMIT ?",
            userId, limit);
    }

    /** Fetches comment details for the deletion log (only if owned by userId). */
    public Map<String, Object> getCommentInfoForLog(int commentId, int userId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT c.content, p.id AS post_id, p.title AS post_title, u.username AS post_owner " +
            "FROM comments c " +
            "JOIN discussions d ON d.id = c.discussion_id " +
            "JOIN posts p ON p.id = d.post_id " +
            "JOIN users_posts_junctions j ON j.post_id = p.id " +
            "JOIN users u ON u.id = j.user_id " +
            "WHERE c.id = ? AND c.user_id = ?",
            commentId, userId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** Writes a deletion log entry. Call before the DELETE (content must be captured before). */
    public void logDeletion(int userId, String itemType, Map<String, Object> info) {
        String raw = info.get("content") != null ? (String) info.get("content") : null;
        String summary = raw != null ? raw.substring(0, Math.min(200, raw.length())) : null;
        Integer postId = info.get("post_id") != null ? ((Number) info.get("post_id")).intValue() : null;
        String postTitle = (String) info.get("post_title");
        String postOwner = (String) info.get("post_owner");
        jdbc.update(
            "INSERT INTO activity_deletions(user_id, item_type, summary, post_id, post_title, post_owner) " +
            "VALUES(?,?,?,?,?,?)",
            userId, itemType, summary, postId, postTitle, postOwner);
    }

    /** Returns the user's deletion log, most recent first. */
    public List<Map<String, Object>> getUserActivityDeletions(int userId, int limit) {
        return jdbc.queryForList(
            "SELECT id, item_type, summary, post_id, post_title, post_owner, deleted_at " +
            "FROM activity_deletions WHERE user_id = ? ORDER BY deleted_at DESC LIMIT ?",
            userId, limit);
    }

    /** Total bytes of all comment content written by this user. */
    public long getUserCommentStorageBytes(int userId) {
        Long r = jdbc.queryForObject(
            "SELECT COALESCE(SUM(OCTET_LENGTH(content)), 0) FROM comments WHERE user_id = ?",
            Long.class, userId);
        return r != null ? r : 0L;
    }

    // ── User data export ──────────────────────────────────────────────────────

    /** Builds a complete data export for a user. Never includes the password hash. */
    public Map<String, Object> buildUserExport(String username, int userId) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("version", "1");
        out.put("exported_at", java.time.Instant.now().toString());
        out.put("username", username);

        List<Map<String, Object>> profileRows = jdbc.queryForList(
            "SELECT username, registration_date, background_pattern, role, bio, pattern_presets, last_visited " +
            "FROM users WHERE id=?", userId);
        out.put("profile", profileRows.isEmpty() ? new LinkedHashMap<>() : new LinkedHashMap<>(profileRows.get(0)));

        out.put("posts", jdbc.queryForList(
            "SELECT p.id, p.title, p.description, p.published, p.date, p.edited_at, p.background_pattern " +
            "FROM posts p JOIN users_posts_junctions j ON j.post_id=p.id " +
            "WHERE j.user_id=? ORDER BY p.date DESC", userId));

        out.put("comments", getUserActivityComments(userId, 10000));
        out.put("post_reactions", getUserActivityPostReactions(userId, 10000));
        out.put("uploads", jdbc.queryForList(
            "SELECT id, filename, original_name, size_bytes, uploaded_at FROM uploads " +
            "WHERE user_id=? ORDER BY uploaded_at DESC", userId));
        out.put("notifications", jdbc.queryForList(
            "SELECT id, type, actor_username, post_id, comment_id, is_read, created_at, message " +
            "FROM notifications WHERE recipient_id=? ORDER BY created_at DESC", userId));

        return out;
    }

    /**
     * Restores posts from an export map into the given user account.
     * Skips posts where the exact (title + date) already exists for that user.
     */
    @SuppressWarnings("unchecked")
    public int restorePostsFromExport(int userId, Map<String, Object> exportData) {
        List<Map<String, Object>> posts = (List<Map<String, Object>>) exportData.get("posts");
        if (posts == null || posts.isEmpty()) return 0;
        int restored = 0;
        for (Map<String, Object> post : posts) {
            String title = (String) post.getOrDefault("title", "");
            String description = (String) post.getOrDefault("description", "");
            boolean published = Boolean.TRUE.equals(post.get("published"));
            String bgPattern = (String) post.get("background_pattern");
            String dateStr = post.get("date") != null ? post.get("date").toString() : null;

            List<Integer> existing = jdbc.queryForList(
                "SELECT p.id FROM posts p JOIN users_posts_junctions j ON j.post_id=p.id " +
                "WHERE j.user_id=? AND p.title=? AND p.date=?::timestamptz",
                Integer.class, userId, title, dateStr);
            if (!existing.isEmpty()) continue;

            KeyHolder kh = new GeneratedKeyHolder();
            final String finalDateStr = dateStr;
            final String finalBg = bgPattern;
            jdbc.update(c -> {
                PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO posts(title, description, published, date, background_pattern) " +
                    "VALUES(?,?,?,?::timestamptz,?) RETURNING id",
                    Statement.RETURN_GENERATED_KEYS);
                ps.setString(1, title);
                ps.setString(2, description);
                ps.setBoolean(3, published);
                if (finalDateStr != null) ps.setString(4, finalDateStr); else ps.setString(4, java.time.Instant.now().toString());
                if (finalBg != null) ps.setString(5, finalBg); else ps.setNull(5, java.sql.Types.VARCHAR);
                return ps;
            }, kh);
            int newPostId = kh.getKey().intValue();
            jdbc.update("INSERT INTO users_posts_junctions(post_id, user_id) VALUES(?,?)", newPostId, userId);
            restored++;
        }
        return restored;
    }

    // ── Conversations ─────────────────────────────────────────────────────────

    public List<Map<String, Object>> getConversations(int userId) {
        return jdbc.queryForList(
            "SELECT c.id, " +
            "  CASE WHEN c.user1_id=? THEN u2.username ELSE u1.username END AS other_username, " +
            "  CASE WHEN c.user1_id=? THEN u2.avatar_path ELSE u1.avatar_path END AS other_avatar, " +
            "  last_msg.content AS last_message, " +
            "  last_msg.created_at AS last_message_at, " +
            "  (SELECT COUNT(*) FROM direct_messages dm2 " +
            "   WHERE dm2.conversation_id=c.id AND dm2.sender_id!=? AND dm2.is_read=FALSE) AS unread_count " +
            "FROM conversations c " +
            "JOIN users u1 ON u1.id=c.user1_id " +
            "JOIN users u2 ON u2.id=c.user2_id " +
            "LEFT JOIN LATERAL (" +
            "  SELECT content, created_at FROM direct_messages " +
            "  WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1" +
            ") last_msg ON TRUE " +
            "WHERE c.user1_id=? OR c.user2_id=? " +
            "ORDER BY last_msg.created_at DESC NULLS LAST",
            userId, userId, userId, userId, userId);
    }

    public int getOrCreateConversation(int userId1, int userId2) {
        int a = Math.min(userId1, userId2);
        int b = Math.max(userId1, userId2);
        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(c -> {
            PreparedStatement ps = c.prepareStatement(
                "INSERT INTO conversations(user1_id,user2_id) VALUES(?,?) " +
                "ON CONFLICT (user1_id,user2_id) DO UPDATE SET user1_id=EXCLUDED.user1_id RETURNING id",
                Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, a);
            ps.setInt(2, b);
            return ps;
        }, kh);
        return kh.getKey().intValue();
    }

    public boolean isConversationParticipant(int convId, int userId) {
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM conversations WHERE id=? AND (user1_id=? OR user2_id=?)",
            Integer.class, convId, userId, userId);
        return count != null && count > 0;
    }

    public List<Map<String, Object>> getMessages(int convId, int limit, int offset) {
        return jdbc.queryForList(
            "SELECT dm.id, dm.sender_id, u.username AS sender_username, dm.content, dm.is_read, dm.created_at " +
            "FROM direct_messages dm JOIN users u ON u.id=dm.sender_id " +
            "WHERE dm.conversation_id=? ORDER BY dm.created_at ASC LIMIT ? OFFSET ?",
            convId, limit, offset);
    }

    public void sendConversationMessage(int convId, int senderId, String content) {
        jdbc.update(
            "INSERT INTO direct_messages(conversation_id,sender_id,content) VALUES(?,?,?)",
            convId, senderId, content);
    }

    public int getOtherParticipant(int convId, int userId) {
        List<Integer> r = jdbc.queryForList(
            "SELECT CASE WHEN user1_id=? THEN user2_id ELSE user1_id END " +
            "FROM conversations WHERE id=?",
            Integer.class, userId, convId);
        return r.isEmpty() ? -1 : r.get(0);
    }

    public void markConversationRead(int convId, int userId) {
        jdbc.update(
            "UPDATE direct_messages SET is_read=TRUE WHERE conversation_id=? AND sender_id!=?",
            convId, userId);
    }

    public int getUnreadMessageCount(int userId) {
        Integer r = jdbc.queryForObject(
            "SELECT COUNT(*) FROM direct_messages dm " +
            "JOIN conversations c ON c.id=dm.conversation_id " +
            "WHERE (c.user1_id=? OR c.user2_id=?) AND dm.sender_id!=? AND dm.is_read=FALSE",
            Integer.class, userId, userId, userId);
        return r != null ? r : 0;
    }

    // ── Post views ────────────────────────────────────────────────────────────

    public void recordPostView(int postId, Integer userId) {
        if (userId != null) {
            int inserted = jdbc.update(
                "INSERT INTO post_views(post_id,user_id) VALUES(?,?) ON CONFLICT DO NOTHING",
                postId, userId);
            if (inserted > 0) {
                jdbc.update(
                    "INSERT INTO post_view_totals(post_id,total_views,unique_views) VALUES(?,1,1) " +
                    "ON CONFLICT (post_id) DO UPDATE SET " +
                    "total_views=post_view_totals.total_views+1, unique_views=post_view_totals.unique_views+1",
                    postId);
            } else {
                jdbc.update(
                    "INSERT INTO post_view_totals(post_id,total_views,unique_views) VALUES(?,1,0) " +
                    "ON CONFLICT (post_id) DO UPDATE SET total_views=post_view_totals.total_views+1",
                    postId);
            }
        } else {
            jdbc.update(
                "INSERT INTO post_view_totals(post_id,total_views,unique_views) VALUES(?,1,0) " +
                "ON CONFLICT (post_id) DO UPDATE SET total_views=post_view_totals.total_views+1",
                postId);
        }
    }

    public Map<String, Object> getPostViews(int postId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT total_views, unique_views FROM post_view_totals WHERE post_id=?", postId);
        if (rows.isEmpty()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("total_views", 0L);
            m.put("unique_views", 0L);
            return m;
        }
        return rows.get(0);
    }

    // ── Hashtags ──────────────────────────────────────────────────────────────

    // Matches the "text" field values from Lexical JSON to avoid false positives from
    // hex colors in style attributes like "style":"color: #1a73e8".
    private static final java.util.regex.Pattern TEXT_NODE_RE =
        java.util.regex.Pattern.compile("\"text\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");

    private static final java.util.regex.Pattern HASHTAG_RE =
        java.util.regex.Pattern.compile("#([\\w]{1,50})");

    public void parseAndSaveHashtags(int postId, String content) {
        if (content == null) content = "";
        java.util.Set<String> tags = new java.util.LinkedHashSet<>();
        java.util.regex.Matcher textMatcher = TEXT_NODE_RE.matcher(content);
        while (textMatcher.find()) {
            String textValue = textMatcher.group(1)
                .replace("\\\"", "\"").replace("\\\\", "\\")
                .replace("\\n", "\n").replace("\\t", "\t");
            java.util.regex.Matcher m = HASHTAG_RE.matcher(textValue);
            while (m.find()) tags.add(m.group(1).toLowerCase());
        }

        jdbc.update("DELETE FROM post_hashtags WHERE post_id=?", postId);
        for (String tag : tags) {
            jdbc.update("INSERT INTO hashtags(tag) VALUES(?) ON CONFLICT (tag) DO NOTHING", tag);
            List<Integer> ids = jdbc.queryForList(
                "SELECT id FROM hashtags WHERE tag=?", Integer.class, tag);
            if (!ids.isEmpty())
                jdbc.update("INSERT INTO post_hashtags(post_id, hashtag_id) VALUES(?,?) ON CONFLICT DO NOTHING",
                    postId, ids.get(0));
        }
    }

    public List<Map<String, Object>> getPostsByHashtag(String tag) {
        return jdbc.queryForList(
            "SELECT p.id, p.title, u.username " +
            "FROM post_hashtags ph " +
            "JOIN hashtags h ON h.id=ph.hashtag_id " +
            "JOIN posts p ON p.id=ph.post_id " +
            "JOIN users_posts_junctions j ON j.post_id=p.id " +
            "JOIN users u ON u.id=j.user_id " +
            "WHERE h.tag=? AND p.published=TRUE " +
            "ORDER BY p.date DESC LIMIT 100",
            tag.toLowerCase());
    }

    // ── User search ───────────────────────────────────────────────────────────

    /** Case-insensitive prefix/substring search on usernames. */
    public List<String> searchUsers(String query, int limit) {
        return jdbc.queryForList(
            "SELECT username FROM users WHERE username ILIKE ? ORDER BY username LIMIT ?",
            String.class, "%" + query + "%", limit);
    }

    // ── Post votes ────────────────────────────────────────────────────────────

    /** Vote (+1 or -1) on a post. Passing 0 removes the vote. Returns {score, userVote}. */
    public Map<String, Object> votePost(int postId, int userId, int vote) {
        if (vote == 0) {
            jdbc.update("DELETE FROM post_votes WHERE post_id=? AND user_id=?", postId, userId);
        } else {
            jdbc.update(
                "INSERT INTO post_votes(post_id,user_id,vote) VALUES(?,?,?) " +
                "ON CONFLICT(post_id,user_id) DO UPDATE SET vote=EXCLUDED.vote",
                postId, userId, vote);
        }
        int score = getPostScore(postId);
        int userVote = vote == 0 ? 0 : vote;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("score", score);
        result.put("userVote", userVote);
        return result;
    }

    public int getPostScore(int postId) {
        Integer s = jdbc.queryForObject(
            "SELECT COALESCE(SUM(vote),0) FROM post_votes WHERE post_id=?", Integer.class, postId);
        return s != null ? s : 0;
    }

    public int getUserPostVote(int postId, int userId) {
        List<Integer> rows = jdbc.queryForList(
            "SELECT vote FROM post_votes WHERE post_id=? AND user_id=?", Integer.class, postId, userId);
        return rows.isEmpty() ? 0 : rows.get(0);
    }

    /** Returns follower and following counts for a user. */
    public Map<String, Integer> getFollowCounts(int userId) {
        Integer followers = jdbc.queryForObject(
            "SELECT COUNT(*) FROM follows WHERE followed_id=?", Integer.class, userId);
        Integer following = jdbc.queryForObject(
            "SELECT COUNT(*) FROM follows WHERE follower_id=?", Integer.class, userId);
        Map<String, Integer> m = new LinkedHashMap<>();
        m.put("followers", followers != null ? followers : 0);
        m.put("following", following != null ? following : 0);
        return m;
    }

    // ── DM reactions ──────────────────────────────────────────────────────────

    public void toggleDmReaction(int messageId, int userId, String reaction) {
        int deleted = jdbc.update(
            "DELETE FROM dm_reactions WHERE message_id=? AND user_id=? AND reaction=?",
            messageId, userId, reaction);
        if (deleted == 0) {
            jdbc.update(
                "INSERT INTO dm_reactions(message_id,user_id,reaction) VALUES(?,?,?) ON CONFLICT DO NOTHING",
                messageId, userId, reaction);
        }
    }

    /** Returns reaction counts and list of reactors per emoji for a message. */
    public Map<String, Object> getDmReactions(int messageId, int viewerUserId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT r.reaction, COUNT(*) AS cnt, " +
            "  BOOL_OR(r.user_id=?) AS viewer_reacted " +
            "FROM dm_reactions r WHERE r.message_id=? " +
            "GROUP BY r.reaction ORDER BY r.reaction",
            viewerUserId, messageId);
        Map<String, Integer> counts = new LinkedHashMap<>();
        List<String> userReactions = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            String emoji = (String) row.get("reaction");
            counts.put(emoji, ((Number) row.get("cnt")).intValue());
            if (Boolean.TRUE.equals(row.get("viewer_reacted"))) userReactions.add(emoji);
        }
        return Map.of("counts", counts, "userReactions", userReactions);
    }

    /** Returns reactions for all messages in a conversation, keyed by message id. */
    public Map<Integer, Map<String, Object>> getDmReactionsForConversation(int convId, int viewerUserId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT r.message_id, r.reaction, COUNT(*) AS cnt, " +
            "  BOOL_OR(r.user_id=?) AS viewer_reacted " +
            "FROM dm_reactions r " +
            "JOIN direct_messages dm ON dm.id=r.message_id " +
            "WHERE dm.conversation_id=? " +
            "GROUP BY r.message_id, r.reaction",
            viewerUserId, convId);
        Map<Integer, Map<String, Object>> result = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            int msgId = ((Number) row.get("message_id")).intValue();
            String emoji = (String) row.get("reaction");
            int cnt = ((Number) row.get("cnt")).intValue();
            boolean viewerReacted = Boolean.TRUE.equals(row.get("viewer_reacted"));
            result.computeIfAbsent(msgId, k -> {
                Map<String, Object> m2 = new LinkedHashMap<>();
                m2.put("counts", new LinkedHashMap<String, Integer>());
                m2.put("userReactions", new ArrayList<String>());
                return m2;
            });
            @SuppressWarnings("unchecked")
            Map<String, Integer> counts = (Map<String, Integer>) result.get(msgId).get("counts");
            counts.put(emoji, cnt);
            if (viewerReacted) {
                @SuppressWarnings("unchecked")
                List<String> ur = (List<String>) result.get(msgId).get("userReactions");
                ur.add(emoji);
            }
        }
        return result;
    }

    // ── Group conversations ───────────────────────────────────────────────────

    public int createGroupConversation(String name, int createdBy) {
        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(c -> {
            PreparedStatement ps = c.prepareStatement(
                "INSERT INTO group_conversations(name,created_by) VALUES(?,?) RETURNING id",
                Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, name);
            ps.setInt(2, createdBy);
            return ps;
        }, kh);
        int groupId = kh.getKey().intValue();
        jdbc.update("INSERT INTO group_conversation_members(group_id,user_id,is_admin) VALUES(?,?,TRUE)",
            groupId, createdBy);
        return groupId;
    }

    public void addGroupMember(int groupId, int userId) {
        jdbc.update(
            "INSERT INTO group_conversation_members(group_id,user_id) VALUES(?,?) ON CONFLICT DO NOTHING",
            groupId, userId);
    }

    public void removeGroupMember(int groupId, int userId) {
        jdbc.update(
            "DELETE FROM group_conversation_members WHERE group_id=? AND user_id=?",
            groupId, userId);
    }

    public boolean isGroupMember(int groupId, int userId) {
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM group_conversation_members WHERE group_id=? AND user_id=?",
            Integer.class, groupId, userId);
        return count != null && count > 0;
    }

    public boolean isGroupAdmin(int groupId, int userId) {
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM group_conversation_members WHERE group_id=? AND user_id=? AND is_admin=TRUE",
            Integer.class, groupId, userId);
        return count != null && count > 0;
    }

    public List<Map<String, Object>> getGroupConversations(int userId) {
        return jdbc.queryForList(
            "SELECT gc.id, gc.name, gc.created_at, " +
            "  last_msg.content AS last_message, last_msg.created_at AS last_message_at, " +
            "  (SELECT COUNT(*) FROM group_messages gm2 " +
            "   WHERE gm2.group_id=gc.id AND gm2.created_at > COALESCE(" +
            "     (SELECT last_read_at FROM group_message_read WHERE group_id=gc.id AND user_id=?), " +
            "     '1970-01-01'::timestamptz)) AS unread_count " +
            "FROM group_conversations gc " +
            "JOIN group_conversation_members gcm ON gcm.group_id=gc.id AND gcm.user_id=? " +
            "LEFT JOIN LATERAL (" +
            "  SELECT content, created_at FROM group_messages " +
            "  WHERE group_id=gc.id ORDER BY created_at DESC LIMIT 1" +
            ") last_msg ON TRUE " +
            "ORDER BY last_msg.created_at DESC NULLS LAST",
            userId, userId);
    }

    public List<Map<String, Object>> getGroupMessages(int groupId, int limit, int offset) {
        return jdbc.queryForList(
            "SELECT gm.id, gm.sender_id, u.username AS sender_username, u.avatar_path, gm.content, gm.created_at " +
            "FROM group_messages gm JOIN users u ON u.id=gm.sender_id " +
            "WHERE gm.group_id=? ORDER BY gm.created_at ASC LIMIT ? OFFSET ?",
            groupId, limit, offset);
    }

    public void toggleGroupReaction(int messageId, int userId, String reaction) {
        int deleted = jdbc.update(
            "DELETE FROM group_message_reactions WHERE message_id=? AND user_id=? AND reaction=?",
            messageId, userId, reaction);
        if (deleted == 0) {
            jdbc.update(
                "INSERT INTO group_message_reactions(message_id,user_id,reaction) VALUES(?,?,?) ON CONFLICT DO NOTHING",
                messageId, userId, reaction);
        }
    }

    public Map<Integer, Map<String, Object>> getGroupReactionsForGroup(int groupId, int viewerUserId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT r.message_id, r.reaction, COUNT(*) AS cnt, " +
            "  BOOL_OR(r.user_id=?) AS viewer_reacted " +
            "FROM group_message_reactions r " +
            "JOIN group_messages gm ON gm.id=r.message_id " +
            "WHERE gm.group_id=? " +
            "GROUP BY r.message_id, r.reaction",
            viewerUserId, groupId);
        Map<Integer, Map<String, Object>> result = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            int msgId = ((Number) row.get("message_id")).intValue();
            String emoji = (String) row.get("reaction");
            int cnt = ((Number) row.get("cnt")).intValue();
            boolean viewerReacted = Boolean.TRUE.equals(row.get("viewer_reacted"));
            result.computeIfAbsent(msgId, k -> {
                Map<String, Object> m2 = new LinkedHashMap<>();
                m2.put("counts", new LinkedHashMap<String, Integer>());
                m2.put("userReactions", new ArrayList<String>());
                return m2;
            });
            @SuppressWarnings("unchecked")
            Map<String, Integer> counts = (Map<String, Integer>) result.get(msgId).get("counts");
            counts.put(emoji, cnt);
            if (viewerReacted) {
                @SuppressWarnings("unchecked")
                List<String> ur = (List<String>) result.get(msgId).get("userReactions");
                ur.add(emoji);
            }
        }
        return result;
    }

    public void transferGroupOwnership(int groupId, int newOwnerUserId) {
        jdbc.update(
            "UPDATE group_conversation_members SET is_admin=FALSE WHERE group_id=?",
            groupId);
        jdbc.update(
            "UPDATE group_conversation_members SET is_admin=TRUE WHERE group_id=? AND user_id=?",
            groupId, newOwnerUserId);
    }

    public void sendGroupMessage(int groupId, int senderId, String content) {
        jdbc.update(
            "INSERT INTO group_messages(group_id,sender_id,content) VALUES(?,?,?)",
            groupId, senderId, content);
    }

    public void markGroupRead(int groupId, int userId) {
        jdbc.update(
            "INSERT INTO group_message_read(group_id,user_id,last_read_at) VALUES(?,?,NOW()) " +
            "ON CONFLICT (group_id,user_id) DO UPDATE SET last_read_at=NOW()",
            groupId, userId);
    }

    public List<Map<String, Object>> getGroupMembers(int groupId) {
        return jdbc.queryForList(
            "SELECT u.username, gcm.is_admin, gcm.joined_at " +
            "FROM group_conversation_members gcm " +
            "JOIN users u ON u.id=gcm.user_id " +
            "WHERE gcm.group_id=? ORDER BY gcm.joined_at",
            groupId);
    }

    public void renameGroup(int groupId, String name) {
        jdbc.update("UPDATE group_conversations SET name=? WHERE id=?", name, groupId);
    }

    public int getTotalGroupUnreadCount(int userId) {
        Integer r = jdbc.queryForObject(
            "SELECT COALESCE(SUM(sub.cnt),0) FROM (" +
            "  SELECT (SELECT COUNT(*) FROM group_messages gm2 " +
            "    WHERE gm2.group_id=gc.id AND gm2.created_at > COALESCE(" +
            "      (SELECT last_read_at FROM group_message_read WHERE group_id=gc.id AND user_id=?), " +
            "      '1970-01-01'::timestamptz)) AS cnt " +
            "  FROM group_conversations gc " +
            "  JOIN group_conversation_members gcm ON gcm.group_id=gc.id AND gcm.user_id=?" +
            ") sub",
            Integer.class, userId, userId);
        return r != null ? r : 0;
    }
}
