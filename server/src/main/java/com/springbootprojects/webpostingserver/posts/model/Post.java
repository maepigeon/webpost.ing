package com.springbootprojects.webpostingserver.posts.model;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonRawValue;

//import java.sql.Timestamp;
import java.util.Date;

/**
 * Represents a single simple text post, containing a title and description.
 * Metadata, such as whether the post is published as well as the time stamp are also provided here.
 */
public class Post {

    private int id;
    private String title;
    private String description;
    private boolean published;
    private Date date;
    private String backgroundPattern;
    private String folder;

    /**
     * Author-chosen URL slug. Null means "derive one from the title".
     *
     * Not unique: the post id precedes it in the URL, so the slug is decoration
     * on an already-unique address and two posts may share one harmlessly.
     */
    private String slug;

    /** Plain-text blurb under the title on the profile; null for none. Not the body (`description`). */
    private String summary;

    /** Where the post belongs: "profile", "notes" or "subscribers" (V017). */
    private String section = "profile";

    /**
     * Position on the author's profile, smallest first; ties go newest first.
     * Only PUT /api/users/{u}/posts/order writes it, so saving a post never
     * moves it.
     */
    private int sortOrder;

    /** Whether the profile card previews the post's first grid (V010). */
    private boolean cardGrid = true;

    /**
     * In lists only: the grid the card shows, as JSON (posts.card_preview,
     * V020), written out as an object. A list item carries this and no body.
     *
     * Left out of the JSON when null, on purpose. The client takes a present
     * "preview", null included, as the server's word on the card and does not
     * look in the body; a whole post (findById: the post page, the pinned
     * post) has a body and no preview, and "preview": null there would take
     * the grid off its card. A list item without a grid has neither, which
     * the client also reads as "no grid".
     *
     * Never read from a request, so a client that sends a post back cannot
     * set it.
     */
    @JsonRawValue
    @JsonInclude(JsonInclude.Include.NON_NULL)
    @JsonProperty(access = JsonProperty.Access.READ_ONLY)
    private String preview;


    public Post() {

    }

    public Post(int id, String title, String description, boolean published, Date date) {
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

    public void setId(int id) {
        this.id = id;
    }

    public int getId() {
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

    public String getBackgroundPattern() {
        return backgroundPattern;
    }

    public void setBackgroundPattern(String backgroundPattern) {
        this.backgroundPattern = backgroundPattern;
    }

    public String getFolder() {
        return folder;
    }

    public void setFolder(String folder) {
        this.folder = folder;
    }

    public String getSlug() { return slug; }

    public void setSlug(String slug) { this.slug = slug; }

    public String getSummary() { return summary; }

    public void setSummary(String summary) { this.summary = summary; }

    public String getSection() { return section; }

    public void setSection(String section) { this.section = section; }

    public int getSortOrder() { return sortOrder; }

    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }

    public boolean isCardGrid() { return cardGrid; }

    public void setCardGrid(boolean cardGrid) { this.cardGrid = cardGrid; }

    public String getPreview() { return preview; }

    public void setPreview(String preview) { this.preview = preview; }


    @Override
    public String toString() {
        return "Post [id=" + id + ", title=" + title + ", desc=" + description + ", published=" + published + ", timestamp=" + date +  "]";
    }

}