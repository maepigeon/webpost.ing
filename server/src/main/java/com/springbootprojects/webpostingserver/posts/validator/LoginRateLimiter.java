package com.springbootprojects.webpostingserver.posts.validator;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory per-IP rate limiter for the login endpoint.
 * Locks an IP for LOCKOUT_MS after MAX_ATTEMPTS failures within WINDOW_MS.
 * State is lost on server restart (acceptable for an in-memory implementation).
 */
public class LoginRateLimiter {

    private static final int MAX_ATTEMPTS = 15;
    private static final long WINDOW_MS = 15 * 60 * 1000L;
    private static final long LOCKOUT_MS = 15 * 60 * 1000L;

    private record Attempt(int count, long firstAttemptAt, long lockedUntil) {}

    private static final ConcurrentHashMap<String, Attempt> state = new ConcurrentHashMap<>();

    /** Returns true if the IP is currently locked out. */
    public static boolean isBlocked(String ip) {
        Attempt a = state.get(ip);
        if (a == null) return false;
        long now = Instant.now().toEpochMilli();
        if (a.lockedUntil() > 0) {
            if (now < a.lockedUntil()) return true;
            state.remove(ip);
            return false;
        }
        if (now - a.firstAttemptAt() > WINDOW_MS) {
            state.remove(ip);
            return false;
        }
        return false;
    }

    /** Records a failed attempt for an IP. Triggers lockout after MAX_ATTEMPTS. */
    public static void recordFailure(String ip) {
        long now = Instant.now().toEpochMilli();
        state.compute(ip, (k, existing) -> {
            if (existing == null) return new Attempt(1, now, 0);
            if (now - existing.firstAttemptAt() > WINDOW_MS) return new Attempt(1, now, 0);
            int newCount = existing.count() + 1;
            long locked = newCount >= MAX_ATTEMPTS ? now + LOCKOUT_MS : 0;
            return new Attempt(newCount, existing.firstAttemptAt(), locked);
        });
    }

    /** Clears failure state for an IP after a successful login. */
    public static void recordSuccess(String ip) {
        state.remove(ip);
    }
}
