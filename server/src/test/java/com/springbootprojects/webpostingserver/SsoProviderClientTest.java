package com.springbootprojects.webpostingserver;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.PlainJWT;
import com.nimbusds.jwt.SignedJWT;
import com.springbootprojects.webpostingserver.posts.service.SsoFlowStore;
import com.springbootprojects.webpostingserver.posts.service.SsoProviderClient;
import com.springbootprojects.webpostingserver.posts.service.SsoProviderClient.Identity;
import com.springbootprojects.webpostingserver.posts.service.SsoProviderClient.Rejected;
import com.springbootprojects.webpostingserver.posts.service.SsoProviders;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.List;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The rules an ID token must pass, the key cache, which providers are switched
 * on, and the short-lived flow store: no database, no network.
 */
class SsoProviderClientTest {

    private static final String CLIENT = "client-123.apps.example";
    private static final String NONCE = "nonce-for-this-browser";

    private FakeSsoProvider fake;
    private SsoProviderClient client;
    private SsoProviders.Provider google;

    @BeforeEach
    void setUp() {
        fake = new FakeSsoProvider();
        client = new SsoProviderClient(fake);
        google = providers("common").find("google").orElseThrow();
    }

    private static SsoProviders providers(String tenant) {
        return new SsoProviders(CLIENT, "g-secret", CLIENT, "m-secret", tenant, "", "", "https://site.test/");
    }

    private Identity verifyGoogle(Consumer<FakeSsoProvider.Token> change) throws Rejected {
        FakeSsoProvider.Token t = fake.token("google", CLIENT, NONCE);
        change.accept(t);
        return client.verify(google, FakeSsoProvider.sign(t), NONCE, Instant.now());
    }

    private void refused(Consumer<FakeSsoProvider.Token> change, String why) {
        assertThatThrownBy(() -> verifyGoogle(change)).isInstanceOf(Rejected.class).hasMessageContaining(why);
    }

    // ── the token rules ───────────────────────────────────────────────────────

    @Test
    void aGoodTokenGivesSubjectAndEmailAndNothingElse() throws Exception {
        Identity who = verifyGoogle(t -> { t.subject = "g-1"; t.email = "Mae@Example.Test"; });
        assertThat(who).isEqualTo(new Identity("g-1", "mae@example.test", true));
    }

    @Test
    void eachWrongThingIsRefused() {
        refused(t -> t.signWith = fake.forgersKey, "bad signature");
        refused(t -> t.audience = List.of("someone-elses-client"), "wrong audience");
        refused(t -> t.expires = Instant.now().minusSeconds(300), "expired");
        refused(t -> t.nonce = "another-nonce", "wrong nonce");
        refused(t -> t.nonce = null, "wrong nonce");
        refused(t -> t.issuer = "https://accounts.google.com.evil.test", "wrong issuer");
        refused(t -> t.subject = " ", "no usable subject");
        refused(t -> t.authorizedParty = "someone-elses-client", "wrong authorized party");
        refused(t -> t.audience = List.of(CLIENT, "another-client"), "several audiences");
        refused(t -> t.notBefore = Instant.now().plusSeconds(600), "not valid yet");
        refused(t -> t.keyId = "a-key-nobody-published", "does not publish");
    }

    @Test
    void aMinuteOfClockDriftIsAllowedAndNoMore() throws Exception {
        verifyGoogle(t -> t.expires = Instant.now().minusSeconds(30));
        refused(t -> t.expires = Instant.now().minusSeconds(90), "expired");
    }

    @Test
    void anUnsignedTokenOrOneSignedWithOurOwnSecretIsRefused() throws Exception {
        JWTClaimsSet claims = new JWTClaimsSet.Builder().issuer("https://accounts.google.com").subject("g-1")
                .audience(CLIENT).claim("nonce", NONCE).expirationTime(Date.from(Instant.now().plusSeconds(600))).build();

        String unsigned = new PlainJWT(claims).serialize();
        assertThatThrownBy(() -> client.verify(google, unsigned, NONCE, Instant.now()))
                .isInstanceOf(Rejected.class).hasMessageContaining("not a signed JWT");

        // The classic swap: HS256 keyed with something the attacker knows.
        SignedJWT hmac = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.HS256).keyID("fake-key-1").build(), claims);
        hmac.sign(new MACSigner("g-secret-g-secret-g-secret-g-secret-g-secret"));
        assertThatThrownBy(() -> client.verify(google, hmac.serialize(), NONCE, Instant.now()))
                .isInstanceOf(Rejected.class).hasMessageContaining("unexpected algorithm");

        assertThatThrownBy(() -> client.verify(google, "x".repeat(20_000), NONCE, Instant.now()))
                .isInstanceOf(Rejected.class).hasMessageContaining("too long");
        assertThatThrownBy(() -> client.verify(google, null, NONCE, Instant.now())).isInstanceOf(Rejected.class);
    }

    @Test
    void anEmailCountsAsVerifiedOnlyWhenTheProviderSaysSo() throws Exception {
        assertThat(verifyGoogle(t -> t.emailVerified = Boolean.FALSE).emailVerified()).isFalse();
        assertThat(verifyGoogle(t -> t.emailVerified = null).emailVerified()).isFalse();
        assertThat(verifyGoogle(t -> t.emailVerified = "true").emailVerified()).isTrue();
        assertThat(verifyGoogle(t -> t.emailVerified = "yes").emailVerified()).isFalse();
        Identity none = verifyGoogle(t -> t.email = null);
        assertThat(none.email()).isNull();
        assertThat(none.emailVerified()).isFalse();
        assertThat(verifyGoogle(t -> t.email = "not-an-address").email()).isNull();
    }

    // ── Microsoft: one app, many tenants ──────────────────────────────────────

    private Identity verifyMicrosoft(String configuredTenant, Consumer<FakeSsoProvider.Token> change) throws Rejected {
        SsoProviders.Provider microsoft = providers(configuredTenant).find("microsoft").orElseThrow();
        FakeSsoProvider.Token t = fake.token("microsoft", CLIENT, NONCE);
        change.accept(t);
        return new SsoProviderClient(fake).verify(microsoft, FakeSsoProvider.sign(t), NONCE, Instant.now());
    }

    private static void inTenant(FakeSsoProvider.Token t, String tenant) {
        t.tenant = tenant;
        t.issuer = "https://login.microsoftonline.com/" + tenant + "/v2.0";
    }

    @Test
    void microsoftIssuerMustBeTheTokensOwnTenantAndATenantThisAppAccepts() throws Exception {
        String work = "11111111-2222-3333-4444-555555555555";
        String personal = FakeSsoProvider.PERSONAL_TENANT;

        // common: personal and work accounts, and the email is never trusted without the claim.
        assertThat(verifyMicrosoft("common", t -> { }).emailVerified()).isFalse();
        verifyMicrosoft("common", t -> inTenant(t, work));

        // The issuer names one tenant and tid another: a token from tenant A dressed as tenant B.
        assertThatThrownBy(() -> verifyMicrosoft("common", t -> t.tenant = work))
                .isInstanceOf(Rejected.class).hasMessageContaining("wrong issuer");
        assertThatThrownBy(() -> verifyMicrosoft("common", t -> t.issuer = "https://login.microsoftonline.com/common/v2.0"))
                .isInstanceOf(Rejected.class).hasMessageContaining("wrong issuer");
        assertThatThrownBy(() -> verifyMicrosoft("common", t -> t.tenant = null))
                .isInstanceOf(Rejected.class).hasMessageContaining("no tenant");
        assertThatThrownBy(() -> verifyMicrosoft("common", t -> t.issuer = "https://accounts.google.com"))
                .isInstanceOf(Rejected.class).hasMessageContaining("wrong issuer");

        verifyMicrosoft("consumers", t -> { });
        assertThatThrownBy(() -> verifyMicrosoft("consumers", t -> inTenant(t, work)))
                .isInstanceOf(Rejected.class).hasMessageContaining("tenant not accepted");
        verifyMicrosoft("organizations", t -> inTenant(t, work));
        assertThatThrownBy(() -> verifyMicrosoft("organizations", t -> { }))
                .isInstanceOf(Rejected.class).hasMessageContaining("tenant not accepted");
        verifyMicrosoft(work, t -> inTenant(t, work));
        assertThatThrownBy(() -> verifyMicrosoft(work, t -> inTenant(t, personal)))
                .isInstanceOf(Rejected.class).hasMessageContaining("tenant not accepted");
    }

    // ── keys ──────────────────────────────────────────────────────────────────

    @Test
    void keysAreFetchedOnceAndAnUnknownKeyCostsAtMostOneRefetchAMinute() throws Exception {
        Instant t0 = Instant.now();
        String good = FakeSsoProvider.sign(fake.token("google", CLIENT, NONCE));
        client.verify(google, good, NONCE, t0);
        client.verify(google, good, NONCE, t0.plusSeconds(5));
        assertThat(fake.keyFetches.get()).isEqualTo(1);

        FakeSsoProvider.Token odd = fake.token("google", CLIENT, NONCE);
        odd.keyId = "rotated-in-later";
        String unknown = FakeSsoProvider.sign(odd);
        for (int i = 0; i < 5; i++)
            assertThatThrownBy(() -> client.verify(google, unknown, NONCE, t0.plusSeconds(10))).isInstanceOf(Rejected.class);
        assertThat(fake.keyFetches.get()).as("within a minute of the last fetch nothing is refetched").isEqualTo(1);
        assertThatThrownBy(() -> client.verify(google, unknown, NONCE, t0.plusSeconds(120))).isInstanceOf(Rejected.class);
        assertThatThrownBy(() -> client.verify(google, unknown, NONCE, t0.plusSeconds(125))).isInstanceOf(Rejected.class);
        assertThat(fake.keyFetches.get()).isEqualTo(2);
    }

    @Test
    void whenTheKeysCannotBeFetchedTheOldOnesAreKeptAndWithNoneNobodyGetsIn() throws Exception {
        Instant t0 = Instant.now();
        String good = FakeSsoProvider.sign(fake.token("google", CLIENT, NONCE));
        fake.keysDown = true;
        assertThatThrownBy(() -> client.verify(google, good, NONCE, t0))
                .isInstanceOf(Rejected.class).hasMessageContaining("could not be fetched");

        fake.keysDown = false;
        client.verify(google, good, NONCE, t0);
        int fetched = fake.keyFetches.get();

        // Seven hours on the keys are stale and the provider is down: the old set still verifies,
        // and the outage is retried once a minute, not on every sign-in.
        fake.keysDown = true;
        FakeSsoProvider.Token later = fake.token("google", CLIENT, NONCE);
        later.expires = t0.plus(Duration.ofHours(8));
        String token = FakeSsoProvider.sign(later);
        Instant t1 = t0.plus(Duration.ofHours(7));
        client.verify(google, token, NONCE, t1);
        client.verify(google, token, NONCE, t1.plusSeconds(5));
        assertThat(fake.keyFetches.get()).isEqualTo(fetched + 1);
    }

    @Test
    void theCodeExchangeSendsTheVerifierAndRefusesAnythingButATokenAnswer() throws Exception {
        fake.clients.put(CLIENT, "g-secret");
        String verifier = SsoFlowStore.randomToken();
        java.util.Map<String, String> sent = java.util.Map.of("client_id", CLIENT,
                "redirect_uri", "https://site.test/api/auth/sso/google/callback",
                "code_challenge", FakeSsoProvider.challengeOf(verifier));
        String code = fake.approve("google", sent, fake.token("google", CLIENT, NONCE));

        String idToken = client.exchange(google, code, verifier, "https://site.test/api/auth/sso/google/callback");
        assertThat(client.verify(google, idToken, NONCE, Instant.now()).emailVerified()).isTrue();
        assertThat(fake.problems).isEmpty();

        // The same code again: the provider says no.
        assertThatThrownBy(() -> client.exchange(google, code, verifier, "https://site.test/api/auth/sso/google/callback"))
                .isInstanceOf(Rejected.class).hasMessageContaining("400").hasMessageContaining("invalid_grant");

        // A stolen code without this browser's verifier is worth nothing.
        String second = fake.approve("google", sent, fake.token("google", CLIENT, NONCE));
        assertThatThrownBy(() -> client.exchange(google, second, SsoFlowStore.randomToken(),
                "https://site.test/api/auth/sso/google/callback")).isInstanceOf(Rejected.class);
        assertThat(fake.problems).containsExactly("PKCE verifier does not match");

        assertThatThrownBy(() -> client.exchange(google, "", verifier, "x")).isInstanceOf(Rejected.class);
        assertThatThrownBy(() -> client.exchange(google, "c".repeat(5000), verifier, "x")).isInstanceOf(Rejected.class);
    }

    // ── which providers are on ────────────────────────────────────────────────

    @Test
    void aProviderIsOnOnlyWithBothItsValuesAndAppleIsNeverOn() {
        SsoProviders none = new SsoProviders("", "", "", "", "common", "", "", "https://site.test");
        assertThat(none.enabled()).isEmpty();
        assertThat(none.publicList()).isEmpty();
        assertThat(none.find("google")).isEmpty();
        assertThat(none.find(null)).isEmpty();

        SsoProviders half = new SsoProviders("id-only", " ", "", "secret-only", "common", "", "", "https://site.test");
        assertThat(half.enabled()).isEmpty();

        SsoProviders both = new SsoProviders(" g ", " gs ", "m", "ms", "", "services-id", "", "https://site.test/");
        assertThat(both.publicList()).containsExactly(
                java.util.Map.of("id", "google", "name", "Google"), java.util.Map.of("id", "microsoft", "name", "Microsoft"));
        assertThat(both.find("google").orElseThrow().clientId()).isEqualTo("g");
        assertThat(both.find("apple")).as("Apple is not built, whatever is configured").isEmpty();
        assertThat(both.find("microsoft").orElseThrow().tokenUrl())
                .isEqualTo("https://login.microsoftonline.com/common/oauth2/v2.0/token");
        assertThat(both.find("google").orElseThrow().toString()).doesNotContain("gs");

        // The redirect address: the public address without a trailing slash, or SSO_REDIRECT_BASE when given.
        assertThat(both.redirectUri(both.find("google").orElseThrow()))
                .isEqualTo("https://site.test/api/auth/sso/google/callback");
        SsoProviders dev = new SsoProviders("g", "gs", "", "", "common", "", "http://localhost:8080/", "http://localhost:5173");
        assertThat(dev.redirectUri(dev.find("google").orElseThrow()))
                .isEqualTo("http://localhost:8080/api/auth/sso/google/callback");

        // A tenant that could change the address's path switches Microsoft off rather than being used.
        SsoProviders odd = new SsoProviders("", "", "m", "ms", "common/../evil", "", "", "https://site.test");
        assertThat(odd.find("microsoft")).isEmpty();
    }

    // ── the flow store ────────────────────────────────────────────────────────

    @Test
    void aStateWorksOnceForTenMinutesForTheBrowserAndProviderThatStartedIt() {
        SsoFlowStore store = new SsoFlowStore();
        String key = SsoFlowStore.randomToken();

        String state = store.begin("google", "signin", "n", "v", key, 0);
        assertThat(store.consume(state, "google", key).nonce()).isEqualTo("n");
        assertThat(store.consume(state, "google", key)).as("a second use").isNull();

        assertThat(store.consume(store.begin("google", "signin", "n", "v", key, 0), "google", SsoFlowStore.randomToken()))
                .as("another browser").isNull();
        assertThat(store.consume(store.begin("google", "signin", "n", "v", key, 0), "google", null)).isNull();
        assertThat(store.consume(store.begin("google", "signin", "n", "v", key, 0), "microsoft", key))
                .as("another provider's callback").isNull();
        assertThat(store.consume(null, "google", key)).isNull();
        assertThat(store.consume("never-issued", "google", key)).isNull();

        String old = store.begin("google", "signin", "n", "v", key, 0);
        store.setClock(Clock.fixed(Instant.now().plus(Duration.ofMinutes(11)), ZoneOffset.UTC));
        assertThat(store.consume(old, "google", key)).as("after ten minutes").isNull();
    }

    @Test
    void aPendingIdentityIsClaimedOnceRunsOutAndHasALimitedNumberOfTries() {
        SsoFlowStore store = new SsoFlowStore();
        String ticket = store.hold("google", "g-1", "a@example.test", true);
        SsoFlowStore.Pending p = store.pending(ticket);
        assertThat(p.subject()).isEqualTo("g-1");
        assertThat(store.claim(ticket, p)).isTrue();
        assertThat(store.claim(ticket, p)).as("a second tab").isFalse();
        assertThat(store.pending(ticket)).isNull();
        store.restore(ticket, p);
        assertThat(store.pending(ticket)).isSameAs(p);

        for (int i = 0; i < 20; i++) p.attempts().incrementAndGet();
        assertThat(store.pending(ticket)).as("after twenty tries").isNull();

        String other = store.hold("google", "g-2", null, false);
        store.setClock(Clock.fixed(Instant.now().plus(Duration.ofMinutes(11)), ZoneOffset.UTC));
        assertThat(store.pending(other)).isNull();
        assertThat(store.pending(null)).isNull();
    }

    @Test
    void aProviderSignInIsFreshForFiveMinutes() {
        SsoFlowStore store = new SsoFlowStore();
        assertThat(store.isFresh("token")).isFalse();
        store.markFresh("token");
        assertThat(store.isFresh("token")).isTrue();
        assertThat(store.isFresh("another-token")).isFalse();
        store.setClock(Clock.fixed(Instant.now().plus(Duration.ofMinutes(4)), ZoneOffset.UTC));
        assertThat(store.isFresh("token")).isTrue();
        store.setClock(Clock.fixed(Instant.now().plus(Duration.ofMinutes(6)), ZoneOffset.UTC));
        assertThat(store.isFresh("token")).isFalse();
        assertThat(store.isFresh(null)).isFalse();
    }
}
