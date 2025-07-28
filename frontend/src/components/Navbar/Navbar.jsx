import React from 'react';
import Navbutton from './Navbutton/Navbutton';
import './Navbar.css'

function Navbar() {
  return (
    <nav className="navBar">
      <Navbutton label={"Home"} route={"/"} />
      <Navbutton label={"<User>'s profile"} route={"/routes/UserSettingsEditor"} />
      <Navbutton label={"Your profile"} route={"/routes/UserSettingsEditor"} />

      <Navbutton label={"Edit Post"} route={"/routes/ProfileEditor"} />
      <Navbutton label={"Read Post"} route={"/routes/ProfileViewer"} />
      <br></br>
      <p>Welcome, Guest </p>
      <Navbutton label={"Select User"} route={"/routes/Login"} />
      <Navbutton label={"Log out"} route={"/routes/Logout"} />
      <br></br>

      <Navbutton label={"Edit Post (old)"} route={"/routes/PostEditor"} />
      <Navbutton label={"User profile (logged in) - old"} route={"/routes/PostsViewer"} />



      <Navbutton label={"adminPanel"} route={"/routes/AdminPanel"} />
      <Navbutton label={"Test - remove"} route={"/routes/Test"} />
    </nav>
  );
}

export default Navbar;