package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.PreviewAdminController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.service.PreviewSweep;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** The preview sweep's status and "Run now" are for admins only, like every admin route. */
@ExtendWith(MockitoExtension.class)
class PreviewAdminControllerTest {

    @Mock JdbcLoginRepository loginRepository;
    @Mock PreviewSweep sweep;

    @InjectMocks PreviewAdminController controller;

    private static final Map<String, Object> STATUS = Map.of("version", 1, "remaining", 3L);

    @Test
    void aMemberWhoIsNotAnAdminIsRefused() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(new AuthSession("whiskers"));
        when(loginRepository.isAdmin("whiskers")).thenReturn(false);

        assertThat(controller.status("whiskers", "tok").getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(controller.run("whiskers", "tok").getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verifyNoInteractions(sweep);
    }

    @Test
    void aForgedOrExpiredSessionIsRefusedEvenWithAnAdminsName() throws Exception {
        when(loginRepository.authorize("catmin", "forged")).thenReturn(null);
        when(loginRepository.authorize("catmin", "expired")).thenThrow(new JdbcLoginRepository.TokenExpiredException());

        assertThat(controller.run("catmin", "forged").getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(controller.status("catmin", "expired").getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verifyNoInteractions(sweep);
    }

    @Test
    void anAdminSeesTheStatusAndCanRunABatch() throws Exception {
        when(loginRepository.authorize("catmin", "tok")).thenReturn(new AuthSession("catmin"));
        when(loginRepository.isAdmin("catmin")).thenReturn(true);
        when(sweep.status()).thenReturn(STATUS);
        when(sweep.runNow()).thenReturn(STATUS);

        ResponseEntity<Map<String, Object>> status = controller.status("catmin", "tok");
        assertThat(status.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(status.getBody()).containsEntry("remaining", 3L);

        assertThat(controller.run("catmin", "tok").getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(sweep).runNow();
    }
}
