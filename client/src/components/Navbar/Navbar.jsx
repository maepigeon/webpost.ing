import { useEffect, useReducer } from 'react';
import { useLocation } from 'react-router-dom';
import Navbutton from './Navbutton/Navbutton';
import NavMenu from './NavMenu.jsx';
import Userdata from '../Pages/Auth/Userdata/Userdata';
import { useBarFit } from './useBarFit.js';
import { useUnreadCounts } from './useUnreadCounts.js';
import './Navbar.css'
import { AUTHORIZE_SESSION } from "../Pages/Posts/BasicTextPostServerApi"

/**
 * Who the browser says is signed in, re-read when the session is cleared. On the
 * sign-in pages a 401 clears the stored name without a reload, and localStorage
 * tells no one in its own tab, so the bar kept the old account menu.
 */
export function useSignedIn(pathname) {
  const [, refresh] = useReducer(n => n + 1, 0);
  const username = localStorage.getItem("userName") || "";
  useEffect(() => {
    window.addEventListener('wp:session-cleared', refresh);   // sent by clearLocalSession
    window.addEventListener('storage', refresh);   // another tab signing in or out
    return () => {
      window.removeEventListener('wp:session-cleared', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  // Asks the server (shared, cached 30 s). The 401 interceptor clears the name
  // before this catch runs, so the re-read sees it.
  useEffect(() => {
    if (username) AUTHORIZE_SESSION().catch(refresh);
  }, [username, pathname]);
  return username;
}

function Navbar() {
  const { pathname } = useLocation();
  const username = useSignedIn(pathname);
  const loggedIn = username !== "";
  const isAdmin = localStorage.getItem("isAdmin") === "1";
  const unread = useUnreadCounts(loggedIn, pathname);

  /**
   * What lives on the bar, in bar order. `priority` decides who goes into More
   * first when it is too narrow (lowest first): Discover, Following, Notifications,
   * Messages, Search. Account things are not here; they have their own menu.
   */
  const items = loggedIn
    ? [
        { key: 'home',      label: 'Home',          route: '/',          priority: 100 },
        { key: 'new',       label: 'New Post',      route: '/editor',    priority: 90 },
        { key: 'following', label: 'Following',     route: '/following', priority: 10 },
        { key: 'discover',  label: 'Discover',      route: '/discover',  priority: 15 },
        { key: 'search',    label: 'Search',        route: '/search',    priority: 40 },
        { key: 'messages',  label: 'Messages',      route: '/messages',  priority: 30, badge: unread.messages },
        { key: 'notifs',    label: 'Notifications', route: '/inbox',     priority: 20, badge: unread.notifications },
      ]
    : [
        { key: 'home',   label: 'Home',    route: '/',                  priority: 100 },
        { key: 'search', label: 'Search',  route: '/search',            priority: 80 },
        { key: 'login',  label: 'Log In',  route: '/routes/Login',      priority: 90 },
        { key: 'signup', label: 'Sign up', route: '/routes/NewAccount', priority: 70 },
      ];

  const accountItems = [
    { key: 'profile',  label: 'My Profile', route: `/${username}` },
    { key: 'activity', label: 'Activity',   route: `/activity/${username}` },
    { key: 'settings', label: 'Settings',   route: '/settings' },
    ...(isAdmin ? [{ key: 'admin', label: 'Admin', route: '/routes/AdminPanel' }] : []),
    { key: 'logout',   label: 'Log Out',    route: '/routes/Logout', separated: true },
  ];

  const { barRef, measureRef, accountRef, hiddenKeys } = useBarFit(items);
  const visible = items.filter(i => !hiddenKeys.includes(i.key));
  const hidden = items.filter(i => hiddenKeys.includes(i.key));
  const moreUnread = hidden.some(i => i.badge > 0);

  return (
    <nav className="navBar" ref={barRef} aria-label="Main">
      {/* Measured off-screen so the split is based on real widths. The last
          child is a copy of the More button. */}
      <span className="nav-measure" ref={measureRef} aria-hidden="true">
        {items.map(i => <span key={i.key}><Navbutton label={i.label} route={i.route} badge={i.badge} /></span>)}
        <span><span className="navButton nav-menu-btn">More<span className="nav-chevron" /></span></span>
      </span>

      <span className="nav-items">
        {visible.map(i => (
          <span className="nav-item" key={i.key}>
            <Navbutton label={i.label} route={i.route} badge={i.badge} />
          </span>
        ))}
        {hidden.length > 0 && (
          <span className="nav-item">
            <NavMenu
              label="More"
              items={hidden}
              dot={moreUnread}
              ariaLabel={moreUnread ? 'More, with unread items' : 'More'}
            />
          </span>
        )}
      </span>

      {loggedIn && (
        <span className="nav-account" ref={accountRef}>
          <NavMenu
            className="nav-account-btn"
            label={<Userdata />}
            items={accountItems}
            ariaLabel={`Account menu for ${username}`}
          />
        </span>
      )}
    </nav>
  );
}

export default Navbar;
