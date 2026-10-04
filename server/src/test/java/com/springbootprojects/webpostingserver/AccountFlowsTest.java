package com.springbootprojects.webpostingserver;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.springbootprojects.webpostingserver.posts.controller.AuthController;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.service.EmailTokenService;
import com.springbootprojects.webpostingserver.posts.service.PostingGate;
import com.springbootprojects.webpostingserver.posts.validator.LoginRateLimiter;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

/**
 * The account flows end to end against the real database: sign-up with invite
 * codes, sign-in and lockouts, cookies, changing and resetting a password,
 * the verified-email rule, and deleting the account. Mail is switched on with a
 * recording sender in place of SMTP, so the links people would receive can be
 * read back. Every name starts with "af_".
 */
@SpringBootTest(properties = {"app.mail.enabled=true", "app.upload-dir=target/account-flows-uploads"})
// MockMvc prints every request body by default; that is the test harness, not the server's log.
@AutoConfigureMockMvc(print = org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint.NONE)
@Import(AccountFlowsTest.RecordingMail.class)
@ExtendWith(OutputCaptureExtension.class)
class AccountFlowsTest {

    /** The mail sender, minus the network: every message is kept for the test to read. */
    static final List<SimpleMailMessage> SENT = new CopyOnWriteArrayList<>();

    @TestConfiguration
    static class RecordingMail {
        @Bean
        JavaMailSender recordingMailSender() {
            return new JavaMailSenderImpl() {
                @Override
                public void send(SimpleMailMessage... messages) {
                    SENT.addAll(List.of(messages));
                }
            };
        }
    }

    private static final String GOOD_PW = "Correct-horse-42!";
    private static final String OTHER_PW = "Another-secret-77?";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final AtomicInteger NEXT_ADDRESS = new AtomicInteger(1);

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
    @Autowired AuthController authController;
    @Autowired EmailTokenService tokens;

    private String savedDailyLimit;

    @BeforeEach
    void setUp() {
        cleanUp();
        LoginRateLimiter.clear();
        SENT.clear();
        savedDailyLimit = jdbc.queryForList("SELECT value FROM system_settings WHERE key='max_daily_registrations'",
                String.class).stream().findFirst().orElse("5");
        // The daily cap counts every account made today, test rows included.
        setting("max_daily_registrations", "-1");
        jdbc.update("DELETE FROM system_settings WHERE key IN ('invite_required','require_verified_email')");
        makeUser("af_admin", GOOD_PW, "af.admin@example.test", true, true);
    }

    @AfterEach
    void cleanUp() {
        for (Integer id : jdbc.queryForList("""
                SELECT j.post_id FROM users_posts_junctions j JOIN users u ON u.id = j.user_id
                 WHERE u.username LIKE 'af\\_%'""", Integer.class)) {
            jdbc.update("DELETE FROM users_posts_junctions WHERE post_id = ?", id);
            jdbc.update("DELETE FROM posts WHERE id = ?", id);
        }
        jdbc.update("DELETE FROM users WHERE username LIKE 'af\\_%'");
        jdbc.update("DELETE FROM system_settings WHERE key IN ('invite_required','require_verified_email')");
        if (savedDailyLimit != null) setting("max_daily_registrations", savedDailyLimit);
        LoginRateLimiter.clear();
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    /** A different non-loopback address each call, so no test trips another's limits. */
    private static String freshIp() {
        int n = NEXT_ADDRESS.getAndIncrement();
        return "10.77." + (n / 250) + "." + (n % 250 + 1);
    }

    private int makeUser(String name, String pw, String email, boolean verified, boolean admin) {
        return jdbc.queryForObject("""
                INSERT INTO users (username, password, email, email_verified, is_admin)
                VALUES (?, ?, ?, ?, ?) RETURNING id""", Integer.class,
                name, JdbcLoginRepository.hashPassword(pw), email, verified, admin);
    }

    private void setting(String key, String value) {
        if (jdbc.update("UPDATE system_settings SET value=? WHERE key=?", value, key) == 0)
            jdbc.update("INSERT INTO system_settings(key, value) VALUES(?, ?)", key, value);
    }

    private MvcResult post(String url, Object body, String ip, Cookie... cookies) throws Exception {
        MockHttpServletRequestBuilder b = MockMvcRequestBuilders.post(url).contentType("application/json")
                .content(JSON.writeValueAsString(body)).with(r -> { r.setRemoteAddr(ip); return r; });
        if (cookies.length > 0) b.cookie(cookies);
        return mvc.perform(b).andReturn();
    }

    private MvcResult put(String url, Object body, Cookie... cookies) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.put(url).contentType("application/json").content(JSON.writeValueAsString(body))
                .with(r -> { r.setRemoteAddr(freshIp()); return r; }).cookie(cookies)).andReturn();
    }

    private MvcResult signInAs(String name, String pw, String ip) throws Exception {
        return post("/api/loginSessionAttempt", Map.of("username", name, "password", pw), ip);
    }

    /** Signs in and returns the two session cookies. */
    private Cookie[] session(String name, String pw) throws Exception {
        MvcResult r = signInAs(name, pw, freshIp());
        assertThat(r.getResponse().getStatus()).as("sign-in of " + name).isEqualTo(200);
        return new Cookie[]{r.getResponse().getCookie("authToken"), r.getResponse().getCookie("username")};
    }

    private int authorizeStatus(Cookie[] c) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.post("/api/authorizeSession").cookie(c)).andReturn().getResponse().getStatus();
    }

    private MvcResult register(Map<String, String> body) throws Exception {
        return post("/api/register", body, freshIp());
    }

    private Map<String, String> signUp(String name, String pw, String code) {
        Map<String, String> m = new java.util.HashMap<>(Map.of("username", name, "password", pw,
                "email", name + "@example.test"));
        if (code != null) m.put("inviteCode", code);
        return m;
    }

    private String newInvite(Cookie[] admin) throws Exception {
        MvcResult r = mvc.perform(MockMvcRequestBuilders.post("/api/admin/invite-codes").cookie(admin)).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(201);
        return JSON.readTree(r.getResponse().getContentAsString()).get("code").asText();
    }

    private boolean codeUsed(String code) {
        return jdbc.queryForObject("SELECT used_by IS NOT NULL FROM invite_codes WHERE code=?", Boolean.class, code);
    }

    private static final Pattern TOKEN = Pattern.compile("token=([A-Za-z0-9_-]+)");

    /** The link token from the newest mail to this address whose subject has the given word. */
    private String mailToken(String to, String subjectWord) throws Exception {
        for (int i = 0; i < 100; i++) {
            for (int j = SENT.size() - 1; j >= 0; j--) {
                SimpleMailMessage m = SENT.get(j);
                if (m.getTo() != null && m.getTo()[0].equalsIgnoreCase(to) && m.getSubject().contains(subjectWord)) {
                    Matcher t = TOKEN.matcher(m.getText());
                    assertThat(t.find()).isTrue();
                    return t.group(1);
                }
            }
            Thread.sleep(50);   // the send is asynchronous
        }
        throw new AssertionError("no \"" + subjectWord + "\" mail reached " + to);
    }

    private String body(MvcResult r) throws Exception {
        return r.getResponse().getContentAsString();
    }

    // ── sign-up ───────────────────────────────────────────────────────────────

    @Test
    void anInviteBuildsAnAccountThatCanSignInWithABcryptCost12Hash() throws Exception {
        Cookie[] admin = session("af_admin", GOOD_PW);
        String code = newInvite(admin);

        assertThat(register(signUp("af_newbie", GOOD_PW, code)).getResponse().getStatus()).isEqualTo(201);
        assertThat(codeUsed(code)).isTrue();
        assertThat(jdbc.queryForObject("SELECT password FROM users WHERE username='af_newbie'", String.class))
                .startsWith("$2a$12$");

        Cookie[] c = session("af_newbie", GOOD_PW);
        assertThat(authorizeStatus(c)).isEqualTo(200);
        // The sign-up address got its confirmation link, and is not trusted until used.
        assertThat(mailToken("af_newbie@example.test", "Confirm")).isNotBlank();
        assertThat(jdbc.queryForObject("SELECT email_verified FROM users WHERE username='af_newbie'", Boolean.class))
                .isFalse();
    }

    @Test
    void badPasswordsAreRefusedWithAReasonAndTheCodeIsKept() throws Exception {
        Cookie[] admin = session("af_admin", GOOD_PW);
        String code = newInvite(admin);
        String tooManyBytes = "Aa1!" + "é".repeat(35);   // 39 characters, 74 bytes
        for (String[] c : new String[][]{
                {"Short1!a", "12 characters"}, {"alllowercase-1234!", "uppercase"},
                {"ALLUPPERCASE-1234!", "lowercase"}, {"No-digits-in-here!", "number"},
                {"NoSpecials12345Ab", "special"}, {tooManyBytes, "72 bytes"}}) {
            MvcResult r = register(signUp("af_weak", c[0], code));
            assertThat(r.getResponse().getStatus()).as(c[0]).isEqualTo(400);
            assertThat(body(r)).contains(c[1]);
        }
        assertThat(codeUsed(code)).isFalse();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE username='af_weak'", Integer.class)).isZero();
    }

    @Test
    void aNameThatDiffersOnlyInCapitalsOrIsReservedIsRefusedWithoutSpendingTheCode() throws Exception {
        Cookie[] admin = session("af_admin", GOOD_PW);
        assertThat(register(signUp("af_Alice", GOOD_PW, newInvite(admin))).getResponse().getStatus()).isEqualTo(201);

        String code = newInvite(admin);
        assertThat(register(signUp("AF_ALICE", GOOD_PW, code)).getResponse().getStatus()).isEqualTo(409);
        assertThat(register(signUp("settings", GOOD_PW, code)).getResponse().getStatus()).isEqualTo(400);
        assertThat(register(signUp("Admin", GOOD_PW, code)).getResponse().getStatus()).isEqualTo(400);
        assertThat(codeUsed(code)).isFalse();
    }

    @Test
    void missingUsedExpiredAndUnknownCodesAreAllRefused() throws Exception {
        Cookie[] admin = session("af_admin", GOOD_PW);
        assertThat(register(signUp("af_nocode", GOOD_PW, null)).getResponse().getStatus()).isEqualTo(400);
        assertThat(register(signUp("af_badcode", GOOD_PW, "not-a-code")).getResponse().getStatus()).isEqualTo(403);

        String used = newInvite(admin);
        assertThat(register(signUp("af_first", GOOD_PW, used)).getResponse().getStatus()).isEqualTo(201);
        assertThat(register(signUp("af_second", GOOD_PW, used)).getResponse().getStatus()).isEqualTo(410);

        String old = newInvite(admin);
        jdbc.update("UPDATE invite_codes SET expires_at = NOW() - INTERVAL '1 hour' WHERE code=?", old);
        assertThat(register(signUp("af_late", GOOD_PW, old)).getResponse().getStatus()).isEqualTo(410);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM users WHERE username IN ('af_nocode','af_badcode','af_second','af_late')",
                Integer.class)).isZero();
    }

    @Test
    void withTheInviteSwitchOffNoCodeIsNeededAndTheConfigSaysSo() throws Exception {
        Cookie[] admin = session("af_admin", GOOD_PW);
        assertThat(JSON.readTree(body(mvc.perform(get("/api/signup/config")).andReturn()))
                .get("inviteRequired").asBoolean()).isTrue();

        assertThat(put("/api/admin/settings/invite_required", Map.of("value", "false"), admin)
                .getResponse().getStatus()).isEqualTo(200);
        var cfg = JSON.readTree(body(mvc.perform(get("/api/signup/config")).andReturn()));
        assertThat(cfg.get("inviteRequired").asBoolean()).isFalse();
        assertThat(cfg.get("mailEnabled").asBoolean()).isTrue();
        assertThat(register(signUp("af_open", GOOD_PW, null)).getResponse().getStatus()).isEqualTo(201);

        // The setting is validated.
        assertThat(put("/api/admin/settings/invite_required", Map.of("value", "maybe"), admin)
                .getResponse().getStatus()).isEqualTo(400);
        assertThat(put("/api/admin/settings/max_daily_registrations", Map.of("value", "-5"), admin)
                .getResponse().getStatus()).isEqualTo(400);
    }

    @Test
    void theDailyCapAndTheNetworkLimitClosePublicSignUp() throws Exception {
        Cookie[] admin = session("af_admin", GOOD_PW);
        put("/api/admin/settings/invite_required", Map.of("value", "false"), admin);

        put("/api/admin/settings/max_daily_registrations", Map.of("value", "0"), admin);
        assertThat(register(signUp("af_closed", GOOD_PW, null)).getResponse().getStatus()).isEqualTo(503);
        put("/api/admin/settings/max_daily_registrations", Map.of("value", "-1"), admin);

        // One network: the second account within the hour is turned away.
        String ip = freshIp();
        assertThat(post("/api/register", signUp("af_net1", GOOD_PW, null), ip).getResponse().getStatus()).isEqualTo(201);
        assertThat(post("/api/register", signUp("af_net2", GOOD_PW, null), ip).getResponse().getStatus()).isEqualTo(429);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE username IN ('af_closed','af_net2')",
                Integer.class)).isZero();
    }

    @Test
    void anAbsentDailyLimitRowMeansFiveNotUnlimited() throws Exception {
        Cookie[] admin = session("af_admin", GOOD_PW);
        put("/api/admin/settings/invite_required", Map.of("value", "false"), admin);
        jdbc.update("DELETE FROM system_settings WHERE key='max_daily_registrations'");
        // Plenty of accounts exist today (the admin and any test rows), so 5 is already reached.
        jdbc.update("INSERT INTO users (username, password) SELECT 'af_fill' || g, 'x' FROM generate_series(1, 6) g");
        assertThat(register(signUp("af_over", GOOD_PW, null)).getResponse().getStatus()).isEqualTo(503);
    }

    // ── sign-in ───────────────────────────────────────────────────────────────

    @Test
    void wrongPasswordsAreCountedAndLockOnlyThatAccountAtThatAddress() throws Exception {
        makeUser("af_target", GOOD_PW, null, false, false);
        String attacker = freshIp();
        MvcResult first = signInAs("af_target", "wrong-password-1A!", attacker);
        assertThat(first.getResponse().getStatus()).isEqualTo(403);
        // An unknown name gets the identical answer.
        MvcResult unknown = signInAs("af_nobody", "wrong-password-1A!", attacker);
        assertThat(body(unknown)).isEqualTo(body(first));

        for (int i = 0; i < 14; i++) signInAs("af_target", "wrong-password-1A!", attacker);
        // Locked, even with the right password.
        assertThat(signInAs("af_target", GOOD_PW, attacker).getResponse().getStatus()).isEqualTo(429);
        // The owner, elsewhere, is not locked out by a stranger.
        assertThat(signInAs("af_target", GOOD_PW, freshIp()).getResponse().getStatus()).isEqualTo(200);
        // And a failure is in the owner's security log (at most one a minute, so it cannot be flooded).
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM security_events e JOIN users u ON u.id = e.user_id
                 WHERE u.username = 'af_target' AND e.kind = 'sign_in_failed'""", Integer.class)).isEqualTo(1);
    }

    @Test
    void aSignInWithMissingFieldsIsABadRequestNotAServerError() throws Exception {
        for (String json : new String[]{"{}", "{\"username\":\"af_x\"}", "{\"password\":\"x\"}",
                "{\"username\":\"\",\"password\":\"\"}"}) {
            int status = mvc.perform(MockMvcRequestBuilders.post("/api/loginSessionAttempt").contentType("application/json").content(json)
                    .with(r -> { r.setRemoteAddr(freshIp()); return r; })).andReturn().getResponse().getStatus();
            assertThat(status).as(json).isEqualTo(400);
        }
    }

    @Test
    void sessionCookiesAreHttpOnlyLaxAndSecureOutsideDevMode() throws Exception {
        makeUser("af_cookie", GOOD_PW, null, false, false);
        List<String> dev = signInAs("af_cookie", GOOD_PW, freshIp()).getResponse().getHeaders("Set-Cookie");
        assertThat(dev).hasSize(2).allSatisfy(c -> assertThat(c).contains("HttpOnly").contains("SameSite=Lax")
                .doesNotContain("Secure"));

        ReflectionTestUtils.setField(authController, "devMode", false);
        try {
            List<String> prod = signInAs("af_cookie", GOOD_PW, freshIp()).getResponse().getHeaders("Set-Cookie");
            assertThat(prod).hasSize(2).allSatisfy(c -> assertThat(c).contains("HttpOnly").contains("SameSite=Lax")
                    .contains("Secure").contains("Path=/"));
        } finally {
            ReflectionTestUtils.setField(authController, "devMode", true);
        }
    }

    @Test
    void signingOutEndsThatSessionOnly() throws Exception {
        makeUser("af_out", GOOD_PW, null, false, false);
        Cookie[] a = session("af_out", GOOD_PW), b = session("af_out", GOOD_PW);
        assertThat(mvc.perform(MockMvcRequestBuilders.post("/api/logoutSessionAttempt").cookie(a)).andReturn().getResponse().getStatus())
                .isEqualTo(200);
        assertThat(authorizeStatus(a)).isEqualTo(401);
        assertThat(authorizeStatus(b)).isEqualTo(200);
    }

    // ── changing the password ─────────────────────────────────────────────────

    @Test
    void changingThePasswordNeedsTheOldOneEndsEverySessionAndRetiresTheOldPassword(CapturedOutput out) throws Exception {
        makeUser("af_change", GOOD_PW, null, false, false);
        Cookie[] here = session("af_change", GOOD_PW), elsewhere = session("af_change", GOOD_PW);

        assertThat(put("/api/users/af_change/password", Map.of("currentPassword", "nope-nope-1A!x",
                "newPassword", OTHER_PW), here).getResponse().getStatus()).isEqualTo(403);
        assertThat(authorizeStatus(here)).isEqualTo(200);
        assertThat(put("/api/users/af_change/password", Map.of("currentPassword", GOOD_PW,
                "newPassword", "weak"), here).getResponse().getStatus()).isEqualTo(400);

        assertThat(put("/api/users/af_change/password", Map.of("currentPassword", GOOD_PW,
                "newPassword", OTHER_PW), here).getResponse().getStatus()).isEqualTo(200);
        assertThat(authorizeStatus(here)).isEqualTo(401);
        assertThat(authorizeStatus(elsewhere)).isEqualTo(401);
        assertThat(signInAs("af_change", GOOD_PW, freshIp()).getResponse().getStatus()).isEqualTo(403);
        assertThat(signInAs("af_change", OTHER_PW, freshIp()).getResponse().getStatus()).isEqualTo(200);
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM security_events e JOIN users u ON u.id = e.user_id
                 WHERE u.username = 'af_change' AND e.kind = 'password_changed'""", Integer.class)).isEqualTo(1);

        // No password, new or old, reaches the server log.
        assertThat(out.getAll()).doesNotContain(GOOD_PW).doesNotContain(OTHER_PW).doesNotContain("$2a$");
    }

    // ── forgot and reset ──────────────────────────────────────────────────────

    @Test
    void aResetLinkWorksOnceSetsANewPasswordEndsSessionsAndIgnoresCapitalsInTheAddress() throws Exception {
        makeUser("af_reset", GOOD_PW, "af.reset@example.test", true, false);
        Cookie[] old = session("af_reset", GOOD_PW);

        MvcResult asked = post("/api/password/forgot", Map.of("email", "AF.Reset@Example.TEST"), freshIp());
        assertThat(asked.getResponse().getStatus()).isEqualTo(200);
        String token = mailToken("af.reset@example.test", "Reset");

        // A rejected password leaves the link usable.
        assertThat(post("/api/password/reset", Map.of("token", token, "password", "weak"), freshIp())
                .getResponse().getStatus()).isEqualTo(400);
        assertThat(post("/api/password/reset", Map.of("token", token, "password", OTHER_PW), freshIp())
                .getResponse().getStatus()).isEqualTo(200);

        MvcResult again = post("/api/password/reset", Map.of("token", token, "password", "Third-secret-88#x"), freshIp());
        assertThat(again.getResponse().getStatus()).isEqualTo(400);
        assertThat(body(again)).contains("already used");

        assertThat(authorizeStatus(old)).isEqualTo(401);
        assertThat(signInAs("af_reset", GOOD_PW, freshIp()).getResponse().getStatus()).isEqualTo(403);
        assertThat(signInAs("af_reset", OTHER_PW, freshIp()).getResponse().getStatus()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT password FROM users WHERE username='af_reset'", String.class))
                .startsWith("$2a$12$");
    }

    @Test
    void anExpiredResetLinkIsRefused() throws Exception {
        int id = makeUser("af_expire", GOOD_PW, "af.expire@example.test", true, false);
        String token = tokens.issue(id, "af.expire@example.test", EmailTokenService.PURPOSE_RESET).plaintext();
        jdbc.update("UPDATE email_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE user_id = ?", id);
        MvcResult r = post("/api/password/reset", Map.of("token", token, "password", OTHER_PW), freshIp());
        assertThat(r.getResponse().getStatus()).isEqualTo(400);
        assertThat(body(r)).contains("expired");
        assertThat(signInAs("af_expire", GOOD_PW, freshIp()).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void forgotAnswersTheSameForKnownUnknownAndUnconfirmedAddressesAndMailsOnlyTheConfirmedOne() throws Exception {
        int unconfirmed = makeUser("af_unconf", GOOD_PW, "af.unconf@example.test", false, false);
        makeUser("af_conf", GOOD_PW, "af.conf@example.test", true, false);

        MvcResult known = post("/api/password/forgot", Map.of("email", "af.conf@example.test"), freshIp());
        MvcResult none = post("/api/password/forgot", Map.of("email", "af.nobody@example.test"), freshIp());
        MvcResult unc = post("/api/password/forgot", Map.of("email", "af.unconf@example.test"), freshIp());
        assertThat(none.getResponse().getStatus()).isEqualTo(known.getResponse().getStatus());
        assertThat(body(none)).isEqualTo(body(known));
        assertThat(body(unc)).isEqualTo(body(known));

        assertThat(mailToken("af.conf@example.test", "Reset")).isNotBlank();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM email_tokens WHERE user_id = ?", Integer.class,
                unconfirmed)).isZero();
        assertThat(SENT).noneMatch(m -> m.getTo()[0].contains("nobody") || m.getTo()[0].contains("unconf"));
    }

    @Test
    void changingTheConfirmedAddressCancelsAnOpenResetLink() throws Exception {
        int id = makeUser("af_move", GOOD_PW, "af.move@example.test", true, false);
        String reset = tokens.issue(id, "af.move@example.test", EmailTokenService.PURPOSE_RESET).plaintext();
        String verify = tokens.issue(id, "af.new@example.test", EmailTokenService.PURPOSE_VERIFY).plaintext();
        assertThat(post("/api/email/verify", Map.of("token", verify), freshIp()).getResponse().getStatus()).isEqualTo(200);
        assertThat(post("/api/password/reset", Map.of("token", reset, "password", OTHER_PW), freshIp())
                .getResponse().getStatus()).isEqualTo(400);
        assertThat(signInAs("af_move", GOOD_PW, freshIp()).getResponse().getStatus()).isEqualTo(200);
    }

    // ── the verified-email rule ───────────────────────────────────────────────

    private byte[] tinyPng() throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB), "png", o);
        return o.toByteArray();
    }

    private int[] gatedStatuses(Cookie[] c, int postId) throws Exception {
        String lexical = "{\"root\":{\"children\":[{\"type\":\"paragraph\",\"children\":[{\"type\":\"text\",\"text\":\"hi\"}]}]}}";
        return new int[]{
                post("/api/posts", Map.of("title", "Gate test", "description", lexical, "published", true), freshIp(), c)
                        .getResponse().getStatus(),
                post("/api/posts/" + postId + "/comments", Map.of("content", "hello"), freshIp(), c).getResponse().getStatus(),
                post("/api/users/af_owner/follow", Map.of(), freshIp(), c).getResponse().getStatus(),
                post("/api/users/af_owner/message", Map.of("message", "hi"), freshIp(), c).getResponse().getStatus(),
                mvc.perform(multipart("/api/upload").file(new MockMultipartFile("file", "a.png", "image/png", tinyPng()))
                        .cookie(c).with(r -> { r.setRemoteAddr(freshIp()); return r; })).andReturn().getResponse().getStatus(),
        };
    }

    @Test
    void anUnconfirmedAccountCannotPostCommentFollowMessageOrUploadUntilItConfirms() throws Exception {
        Cookie[] admin = session("af_admin", GOOD_PW);
        int owner = makeUser("af_owner", GOOD_PW, null, false, false);
        int postId = jdbc.queryForObject("INSERT INTO posts (title, description, published, slug) VALUES "
                + "('Owner post', '{}', true, 'af-owner-post') RETURNING id", Integer.class);
        jdbc.update("INSERT INTO users_posts_junctions (post_id, user_id) VALUES (?, ?)", postId, owner);
        jdbc.update("INSERT INTO discussions (post_id) VALUES (?)", postId);

        // The newcomer signs up on their own, with the rule off: everything works.
        makeUser("af_free", GOOD_PW, "af.free@example.test", false, false);
        for (int s : gatedStatuses(session("af_free", GOOD_PW), postId)) assertThat(s).isIn(200, 201);

        assertThat(put("/api/admin/settings/require_verified_email", Map.of("value", "true"), admin)
                .getResponse().getStatus()).isEqualTo(200);
        makeUser("af_pending", GOOD_PW, "af.pending@example.test", false, false);
        Cookie[] c = session("af_pending", GOOD_PW);
        for (int s : gatedStatuses(c, postId)) assertThat(s).isEqualTo(403);
        MvcResult refused = post("/api/users/af_owner/follow", Map.of(), freshIp(), c);
        assertThat(body(refused)).isEqualTo(PostingGate.MESSAGE);
        // Reading still works.
        assertThat(mvc.perform(get("/api/user/af_owner")).andReturn().getResponse().getStatus()).isEqualTo(200);

        // Admins are exempt even though their address was never confirmed here.
        jdbc.update("UPDATE users SET email_verified = FALSE WHERE username='af_admin'");
        assertThat(post("/api/users/af_owner/follow", Map.of(), freshIp(), admin).getResponse().getStatus()).isEqualTo(200);

        // Confirm through the mailed link, as a person would.
        assertThat(put("/api/users/af_pending/settings/email", Map.of("email", "af.pending@example.test"), c)
                .getResponse().getStatus()).isEqualTo(200);
        String link = mailToken("af.pending@example.test", "Confirm");
        assertThat(post("/api/email/verify", Map.of("token", link), freshIp()).getResponse().getStatus()).isEqualTo(200);
        for (int s : gatedStatuses(c, postId)) assertThat(s).isIn(200, 201);
    }

    // ── what the API shows ────────────────────────────────────────────────────

    @Test
    void noHashOrPasswordIsEverShownByTheApi() throws Exception {
        Cookie[] admin = session("af_admin", GOOD_PW);
        makeUser("af_shown", GOOD_PW, "af.shown@example.test", true, false);
        Cookie[] c = session("af_shown", GOOD_PW);
        for (String url : new String[]{"/api/admin/users", "/api/admin/users/af_shown/export", "/api/admin/settings",
                "/api/users/af_shown/export", "/api/users/af_shown/settings", "/api/account/security-events",
                "/api/admin/invite-codes"}) {
            String all = body(mvc.perform(get(url).cookie(url.startsWith("/api/admin") ? admin : c)).andReturn());
            assertThat(all).as(url).doesNotContain("$2a$").doesNotContain("\"password\"").doesNotContain(GOOD_PW);
        }
    }

    // ── deleting the account ──────────────────────────────────────────────────

    @Test
    void deletingTheAccountTakesTheirThingsAndTheirSessionsWithIt() throws Exception {
        int owner = makeUser("af_owner", GOOD_PW, null, false, false);
        int leaver = makeUser("af_leaver", GOOD_PW, "af.leaver@example.test", true, false);
        Cookie[] c = session("af_leaver", GOOD_PW), other = session("af_leaver", GOOD_PW);

        int mine = jdbc.queryForObject("INSERT INTO posts (title, description, published, slug) VALUES "
                + "('Leaver post', '{}', true, 'af-leaver-post') RETURNING id", Integer.class);
        jdbc.update("INSERT INTO users_posts_junctions (post_id, user_id) VALUES (?, ?)", mine, leaver);
        int theirs = jdbc.queryForObject("INSERT INTO posts (title, description, published, slug) VALUES "
                + "('Owner post', '{}', true, 'af-owner-post') RETURNING id", Integer.class);
        jdbc.update("INSERT INTO users_posts_junctions (post_id, user_id) VALUES (?, ?)", theirs, owner);
        jdbc.update("INSERT INTO discussions (post_id) VALUES (?)", theirs);
        assertThat(post("/api/posts/" + theirs + "/comments", Map.of("content", "bye"), freshIp(), c)
                .getResponse().getStatus()).isIn(200, 201);
        assertThat(post("/api/users/af_owner/follow", Map.of(), freshIp(), c).getResponse().getStatus()).isEqualTo(200);
        assertThat(post("/api/users/af_owner/message", Map.of("message", "hi"), freshIp(), c)
                .getResponse().getStatus()).isEqualTo(200);
        tokens.issue(leaver, "af.leaver@example.test", EmailTokenService.PURPOSE_RESET);

        MvcResult wrong = post("/api/account/delete", Map.of("password", "nope-nope-1A!x"), freshIp(), c);
        assertThat(wrong.getResponse().getStatus()).isEqualTo(403);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE id = ?", Integer.class, leaver)).isEqualTo(1);

        MvcResult done = post("/api/account/delete", Map.of("password", GOOD_PW), freshIp(), c);
        assertThat(done.getResponse().getStatus()).isEqualTo(200);
        assertThat(done.getResponse().getHeaders("Set-Cookie")).anyMatch(h -> h.contains("Max-Age=0"));

        for (String sql : new String[]{
                "SELECT COUNT(*) FROM users WHERE id = ?",
                "SELECT COUNT(*) FROM security_events WHERE user_id = ?",
                "SELECT COUNT(*) FROM email_tokens WHERE user_id = ?",
                "SELECT COUNT(*) FROM comments WHERE user_id = ?",
                "SELECT COUNT(*) FROM follows WHERE follower_id = ?",
                "SELECT COUNT(*) FROM users_posts_junctions WHERE user_id = ?"}) {
            assertThat(jdbc.queryForObject(sql, Integer.class, leaver)).as(sql).isZero();
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM posts WHERE id = ?", Integer.class, mine)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM posts WHERE id = ?", Integer.class, theirs)).isEqualTo(1);
        assertThat(authorizeStatus(c)).isEqualTo(401);
        assertThat(authorizeStatus(other)).isEqualTo(401);
        assertThat(JdbcLoginRepository.sessionCountFor("af_leaver")).isZero();
        assertThat(signInAs("af_leaver", GOOD_PW, freshIp()).getResponse().getStatus()).isEqualTo(403);
    }
}
