package com.springbootprojects.webpostingserver;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;

/**
 * Refuses to start a test application context against anything but a test
 * database.
 *
 * Starting the context runs the migration runner, and the tests write rows, so
 * a test pointed at the development or production database changes it.
 * src/test/resources/config/application.properties points tests at
 * webposting_test, but an environment variable (SPRING_DATASOURCE_URL), a
 * system property or a test's own @TestPropertySource outranks that file.
 * This check runs after all of them are resolved and before any bean is
 * created.
 *
 * Registered in src/test/resources/META-INF/spring.factories, so it applies to
 * every @SpringBootTest without an annotation, and never to the real server.
 */
public class TestDatabaseGuard implements EnvironmentPostProcessor, Ordered {

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        String url = environment.getProperty("spring.datasource.url", "");
        String name = databaseName(url);
        String appDatabase = environment.getProperty("DB_NAME");

        if (!name.endsWith("_test") || name.equals(appDatabase))
            throw new IllegalStateException(
                    "Tests must run against a database whose name ends in _test, not '" + name + "' ("
                    + url + "). Set TEST_DB_NAME (default webposting_test) and create it with "
                    + "`createdb webposting_test`; see guide/MIGRATIONS.md.");
    }

    /** The database in a jdbc:postgresql://host:port/name?params URL. */
    static String databaseName(String url) {
        int query = url.indexOf('?');
        String path = query < 0 ? url : url.substring(0, query);
        return path.substring(path.lastIndexOf('/') + 1);
    }

    /** After the config files and every other property source are loaded. */
    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }
}
