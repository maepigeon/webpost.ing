package com.springbootprojects.webpostingserver.posts.service;

import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The short-lived, server-side half of a single sign-on round trip. Kept in
 * memory like the sessions themselves: a restart drops what is in flight and
 * the person starts again.
 *
 * <ul>
 *   <li><b>Flows</b>: what was sent to the provider (nonce, PKCE verifier) and
 *       which browser started it, keyed by the random {@code state}. Ten
 *       minutes, used once: a second callback with the same state finds
 *       nothing, which is what stops a replayed code.</li>
 *   <li><b>Pending identities</b>: a provider account that proved itself but
 *       has no member yet, waiting for a username. Ten minutes; removed when
 *       the account is made. Holds provider, subject and email, no secrets.</li>
 *   <li><b>Fresh sign-ins</b>: which sessions were created by a provider
 *       sign-in in the last five minutes; that is the re-authentication an
 *       account without a password can offer.</li>
 * </ul>
 * All three are bounded; when one is full of live entries a new one is
 * refused, so a flood cannot push out somebody's sign-in in progress.
 */
@Component
public class SsoFlowStore {

    public static final Duration FLOW_TTL = Duration.ofMinutes(10);
    public static final Duration FRESH_FOR = Duration.ofMinutes(5);
    static final int MAX_ENTRIES = 10_000;
    /** Tries at choosing a username (or guessing an invite code) one pending identity gets. */
    static final int MAX_PENDING_ATTEMPTS = 20;

    public static final String INTENT_SIGN_IN = "signin";
    public static final String INTENT_LINK = "link";
    public static final String INTENT_REAUTH = "reauth";

    /** {@code userId} is the signed-in member for link and reauth, 0 for a plain sign-in. */
    public record Flow(String provider, String intent, String nonce, String verifier,
                       String browserKey, int userId, Instant createdAt) { }

    public record Pending(String provider, String subject, String email, boolean emailVerified,
                          Instant createdAt, AtomicInteger attempts) { }

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();

    private final Map<String, Flow> flows = new ConcurrentHashMap<>();
    private final Map<String, Pending> pendings = new ConcurrentHashMap<>();
    private final Map<String, Instant> fresh = new ConcurrentHashMap<>();
    private volatile Clock clock = Clock.systemUTC();

    /** For tests: time can be moved without sleeping. */
    public void setClock(Clock clock) { this.clock = clock; }

    public Instant now() { return clock.instant(); }

    /** 32 random bytes as URL-safe text (43 characters). */
    public static String randomToken() {
        byte[] b = new byte[32];
        RANDOM.nextBytes(b);
        return B64.encodeToString(b);
    }

    private static boolean same(String a, String b) {
        if (a == null || b == null) return false;
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    // ── flows ─────────────────────────────────────────────────────────────────

    /** Remembers a sign-in that is leaving for the provider; returns its state, or null when full. */
    public String begin(String provider, String intent, String nonce, String verifier, String browserKey, int userId) {
        Instant now = now();
        if (flows.size() >= MAX_ENTRIES) {
            flows.values().removeIf(f -> expired(f.createdAt(), FLOW_TTL, now));
            if (flows.size() >= MAX_ENTRIES) return null;
        }
        String state = randomToken();
        flows.put(state, new Flow(provider, intent, nonce, verifier, browserKey, userId, now));
        return state;
    }

    /**
     * Takes the flow out, whatever happens next: a state works once. Null when
     * it is unknown, used, older than ten minutes, for another provider, or was
     * started by another browser.
     */
    public Flow consume(String state, String provider, String browserKey) {
        if (state == null || state.length() > 128) return null;
        Flow f = flows.remove(state);
        if (f == null) return null;
        if (expired(f.createdAt(), FLOW_TTL, now())) return null;
        if (!f.provider().equals(provider)) return null;
        if (!same(f.browserKey(), browserKey)) return null;
        return f;
    }

    // ── pending identities ────────────────────────────────────────────────────

    /** Keeps a proven provider account until a username is chosen; returns the ticket, or null when full. */
    public String hold(String provider, String subject, String email, boolean emailVerified) {
        Instant now = now();
        if (pendings.size() >= MAX_ENTRIES) {
            pendings.values().removeIf(p -> expired(p.createdAt(), FLOW_TTL, now));
            if (pendings.size() >= MAX_ENTRIES) return null;
        }
        String ticket = randomToken();
        pendings.put(ticket, new Pending(provider, subject, email, emailVerified, now, new AtomicInteger()));
        return ticket;
    }

    /** The pending identity for a ticket, or null when there is none or it ran out. */
    public Pending pending(String ticket) {
        if (ticket == null || ticket.length() > 128) return null;
        Pending p = pendings.get(ticket);
        if (p == null) return null;
        if (expired(p.createdAt(), FLOW_TTL, now()) || p.attempts().get() >= MAX_PENDING_ATTEMPTS) {
            pendings.remove(ticket);
            return null;
        }
        return p;
    }

    /** Takes the ticket for good; true for exactly one caller, so two tabs cannot both make an account from it. */
    public boolean claim(String ticket, Pending expected) {
        return ticket != null && pendings.remove(ticket, expected);
    }

    /** Puts a claimed ticket back when making the account failed for a reason the person can fix. */
    public void restore(String ticket, Pending p) {
        if (ticket != null && p != null && !expired(p.createdAt(), FLOW_TTL, now())) pendings.putIfAbsent(ticket, p);
    }

    public void drop(String ticket) {
        if (ticket != null) pendings.remove(ticket);
    }

    // ── fresh provider sign-ins ───────────────────────────────────────────────

    /** Notes that this session was just created by a provider sign-in. */
    public void markFresh(String sessionToken) {
        if (sessionToken == null) return;
        Instant now = now();
        if (fresh.size() >= MAX_ENTRIES) {
            fresh.values().removeIf(t -> expired(t, FRESH_FOR, now));
            if (fresh.size() >= MAX_ENTRIES) return;
        }
        fresh.put(sessionToken, now);
    }

    /** True when this session came from a provider sign-in within the last five minutes. */
    public boolean isFresh(String sessionToken) {
        if (sessionToken == null) return false;
        Instant at = fresh.get(sessionToken);
        if (at == null) return false;
        if (expired(at, FRESH_FOR, now())) {
            fresh.remove(sessionToken);
            return false;
        }
        return true;
    }

    private static boolean expired(Instant since, Duration ttl, Instant now) {
        return Duration.between(since, now).compareTo(ttl) > 0;
    }

    /** Forgets everything (for tests). */
    public void clear() {
        flows.clear();
        pendings.clear();
        fresh.clear();
    }

    /** Entries held, live or not (for tests). */
    public int size() { return flows.size() + pendings.size() + fresh.size(); }
}
