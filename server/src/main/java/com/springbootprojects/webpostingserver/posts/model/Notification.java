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
    private String commentExcerpt;
    private boolean subjectGone;

    /** Longest comment excerpt a notification carries, the ellipsis included. */
    public static final int EXCERPT_MAX = 160;

    /**
     * A comment's text as a one-line excerpt: whitespace collapsed, at most
     * {@link #EXCERPT_MAX} characters, cut between characters (never inside an
     * emoji) with an ellipsis. Null in, null out; blank text gives null.
     */
    public static String excerptOf(String text) {
        if (text == null) return null;
        String flat = text.replaceAll("[\\s\\p{Cntrl}]+", " ").trim();
        if (flat.isEmpty()) return null;
        if (flat.codePointCount(0, flat.length()) <= EXCERPT_MAX) return flat;
        int end = flat.offsetByCodePoints(0, EXCERPT_MAX - 1);
        return flat.substring(0, end).stripTrailing() + "\u2026";
    }

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
    public String getCommentExcerpt() { return commentExcerpt; }
    public void setCommentExcerpt(String commentExcerpt) { this.commentExcerpt = commentExcerpt; }
    /** True when the post or comment this is about is gone or hidden from the recipient. */
    public boolean isSubjectGone() { return subjectGone; }
    public void setSubjectGone(boolean subjectGone) { this.subjectGone = subjectGone; }
}
