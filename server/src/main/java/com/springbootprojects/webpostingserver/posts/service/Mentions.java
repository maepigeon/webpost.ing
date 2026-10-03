package com.springbootprojects.webpostingserver.posts.service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Finds @name mentions in a comment. A mention is "@" plus a username
 * (letters, digits, "_" and "-", 3 to 32 long) that is not glued to a word
 * before it (so an email address is not one) and does not run on into more
 * username characters. The client uses the same rule to draw the link.
 */
public final class Mentions {

    public static final int MAX = 5;

    private static final Pattern MENTION =
        Pattern.compile("(?<![\\w@])@([A-Za-z0-9_-]{3,32})(?![A-Za-z0-9_-])");

    private Mentions() {}

    /** Up to {@link #MAX} distinct names (case-insensitive), lower-cased, in order of appearance. */
    public static List<String> extract(String text) {
        if (text == null || text.indexOf('@') < 0) return List.of();
        Set<String> found = new LinkedHashSet<>();
        Matcher m = MENTION.matcher(text);
        while (m.find() && found.size() < MAX) found.add(m.group(1).toLowerCase(Locale.ROOT));
        return new ArrayList<>(found);
    }
}
