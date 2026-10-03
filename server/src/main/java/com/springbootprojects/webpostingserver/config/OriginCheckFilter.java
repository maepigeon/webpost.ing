package com.springbootprojects.webpostingserver.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.net.URI;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * CSRF defence in depth. Cookies are SameSite=Lax, which already stops
 * cross-site credentialed writes; this additionally refuses any browser
 * state-changing request under /api/ whose Origin (or, lacking that, Referer)
 * is not one of app.allowed-origins, so a future cookie-policy change or a
 * text/plain form post cannot reopen the hole.
 *
 * A request with neither header is let through: browsers send Origin on every
 * cross-origin write, so only non-browser clients omit both (same as before).
 */
@Component
public class OriginCheckFilter extends OncePerRequestFilter {

    private static final Set<String> UNSAFE = Set.of("POST", "PUT", "PATCH", "DELETE");

    private final Set<String> allowed;
    private final boolean devMode;

    public OriginCheckFilter(@Value("${app.allowed-origins:http://localhost:5173}") String allowedOrigins,
                             @Value("${app.dev-mode:false}") boolean devMode) {
        this.devMode = devMode;
        this.allowed = Arrays.stream(allowedOrigins.split(","))
                .map(s -> s.trim().replaceAll("/+$", "").toLowerCase())
                .filter(s -> !s.isEmpty() && !s.equals("*"))
                .collect(Collectors.toSet());
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !UNSAFE.contains(request.getMethod()) || path == null || !path.startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String origin = request.getHeader("Origin");
        String referer = request.getHeader("Referer");
        String source = null;
        if (origin != null) source = origin;                   // "null" (sandboxed) fails the match below
        else if (referer != null) source = originOf(referer);   // unparsable referer -> "" -> rejected

        if (source != null && !isAllowed(source)) {
            reject(response);
            return;
        }
        chain.doFilter(request, response);
    }

    private boolean isAllowed(String source) {
        String o = source.trim().replaceAll("/+$", "").toLowerCase();
        if (allowed.contains(o)) return true;
        // Dev profile only: the dev server may be opened as 127.0.0.1 or localhost on any port.
        return devMode && o.matches("https?://(localhost|127\\.0\\.0\\.1|\\[::1\\])(:\\d+)?");
    }

    private static void reject(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write("{\"message\":\"Cross-site request refused.\"}");
    }

    private static String originOf(String url) {
        try {
            URI u = URI.create(url.trim());
            if (u.getScheme() == null || u.getHost() == null) return "";
            return u.getScheme() + "://" + u.getHost() + (u.getPort() == -1 ? "" : ":" + u.getPort());
        } catch (IllegalArgumentException e) {
            return "";
        }
    }
}
