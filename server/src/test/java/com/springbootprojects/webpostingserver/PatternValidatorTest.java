package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.validator.PatternValidator;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PatternValidatorTest {

    private static String preset(String name) {
        return "{\"v\":2,\"pattern\":\"" + name + "\",\"scale\":1,\"bgColor\":\"#ece9e2\",\"colors\":[\"#000000\"]}";
    }

    private static String custom(String css) {
        return "{\"v\":2,\"pattern\":\"custom\",\"scale\":1,\"bgColor\":\"#ece9e2\",\"colors\":[],\"css\":"
                + com.fasterxml.jackson.databind.node.TextNode.valueOf(css) + "}";
    }

    // ── Empty ──
    @Test void null_is_valid()  { assertThat(PatternValidator.isValid(null)).isTrue(); }
    @Test void blank_is_valid() { assertThat(PatternValidator.isValid("   ")).isTrue(); }
    @Test void empty_is_valid() { assertThat(PatternValidator.isValid("")).isTrue(); }

    // ── Presets ──
    @Test void every_preset_is_valid() {
        for (String p : new String[] { "none", "grid", "checkerboard", "paw-print", "stars", "hexagons", "chevron", "topographic" })
            assertThat(PatternValidator.isValid(preset(p))).as(p).isTrue();
    }
    @Test void unknown_preset_is_rejected() { assertThat(PatternValidator.isValid(preset("dots"))).isFalse(); }
    @Test void wrong_version_is_rejected() {
        assertThat(PatternValidator.isValid("{\"v\":1,\"pattern\":\"grid\"}")).isFalse();
    }

    // ── Only JSON is accepted ──
    @Test void rejects_bare_preset_name() { assertThat(PatternValidator.isValid("grid")).isFalse(); }
    @Test void rejects_old_pipe_format()  { assertThat(PatternValidator.isValid("grid|#f0e6d3|scale:2")).isFalse(); }
    @Test void rejects_bare_gradient()    { assertThat(PatternValidator.isValid("linear-gradient(red, blue)")).isFalse(); }
    @Test void rejects_malformed_json()   { assertThat(PatternValidator.isValid("{\"v\":2,")).isFalse(); }

    // ── Custom gradients ──
    @Test void linear_gradient() { assertThat(PatternValidator.isValid(custom("linear-gradient(45deg, red, blue)"))).isTrue(); }
    @Test void radial_gradient() { assertThat(PatternValidator.isValid(custom("radial-gradient(circle, #fff 1px, transparent 1px)"))).isTrue(); }
    @Test void repeating_linear() {
        assertThat(PatternValidator.isValid(custom("repeating-linear-gradient(45deg, #000 0 2px, transparent 2px 8px)"))).isTrue();
    }
    @Test void conic_gradient() { assertThat(PatternValidator.isValid(custom("conic-gradient(red, blue)"))).isTrue(); }
    @Test void custom_must_be_a_gradient() { assertThat(PatternValidator.isValid(custom("red"))).isFalse(); }

    // ── Injection ──
    @Test void blocks_url()           { assertThat(PatternValidator.isValid(custom("linear-gradient(red, url(x))"))).isFalse(); }
    @Test void blocks_expression()    { assertThat(PatternValidator.isValid(custom("expression(alert(1))"))).isFalse(); }
    @Test void blocks_javascript_uri(){ assertThat(PatternValidator.isValid(custom("javascript:alert(1)"))).isFalse(); }
    @Test void blocks_data_uri()      { assertThat(PatternValidator.isValid(custom("linear-gradient(red, data:x)"))).isFalse(); }
    @Test void blocks_import()        { assertThat(PatternValidator.isValid(custom("@import url(evil.css)"))).isFalse(); }
    @Test void blocks_html()          { assertThat(PatternValidator.isValid(custom("linear-gradient(<script>)"))).isFalse(); }
    @Test void blocks_backslash()     { assertThat(PatternValidator.isValid(custom("linear-gradient(\\0061 lert(1))"))).isFalse(); }
    @Test void blocks_semicolon()     { assertThat(PatternValidator.isValid(custom("linear-gradient(red, blue); background: red"))).isFalse(); }
    @Test void blocks_css_var()       { assertThat(PatternValidator.isValid(custom("linear-gradient(var(--secret))"))).isFalse(); }
    @Test void blocks_env()           { assertThat(PatternValidator.isValid(custom("linear-gradient(env(HOSTNAME))"))).isFalse(); }
    @Test void blocks_attr()          { assertThat(PatternValidator.isValid(custom("linear-gradient(attr(data-color))"))).isFalse(); }

    // ── Fields ──
    @Test void rejects_bad_bg_color() {
        assertThat(PatternValidator.isValid("{\"v\":2,\"pattern\":\"grid\",\"bgColor\":\"red;x\"}")).isFalse();
    }
    @Test void rejects_bad_pattern_color() {
        assertThat(PatternValidator.isValid("{\"v\":2,\"pattern\":\"grid\",\"colors\":[\"url(x)\"]}")).isFalse();
    }
    @Test void rejects_scale_out_of_range() {
        assertThat(PatternValidator.isValid("{\"v\":2,\"pattern\":\"grid\",\"scale\":50}")).isFalse();
    }
    @Test void rejects_too_long() {
        assertThat(PatternValidator.isValid(custom("linear-gradient(" + "a".repeat(2600) + ")"))).isFalse();
    }
}
