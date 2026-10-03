package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.service.PostingGate;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;


import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Password storage (cost factor and upgrade at sign-in) and the behaviour of a
 * site with mail switched off, which is how production starts. Names start with "ar_".
 */
@SpringBootTest
@AutoConfigureMockMvc(print = org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint.NONE)
class AccountsReadinessTest {

    private static final String PW = "Correct-horse-42!";

    private static CrossRunLock runLock;

    @BeforeAll
    static void waitForOtherRuns() throws Exception {
        runLock = CrossRunLock.acquire("accounts");
    }

    @AfterAll
    static void letOtherRunsGo() throws Exception {
        runLock.close();
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired LoginRepository logins;
    @Autowired PostingGate gate;

    @BeforeEach
    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM users WHERE username LIKE 'ar\\_%'");
        jdbc.update("DELETE FROM system_settings WHERE key = 'require_verified_email'");
    }

    private int user(String name, String hash, String email, boolean verified) {
        return jdbc.queryForObject(
                "INSERT INTO users (username, password, email, email_verified) VALUES (?,?,?,?) RETURNING id",
                Integer.class, name, hash, email, verified);
    }

    private String hashOf(String name) {
        return jdbc.queryForObject("SELECT password FROM users WHERE username = ?", String.class, name);
    }

    // ── cost factor ───────────────────────────────────────────────────────────

    @Test
    void newHashesUseCost12() {
        assertThat(JdbcLoginRepository.BCRYPT_COST).isEqualTo(12);
        String h = JdbcLoginRepository.hashPassword(PW);
        assertThat(h).startsWith("$2a$12$");
        assertThat(new BCryptPasswordEncoder().matches(PW, h)).isTrue();
        assertThat(JdbcLoginRepository.hashPassword(PW)).isNotEqualTo(h);   // salted
    }

    @Test
    void needsRehashOnlyForRealBcryptHashesOfALowerCost() {
        assertThat(JdbcLoginRepository.needsRehash(new BCryptPasswordEncoder(10).encode("x"))).isTrue();
        assertThat(JdbcLoginRepository.needsRehash(new BCryptPasswordEncoder(11).encode("x"))).isTrue();
        assertThat(JdbcLoginRepository.needsRehash(new BCryptPasswordEncoder(12).encode("x"))).isFalse();
        assertThat(JdbcLoginRepository.needsRehash(new BCryptPasswordEncoder(13).encode("x"))).isFalse();
        assertThat(JdbcLoginRepository.needsRehash("x")).isFalse();
        assertThat(JdbcLoginRepository.needsRehash("plaintext-password")).isFalse();
        assertThat(JdbcLoginRepository.needsRehash("$2a$10$short")).isFalse();
        assertThat(JdbcLoginRepository.needsRehash(null)).isFalse();
    }

    @Test
    void anOlderHashIsUpgradedOnTheNextSuccessfulSignInAndNotBefore() {
        String old = new BCryptPasswordEncoder(10).encode(PW);
        int id = user("ar_old", old, null, false);

        assertThat(logins.authenticate("ar_old", "Wrong-password-1!x")).isEqualTo(-1);
        assertThat(hashOf("ar_old")).isEqualTo(old);

        assertThat(logins.authenticate("ar_old", PW)).isEqualTo(id);
        String upgraded = hashOf("ar_old");
        assertThat(upgraded).startsWith("$2a$12$").isNotEqualTo(old);
        assertThat(new BCryptPasswordEncoder().matches(PW, upgraded)).isTrue();

        // Already current: left alone.
        assertThat(logins.authenticate("ar_old", PW)).isEqualTo(id);
        assertThat(hashOf("ar_old")).isEqualTo(upgraded);

        // A full sign-in works from an old hash too.
        user("ar_old2", old, null, false);
        LoginInfo info = new LoginInfo();
        info.setUsername("ar_old2");
        info.setPassword(PW);
        assertThat(logins.login(info).token).isNotEqualTo("-1");
        assertThat(hashOf("ar_old2")).startsWith("$2a$12$");
    }

    @Test
    void nullAndOverlongPasswordsAreRefusedWithoutHashing() {
        user("ar_long", JdbcLoginRepository.hashPassword(PW), null, false);
        assertThat(logins.authenticate("ar_long", null)).isEqualTo(-1);
        assertThat(logins.authenticate(null, PW)).isEqualTo(-1);
        assertThat(logins.authenticate("ar_long", "A1!a".repeat(40))).isEqualTo(-1);   // 160 characters
        LoginInfo info = new LoginInfo();
        assertThat(logins.login(info).loginHttpStatusCodeResult.value()).isEqualTo(400);
    }

    // ── mail off ──────────────────────────────────────────────────────────────

    @Test
    void withMailOffForgotSaysSoAndCreatesNothing() throws Exception {
        int id = user("ar_nomail", JdbcLoginRepository.hashPassword(PW), "ar.nomail@example.test", true);
        String reply = mvc.perform(post("/api/password/forgot").contentType("application/json")
                        .content("{\"email\":\"ar.nomail@example.test\"}"))
                .andReturn().getResponse().getContentAsString();
        assertThat(reply).contains("not switched on");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM email_tokens WHERE user_id = ?", Integer.class, id)).isZero();
        assertThat(mvc.perform(get("/api/signup/config")).andReturn().getResponse().getContentAsString())
                .contains("\"mailEnabled\":false");
    }

    @Test
    void theVerifiedEmailRuleDoesNothingWhileMailIsOff() {
        int id = user("ar_unver", JdbcLoginRepository.hashPassword(PW), "ar.unver@example.test", false);
        jdbc.update("INSERT INTO system_settings(key, value) VALUES ('require_verified_email', 'true')");
        assertThat(gate.mustVerifyFirst(id)).isFalse();
    }

    @Test
    void mailEnabledWithoutASenderDoesNotGateEither() {
        int id = user("ar_nosender", JdbcLoginRepository.hashPassword(PW), "ar.ns@example.test", false);
        jdbc.update("INSERT INTO system_settings(key, value) VALUES ('require_verified_email', 'true')");

        ObjectProvider<JavaMailSender> none = new ObjectProvider<>() {
            @Override public JavaMailSender getObject(Object... args) { throw new IllegalStateException(); }
            @Override public JavaMailSender getObject() { throw new IllegalStateException(); }
            @Override public JavaMailSender getIfAvailable() { return null; }
            @Override public JavaMailSender getIfUnique() { return null; }
        };
        assertThat(new PostingGate(jdbc, true, none).mustVerifyFirst(id)).isFalse();

        ObjectProvider<JavaMailSender> some = new ObjectProvider<>() {
            @Override public JavaMailSender getObject(Object... args) { return new JavaMailSenderImpl(); }
            @Override public JavaMailSender getObject() { return new JavaMailSenderImpl(); }
            @Override public JavaMailSender getIfAvailable() { return new JavaMailSenderImpl(); }
            @Override public JavaMailSender getIfUnique() { return new JavaMailSenderImpl(); }
        };
        assertThat(new PostingGate(jdbc, true, some).mustVerifyFirst(id)).isTrue();
    }
}
