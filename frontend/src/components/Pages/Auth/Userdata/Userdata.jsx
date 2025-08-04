import './Userdata.css'
import React from "react";

const Username = () => {
  return (
    <span>
        <p className="username">Welcome, {getUsername()} </p>
    </span>
  );
};

function getUsername() {
    var username = localStorage.getItem("userName");
    return ((username == null || username == "") ? "Guest" : username);
}

export default Username