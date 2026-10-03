import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Navbutton from './Navbutton/Navbutton';
import '../Social/Social.css';
import { useOverflowItems } from '../../utils/useOverflowItems.js';
import Userdata from '../Pages/Auth/Userdata/Userdata';
import NotificationBell from '../Social/NotificationBell.jsx';
import './Navbar.css'
import { AUTHORIZE_SESSION, GET_UNREAD_MESSAGE_COUNT } from "../Pages/Posts/BasicTextPostServerApi"
import Icon from '../Icon/Icon.jsx';

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
  const active = useLocation().pathname.startsWith('/messages');
  if (!authorize()) return null;
  return (
    <Link to="/messages" className={`navButton navButton--purple${active ? ' navButton--active' : ''}${className ? ` ${className}` : ''}`}>
      Messages
      {/* Inline after the label, the same badge the Notifications button uses. */}
      {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
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

  // Close the menu when the page changes: the Navbar stays mounted across
  // pages, so closing it only on mount left it open over the new page.
  const { pathname } = useLocation();
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  /**
   * Ordered most-used first, because that is the order they survive in as the
   * window narrows. Log In leads when signed out; New Post when signed in.
   */
  const overflowItems = loggedIn
    ? [
        { key: 'home',     node: <Navbutton label="Home" route="/" variant="yellow" /> },
        { key: 'new',      node: <Navbutton label="New Post" route="/editor" variant="green" /> },
        { key: 'following', node: <Navbutton label="Following" route="/following" variant="teal" /> },
        { key: 'search',   node: <Navbutton label="Search" route="/search" variant="teal" /> },
        { key: 'messages', node: <MessagesBell /> },
        { key: 'notifs',   node: <NotificationBell /> },
        { key: 'profile',  node: <Navbutton label="My Profile" route={`/${username}`} variant="purple" /> },
        { key: 'activity', node: <Navbutton label="Activity" route={`/activity/${username}`} variant="purple" /> },
        { key: 'settings', node: <Navbutton label="Settings" route="/settings" variant="purple" /> },
        ...(isAdmin ? [{ key: 'admin', node: <Navbutton label="Admin" route="/routes/AdminPanel" variant="blue" /> }] : []),
        { key: 'logout',   node: <Navbutton label="Log Out" route="/routes/Logout" variant="orange" /> },
      ]
    : [
        { key: 'login',  node: <Navbutton label="Log In" route="/routes/Login" variant="orange" /> },
        { key: 'home',   node: <Navbutton label="Home" route="/" variant="yellow" /> },
        { key: 'search', node: <Navbutton label="Search" route="/search" variant="teal" /> },
      ];

  const { containerRef, measureRef, visibleCount } = useOverflowItems(overflowItems.length, { centered: true });
  const hiddenItems = overflowItems.slice(visibleCount);

  return (
    <nav className="navBar" ref={containerRef}>

      {/* ── Everything that fits, then the rest in a menu ── */}
      {/* Measured off-screen once so the split is based on real widths rather
          than a breakpoint that cannot know how wide these labels are. */}
      <span className="nav-measure" ref={measureRef} aria-hidden="true">
        {overflowItems.map(item => <span key={`m-${item.key}`}>{item.node}</span>)}
      </span>

      <span className="nav-items">
        {overflowItems.slice(0, visibleCount).map(item => (
          <span className="nav-item" key={item.key}>{item.node}</span>
        ))}
      </span>

      <span className="nav-fixed" data-overflow-fixed="true">
        <Userdata />

        {!loggedIn && (
          <span className="nav-mobile-login">
            <Navbutton label="Log In" route="/routes/Login" />
          </span>
        )}

        {hiddenItems.length > 0 && (
          <div className="nav-hamburger-wrap" ref={menuRef}>
            <button
              className="nav-hamburger-btn"
              onClick={() => setMenuOpen(o => !o)}
              aria-label={`Menu: ${hiddenItems.length} more`}
              title="Menu"
              aria-expanded={menuOpen}
            >
              <span className="nav-hamburger-icon"><span /><span /><span /></span>
            </button>

            {menuOpen && (
              <div className="nav-mobile-popup" role="dialog" aria-modal="true">
                <button className="nav-mobile-popup-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><Icon name="close" size={16} /></button>
                {loggedIn && <div className="nav-mobile-popup-welcome">Welcome, {username}</div>}
                <div className="nav-mobile-popup-items">
                  {hiddenItems.map(item => (
                    <span className="nav-popup-item" key={`o-${item.key}`}>{item.node}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </span>
    </nav>
  );
}

export default Navbar;
