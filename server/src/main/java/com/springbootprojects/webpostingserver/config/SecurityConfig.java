package com.springbootprojects.webpostingserver.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

/**
 * Web security configuration.
 *
 * Authentication is enforced per-endpoint in the controllers (each reads the
 * username/authToken cookie pair and calls JdbcLoginRepository.authorize), not
 * by a Spring Security filter, so the filter chain itself permits every request
 * and exists mainly to configure CORS and the security response headers.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    /**
     * Origins allowed to call the API with credentials, from the
     * app.allowed-origins property (ALLOWED_ORIGINS in the environment).
     *
     * This must never be "*" — the API uses credentialed requests, and a
     * wildcard origin combined with allowCredentials(true) is rejected by
     * browsers and would be a cross-site data leak if it were not.
     */
    @Value("${app.allowed-origins:http://localhost:5173}")
    private String allowedOrigins;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        List<String> origins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty() && !s.equals("*"))
                .toList();

        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(origins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Content-Type", "Accept", "X-Requested-With"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            // CSRF tokens are not used. The protection instead comes from the
            // session cookies being SameSite=Lax, which stops a third-party site
            // from making a credentialed state-changing request at all. If a
            // deployment ever needs cookies sent cross-site, SameSite must go
            // back to None *and* real CSRF tokens must be enabled here.
            .csrf(csrf -> csrf.disable())
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .headers(headers -> headers
                .frameOptions(frame -> frame.deny())
                .contentTypeOptions(opts -> {})
                .referrerPolicy(ref -> ref.policy(
                        org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter
                                .ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
            )
            .authorizeHttpRequests(auth -> auth
                .anyRequest().permitAll()
            );
        return http.build();
    }
}
