package com.springbootprojects.webpostingserver.posts.model;

import java.util.Date;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.LinkedHashMap;

public class Comment {
    private int id;
    private int discussionId;
    private Integer parentId;
    private int userId;
    private String authorUsername;
    private String content;
    private int score;
    private int userVote;
    private Date createdAt;
    private Date editedAt;
    private List<Comment> replies = new ArrayList<>();
    private Map<String, Integer> reactions = new LinkedHashMap<>();
    private List<String> userReactions = new ArrayList<>();

    public Comment() {}

    public int getId() { return id; }
    public void setId(int id) { this.id = id; }
    public int getDiscussionId() { return discussionId; }
    public void setDiscussionId(int discussionId) { this.discussionId = discussionId; }
    public Integer getParentId() { return parentId; }
    public void setParentId(Integer parentId) { this.parentId = parentId; }
    public int getUserId() { return userId; }
    public void setUserId(int userId) { this.userId = userId; }
    public String getAuthorUsername() { return authorUsername; }
    public void setAuthorUsername(String authorUsername) { this.authorUsername = authorUsername; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public int getScore() { return score; }
    public void setScore(int score) { this.score = score; }
    public int getUserVote() { return userVote; }
    public void setUserVote(int userVote) { this.userVote = userVote; }
    public Date getCreatedAt() { return createdAt; }
    public void setCreatedAt(Date createdAt) { this.createdAt = createdAt; }
    public Date getEditedAt() { return editedAt; }
    public void setEditedAt(Date editedAt) { this.editedAt = editedAt; }
    public List<Comment> getReplies() { return replies; }
    public void setReplies(List<Comment> replies) { this.replies = replies; }
    public Map<String, Integer> getReactions() { return reactions; }
    public void setReactions(Map<String, Integer> reactions) { this.reactions = reactions; }
    public List<String> getUserReactions() { return userReactions; }
    public void setUserReactions(List<String> userReactions) { this.userReactions = userReactions; }
}
