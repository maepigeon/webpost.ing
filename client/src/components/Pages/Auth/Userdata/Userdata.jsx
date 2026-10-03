import { Link } from 'react-router-dom';
import './Userdata.css'

/** "Welcome, <name>" in the bar; for someone signed in it opens their profile. */
const Username = () => {
  const username = localStorage.getItem("userName");
  if (!username) return <span><p className="username">Welcome, Guest</p></span>;
  return (
    <Link to={`/${username}`} className="username-link" title="Your profile">
      <p className="username">Welcome, {username}</p>
    </Link>
  );
};

export default Username
