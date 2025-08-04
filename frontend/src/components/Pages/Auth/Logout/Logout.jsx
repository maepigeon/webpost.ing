import React, { useEffect } from 'react';
import axios from 'axios';


function Logout() {
    useEffect(() => {LOGOUT_ATTEMPT()}, []);

    return (
        <h1>
            You have logged out.
        </h1>
    );
}

function LOGOUT_ATTEMPT() {
    axios.defaults.withCredentials = true
    console.log("attempting to logout");
    if (localStorage.getItem("userName") != null) {
    const promise = axios.post("http://localhost:8080/api/logoutSessionAttempt");

    const dataPromise = promise.then(
        (response) => {
            localStorage.removeItem("userName");
            console.log(response.data);
            window.location.reload();
        })
      .catch(error => {
        console.log("Failed to log out user. " + error);
      });
    }
}

export default Logout;