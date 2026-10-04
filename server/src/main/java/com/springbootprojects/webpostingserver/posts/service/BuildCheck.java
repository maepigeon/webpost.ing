package com.springbootprojects.webpostingserver.posts.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.LongSupplier;
import java.util.regex.Pattern;

/**
 * How far the repository's main branch is ahead of the live build, for the
 * admin panel. The repository is private, so only the server asks GitHub, with
 * a read-only token from GITHUB_REPO and GITHUB_TOKEN (deploy.env); no browser
 * talks to GitHub and the token never leaves this class. Off (available:
 * false) while either is empty, or when GitHub cannot be reached or refuses.
 * Answers are cached for ten minutes, so the panel cannot run up GitHub's
 * rate limit.
 */
@Service
public class BuildCheck {

    private static final Logger log = LoggerFactory.getLogger(BuildCheck.class);

    static final long CACHE_MS = 10 * 60 * 1000L;
    /** A failed check is remembered briefly, so a dead network costs one timeout a minute, not one per click. */
    static final long FAILURE_CACHE_MS = 60 * 1000L;
    private static final int MAX_CACHED = 20;
    private static final Pattern REPO = Pattern.compile("[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+");
    private static final Pattern SHA = Pattern.compile("[0-9a-f]{7,40}");

    /** The one network call, abstracted so tests can fake it. */
    public interface GitHub {
        /** GETs a path under https://api.github.com with the token; returns the body, throws on any non-200. */
        String get(String path, String token) throws Exception;
    }

    private record Cached(Map<String, Object> answer, long expiresAt) {}

    private final String repo;
    private final String token;
    private final GitHub github;
    private final LongSupplier clock;
    private final Map<String, Cached> cache = new LinkedHashMap<>();

    @Autowired
    public BuildCheck(@Value("${GITHUB_REPO:}") String repo, @Value("${GITHUB_TOKEN:}") String token) {
        this(repo, token, new JdkGitHub(), System::currentTimeMillis);
    }

    public BuildCheck(String repo, String token, GitHub github, LongSupplier clock) {
        String r = repo == null ? "" : repo.trim();
        this.repo = REPO.matcher(r).matches() ? r : "";
        this.token = token == null ? "" : token.trim();
        this.github = github;
        this.clock = clock;
    }

    public boolean enabled() { return !repo.isEmpty() && !token.isEmpty(); }

    /**
     * { available: false } or { available: true, repo, behind, latest: { sha, message, date } }.
     * `behind` is 0 when up to date and null when the live build's commit is
     * unknown or not on GitHub.
     */
    public synchronized Map<String, Object> latest(String liveCommit) {
        if (!enabled()) return Map.of("available", false);
        String live = liveCommit != null && SHA.matcher(liveCommit.toLowerCase()).matches() ? liveCommit.toLowerCase() : "";
        long now = clock.getAsLong();
        Cached hit = cache.get(live);
        if (hit != null && hit.expiresAt > now) return hit.answer;

        Map<String, Object> answer;
        long ttl = CACHE_MS;
        try {
            answer = ask(live);
        } catch (Exception e) {
            // The message names the problem (a status, a timeout), never the token.
            log.warn("Build check could not reach GitHub: {}", e.toString());
            answer = Map.of("available", false);
            ttl = FAILURE_CACHE_MS;
        }
        if (cache.size() >= MAX_CACHED) cache.clear();
        cache.put(live, new Cached(answer, now + ttl));
        return answer;
    }

    private Map<String, Object> ask(String live) throws Exception {
        ObjectMapper json = new ObjectMapper();
        JsonNode head = json.readTree(github.get("/repos/" + repo + "/commits/main", token));
        String sha = head.path("sha").asText("");
        if (sha.isEmpty()) throw new IllegalStateException("GitHub's answer had no commit");

        Map<String, Object> latest = new LinkedHashMap<>();
        latest.put("sha", sha);
        latest.put("message", head.path("commit").path("message").asText("").split("\n", 2)[0]);
        latest.put("date", head.path("commit").path("committer").path("date").asText(""));

        Integer behind = null;
        if (!live.isEmpty()) {
            if (sha.startsWith(live)) behind = 0;
            else {
                try {
                    JsonNode diff = json.readTree(github.get("/repos/" + repo + "/compare/" + live + "...main", token));
                    if (diff.hasNonNull("ahead_by")) behind = diff.get("ahead_by").asInt();
                } catch (Exception e) {
                    // A build GitHub does not know (404) can still be shown against the latest commit.
                    log.info("Build check could not compare {}: {}", live, e.getMessage());
                }
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("available", true);
        out.put("repo", repo);
        out.put("behind", behind);
        out.put("latest", latest);
        return out;
    }

    static final class JdkGitHub implements GitHub {
        private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

        @Override
        public String get(String path, String token) throws Exception {
            HttpRequest req = HttpRequest.newBuilder(URI.create("https://api.github.com" + path))
                    .timeout(Duration.ofSeconds(3))
                    .header("Accept", "application/vnd.github+json")
                    .header("Authorization", "Bearer " + token)
                    .header("X-GitHub-Api-Version", "2022-11-28")
                    .GET()
                    .build();
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) throw new IllegalStateException("GitHub answered " + res.statusCode());
            return res.body();
        }
    }
}
