import { Link, useLocation } from 'react-router-dom';
import './Navbutton.css'

function Navbutton(props) {
    const location = useLocation();
    const isActive = props.route === '/'
        ? location.pathname === '/'
        : location.pathname.startsWith(props.route);
    const cls = [
        'navButton',
        props.variant ? `navButton--${props.variant}` : '',
        isActive ? 'navButton--active' : '',
    ].filter(Boolean).join(' ');
    // A link styled as a button, not a button inside a link: nested, they
    // were two tab stops and confused screen readers (and are invalid HTML).
    return <Link to={props.route} className={cls}>{props.label}</Link>;
}

export default Navbutton;
