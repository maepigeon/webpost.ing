package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.validator.ThemeValidator;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ThemeValidatorTest {

    @Test
    void keepsKnownValues() throws Exception {
        String out = ThemeValidator.normalise("""
                {"preset":"neon","page":{"bg":"#05060A","texture":"scanlines"},
                 "type":{"heading":"terminal","ink":"#39ff14"},
                 "card":{"border":"glow","radius":4,"tilt":1.5},
                 "fx":{"glow":true,"flicker":true}}""");
        Map<String, Object> t = ThemeValidator.parse(out);
        assertThat(t.get("preset")).isEqualTo("neon");
        assertThat(((Map<?, ?>) t.get("page")).get("bg")).isEqualTo("#05060a");
        assertThat(((Map<?, ?>) t.get("page")).get("texture")).isEqualTo("scanlines");
        assertThat(((Map<?, ?>) t.get("type")).get("heading")).isEqualTo("terminal");
        assertThat(((Map<?, ?>) t.get("card")).get("tilt")).isEqualTo(1.5);
        assertThat(((Map<?, ?>) t.get("fx")).get("glow")).isEqualTo(true);
        assertThat(((Map<?, ?>) t.get("fx")).get("rainbow")).isEqualTo(false);
    }

    @Test
    void replacesAnythingThatCouldCarryCss() throws Exception {
        String out = ThemeValidator.normalise("""
                {"page":{"bg":"red; background:url(evil)","texture":"url(x)"},
                 "type":{"heading":"Comic Sans","ink":"expression(alert(1))"},
                 "card":{"radius":9999,"border":"<script>"},
                 "extra":"dropped"}""");
        assertThat(out).doesNotContain("evil", "url", "expression", "script", "dropped", "Comic");
        Map<String, Object> t = ThemeValidator.parse(out);
        assertThat(((Map<?, ?>) t.get("card")).get("radius")).isEqualTo(28.0);
        assertThat(t.get("preset")).isEqualTo("custom");
    }

    @Test
    void rejectsJunk() {
        assertThatThrownBy(() -> ThemeValidator.normalise("not json"))
                .isInstanceOf(ThemeValidator.InvalidThemeException.class);
        assertThatThrownBy(() -> ThemeValidator.normalise("[1,2]"))
                .isInstanceOf(ThemeValidator.InvalidThemeException.class);
        assertThatThrownBy(() -> ThemeValidator.normalise("{\"x\":\"" + "a".repeat(5000) + "\"}"))
                .isInstanceOf(ThemeValidator.InvalidThemeException.class);
    }
}
