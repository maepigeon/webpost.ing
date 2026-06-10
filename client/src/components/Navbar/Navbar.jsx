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
    return <Navbutton label={"My Profile"} route={"/users/"+username} variant="purple" />
  }
}

function LogoutPlugin() {
  if (authorize()) {
    return <Navbutton label={"Log Out"} route={"/routes/Logout"} variant="orange" />
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
  if (!authorize() || localStorage.getItem("isAdmin") !== "1") return null;
  return <Navbutton label={"Admin"} route={"/routes/AdminPanel"} variant="blue" />;
}

function ActivityLink() {
  const username = localStorage.getItem("userName");
  if (!authorize() || !username) return null;
  return <Navbutton label={"Activity"} route={`/activity/${username}`} variant="purple" />;
}

function Navbar() {
  const loggedIn = authorize();
  return (
    <nav className="navBar">
      <Userdata />
      <Login />
      <LogoutPlugin />
      <Navbutton label={"Home"} route={"/"} variant="yellow" />
      <NewPost />
      {loggedIn && (
        <span className="navGroup">
          <PostViewerPlugin />
          <ActivityLink />
          <NotificationBell />
        </span>
      )}
      <AdminPlugin />
      <Navbutton label={"Search"} route={"/search"} variant="teal" />
    </nav>
  );
}

export default Navbar;
