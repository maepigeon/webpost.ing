package com.springbootprojects.webpostingserver.posts.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.springbootprojects.webpostingserver.posts.service.PostPreview;
import com.springbootprojects.webpostingserver.posts.service.PostTextExtractor;
import com.springbootprojects.webpostingserver.posts.service.PostTextExtractor.Block;
import com.springbootprojects.webpostingserver.posts.service.PostTextExtractor.Extracted;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * What search engines, link previews and AI crawlers read: sitemap, robots.txt,
 * llms.txt, Atom feeds, and a plain HTML rendering of a profile or post.
 *
 * Everything here is public and read-only, and only ever shows PUBLISHED posts;
 * a draft looks exactly like a post that does not exist. Every query has a
 * LIMIT, and every response may be cached for five minutes.
 */
@RestController
@RequestMapping("/api/seo")
public class SeoController {

    static final int MAX_URLS = 5000;
    static final int MAX_PROFILE_URLS = 2000;
    static final int FEED_POSTS = 20;
    static final int PROFILE_POSTS = 50;
    private static final Pattern USERNAME = Pattern.compile("[A-Za-z0-9_.-]{1,32}");
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String SITE = "webpost.ing";

    @Autowired private JdbcTemplate jdbc;

    @Value("${app.base-url:http://localhost:5173}")
    private String baseUrl;

    // ── Small helpers ─────────────────────────────────────────────────────────

    /** Escapes text for HTML or XML, in element content and in quoted attributes alike. */
    public static String escape(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length() + 16);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '&' -> sb.append("&amp;");
                case '<' -> sb.append("&lt;");
                case '>' -> sb.append("&gt;");
                case '"' -> sb.append("&quot;");
                case '\'' -> sb.append("&#39;");
                default -> {
                    // Control characters are not allowed in XML at all.
                    if (c >= 0x20 || c == '\n' || c == '\r' || c == '\t') sb.append(c);
                }
            }
        }
        return sb.toString();
    }

    /** The link if it is http(s) or site-relative; null otherwise (javascript:, data:, protocol-relative…). */
    public static String safeUrl(String url) {
        if (url == null) return null;
        String u = url.trim();
        if (u.length() > 2000) return null;
        String lower = u.toLowerCase();
        if (lower.startsWith("http://") || lower.startsWith("https://")) return u;
        if (u.startsWith("/") && !u.startsWith("//") && !u.contains("\\")) return u;
        return null;
    }

    private String base() { return baseUrl.replaceAll("/+$", ""); }

    private String abs(String url) {
        String safe = safeUrl(url);
        if (safe == null) return null;
        return safe.startsWith("/") ? base() + safe : safe;
    }

    private String profileUrl(String username) { return base() + "/" + username; }

    private String postUrl(String username, Object slug, Object id) {
        String s = slug == null ? "" : slug.toString();
        return profileUrl(username) + "/" + (s.isBlank() ? id : s);
    }

    private static String iso(Object date) {
        Instant at = null;
        if (date instanceof Timestamp t) at = t.toInstant();
        else if (date instanceof Date d) at = d.toInstant();
        else if (date instanceof OffsetDateTime o) at = o.toInstant();
        else if (date instanceof Instant i) at = i;
        return at == null ? null : at.toString();
    }

    private static ResponseEntity<String> ok(String type, String body) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(java.time.Duration.ofSeconds(300)).cachePublic())
                .contentType(MediaType.parseMediaType(type + ";charset=UTF-8"))
                .body(body);
    }

    private static ResponseEntity<String> notFound() {
        String body = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Not found — " + SITE
                + "</title><meta name=\"robots\" content=\"noindex\"></head><body><h1>Not found</h1>"
                + "<p>There is nothing at this address.</p></body></html>";
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .cacheControl(CacheControl.maxAge(java.time.Duration.ofSeconds(300)).cachePublic())
                .contentType(MediaType.parseMediaType("text/html;charset=UTF-8"))
                .body(body);
    }

    // ── sitemap, robots, llms ─────────────────────────────────────────────────

    @GetMapping("/sitemap.xml")
    public ResponseEntity<String> sitemap() {
        List<Map<String, Object>> profiles = jdbc.queryForList("""
                SELECT u.username, MAX(p.date) AS last
                  FROM users u
                  JOIN users_posts_junctions j ON j.user_id = u.id
                  JOIN posts p ON p.id = j.post_id
                 WHERE p.published = TRUE AND p.section <> 'subscribers'
                 GROUP BY u.username
                 ORDER BY last DESC
                 LIMIT ?
                """, MAX_PROFILE_URLS);
        List<Map<String, Object>> posts = jdbc.queryForList("""
                SELECT u.username, p.id, p.slug, p.date, p.edited_at
                  FROM posts p
                  JOIN users_posts_junctions j ON j.post_id = p.id
                  JOIN users u ON u.id = j.user_id
                 WHERE p.published = TRUE AND p.section <> 'subscribers'
                 ORDER BY p.date DESC, p.id DESC
                 LIMIT ?
                """, MAX_URLS - profiles.size());

        StringBuilder xml = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
                + "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        url(xml, base() + "/", null);
        for (Map<String, Object> p : profiles) url(xml, profileUrl((String) p.get("username")), iso(p.get("last")));
        for (Map<String, Object> p : posts) {
            Object when = p.get("edited_at") != null ? p.get("edited_at") : p.get("date");
            url(xml, postUrl((String) p.get("username"), p.get("slug"), p.get("id")), iso(when));
        }
        return ok("application/xml", xml.append("</urlset>\n").toString());
    }

    private static void url(StringBuilder xml, String loc, String lastmod) {
        xml.append("  <url><loc>").append(escape(loc)).append("</loc>");
        if (lastmod != null) xml.append("<lastmod>").append(lastmod).append("</lastmod>");
        xml.append("</url>\n");
    }

    @GetMapping("/robots.txt")
    public ResponseEntity<String> robots() {
        return ok("text/plain", """
                User-agent: *
                Allow: /
                Allow: /api/seo/
                Disallow: /api/
                Disallow: /editor
                Disallow: /settings
                Disallow: /messages
                Disallow: /inbox
                Disallow: /routes/

                Sitemap: %s/api/seo/sitemap.xml
                """.formatted(base()));
    }

    @GetMapping("/llms.txt")
    public ResponseEntity<String> llms() {
        String b = base();
        return ok("text/plain", """
                # %1$s

                > %1$s is a small social blogging site. People write posts, follow each other and discuss. Each person has a profile page and a set of published posts. Only published posts are public.

                ## Addresses

                - Profile: %2$s/{username}
                - Post: %2$s/{username}/{slug-or-id}
                - Plain HTML rendering of any profile or post, for readers that do not run scripts: %2$s/api/seo/page?path=/{username} and %2$s/api/seo/page?path=/{username}/{slug-or-id}
                - Atom feed of a person's 20 newest posts: %2$s/api/seo/feed/{username}.atom
                - Sitemap: %2$s/api/seo/sitemap.xml

                ## Notes

                - The pages at the profile and post addresses are an app that runs in the browser; the plain HTML rendering carries the same title, text, author and date.
                - Drafts and private content are not available. Posts are the authors' own writing and remain theirs; link back to the post when you quote it.
                """.formatted(SITE, b));
    }

    // ── Atom feed ─────────────────────────────────────────────────────────────

    @GetMapping("/feed/{username}.atom")
    public ResponseEntity<String> feed(@PathVariable String username) {
        Map<String, Object> user = findUser(username);
        if (user == null) return notFound();
        String name = (String) user.get("username");
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT p.id, p.title, p.slug, p.summary, p.description, p.date
                  FROM posts p
                  JOIN users_posts_junctions j ON j.post_id = p.id
                 WHERE j.user_id = ? AND p.published = TRUE AND p.section <> 'subscribers'
                 ORDER BY p.date DESC, p.id DESC
                 LIMIT ?
                """, user.get("id"), FEED_POSTS);

        String self = base() + "/api/seo/feed/" + name + ".atom";
        String updated = rows.isEmpty() ? iso(user.get("registration_date")) : iso(rows.get(0).get("date"));
        StringBuilder xml = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
                + "<feed xmlns=\"http://www.w3.org/2005/Atom\">\n");
        xml.append("  <title>").append(escape(name + " on " + SITE)).append("</title>\n");
        xml.append("  <id>").append(escape(profileUrl(name))).append("</id>\n");
        xml.append("  <updated>").append(updated == null ? Instant.EPOCH : updated).append("</updated>\n");
        xml.append("  <link rel=\"self\" href=\"").append(escape(self)).append("\"/>\n");
        xml.append("  <link rel=\"alternate\" href=\"").append(escape(profileUrl(name))).append("\"/>\n");
        xml.append("  <author><name>").append(escape(name)).append("</name></author>\n");
        for (Map<String, Object> p : rows) {
            String link = postUrl(name, p.get("slug"), p.get("id"));
            String when = iso(p.get("date"));
            xml.append("  <entry>\n");
            xml.append("    <title>").append(escape((String) p.get("title"))).append("</title>\n");
            xml.append("    <link rel=\"alternate\" href=\"").append(escape(link)).append("\"/>\n");
            xml.append("    <id>").append(escape(link)).append("</id>\n");
            xml.append("    <updated>").append(when == null ? Instant.EPOCH : when).append("</updated>\n");
            xml.append("    <summary>").append(escape(describe(p))).append("</summary>\n");
            xml.append("  </entry>\n");
        }
        return ok("application/atom+xml", xml.append("</feed>\n").toString());
    }

    // ── HTML page for crawlers ────────────────────────────────────────────────

    @GetMapping("/page")
    public ResponseEntity<String> page(@RequestParam(name = "path", defaultValue = "") String path) {
        String clean = path.split("[?#]", 2)[0].replaceAll("/+$", "");
        if (!clean.startsWith("/")) return notFound();
        String[] parts = clean.substring(1).split("/", -1);
        if (parts.length < 1 || parts.length > 2 || !USERNAME.matcher(parts[0]).matches()) return notFound();
        if (parts.length == 2 && parts[1].isEmpty()) return notFound();
        return parts.length == 1 ? profilePage(parts[0]) : postPage(parts[0], parts[1]);
    }

    private Map<String, Object> findUser(String username) {
        if (username == null || !USERNAME.matcher(username).matches()) return null;
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT id, username, bio, bio_links, avatar_path, registration_date
                  FROM users WHERE lower(username) = lower(?) LIMIT 1
                """, username);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** The post's summary if it has one, else the start of its text. */
    private static String describe(Map<String, Object> post) {
        Object s = post.get("summary");
        if (s != null && !s.toString().isBlank()) return PostTextExtractor.shorten(s.toString(), 300);
        // Rows the sweep has done carry their plain text; the others, the body.
        Object version = post.get("preview_version");
        Object text = post.get("search_text");
        if (version instanceof Number n && n.intValue() >= PostPreview.VERSION)
            return text == null ? "" : PostTextExtractor.shorten(text.toString(), 160);
        Object body = post.get("description");
        return body == null ? "" : PostTextExtractor.extract(body.toString()).excerpt(160);
    }

    private ResponseEntity<String> postPage(String username, String segment) {
        // Same order as PostController.resolvePost: id, then stored slug, then the title's slug.
        Map<String, Object> post = null;
        if (segment.matches("\\d{1,9}")) {
            post = onePost("p.id = ? AND lower(u.username) = lower(?)", Integer.valueOf(segment), username);
        } else {
            post = onePost("lower(p.slug) = lower(?) AND lower(u.username) = lower(?)", segment, username);
            if (post == null) {
                List<Map<String, Object>> titles = jdbc.queryForList("""
                        SELECT p.id, p.title
                          FROM posts p
                          JOIN users_posts_junctions j ON j.post_id = p.id
                          JOIN users u ON u.id = j.user_id
                         WHERE lower(u.username) = lower(?) AND p.published = TRUE AND p.section <> 'subscribers' AND (p.slug IS NULL OR p.slug = '')
                         ORDER BY p.id
                         LIMIT 2000
                        """, username);
                for (Map<String, Object> t : titles) {
                    if (segment.equalsIgnoreCase(PostController.titleSlug((String) t.get("title")))) {
                        post = onePost("p.id = ?", t.get("id"));
                        break;
                    }
                }
            }
        }
        if (post == null) return notFound();

        String author = (String) post.get("username");
        String title = (String) post.get("title");
        Extracted text = PostTextExtractor.extract((String) post.get("description"));
        String description = describe(post);
        String url = postUrl(author, post.get("slug"), post.get("id"));
        String date = iso(post.get("date"));
        String image = null;
        for (Block b : text.blocks()) {
            if (b.kind().equals("img") && abs(b.extra()) != null) { image = abs(b.extra()); break; }
        }

        ObjectNode ld = JSON.createObjectNode();
        ld.put("@context", "https://schema.org");
        ld.put("@type", "BlogPosting");
        ld.put("headline", title);
        ld.putObject("author").put("@type", "Person").put("name", author).put("url", profileUrl(author));
        if (date != null) ld.put("datePublished", date);
        if (post.get("edited_at") != null) ld.put("dateModified", iso(post.get("edited_at")));
        ld.put("url", url);
        ld.put("description", description);
        if (image != null) ld.put("image", image);

        StringBuilder body = new StringBuilder();
        body.append("<article>\n<h1>").append(escape(title)).append("</h1>\n");
        body.append("<p>By <a href=\"").append(escape(profileUrl(author))).append("\">").append(escape(author)).append("</a>");
        if (date != null) body.append(" · <time datetime=\"").append(date).append("\">").append(date, 0, 10).append("</time>");
        body.append("</p>\n");
        renderBlocks(body, text.blocks());
        body.append("</article>\n");
        appendLinks(body, text.links());

        return ok("text/html", document(title + " — " + author, description, url, "article", title, image, ld, body.toString()));
    }

    /** One published post by a where-clause on posts p / users u; null when none (drafts never match). */
    private Map<String, Object> onePost(String where, Object... args) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT p.id, p.title, p.slug, p.summary, p.description, p.date, p.edited_at, u.username
                  FROM posts p
                  JOIN users_posts_junctions j ON j.post_id = p.id
                  JOIN users u ON u.id = j.user_id
                 WHERE p.published = TRUE AND p.section <> 'subscribers' AND """ + " " + where + """

                 ORDER BY p.id
                 LIMIT 1
                """, args);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private ResponseEntity<String> profilePage(String username) {
        Map<String, Object> user = findUser(username);
        if (user == null) return notFound();
        String name = (String) user.get("username");
        String bio = user.get("bio") == null ? "" : user.get("bio").toString().trim();
        List<Map<String, Object>> posts = jdbc.queryForList("""
                SELECT p.id, p.title, p.slug, p.summary, left(p.search_text, 1000) AS search_text, p.preview_version,
                       CASE WHEN (p.summary IS NULL OR p.summary = '') AND p.preview_version < ? THEN p.description END AS description,
                       p.date
                  FROM posts p
                  JOIN users_posts_junctions j ON j.post_id = p.id
                 WHERE j.user_id = ? AND p.published = TRUE AND p.section <> 'subscribers'
                 ORDER BY p.date DESC, p.id DESC
                 LIMIT ?
                """, PostPreview.VERSION, user.get("id"), PROFILE_POSTS);
        // A profile with nothing published is not worth indexing.
        if (posts.isEmpty()) return notFound();

        String url = profileUrl(name);
        String description = bio.isEmpty() ? "Posts by " + name + " on " + SITE + "." : PostTextExtractor.shorten(bio, 160);
        String image = user.get("avatar_path") == null ? null : abs(user.get("avatar_path").toString());

        ObjectNode ld = JSON.createObjectNode();
        ld.put("@context", "https://schema.org");
        ld.put("@type", "ProfilePage");
        ld.put("url", url);
        ObjectNode person = ld.putObject("mainEntity");
        person.put("@type", "Person").put("name", name).put("url", url);
        if (!bio.isEmpty()) person.put("description", bio);
        if (image != null) person.put("image", image);
        String joined = iso(user.get("registration_date"));
        if (joined != null) ld.put("dateCreated", joined);

        List<String[]> links = new ArrayList<>();
        try {
            JsonNode arr = JSON.readTree(user.get("bio_links") == null ? "[]" : user.get("bio_links").toString());
            if (arr.isArray()) for (JsonNode l : arr) {
                String href = safeUrl(l.path("url").asText(""));
                if (href != null && links.size() < 20) links.add(new String[]{ l.path("label").asText(href), href });
            }
        } catch (Exception ignored) { /* a bad links column just means no links */ }
        if (!links.isEmpty()) {
            ArrayNode same = person.putArray("sameAs");
            for (String[] l : links) if (l[1].startsWith("http")) same.add(l[1]);
        }

        StringBuilder body = new StringBuilder();
        body.append("<main>\n<h1>").append(escape(name)).append("</h1>\n");
        if (!bio.isEmpty()) body.append("<p>").append(escape(bio)).append("</p>\n");
        appendLinks(body, links);
        body.append("<h2>Posts</h2>\n<ul>\n");
        for (Map<String, Object> p : posts) {
            body.append("<li><a href=\"").append(escape(postUrl(name, p.get("slug"), p.get("id")))).append("\">")
                    .append(escape((String) p.get("title"))).append("</a>");
            String d = describe(p);
            if (!d.isEmpty()) body.append(" — ").append(escape(d));
            body.append("</li>\n");
        }
        body.append("</ul>\n<p><a href=\"").append(escape(base() + "/api/seo/feed/" + name + ".atom")).append("\">Atom feed</a></p>\n</main>\n");

        return ok("text/html", document(name + " (" + SITE + ")", description, url, "profile", name, image, ld, body.toString()));
    }

    private static void renderBlocks(StringBuilder out, List<Block> blocks) {
        String open = null;   // "ul" or "ol" while inside a list
        for (Block b : blocks) {
            if (open != null && !b.kind().equals("li")) { out.append("</").append(open).append(">\n"); open = null; }
            switch (b.kind()) {
                case "li" -> {
                    String tag = "ol".equals(b.extra()) ? "ol" : "ul";
                    if (open != null && !open.equals(tag)) { out.append("</").append(open).append(">\n"); open = null; }
                    if (open == null) { out.append('<').append(tag).append(">\n"); open = tag; }
                    out.append("<li>").append(escape(b.text())).append("</li>\n");
                }
                case "quote" -> out.append("<blockquote><p>").append(escape(b.text())).append("</p></blockquote>\n");
                case "code" -> out.append("<pre><code>").append(escape(b.text())).append("</code></pre>\n");
                case "img" -> {
                    String src = safeUrl(b.extra());
                    if (src != null) out.append("<img src=\"").append(escape(src)).append("\" alt=\"").append(escape(b.text())).append("\">\n");
                }
                default -> {
                    String tag = b.kind().matches("h[1-6]") ? "h" + Math.max(2, b.kind().charAt(1) - '0') : "p";
                    out.append('<').append(tag).append('>').append(escape(b.text())).append("</").append(tag).append(">\n");
                }
            }
        }
        if (open != null) out.append("</").append(open).append(">\n");
    }

    private static void appendLinks(StringBuilder out, List<String[]> links) {
        StringBuilder items = new StringBuilder();
        int n = 0;
        for (String[] l : links) {
            String href = safeUrl(l[1]);
            if (href == null || n++ >= 50) continue;
            items.append("<li><a href=\"").append(escape(href)).append("\">")
                    .append(escape(l[0].isBlank() ? href : l[0])).append("</a></li>\n");
        }
        if (items.length() > 0) out.append("<h2>Links</h2>\n<ul>\n").append(items).append("</ul>\n");
    }

    private String document(String title, String description, String url, String ogType, String ogTitle,
                            String image, ObjectNode ld, String body) {
        StringBuilder h = new StringBuilder("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n");
        h.append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n");
        h.append("<title>").append(escape(title)).append("</title>\n");
        h.append("<meta name=\"description\" content=\"").append(escape(description)).append("\">\n");
        h.append("<meta name=\"robots\" content=\"index, follow\">\n");
        h.append("<link rel=\"canonical\" href=\"").append(escape(url)).append("\">\n");
        h.append("<meta property=\"og:site_name\" content=\"").append(SITE).append("\">\n");
        h.append("<meta property=\"og:type\" content=\"").append(ogType).append("\">\n");
        h.append("<meta property=\"og:title\" content=\"").append(escape(ogTitle)).append("\">\n");
        h.append("<meta property=\"og:description\" content=\"").append(escape(description)).append("\">\n");
        h.append("<meta property=\"og:url\" content=\"").append(escape(url)).append("\">\n");
        if (image != null) h.append("<meta property=\"og:image\" content=\"").append(escape(image)).append("\">\n");
        h.append("<meta name=\"twitter:card\" content=\"").append(image != null ? "summary_large_image" : "summary").append("\">\n");
        h.append("<meta name=\"twitter:title\" content=\"").append(escape(ogTitle)).append("\">\n");
        h.append("<meta name=\"twitter:description\" content=\"").append(escape(description)).append("\">\n");
        if (image != null) h.append("<meta name=\"twitter:image\" content=\"").append(escape(image)).append("\">\n");
        // "<" is written as \u003c so no text in the data can close the script element.
        h.append("<script type=\"application/ld+json\">").append(ld.toString().replace("<", "\\u003c")).append("</script>\n");
        h.append("</head>\n<body>\n<header><a href=\"").append(escape(base() + "/")).append("\">").append(SITE).append("</a></header>\n");
        h.append(body);
        return h.append("</body>\n</html>\n").toString();
    }
}
