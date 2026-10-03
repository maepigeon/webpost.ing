package com.springbootprojects.webpostingserver.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

/**
 * Refuses oversized JSON bodies before anything reads them.
 *
 * The server accepts 50 MB bodies so that image and audio uploads work, and
 * several JSON endpoints read the whole body into memory before checking its
 * length, so one request could cost a lot of heap. Everything under /api/ that
 * is not a multipart upload is therefore held to 6 MB (a post may be 5 MB of
 * text plus its fields). Multipart uploads keep their own limits.
 *
 * A declared Content-Length over the limit is answered 413 without reading a
 * byte. A body with no Content-Length (chunked) is read up to the limit plus
 * one byte: over that it is refused, under it the bytes are handed on.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class RequestBodyLimitFilter extends OncePerRequestFilter {

    public static final long MAX_BODY_BYTES = 6L * 1024 * 1024;

    private final long maxBytes;

    public RequestBodyLimitFilter() { this(MAX_BODY_BYTES); }

    /** For tests, which cannot send megabytes cheaply. */
    RequestBodyLimitFilter(long maxBytes) { this.maxBytes = maxBytes; }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        if (!path.startsWith("/api/")) return true;
        String type = request.getContentType();
        return type != null && type.toLowerCase().startsWith("multipart/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long declared = request.getContentLengthLong();
        if (declared > maxBytes) {
            tooLarge(response);
            return;
        }
        if (declared < 0 && request.getHeader("Transfer-Encoding") != null) {
            byte[] body = request.getInputStream().readNBytes((int) maxBytes + 1);
            if (body.length > maxBytes) {
                tooLarge(response);
                return;
            }
            chain.doFilter(new Buffered(request, body), response);
            return;
        }
        chain.doFilter(request, response);
    }

    private static void tooLarge(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
        response.setContentType("application/json;charset=UTF-8");
        response.setHeader("Connection", "close");
        response.getWriter().write("{\"message\":\"That request is too large.\"}");
    }

    /** A request whose (chunked) body has already been read, served again from memory. */
    private static final class Buffered extends HttpServletRequestWrapper {
        private final byte[] body;

        Buffered(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = body;
        }

        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream in = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override public int read() { return in.read(); }
                @Override public int read(byte[] b, int off, int len) { return in.read(b, off, len); }
                @Override public boolean isFinished() { return in.available() == 0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener listener) { throw new UnsupportedOperationException(); }
            };
        }

        @Override
        public BufferedReader getReader() {
            String enc = getCharacterEncoding();
            Charset cs = enc == null ? StandardCharsets.UTF_8 : Charset.forName(enc);
            return new BufferedReader(new InputStreamReader(getInputStream(), cs));
        }

        @Override public int getContentLength() { return body.length; }
        @Override public long getContentLengthLong() { return body.length; }
    }
}
