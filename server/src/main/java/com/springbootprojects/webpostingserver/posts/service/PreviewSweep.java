package com.springbootprojects.webpostingserver.posts.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Fills posts.card_preview and posts.search_text (V020) for rows a save has
 * not written them for: every post that existed before V020, posts inserted
 * by an import, and every post again after PostPreview.VERSION is raised.
 *
 * Runs by itself in the background, a few rows at a time, so nobody has to
 * start it and the server never holds more than one post body for it. Until
 * a row is done, lists find its grid in the body on the fly and search finds
 * it by title only.
 *
 * Progress is the row's own preview_version, so a restart loses nothing:
 * the sweep starts again half a minute after boot and takes up whatever is
 * still below the current version. The counters here are for the admin panel
 * and count since this server started.
 */
@Service
public class PreviewSweep {

    private static final Logger log = LoggerFactory.getLogger(PreviewSweep.class);

    /** Rows per batch; with a batch every two seconds, about 1 000 posts in 200 seconds. */
    static final int BATCH = 10;
    /** Ticks skipped after an empty batch or an error: one probe a minute. */
    static final int IDLE_TICKS = 30;

    private final JdbcTemplate jdbc;
    private final boolean enabled;

    // Guarded by this object's lock (tick, runBatch and runNow are synchronized).
    private int idleTicks;
    /**
     * The last id tried in this pass. A row that keeps failing is passed over
     * until the pass ends, instead of heading every batch and holding up the
     * rows behind it.
     */
    private int afterId;
    private long doneThisPass;

    private final AtomicLong processed = new AtomicLong();
    private final AtomicLong tooBig = new AtomicLong();
    private final AtomicLong failed = new AtomicLong();
    private volatile String lastError;
    private volatile Instant lastRunAt;

    @Autowired
    public PreviewSweep(JdbcTemplate jdbc, @Value("${app.preview-sweep.enabled:true}") boolean enabled) {
        this.jdbc = jdbc;
        this.enabled = enabled;
    }

    /** The background run. "Run now" in the admin panel works whether or not this is enabled. */
    @Scheduled(fixedDelay = 2000, initialDelay = 30_000)
    public synchronized void tick() {
        if (!enabled) return;
        if (idleTicks > 0) { idleTicks--; return; }
        runBatch();
    }

    /** For the admin's "Run now": one batch at once, whatever the idle count says. */
    public synchronized Map<String, Object> runNow() {
        idleTicks = 0;
        runBatch();
        return status();
    }

    /**
     * Brings up to BATCH rows to the current version, one body in memory at a
     * time. Never throws: a row that fails is counted and left for the next
     * pass, and any error makes the background run wait a minute, so a
     * lasting fault cannot become a tight loop.
     *
     * @return how many rows this call wrote
     */
    public synchronized int runBatch() {
        lastRunAt = Instant.now();
        int wrote = 0;
        try {
            List<Integer> ids = pending(afterId);
            if (ids.isEmpty() && afterId > 0) {
                // End of a pass: go round once more for rows that failed or
                // arrived with a lower id than the pass had reached.
                afterId = 0;
                ids = pending(0);
            }
            if (ids.isEmpty()) {
                if (doneThisPass > 0) log.info("Preview sweep: {} post(s) brought to version {}; {} over the size cap since start",
                        doneThisPass, PostPreview.VERSION, tooBig.get());
                doneThisPass = 0;
                idleTicks = IDLE_TICKS;
                return 0;
            }
            boolean trouble = false;
            for (int id : ids) {
                try {
                    if (compute(id)) wrote++;
                } catch (Exception e) {
                    trouble = true;
                    failed.incrementAndGet();
                    lastError = "post " + id + ": " + e;
                    log.warn("Preview sweep: post {} failed: {}", id, e.toString());
                }
                afterId = id;
            }
            doneThisPass += wrote;
            if (trouble) idleTicks = IDLE_TICKS;
        } catch (Exception e) {
            lastError = e.toString();
            idleTicks = IDLE_TICKS;
            log.warn("Preview sweep: batch failed: {}", e.toString());
        }
        return wrote;
    }

    private List<Integer> pending(int after) {
        return jdbc.queryForList(
                "SELECT id FROM posts WHERE preview_version < ? AND id > ? ORDER BY id LIMIT ?",
                Integer.class, PostPreview.VERSION, after, BATCH);
    }

    /**
     * One row. The update only applies while the row is still below the
     * current version: a save that landed between the read and the write has
     * already stored the preview of the newer body, and must not be undone by
     * this one of the older body.
     */
    private boolean compute(int id) {
        List<String> body = jdbc.queryForList("SELECT description FROM posts WHERE id = ?", String.class, id);
        if (body.isEmpty()) return false;   // deleted since the batch was read
        PostPreview.Result r = PostPreview.of(body.get(0));
        int rows = jdbc.update(
                "UPDATE posts SET card_preview = ?, search_text = ?, preview_version = ? WHERE id = ? AND preview_version < ?",
                r.gridJson(), r.searchText(), PostPreview.VERSION, id, PostPreview.VERSION);
        if (rows == 0) return false;
        processed.incrementAndGet();
        if (r.gridTooBig()) {
            tooBig.incrementAndGet();
            log.info("Preview sweep: the first grid of post {} is over {} characters; its card shows no grid", id, PostPreview.PREVIEW_MAX_CHARS);
        }
        return true;
    }

    /**
     * For the admin panel. "remaining" is read from the table and is true
     * whenever it is asked; the other figures count since this server started.
     */
    public Map<String, Object> status() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("version", PostPreview.VERSION);
        out.put("remaining", jdbc.queryForObject("SELECT COUNT(*) FROM posts WHERE preview_version < ?", Long.class, PostPreview.VERSION));
        out.put("processed", processed.get());
        out.put("tooBig", tooBig.get());
        out.put("failed", failed.get());
        out.put("lastError", lastError);
        Instant at = lastRunAt;
        out.put("lastRunAt", at == null ? null : at.toString());
        return out;
    }
}
