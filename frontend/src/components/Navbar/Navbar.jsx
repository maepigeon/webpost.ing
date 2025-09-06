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
  if (authorize()) {
    return <Navbutton label={"My Profile"} route={"/routes/PostsViewer/"+username} />
  }
}

function LogoutPlugin() {
  if (authorize()) {
    return <Navbutton label={"Log Out"} route={"/routes/Logout"} />
  }
}

function NewPost() {
  if (authorize()) {
    return   <Navbutton label={"New Post"} route={"/routes/RichTextEditor"} />
  }
}
function Login() {
  if (!authorize()) {
    return   <Navbutton label={"Log In"} route={"/routes/Login"} />
  }
}

function Navbar() {

  return (
    <nav className="navBar">
      <Userdata></Userdata>
      <Login/>
      <LogoutPlugin />
      <Navbutton label={"Home"} route={"/"} />
      <PostViewerPlugin />
      <NewPost />
    </nav>
  );
}

export default Navbar;