import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Navbutton from './Navbutton/Navbutton';
import Userdata from '../Pages/Auth/Userdata/Userdata';
import NotificationBell from '../Social/NotificationBell.jsx';
import './Navbar.css'
import { AUTHORIZE_SESSION, GET_UNREAD_MESSAGE_COUNT } from "../Pages/Posts/BasicTextPostServerApi"

function authorize() {
  const username = localStorage.getItem("userName");
  return (username != null && username != "" && AUTHORIZE_SESSION());
}

function MessagesBell({ className }) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!authorize()) return;
    GET_UNREAD_MESSAGE_COUNT().then(d => setUnread(d?.count || 0)).catch(() => {});
    const id = setInterval(() => {
      GET_UNREAD_MESSAGE_COUNT().then(d => setUnread(d?.count || 0)).catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, []);
  if (!authorize()) return null;
  return (
    <Link to="/messages" style={{ position: 'relative', display: 'inline-flex', textDecoration: 'none' }} className={className}>
      <button className="navButton navButton--purple" style={{ position: 'relative' }}>
        Messages
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -6, right: -6,
            background: '#d32f2f', color: '#fff',
            borderRadius: 10, fontSize: 10, padding: '1px 5px', fontWeight: 700,
            pointerEvents: 'none',
          }}>{unread}</span>
        )}
      </button>
    </Link>
  );
}

function Navbar() {
  const loggedIn = authorize();
  const username = localStorage.getItem("userName");
  const isAdmin = localStorage.getItem("isAdmin") === "1";

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close popup when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Close popup on route change
  useEffect(() => { setMenuOpen(false); }, []);

  return (
    <nav className="navBar">
      {/* ── Always-visible items ── */}
      <Navbutton label="Home" route="/" variant="yellow" />
      {loggedIn && <Navbutton label="New Post" route="/editor" />}
      <Navbutton label="Search" route="/search" variant="teal" />

      {/* ── Desktop-only items ── */}
      <span className="nav-desktop-group">
        {!loggedIn && <Navbutton label="Log In" route="/routes/Login" />}
        {loggedIn && (
          <>
            <Navbutton label="My Profile" route={`/users/${username}`} variant="purple" />
            <Navbutton label="Activity" route={`/activity/${username}`} variant="purple" />
            <MessagesBell />
            <NotificationBell />
            <Navbutton label="Log Out" route="/routes/Logout" variant="orange" />
            {isAdmin && <Navbutton label="Admin" route="/routes/AdminPanel" variant="blue" />}
          </>
        )}
        <Userdata />
      </span>

      {/* ── Mobile: Log In button when logged out ── */}
      {!loggedIn && (
        <span className="nav-mobile-login">
          <Navbutton label="Log In" route="/routes/Login" />
        </span>
      )}

      {/* ── Mobile hamburger (logged-in only) ── */}
      {loggedIn && (
        <div className="nav-hamburger-wrap" ref={menuRef}>
          <button
            className="nav-hamburger-btn"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menu"
          >
            <span className="nav-hamburger-icon">
              <span />
              <span />
              <span />
            </span>
          </button>

          {menuOpen && (
            <div className="nav-mobile-popup" role="dialog" aria-modal="true">
              <button className="nav-mobile-popup-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">✕</button>
              <div className="nav-mobile-popup-welcome">Welcome, {username}!</div>
              <div className="nav-mobile-popup-items">
                <Navbutton label="My Profile" route={`/users/${username}`} variant="purple" />
                <Navbutton label="Activity" route={`/activity/${username}`} variant="purple" />
                <Navbutton label="Messages" route="/messages" variant="purple" />
                <Navbutton label="Notifications" route="/inbox" variant="purple" />
                <Navbutton label="Log Out" route="/routes/Logout" variant="orange" />
                {isAdmin && <Navbutton label="Admin" route="/routes/AdminPanel" variant="blue" />}
                <Userdata />
              </div>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

export default Navbar;
