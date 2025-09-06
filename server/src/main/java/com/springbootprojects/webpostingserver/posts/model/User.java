package com.springbootprojects.webpostingserver.posts.model;

//import java.sql.Timestamp;
import org.springframework.http.HttpStatus;

import java.util.Date;

/**
 * Represents the user data, excluding password
 */
public class User {

    private String userid;
    private String username;
    private Date registrationDate;

    public User(String userid, String username, Date registrationDate) {
        this.userid = userid;
        this.username = username;
        this.registrationDate = registrationDate;
    }

    public User() {
        this.userid = "-1";
        this.username = "Error retrieving user";
        this.registrationDate = new Date();
    }


    public void setUserId(String id) {this.userid = id;}


    public String getUsername() {
        return username ;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public Date getRegistrationDate() {
        return registrationDate;
    }

    public void setDate(Date registrationDate) {
        this.registrationDate = registrationDate;
    }


    @Override
    public String toString() {
        return "LoginInfo [userid=" + userid + ", username=" + username + ", timestamp=" + registrationDate + "]";
    }

    public String getUserid() {
        return userid;
    }
}