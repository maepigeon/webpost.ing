package com.springbootprojects.webpostingserver.posts.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.repository.JdbcLoginRepository;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import com.springbootprojects.webpostingserver.posts.validator.GridValidator;
import com.springbootprojects.webpostingserver.posts.validator.RateLimiter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Packs shared in messages (V013). Sharing snapshots a pixel font (a symbols
 * pack) or a set of the sender's stickers; the client then sends a message
 * holding "[[pack:<id>]]". Whoever has the id can look at the pack and save a
 * copy into their own collection, so later edits to the original change nothing.
 */
@RestController
@RequestMapping("/api")
public class SharedPackController {

    public static final int MAX_STICKERS_PER_PACK = 50;
    private static final RateLimiter SHARE_LIMITER = new RateLimiter(30, 60 * 60 * 1000L, 60 * 60 * 1000L);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired private LoginRepository loginRepository;
    @Autowired private JdbcTemplate jdbc;

    private AuthSession authorize(String username, String token) {
        if (username == null || token == null) return null;
        try {
            return loginRepository.authorize(username, token);
        } catch (JdbcLoginRepository.TokenExpiredException e) {
            return null;
        }
    }

    private static ResponseEntity<?> bad(String message) {
        return ResponseEntity.badRequest().body(Map.of("message", message));
    }

    private static UUID parseId(String id) {
        try { return UUID.fromString(id); } catch (IllegalArgumentException e) { return null; }
    }

    /**
     * Body: {kind: "symbols", fontId} or {kind: "stickers", name, stickerIds: [...]}.
     * Only the sender's own font or stickers. Returns {id}.
     */
    @PostMapping("/packs")
    public ResponseEntity<?> share(@RequestBody Map<String, Object> body,
                                   @CookieValue(name = "username", required = false) String authUsername,
                                   @CookieValue(name = "authToken", required = false) String token) {
        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        String key = "pack:" + session.userId;
        if (SHARE_LIMITER.isBlocked(key))
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("message", "Too many packs shared. Try again later."));

        String kind = String.valueOf(body.get("kind"));
        String name;
        String packBody;
        if ("symbols".equals(kind)) {
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "SELECT name, glyphs FROM pixel_fonts WHERE id = ? AND user_id = ?", intOf(body.get("fontId")), session.userId);
            if (rows.isEmpty()) return ResponseEntity.notFound().build();
            name = (String) rows.get(0).get("name");
            packBody = (String) rows.get(0).get("glyphs");
        } else if ("stickers".equals(kind)) {
            name = String.valueOf(body.getOrDefault("name", "")).trim();
            if (name.isEmpty() || name.length() > 40) return bad("A pack needs a name of 1–40 characters.");
            if (!(body.get("stickerIds") instanceof List<?> ids) || ids.isEmpty()) return bad("Pick at least one sticker.");
            if (ids.size() > MAX_STICKERS_PER_PACK) return bad("A pack holds at most " + MAX_STICKERS_PER_PACK + " stickers.");
            ArrayNode stickers = MAPPER.createArrayNode();
            for (Object id : ids) {
                List<Map<String, Object>> rows = jdbc.queryForList(
                        "SELECT name, grid FROM stickers WHERE id = ? AND user_id = ?", intOf(id), session.userId);
                if (rows.isEmpty()) return ResponseEntity.notFound().build();
                ObjectNode s = stickers.addObject();
                s.put("name", (String) rows.get(0).get("name"));
                try { s.set("grid", MAPPER.readTree((String) rows.get(0).get("grid"))); }
                catch (Exception e) { return bad("One of those stickers could not be read."); }
            }
            packBody = stickers.toString();
        } else {
            return bad("A pack is either stickers or symbols.");
        }

        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO shared_packs (id, sender_id, kind, name, body) VALUES (?, ?, ?, ?, ?)",
                id, session.userId, kind, name, packBody);
        SHARE_LIMITER.recordUse(key);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id.toString()));
    }

    /**
     * {id, kind, name, sender, body, savedByMe}: body is [{name, grid}] for
     * stickers, {char: hex} for symbols; savedByMe is false when signed out.
     */
    @GetMapping("/packs/{id}")
    public ResponseEntity<?> get(@PathVariable String id,
                                 @CookieValue(name = "username", required = false) String authUsername,
                                 @CookieValue(name = "authToken", required = false) String token) {
        UUID uuid = parseId(id);
        if (uuid == null) return ResponseEntity.notFound().build();
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT p.kind, p.name, p.body, u.username FROM shared_packs p JOIN users u ON u.id = p.sender_id
                 WHERE p.id = ?""", uuid);
        if (rows.isEmpty()) return ResponseEntity.notFound().build();
        Map<String, Object> row = rows.get(0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", uuid.toString());
        out.put("kind", row.get("kind"));
        out.put("name", row.get("name"));
        out.put("sender", row.get("username"));
        try { out.put("body", MAPPER.readTree((String) row.get("body"))); }
        catch (Exception e) { out.put("body", null); }
        AuthSession session = authorize(authUsername, token);
        out.put("savedByMe", session != null && hasSaved(uuid, session.userId));
        return ResponseEntity.ok(out);
    }

    /**
     * Copies a pack into the signed-in user's own collection: its stickers are
     * added to theirs, or its symbols become a new pixel font, once per reader:
     * saving again copies nothing. Returns {saved, alreadySaved}.
     */
    @PostMapping("/packs/{id}/save")
    @Transactional
    public ResponseEntity<?> save(@PathVariable String id,
                                  @CookieValue(name = "username", required = false) String authUsername,
                                  @CookieValue(name = "authToken", required = false) String token) {
        AuthSession session = authorize(authUsername, token);
        if (session == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        UUID uuid = parseId(id);
        if (uuid == null) return ResponseEntity.notFound().build();
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT kind, name, body FROM shared_packs WHERE id = ?", uuid);
        if (rows.isEmpty()) return ResponseEntity.notFound().build();
        String kind = (String) rows.get(0).get("kind");
        String name = (String) rows.get(0).get("name");
        JsonNode body;
        try { body = MAPPER.readTree((String) rows.get(0).get("body")); }
        catch (Exception e) { return bad("That pack could not be read."); }
        if (hasSaved(uuid, session.userId)) return ResponseEntity.ok(Map.of("saved", 0, "alreadySaved", true));

        if ("symbols".equals(kind)) {
            Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM pixel_fonts WHERE user_id = ?", Integer.class, session.userId);
            if (count != null && count >= PixelFontController.MAX_FONTS)
                return bad("You can keep at most " + PixelFontController.MAX_FONTS + " fonts.");
            String glyphs = GridValidator.cleanGlyphs(body, PixelFontController.MAX_GLYPHS).toString();
            if (!claim(uuid, session.userId)) return ResponseEntity.ok(Map.of("saved", 0, "alreadySaved", true));
            jdbc.update("INSERT INTO pixel_fonts (user_id, name, glyphs) VALUES (?, ?, ?)", session.userId, name, glyphs);
            return ResponseEntity.ok(Map.of("saved", 1, "alreadySaved", false));
        }

        if (!body.isArray()) return bad("That pack could not be read.");
        if (!StickerController.hasRoom(jdbc, session.userId, body.size()))
            return bad("That would take you past " + StickerController.MAX_STICKERS + " stickers.");
        if (!claim(uuid, session.userId)) return ResponseEntity.ok(Map.of("saved", 0, "alreadySaved", true));
        int saved = 0;
        for (JsonNode s : body) {
            StickerController.Sticker clean = StickerController.clean(s);
            if (clean.error() != null) continue;
            jdbc.update("INSERT INTO stickers (user_id, name, grid) VALUES (?, ?, ?)", session.userId, clean.name(), clean.grid());
            saved++;
        }
        return ResponseEntity.ok(Map.of("saved", saved, "alreadySaved", false));
    }

    private boolean hasSaved(UUID pack, int userId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM shared_pack_saves WHERE pack_id = ? AND user_id = ?",
                Integer.class, pack, userId);
        return n != null && n > 0;
    }

    /** Records the save; false if this reader already has (two presses at once included). */
    private boolean claim(UUID pack, int userId) {
        return jdbc.update("INSERT INTO shared_pack_saves (pack_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
                pack, userId) == 1;
    }

    private static int intOf(Object v) {
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(v)); } catch (NumberFormatException e) { return -1; }
    }
}
