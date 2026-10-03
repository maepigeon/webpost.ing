import { Link, useLocation } from 'react-router-dom';
import { isActiveRoute } from '../overflow.js';
import './Navbutton.css'

/** A link drawn as a pill. `badge` is an unread count, shown after the label. */
function Navbutton(props) {
    const location = useLocation();
    const isActive = isActiveRoute(location.pathname, props.route);
    const cls = [
        'navButton',
        props.variant ? `navButton--${props.variant}` : '',
        isActive ? 'navButton--active' : '',
    ].filter(Boolean).join(' ');
    // A link styled as a button, not a button inside a link: nested, they
    // were two tab stops and confused screen readers (and are invalid HTML).
    return (
        <Link to={props.route} className={cls} aria-current={isActive ? 'page' : undefined}>
            {props.label}
            {props.badge > 0 && <span className="nav-badge">{props.badge > 99 ? '99+' : props.badge}</span>}
        </Link>
    );
}

export default Navbutton;
