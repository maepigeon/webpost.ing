package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.config.OriginCheckFilter;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

/** The Origin/Referer guard on state-changing /api/ requests. */
class OriginCheckFilterTest {

    private final OriginCheckFilter filter = new OriginCheckFilter("https://webpost.ing, https://www.webpost.ing/", false);
    private final OriginCheckFilter dev = new OriginCheckFilter("http://localhost:5173", true);

    private record Result(int status, boolean passed, String body) {}

    private Result run(OriginCheckFilter f, String method, String uri, String origin, String referer) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest(method, uri);
        if (origin != null) req.addHeader("Origin", origin);
        if (referer != null) req.addHeader("Referer", referer);
        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        f.doFilter(req, res, chain);
        return new Result(res.getStatus(), chain.getRequest() != null, res.getContentAsString());
    }

    @Test
    void allowedOriginPasses() throws Exception {
        assertThat(run(filter, "POST", "/api/posts", "https://webpost.ing", null).passed()).isTrue();
        assertThat(run(filter, "DELETE", "/api/posts/1", "https://www.webpost.ing", null).passed()).isTrue();
    }

    @Test
    void foreignOriginIsRefusedWithJson() throws Exception {
        Result r = run(filter, "POST", "/api/posts", "https://evil.example", null);
        assertThat(r.passed()).isFalse();
        assertThat(r.status()).isEqualTo(403);
        assertThat(r.body()).contains("\"message\"");
        assertThat(run(filter, "PUT", "/api/x", "null", null).status()).isEqualTo(403);
        assertThat(run(filter, "PATCH", "/api/x", "https://webpost.ing.evil.example", null).status()).isEqualTo(403);
    }

    @Test
    void refererIsUsedOnlyWhenOriginIsAbsent() throws Exception {
        assertThat(run(filter, "POST", "/api/x", null, "https://webpost.ing/settings?a=1").passed()).isTrue();
        assertThat(run(filter, "POST", "/api/x", null, "https://evil.example/page").status()).isEqualTo(403);
        assertThat(run(filter, "POST", "/api/x", null, "garbage").status()).isEqualTo(403);
        // A good Origin wins over a bad Referer; a bad Origin is not rescued by a good Referer.
        assertThat(run(filter, "POST", "/api/x", "https://webpost.ing", "https://evil.example/").passed()).isTrue();
        assertThat(run(filter, "POST", "/api/x", "https://evil.example", "https://webpost.ing/").status()).isEqualTo(403);
    }

    @Test
    void noHeadersMeansNonBrowserClientAndPasses() throws Exception {
        assertThat(run(filter, "POST", "/api/x", null, null).passed()).isTrue();
    }

    @Test
    void safeMethodsAndNonApiPathsAreNotChecked() throws Exception {
        assertThat(run(filter, "GET", "/api/x", "https://evil.example", null).passed()).isTrue();
        assertThat(run(filter, "POST", "/other", "https://evil.example", null).passed()).isTrue();
    }

    @Test
    void devModeAcceptsAnyLocalhostPortButProdDoesNot() throws Exception {
        assertThat(run(dev, "POST", "/api/x", "http://127.0.0.1:4000", null).passed()).isTrue();
        assertThat(run(dev, "POST", "/api/x", "http://localhost:3000", null).passed()).isTrue();
        assertThat(run(dev, "POST", "/api/x", "https://evil.example", null).status()).isEqualTo(403);
        assertThat(run(filter, "POST", "/api/x", "http://localhost:5173", null).status()).isEqualTo(403);
    }
}
