package com.springbootprojects.webpostingserver.posts.validator;

import java.util.Set;

/**
 * Usernames that cannot be registered because a profile lives at /{username}.
 *
 * With profiles at the top level, a user called "settings" would shadow the
 * settings page — their profile would be unreachable and the real page would be
 * too, depending on how the router ranked them. So the names the application
 * owns are reserved before anyone can take them.
 *
 * **Keep this in sync with the routes in client/src/App.jsx and with
 * client/src/utils/reservedUsernames.js.** Anything added as a top-level route
 * must be added here too, or the next person to register that name breaks it.
 */
public final class ReservedUsernames {

    private ReservedUsernames() {}

    private static final Set<String> RESERVED = Set.of(
            // Application routes
            "users", "user", "routes", "editor", "inbox", "messages", "search",
            "activity", "settings", "login", "logout", "register", "signup",
            "signin", "verify-email", "unsubscribe", "reset-password",
            "forgot-password", "admin", "adminpanel", "posts", "post",

            // Server paths
            "api", "uploads", "static", "assets", "public", "fonts",

            // Conventional files a browser or crawler may request
            "favicon.ico", "robots.txt", "sitemap.xml", "manifest.json",
            "index", "index.html", ".well-known",

            // Reserved for future use and to avoid impersonation
            "about", "help", "support", "terms", "privacy", "contact", "legal",
            "moderator", "moderators", "staff", "official", "webpost",
            "webposting", "system", "root", "null", "undefined", "me", "new",
            "edit", "delete", "create"
    );

    /** Case-insensitive: usernames are case-sensitive, but URLs should not be ambiguous. */
    public static boolean isReserved(String username) {
        return username != null && RESERVED.contains(username.trim().toLowerCase());
    }
}
