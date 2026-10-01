package com.springbootprojects.webpostingserver.config;

import com.zaxxer.hikari.HikariDataSource;
import org.newsclub.net.unix.AFUNIXSocketFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Connects to a PostgreSQL on the same machine through its Unix socket, when
 * DB_SOCKET (app.db.socket) names the socket's directory.
 *
 * Over the socket PostgreSQL can use peer authentication: it trusts the
 * operating-system user the server runs as, so there is no database password
 * to keep in a file, paste anywhere or leak. Over TCP, the default, a
 * password is needed. tools/server/use-passwordless-db.sh switches a server
 * over.
 *
 * The driver cannot open Unix sockets itself; junixsocket's factory does it,
 * named in the URL. The URL is built here rather than written in deploy.env
 * because the factory's class name contains a '$', which a shell would eat.
 */
@Configuration
@ConditionalOnExpression("'${app.db.socket:}' != ''")
public class DatabaseSocketConfig {

    private static final Logger log = LoggerFactory.getLogger(DatabaseSocketConfig.class);

    /** The JDBC URL for a database reached through the socket in socketDir. */
    static String socketUrl(String socketDir, int port, String database) {
        String socket = socketDir.replaceAll("/+$", "") + "/.s.PGSQL." + port;
        // "localhost" is required by the URL syntax and otherwise unused.
        return "jdbc:postgresql://localhost/" + database
                + "?socketFactory=" + AFUNIXSocketFactory.FactoryArg.class.getName()
                + "&socketFactoryArg=" + socket
                + "&sslmode=disable";
    }

    @Bean
    @ConfigurationProperties("spring.datasource.hikari")
    public HikariDataSource dataSource(DataSourceProperties properties,
                                       @Value("${app.db.socket}") String socketDir,
                                       @Value("${app.db.port:5432}") int port,
                                       @Value("${app.db.name}") String database) {
        properties.setUrl(socketUrl(socketDir, port, database));
        log.info("Connecting to database {} through the socket in {}", database, socketDir);
        return properties.initializeDataSourceBuilder().type(HikariDataSource.class).build();
    }
}
