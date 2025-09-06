package com.springbootprojects.webpostingserver.posts.model;

//import java.sql.Timestamp;
import org.springframework.http.HttpStatus;

import java.util.Date;

/**
 * Represents the user's authentication date
 * Metadata, namely only the time stamp if available is also provided here.
 */
public class LoginInfo {

    private int id;
    private String username;
    private String password;
    private Date date;

    public LoginInfo() {

    }

    public boolean compareUsername(String username) {
        return this.username.equals(username);
    }


    public void setId(int id) {this.id = id;}


    public String getUsername() {
        return username ;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public Date getDate() {
        return date;
    }

    public void setDate(Date date) {
        this.date = date;
    }


    @Override
    public String toString() {
        return "LoginInfo [username=" + username + ", password=" + password + ", timestamp=" + date +  "]";
    }

    public int getID() {
        return id;
    }
}