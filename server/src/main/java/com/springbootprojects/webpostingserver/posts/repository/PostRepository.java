package com.springbootprojects.webpostingserver.posts.repository;

import java.util.List;

import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.model.Post;

public interface PostRepository {
    int save(Post post, int userId);

    int update(Post post);

    Post findById(Long id);

    public LoginInfo getUsernameFromPostId(int postId);

    /** Every post of the author's "profile" section, as cards (see getPostsPage). */
    List<Post> getPostsFromUsername(String username);

    /** One page of an author's profile order, cut in SQL; drafts only when includeDrafts. */
    default List<Post> getPostsPage(String username, boolean includeDrafts, int limit, int offset) {
        return getPostsPage(username, "profile", includeDrafts, limit, offset);
    }

    /**
     * One page of a section: "profile", "notes", "subscribers" or "drafts"
     * (every unpublished post). What a non-owner may see is decided here.
     * The posts are cards: no description or backgroundPattern, and the
     * card's grid under preview. findById returns the whole post.
     */
    List<Post> getPostsPage(String username, String section, boolean owner, int limit, int offset);

    /** Tab counts as the reader may see them; keys they may not see are absent. */
    java.util.Map<String, Integer> countSections(String username, boolean owner);

    int deleteById(Long id);

    int reorder(int userId, List<Integer> orderedIds, java.util.Map<Integer, String> folders);
}
