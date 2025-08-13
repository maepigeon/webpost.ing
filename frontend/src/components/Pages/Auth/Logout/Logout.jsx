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
    console.log("attempting to logout");
    if (localStorage.getItem("userName") != null) {
    const promise = axios.post("http://localhost:8080/api/logoutSessionAttempt");

    const dataPromise = promise.then(
        (response) => {
            console.log(response.data);
        })
      .catch(error => {
        console.log("Failed to log out user. " + error);
      });
      localStorage.removeItem("userName");
      window.location.reload();
    }
}

export default Logout;