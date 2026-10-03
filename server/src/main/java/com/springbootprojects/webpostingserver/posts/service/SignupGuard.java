package com.springbootprojects.webpostingserver.posts.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * Optional Cloudflare Turnstile check for sign-up. Off (always passes) while
 * TURNSTILE_SECRET_KEY is empty. When on, a missing or rejected token, or any
 * failure reaching Cloudflare, fails closed.
 */
@Service
public class SignupGuard {

    public static final String VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    public static final String FAILED_MESSAGE = "Could not check you are human. Try again.";

    private static final Logger log = LoggerFactory.getLogger(SignupGuard.class);

    /** The one network call, abstracted so tests can fake it. */
    public interface Poster {
        /** POSTs a form body and returns the response body. */
        String postForm(String url, String formBody) throws Exception;
    }

    private final String siteKey;
    private final String secretKey;
    private final Poster poster;

    @Autowired
    public SignupGuard(@Value("${TURNSTILE_SITE_KEY:}") String siteKey,
                       @Value("${TURNSTILE_SECRET_KEY:}") String secretKey) {
        this(siteKey, secretKey, new JdkPoster());
    }

    public SignupGuard(String siteKey, String secretKey, Poster poster) {
        this.siteKey = siteKey == null ? "" : siteKey.trim();
        this.secretKey = secretKey == null ? "" : secretKey.trim();
        this.poster = poster;
    }

    public boolean enabled() { return !secretKey.isEmpty(); }

    /** The public site key for the widget, or null when the check is off. */
    public String siteKey() { return enabled() && !siteKey.isEmpty() ? siteKey : null; }

    public boolean verify(String token, String clientIp) {
        if (!enabled()) return true;
        if (token == null || token.isBlank() || token.length() > 4096) return false;
        try {
            String form = "secret=" + enc(secretKey) + "&response=" + enc(token)
                    + (clientIp != null && !clientIp.isBlank() ? "&remoteip=" + enc(clientIp) : "");
            JsonNode json = new ObjectMapper().readTree(poster.postForm(VERIFY_URL, form));
            return json != null && json.path("success").asBoolean(false);
        } catch (Exception e) {
            log.warn("Turnstile check failed: {}", e.toString());
            return false;
        }
    }

    private static String enc(String s) { return URLEncoder.encode(s, StandardCharsets.UTF_8); }

    static final class JdkPoster implements Poster {
        private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

        @Override
        public String postForm(String url, String formBody) throws Exception {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(3))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(formBody))
                    .build();
            return client.send(req, HttpResponse.BodyHandlers.ofString()).body();
        }
    }
}
