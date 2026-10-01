package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.HealthController;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HealthControllerTest {

    @Mock JdbcTemplate jdbc;
    @InjectMocks HealthController health;

    @Test
    void upWhenTheDatabaseAnswers() {
        when(jdbc.queryForObject("SELECT 1", Integer.class)).thenReturn(1);

        var resp = health.health();

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsEntry("status", "ok");
    }

    @Test
    void unavailableWhenTheDatabaseDoesNot() {
        when(jdbc.queryForObject("SELECT 1", Integer.class))
                .thenThrow(new DataAccessResourceFailureException("connection refused"));

        var resp = health.health();

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(resp.getBody()).containsEntry("status", "unavailable");
    }
}
