package com.springbootprojects.webpostingserver;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

// Email is sent on a background executor: an SMTP handshake can take seconds,
// and no user action should wait on one. See EmailService.
@EnableAsync
@SpringBootApplication
public class WebpostingServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(WebpostingServerApplication.class, args);
    }

}
