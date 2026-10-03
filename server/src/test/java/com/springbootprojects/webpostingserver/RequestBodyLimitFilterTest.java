package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.config.RequestBodyLimitFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/** The body-size guard in front of every /api/ request that is not a file upload. */
class RequestBodyLimitFilterTest {

    private final RequestBodyLimitFilter filter = new RequestBodyLimitFilter();
    private final RequestBodyLimitFilter small = createSmall();

    private static RequestBodyLimitFilter createSmall() {
        try {
            var c = RequestBodyLimitFilter.class.getDeclaredConstructor(long.class);
            c.setAccessible(true);
            return c.newInstance(10L);
        } catch (ReflectiveOperationException e) { throw new IllegalStateException(e); }
    }

    private static MockHttpServletRequest post(String uri, byte[] body) {
        MockHttpServletRequest r = new MockHttpServletRequest("POST", uri);
        r.setContent(body);
        r.setContentType("application/json");
        return r;
    }

    /** A request that declares a length without us having to hold that many bytes. */
    private static MockHttpServletRequest declaring(String uri, long length) {
        MockHttpServletRequest r = new MockHttpServletRequest("POST", uri) {
            @Override public long getContentLengthLong() { return length; }
        };
        r.setContentType("application/json");
        return r;
    }

    private static boolean reachedController(RequestBodyLimitFilter f, MockHttpServletRequest req, MockHttpServletResponse res) throws Exception {
        MockFilterChain chain = new MockFilterChain();
        f.doFilter(req, res, chain);
        return chain.getRequest() != null;
    }

    @Test
    void declaredLengthOverSixMegabytesIsRefusedBeforeTheBodyIsRead() throws Exception {
        MockHttpServletRequest req = declaring("/api/posts", 6L * 1024 * 1024 + 1);
        MockHttpServletResponse res = new MockHttpServletResponse();

        assertThat(reachedController(filter, req, res)).isFalse();
        assertThat(res.getStatus()).isEqualTo(413);
        assertThat(res.getContentType()).startsWith("application/json");
        assertThat(res.getContentAsString()).contains("\"message\"");
    }

    @Test
    void sixMegabytesExactlyAndSmallerPass() throws Exception {
        MockHttpServletRequest req = declaring("/api/posts", 6L * 1024 * 1024);
        MockHttpServletResponse res = new MockHttpServletResponse();
        assertThat(reachedController(filter, req, res)).isTrue();
        assertThat(res.getStatus()).isEqualTo(200);
    }

    @Test
    void multipartUploadsKeepTheirOwnLimits() throws Exception {
        MockHttpServletRequest req = declaring("/api/upload", 40L * 1024 * 1024);
        req.setContentType("multipart/form-data; boundary=x");
        assertThat(reachedController(filter, req, new MockHttpServletResponse())).isTrue();
    }

    @Test
    void pathsOutsideApiAreNotTouched() throws Exception {
        MockHttpServletRequest req = declaring("/uploads/x", 40L * 1024 * 1024);
        assertThat(reachedController(filter, req, new MockHttpServletResponse())).isTrue();
    }

    @Test
    void aChunkedBodyOverTheLimitIsRefusedAndOneUnderItIsPassedOnIntact() throws Exception {
        MockHttpServletRequest big = post("/api/posts", "01234567890".getBytes());   // 11 bytes, limit 10
        big.addHeader("Transfer-Encoding", "chunked");
        MockHttpServletResponse res = new MockHttpServletResponse();
        assertThat(reachedController(small, big, res)).isFalse();
        assertThat(res.getStatus()).isEqualTo(413);

        MockHttpServletRequest ok = post("/api/posts", "0123456789".getBytes());     // exactly 10
        ok.addHeader("Transfer-Encoding", "chunked");
        AtomicReference<String> seen = new AtomicReference<>();
        small.doFilter(ok, new MockHttpServletResponse(), (rq, rs) ->
                seen.set(new String(((HttpServletRequest) rq).getInputStream().readAllBytes())));
        assertThat(seen.get()).isEqualTo("0123456789");
    }

    @Test
    void aRequestWithNoBodyAndNoLengthPasses() throws Exception {
        MockHttpServletRequest get = new MockHttpServletRequest("GET", "/api/search/posts");
        assertThat(reachedController(small, get, new MockHttpServletResponse())).isTrue();
    }
}
