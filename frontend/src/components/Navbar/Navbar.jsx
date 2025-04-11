import React from 'react';
import Navbutton from './Navbutton/Navbutton';
import './Navbar.css'

function Navbar() {
  return (
    <nav className="navBar">
      <Navbutton label={"home"} route={"/"} />
      <Navbutton label={"viewPosts"} route={"/routes/PostsViewer"} />
      <Navbutton label={"editPost"} route={"/routes/PostEditor"} />
      <Navbutton label={"editProfile"} route={"/routes/ProfileEditor"} />
      <Navbutton label={"readProfile"} route={"/routes/ProfileViewer"} />
      <Navbutton label={"editSettings"} route={"/routes/UserSettingsEditor"} />
      <Navbutton label={"newAccount"} route={"/routes/NewAccount"} />
      <Navbutton label={"login"} route={"/routes/Login"} />
      <Navbutton label={"logout"} route={"/routes/Logout"} />
      <Navbutton label={"adminPanel"} route={"/routes/AdminPanel"} />
      <Navbutton label={"Test"} route={"/routes/Test"} />
    </nav>
  );
}

export default Navbar;