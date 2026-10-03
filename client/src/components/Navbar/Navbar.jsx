import { useLocation } from 'react-router-dom';
import Navbutton from './Navbutton/Navbutton';
import NavMenu from './NavMenu.jsx';
import Userdata from '../Pages/Auth/Userdata/Userdata';
import { useBarFit } from './useBarFit.js';
import { useUnreadCounts } from './useUnreadCounts.js';
import './Navbar.css'
import { AUTHORIZE_SESSION } from "../Pages/Posts/BasicTextPostServerApi"

function authorize() {
  const username = localStorage.getItem("userName");
  return (username != null && username != "" && AUTHORIZE_SESSION());
}

function Navbar() {
  const loggedIn = authorize();
  const username = localStorage.getItem("userName");
  const isAdmin = localStorage.getItem("isAdmin") === "1";
  const { pathname } = useLocation();
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
