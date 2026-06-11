import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './Login.css';
import { BASE_URL as baseUrl } from '../../../../config.js';
import { ADMIN_GET_STATUS } from '../../Posts/BasicTextPostServerApi.js';


function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    // Basic validation (replace with your actual authentication logic)
    if (username === '' || password === '') {
      setError('Please fill in all the fields and try again.');
      return;
    }
    // Send login request to your backend here 
    LOGIN_ATTEMPT(username, password);
  };
  function LOGIN_ATTEMPT(username, password) {
    const promise = axios.post(baseUrl + "/api/loginSessionAttempt",
    {
      username: username,
      password: password
    },
    {
        withCredentials: true
    });
    const dataPromise = promise.then(
      (response) => {
        localStorage.setItem("userName", username);
        ADMIN_GET_STATUS()
          .then(d => localStorage.setItem("isAdmin", d.isAdmin ? "1" : "0"))
          .catch(() => localStorage.setItem("isAdmin", "0"))
          .finally(() => { window.location.href = "./PostsViewer/"+username; });
      })
    .catch(error => {
      alert("Failed to log in user " + username + ". " + error);	
      console.log("Failed to log in user " + username + ". " + error);
    });
    return dataPromise;
  }
  

  return (
    <div className="form-container">
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
        <div className='form-group'>
          <label htmlFor="username">Username:</label>
          <input 
            type="text" 
            id="username" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
            required
          />
        </div>
        <div className='form-group'>
          <label htmlFor="password">Password:</label>
          <input 
            type="password" 
            id="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="login-submit-btn">Login</button>
      </form>
      <div className="login-have-code">
        Have an invite code? <Link to="/routes/NewAccount" className="login-register-link">Create an account</Link>
      </div>
    </div>
  );
}

export default Login;
