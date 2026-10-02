package com.springbootprojects.webpostingserver;

import com.fasterxml.jackson.databind.JsonNode;
import com.springbootprojects.webpostingserver.posts.controller.SharedPackController;
import com.springbootprojects.webpostingserver.posts.controller.StickerController;
import com.springbootprojects.webpostingserver.posts.model.AuthSession;
import com.springbootprojects.webpostingserver.posts.model.LoginInfo;
import com.springbootprojects.webpostingserver.posts.repository.LoginRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Sticker collections (V012) and packs shared in messages (V013). */
@SpringBootTest
class SharedPackTest {

    private static final String SENDER = "pack_sender";
    private static final String TAKER = "pack_taker";
    private static final String STICKER =
            "{\"name\":\"Dot\",\"grid\":{\"v\":3,\"cols\":20,\"rows\":1,\"layers\":[{\"id\":\"a1\",\"kind\":\"pixel\",\"text\":[\"o\"]}]}}";

    @Autowired JdbcTemplate jdbc;
    @Autowired LoginRepository logins;
    @Autowired StickerController stickers;
    @Autowired SharedPackController packs;

    private int senderId;
    private int takerId;

    @BeforeEach
    void setUp() {
        cleanUp();
        String hash = new BCryptPasswordEncoder().encode("pw");
        senderId = jdbc.queryForObject("INSERT INTO users (username, password) VALUES (?, ?) RETURNING id", Integer.class, SENDER, hash);
        takerId = jdbc.queryForObject("INSERT INTO users (username, password) VALUES (?, ?) RETURNING id", Integer.class, TAKER, hash);
    }

    @AfterEach
    void cleanUp() {
        jdbc.update("DELETE FROM users WHERE username IN (?, ?)", SENDER, TAKER);
    }

    @Test
    void onlyTheOwnerAddsStickersWhichAreClampedToEightTiles() {
        String token = signIn(SENDER);
        assertThat(stickers.create(SENDER, STICKER, null, null).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(stickers.create(SENDER, STICKER, TAKER, signIn(TAKER)).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(stickers.create(SENDER, STICKER, SENDER, token).getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(stickers.create(SENDER, "{\"name\":\"\",\"grid\":{}}", SENDER, token).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        List<Map<String, Object>> list = listOf(stickers.list(SENDER));
        assertThat(list).hasSize(1);
        assertThat(((JsonNode) list.get(0).get("grid")).path("cols").asInt()).isEqualTo(StickerController.MAX_TILES);
    }

    @Test
    void aSharedStickerPackIsASnapshotTheReaderCanCopy() {
        String token = signIn(SENDER);
        stickers.create(SENDER, STICKER, SENDER, token);
        int stickerId = jdbc.queryForObject("SELECT id FROM stickers WHERE user_id = ?", Integer.class, senderId);

        Map<String, Object> body = Map.of("kind", "stickers", "name", "Dots", "stickerIds", List.of(stickerId));
        assertThat(packs.share(body, null, null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        // Someone else's stickers cannot be shared.
        assertThat(packs.share(body, TAKER, signIn(TAKER)).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        ResponseEntity<?> shared = packs.share(body, SENDER, token);
        assertThat(shared.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        String packId = (String) ((Map<?, ?>) shared.getBody()).get("id");

        // Deleting the original leaves the shared copy whole.
        jdbc.update("DELETE FROM stickers WHERE id = ?", stickerId);
        Map<?, ?> pack = (Map<?, ?>) packs.get(packId).getBody();
        assertThat(pack.get("kind")).isEqualTo("stickers");
        assertThat(pack.get("sender")).isEqualTo(SENDER);
        assertThat(((JsonNode) pack.get("body")).size()).isEqualTo(1);

        assertThat(packs.save(packId, TAKER, signIn(TAKER)).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM stickers WHERE user_id = ?", Integer.class, takerId)).isEqualTo(1);
        assertThat(packs.get("not-a-uuid").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void aSharedSymbolsPackBecomesTheReadersOwnPixelFont() {
        String glyphs = "{\"A\":\"" + "ff".repeat(16) + "\"}";
        int fontId = jdbc.queryForObject("INSERT INTO pixel_fonts (user_id, name, glyphs) VALUES (?, 'Runes', ?) RETURNING id",
                Integer.class, senderId, glyphs);
        ResponseEntity<?> shared = packs.share(Map.of("kind", "symbols", "fontId", fontId), SENDER, signIn(SENDER));
        assertThat(shared.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        String packId = (String) ((Map<?, ?>) shared.getBody()).get("id");

        assertThat(packs.save(packId, TAKER, signIn(TAKER)).getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<String, Object> copy = jdbc.queryForMap("SELECT name, glyphs FROM pixel_fonts WHERE user_id = ?", takerId);
        assertThat(copy.get("name")).isEqualTo("Runes");
        assertThat((String) copy.get("glyphs")).contains("\"A\"");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> listOf(ResponseEntity<?> r) {
        return (List<Map<String, Object>>) r.getBody();
    }

    private String signIn(String username) {
        LoginInfo info = new LoginInfo();
        info.setUsername(username);
        info.setPassword("pw");
        AuthSession session = logins.login(info);
        return session.token;
    }
}
