package com.springbootprojects.webpostingserver.posts.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Everything said to a sign-in provider after the person comes back from it:
 * swap the one-time code for an ID token, and decide whether that token is
 * genuine.
 *
 * A token is accepted only when ALL of these hold; anything else is a
 * {@link Rejected} and nobody is signed in:
 * <ul>
 *   <li>it is signed with RS256 by a key the provider currently publishes
 *       (the signature check is the library's, never our own arithmetic);</li>
 *   <li>{@code iss} is the provider;</li>
 *   <li>{@code aud} is our client id (and {@code azp}, when present, too);</li>
 *   <li>{@code exp} has not passed (a minute's grace for clock drift);</li>
 *   <li>{@code nonce} is the one this browser's sign-in was started with;</li>
 *   <li>there is a {@code sub}.</li>
 * </ul>
 * Only sub, email and email_verified are taken from it. The token itself, and
 * any access or refresh token, is dropped as soon as this returns.
 */
@Service
public class SsoProviderClient {

    private static final Logger log = LoggerFactory.getLogger(SsoProviderClient.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    /** Longer than any real ID token; stops a huge value reaching the parser. */
    static final int MAX_TOKEN_CHARS = 16 * 1024;
    static final int MAX_CODE_CHARS = 4096;
    static final Duration CLOCK_SKEW = Duration.ofSeconds(60);
    /** Keys are kept this long before being fetched again. */
    static final Duration KEYS_TTL = Duration.ofHours(6);
    /** A token signed by a key we have not seen triggers a refetch, at most this often. */
    static final Duration KEYS_MIN_REFETCH = Duration.ofSeconds(60);

    /** Who the provider says this is. */
    public record Identity(String subject, String email, boolean emailVerified) { }

    /** The provider's answer was refused. The reason is for the server log, never for the page. */
    public static class Rejected extends Exception {
        public Rejected(String reason) { super(reason); }
    }

    /** {@code triedAt} is the last fetch attempt, successful or not, so an outage is not retried on every sign-in. */
    private record Keys(JWKSet set, Instant fetchedAt, Instant triedAt) { }

    private final SsoHttp http;
    private final Map<String, Keys> keysByProvider = new ConcurrentHashMap<>();

    public SsoProviderClient(SsoHttp http) { this.http = http; }

    // ── code -> ID token ──────────────────────────────────────────────────────

    /** Trades the one-time code for the ID token. The provider refuses a code used twice. */
    public String exchange(SsoProviders.Provider p, String code, String verifier, String redirectUri) throws Rejected {
        if (code == null || code.isBlank() || code.length() > MAX_CODE_CHARS) throw new Rejected("no usable code");
        Map<String, String> form = new LinkedHashMap<>();
        form.put("grant_type", "authorization_code");
        form.put("code", code);
        form.put("redirect_uri", redirectUri);
        form.put("client_id", p.clientId());
        form.put("client_secret", p.clientSecret());
        form.put("code_verifier", verifier);
        SsoHttp.Response r;
        try {
            r = http.postForm(p.tokenUrl(), form);
        } catch (Exception e) {
            throw new Rejected("token endpoint unreachable: " + e.getClass().getSimpleName());
        }
        JsonNode body;
        try {
            body = JSON.readTree(r.body() == null ? "" : r.body());
        } catch (Exception e) {
            throw new Rejected("token endpoint answered " + r.status() + " with something that is not JSON");
        }
        if (r.status() != 200) {
            // Only the short error code: the description can echo what was sent.
            String error = body != null && body.hasNonNull("error") ? body.get("error").asText() : "";
            throw new Rejected("token endpoint answered " + r.status() + " " + SecurityLog.truncate(error, 60));
        }
        String idToken = body != null && body.hasNonNull("id_token") ? body.get("id_token").asText() : null;
        if (idToken == null || idToken.isBlank()) throw new Rejected("no id_token in the answer");
        return idToken;
    }

    // ── ID token -> identity ──────────────────────────────────────────────────

    public Identity verify(SsoProviders.Provider p, String idToken, String expectedNonce, Instant now) throws Rejected {
        if (idToken == null || idToken.length() > MAX_TOKEN_CHARS) throw new Rejected("token missing or too long");
        SignedJWT jwt;
        try {
            jwt = SignedJWT.parse(idToken);     // an unsigned ("alg":"none") token does not parse as signed
        } catch (Exception e) {
            throw new Rejected("token is not a signed JWT");
        }
        if (!JWSAlgorithm.RS256.equals(jwt.getHeader().getAlgorithm())) throw new Rejected("unexpected algorithm");
        String kid = jwt.getHeader().getKeyID();
        if (kid == null || kid.isBlank()) throw new Rejected("token names no key");

        RSAKey key = keyFor(p, kid, now);
        boolean signed;
        try {
            signed = jwt.verify(new RSASSAVerifier(key.toRSAPublicKey()));
        } catch (Exception e) {
            throw new Rejected("signature could not be checked");
        }
        if (!signed) throw new Rejected("bad signature");

        JWTClaimsSet claims;
        try {
            claims = jwt.getJWTClaimsSet();
        } catch (Exception e) {
            throw new Rejected("claims are not readable");
        }

        checkIssuer(p, claims);

        List<String> audience = claims.getAudience();
        if (audience == null || !audience.contains(p.clientId())) throw new Rejected("wrong audience");
        String azp = stringClaim(claims, "azp");
        if (azp != null && !azp.equals(p.clientId())) throw new Rejected("wrong authorized party");
        if (audience.size() > 1 && azp == null) throw new Rejected("several audiences and no authorized party");

        Date exp = claims.getExpirationTime();
        if (exp == null || !now.isBefore(exp.toInstant().plus(CLOCK_SKEW))) throw new Rejected("token expired");
        Date nbf = claims.getNotBeforeTime();
        if (nbf != null && now.plus(CLOCK_SKEW).isBefore(nbf.toInstant())) throw new Rejected("token not valid yet");

        String nonce = stringClaim(claims, "nonce");
        if (expectedNonce == null || nonce == null || !MessageDigest.isEqual(
                nonce.getBytes(StandardCharsets.UTF_8), expectedNonce.getBytes(StandardCharsets.UTF_8)))
            throw new Rejected("wrong nonce");

        String sub = claims.getSubject();
        if (sub == null || sub.isBlank() || sub.length() > 255) throw new Rejected("no usable subject");

        String email = stringClaim(claims, "email");
        if (email != null) {
            email = email.trim().toLowerCase();
            if (email.isEmpty() || email.length() > 255 || !email.contains("@")) email = null;
        }
        // Google sends a boolean; some providers send the string "true". Absent means no.
        Object verifiedClaim = claims.getClaim("email_verified");
        boolean verified = email != null
                && (Boolean.TRUE.equals(verifiedClaim) || "true".equals(verifiedClaim));
        return new Identity(sub, email, verified);
    }

    private static void checkIssuer(SsoProviders.Provider p, JWTClaimsSet claims) throws Rejected {
        String iss = claims.getIssuer();
        if (iss == null) throw new Rejected("no issuer");
        if (SsoProviders.GOOGLE.equals(p.id())) {
            if (!iss.equals("https://accounts.google.com") && !iss.equals("accounts.google.com"))
                throw new Rejected("wrong issuer");
            return;
        }
        if (SsoProviders.MICROSOFT.equals(p.id())) {
            // One app serves every Microsoft tenant, so the issuer names the
            // signer's own tenant: it must be the token's tid, and that tenant
            // must be one this app is set up to accept.
            String tid = stringClaim(claims, "tid");
            if (!SsoProviders.isGuid(tid)) throw new Rejected("no tenant in the token");
            tid = tid.toLowerCase();
            if (!iss.equalsIgnoreCase("https://login.microsoftonline.com/" + tid + "/v2.0"))
                throw new Rejected("wrong issuer");
            boolean personal = tid.equals(SsoProviders.MICROSOFT_PERSONAL_TENANT);
            String want = p.tenant();
            boolean allowed = "common".equals(want)
                    || ("consumers".equals(want) && personal)
                    || ("organizations".equals(want) && !personal)
                    || tid.equals(want);
            if (!allowed) throw new Rejected("tenant not accepted");
            return;
        }
        throw new Rejected("unknown provider");
    }

    private static String stringClaim(JWTClaimsSet claims, String name) {
        Object v = claims.getClaim(name);
        return v instanceof String s ? s : null;
    }

    // ── the provider's keys ───────────────────────────────────────────────────

    private RSAKey keyFor(SsoProviders.Provider p, String kid, Instant now) throws Rejected {
        Keys keys = keysByProvider.get(p.id());
        if (keys == null || (olderThan(keys.fetchedAt(), KEYS_TTL, now) && olderThan(keys.triedAt(), KEYS_MIN_REFETCH, now)))
            keys = fetchKeys(p, now, keys);
        RSAKey key = pick(keys, kid);
        if (key == null && olderThan(keys.triedAt(), KEYS_MIN_REFETCH, now)) {
            // Providers rotate keys; a token signed by a new one is worth one refetch.
            keys = fetchKeys(p, now, keys);
            key = pick(keys, kid);
        }
        if (key == null) throw new Rejected("signed by a key the provider does not publish");
        return key;
    }

    private static boolean olderThan(Instant then, Duration age, Instant now) {
        return Duration.between(then, now).compareTo(age) > 0;
    }

    private static RSAKey pick(Keys keys, String kid) {
        JWK jwk = keys.set().getKeyByKeyId(kid);
        if (!(jwk instanceof RSAKey rsa)) return null;
        if (rsa.getKeyUse() != null && !KeyUse.SIGNATURE.equals(rsa.getKeyUse())) return null;
        return rsa;
    }

    /** Fetches the key set; when that fails and an older set is at hand, the older set is kept. */
    private synchronized Keys fetchKeys(SsoProviders.Provider p, Instant now, Keys previous) throws Rejected {
        Keys current = keysByProvider.get(p.id());
        if (current != null && current != previous) return current;    // another request just fetched them
        try {
            SsoHttp.Response r = http.get(p.jwksUrl());
            if (r.status() != 200) throw new IllegalStateException("status " + r.status());
            Keys fresh = new Keys(JWKSet.parse(r.body()), now, now);
            keysByProvider.put(p.id(), fresh);
            return fresh;
        } catch (Exception e) {
            log.warn("Could not fetch the sign-in keys of {}: {}", p.id(), e.toString());
            if (previous == null) throw new Rejected("the provider's keys could not be fetched");
            Keys kept = new Keys(previous.set(), previous.fetchedAt(), now);
            keysByProvider.put(p.id(), kept);
            return kept;
        }
    }
}
