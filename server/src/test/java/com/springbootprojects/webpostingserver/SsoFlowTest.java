package com.springbootprojects.webpostingserver;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.service.SsoAccounts;
import com.springbootprojects.webpostingserver.posts.service.SsoFlowStore;
import com.springbootprojects.webpostingserver.posts.service.SsoHttp;
import com.springbootprojects.webpostingserver.posts.validator.LoginRateLimiter;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Sign in with Google and Microsoft, end to end against the real application
 * and database, with {@link FakeSsoProvider} standing in for the providers.
 * Each test drives the flow the way a browser would: start, come back with a
 * code, and for a newcomer choose a username. Every name starts with "sso_".
 */
@SpringBootTest(properties = {
        "SSO_GOOGLE_CLIENT_ID=google-client.test", "SSO_GOOGLE_CLIENT_SECRET=google-secret.test",
        "SSO_MICROSOFT_CLIENT_ID=microsoft-client.test", "SSO_MICROSOFT_CLIENT_SECRET=microsoft-secret.test",
        "SSO_APPLE_CLIENT_ID=apple-services-id.test",    // configured, and still off: Apple is not built
        "app.base-url=https://site.test"})
@AutoConfigureMockMvc(print = org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint.NONE)
@Import(SsoFlowTest.Providers.class)
class SsoFlowTest {

    static final FakeSsoProvider FAKE = new FakeSsoProvider();

    @TestConfiguration
    static class Providers {
        @Bean
        @Primary
        SsoHttp fakeSsoHttp() {
            return FAKE;
        }
    }

    private static final String GOOD_PW = "Correct-horse-42!";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final AtomicInteger NEXT_ADDRESS = new AtomicInteger(1);
    private static final String LOGIN = "https://site.test/routes/Login?sso=";
    private static final String SETTINGS = "https://site.test/settings?sso=";

    private static CrossRunLock runLock;

    @BeforeAll
    static void waitForOtherRuns() throws Exception {
        runLock = CrossRunLock.acquire("accounts");     // this class rewrites the sign-up settings too
        FAKE.clients.put("google-client.test", "google-secret.test");
        FAKE.clients.put("microsoft-client.test", "microsoft-secret.test");
    }

    @AfterAll
    static void letOtherRunsGo() throws Exception {
        runLock.close();
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired SsoFlowStore flows;

    private String savedDailyLimit;

    @BeforeEach
    void setUp() {
        cleanUp();
        savedDailyLimit = jdbc.queryForList("SELECT value FROM system_settings WHERE key='max_daily_registrations'",
                String.class).stream().findFirst().orElse("5");
        setting("max_daily_registrations", "-1");
        setting("invite_required", "false");
    }

    @AfterEach
    void cleanUp() {
        jdbc.update("DELETE FROM invite_codes WHERE code LIKE 'SSO-TEST-%'");
        jdbc.update("DELETE FROM users WHERE username LIKE 'sso\\_%'");
        jdbc.update("DELETE FROM system_settings WHERE key = 'invite_required'");
        if (savedDailyLimit != null) setting("max_daily_registrations", savedDailyLimit);
        LoginRateLimiter.clear();
        SsoAccounts.clearLimits();
        flows.clear();
        flows.setClock(Clock.systemUTC());
        FAKE.reset();
    }

    // ── a browser, and the steps of the flow ──────────────────────────────────

    /** Keeps cookies between requests like a browser does. */
    private static class Browser {
        final Map<String, Cookie> jar = new LinkedHashMap<>();
        String address = "127.0.0.1";

        void keep(MvcResult r) {
            for (Cookie c : r.getResponse().getCookies()) {
                if (c.getMaxAge() == 0) jar.remove(c.getName());
                else jar.put(c.getName(), c);
            }
        }

        String value(String name) { return jar.containsKey(name) ? jar.get(name).getValue() : null; }
    }

    private static String freshAddress() {
        int n = NEXT_ADDRESS.getAndIncrement();
        return "10.99." + (n / 250) + "." + (n % 250 + 1);
    }

    private MvcResult send(Browser b, MockHttpServletRequestBuilder request) throws Exception {
        request.with(r -> { r.setRemoteAddr(b.address); return r; });
        if (!b.jar.isEmpty()) request.cookie(b.jar.values().toArray(new Cookie[0]));
        MvcResult result = mvc.perform(request).andReturn();
        b.keep(result);
        return result;
    }

    private MvcResult get(Browser b, String url) throws Exception {
        return send(b, MockMvcRequestBuilders.get(url));
    }

    private MvcResult post(Browser b, String url, Object body) throws Exception {
        return send(b, MockMvcRequestBuilders.post(url).contentType("application/json").content(JSON.writeValueAsString(body)));
    }

    private static int status(MvcResult r) { return r.getResponse().getStatus(); }

    private static String location(MvcResult r) { return r.getResponse().getHeader("Location"); }

    private static JsonNode json(MvcResult r) throws Exception { return JSON.readTree(r.getResponse().getContentAsString()); }

    private static String message(MvcResult r) throws Exception { return json(r).path("message").asText(); }

    private static Map<String, String> query(String url) {
        Map<String, String> out = new LinkedHashMap<>();
        UriComponentsBuilder.fromUriString(url).build().getQueryParams()
                .forEach((k, v) -> out.put(k, URLDecoder.decode(v.get(0), StandardCharsets.UTF_8)));
        return out;
    }

    /** Presses "Continue with ...": returns what the site sent to the provider. */
    private Map<String, String> start(Browser b, String provider) throws Exception {
        MvcResult r = get(b, "/api/auth/sso/" + provider + "/start");
        assertThat(status(r)).as("start").isEqualTo(302);
        return query(location(r));
    }

    /** The provider sends the browser back with a code for this token. */
    private MvcResult comeBack(Browser b, String provider, Map<String, String> sent, FakeSsoProvider.Token token) throws Exception {
        String code = FAKE.approve(provider, sent, token);
        return get(b, "/api/auth/sso/" + provider + "/callback?code=" + code + "&state=" + sent.get("state"));
    }

    /** Start, approve, come back; the token can be changed on the way. */
    private MvcResult roundTrip(Browser b, String provider, Consumer<FakeSsoProvider.Token> change) throws Exception {
        Map<String, String> sent = start(b, provider);
        FakeSsoProvider.Token token = FAKE.token(provider, sent.get("client_id"), sent.get("nonce"));
        change.accept(token);
        return comeBack(b, provider, sent, token);
    }

    /** A newcomer signs in with a provider account and takes a username; returns their browser, signed in. */
    private Browser join(String provider, String subject, String email, String username) throws Exception {
        Browser b = new Browser();
        MvcResult back = roundTrip(b, provider, t -> { t.subject = subject; t.email = email; });
        assertThat(location(back)).isEqualTo("https://site.test/routes/ChooseUsername");
        MvcResult made = post(b, "/api/auth/sso/complete", Map.of("username", username));
        assertThat(status(made)).as(made.getResponse().getContentAsString()).isEqualTo(201);
        return b;
    }

    private int makePasswordUser(String name, String email, boolean verified) {
        return jdbc.queryForObject("""
                INSERT INTO users (username, password, email, email_verified)
                VALUES (?, ?, ?, ?) RETURNING id""", Integer.class,
                name, JdbcLoginRepository.hashPassword(GOOD_PW), email, verified);
    }

    private Browser signedInWithPassword(String name) throws Exception {
        Browser b = new Browser();
        b.address = freshAddress();
        MvcResult r = post(b, "/api/loginSessionAttempt", Map.of("username", name, "password", GOOD_PW));
        assertThat(status(r)).isEqualTo(200);
        return b;
    }

    private void setting(String key, String value) {
        if (jdbc.update("UPDATE system_settings SET value=? WHERE key=?", value, key) == 0)
            jdbc.update("INSERT INTO system_settings(key, value) VALUES(?, ?)", key, value);
    }

    private Integer idOf(String username) {
        return jdbc.queryForList("SELECT id FROM users WHERE username = ?", Integer.class, username)
                .stream().findFirst().orElse(null);
    }

    private int identities(String username) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM user_identities i JOIN users u ON u.id = i.user_id WHERE u.username = ?",
                Integer.class, username);
    }

    private List<String> log(String username) {
        return jdbc.queryForList("SELECT e.kind || ':' || COALESCE(e.detail, '') FROM security_events e "
                + "JOIN users u ON u.id = e.user_id WHERE u.username = ? ORDER BY e.id", String.class, username);
    }

    /** Who the server says this browser is signed in as, or null. */
    private String whoAmI(Browser b) throws Exception {
        MvcResult r = post(b, "/api/authorizeSession", Map.of());
        return status(r) == 200 ? r.getResponse().getContentAsString() : null;
    }

    private void assertNobodySignedIn(Browser b, MvcResult r, String outcome) {
        assertThat(status(r)).isEqualTo(302);
        assertThat(location(r)).isEqualTo(LOGIN + outcome);
        assertThat(b.value("authToken")).as("no session cookie").isNull();
        assertThat(b.value("sso_pending")).as("no pending identity").isNull();
    }

    // ── the happy path ────────────────────────────────────────────────────────

    @Test
    void aNewcomerSignsInWithGoogleChoosesAUsernameAndIsSignedIn() throws Exception {
        Browser b = new Browser();
        Map<String, String> sent = start(b, "google");

        // What leaves for Google: code flow, our client, PKCE, state and nonce, and only the scopes we need.
        assertThat(sent).containsEntry("response_type", "code").containsEntry("client_id", "google-client.test")
                .containsEntry("redirect_uri", "https://site.test/api/auth/sso/google/callback")
                .containsEntry("scope", "openid email").containsEntry("code_challenge_method", "S256");
        assertThat(sent.get("state")).hasSize(43);
        assertThat(sent.get("nonce")).hasSize(43).isNotEqualTo(sent.get("state"));
        assertThat(sent.get("code_challenge")).hasSize(43);
        Cookie stateCookie = b.jar.get("sso_state");
        assertThat(stateCookie.isHttpOnly()).isTrue();
        assertThat(stateCookie.getPath()).isEqualTo("/api/auth/sso");
        assertThat(stateCookie.getMaxAge()).isEqualTo(600);
        assertThat(stateCookie.getValue()).isNotEqualTo(sent.get("state"));

        FakeSsoProvider.Token token = FAKE.token("google", "google-client.test", sent.get("nonce"));
        token.subject = "google-sub-1";
        token.email = "Newcomer@Example.Test";
        MvcResult back = comeBack(b, "google", sent, token);
        assertThat(FAKE.problems).as("the code exchange carried the secret, the redirect address and the PKCE verifier").isEmpty();

        // Not a member yet: nothing is created, the browser goes to pick a name.
        assertThat(status(back)).isEqualTo(302);
        assertThat(location(back)).isEqualTo("https://site.test/routes/ChooseUsername");
        assertThat(b.value("authToken")).isNull();
        assertThat(b.jar.get("sso_pending").isHttpOnly()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_identities WHERE subject = 'google-sub-1'", Integer.class)).isZero();

        JsonNode pending = json(get(b, "/api/auth/sso/pending"));
        assertThat(pending.path("providerName").asText()).isEqualTo("Google");
        assertThat(pending.path("email").asText()).isEqualTo("newcomer@example.test");
        assertThat(pending.path("inviteRequired").asBoolean()).isFalse();

        MvcResult made = post(b, "/api/auth/sso/complete", Map.of("username", "sso_newcomer"));
        assertThat(status(made)).isEqualTo(201);
        assertThat(json(made).path("username").asText()).isEqualTo("sso_newcomer");
        assertThat(json(made).path("signedIn").asBoolean()).isTrue();
        assertThat(whoAmI(b)).isEqualTo("sso_newcomer");
        assertThat(b.value("sso_pending")).as("the pending identity is spent").isNull();
        Cookie session = b.jar.get("authToken");
        assertThat(session.isHttpOnly()).isTrue();
        assertThat(session.getPath()).isEqualTo("/");
        assertThat(session.getAttribute("SameSite")).isEqualTo("Lax");

        // The account: no password, the address Google proved, one identity, and nothing secret kept.
        Map<String, Object> user = jdbc.queryForMap("SELECT password, email, email_verified FROM users WHERE username = 'sso_newcomer'");
        assertThat(user.get("password")).isEqualTo(SsoAccounts.NO_PASSWORD);
        assertThat(user.get("email")).isEqualTo("newcomer@example.test");
        assertThat(user.get("email_verified")).isEqualTo(true);
        Map<String, Object> identity = jdbc.queryForMap(
                "SELECT provider, subject, email, email_verified FROM user_identities WHERE user_id = ?", idOf("sso_newcomer"));
        assertThat(identity).containsEntry("provider", "google").containsEntry("subject", "google-sub-1")
                .containsEntry("email", "newcomer@example.test").containsEntry("email_verified", true);
        assertThat(log("sso_newcomer")).containsExactly("sign_in:Google");

        // The ticket cannot make a second account.
        assertThat(status(post(b, "/api/auth/sso/complete", Map.of("username", "sso_second")))).isEqualTo(410);
        assertThat(idOf("sso_second")).isNull();
    }

    @Test
    void theSameGoogleAccountSignsInTheSameMemberUnderTheSessionCap() throws Exception {
        join("google", "google-sub-2", "two@example.test", "sso_returning");

        Browser later = new Browser();
        MvcResult back = roundTrip(later, "google", t -> { t.subject = "google-sub-2"; t.email = "renamed@example.test"; });
        assertThat(status(back)).isEqualTo(302);
        assertThat(location(back)).isEqualTo(LOGIN + "ok");
        assertThat(whoAmI(later)).isEqualTo("sso_returning");
        assertThat(log("sso_returning")).containsExactly("sign_in:Google", "sign_in:Google");
        // The address the provider reports is noted on the identity and never copied onto the account.
        assertThat(jdbc.queryForObject("SELECT email FROM user_identities WHERE subject = 'google-sub-2'", String.class))
                .isEqualTo("renamed@example.test");
        assertThat(jdbc.queryForObject("SELECT email FROM users WHERE username = 'sso_returning'", String.class))
                .isEqualTo("two@example.test");

        for (int i = 0; i < 6; i++) roundTrip(new Browser(), "google", t -> t.subject = "google-sub-2");
        assertThat(JdbcLoginRepository.sessionCountFor("sso_returning")).isEqualTo(5);
        assertThat(whoAmI(later)).as("the oldest sessions were dropped").isNull();
    }

    @Test
    void microsoftWorksTheSameAndItsUnprovenAddressIsNotPutOnTheAccount() throws Exception {
        Browser b = new Browser();
        Map<String, String> sent = start(b, "microsoft");
        assertThat(sent).containsEntry("client_id", "microsoft-client.test")
                .containsEntry("redirect_uri", "https://site.test/api/auth/sso/microsoft/callback");

        FakeSsoProvider.Token token = FAKE.token("microsoft", "microsoft-client.test", sent.get("nonce"));
        token.subject = "ms-sub-1";
        token.email = "person@outlook.test";
        assertThat(location(comeBack(b, "microsoft", sent, token))).isEqualTo("https://site.test/routes/ChooseUsername");
        assertThat(FAKE.problems).isEmpty();
        assertThat(status(post(b, "/api/auth/sso/complete", Map.of("username", "sso_outlook")))).isEqualTo(201);

        Map<String, Object> user = jdbc.queryForMap("SELECT email, email_verified FROM users WHERE username = 'sso_outlook'");
        assertThat(user.get("email")).isNull();
        assertThat(user.get("email_verified")).isEqualTo(false);
        assertThat(jdbc.queryForObject("SELECT email FROM user_identities WHERE subject = 'ms-sub-1'", String.class))
                .isEqualTo("person@outlook.test");
        assertThat(log("sso_outlook")).containsExactly("sign_in:Microsoft");

        // Back again, and a token whose issuer is not its own tenant gets nowhere.
        Browser again = new Browser();
        assertThat(location(roundTrip(again, "microsoft", t -> t.subject = "ms-sub-1"))).isEqualTo(LOGIN + "ok");
        assertThat(whoAmI(again)).isEqualTo("sso_outlook");
        Browser forged = new Browser();
        assertNobodySignedIn(forged, roundTrip(forged, "microsoft", t -> {
            t.subject = "ms-sub-1";
            t.tenant = "11111111-2222-3333-4444-555555555555";
        }), "failed");

        // The same subject at the other provider is a different person.
        Browser google = new Browser();
        assertThat(location(roundTrip(google, "google", t -> t.subject = "ms-sub-1")))
                .isEqualTo("https://site.test/routes/ChooseUsername");
    }

    // ── what must be refused ──────────────────────────────────────────────────

    @Test
    void aCallbackWithTheWrongStateOrFromAnotherBrowserSignsNobodyIn() throws Exception {
        join("google", "google-sub-3", "three@example.test", "sso_victim");

        int exchanges = FAKE.tokenCalls.get();

        // A state the server never issued.
        Browser b = new Browser();
        Map<String, String> sent = start(b, "google");
        FakeSsoProvider.Token token = FAKE.token("google", "google-client.test", sent.get("nonce"));
        token.subject = "google-sub-3";
        String code = FAKE.approve("google", sent, token);
        assertNobodySignedIn(b, get(b, "/api/auth/sso/google/callback?code=" + code + "&state=" + SsoFlowStore.randomToken()), "failed");
        assertNobodySignedIn(b, get(b, "/api/auth/sso/google/callback?code=" + code), "failed");
        assertThat(FAKE.tokenCalls.get()).as("the code is not even exchanged").isEqualTo(exchanges);

        // The right state, in a browser that did not start the flow (a link sent to a victim).
        Browser attacker = new Browser();
        Map<String, String> theirs = start(attacker, "google");
        FakeSsoProvider.Token t2 = FAKE.token("google", "google-client.test", theirs.get("nonce"));
        t2.subject = "google-sub-3";
        Browser victim = new Browser();
        assertNobodySignedIn(victim, comeBack(victim, "google", theirs, t2), "failed");
        Browser other = new Browser();
        start(other, "google");                           // has a state cookie of its own, just not this one
        Map<String, String> third = start(attacker, "google");
        assertNobodySignedIn(other, comeBack(other, "google", third, FAKE.token("google", "google-client.test", third.get("nonce"))), "failed");

        // A Google state presented at Microsoft's callback.
        Map<String, String> g = start(b, "google");
        assertNobodySignedIn(b, get(b, "/api/auth/sso/microsoft/callback?code=x&state=" + g.get("state")), "failed");

        // Ten minutes is all a state lives.
        Map<String, String> slow = start(b, "google");
        flows.setClock(Clock.offset(Clock.systemUTC(), Duration.ofMinutes(11)));
        assertNobodySignedIn(b, comeBack(b, "google", slow, FAKE.token("google", "google-client.test", slow.get("nonce"))), "failed");
    }

    @Test
    void aReplayedCallbackDoesNothing() throws Exception {
        join("google", "google-sub-4", "four@example.test", "sso_replayed");

        Browser b = new Browser();
        Map<String, String> sent = start(b, "google");
        FakeSsoProvider.Token token = FAKE.token("google", "google-client.test", sent.get("nonce"));
        token.subject = "google-sub-4";
        String code = FAKE.approve("google", sent, token);
        String url = "/api/auth/sso/google/callback?code=" + code + "&state=" + sent.get("state");
        assertThat(location(get(b, url))).isEqualTo(LOGIN + "ok");
        int sessions = JdbcLoginRepository.sessionCountFor("sso_replayed");
        int exchanges = FAKE.tokenCalls.get();

        // The very same address again (the back button, or someone who saw it): the state is spent.
        Browser thief = new Browser();
        thief.jar.put("sso_state", b.jar.get("sso_state"));
        assertNobodySignedIn(thief, get(thief, url), "failed");
        assertThat(FAKE.tokenCalls.get()).isEqualTo(exchanges);
        assertThat(JdbcLoginRepository.sessionCountFor("sso_replayed")).isEqualTo(sessions);

        // A fresh state with the old code: the provider refuses a code it has already given out.
        Map<String, String> fresh = start(thief, "google");
        assertNobodySignedIn(thief, get(thief, "/api/auth/sso/google/callback?code=" + code + "&state=" + fresh.get("state")), "failed");
        assertThat(JdbcLoginRepository.sessionCountFor("sso_replayed")).isEqualTo(sessions);
    }

    @Test
    void aTokenThatIsForgedForAnotherAppExpiredOrForAnotherSignInIsRefused() throws Exception {
        join("google", "google-sub-5", "five@example.test", "sso_target");
        int sessions = JdbcLoginRepository.sessionCountFor("sso_target");

        List<Consumer<FakeSsoProvider.Token>> wrong = List.of(
                t -> t.signWith = FAKE.forgersKey,                              // bad signature
                t -> t.audience = List.of("another-app.test"),                  // wrong audience
                t -> t.expires = Instant.now().minusSeconds(600),               // expired
                t -> t.nonce = SsoFlowStore.randomToken(),                      // a token from another sign-in
                t -> t.issuer = "https://accounts.example.test",                // wrong issuer
                t -> t.keyId = "unknown-key");                                  // a key the provider does not publish
        for (Consumer<FakeSsoProvider.Token> change : wrong) {
            Browser b = new Browser();
            assertNobodySignedIn(b, roundTrip(b, "google", t -> { t.subject = "google-sub-5"; change.accept(t); }), "failed");
        }
        assertThat(JdbcLoginRepository.sessionCountFor("sso_target")).isEqualTo(sessions);

        // The person pressed Cancel at the provider, or the provider reported a fault.
        Browser b = new Browser();
        Map<String, String> sent = start(b, "google");
        assertNobodySignedIn(b, get(b, "/api/auth/sso/google/callback?error=access_denied&state=" + sent.get("state")), "cancelled");
        sent = start(b, "google");
        assertNobodySignedIn(b, get(b, "/api/auth/sso/google/callback?error=server_error&state=" + sent.get("state")), "failed");
    }

    @Test
    void anAddressNeverLinksOrSignsAnyoneIn() throws Exception {
        makePasswordUser("sso_owner", "owner@example.test", true);
        makePasswordUser("sso_unconfirmed", "loose@example.test", false);

        // Google vouches for an address a member has confirmed: they are told to sign in and link, nothing more.
        Browser b = new Browser();
        assertNobodySignedIn(b, roundTrip(b, "google", t -> { t.subject = "google-sub-6"; t.email = "Owner@Example.Test"; }), "exists");
        assertThat(identities("sso_owner")).isZero();

        // The provider does not vouch for the address: it matches nothing, and a new account does not get it.
        Browser c = new Browser();
        MvcResult back = roundTrip(c, "google", t -> { t.subject = "google-sub-7"; t.email = "owner@example.test"; t.emailVerified = false; });
        assertThat(location(back)).isEqualTo("https://site.test/routes/ChooseUsername");
        assertThat(status(post(c, "/api/auth/sso/complete", Map.of("username", "sso_lookalike")))).isEqualTo(201);
        assertThat(jdbc.queryForMap("SELECT email, email_verified FROM users WHERE username = 'sso_lookalike'"))
                .containsEntry("email", null).containsEntry("email_verified", false);
        assertThat(identities("sso_owner")).isZero();

        // An address nobody has confirmed here is free to arrive verified on a new account.
        Browser d = new Browser();
        roundTrip(d, "google", t -> { t.subject = "google-sub-8"; t.email = "loose@example.test"; });
        assertThat(status(post(d, "/api/auth/sso/complete", Map.of("username", "sso_proven")))).isEqualTo(201);
        assertThat(identities("sso_unconfirmed")).isZero();

        // Confirmed between the callback and choosing the name: still refused.
        Browser e = new Browser();
        roundTrip(e, "google", t -> { t.subject = "google-sub-9"; t.email = "late@example.test"; });
        makePasswordUser("sso_late", "late@example.test", true);
        MvcResult refused = post(e, "/api/auth/sso/complete", Map.of("username", "sso_toolate"));
        assertThat(status(refused)).isEqualTo(409);
        assertThat(message(refused)).isEqualTo(SsoAccounts.EMAIL_EXISTS_MESSAGE);
        assertThat(idOf("sso_toolate")).isNull();
    }

    // ── choosing the username ─────────────────────────────────────────────────

    @Test
    void theUsernameFollowsTheSignUpRulesAndATakenNameCanBeTriedAgain() throws Exception {
        makePasswordUser("sso_Taken", null, false);
        Browser b = new Browser();
        roundTrip(b, "google", t -> t.subject = "google-sub-10");

        Map<String, Integer> expected = new LinkedHashMap<>();
        expected.put("", 400);
        expected.put("ab", 400);
        expected.put("x".repeat(33), 400);
        expected.put("has space", 400);
        expected.put("émile", 400);
        expected.put("Settings", 400);          // reserved, whatever the capitals
        expected.put("sso_taken", 409);         // differs from an existing name only in capitals
        for (Map.Entry<String, Integer> e : expected.entrySet()) {
            MvcResult r = post(b, "/api/auth/sso/complete", Map.of("username", e.getKey()));
            assertThat(status(r)).as("username '" + e.getKey() + "'").isEqualTo(e.getValue());
            assertThat(message(r)).isNotBlank();
            assertThat(b.value("authToken")).isNull();
        }
        assertThat(message(post(b, "/api/auth/sso/complete", Map.of("username", "sso_taken")))).isEqualTo("Username already taken.");
        assertThat(message(post(b, "/api/auth/sso/complete", Map.of("username", "admin")))).contains("reserved");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_identities WHERE subject = 'google-sub-10'", Integer.class)).isZero();

        // The same sign-in is still good for a free name.
        assertThat(status(post(b, "/api/auth/sso/complete", Map.of("username", " sso_free ")))).isEqualTo(201);
        assertThat(whoAmI(b)).isEqualTo("sso_free");

        // No pending sign-in at all: nothing to complete.
        Browser stranger = new Browser();
        assertThat(status(get(stranger, "/api/auth/sso/pending"))).isEqualTo(404);
        assertThat(status(post(stranger, "/api/auth/sso/complete", Map.of("username", "sso_nobody")))).isEqualTo(410);
        assertThat(idOf("sso_nobody")).isNull();
    }

    @Test
    void whenInvitesAreRequiredTheCodeIsAskedForCheckedAndSpentOnce() throws Exception {
        setting("invite_required", "true");
        int admin = makePasswordUser("sso_admin", null, false);
        jdbc.update("INSERT INTO invite_codes (code, created_by) VALUES ('SSO-TEST-GOOD', ?)", admin);
        jdbc.update("INSERT INTO invite_codes (code, created_by, expires_at) VALUES ('SSO-TEST-OLD', ?, now() - interval '1 hour')", admin);

        Browser b = new Browser();
        b.address = freshAddress();
        roundTrip(b, "google", t -> t.subject = "google-sub-11");
        assertThat(json(get(b, "/api/auth/sso/pending")).path("inviteRequired").asBoolean()).isTrue();

        MvcResult none = post(b, "/api/auth/sso/complete", Map.of("username", "sso_invited"));
        assertThat(status(none)).isEqualTo(400);
        assertThat(message(none)).isEqualTo("Invite code required.");
        assertThat(status(post(b, "/api/auth/sso/complete", Map.of("username", "sso_invited", "inviteCode", "SSO-TEST-OLD")))).isEqualTo(410);
        // A taken name does not spend the code.
        assertThat(status(post(b, "/api/auth/sso/complete", Map.of("username", "sso_admin", "inviteCode", "SSO-TEST-GOOD")))).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT used_by FROM invite_codes WHERE code = 'SSO-TEST-GOOD'", String.class)).isNull();
        assertThat(idOf("sso_invited")).isNull();

        MvcResult made = post(b, "/api/auth/sso/complete", Map.of("username", "sso_invited", "inviteCode", " SSO-TEST-GOOD "));
        assertThat(status(made)).isEqualTo(201);
        assertThat(jdbc.queryForObject("SELECT used_by FROM invite_codes WHERE code = 'SSO-TEST-GOOD'", String.class)).isEqualTo("sso_invited");

        // The spent code is no good to the next person, and a made-up code shuts that network out for a while.
        Browser next = new Browser();
        next.address = freshAddress();
        roundTrip(next, "google", t -> t.subject = "google-sub-12");
        assertThat(status(post(next, "/api/auth/sso/complete", Map.of("username", "sso_next", "inviteCode", "SSO-TEST-GOOD")))).isEqualTo(410);
        assertThat(status(post(next, "/api/auth/sso/complete", Map.of("username", "sso_next", "inviteCode", "SSO-TEST-NOPE")))).isEqualTo(403);
        assertThat(status(post(next, "/api/auth/sso/complete", Map.of("username", "sso_next", "inviteCode", "SSO-TEST-NOPE")))).isEqualTo(429);
        assertThat(idOf("sso_next")).isNull();
    }

    @Test
    void theDailyCapAndTheNetworkLimitApplyToProviderSignUpsToo() throws Exception {
        // One network, one account an hour.
        String network = freshAddress();
        Browser first = new Browser();
        first.address = network;
        roundTrip(first, "google", t -> t.subject = "google-sub-13");
        assertThat(status(post(first, "/api/auth/sso/complete", Map.of("username", "sso_first")))).isEqualTo(201);
        Browser second = new Browser();
        second.address = network;
        roundTrip(second, "google", t -> t.subject = "google-sub-14");
        MvcResult limited = post(second, "/api/auth/sso/complete", Map.of("username", "sso_again"));
        assertThat(status(limited)).isEqualTo(429);
        assertThat(idOf("sso_again")).isNull();

        // The site-wide cap counts every account made today.
        setting("max_daily_registrations", "0");
        Browser capped = new Browser();
        capped.address = freshAddress();
        roundTrip(capped, "google", t -> t.subject = "google-sub-15");
        MvcResult closed = post(capped, "/api/auth/sso/complete", Map.of("username", "sso_capped"));
        assertThat(status(closed)).isEqualTo(503);
        assertThat(message(closed)).isEqualTo("Registration is currently closed. Please try again tomorrow.");
        assertThat(idOf("sso_capped")).isNull();
    }

    // ── no password until one is set ──────────────────────────────────────────

    @Test
    void anAccountMadeThroughAProviderHasNoPasswordUntilItSetsOne() throws Exception {
        Browser b = join("google", "google-sub-16", "sixteen@example.test", "sso_nopw");

        // No password opens it: not an empty one, not the stored marker, not anything.
        for (String guess : List.of(SsoAccounts.NO_PASSWORD, "password", GOOD_PW)) {
            Browser guesser = new Browser();
            guesser.address = freshAddress();
            assertThat(status(post(guesser, "/api/loginSessionAttempt", Map.of("username", "sso_nopw", "password", guess))))
                    .as("password '" + guess + "'").isEqualTo(403);
        }
        JsonNode methods = json(get(b, "/api/auth/sso/methods"));
        assertThat(methods.path("hasPassword").asBoolean()).isFalse();
        assertThat(methods.path("fresh").asBoolean()).isTrue();
        assertThat(methods.toString()).doesNotContain("google-sub-16").doesNotContain(SsoAccounts.NO_PASSWORD);

        // A second device, signed in the same way.
        Browser phone = new Browser();
        roundTrip(phone, "google", t -> t.subject = "google-sub-16");
        assertThat(whoAmI(phone)).isEqualTo("sso_nopw");

        // Five minutes after the provider sign-in the page must ask for it again.
        flows.setClock(Clock.offset(Clock.systemUTC(), Duration.ofMinutes(6)));
        MvcResult stale = post(b, "/api/auth/sso/password", Map.of("newPassword", GOOD_PW));
        assertThat(status(stale)).isEqualTo(403);
        assertThat(json(stale).path("reauth").asBoolean()).isTrue();
        assertThat(jdbc.queryForObject("SELECT password FROM users WHERE username = 'sso_nopw'", String.class)).isEqualTo(SsoAccounts.NO_PASSWORD);

        // Proving it again from Settings: same member, a new session in place of the old one.
        String oldToken = b.value("authToken");
        Map<String, String> sent = query(location(get(b, "/api/auth/sso/google/start?intent=reauth")));
        FakeSsoProvider.Token token = FAKE.token("google", "google-client.test", sent.get("nonce"));
        token.subject = "google-sub-16";
        MvcResult back = comeBack(b, "google", sent, token);
        assertThat(location(back)).isEqualTo(SETTINGS + "reauth");
        assertThat(b.value("authToken")).isNotEqualTo(oldToken);
        assertThat(JdbcLoginRepository.hasSession(oldToken)).isFalse();
        assertThat(whoAmI(b)).isEqualTo("sso_nopw");

        // The same rules as any new password.
        MvcResult weak = post(b, "/api/auth/sso/password", Map.of("newPassword", "short"));
        assertThat(status(weak)).isEqualTo(400);
        assertThat(message(weak)).isEqualTo("Password must be at least 12 characters.");

        MvcResult set = post(b, "/api/auth/sso/password", Map.of("newPassword", GOOD_PW));
        assertThat(status(set)).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT password FROM users WHERE username = 'sso_nopw'", String.class)).startsWith("$2a$12$");
        assertThat(whoAmI(b)).as("this device stays signed in").isEqualTo("sso_nopw");
        assertThat(whoAmI(phone)).as("the others are signed out").isNull();
        assertThat(log("sso_nopw")).contains("password_changed:First password set");
        assertThat(json(get(b, "/api/auth/sso/methods")).path("hasPassword").asBoolean()).isTrue();

        // From now on it is an ordinary account: the password signs in, and "set" is no longer offered.
        signedInWithPassword("sso_nopw");
        assertThat(status(post(b, "/api/auth/sso/password", Map.of("newPassword", "Another-secret-77?")))).isEqualTo(409);

        // Signed out, none of this answers.
        Browser nobody = new Browser();
        assertThat(status(post(nobody, "/api/auth/sso/password", Map.of("newPassword", GOOD_PW)))).isEqualTo(401);
        assertThat(status(get(nobody, "/api/auth/sso/methods"))).isEqualTo(401);
    }

    /** Reset by email and an admin both simply store a hash; that alone must end the "no password" state. */
    @Test
    void anyPathThatStoresAHashMakesItAnOrdinaryAccount() throws Exception {
        Browser b = join("microsoft", "ms-sub-30", "thirty@example.test", "sso_reset");
        assertThat(json(get(b, "/api/auth/sso/methods")).path("hasPassword").asBoolean()).isFalse();

        jdbc.update("UPDATE users SET password = ? WHERE username = 'sso_reset'", JdbcLoginRepository.hashPassword(GOOD_PW));

        assertThat(json(get(b, "/api/auth/sso/methods")).path("hasPassword").asBoolean()).isTrue();
        signedInWithPassword("sso_reset");
        assertThat(status(post(b, "/api/auth/sso/password", Map.of("newPassword", "Another-secret-77?")))).isEqualTo(409);
        // And the provider can now be unlinked, with the password.
        assertThat(status(post(b, "/api/auth/sso/microsoft/unlink", Map.of("password", GOOD_PW)))).isEqualTo(200);
    }

    @Test
    void provingYourselfAgainCannotSwitchAccounts() throws Exception {
        Browser mine = join("google", "google-sub-17", "seventeen@example.test", "sso_mine");
        join("google", "google-sub-18", "eighteen@example.test", "sso_theirs");

        String before = mine.value("authToken");
        Map<String, String> sent = query(location(get(mine, "/api/auth/sso/google/start?intent=reauth")));
        FakeSsoProvider.Token token = FAKE.token("google", "google-client.test", sent.get("nonce"));
        token.subject = "google-sub-18";
        assertThat(location(comeBack(mine, "google", sent, token))).isEqualTo(SETTINGS + "other");
        assertThat(mine.value("authToken")).isEqualTo(before);
        assertThat(whoAmI(mine)).isEqualTo("sso_mine");
    }

    // ── linking and unlinking from Settings ───────────────────────────────────

    @Test
    void linkingNeedsThePasswordAndThenThatProviderAccountSignsTheMemberIn() throws Exception {
        makePasswordUser("sso_linker", "linker@example.test", true);
        Browser b = signedInWithPassword("sso_linker");

        MvcResult wrong = post(b, "/api/auth/sso/google/link", Map.of("password", "Not-the-password-1!"));
        assertThat(status(wrong)).isEqualTo(403);
        assertThat(status(post(b, "/api/auth/sso/google/link", Map.of()))).isEqualTo(400);
        assertThat(b.value("sso_state")).as("nothing was started").isNull();
        Browser nobody = new Browser();
        assertThat(status(post(nobody, "/api/auth/sso/google/link", Map.of("password", GOOD_PW)))).isEqualTo(401);

        MvcResult ok = post(b, "/api/auth/sso/google/link", Map.of("password", GOOD_PW));
        assertThat(status(ok)).isEqualTo(200);
        Map<String, String> sent = query(json(ok).path("redirect").asText());
        assertThat(json(ok).path("redirect").asText()).startsWith("https://accounts.google.com/o/oauth2/v2/auth?");
        assertThat(sent).containsEntry("prompt", "select_account");

        // The address on the Google account is the member's own confirmed one: linking is by choice, so that is fine.
        FakeSsoProvider.Token token = FAKE.token("google", "google-client.test", sent.get("nonce"));
        token.subject = "google-sub-19";
        token.email = "linker@example.test";
        assertThat(location(comeBack(b, "google", sent, token))).isEqualTo(SETTINGS + "linked");
        assertThat(identities("sso_linker")).isEqualTo(1);
        assertThat(log("sso_linker")).contains("identity_linked:Google");
        assertThat(whoAmI(b)).isEqualTo("sso_linker");

        JsonNode methods = json(get(b, "/api/auth/sso/methods"));
        assertThat(methods.path("hasPassword").asBoolean()).isTrue();
        JsonNode google = methods.path("methods").get(0);
        assertThat(google.path("provider").asText()).isEqualTo("google");
        assertThat(google.path("linked").asBoolean()).isTrue();
        assertThat(google.path("canUnlink").asBoolean()).isTrue();
        assertThat(google.path("email").asText()).isEqualTo("linker@example.test");
        JsonNode microsoft = methods.path("methods").get(1);
        assertThat(microsoft.path("provider").asText()).isEqualTo("microsoft");
        assertThat(microsoft.path("linked").asBoolean()).isFalse();
        assertThat(methods.path("methods")).hasSize(2);

        // Now Google signs this member in.
        Browser later = new Browser();
        assertThat(location(roundTrip(later, "google", t -> t.subject = "google-sub-19"))).isEqualTo(LOGIN + "ok");
        assertThat(whoAmI(later)).isEqualTo("sso_linker");

        // One Google account per member.
        MvcResult second = post(b, "/api/auth/sso/google/link", Map.of("password", GOOD_PW));
        assertThat(status(second)).isEqualTo(409);

        // Signed out before coming back: the link does not happen.
        makePasswordUser("sso_leaver", null, false);
        Browser leaver = signedInWithPassword("sso_leaver");
        Map<String, String> pendingLink = query(json(post(leaver, "/api/auth/sso/microsoft/link", Map.of("password", GOOD_PW))).path("redirect").asText());
        post(leaver, "/api/logoutSessionAttempt", Map.of());
        FakeSsoProvider.Token ms = FAKE.token("microsoft", "microsoft-client.test", pendingLink.get("nonce"));
        assertThat(location(comeBack(leaver, "microsoft", pendingLink, ms))).isEqualTo(LOGIN + "failed");
        assertThat(identities("sso_leaver")).isZero();
    }

    @Test
    void oneProviderAccountCannotBeLinkedToTwoMembers() throws Exception {
        join("google", "google-sub-20", "twenty@example.test", "sso_has_it");
        makePasswordUser("sso_wants_it", null, false);
        Browser b = signedInWithPassword("sso_wants_it");

        Map<String, String> sent = query(json(post(b, "/api/auth/sso/google/link", Map.of("password", GOOD_PW))).path("redirect").asText());
        FakeSsoProvider.Token token = FAKE.token("google", "google-client.test", sent.get("nonce"));
        token.subject = "google-sub-20";
        assertThat(location(comeBack(b, "google", sent, token))).isEqualTo(SETTINGS + "taken");
        assertThat(identities("sso_wants_it")).isZero();
        assertThat(identities("sso_has_it")).isEqualTo(1);
        assertThat(whoAmI(b)).as("and they are still themselves").isEqualTo("sso_wants_it");
        assertThat(log("sso_wants_it")).doesNotContain("identity_linked:Google");
    }

    @Test
    void theLastWayToSignInCannotBeUnlinked() throws Exception {
        Browser b = join("google", "google-sub-21", "twentyone@example.test", "sso_only");

        // Only Google, no password: refused, and the page is told so up front.
        assertThat(json(get(b, "/api/auth/sso/methods")).path("methods").get(0).path("canUnlink").asBoolean()).isFalse();
        MvcResult last = post(b, "/api/auth/sso/google/unlink", Map.of());
        assertThat(status(last)).isEqualTo(409);
        assertThat(message(last)).isEqualTo("Google is the only way you can sign in. Set a password first, then unlink it.");
        assertThat(identities("sso_only")).isEqualTo(1);

        // A second provider (fresh from signing in, so no password is asked): now either can go, but not both.
        Map<String, String> sent = query(json(post(b, "/api/auth/sso/microsoft/link", Map.of())).path("redirect").asText());
        FakeSsoProvider.Token ms = FAKE.token("microsoft", "microsoft-client.test", sent.get("nonce"));
        ms.subject = "ms-sub-21";
        assertThat(location(comeBack(b, "microsoft", sent, ms))).isEqualTo(SETTINGS + "linked");
        assertThat(identities("sso_only")).isEqualTo(2);

        // Without a recent provider sign-in an account with no password cannot change its methods.
        flows.setClock(Clock.offset(Clock.systemUTC(), Duration.ofMinutes(6)));
        MvcResult stale = post(b, "/api/auth/sso/google/unlink", Map.of());
        assertThat(status(stale)).isEqualTo(403);
        assertThat(json(stale).path("reauth").asBoolean()).isTrue();
        assertThat(identities("sso_only")).isEqualTo(2);

        // Either linked provider will do to prove it again; Microsoft is asked for a real sign-in.
        Map<String, String> again = query(location(get(b, "/api/auth/sso/microsoft/start?intent=reauth")));
        assertThat(again).containsEntry("prompt", "login");
        FakeSsoProvider.Token proof = FAKE.token("microsoft", "microsoft-client.test", again.get("nonce"));
        proof.subject = "ms-sub-21";
        assertThat(location(comeBack(b, "microsoft", again, proof))).isEqualTo(SETTINGS + "reauth");

        assertThat(status(post(b, "/api/auth/sso/google/unlink", Map.of()))).isEqualTo(200);
        assertThat(identities("sso_only")).isEqualTo(1);
        assertThat(log("sso_only")).contains("identity_linked:Microsoft", "identity_unlinked:Google");
        assertThat(status(post(b, "/api/auth/sso/microsoft/unlink", Map.of()))).isEqualTo(409);
        assertThat(status(post(b, "/api/auth/sso/google/unlink", Map.of()))).as("not linked any more").isEqualTo(404);
        assertThat(identities("sso_only")).isEqualTo(1);

        // Google no longer signs this member in; it would start a new account.
        Browser google = new Browser();
        assertThat(location(roundTrip(google, "google", t -> { t.subject = "google-sub-21"; t.email = "x@example.test"; })))
                .isEqualTo("https://site.test/routes/ChooseUsername");

        // With a password the last provider can go, and the password is what is asked for.
        assertThat(status(post(b, "/api/auth/sso/password", Map.of("newPassword", GOOD_PW)))).isEqualTo(200);
        assertThat(status(post(b, "/api/auth/sso/microsoft/unlink", Map.of()))).isEqualTo(400);
        assertThat(status(post(b, "/api/auth/sso/microsoft/unlink", Map.of("password", "Wrong-password-12!")))).isEqualTo(403);
        assertThat(identities("sso_only")).isEqualTo(1);
        assertThat(status(post(b, "/api/auth/sso/microsoft/unlink", Map.of("password", GOOD_PW)))).isEqualTo(200);
        assertThat(identities("sso_only")).isZero();
        signedInWithPassword("sso_only");
    }

    @Test
    void wrongPasswordsWhenLinkingAreCountedAndLockLikeAnyOtherGuessing() throws Exception {
        makePasswordUser("sso_guessed", null, false);
        Browser b = signedInWithPassword("sso_guessed");
        for (int i = 0; i < 15; i++)
            assertThat(status(post(b, "/api/auth/sso/google/link", Map.of("password", "Wrong-password-12!")))).isEqualTo(403);
        assertThat(status(post(b, "/api/auth/sso/google/link", Map.of("password", GOOD_PW)))).isEqualTo(429);
    }

    // ── frozen accounts, and limits ───────────────────────────────────────────

    @Test
    void aFrozenAccountIsRefusedThroughAProviderToo() throws Exception {
        join("google", "google-sub-22", "twentytwo@example.test", "sso_frozen");
        jdbc.update("UPDATE users SET role = 'frozen' WHERE username = 'sso_frozen'");
        Browser b = new Browser();
        assertNobodySignedIn(b, roundTrip(b, "google", t -> t.subject = "google-sub-22"), "refused");
    }

    @Test
    void oneNetworkCanOnlyMakeSoManyRoundTrips() throws Exception {
        Browser b = new Browser();
        b.address = freshAddress();
        for (int i = 0; i < 60; i++) assertThat(location(get(b, "/api/auth/sso/google/start"))).startsWith("https://accounts.google.com/");
        MvcResult over = get(b, "/api/auth/sso/google/start");
        assertThat(status(over)).isEqualTo(302);
        assertThat(location(over)).isEqualTo(LOGIN + "busy");
        assertThat(location(get(b, "/api/auth/sso/google/callback?code=x&state=y"))).isEqualTo(LOGIN + "busy");
    }

    // ── providers that are off ────────────────────────────────────────────────

    @Test
    void theConfigListsWhatIsOnAndAppleIsOffEvenWhenItsValuesAreSet() throws Exception {
        Browser b = new Browser();
        JsonNode config = json(get(b, "/api/signup/config"));
        assertThat(config.path("ssoProviders").toString())
                .isEqualTo("[{\"id\":\"google\",\"name\":\"Google\"},{\"id\":\"microsoft\",\"name\":\"Microsoft\"}]");
        assertThat(config.toString()).doesNotContain("secret").doesNotContain("google-client.test");

        makePasswordUser("sso_apple_fan", null, false);
        Browser member = signedInWithPassword("sso_apple_fan");
        for (String unknown : List.of("apple", "facebook", "GOOGLE")) {
            assertThat(status(get(b, "/api/auth/sso/" + unknown + "/start"))).as(unknown).isEqualTo(404);
            assertThat(status(get(b, "/api/auth/sso/" + unknown + "/callback?code=x&state=y"))).as(unknown).isEqualTo(404);
            assertThat(status(post(member, "/api/auth/sso/" + unknown + "/link", Map.of("password", GOOD_PW)))).as(unknown).isEqualTo(404);
        }
        assertThat(b.jar).as("nothing was started").isEmpty();
    }
}
