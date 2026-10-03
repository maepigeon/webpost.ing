import './Userdata.css'

/** The face of the account button: the user's initial and name. */
const Username = () => {
  const username = localStorage.getItem("userName") || "";
  return (
    <>
      <span className="nav-avatar squircle" aria-hidden="true">{username.charAt(0).toUpperCase()}</span>
      <span className="username">{username}</span>
    </>
  );
};

export default Username
