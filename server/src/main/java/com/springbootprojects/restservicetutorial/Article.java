package com.springbootprojects.restservicetutorial;

/**
 * Resource Representation for a blog post.
 * @param id
 * @param header - The blog post header
 * @param body - The blog post body
 */
public record Article(long id, String header, String body) { }