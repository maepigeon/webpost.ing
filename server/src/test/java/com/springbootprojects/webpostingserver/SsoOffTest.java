package com.springbootprojects.webpostingserver;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * With no SSO_* values in the environment (the default, and production until
 * the owner registers with a provider) single sign-on is not there at all:
 * the sign-in page is told of no providers and every provider address is 404.
 */
@SpringBootTest
@AutoConfigureMockMvc
class SsoOffTest {

    @Autowired MockMvc mvc;

    @Test
    void theSignInPageIsToldOfNoProviders() throws Exception {
        mvc.perform(get("/api/signup/config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ssoProviders").isArray())
                .andExpect(jsonPath("$.ssoProviders").isEmpty())
                // What was there before is still there.
                .andExpect(jsonPath("$.inviteRequired").exists())
                .andExpect(jsonPath("$.mailEnabled").exists());
    }

    @Test
    void everyProviderAddressIsNotFoundAndStartsNothing() throws Exception {
        for (String provider : List.of("google", "microsoft", "apple")) {
            mvc.perform(get("/api/auth/sso/" + provider + "/start"))
                    .andExpect(status().isNotFound())
                    .andExpect(cookie().doesNotExist("sso_state"));
            mvc.perform(get("/api/auth/sso/" + provider + "/start").param("intent", "reauth"))
                    .andExpect(status().isNotFound());
            mvc.perform(get("/api/auth/sso/" + provider + "/callback").param("code", "x").param("state", "y"))
                    .andExpect(status().isNotFound())
                    .andExpect(cookie().doesNotExist("authToken"));
            mvc.perform(post("/api/auth/sso/" + provider + "/link").contentType("application/json").content("{\"password\":\"x\"}"))
                    .andExpect(status().isNotFound());
        }
    }

    @Test
    void nothingIsPendingAndNothingCanBeCompleted() throws Exception {
        mvc.perform(get("/api/auth/sso/pending")).andExpect(status().isNotFound());
        mvc.perform(post("/api/auth/sso/complete").contentType("application/json").content("{\"username\":\"sso_off_nobody\"}"))
                .andExpect(status().isGone());
        // The signed-in parts still ask for a session first.
        mvc.perform(get("/api/auth/sso/methods")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/sso/password").contentType("application/json").content("{\"newPassword\":\"x\"}"))
                .andExpect(status().isUnauthorized());
    }
}
