package com.springbootprojects.webpostingserver.posts.service;

import java.io.IOException;
import java.util.Map;

/**
 * The two network calls single sign-on makes to a provider: exchanging the
 * code for tokens, and fetching the provider's public keys. An interface so
 * tests stand in for Google and Microsoft without a network.
 */
public interface SsoHttp {

    record Response(int status, String body) { }

    /** POSTs a form (application/x-www-form-urlencoded) and returns the answer, whatever its status. */
    Response postForm(String url, Map<String, String> form) throws IOException;

    /** GETs a URL and returns the answer, whatever its status. */
    Response get(String url) throws IOException;
}
