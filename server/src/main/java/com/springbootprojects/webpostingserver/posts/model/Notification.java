package com.springbootprojects.webpostingserver.posts.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Date;

public class Notification {
    private int id;
    private int recipientId;
    private String type;
    private String actorUsername;
    private Integer postId;
    private Integer commentId;
    private String message;
    private boolean isRead;
    private Date createdAt;
    private String postTitle;
    private String postOwner;

    public Notification() {}

    public int getId() { return id; }
    public void setId(int id) { this.id = id; }
    public int getRecipientId() { return recipientId; }
    public void setRecipientId(int recipientId) { this.recipientId = recipientId; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getActorUsername() { return actorUsername; }
    public void setActorUsername(String actorUsername) { this.actorUsername = actorUsername; }
    public Integer getPostId() { return postId; }
    public void setPostId(Integer postId) { this.postId = postId; }
    public Integer getCommentId() { return commentId; }
    public void setCommentId(Integer commentId) { this.commentId = commentId; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    @JsonProperty("isRead")
    public boolean isRead() { return isRead; }
    public void setRead(boolean read) { isRead = read; }
    public Date getCreatedAt() { return createdAt; }
    public void setCreatedAt(Date createdAt) { this.createdAt = createdAt; }
    public String getPostTitle() { return postTitle; }
    public void setPostTitle(String postTitle) { this.postTitle = postTitle; }
    public String getPostOwner() { return postOwner; }
    public void setPostOwner(String postOwner) { this.postOwner = postOwner; }
}
