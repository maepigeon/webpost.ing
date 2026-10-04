package com.springbootprojects.webpostingserver.posts.service;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * The real {@link SsoHttp}: short timeouts, no redirects followed, and an
 * answer of at most 256 KB read (a token reply or a key set is a few KB).
 */
@Component
public class JdkSsoHttp implements SsoHttp {

    static final int MAX_BODY_BYTES = 256 * 1024;

    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    @Override
    public Response postForm(String url, Map<String, String> form) throws IOException {
        String body = form.entrySet().stream()
                .map(e -> enc(e.getKey()) + "=" + enc(e.getValue()))
                .collect(Collectors.joining("&"));
        return send(HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build());
    }

    @Override
    public Response get(String url) throws IOException {
        return send(HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(10))
                .header("Accept", "application/json")
                .GET()
                .build());
    }

    private Response send(HttpRequest request) throws IOException {
        try {
            HttpResponse<InputStream> r = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream in = r.body()) {
                byte[] bytes = in.readNBytes(MAX_BODY_BYTES + 1);
                if (bytes.length > MAX_BODY_BYTES) throw new IOException("The provider's answer was too large.");
                return new Response(r.statusCode(), new String(bytes, StandardCharsets.UTF_8));
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Interrupted while calling the provider.");
        }
    }

    private static String enc(String s) {
        return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8);
    }
}
