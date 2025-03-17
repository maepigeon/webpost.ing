package com.springbootprojects.webpostingserver.posts.model;

import com.fasterxml.jackson.annotation.JsonFormat;

//import java.sql.Timestamp;
import java.util.Date;

/**
 * Represents a single simple text post, containing a title and description.
 * Metadata, such as whether the post is published as well as the time stamp are also provided here.
 */
public class Post {

    private long id;
    private String title;
    private String description;
    private boolean published;
    private Date date;


    public Post() {

    }

    public Post(long id, String title, String description, boolean published, Date date) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.published = published;
        this.date = date;
    }

    public Post(String title, String description, boolean published) {
        this.title = title;
        this.description = description;
        this.published = published;
    }

    public void setId(long id) {
        this.id = id;
    }

    public long getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public boolean isPublished() {
        return published;
    }

    public void setPublished(boolean isPublished) {
        this.published = isPublished;
    }

    public Date getDate() {
        return date;
    }

    public void setDate(Date date) {
        this.date = date;
    }


    @Override
    public String toString() {
        return "Tutorial [id=" + id + ", title=" + title + ", desc=" + description + ", published=" + published + ", timestamp=" + date +  "]";
    }

}