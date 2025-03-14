package com.springbootprojects.restservicetutorial;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.concurrent.atomic.AtomicLong;

@RestController
public class ArticleController {
    private static final String greetingTemplate = "Hello, %s!";
    private static final String blogPostTemplate = "Your blog heading: < %s >";
    private final AtomicLong greetingCounter = new AtomicLong();
    private final AtomicLong blogPostCounter = new AtomicLong();

    @GetMapping("/article")
    public BlogPost greeting(@RequestParam(value = "name", defaultValue = "World") String name) {
        return new BlogPost(greetingCounter.incrementAndGet(), String.format(greetingTemplate, name));
    }
    @GetMapping("/blogpost")
    public Article blogPost(@RequestParam(value = "heading", defaultValue = "World") String name) {
        return new Article(blogPostCounter.incrementAndGet(), String.format(blogPostTemplate, name), "This is the blog post body...");
    }
}
