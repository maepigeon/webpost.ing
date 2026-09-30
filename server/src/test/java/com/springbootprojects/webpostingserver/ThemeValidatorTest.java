package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.validator.GridValidator;
import com.springbootprojects.webpostingserver.posts.validator.ThemeValidator;
import com.springbootprojects.webpostingserver.posts.validator.WallpaperValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ThemeValidatorTest {

    private static final String PNG = "data:image/png;base64,iVBORw0KGgo=";
    private static final String GRID = "{\"cols\":2,\"rows\":2,\"layers\":[{\"id\":\"a1\",\"kind\":\"pixel\",\"paint\":\"" + PNG + "\",\"text\":[\"hi\"],\"style\":{\"0,0\":{\"font\":\"smooth\",\"color\":\"#FF0000\"}}}]}";
    private static final String WALLPAPER = "{\"v\":3,\"tile\":" + GRID + ",\"tiling\":\"brick\",\"scale\":3,\"bg\":\"#123456\"}";

    // ── Grids ──

    @Test
    void gridKeepsKnownFields() throws Exception {
        String out = GridValidator.normalise(new ObjectMapper().readTree(GRID), 8, 8).toString();
        assertThat(out).contains("\"paint\":\"" + PNG + "\"", "\"text\":[\"hi\"]", "\"color\":\"#ff0000\"");
    }

    @Test
    void gridRefusesAnythingThatCouldLoadFromElsewhere() throws Exception {
        String evil = "{\"layers\":[{\"id\":\"a\",\"kind\":\"photo\",\"src\":\"https://tracker.example/x.gif\"},"
                + "{\"id\":\"b\",\"kind\":\"photo\",\"src\":\"/uploads/../../etc/passwd\"},"
                + "{\"id\":\"c\",\"kind\":\"pixel\",\"paint\":\"javascript:alert(1)\",\"extra\":\"dropped\"}]}";
        String out = GridValidator.normalise(new ObjectMapper().readTree(evil), 8, 8).toString();
        assertThat(out).doesNotContain("tracker", "passwd", "javascript", "dropped");
        assertThat(out).contains("\"paint\":null");
    }

    @Test
    void gridClampsSize() throws Exception {
        String out = GridValidator.normalise(new ObjectMapper().readTree("{\"cols\":99,\"rows\":99,\"layers\":[{\"id\":\"a\"}]}"), 8, 4).toString();
        assertThat(out).contains("\"cols\":8", "\"rows\":4");
    }

    // ── Wallpapers ──

    @Test
    void wallpaperRoundTrips() throws Exception {
        Map<String, Object> w = ThemeValidator.parse(WallpaperValidator.normalise(WALLPAPER));
        assertThat(w.get("tiling")).isEqualTo("brick");
        assertThat(w.get("scale")).isEqualTo(3.0);
        assertThat(w.get("bg")).isEqualTo("#123456");
    }

    @Test
    void emptyWallpaperClears() throws Exception {
        assertThat(WallpaperValidator.normalise("")).isNull();
        assertThat(WallpaperValidator.normalise((String) null)).isNull();
    }

    @Test
    void oldCssWallpapersAreRefused() {
        assertThat(WallpaperValidator.isValid("{\"v\":2,\"pattern\":\"grid\"}")).isFalse();
        assertThat(WallpaperValidator.isValid("linear-gradient(red, blue)")).isFalse();
    }

    // ── Themes ──

    @Test
    void themeKeepsKnownValues() throws Exception {
        String out = ThemeValidator.normalise("{\"preset\":\"neon\",\"page\":{\"wallpaper\":" + WALLPAPER + "},"
                + "\"type\":{\"heading\":\"terminal\",\"ink\":\"#39FF14\"},"
                + "\"card\":{\"border\":\"glow\",\"radius\":4,\"tilt\":1.5,\"sticker\":" + GRID + "},"
                + "\"fx\":{\"glow\":true,\"flicker\":true}}");
        Map<String, Object> t = ThemeValidator.parse(out);
        assertThat(t.get("preset")).isEqualTo("neon");
        assertThat(((Map<?, ?>) ((Map<?, ?>) t.get("page")).get("wallpaper")).get("tiling")).isEqualTo("brick");
        assertThat(((Map<?, ?>) t.get("type")).get("ink")).isEqualTo("#39ff14");
        assertThat(((Map<?, ?>) t.get("card")).get("sticker")).isNotNull();
        assertThat(((Map<?, ?>) t.get("fx")).get("glow")).isEqualTo(true);
        assertThat(((Map<?, ?>) t.get("fx")).get("rainbow")).isEqualTo(false);
    }

    @Test
    void themeReplacesAnythingThatCouldCarryCss() throws Exception {
        String out = ThemeValidator.normalise("{\"page\":{\"wallpaper\":\"url(evil)\"},"
                + "\"type\":{\"heading\":\"Comic Sans\",\"ink\":\"expression(alert(1))\"},"
                + "\"card\":{\"radius\":9999,\"border\":\"<script>\"},\"extra\":\"dropped\"}");
        assertThat(out).doesNotContain("evil", "expression", "script", "dropped", "Comic");
        Map<String, Object> t = ThemeValidator.parse(out);
        assertThat(((Map<?, ?>) t.get("card")).get("radius")).isEqualTo(28.0);
        assertThat(t.get("preset")).isEqualTo("custom");
    }

    @Test
    void rejectsJunk() {
        assertThatThrownBy(() -> ThemeValidator.normalise("not json")).isInstanceOf(ThemeValidator.InvalidThemeException.class);
        assertThatThrownBy(() -> ThemeValidator.normalise("[1,2]")).isInstanceOf(ThemeValidator.InvalidThemeException.class);
        assertThatThrownBy(() -> ThemeValidator.normalise("{\"page\":{\"wallpaper\":{\"v\":2}}}"))
                .isInstanceOf(ThemeValidator.InvalidThemeException.class);
    }
}
