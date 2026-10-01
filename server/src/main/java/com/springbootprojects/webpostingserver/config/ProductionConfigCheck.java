package com.springbootprojects.webpostingserver.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import java.util.ArrayList;
import java.util.List;

/**
 * Refuses to start a production server that is misconfigured.
 *
 * Every setting has a development default so a fresh clone runs with no
 * configuration at all. That is right for development and dangerous in
 * production: start the JAR without sourcing deploy.env and the server comes up
 * happily pointed at a local `testdb` with the password "password", serving an
 * empty site over what looks like a successful deploy.
 *
 * Failing at startup turns that into an obvious error with a fixable message,
 * which is much better than a running server holding the wrong data.
 *
 * Only active under the `prod` profile — development is meant to work
 * unconfigured.
 */
@Configuration
@Profile("prod")
public class ProductionConfigCheck {

    private static final Logger log = LoggerFactory.getLogger(ProductionConfigCheck.class);

    @Value("${spring.datasource.url:}")        private String datasourceUrl;
    @Value("${spring.datasource.password:}")   private String datasourcePassword;
    @Value("${app.allowed-origins:}")          private String allowedOrigins;
    @Value("${app.upload-dir:}")               private String uploadDir;
    @Value("${app.base-url:}")                 private String baseUrl;
    @Value("${app.mail.enabled:false}")        private boolean mailEnabled;
    @Value("${spring.mail.host:}")             private String mailHost;
    @Value("${app.db.socket:}")                private String dbSocket;

    @PostConstruct
    public void verify() {
        List<String> fatal = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        // No password is fine over the local socket (peer authentication):
        // there is then no password anywhere to leak. Over TCP one is needed,
        // and "password" is the old development default.
        if (dbSocket.isBlank() && (datasourcePassword.isBlank() || datasourcePassword.equals("password")))
            fatal.add("No database password, and no DB_SOCKET. Set DB_SOCKET for passwordless local access, or DB_PASSWORD. Did you source deploy.env?");

        if (datasourceUrl.contains("/testdb"))
            fatal.add("DB_NAME is still 'testdb', the development database. Set DB_NAME in deploy.env.");

        if (allowedOrigins.isBlank() || allowedOrigins.contains("localhost"))
            fatal.add("ALLOWED_ORIGINS is unset or points at localhost. Set it to the public origin, e.g. https://webpost.ing.");

        if (!uploadDir.startsWith("/"))
            fatal.add("UPLOAD_DIR must be an absolute path in production, so uploads do not depend on the working directory. Got: " + uploadDir);

        if (baseUrl.isBlank() || baseUrl.contains("localhost"))
            warnings.add("APP_BASE_URL points at localhost. Links inside emails will not be openable.");

        if (mailEnabled && mailHost.isBlank())
            fatal.add("MAIL_ENABLED is true but MAIL_HOST is unset, so every send would fail.");

        warnings.forEach(w -> log.warn("Configuration warning: {}", w));

        if (!fatal.isEmpty()) {
            String message = "Refusing to start: this production configuration is incomplete.\n  - "
                    + String.join("\n  - ", fatal)
                    + "\n\nSee guide/CONFIGURATION.md. The usual cause is starting the JAR without\n"
                    + "sourcing deploy.env:\n\n    set -a; . ./deploy.env; set +a\n    java -jar server-0.0.1-SNAPSHOT.jar\n";
            log.error(message);
            throw new IllegalStateException(message);
        }

        log.info("Production configuration checks passed.");
    }
}
