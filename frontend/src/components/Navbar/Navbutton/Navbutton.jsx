import React from 'react';
import { BrowserRouter as Router, Link } from 'react-router-dom';
import './Navbutton.css'

function Navbutton(props) {
    return (
    <Link to={props.route}>
        <button className="navButton">
          { props.label}
        </button>
    </Link>);
}

export default Navbutton;