package com.springbootprojects.webpostingserver.posts.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Which sign-in providers are switched on, and where each one lives.
 *
 * A provider is OFF unless its SSO_* values are in the environment (names in
 * guide/CONFIGURATION.md). With none set, {@link #enabled()} is empty, every
 * /api/auth/sso/{provider}/... address answers 404 and the site shows no
 * provider buttons: exactly as before this existed.
 *
 * The provider addresses are fixed here rather than discovered at run time, so
 * starting a sign-in costs no extra network call and cannot be redirected by a
 * tampered discovery document.
 */
@Component
public class SsoProviders {

    private static final Logger log = LoggerFactory.getLogger(SsoProviders.class);

    public static final String GOOGLE = "google";
    public static final String MICROSOFT = "microsoft";
    /** Known, never on: the flow for Apple is not built yet (see guide/SSO-PLAN.md). */
    public static final String APPLE = "apple";

    /** The tenant every personal Microsoft account (Outlook.com, Xbox) belongs to. */
    public static final String MICROSOFT_PERSONAL_TENANT = "9188040d-6c67-4c5b-b2dc-ad6d4f4a1b0b";

    private static final Pattern GUID =
            Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    /**
     * One provider that is switched on. {@code tenant} is only used by
     * Microsoft ("common", "organizations", "consumers" or a tenant id).
     */
    public record Provider(String id, String name, String clientId, String clientSecret,
                           String authorizeUrl, String tokenUrl, String jwksUrl, String scope, String tenant) {
        /** Never print the secret. */
        @Override
        public String toString() { return "Provider[" + id + "]"; }
    }

    private final Map<String, Provider> enabled = new LinkedHashMap<>();
    private final String redirectBase;

    @Autowired
    public SsoProviders(@Value("${SSO_GOOGLE_CLIENT_ID:}") String googleId,
                        @Value("${SSO_GOOGLE_CLIENT_SECRET:}") String googleSecret,
                        @Value("${SSO_MICROSOFT_CLIENT_ID:}") String microsoftId,
                        @Value("${SSO_MICROSOFT_CLIENT_SECRET:}") String microsoftSecret,
                        @Value("${SSO_MICROSOFT_TENANT:common}") String microsoftTenant,
                        @Value("${SSO_APPLE_CLIENT_ID:}") String appleId,
                        @Value("${SSO_REDIRECT_BASE:}") String redirectBase,
                        @Value("${app.base-url:http://localhost:5173}") String baseUrl) {
        String gId = clean(googleId), gSecret = clean(googleSecret);
        if (!gId.isEmpty() && !gSecret.isEmpty()) {
            enabled.put(GOOGLE, new Provider(GOOGLE, "Google", gId, gSecret,
                    "https://accounts.google.com/o/oauth2/v2/auth",
                    "https://oauth2.googleapis.com/token",
                    "https://www.googleapis.com/oauth2/v3/certs",
                    "openid email", null));
        } else if (!gId.isEmpty() || !gSecret.isEmpty()) {
            log.warn("Sign in with Google is off: it needs both SSO_GOOGLE_CLIENT_ID and SSO_GOOGLE_CLIENT_SECRET.");
        }

        String mId = clean(microsoftId), mSecret = clean(microsoftSecret);
        String tenant = clean(microsoftTenant).toLowerCase();
        if (tenant.isEmpty()) tenant = "common";
        if (!mId.isEmpty() && !mSecret.isEmpty()) {
            if (isTenant(tenant)) {
                String host = "https://login.microsoftonline.com/" + tenant;
                enabled.put(MICROSOFT, new Provider(MICROSOFT, "Microsoft", mId, mSecret,
                        host + "/oauth2/v2.0/authorize",
                        host + "/oauth2/v2.0/token",
                        host + "/discovery/v2.0/keys",
                        "openid email", tenant));
            } else {
                log.warn("Sign in with Microsoft is off: SSO_MICROSOFT_TENANT must be common, organizations, consumers or a tenant id.");
            }
        } else if (!mId.isEmpty() || !mSecret.isEmpty()) {
            log.warn("Sign in with Microsoft is off: it needs both SSO_MICROSOFT_CLIENT_ID and SSO_MICROSOFT_CLIENT_SECRET.");
        }

        if (!clean(appleId).isEmpty())
            log.warn("Sign in with Apple is not built yet: the SSO_APPLE_* values are ignored.");

        String base = clean(redirectBase).isEmpty() ? clean(baseUrl) : clean(redirectBase);
        this.redirectBase = base.replaceAll("/+$", "");
    }

    private static String clean(String s) { return s == null ? "" : s.trim(); }

    static boolean isTenant(String tenant) {
        return tenant.equals("common") || tenant.equals("organizations") || tenant.equals("consumers")
                || GUID.matcher(tenant).matches();
    }

    public static boolean isGuid(String s) { return s != null && GUID.matcher(s).matches(); }

    /** The provider when it is switched on. */
    public Optional<Provider> find(String id) {
        return Optional.ofNullable(id == null ? null : enabled.get(id));
    }

    public boolean isEnabled(String id) { return id != null && enabled.containsKey(id); }

    /** The providers that are switched on, in the order their buttons are shown. */
    public List<Provider> enabled() { return new ArrayList<>(enabled.values()); }

    /** What the sign-in page needs: [{id, name}] and nothing secret. */
    public List<Map<String, String>> publicList() {
        List<Map<String, String>> out = new ArrayList<>();
        for (Provider p : enabled.values()) {
            Map<String, String> m = new LinkedHashMap<>();
            m.put("id", p.id());
            m.put("name", p.name());
            out.add(m);
        }
        return out;
    }

    /** The name to show for a provider id, switched on or not ("google" -> "Google"). */
    public static String displayName(String id) {
        if (GOOGLE.equals(id)) return "Google";
        if (MICROSOFT.equals(id)) return "Microsoft";
        if (APPLE.equals(id)) return "Apple";
        return "your provider";
    }

    /** The address registered with the provider; it sends people back here. */
    public String redirectUri(Provider p) {
        return redirectBase + "/api/auth/sso/" + p.id() + "/callback";
    }
}
