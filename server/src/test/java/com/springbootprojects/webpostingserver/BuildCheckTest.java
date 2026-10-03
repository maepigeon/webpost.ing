package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.service.BuildCheck;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

/** The admin panel's update check: private repository, so a server-side token, cached, and off without one. */
class BuildCheckTest {

    private static final String HEAD = "{\"sha\":\"bbbbbbbbbbbb\",\"commit\":{\"message\":\"Newest\\n\\nbody\","
            + "\"committer\":{\"date\":\"2026-10-03T00:00:00Z\"}}}";

    /** Answers by path; a missing path fails like a 404. Remembers the calls and the tokens it was given. */
    static class FakeGitHub implements BuildCheck.GitHub {
        final Map<String, String> routes;
        final List<String> calls = new ArrayList<>();
        final List<String> tokens = new ArrayList<>();
        FakeGitHub(Map<String, String> routes) { this.routes = routes; }
        @Override public String get(String path, String token) throws Exception {
            calls.add(path);
            tokens.add(token);
            String body = routes.get(path);
            if (body == null) throw new IllegalStateException("GitHub answered 404");
            return body;
        }
    }

    private static BuildCheck check(FakeGitHub gh, AtomicLong clock) {
        return new BuildCheck("owner/site", "secret-token", gh, clock::get);
    }

    @Test
    void withoutATokenOrRepositoryItIsOffAndAsksNobody() {
        FakeGitHub gh = new FakeGitHub(Map.of());
        assertThat(new BuildCheck("owner/site", "", gh, () -> 0).latest("aaaaaaa")).isEqualTo(Map.of("available", false));
        assertThat(new BuildCheck("", "tok", gh, () -> 0).latest("aaaaaaa")).isEqualTo(Map.of("available", false));
        assertThat(new BuildCheck("not a repo", "tok", gh, () -> 0).enabled()).isFalse();
        assertThat(gh.calls).isEmpty();
    }

    @Test
    void whenGitHubFailsItSaysNotAvailableAndNeverLeaksTheToken() {
        FakeGitHub gh = new FakeGitHub(Map.of());
        Map<String, Object> answer = check(gh, new AtomicLong()).latest("aaaaaaa");
        assertThat(answer).isEqualTo(Map.of("available", false));
        assertThat(answer.toString()).doesNotContain("secret-token");
    }

    @Test
    void countsHowFarBehindAnOlderBuildIs() {
        FakeGitHub gh = new FakeGitHub(Map.of(
                "/repos/owner/site/commits/main", HEAD,
                "/repos/owner/site/compare/aaaaaaa...main", "{\"ahead_by\":3}"));
        Map<String, Object> a = check(gh, new AtomicLong()).latest("aaaaaaa");

        assertThat(a.get("available")).isEqualTo(true);
        assertThat(a.get("repo")).isEqualTo("owner/site");
        assertThat(a.get("behind")).isEqualTo(3);
        assertThat(a.get("latest")).isEqualTo(Map.of("sha", "bbbbbbbbbbbb", "message", "Newest", "date", "2026-10-03T00:00:00Z"));
        assertThat(gh.tokens).containsOnly("secret-token");
    }

    @Test
    void isUpToDateWhenTheBuildIsMain() {
        FakeGitHub gh = new FakeGitHub(Map.of("/repos/owner/site/commits/main", HEAD));
        assertThat(check(gh, new AtomicLong()).latest("bbbbbbbbbbbb").get("behind")).isEqualTo(0);
        assertThat(gh.calls).hasSize(1);
    }

    @Test
    void aBuildGitHubDoesNotKnowOrWithoutACommitCannotBeCompared() {
        FakeGitHub gh = new FakeGitHub(Map.of("/repos/owner/site/commits/main", HEAD));
        BuildCheck c = check(gh, new AtomicLong());
        Map<String, Object> unknown = c.latest("cccccccc");
        assertThat(unknown.get("available")).isEqualTo(true);
        assertThat(unknown.get("behind")).isNull();
        assertThat(c.latest("").get("behind")).isNull();
        // Anything that is not a commit id is never put in a URL.
        assertThat(c.latest("../../x").get("behind")).isNull();
        assertThat(gh.calls).noneMatch(p -> p.contains("../"));
    }

    @Test
    void anAnswerIsKeptForTenMinutesThenAskedAgain() {
        FakeGitHub gh = new FakeGitHub(Map.of("/repos/owner/site/commits/main", HEAD));
        AtomicLong clock = new AtomicLong(1_000);
        BuildCheck c = check(gh, clock);

        c.latest("bbbbbbbbbbbb");
        clock.addAndGet(9 * 60 * 1000L);
        c.latest("bbbbbbbbbbbb");
        assertThat(gh.calls).hasSize(1);

        clock.addAndGet(2 * 60 * 1000L);
        c.latest("bbbbbbbbbbbb");
        assertThat(gh.calls).hasSize(2);
    }

    @Test
    void aFailureIsRememberedOnlyForAMinute() {
        FakeGitHub gh = new FakeGitHub(Map.of());
        AtomicLong clock = new AtomicLong(1_000);
        BuildCheck c = check(gh, clock);

        c.latest("aaaaaaa");
        c.latest("aaaaaaa");
        assertThat(gh.calls).hasSize(1);

        clock.addAndGet(61 * 1000L);
        c.latest("aaaaaaa");
        assertThat(gh.calls).hasSize(2);
    }
}
