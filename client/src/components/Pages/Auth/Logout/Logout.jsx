import React, { useEffect } from 'react';
import axios from 'axios';
import { BASE_URL as baseUrl } from '../../../../config.js';

function Logout() {
    useEffect(() => {LOGOUT_ATTEMPT()}, []);

    return (
        <h1>
            You have logged out.
        </h1>
    );
}

function LOGOUT_ATTEMPT() {
    console.log("attempting to logout");
    if (localStorage.getItem("userName") != null) {
    const promise = axios.post(baseUrl + "/api/logoutSessionAttempt");

    const dataPromise = promise.then(
        (response) => {
            console.log(response.data);
        })
      .catch(error => {
        console.log("Failed to log out user. " + error);
      });
      localStorage.removeItem("userName");
      localStorage.removeItem("isAdmin");
      window.location.reload();
    }
}

export default Logout;
