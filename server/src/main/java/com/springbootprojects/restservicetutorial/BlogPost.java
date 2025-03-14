package com.springbootprojects.restservicetutorial;

/**
 * Simple Record (Resource Representation) class for the id and contend data
 * @param id - the
 * @param content
 */
public record BlogPost(long id, String content) { }