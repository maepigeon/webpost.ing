package com.springbootprojects.webpostingserver.posts.validator;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Generic in-memory sliding-window rate limiter.
 *
 * Usage pattern (create one static instance per action type):
 *
 *   private static final RateLimiter MSG_LIMITER =
 *       new RateLimiter(20, 60 * 60 * 1000L, 60 * 60 * 1000L);
 *
 *   if (MSG_LIMITER.isBlocked(String.valueOf(userId))) return tooManyRequests();
 *   // ... do work ...
 *   MSG_LIMITER.recordUse(String.valueOf(userId));
 *
 * State is in-memory and cleared on server restart.
 */
public class RateLimiter {

    private final int maxUses;
    private final long windowMs;
    private final long lockoutMs;

    private record Slot(int count, long windowStart, long lockedUntil) {}

    private final ConcurrentHashMap<String, Slot> state = new ConcurrentHashMap<>();

    public RateLimiter(int maxUses, long windowMs, long lockoutMs) {
        this.maxUses   = maxUses;
        this.windowMs  = windowMs;
        this.lockoutMs = lockoutMs;
    }

    public boolean isBlocked(String key) {
        Slot s = state.get(key);
        if (s == null) return false;
        long now = Instant.now().toEpochMilli();
        if (s.lockedUntil() > 0) {
            if (now < s.lockedUntil()) return true;
            state.remove(key);
            return false;
        }
        if (now - s.windowStart() > windowMs) {
            state.remove(key);
            return false;
        }
        return false;
    }

    public void recordUse(String key) {
        long now = Instant.now().toEpochMilli();
        state.compute(key, (k, existing) -> {
            if (existing == null) return new Slot(1, now, 0);
            if (now - existing.windowStart() > windowMs) return new Slot(1, now, 0);
            int newCount = existing.count() + 1;
            long locked = newCount >= maxUses ? now + lockoutMs : 0;
            return new Slot(newCount, existing.windowStart(), locked);
        });
    }

    public void reset(String key) {
        state.remove(key);
    }
}
