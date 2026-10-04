package com.springbootprojects.webpostingserver;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.springbootprojects.webpostingserver.posts.service.SsoHttp;
import com.springbootprojects.webpostingserver.posts.service.SsoProviders;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Google and Microsoft, minus the network: a key set at each provider's real
 * keys address and a token endpoint that hands out ID tokens signed with it.
 * Like the real ones it gives a code out once, and checks the client id, the
 * secret, the redirect address and the PKCE verifier before answering.
 */
class FakeSsoProvider implements SsoHttp {

    static final String GOOGLE_KEYS = "https://www.googleapis.com/oauth2/v3/certs";
    static final String GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
    static final String MICROSOFT_KEYS = "https://login.microsoftonline.com/common/discovery/v2.0/keys";
    static final String MICROSOFT_TOKEN = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    static final String PERSONAL_TENANT = SsoProviders.MICROSOFT_PERSONAL_TENANT;

    private static final ObjectMapper JSON = new ObjectMapper();

    /** The provider's signing key, and a stranger's key that claims the same key id. */
    final RSAKey key;
    final RSAKey forgersKey;

    /** client id -> secret, as registered with the fake. */
    final Map<String, String> clients = new ConcurrentHashMap<>();
    final AtomicInteger keyFetches = new AtomicInteger();
    final AtomicInteger tokenCalls = new AtomicInteger();
    final List<String> problems = new ArrayList<>();
    volatile boolean keysDown = false;

    private final Map<String, Grant> grants = new ConcurrentHashMap<>();

    private record Grant(String tokenUrl, String clientId, String redirectUri, String challenge, String idToken) { }

    /** What goes into the next ID token; a test changes one thing to make it wrong. */
    static class Token {
        String subject = "subject-" + UUID.randomUUID();
        String email = "person-" + UUID.randomUUID() + "@example.test";
        Object emailVerified = Boolean.TRUE;      // null leaves the claim out
        String issuer;
        List<String> audience;
        String authorizedParty;                   // azp
        String nonce;
        String tenant;                            // tid (Microsoft)
        Instant expires = Instant.now().plusSeconds(3600);
        Instant notBefore;
        RSAKey signWith;
        String keyId;
    }

    FakeSsoProvider() {
        try {
            key = new RSAKeyGenerator(2048).keyID("fake-key-1").keyUse(KeyUse.SIGNATURE).generate();
            forgersKey = new RSAKeyGenerator(2048).keyID("fake-key-1").keyUse(KeyUse.SIGNATURE).generate();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    void reset() {
        grants.clear();
        problems.clear();
        tokenCalls.set(0);
        keysDown = false;
    }

    /** A token with everything right for this provider, client and nonce. */
    Token token(String provider, String clientId, String nonce) {
        Token t = new Token();
        t.audience = List.of(clientId);
        t.nonce = nonce;
        t.signWith = key;
        t.keyId = key.getKeyID();
        if (SsoProviders.MICROSOFT.equals(provider)) {
            t.tenant = PERSONAL_TENANT;
            t.issuer = "https://login.microsoftonline.com/" + PERSONAL_TENANT + "/v2.0";
            t.emailVerified = null;               // Microsoft does not send the claim
        } else {
            t.issuer = "https://accounts.google.com";
        }
        return t;
    }

    static String sign(Token t) {
        try {
            JWTClaimsSet.Builder c = new JWTClaimsSet.Builder()
                    .issuer(t.issuer).subject(t.subject).audience(t.audience)
                    .issueTime(new Date()).expirationTime(Date.from(t.expires));
            if (t.notBefore != null) c.notBeforeTime(Date.from(t.notBefore));
            if (t.nonce != null) c.claim("nonce", t.nonce);
            if (t.email != null) c.claim("email", t.email);
            if (t.emailVerified != null) c.claim("email_verified", t.emailVerified);
            if (t.authorizedParty != null) c.claim("azp", t.authorizedParty);
            if (t.tenant != null) c.claim("tid", t.tenant);
            SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(t.keyId).build(), c.build());
            jwt.sign(new RSASSASigner(t.signWith));
            return jwt.serialize();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * The person approved at the provider: returns the one-time code the
     * provider would put in the redirect. {@code sent} is what the site put in
     * the authorize address.
     */
    String approve(String provider, Map<String, String> sent, Token token) {
        String code = "code-" + UUID.randomUUID();
        grants.put(code, new Grant(SsoProviders.MICROSOFT.equals(provider) ? MICROSOFT_TOKEN : GOOGLE_TOKEN,
                sent.get("client_id"), sent.get("redirect_uri"), sent.get("code_challenge"), sign(token)));
        return code;
    }

    @Override
    public Response postForm(String url, Map<String, String> form) {
        tokenCalls.incrementAndGet();
        Grant g = grants.remove(String.valueOf(form.get("code")));      // a code works once
        if (g == null) return new Response(400, "{\"error\":\"invalid_grant\"}");
        String problem = null;
        if (!g.tokenUrl().equals(url)) problem = "wrong token endpoint " + url;
        else if (!"authorization_code".equals(form.get("grant_type"))) problem = "wrong grant_type";
        else if (!g.clientId().equals(form.get("client_id"))) problem = "wrong client_id";
        else if (!clients.getOrDefault(g.clientId(), "").equals(form.get("client_secret"))) problem = "wrong client_secret";
        else if (!g.redirectUri().equals(form.get("redirect_uri"))) problem = "wrong redirect_uri";
        else if (!g.challenge().equals(challengeOf(form.get("code_verifier")))) problem = "PKCE verifier does not match";
        if (problem != null) {
            problems.add(problem);
            return new Response(400, "{\"error\":\"invalid_request\"}");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("access_token", "access-" + UUID.randomUUID());
        body.put("token_type", "Bearer");
        body.put("expires_in", 3600);
        body.put("id_token", g.idToken());
        try {
            return new Response(200, JSON.writeValueAsString(body));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Override
    public Response get(String url) {
        if (!GOOGLE_KEYS.equals(url) && !url.startsWith("https://login.microsoftonline.com/")) return new Response(404, "");
        keyFetches.incrementAndGet();
        if (keysDown) return new Response(503, "");
        return new Response(200, new JWKSet(key.toPublicJWK()).toString());
    }

    static String challengeOf(String verifier) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(String.valueOf(verifier).getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
