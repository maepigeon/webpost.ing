import React from 'react';
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
    return (
        <Link to={props.route}>
            <button className={cls}>{props.label}</button>
        </Link>
    );
}

export default Navbutton;
