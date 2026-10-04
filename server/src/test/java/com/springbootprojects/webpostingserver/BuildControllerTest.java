package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.BuildController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.service.BuildCheck;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** The update check is for admins only, like every admin route. */
@ExtendWith(MockitoExtension.class)
class BuildControllerTest {

    @Mock JdbcLoginRepository loginRepository;
    @Mock BuildCheck buildCheck;

    @InjectMocks BuildController controller;

    @Test
    void aMemberWhoIsNotAnAdminIsRefused() throws Exception {
        when(loginRepository.authorize("whiskers", "tok")).thenReturn(new AuthSession("whiskers"));
        when(loginRepository.isAdmin("whiskers")).thenReturn(false);

        assertThat(controller.latest("whiskers", "tok", "abc1234").getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verifyNoInteractions(buildCheck);
    }

    @Test
    void aForgedOrExpiredSessionIsRefused() throws Exception {
        when(loginRepository.authorize("catmin", "forged")).thenReturn(null);
        when(loginRepository.authorize("catmin", "expired")).thenThrow(new JdbcLoginRepository.TokenExpiredException());

        assertThat(controller.latest("catmin", "forged", "").getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(controller.latest("catmin", "expired", "").getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verifyNoInteractions(buildCheck);
    }

    @Test
    void anAdminGetsTheAnswer() throws Exception {
        when(loginRepository.authorize("catmin", "tok")).thenReturn(new AuthSession("catmin"));
        when(loginRepository.isAdmin("catmin")).thenReturn(true);
        when(buildCheck.latest("abc1234")).thenReturn(Map.of("available", false));

        var res = controller.latest("catmin", "tok", "abc1234");
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).isEqualTo(Map.of("available", false));
    }
}
