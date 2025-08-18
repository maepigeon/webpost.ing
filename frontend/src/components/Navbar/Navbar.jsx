import React from 'react';
import Navbutton from './Navbutton/Navbutton';
import Userdata from '../Pages/Auth/Userdata/Userdata';
import './Navbar.css'
import {AUTHORIZE_SESSION} from "../Pages/Posts/BasicTextPostServerApi"

function authorize() {
  const username = localStorage.getItem("userName");
  return (username != null && username != "" && AUTHORIZE_SESSION());
}

function PostViewerPlugin() {
  const username = localStorage.getItem("userName");
  if (authorize) {
    return <Navbutton label={"My Profile"} route={"/routes/PostsViewer/"+username} />
  }
}

function LogoutPlugin() {
  if (authorize()) {
    return <Navbutton label={"Log Out"} route={"/routes/Logout"} />
  }
}

function Navbar() {

  return (
    <nav className="navBar">
      <Navbutton label={"Home"} route={"/"} />
      <Navbutton label={"<User>'s Profile"} route={"/routes/PostsViewer"} />
      <PostViewerPlugin />

      <Navbutton label={"Edit Post"} route={"/routes/RichTextEditor"} />
      <Navbutton label={"Read Post"} route={"/routes/RichTextViewer"} />
      <br>
      </br>
      <Userdata></Userdata>
      
      <Navbutton label={"Log In"} route={"/routes/Login"} />
      <LogoutPlugin />
    </nav>
  );
}

export default Navbar;