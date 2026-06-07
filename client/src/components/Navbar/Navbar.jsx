import React from 'react';
import Navbutton from './Navbutton/Navbutton';
import Userdata from '../Pages/Auth/Userdata/Userdata';
import NotificationBell from '../Social/NotificationBell.jsx';
import './Navbar.css'
import { AUTHORIZE_SESSION } from "../Pages/Posts/BasicTextPostServerApi"

function authorize() {
  const username = localStorage.getItem("userName");
  return (username != null && username != "" && AUTHORIZE_SESSION());
}

function PostViewerPlugin() {
  const username = localStorage.getItem("userName");
  if (authorize()) {
    return <Navbutton label={"My Profile"} route={"/users/"+username} variant="orange" />
  }
}

function LogoutPlugin() {
  if (authorize()) {
    return <Navbutton label={"Log Out"} route={"/routes/Logout"} variant="yellow" />
  }
}

function NewPost() {
  if (authorize()) {
    return <Navbutton label={"New Post"} route={"/editor"} />
  }
}

function Login() {
  if (!authorize()) {
    return <Navbutton label={"Log In"} route={"/routes/Login"} />
  }
}

function AdminPlugin() {
  if (localStorage.getItem("isAdmin") !== "1") return null;
  return <Navbutton label={"Admin"} route={"/routes/AdminPanel"} variant="blue" />;
}

function Navbar() {
  return (
    <nav className="navBar">
      <Userdata />
      <Login />
      <LogoutPlugin />
      <Navbutton label={"Home"} route={"/"} variant="orange" />
      <PostViewerPlugin />
      <NewPost />
      <AdminPlugin />
      {authorize() && <NotificationBell />}
    </nav>
  );
}

export default Navbar;
