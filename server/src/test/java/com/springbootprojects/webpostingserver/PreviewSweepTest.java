package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.model.Post;
import com.springbootprojects.webpostingserver.posts.repository.PostRepository;
import com.springbootprojects.webpostingserver.posts.service.PostPreview;
import com.springbootprojects.webpostingserver.posts.service.PreviewSweep;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The background sweep that brings old rows to the current preview version
 * (V020): it fills what a save has not, never undoes a save, survives a bad
 * row, and keeps nothing in memory that a restart would lose.
 *
 * The context's own sweep may be ticking against the same database while
 * these run, so the database tests assert what the rows end up holding, which
 * is the same whichever of the two wrote it; the counters and the pacing are
 * tested against a mocked JdbcTemplate.
 */
@SpringBootTest
class PreviewSweepTest {

    private static final String AUTHOR = "preview_sweep_author";
    private static final String GRID = "{\"cols\":16,\"rows\":8,\"layers\":[{\"kind\":\"pixel\",\"visible\":true,\"text\":[\"OLD\"]}]}";
    private static final String NEWER_GRID = "{\"cols\":4,\"rows\":4,\"layers\":[]}";

    @Autowired JdbcTemplate jdbc;
    @Autowired PostRepository posts;

    private int authorId;

    @BeforeEach
    void setUp() {
        cleanUp();
        authorId = jdbc.queryForObject("INSERT INTO users (username, password) VALUES (?, 'x') RETURNING id", Integer.class, AUTHOR);
    }

    @AfterEach
    void cleanUp() {
        for (Integer id : jdbc.queryForList("SELECT j.post_id FROM users_posts_junctions j JOIN users u ON u.id = j.user_id WHERE u.username = ?", Integer.class, AUTHOR)) {
            jdbc.update("DELETE FROM users_posts_junctions WHERE post_id = ?", id);
            jdbc.update("DELETE FROM posts WHERE id = ?", id);
        }
        jdbc.update("DELETE FROM users WHERE username = ?", AUTHOR);
    }

    private static String body(String grid, String words) {
        return "{\"root\":{\"type\":\"root\",\"children\":["
                + "{\"type\":\"paragraph\",\"children\":[{\"type\":\"text\",\"text\":\"" + words + "\"}]},"
                + "{\"type\":\"tilegrid\",\"version\":1,\"grid\":" + grid + "}]}}";
    }

    /** A row as V020 leaves an existing post, or as an import inserts one: nothing computed. */
    private int oldRow(String description) {
        int id = jdbc.queryForObject("INSERT INTO posts (title, description, published) VALUES ('old', ?, true) RETURNING id", Integer.class, description);
        jdbc.update("INSERT INTO users_posts_junctions (user_id, post_id) VALUES (?, ?)", authorId, id);
        return id;
    }

    private Map<String, Object> row(int id) {
        return jdbc.queryForMap("SELECT card_preview, search_text, preview_version::int AS preview_version FROM posts WHERE id = ?", id);
    }

    private long remaining() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM posts WHERE preview_version < ?", Long.class, PostPreview.VERSION);
    }

    /** Batches until nothing is left, as the scheduler would over a few ticks. */
    private void runToTheEnd(PreviewSweep sweep) {
        for (int i = 0; i < 500 && remaining() > 0; i++) sweep.runBatch();
    }

    // ── Against the database ──────────────────────────────────────────────────

    @Test
    void rowsBelowTheVersionAreFilledAndThenThereIsNothingToDo() {
        int gridded = oldRow(body(GRID, "old words"));
        int plain = oldRow("just text");

        PreviewSweep sweep = new PreviewSweep(jdbc, false);
        runToTheEnd(sweep);

        assertThat(row(gridded)).containsEntry("card_preview", GRID)
                .containsEntry("search_text", "old words\nOLD").containsEntry("preview_version", PostPreview.VERSION);
        assertThat(row(plain)).containsEntry("card_preview", null)
                .containsEntry("search_text", "just text").containsEntry("preview_version", PostPreview.VERSION);

        assertThat(remaining()).isZero();
        assertThat(sweep.runBatch()).isZero();
        assertThat(sweep.status()).containsEntry("remaining", 0L).containsEntry("version", PostPreview.VERSION);
    }

    @Test
    void moreRowsThanOneBatchAreAllReached() {
        List<Integer> ids = new java.util.ArrayList<>();
        for (int i = 0; i < 25; i++) ids.add(oldRow(body(GRID, "row " + i)));

        runToTheEnd(new PreviewSweep(jdbc, false));

        for (int i = 0; i < ids.size(); i++)
            assertThat(row(ids.get(i))).containsEntry("search_text", "row " + i + "\nOLD").containsEntry("preview_version", PostPreview.VERSION);
    }

    @Test
    void aRowAlreadyAtTheVersionIsLeftAlone() {
        // What a save wrote stands, even if it is not what the sweep would compute.
        int id = oldRow(body(GRID, "words"));
        jdbc.update("UPDATE posts SET card_preview = 'kept', search_text = 'kept', preview_version = ? WHERE id = ?", PostPreview.VERSION, id);
        int waiting = oldRow(body(GRID, "words"));

        runToTheEnd(new PreviewSweep(jdbc, false));

        assertThat(row(id)).containsEntry("card_preview", "kept").containsEntry("search_text", "kept");
        assertThat(row(waiting)).containsEntry("card_preview", GRID);
    }

    @Test
    void aSaveThatLandsWhileTheSweepHoldsTheOldBodyWins() {
        int id = oldRow(body(GRID, "old words"));
        AtomicInteger savedInBetween = new AtomicInteger();

        // The user's save arrives after the sweep has read the old body and before it writes.
        JdbcTemplate interleaving = new JdbcTemplate(jdbc.getDataSource()) {
            @Override
            public <T> List<T> queryForList(String sql, Class<T> elementType, Object... args) {
                List<T> result = super.queryForList(sql, elementType, args);
                if (sql.startsWith("SELECT description") && args[0].equals(id)) {
                    Post newer = posts.findById((long) id);
                    newer.setDescription(body(NEWER_GRID, "new words"));
                    posts.update(newer);
                    savedInBetween.incrementAndGet();
                }
                return result;
            }
        };
        PreviewSweep sweep = new PreviewSweep(interleaving, false);
        // Should the context's own sweep have taken the row first, put it back and go again.
        for (int attempt = 0; attempt < 5 && savedInBetween.get() == 0; attempt++) {
            jdbc.update("UPDATE posts SET preview_version = 0 WHERE id = ?", id);
            for (int i = 0; i < 500 && savedInBetween.get() == 0 && remaining() > 0; i++) sweep.runBatch();
        }

        assertThat(savedInBetween.get()).isEqualTo(1);
        assertThat(row(id)).containsEntry("card_preview", NEWER_GRID)
                .containsEntry("search_text", "new words").containsEntry("preview_version", PostPreview.VERSION);
    }

    @Test
    void anImportedRowIsPickedUpByALaterProbe() {
        PreviewSweep sweep = new PreviewSweep(jdbc, false);
        runToTheEnd(sweep);
        assertThat(sweep.runBatch()).isZero();

        // Nothing in the sweep remembers "done": the next probe sees the new row.
        int imported = oldRow(body(GRID, "imported"));
        runToTheEnd(sweep);
        assertThat(row(imported)).containsEntry("card_preview", GRID).containsEntry("preview_version", PostPreview.VERSION);
    }

    // ── Counters and pacing (no database) ─────────────────────────────────────

    private static final String PROBE = "SELECT id FROM posts WHERE preview_version";
    private static final String READ = "SELECT description";
    private static final String WRITE = "UPDATE posts SET card_preview";

    private static JdbcTemplate mockDb() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        when(db.queryForObject(contains("COUNT(*)"), eq(Long.class), any(Object[].class))).thenReturn(0L);
        return db;
    }

    private static void pending(JdbcTemplate db, int after, Integer... ids) {
        when(db.queryForList(contains(PROBE), eq(Integer.class), eq(PostPreview.VERSION), eq(after), anyInt())).thenReturn(List.of(ids));
    }

    private static void bodyOf(JdbcTemplate db, int id, String description) {
        when(db.queryForList(contains(READ), eq(String.class), eq(id))).thenReturn(List.of(description));
    }

    @Test
    void theCountersSayWhatWasDone() {
        JdbcTemplate db = mockDb();
        String huge = "{\"layers\":[{\"paint\":\"" + "a".repeat(PostPreview.PREVIEW_MAX_CHARS) + "\"}]}";
        pending(db, 0, 1, 2, 3);
        bodyOf(db, 1, body(GRID, "one"));
        bodyOf(db, 2, body(huge, "two"));
        bodyOf(db, 3, body(GRID, "three"));
        when(db.update(contains(WRITE), any(Object[].class))).thenReturn(1);
        // Post 3 was saved by its author in the meantime: the guarded update touches no row.
        when(db.update(contains(WRITE), any(), any(), any(), eq(3), any())).thenReturn(0);

        PreviewSweep sweep = new PreviewSweep(db, true);
        assertThat(sweep.status()).containsEntry("lastRunAt", null).containsEntry("lastError", null);
        assertThat(sweep.runBatch()).isEqualTo(2);

        verify(db).update(contains("AND preview_version < ?"), eq(GRID), eq("one\nOLD"), eq(PostPreview.VERSION), eq(1), eq(PostPreview.VERSION));
        verify(db).update(contains("AND preview_version < ?"), eq(null), eq("two"), eq(PostPreview.VERSION), eq(2), eq(PostPreview.VERSION));
        assertThat(sweep.status())
                .containsEntry("processed", 2L).containsEntry("tooBig", 1L).containsEntry("failed", 0L)
                .containsEntry("lastError", null).containsEntry("remaining", 0L);
        assertThat(sweep.status().get("lastRunAt")).isNotNull();
    }

    @Test
    void anEmptyProbeRestsForAMinuteAndRunNowDoesNotWait() {
        JdbcTemplate db = mockDb();
        pending(db, 0);

        PreviewSweep sweep = new PreviewSweep(db, true);
        sweep.tick();                                   // probes, finds nothing
        for (int i = 0; i < 30; i++) sweep.tick();      // the rest: no queries
        verify(db, times(1)).queryForList(contains(PROBE), eq(Integer.class), any(Object[].class));
        sweep.tick();                                   // the next probe, a minute later
        verify(db, times(2)).queryForList(contains(PROBE), eq(Integer.class), any(Object[].class));

        sweep.runNow();                                 // the admin does not wait for the minute
        verify(db, times(3)).queryForList(contains(PROBE), eq(Integer.class), any(Object[].class));
    }

    @Test
    void switchedOffTheScheduleDoesNothingButRunNowStillWorks() {
        JdbcTemplate db = mockDb();
        pending(db, 0);

        PreviewSweep sweep = new PreviewSweep(db, false);
        for (int i = 0; i < 5; i++) sweep.tick();
        verify(db, never()).queryForList(anyString(), eq(Integer.class), any(Object[].class));

        sweep.runNow();
        verify(db, times(1)).queryForList(contains(PROBE), eq(Integer.class), any(Object[].class));
    }

    @Test
    void aRowThatFailsIsCountedPassedOverAndTriedAgainNextPass() {
        JdbcTemplate db = mockDb();
        pending(db, 0, 1, 2);
        pending(db, 2);
        when(db.queryForList(contains(READ), eq(String.class), eq(1))).thenThrow(new DataAccessResourceFailureException("row 1 is broken"));
        bodyOf(db, 2, body(GRID, "two"));
        when(db.update(contains(WRITE), any(Object[].class))).thenReturn(1);

        PreviewSweep sweep = new PreviewSweep(db, true);
        sweep.tick();

        // The row behind the broken one was still done.
        verify(db).update(contains(WRITE), eq(GRID), eq("two\nOLD"), eq(PostPreview.VERSION), eq(2), eq(PostPreview.VERSION));
        assertThat(sweep.status()).containsEntry("processed", 1L).containsEntry("failed", 1L);
        assertThat((String) sweep.status().get("lastError")).contains("post 1").contains("row 1 is broken");

        // No tight loop: after an error the schedule rests for thirty ticks.
        for (int i = 0; i < 30; i++) sweep.tick();
        verify(db, times(1)).queryForList(contains(PROBE), eq(Integer.class), any(Object[].class));

        // Then the pass ends (nothing after post 2) and goes round to the broken row again.
        pending(db, 0, 1);
        sweep.tick();
        assertThat(sweep.status()).containsEntry("processed", 1L).containsEntry("failed", 2L);
    }

    @Test
    void aDatabaseThatIsDownIsNotedAndWaitedOut() {
        JdbcTemplate db = mockDb();
        when(db.queryForList(contains(PROBE), eq(Integer.class), any(Object[].class)))
                .thenThrow(new DataAccessResourceFailureException("connection refused"));

        PreviewSweep sweep = new PreviewSweep(db, true);
        sweep.tick();                                   // must not throw: a scheduled method that throws is only logged, but keep it quiet
        for (int i = 0; i < 30; i++) sweep.tick();
        verify(db, times(1)).queryForList(contains(PROBE), eq(Integer.class), any(Object[].class));
        assertThat((String) sweep.status().get("lastError")).contains("connection refused");
        assertThat(sweep.status()).containsEntry("processed", 0L).containsEntry("failed", 0L);
    }
}
