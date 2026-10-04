package com.springbootprojects.webpostingserver.posts.controller;

import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.service.SecurityLog;
import com.springbootprojects.webpostingserver.posts.service.SsoAccounts;
import com.springbootprojects.webpostingserver.posts.service.SsoFlowStore;
import com.springbootprojects.webpostingserver.posts.service.SsoProviderClient;
import com.springbootprojects.webpostingserver.posts.service.SsoProviders;
import com.springbootprojects.webpostingserver.posts.validator.LoginRateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Sign in with Google or Microsoft: OpenID Connect, authorization code with
 * PKCE, state and nonce, run on the server (guide/SSO-PLAN.md).
 *
 * What this relies on, and must keep true:
 * <ol>
 *   <li>A provider that is not configured does not exist here: 404.</li>
 *   <li>A callback is honoured only with a {@code state} this server issued in
 *       the last ten minutes, not yet used, to the browser now presenting it
 *       (the {@code sso_state} cookie). Otherwise nothing happens.</li>
 *   <li>Nobody is signed in or linked on the strength of an email address;
 *       only (provider, subject) from a verified ID token counts.</li>
 *   <li>Sessions are made by the login repository, so the session cap, the
 *       frozen role and the cookies are the same as for a password sign-in.</li>
 *   <li>Linking, unlinking and setting a first password ask the member to
 *       prove themselves again: the password when there is one, otherwise a
 *       provider sign-in in the last five minutes.</li>
 * </ol>
 * The two GETs are opened by the browser itself, so they answer with a
 * redirect to a page of the app and a short reason in {@code ?sso=}; they never
 * show an error page or say whether an address has an account beyond the one
 * case the plan asks for ("exists").
 */
@RestController
@RequestMapping("/api/auth/sso")
public class SsoController {

    private static final Logger log = LoggerFactory.getLogger(SsoController.class);

    static final String STATE_COOKIE = "sso_state";
    static final String PENDING_COOKIE = "sso_pending";
    private static final String COOKIE_PATH = "/api/auth/sso";
    /** Starts plus callbacks one network may make in fifteen minutes. */
    private static final int MAX_ROUND_TRIPS_PER_NETWORK = 60;
    private static final Pattern TOKEN = Pattern.compile("^[A-Za-z0-9_-]{43}$");
    private static final Set<String> KNOWN = Set.of(SsoProviders.GOOGLE, SsoProviders.MICROSOFT, SsoProviders.APPLE);

    private static final String RAN_OUT = "That sign-in ran out. Start again.";

    @Value("${app.dev-mode:false}")
    private boolean devMode;

    @Value("${app.base-url:http://localhost:5173}")
    private String baseUrl;

    @Autowired private LoginRepository loginRepository;
    @Autowired private SecurityLog securityLog;
    @Autowired private SsoProviders providers;
    @Autowired private SsoProviderClient client;
    @Autowired private SsoFlowStore flows;
    @Autowired private SsoAccounts accounts;

    // ── leaving for the provider ──────────────────────────────────────────────

    /**
     * Sends the browser to the provider. {@code intent=reauth} (from Settings,
     * signed in) comes back to Settings with a fresh session for the same
     * member; anything else is a plain sign-in.
     */
    @GetMapping("/{provider}/start")
    public ResponseEntity<?> start(
            @PathVariable("provider") String provider,
            @RequestParam(name = "intent", required = false) String intent,
            @CookieValue(name = STATE_COOKIE, required = false) String browserKey,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token,
            HttpServletRequest request) {
        SsoProviders.Provider p = providers.find(provider).orElse(null);
        if (p == null) return notFound();
        if (tooMany(request)) return redirect(loginPage("busy"));

        AuthSession session = SsoFlowStore.INTENT_REAUTH.equals(intent) ? sessionOf(username, token) : null;
        Departure d = depart(p, session == null ? SsoFlowStore.INTENT_SIGN_IN : SsoFlowStore.INTENT_REAUTH,
                session == null ? 0 : session.userId, browserKey);
        if (d == null) return redirect(loginPage("busy"));
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(d.url()))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.SET_COOKIE, d.cookie())
                .build();
    }

    private record Departure(String url, String cookie) { }

    /** Records the flow and builds the provider address; null when no more flows can be held. */
    private Departure depart(SsoProviders.Provider p, String intent, int userId, String presentedKey) {
        // One key per browser, reused while it lasts, so a second tab does not undo the first.
        String browserKey = presentedKey != null && TOKEN.matcher(presentedKey).matches()
                ? presentedKey : SsoFlowStore.randomToken();
        String nonce = SsoFlowStore.randomToken();
        String verifier = SsoFlowStore.randomToken();
        String state = flows.begin(p.id(), intent, nonce, verifier, browserKey, userId);
        if (state == null) return null;

        UriComponentsBuilder url = UriComponentsBuilder.fromUriString(p.authorizeUrl())
                .queryParam("response_type", "code")
                .queryParam("client_id", p.clientId())
                .queryParam("redirect_uri", providers.redirectUri(p))
                .queryParam("scope", p.scope())
                .queryParam("state", state)
                .queryParam("nonce", nonce)
                .queryParam("code_challenge", challengeOf(verifier))
                .queryParam("code_challenge_method", "S256");
        // Linking: let the person pick which of their provider accounts. Proving
        // themselves again: ask the provider for a real sign-in where it can.
        if (SsoFlowStore.INTENT_LINK.equals(intent)) url.queryParam("prompt", "select_account");
        if (SsoFlowStore.INTENT_REAUTH.equals(intent))
            url.queryParam("prompt", SsoProviders.MICROSOFT.equals(p.id()) ? "login" : "select_account");

        String cookie = ResponseCookie.from(STATE_COOKIE, browserKey)
                .httpOnly(true).sameSite("Lax").secure(!devMode).path(COOKIE_PATH)
                .maxAge(SsoFlowStore.FLOW_TTL).build().toString();
        return new Departure(url.encode().build().toUriString(), cookie);
    }

    /** PKCE S256: the provider gets the hash now and the verifier only with the code. */
    static String challengeOf(String verifier) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    // ── coming back ───────────────────────────────────────────────────────────

    @GetMapping("/{provider}/callback")
    public ResponseEntity<?> callback(
            @PathVariable("provider") String provider,
            @RequestParam(name = "code", required = false) String code,
            @RequestParam(name = "state", required = false) String state,
            @RequestParam(name = "error", required = false) String error,
            @CookieValue(name = STATE_COOKIE, required = false) String browserKey,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token,
            HttpServletRequest request) {
        SsoProviders.Provider p = providers.find(provider).orElse(null);
        if (p == null) return notFound();
        if (tooMany(request)) return redirect(loginPage("busy"));

        SsoFlowStore.Flow flow = flows.consume(state, p.id(), browserKey);
        if (flow == null) {
            log.info("A {} sign-in came back with a state that is unknown, used, expired or from another browser", p.id());
            return redirect(loginPage("failed"));
        }
        boolean fromSettings = !SsoFlowStore.INTENT_SIGN_IN.equals(flow.intent());
        if (error != null || code == null) {
            String why = "access_denied".equals(error) ? "cancelled" : "failed";
            return redirect(fromSettings ? settingsPage(why) : loginPage(why));
        }

        SsoProviderClient.Identity who;
        try {
            String idToken = client.exchange(p, code, flow.verifier(), providers.redirectUri(p));
            who = client.verify(p, idToken, flow.nonce(), flows.now());
        } catch (SsoProviderClient.Rejected e) {
            log.warn("A {} sign-in was refused: {}", p.id(), e.getMessage());
            return redirect(fromSettings ? settingsPage("failed") : loginPage("failed"));
        }

        AuthSession current = fromSettings ? sessionOf(username, token) : null;
        if (SsoFlowStore.INTENT_LINK.equals(flow.intent())) return finishLink(p, flow, who, current, request);
        if (SsoFlowStore.INTENT_REAUTH.equals(flow.intent())) return finishReauth(p, flow, who, current, request);
        return finishSignIn(p, who, request);
    }

    private ResponseEntity<?> finishSignIn(SsoProviders.Provider p, SsoProviderClient.Identity who, HttpServletRequest request) {
        Integer userId = accounts.userIdFor(p.id(), who.subject());
        if (userId != null) {
            AuthSession s = loginRepository.createSession(userId);
            if (s.loginHttpStatusCodeResult != HttpStatus.OK) return redirect(loginPage("refused"));
            signedIn(p, who, s, request);
            return withSession(ResponseEntity.status(HttpStatus.FOUND).location(URI.create(loginPage("ok"))), s).build();
        }

        // Nobody here has this provider account. An address is never a match:
        // if a member has confirmed the same one, they link from Settings.
        if (who.emailVerified() && accounts.verifiedEmailInUse(who.email())) return redirect(loginPage("exists"));

        String ticket = flows.hold(p.id(), who.subject(), who.email(), who.emailVerified());
        if (ticket == null) return redirect(loginPage("busy"));
        String cookie = ResponseCookie.from(PENDING_COOKIE, ticket)
                .httpOnly(true).sameSite("Lax").secure(!devMode).path(COOKIE_PATH)
                .maxAge(SsoFlowStore.FLOW_TTL).build().toString();
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(base() + "/routes/ChooseUsername"))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.SET_COOKIE, cookie)
                .build();
    }

    private ResponseEntity<?> finishLink(SsoProviders.Provider p, SsoFlowStore.Flow flow, SsoProviderClient.Identity who,
                                         AuthSession current, HttpServletRequest request) {
        // Still the member who asked, in this browser.
        if (current == null) return redirect(loginPage("failed"));
        if (current.userId != flow.userId()) return redirect(settingsPage("other"));
        SsoAccounts.Linked result = accounts.link(current.userId, p.id(), who.subject(), who.email(), who.emailVerified());
        switch (result) {
            case LINKED:
                accounts.logIdentityEvent(current.userId, "identity_linked", p.id(), request);
                log.info("{} linked a {} account", current.username, p.id());
                return redirect(settingsPage("linked"));
            case ALREADY_YOURS:
                return redirect(settingsPage("linked"));
            case HAVE_ONE:
                return redirect(settingsPage("have_one"));
            default:
                return redirect(settingsPage("taken"));
        }
    }

    private ResponseEntity<?> finishReauth(SsoProviders.Provider p, SsoFlowStore.Flow flow, SsoProviderClient.Identity who,
                                           AuthSession current, HttpServletRequest request) {
        if (current == null) return redirect(loginPage("failed"));
        Integer owner = accounts.userIdFor(p.id(), who.subject());
        // Proving yourself again must not turn into signing in as someone else.
        if (current.userId != flow.userId() || owner == null || owner != current.userId)
            return redirect(settingsPage("other"));
        AuthSession s = loginRepository.createSession(owner);
        if (s.loginHttpStatusCodeResult != HttpStatus.OK) return redirect(loginPage("refused"));
        loginRepository.logout(current.username, current.token);   // replaced, not added to
        signedIn(p, who, s, request);
        return withSession(ResponseEntity.status(HttpStatus.FOUND).location(URI.create(settingsPage("reauth"))), s).build();
    }

    private void signedIn(SsoProviders.Provider p, SsoProviderClient.Identity who, AuthSession s, HttpServletRequest request) {
        accounts.markUsed(p.id(), who.subject(), who.email(), who.emailVerified());
        flows.markFresh(s.token);
        securityLog.record(s.userId, "sign_in", p.name(), request);
    }

    // ── first sign-in: choosing a username ────────────────────────────────────

    /** What the choose-a-username page shows: which provider account is waiting, and whether a code is needed. */
    @GetMapping("/pending")
    public ResponseEntity<Map<String, Object>> pending(
            @CookieValue(name = PENDING_COOKIE, required = false) String ticket) {
        SsoFlowStore.Pending p = flows.pending(ticket);
        if (p == null || !providers.isEnabled(p.provider())) return message(HttpStatus.NOT_FOUND, RAN_OUT);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("provider", p.provider());
        body.put("providerName", SsoProviders.displayName(p.provider()));
        body.put("email", p.email());
        body.put("inviteRequired", accounts.inviteRequired());
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(body);
    }

    /** Makes the account under the chosen username and signs it in. */
    @PostMapping("/complete")
    public ResponseEntity<Map<String, Object>> complete(
            @RequestBody(required = false) Map<String, String> body,
            @CookieValue(name = PENDING_COOKIE, required = false) String ticket,
            HttpServletRequest request) {
        SsoFlowStore.Pending p = flows.pending(ticket);
        if (p == null || !providers.isEnabled(p.provider())) return message(HttpStatus.GONE, RAN_OUT);
        p.attempts().incrementAndGet();
        // Taken out while the account is made, so a second tab cannot make another from the same sign-in.
        if (!flows.claim(ticket, p))
            return message(HttpStatus.CONFLICT, "This sign-in is being finished in another tab.");

        SsoAccounts.Signup made;
        try {
            made = accounts.signUp(body == null ? null : body.get("username"), body == null ? null : body.get("inviteCode"),
                    p, AuthController.rateKey(request.getRemoteAddr()), isLoopback(request.getRemoteAddr()));
        } catch (RuntimeException e) {
            flows.restore(ticket, p);
            throw e;
        }
        if (!made.created()) {
            flows.restore(ticket, p);   // a name that is taken, a wrong code: let them try again
            return message(made.status(), made.message());
        }
        log.info("Account {} created through {}", made.username(), p.provider());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("username", made.username());
        ResponseEntity.BodyBuilder response = ResponseEntity.status(HttpStatus.CREATED)
                .header(HttpHeaders.SET_COOKIE, ResponseCookie.from(PENDING_COOKIE, "")
                        .httpOnly(true).sameSite("Lax").secure(!devMode).path(COOKIE_PATH).maxAge(0).build().toString());
        AuthSession s = loginRepository.createSession(made.userId());
        boolean signedIn = s.loginHttpStatusCodeResult == HttpStatus.OK;
        out.put("signedIn", signedIn);
        if (signedIn) {
            flows.markFresh(s.token);
            securityLog.record(s.userId, "sign_in", SsoProviders.displayName(p.provider()), request);
            withSession(response, s);
        }
        return response.body(out);
    }

    // ── Settings: sign-in methods ─────────────────────────────────────────────

    /** The member's ways to sign in: whether there is a password, and each provider that is on or linked. */
    @GetMapping("/methods")
    public ResponseEntity<Map<String, Object>> methods(
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token) {
        AuthSession session = sessionOf(username, token);
        if (session == null) return signInFirst();

        List<String> on = enabledIds();
        Map<String, Map<String, Object>> linked = new LinkedHashMap<>();
        for (Map<String, Object> row : accounts.identities(session.userId)) linked.put((String) row.get("provider"), row);
        List<String> shown = new ArrayList<>(on);
        for (String id : linked.keySet()) if (!shown.contains(id)) shown.add(id);

        List<Map<String, Object>> list = new ArrayList<>();
        for (String id : shown) {
            Map<String, Object> row = linked.get(id);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("provider", id);
            m.put("name", SsoProviders.displayName(id));
            m.put("enabled", on.contains(id));
            m.put("linked", row != null);
            if (row != null) {
                m.put("email", row.get("email"));
                m.put("linkedAt", row.get("created_at") == null ? null : row.get("created_at").toString());
                m.put("canUnlink", accounts.canUnlink(session.userId, id, on));
            }
            list.add(m);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("hasPassword", accounts.hasPassword(session.userId));
        body.put("fresh", flows.isFresh(token));
        body.put("methods", list);
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(body);
    }

    /**
     * Starts linking a provider to the signed-in member. A POST, because it
     * asks for the password; the answer is the provider address for the page
     * to go to.
     */
    @PostMapping("/{provider}/link")
    public ResponseEntity<Map<String, Object>> link(
            @PathVariable("provider") String provider,
            @RequestBody(required = false) Map<String, String> body,
            @CookieValue(name = STATE_COOKIE, required = false) String browserKey,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token,
            HttpServletRequest request) {
        SsoProviders.Provider p = providers.find(provider).orElse(null);
        if (p == null) return message(HttpStatus.NOT_FOUND, "Not found.");
        AuthSession session = sessionOf(username, token);
        if (session == null) return signInFirst();
        ResponseEntity<Map<String, Object>> refusal = proveAgain(session, token, body, request);
        if (refusal != null) return refusal;
        for (Map<String, Object> row : accounts.identities(session.userId))
            if (p.id().equals(row.get("provider")))
                return message(HttpStatus.CONFLICT, "A " + p.name() + " account is already linked. Unlink it first.");

        Departure d = depart(p, SsoFlowStore.INTENT_LINK, session.userId, browserKey);
        if (d == null) return message(HttpStatus.SERVICE_UNAVAILABLE, "Too many sign-ins are in progress. Try again in a minute.");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("redirect", d.url());
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.SET_COOKIE, d.cookie())
                .body(out);
    }

    /** Unlinks a provider, unless it is the member's last way to sign in. Works for a provider that has been switched off. */
    @PostMapping("/{provider}/unlink")
    public ResponseEntity<Map<String, Object>> unlink(
            @PathVariable("provider") String provider,
            @RequestBody(required = false) Map<String, String> body,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token,
            HttpServletRequest request) {
        if (!KNOWN.contains(provider)) return message(HttpStatus.NOT_FOUND, "Not found.");
        AuthSession session = sessionOf(username, token);
        if (session == null) return signInFirst();
        ResponseEntity<Map<String, Object>> refusal = proveAgain(session, token, body, request);
        if (refusal != null) return refusal;

        String name = SsoProviders.displayName(provider);
        switch (accounts.unlink(session.userId, provider, enabledIds())) {
            case DONE:
                accounts.logIdentityEvent(session.userId, "identity_unlinked", provider, request);
                log.info("{} unlinked a {} account", session.username, provider);
                return message(HttpStatus.OK, name + " unlinked.");
            case LAST_METHOD:
                return message(HttpStatus.CONFLICT,
                        name + " is the only way you can sign in. Set a password first, then unlink it.");
            default:
                return message(HttpStatus.NOT_FOUND, name + " is not linked to your account.");
        }
    }

    /**
     * Sets the first password of an account made through a provider. Needs a
     * provider sign-in within the last five minutes (there is no old password
     * to ask for). Ends the member's other sessions.
     */
    @PostMapping("/password")
    public ResponseEntity<Map<String, Object>> setPassword(
            @RequestBody(required = false) Map<String, String> body,
            @CookieValue(name = "username", required = false) String username,
            @CookieValue(name = "authToken", required = false) String token,
            HttpServletRequest request) {
        AuthSession session = sessionOf(username, token);
        if (session == null) return signInFirst();
        if (accounts.hasPassword(session.userId))
            return message(HttpStatus.CONFLICT, "This account already has a password. Use Change password.");
        if (!flows.isFresh(token)) return needsFreshSignIn();
        String next = body == null ? null : body.get("newPassword");
        String problem = AdminController.validatePassword(next);
        if (problem != null) return message(HttpStatus.BAD_REQUEST, problem);
        if (!accounts.setFirstPassword(session.userId, next))
            return message(HttpStatus.CONFLICT, "This account already has a password. Use Change password.");
        loginRepository.endOtherSessions(session.username, token);
        securityLog.record(session.userId, "password_changed", "First password set", request);
        log.info("First password set by {}", session.username);
        return message(HttpStatus.OK, "Password set. You can now sign in with your username and password.");
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    /**
     * Null when the member has just proved who they are; otherwise the answer
     * to send. With a password: that password, guesses limited per account and
     * address on the same counter as "change password". Without one: a
     * provider sign-in in the last five minutes.
     */
    private ResponseEntity<Map<String, Object>> proveAgain(AuthSession session, String token, Map<String, String> body,
                                                           HttpServletRequest request) {
        if (!accounts.hasPassword(session.userId))
            return flows.isFresh(token) ? null : needsFreshSignIn();

        String limiterKey = "password:" + session.username + "|" + AuthController.rateKey(request.getRemoteAddr());
        if (LoginRateLimiter.isBlocked(limiterKey))
            return message(HttpStatus.TOO_MANY_REQUESTS, "Too many wrong attempts. Try again in 15 minutes.");
        String password = body == null ? null : body.get("password");
        if (password == null || password.isEmpty()) return message(HttpStatus.BAD_REQUEST, "Type your password.");
        if (loginRepository.authenticate(session.username, password) < 0) {
            LoginRateLimiter.recordFailure(limiterKey);
            return message(HttpStatus.FORBIDDEN, "That password is not right.");
        }
        LoginRateLimiter.recordSuccess(limiterKey);
        return null;
    }

    /** 403, not 401: the session is fine, it is just not fresh enough (a 401 would sign the page out). */
    private static ResponseEntity<Map<String, Object>> needsFreshSignIn() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", "Sign in again with a linked provider first, then do this within 5 minutes.");
        body.put("reauth", true);
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
    }

    private List<String> enabledIds() {
        List<String> ids = new ArrayList<>();
        for (SsoProviders.Provider p : providers.enabled()) ids.add(p.id());
        return ids;
    }

    private AuthSession sessionOf(String username, String token) {
        try {
            return loginRepository.authorize(username, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return null;
        }
    }

    private static ResponseEntity<Map<String, Object>> signInFirst() {
        return message(HttpStatus.UNAUTHORIZED, "Sign in first.");
    }

    private static ResponseEntity<Map<String, Object>> message(HttpStatus status, String text) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", text);
        return ResponseEntity.status(status).body(body);
    }

    private static ResponseEntity<?> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }

    /** The same two cookies, with the same attributes, as a password sign-in. */
    private ResponseEntity.BodyBuilder withSession(ResponseEntity.BodyBuilder response, AuthSession s) {
        return response
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.SET_COOKIE, ResponseCookie.from("authToken", s.token)
                        .httpOnly(true).sameSite("Lax").secure(!devMode).path("/").maxAge(60 * 60 * 24).build().toString())
                .header(HttpHeaders.SET_COOKIE, ResponseCookie.from("username", s.username)
                        .httpOnly(true).sameSite("Lax").secure(!devMode).path("/").maxAge(60 * 60 * 24).build().toString());
    }

    private static ResponseEntity<?> redirect(String url) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(url))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .build();
    }

    private String base() { return baseUrl.trim().replaceAll("/+$", ""); }

    /** Only fixed words go in the address, never anything personal. */
    private String loginPage(String outcome) { return base() + "/routes/Login?sso=" + outcome; }

    private String settingsPage(String outcome) { return base() + "/settings?sso=" + outcome; }

    /** Counts this round trip against the caller's network; true when it has made too many. */
    private boolean tooMany(HttpServletRequest request) {
        String address = request.getRemoteAddr();
        if (devMode && isLoopback(address)) return false;   // every local browser and tool shares one address
        String key = "sso:" + AuthController.rateKey(address);
        if (LoginRateLimiter.isBlocked(key)) return true;
        LoginRateLimiter.recordFailure(key, MAX_ROUND_TRIPS_PER_NETWORK);
        return false;
    }

    private static boolean isLoopback(String ip) {
        try {
            return ip != null && java.net.InetAddress.getByName(ip).isLoopbackAddress();
        } catch (Exception e) {
            return false;
        }
    }
}
