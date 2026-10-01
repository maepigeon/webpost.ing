package com.springbootprojects.webpostingserver;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

class DatabaseSocketConfigTest {

    private static String url(String dir, int port, String db) throws Exception {
        Class<?> c = Class.forName("com.springbootprojects.webpostingserver.config.DatabaseSocketConfig");
        Method m = c.getDeclaredMethod("socketUrl", String.class, int.class, String.class);
        m.setAccessible(true);
        return (String) m.invoke(null, dir, port, db);
    }

    @Test
    void buildsAUrlThroughTheSocketFile() throws Exception {
        assertThat(url("/var/run/postgresql/", 5432, "blog"))
                .isEqualTo("jdbc:postgresql://localhost/blog"
                        + "?socketFactory=org.newsclub.net.unix.AFUNIXSocketFactory$FactoryArg"
                        + "&socketFactoryArg=/var/run/postgresql/.s.PGSQL.5432&sslmode=disable");
    }

    @Test
    void usesThePortInTheSocketName() throws Exception {
        assertThat(url("/tmp", 5433, "x")).contains("socketFactoryArg=/tmp/.s.PGSQL.5433");
    }
}
