package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.service.SecurityLog;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SecurityLogTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final SecurityLog log = new SecurityLog(jdbc);

    @Test
    void writesAShortenedAddressAndTruncates() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRemoteAddr("198.51.100.23");
        req.addHeader("User-Agent", "x".repeat(500));
        log.record(3, "sign_in", "d".repeat(500), req);
        verify(jdbc).update(contains("INSERT INTO security_events"), eq(3), eq("sign_in"),
                argThat((String d) -> d.length() == 200), eq("198.51.100.0"), argThat((String u) -> u.length() == 200));
    }

    @Test
    void failedSignInIsLimitedToOneAMinute() {
        when(jdbc.queryForObject(contains("sign_in_failed"), eq(Integer.class), eq(3))).thenReturn(1);
        log.record(3, "sign_in_failed", null, new MockHttpServletRequest());
        verify(jdbc, never()).update(contains("INSERT"), any(), any(), any(), any(), any());
    }

    @Test
    void unknownKindsAndErrorsAreIgnored() {
        log.record(3, "nonsense", null, null);
        verifyNoInteractions(jdbc);
        when(jdbc.update(anyString(), any(), any(), any(), any(), any())).thenThrow(new RuntimeException("db down"));
        log.record(3, "sign_out", null, null); // must not throw
        assertThat(true).isTrue();
    }

    @Test
    void unknownUsernameRecordsNothing() {
        when(jdbc.queryForList(anyString(), eq(Integer.class), eq("ghost"))).thenReturn(java.util.List.of());
        log.recordForUsername("ghost", "sign_in_failed", null, new MockHttpServletRequest());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
}
