import React from 'react';
import { BrowserRouter as Router, Link } from 'react-router-dom';
import './Navbutton.css'

function Navbutton(props) {
    const cls = ['navButton', props.variant ? `navButton--${props.variant}` : ''].filter(Boolean).join(' ');
    return (
    <Link to={props.route}>
        <button className={cls}>
          { props.label}
        </button>
    </Link>);
}

export default Navbutton;
