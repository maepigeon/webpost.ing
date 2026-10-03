package com.springbootprojects.webpostingserver.posts.service;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * A member's own security log (table {@code security_events}, migration V018).
 *
 * Recording never throws: a failure to write the log must not break signing in
 * or changing a password. The client address is stored shortened (IPv4 with the
 * last number zeroed, IPv6 as its /48): enough to recognise "not where I was",
 * not enough to track a person. Pruned on write: newest 200 rows per user and
 * nothing older than 90 days.
 */
@Service
public class SecurityLog {

    private static final Logger log = LoggerFactory.getLogger(SecurityLog.class);

    public static final Set<String> KINDS = Set.of(
            "sign_in", "sign_in_failed", "sign_out", "password_changed",
            "password_reset", "email_changed", "sessions_ended", "account_deleted");

    static final int MAX_ROWS_PER_USER = 200;
    static final int MAX_DAYS = 90;

    private static final Pattern IPV4 = Pattern.compile("^\\d{1,3}(\\.\\d{1,3}){3}$");

    @Autowired
    private JdbcTemplate jdbc;

    public SecurityLog() { }

    public SecurityLog(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** Records an event for a known user id. Never throws. */
    public void record(int userId, String kind, String detail, HttpServletRequest request) {
        try {
            if (kind == null || !KINDS.contains(kind)) return;
            if ("sign_in_failed".equals(kind)) {
                // One a minute per account, so an attacker cannot flood the owner's log.
                Integer recent = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM security_events WHERE user_id = ? AND kind = 'sign_in_failed' "
                                + "AND created_at > now() - interval '1 minute'", Integer.class, userId);
                if (recent != null && recent > 0) return;
            }
            String ua = request == null ? null : request.getHeader("User-Agent");
            jdbc.update("INSERT INTO security_events (user_id, kind, detail, ip_prefix, user_agent) VALUES (?,?,?,?,?)",
                    userId, kind, truncate(detail, 200),
                    request == null ? null : shortenAddress(request.getRemoteAddr()),
                    truncate(ua, 200));
            prune(userId);
        } catch (Exception e) {
            log.warn("Could not write the security log: {}", e.toString());
        }
    }

    /** Same, looked up by username; does nothing when the name does not exist. */
    public void recordForUsername(String username, String kind, String detail, HttpServletRequest request) {
        try {
            if (username == null) return;
            List<Integer> ids = jdbc.queryForList("SELECT id FROM users WHERE username = ?", Integer.class, username);
            if (!ids.isEmpty()) record(ids.get(0), kind, detail, request);
        } catch (Exception e) {
            log.warn("Could not write the security log: {}", e.toString());
        }
    }

    private void prune(int userId) {
        jdbc.update("DELETE FROM security_events WHERE user_id = ? AND (created_at < now() - interval '" + MAX_DAYS
                + " days' OR id IN (SELECT id FROM security_events WHERE user_id = ? "
                + "ORDER BY created_at DESC, id DESC OFFSET " + MAX_ROWS_PER_USER + "))", userId, userId);
    }

    /** The newest events of a user, at most 50. */
    public List<Map<String, Object>> list(int userId, int limit) {
        int n = Math.max(1, Math.min(limit, 50));
        return jdbc.queryForList(
                "SELECT kind, detail, ip_prefix, user_agent, created_at FROM security_events "
                        + "WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?", userId, n);
    }

    static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }

    /** IPv4: last number zeroed. IPv6: the /48. Anything else: null. Never does a DNS lookup. */
    public static String shortenAddress(String ip) {
        if (ip == null) return null;
        ip = ip.trim();
        if (IPV4.matcher(ip).matches()) {
            return ip.substring(0, ip.lastIndexOf('.') + 1) + "0";
        }
        if (!ip.contains(":") || !ip.matches("^[0-9a-fA-F:.]+$")) return null;
        try {
            java.net.InetAddress a = java.net.InetAddress.getByName(ip); // a literal: no lookup
            byte[] b = a.getAddress();
            if (b.length == 4) return shortenAddress(a.getHostAddress());
            return String.format("%x:%x:%x::/48",
                    ((b[0] & 0xff) << 8) | (b[1] & 0xff),
                    ((b[2] & 0xff) << 8) | (b[3] & 0xff),
                    ((b[4] & 0xff) << 8) | (b[5] & 0xff));
        } catch (Exception e) {
            return null;
        }
    }

    /** A short label such as "Chrome on macOS" from a user agent. */
    public static String deviceLabel(String ua) {
        if (ua == null || ua.isBlank()) return "Unknown device";
        String browser = ua.contains("Edg/") ? "Edge"
                : ua.contains("OPR/") || ua.contains("Opera") ? "Opera"
                : ua.contains("Firefox/") ? "Firefox"
                : ua.contains("Chrome/") || ua.contains("CriOS/") ? "Chrome"
                : ua.contains("Safari/") ? "Safari"
                : null;
        String os = ua.contains("Android") ? "Android"
                : ua.contains("iPhone") || ua.contains("iPad") || ua.contains("iPod") ? "iOS"
                : ua.contains("Windows") ? "Windows"
                : ua.contains("Mac OS X") || ua.contains("Macintosh") ? "macOS"
                : ua.contains("CrOS") ? "ChromeOS"
                : ua.contains("Linux") ? "Linux"
                : null;
        if (browser == null && os == null) return "Unknown device";
        if (browser == null) return os;
        return os == null ? browser : browser + " on " + os;
    }
}
