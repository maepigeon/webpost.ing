package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.validator.PatternValidator;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PatternValidatorTest {

    // ── Valid inputs ──────────────────────────────────────────────────────────

    @Test void null_is_valid()    { assertThat(PatternValidator.isValid(null)).isTrue(); }
    @Test void blank_is_valid()   { assertThat(PatternValidator.isValid("   ")).isTrue(); }
    @Test void empty_is_valid()   { assertThat(PatternValidator.isValid("")).isTrue(); }

    @Test void preset_none()      { assertThat(PatternValidator.isValid("none")).isTrue(); }
    @Test void preset_dots()      { assertThat(PatternValidator.isValid("dots")).isTrue(); }
    @Test void preset_grid()      { assertThat(PatternValidator.isValid("grid")).isTrue(); }
    @Test void preset_diagonal()  { assertThat(PatternValidator.isValid("diagonal-stripes")).isTrue(); }
    @Test void preset_zigzag()    { assertThat(PatternValidator.isValid("zigzag")).isTrue(); }
    @Test void preset_crosshatch(){ assertThat(PatternValidator.isValid("cross-hatch")).isTrue(); }
    @Test void preset_mixed_case(){ assertThat(PatternValidator.isValid("DOTS")).isTrue(); }

    @Test void linear_gradient_simple() {
        assertThat(PatternValidator.isValid("linear-gradient(45deg, red, blue)")).isTrue();
    }
    @Test void radial_gradient() {
        assertThat(PatternValidator.isValid("radial-gradient(circle, #fff 1px, transparent 1px)")).isTrue();
    }
    @Test void repeating_linear() {
        assertThat(PatternValidator.isValid(
            "repeating-linear-gradient(45deg, rgba(0,0,0,0.1), rgba(0,0,0,0.1) 2px, transparent 2px, transparent 12px)"
        )).isTrue();
    }
    @Test void conic_gradient() {
        assertThat(PatternValidator.isValid("conic-gradient(red, blue)")).isTrue();
    }
    @Test void multiple_gradients_comma_separated() {
        assertThat(PatternValidator.isValid(
            "linear-gradient(red, blue), linear-gradient(90deg, green, yellow)"
        )).isTrue();
    }

    // ── Blocked: dangerous substrings ─────────────────────────────────────────

    @Test void blocks_url() {
        assertThat(PatternValidator.isValid("url(https://evil.com/track.png)")).isFalse();
    }
    @Test void blocks_url_in_gradient() {
        assertThat(PatternValidator.isValid("linear-gradient(red, url(x))")).isFalse();
    }
    @Test void blocks_expression() {
        assertThat(PatternValidator.isValid("expression(alert(1))")).isFalse();
    }
    @Test void blocks_javascript_uri() {
        assertThat(PatternValidator.isValid("javascript:alert(1)")).isFalse();
    }
    @Test void blocks_data_uri() {
        assertThat(PatternValidator.isValid("data:image/png;base64,abc")).isFalse();
    }
    @Test void blocks_import() {
        assertThat(PatternValidator.isValid("@import url(evil.css)")).isFalse();
    }
    @Test void blocks_html_open_tag() {
        assertThat(PatternValidator.isValid("<script>")).isFalse();
    }
    @Test void blocks_html_close_tag() {
        assertThat(PatternValidator.isValid(">alert")).isFalse();
    }
    @Test void blocks_backslash() {
        assertThat(PatternValidator.isValid("linear-gradient(\\0061 lert(1))")).isFalse();
    }
    @Test void blocks_semicolon() {
        assertThat(PatternValidator.isValid("linear-gradient(red, blue); background: red")).isFalse();
    }
    @Test void blocks_css_var() {
        assertThat(PatternValidator.isValid("linear-gradient(var(--secret))")).isFalse();
    }
    @Test void blocks_env() {
        assertThat(PatternValidator.isValid("linear-gradient(env(HOSTNAME))")).isFalse();
    }
    @Test void blocks_attr() {
        assertThat(PatternValidator.isValid("linear-gradient(attr(data-color))")).isFalse();
    }

    // ── Blocked: unknown / arbitrary strings ─────────────────────────────────

    @Test void rejects_arbitrary_string() {
        assertThat(PatternValidator.isValid("red")).isFalse();
    }
    @Test void rejects_hex_color() {
        assertThat(PatternValidator.isValid("#ff0000")).isFalse();
    }
    @Test void rejects_rgb() {
        assertThat(PatternValidator.isValid("rgb(255,0,0)")).isFalse();
    }

    // ── Length limit ──────────────────────────────────────────────────────────

    @Test void rejects_too_long() {
        // MAX_LENGTH = 2000; "linear-gradient(" = 16 chars, ")" = 1 → need >1983 filler chars
        assertThat(PatternValidator.isValid("linear-gradient(" + "a".repeat(1990) + ")")).isFalse();
    }
    @Test void accepts_exactly_2000_chars() {
        // "linear-gradient(" = 16, ")" = 1 → 2000 - 17 = 1983 filler chars
        String value = "linear-gradient(" + "a".repeat(1983) + ")";
        assertThat(value.length()).isEqualTo(2000);
        assertThat(PatternValidator.isValid(value)).isTrue();
    }
}
