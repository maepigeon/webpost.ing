import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { GET_UNREAD_COUNT } from '../Pages/Posts/BasicTextPostServerApi.js';
import './Social.css';

/**
 * The navbar's Notifications button: a link to the notifications page, with
 * the unread count on it.
 *
 * Built like the Messages button, a link around a navButton, so it sizes the
 * same in the bar and in the menu. It used to open a dropdown preview in an
 * inline-block wrapper, which made it narrower than every other item in the
 * menu and meant one more click to reach the page.
 */
export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const location = useLocation();

  useEffect(() => {
    const fetchCount = () => GET_UNREAD_COUNT().then(d => setCount(d.count)).catch(() => {});
    fetchCount();
    const id = setInterval(fetchCount, 30000);
    return () => clearInterval(id);
  }, []);

  // Re-count on navigation, so reading notifications clears the badge.
  useEffect(() => {
    GET_UNREAD_COUNT().then(d => setCount(d.count)).catch(() => {});
  }, [location.pathname]);

  const active = location.pathname.startsWith('/inbox');
  // A link styled as a button, exactly as Navbutton renders one.
  return (
    <Link to="/inbox" className={`navButton navButton--purple${active ? ' navButton--active' : ''}`}>
      Notifications
      {count > 0 && <span className="notif-badge">{count > 99 ? '99+' : count}</span>}
    </Link>
  );
}
